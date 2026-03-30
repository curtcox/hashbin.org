function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const encoder = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');

  return encoder.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(length = 32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function createPkceChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.join(' ');
  }
  return scopes || 'content:write balance:read';
}

function bufferFromInput(content) {
  if (content instanceof Blob) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (ArrayBuffer.isView(content)) {
    return content;
  }
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  throw new Error('Unsupported content type for publish().');
}

function centeredPopupFeatures(width = 560, height = 720) {
  if (typeof window === 'undefined') {
    return '';
  }
  const left = Math.max((window.screenX || 0) + ((window.outerWidth || width) - width) / 2, 0);
  const top = Math.max((window.screenY || 0) + ((window.outerHeight || height) - height) / 2, 0);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

export class HashBinClient {
  constructor({
    clientId,
    redirectUri,
    baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://hashbin.org',
    storage,
    transactionStorage,
    fetch: fetchImpl
  } = {}) {
    if (!clientId) {
      throw new Error('clientId is required');
    }
    if (!redirectUri) {
      throw new Error('redirectUri is required');
    }

    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.transactionStorage = transactionStorage || (typeof window !== 'undefined' ? window.sessionStorage : null);
    this.fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  }

  transactionKey(state) {
    return `hashbin:pkce:${this.clientId}:${state}`;
  }

  tokenKey() {
    return `hashbin:tokens:${this.clientId}`;
  }

  async createAuthorizationUrl({
    scopes = ['content:write', 'balance:read'],
    state = randomString(24),
    spendingLimit = null
  } = {}) {
    const codeVerifier = randomString(64);
    const codeChallenge = await createPkceChallenge(codeVerifier);

    if (!this.transactionStorage) {
      throw new Error('Transaction storage is unavailable.');
    }

    this.transactionStorage.setItem(this.transactionKey(state), JSON.stringify({
      codeVerifier,
      redirectUri: this.redirectUri,
      createdAt: Date.now()
    }));

    const url = new URL('/oauth/authorize', this.baseUrl);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', normalizeScopes(scopes));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (spendingLimit !== null && spendingLimit !== undefined) {
      url.searchParams.set('spending_limit', String(spendingLimit));
    }

    return { url: url.toString(), state };
  }

  async authorize(options = {}) {
    const { mode = 'redirect' } = options;
    const request = await this.createAuthorizationUrl(options);

    if (mode === 'manual') {
      return request;
    }

    if (mode === 'popup') {
      if (typeof window === 'undefined') {
        throw new Error('Popup mode requires a browser window.');
      }

      const popup = window.open(request.url, 'hashbin-oauth', centeredPopupFeatures());
      if (!popup) {
        throw new Error('Popup was blocked.');
      }

      return new Promise((resolve, reject) => {
        const redirectOrigin = new URL(this.redirectUri).origin;
        const cleanup = () => {
          window.removeEventListener('message', onMessage);
        };

        const onMessage = (event) => {
          if (event.origin !== redirectOrigin || !event.data || event.data.type !== 'hashbin:oauth:callback') {
            return;
          }
          cleanup();
          if (event.data.error) {
            reject(new Error(event.data.error));
            return;
          }
          resolve(event.data.tokens);
        };

        window.addEventListener('message', onMessage);
      });
    }

    if (typeof window === 'undefined') {
      throw new Error('Redirect mode requires a browser window.');
    }

    window.location.href = request.url;
    return request;
  }

  async exchangeCode({ code, state }) {
    if (!this.transactionStorage) {
      throw new Error('Transaction storage is unavailable.');
    }
    if (!this.fetch) {
      throw new Error('fetch is unavailable.');
    }

    const stored = this.transactionStorage.getItem(this.transactionKey(state));
    if (!stored) {
      throw new Error('PKCE transaction not found.');
    }

    const transaction = JSON.parse(stored);
    const response = await this.fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code,
        redirect_uri: transaction.redirectUri,
        code_verifier: transaction.codeVerifier
      })
    });

    if (!response.ok) {
      let message = 'Failed to exchange authorization code.';
      try {
        const error = await response.json();
        message = error.message || error.error || message;
      } catch (_error) {
        // Ignore.
      }
      throw new Error(message);
    }

    const tokenData = await response.json();
    this.transactionStorage.removeItem(this.transactionKey(state));
    return this.setTokens(tokenData);
  }

  async handleCallback({
    search = typeof window !== 'undefined' ? window.location.search : '',
    postMessageToOpener = false,
    closeWindow = false
  } = {}) {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    if (params.get('error')) {
      throw new Error(params.get('error'));
    }

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      throw new Error('Authorization callback is missing code or state.');
    }

    const tokens = await this.exchangeCode({ code, state });

    if (postMessageToOpener && typeof window !== 'undefined' && window.opener) {
      window.opener.postMessage({
        type: 'hashbin:oauth:callback',
        tokens
      }, new URL(this.redirectUri).origin);
      if (closeWindow) {
        window.close();
      }
    }

    return tokens;
  }

  setTokens(tokenData) {
    if (!this.storage) {
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        expiresAt: Date.now() + (tokenData.expires_in * 1000)
      };
    }

    const normalized = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      expiresAt: Date.now() + (tokenData.expires_in * 1000)
    };
    this.storage.setItem(this.tokenKey(), JSON.stringify(normalized));
    return normalized;
  }

  getTokens() {
    if (!this.storage) {
      return null;
    }

    const raw = this.storage.getItem(this.tokenKey());
    return raw ? JSON.parse(raw) : null;
  }

  clearTokens() {
    if (this.storage) {
      this.storage.removeItem(this.tokenKey());
    }
  }

  async refreshAccessToken() {
    if (!this.fetch) {
      throw new Error('fetch is unavailable.');
    }
    const tokens = this.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available.');
    }

    const response = await this.fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken
      })
    });

    if (!response.ok) {
      this.clearTokens();
      throw new Error('Failed to refresh access token.');
    }

    return this.setTokens(await response.json());
  }

  async authorizedFetch(path, options = {}) {
    if (!this.fetch) {
      throw new Error('fetch is unavailable.');
    }

    let tokens = this.getTokens();
    if (!tokens?.accessToken) {
      throw new Error('No access token available. Call authorize() first.');
    }

    if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
      tokens = await this.refreshAccessToken();
    }

    return this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${tokens.accessToken}`
      }
    });
  }

  async getBalance() {
    const response = await this.authorizedFetch('/api/balance');
    if (!response.ok) {
      throw new Error('Failed to fetch balance.');
    }
    return response.json();
  }

  async publish(content, { contentType = 'application/octet-stream' } = {}) {
    const body = bufferFromInput(content);
    const response = await this.authorizedFetch('/api/content', {
      method: 'POST',
      headers: {
        'content-type': contentType
      },
      body
    });

    if (!response.ok) {
      let message = 'Failed to publish content.';
      try {
        const error = await response.json();
        message = error.message || error.error || message;
      } catch (_error) {
        // Ignore parse failures.
      }
      throw new Error(message);
    }

    return response.json();
  }
}

let defaultClient = null;

export function configure(options) {
  defaultClient = new HashBinClient(options);
  return defaultClient;
}

export function createClient(options) {
  return new HashBinClient(options);
}

function getDefaultClient() {
  if (!defaultClient) {
    throw new Error('Call hashbin.configure({ clientId, redirectUri }) before using top-level SDK helpers.');
  }
  return defaultClient;
}

export async function authorize(options) {
  return getDefaultClient().authorize(options);
}

export async function handleCallback(options) {
  return getDefaultClient().handleCallback(options);
}

export async function getBalance() {
  return getDefaultClient().getBalance();
}

export async function publish(content, options) {
  return getDefaultClient().publish(content, options);
}

export function getTokens() {
  return getDefaultClient().getTokens();
}

export function clearTokens() {
  return getDefaultClient().clearTokens();
}

export const hashbin = {
  HashBinClient,
  configure,
  createClient,
  authorize,
  handleCallback,
  getBalance,
  publish,
  getTokens,
  clearTokens
};

if (typeof window !== 'undefined') {
  window.hashbin = hashbin;
}
