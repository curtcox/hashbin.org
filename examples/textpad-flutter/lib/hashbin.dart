// A small HashBin OAuth client for Flutter.
//
// It signs the user in with OAuth 2.0 and PKCE in the system browser, keeps
// the tokens in the device's secure storage (the iOS Keychain or Android
// Keystore), renews the access token when it expires, and calls the HashBin
// API as the user. Copy this file into your own app and change the
// arguments passed to the constructor.

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:http/http.dart' as http;

import 'textpad.dart';

/// Thrown when the stored sign-in no longer works: it expired, or the user
/// revoked the app on their HashBin account page.
class NotConnectedException implements Exception {}

/// How a sign-in ended: approved, declined with Deny, or the browser closed.
enum ConnectResult { connected, denied, cancelled }

class HashBinAccount {
  HashBinAccount({
    required this.clientId,
    required this.redirectUri,
    required this.baseUrl,
    required this.scopes,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String clientId;
  final String redirectUri;
  final String baseUrl;
  final List<String> scopes;

  // Tests pass a fake client; the app uses a real one.
  final http.Client _http;

  static const _tokensKey = 'hashbin.tokens';
  static const _storage = FlutterSecureStorage();

  // Renew the access token this long before it expires, so a request never
  // sets out with a token that runs out on the way.
  static const _expiryMargin = Duration(minutes: 1);

  String? _accessToken;
  String? _refreshToken;
  DateTime _expiresAt = DateTime.fromMillisecondsSinceEpoch(0);
  Future<void>? _refreshing;

  bool get isConnected => _refreshToken != null;

  /// Reads the tokens saved by an earlier run of the app.
  Future<void> load() async {
    final saved = await _storage.read(key: _tokensKey);
    if (saved == null) return;
    final tokens = jsonDecode(saved) as Map<String, dynamic>;
    _accessToken = tokens['accessToken'] as String;
    _refreshToken = tokens['refreshToken'] as String;
    _expiresAt = DateTime.fromMillisecondsSinceEpoch(tokens['expiresAt'] as int);
  }

  Future<void> _saveTokens(Map<String, dynamic> response) async {
    _accessToken = response['access_token'] as String;
    _refreshToken = response['refresh_token'] as String;
    _expiresAt = DateTime.now().add(Duration(seconds: response['expires_in'] as int));
    await _storage.write(
      key: _tokensKey,
      value: jsonEncode({
        'accessToken': _accessToken,
        'refreshToken': _refreshToken,
        'expiresAt': _expiresAt.millisecondsSinceEpoch,
      }),
    );
  }

  Future<void> _clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    await _storage.delete(key: _tokensKey);
  }

  // ----------------------------------------------------------------------
  // Signing in
  // ----------------------------------------------------------------------

  /// Opens HashBin's approval page in an in-app browser and waits for the
  /// user to come back.
  Future<ConnectResult> connect() async {
    // PKCE: a random secret (the verifier) stays in the app, and only its
    // SHA-256 hash (the challenge) goes into the sign-in link. Whoever
    // exchanges the code for tokens must know the verifier, so a code
    // intercepted on the way back to the app is useless to anyone else.
    final random = Random.secure();
    String randomString(int bytes) =>
        bytesToBase64Url(List.generate(bytes, (_) => random.nextInt(256)));
    final verifier = randomString(32);
    final challenge = bytesToBase64Url(sha256.convert(utf8.encode(verifier)).bytes);
    // "state" ties the reply to this request.
    final state = randomString(16);

    final authorizeUrl = Uri.parse('$baseUrl/oauth/authorize').replace(queryParameters: {
      'client_id': clientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': scopes.join(' '),
      'state': state,
      'code_challenge': challenge,
      'code_challenge_method': 'S256',
    });

    // On iOS this is an ASWebAuthenticationSession, on Android a Custom
    // Tab. It closes by itself when HashBin redirects to a link with the
    // redirect URI's scheme, and hands that link back here.
    final String result;
    try {
      result = await FlutterWebAuth2.authenticate(
        url: authorizeUrl.toString(),
        callbackUrlScheme: Uri.parse(redirectUri).scheme,
      );
    } on PlatformException catch (error) {
      if (error.code == 'CANCELED') return ConnectResult.cancelled;
      rethrow;
    }

    final params = Uri.parse(result).queryParameters;
    if (params['state'] != state) {
      throw Exception("The reply from HashBin doesn't match this sign-in.");
    }
    if (params['error'] == 'access_denied') {
      return ConnectResult.denied;
    }
    final code = params['code'];
    if (params['error'] != null || code == null) {
      throw Exception(params['error'] ?? "HashBin didn't send an authorization code.");
    }

    // Trade the one-time code (plus the verifier) for tokens.
    final response = await _http.post(
      Uri.parse('$baseUrl/oauth/token'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'grant_type': 'authorization_code',
        'client_id': clientId,
        'redirect_uri': redirectUri,
        'code': code,
        'code_verifier': verifier,
      }),
    );
    final body = _jsonObject(response);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? body['error'] ?? 'HTTP ${response.statusCode}');
    }
    await _saveTokens(body);
    return ConnectResult.connected;
  }

  /// Ends the app's access: forgets the tokens here and revokes the refresh
  /// token on the server, so a copy of it can't be used either.
  Future<void> disconnect() async {
    final refreshToken = _refreshToken;
    await _clearTokens();
    if (refreshToken == null) return;
    try {
      await _http.post(
        Uri.parse('$baseUrl/oauth/revoke'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'token': refreshToken, 'token_type_hint': 'refresh_token'}),
      );
    } catch (_) {
      // Offline: the token still expires on its own within 30 days.
    }
  }

  // ----------------------------------------------------------------------
  // Calling the API
  // ----------------------------------------------------------------------

  /// Access tokens last an hour. A refresh token gets a new one, and is
  /// itself replaced: each refresh token works only once. Calls that need a
  /// new token at the same moment share one refresh, because a second
  /// refresh with the same (by then used) token would fail.
  Future<void> _refreshAccessToken() {
    return _refreshing ??= _renewTokens().whenComplete(() => _refreshing = null);
  }

  Future<void> _renewTokens() async {
    final response = await _http.post(
      Uri.parse('$baseUrl/oauth/token'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'grant_type': 'refresh_token', 'refresh_token': _refreshToken}),
    );
    final body = _jsonObject(response);
    if (body['error'] == 'invalid_grant') {
      // Expired or revoked: the user has to approve the app again.
      await _clearTokens();
      throw NotConnectedException();
    }
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? body['error'] ?? 'HTTP ${response.statusCode}');
    }
    await _saveTokens(body);
  }

  /// Sends a request to a HashBin API path as the signed-in user.
  Future<http.Response> send(String method, String path,
      {Map<String, String> headers = const {}, String? body}) async {
    if (!isConnected) {
      throw NotConnectedException();
    }
    if (DateTime.now().isAfter(_expiresAt.subtract(_expiryMargin))) {
      await _refreshAccessToken();
      if (!isConnected) {
        throw NotConnectedException(); // Disconnected while renewing.
      }
    }
    final request = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers.addAll(headers)
      ..headers['authorization'] = 'Bearer $_accessToken';
    if (body != null) {
      request.bodyBytes = utf8.encode(body);
    }
    final response = await http.Response.fromStream(await _http.send(request));
    if (response.statusCode == 401) {
      await _clearTokens();
      throw NotConnectedException();
    }
    return response;
  }
}

/// The JSON object in a response body, or an empty map if there isn't one.
Map<String, dynamic> _jsonObject(http.Response response) {
  try {
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    return decoded is Map<String, dynamic> ? decoded : {};
  } on FormatException {
    return {};
  }
}
