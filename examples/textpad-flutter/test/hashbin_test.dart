import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:textpad/hashbin.dart';

/// A signed-in account whose access token has already expired, talking to a
/// fake HashBin server.
Future<HashBinAccount> expiredAccount(MockClientHandler server) async {
  FlutterSecureStorage.setMockInitialValues({
    'hashbin.tokens': jsonEncode({'accessToken': 'old-access', 'refreshToken': 'refresh-1', 'expiresAt': 0}),
  });
  final account = HashBinAccount(
    clientId: 'app_test',
    redirectUri: 'org.example.textpad://oauth',
    baseUrl: 'https://hashbin.test',
    scopes: const ['content:write'],
    httpClient: MockClient(server),
  );
  await account.load();
  return account;
}

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('renews an expired access token once for simultaneous requests', () async {
    var tokenCalls = 0;
    final account = await expiredAccount((request) async {
      if (request.url.path == '/oauth/token') {
        tokenCalls++;
        expect(jsonDecode(request.body)['refresh_token'], 'refresh-1');
        return json({'access_token': 'new-access', 'refresh_token': 'refresh-2', 'expires_in': 3600});
      }
      expect(request.headers['authorization'], 'Bearer new-access');
      return json({'balance_cents': 500});
    });

    final responses = await Future.wait([
      account.send('GET', '/api/balance'),
      account.send('GET', '/api/balance'),
      account.send('GET', '/api/balance'),
    ]);

    expect(tokenCalls, 1);
    expect(responses.map((response) => response.statusCode), everyElement(200));
  });

  test('forgets the tokens when HashBin refuses the refresh token', () async {
    final account = await expiredAccount((request) async => json({'error': 'invalid_grant'}, 400));

    await expectLater(account.send('GET', '/api/balance'), throwsA(isA<NotConnectedException>()));
    expect(account.isConnected, isFalse);
  });

  test('forgets the tokens when the API answers 401', () async {
    final account = await expiredAccount((request) async {
      if (request.url.path == '/oauth/token') {
        return json({'access_token': 'new-access', 'refresh_token': 'refresh-2', 'expires_in': 3600});
      }
      return json({'error': 'unauthorized'}, 401);
    });

    await expectLater(account.send('GET', '/api/balance'), throwsA(isA<NotConnectedException>()));
    expect(account.isConnected, isFalse);
  });

  test('sends text as UTF-8', () async {
    late List<int> body;
    final account = await expiredAccount((request) async {
      if (request.url.path == '/oauth/token') {
        return json({'access_token': 'new-access', 'refresh_token': 'refresh-2', 'expires_in': 3600});
      }
      body = request.bodyBytes;
      return json({'cid': 'x'}, 201);
    });

    await account.send('POST', '/api/content',
        headers: {'content-type': 'text/plain; charset=utf-8'}, body: 'é 中 😀');
    expect(utf8.decode(body), 'é 中 😀');
  });
}
