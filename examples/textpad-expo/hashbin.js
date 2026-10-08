// A small HashBin OAuth client for React Native.
//
// It signs the user in with OAuth 2.0 and PKCE in the system browser, keeps
// the tokens in the device's secure storage (the iOS Keychain or Android
// Keystore), renews the access token when it expires, and calls the HashBin
// API as the user. Copy this file into your own app and change the
// options passed to the constructor.

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { bytesToBase64Url, queryParams } from "./textpad";

// Raised when the stored sign-in no longer works: it expired, or the user
// revoked the app on their HashBin account page.
export class NotConnectedError extends Error {}

const TOKENS_KEY = "hashbin.tokens";

// Renew the access token this long before it expires, so a request never
// sets out with a token that runs out on the way.
const EXPIRY_MARGIN_MS = 60 * 1000;

export class HashBinAccount {
  constructor({ clientId, redirectUri, baseUrl, scopes }) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.baseUrl = baseUrl;
    this.scopes = scopes;
    this.tokens = null; // { accessToken, refreshToken, expiresAt }
    this.refreshing = null;
  }

  // Reads the tokens saved by an earlier run of the app.
  async load() {
    const saved = await SecureStore.getItemAsync(TOKENS_KEY);
    this.tokens = saved ? JSON.parse(saved) : null;
  }

  isConnected() {
    return Boolean(this.tokens?.refreshToken);
  }

  async saveTokens(response) {
    this.tokens = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000
    };
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(this.tokens));
  }

  async clearTokens() {
    this.tokens = null;
    await SecureStore.deleteItemAsync(TOKENS_KEY);
  }

  // --------------------------------------------------------------------
  // Signing in
  // --------------------------------------------------------------------

  // Opens HashBin's approval page in an in-app browser and waits for the
  // user to come back. Resolves to "connected", "denied" (the user clicked
  // Deny) or "cancelled" (the user closed the browser).
  async connect() {
    // PKCE: a random secret (the verifier) stays in the app, and only its
    // SHA-256 hash (the challenge) goes into the sign-in link. Whoever
    // exchanges the code for tokens must know the verifier, so a code
    // intercepted on the way back to the app is useless to anyone else.
    const verifier = bytesToBase64Url(Crypto.getRandomBytes(32));
    const challenge = (await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    )).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // "state" ties the reply to this request.
    const state = bytesToBase64Url(Crypto.getRandomBytes(16));

    const query = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    };
    const authorizeUrl = `${this.baseUrl}/oauth/authorize?` + Object.entries(query)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("&");

    // On iOS this is an ASWebAuthenticationSession, on Android a Chrome
    // Custom Tab. It closes by itself when HashBin redirects to
    // redirectUri, and hands that link back here.
    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, this.redirectUri);
    if (result.type !== "success") {
      return "cancelled";
    }

    const params = queryParams(result.url);
    if (params.state !== state) {
      throw new Error("The reply from HashBin doesn't match this sign-in.");
    }
    if (params.error === "access_denied") {
      return "denied";
    }
    if (params.error || !params.code) {
      throw new Error(params.error || "HashBin didn't send an authorization code.");
    }

    // Trade the one-time code (plus the verifier) for tokens.
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        code: params.code,
        code_verifier: verifier
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || `HTTP ${response.status}`);
    }
    await this.saveTokens(body);
    return "connected";
  }

  // Ends the app's access: forgets the tokens here and revokes the refresh
  // token on the server, so a copy of it can't be used either.
  async disconnect() {
    const refreshToken = this.tokens?.refreshToken;
    await this.clearTokens();
    if (refreshToken) {
      await fetch(`${this.baseUrl}/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: refreshToken, token_type_hint: "refresh_token" })
      }).catch(() => {});
    }
  }

  // --------------------------------------------------------------------
  // Calling the API
  // --------------------------------------------------------------------

  // Access tokens last an hour. A refresh token gets a new one, and is
  // itself replaced: each refresh token works only once. Calls that need a
  // new token at the same moment share one refresh, because a second
  // refresh with the same (by then used) token would fail.
  refreshAccessToken() {
    if (!this.refreshing) {
      this.refreshing = this.renewTokens().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async renewTokens() {
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: this.tokens.refreshToken })
    });
    const body = await response.json().catch(() => ({}));
    if (body.error === "invalid_grant") {
      // Expired or revoked: the user has to approve the app again.
      await this.clearTokens();
      throw new NotConnectedError();
    }
    if (!response.ok) {
      throw new Error(body.message || body.error || `HTTP ${response.status}`);
    }
    await this.saveTokens(body);
  }

  // fetch() for HashBin API paths, as the signed-in user.
  async fetch(path, options = {}) {
    if (!this.isConnected()) {
      throw new NotConnectedError();
    }
    if (Date.now() > this.tokens.expiresAt - EXPIRY_MARGIN_MS) {
      await this.refreshAccessToken();
      if (!this.isConnected()) {
        throw new NotConnectedError(); // Disconnected while renewing.
      }
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${this.tokens.accessToken}` }
    });
    if (response.status === 401) {
      await this.clearTokens();
      throw new NotConnectedError();
    }
    return response;
  }
}
