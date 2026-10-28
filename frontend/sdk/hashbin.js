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

async function contentBytes(content) {
  const value = bufferFromInput(content);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

export async function verifyCID(cid, content) {
  const bytes = await contentBytes(content);
  const length = new Uint8Array(6);
  const view = new DataView(length.buffer);
  view.setUint16(0, Math.floor(bytes.length / 0x100000000));
  view.setUint32(2, bytes.length >>> 0);
  const digest = bytes.length <= 64 ? bytes : new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
  return cid === base64UrlEncode(length) + base64UrlEncode(digest);
}

function decodeBytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hashbin:dpop', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Key database blocked'));
  });
}

async function browserKey(clientId) {
  const generate = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  try {
    const db = await openKeyDatabase();
    try {
      // Generate before the transaction; WebCrypto can let an IDB transaction expire.
      const candidate = await generate();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite');
        const store = tx.objectStore('keys');
        const request = store.get(clientId);
        let pair;
        request.onsuccess = () => { pair = request.result || candidate; if (!request.result) store.put(pair, clientId); };
        tx.oncomplete = () => resolve({ pair, persistent: true });
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  } catch { return { pair: await generate(), persistent: false }; }
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

function browserStorage(name) {
  try { return typeof window !== 'undefined' ? window[name] : null; }
  catch { return null; }
}
function memoryStorage() {
  const map = new Map();
  return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
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
    baseUrl = 'https://hashbin.org',
    contentBaseUrl = 'https://256t.us',
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
    this.contentBaseUrl = contentBaseUrl.replace(/\/$/, '');
    this.storage = storage || browserStorage('localStorage');
    this.transactionStorage = transactionStorage || browserStorage('sessionStorage');
    this.memoryTransactions = !this.transactionStorage;
    this.transactionStorage ||= memoryStorage();
    this.fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  }

  async getDPoPKey() {
    if (!this.keyPromise) this.keyPromise = browserKey(this.clientId).then(async ({ pair, persistent }) => {
      this.dpopMemoryOnly = !persistent;
      const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
      const jkt = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))));
      return { pair, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, jkt };
    });
    return this.keyPromise;
  }

  async dpopProof(url, method, accessToken) {
    const key = await this.getDPoPKey();
    if (!this.nonce || this.nonceUntil <= Date.now()) {
      const response = await this.fetch(`${this.baseUrl}/oauth/dpop-nonce`);
      if (!response.ok) throw new Error('Failed to obtain DPoP nonce.');
      this.nonce = (await response.json()).nonce;
      this.nonceUntil = Date.now() + 240000;
    }
    const target = new URL(url);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk })));
    const payload = { htu: target.origin + target.pathname, htm: method.toUpperCase(), iat: Math.floor(Date.now() / 1000), jti: randomString(32), nonce: this.nonce };
    if (accessToken) payload.ath = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))));
    const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const input = `${header}.${body}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
  }

  allowanceUrl(request) {
    const url = new URL('/publish', this.baseUrl);
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, state: request.state, mode: 'redirect' });
    url.hash = encodeURIComponent(JSON.stringify({ state: request.state, allowanceUrl: request.url }));
    return url.href;
  }

  // Open synchronously so a user click remains a valid popup gesture.
  publish(content, { mode = 'popup', contentType = 'application/octet-stream', clientState = null } = {}) {
    if (typeof window === 'undefined') return Promise.reject(new Error('publish() requires a browser; use save() for token-based uploads.'));
    const state = randomString(32);
    const popup = mode === 'popup' ? window.open('about:blank', '_blank', centeredPopupFeatures()) : null;
    return this.beginPublish(content, { mode, contentType, clientState, state, popup });
  }

  async beginPublish(content, { mode, contentType, clientState, state, popup }) {
    const bytes = await contentBytes(content);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) { popup?.close(); throw new Error('Content must contain 1 byte to 5 MiB.'); }
    if (!['popup', 'redirect'].includes(mode)) throw new Error('Unknown publish mode.');
    const url = new URL('/publish', this.baseUrl);
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, state, mode });
    if (!popup) {
      // Fragment handoffs must fit comfortably within browser URL limits.
      if (bytes.length > 512 * 1024) throw new Error('Popup required for documents above 512 KiB. Enable popups and retry.');
      if (this.memoryTransactions) throw new Error('Session storage is required for redirect publishing. Enable popups and retry.');
      this.transactionStorage.setItem(`hashbin:publish:${this.clientId}:${state}`, JSON.stringify({ bytes: base64UrlEncode(bytes), clientState, createdAt: Date.now() }));
      url.searchParams.set('mode', 'redirect');
      url.hash = encodeURIComponent(JSON.stringify({ state, bytes: base64UrlEncode(bytes), contentType, encoding: 'base64url' }));
      window.location.href = url.href;
      return { redirected: true, state };
    }
    const hashbinOrigin = new URL(this.baseUrl).origin;
    return new Promise((resolve, reject) => {
      const cleanup = () => { window.removeEventListener('message', onMessage); clearInterval(timer); clearTimeout(timeout); };
      const fail = error => { cleanup(); popup.close(); reject(error); };
      const onMessage = async event => {
        if (event.source !== popup || event.origin !== hashbinOrigin || event.data?.state !== state) return;
        if (event.data.type === 'hashbin:publish:ready') popup.postMessage({ type: 'hashbin:publish:request', state, bytes, contentType }, hashbinOrigin);
        if (event.data.type !== 'hashbin:publish:result') return;
        cleanup();
        if (event.data.error) { reject(new Error(event.data.error)); return; }
        if (!await verifyCID(event.data.cid, bytes)) { reject(new Error('Published CID does not match content.')); return; }
        resolve(event.data);
      };
      window.addEventListener('message', onMessage);
      const timer = setInterval(() => { if (popup.closed) fail(new Error('Publish window closed.')); }, 500);
      const timeout = setTimeout(() => fail(new Error('Publish approval timed out.')), 10 * 60 * 1000);
      popup.location.href = url.href;
    });
  }

  async handlePublishCallback({ hash = window.location.hash } = {}) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const state = params.get('hashbin_publish');
    const key = `hashbin:publish:${this.clientId}:${state}`;
    const raw = this.transactionStorage?.getItem(key);
    if (!state || !raw) throw new Error('Publish transaction not found.');
    const transaction = JSON.parse(raw);
    this.transactionStorage.removeItem(key);
    if (Date.now() - transaction.createdAt > 15 * 60 * 1000) throw new Error('Publish transaction expired.');
    if (params.get('error')) throw new Error(params.get('error'));
    const cid = params.get('cid');
    if (!await verifyCID(cid, decodeBytes(transaction.bytes))) throw new Error('Published CID does not match content.');
    return { cid, clientState: transaction.clientState };
  }

  async disconnect() {
    const tokens = this.getTokens();
    if (tokens?.refreshToken) {
      const response = await this.fetch(`${this.baseUrl}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tokens.refreshToken, token_type_hint: 'refresh_token' }) });
      if (!response.ok) throw new Error('Failed to revoke app access.');
    }
    this.clearTokens();
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
    spendingLimit = 1,
    maxRetentionMonths = null,
    maxUploadBytes = 1024 * 1024
  } = {}) {
    const key = await this.getDPoPKey();
    const codeVerifier = randomString(64);
    const codeChallenge = await createPkceChallenge(codeVerifier);

    if (!this.transactionStorage) {
      throw new Error('Transaction storage is unavailable.');
    }

    this.transactionStorage.setItem(this.transactionKey(state), JSON.stringify({
      codeVerifier,
      dpopJkt: key.jkt,
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
    url.searchParams.set('dpop_jkt', key.jkt);
    url.searchParams.set('max_upload_bytes', String(maxUploadBytes));
    if (spendingLimit !== null && spendingLimit !== undefined) {
      url.searchParams.set('spending_limit', String(spendingLimit));
    }
    if (maxRetentionMonths !== null && maxRetentionMonths !== undefined) {
      url.searchParams.set('max_retention_months', String(maxRetentionMonths));
    }

    return { url: url.toString(), state };
  }

  async authorize(options = {}) {
    const { mode = 'popup' } = options;
    const reservedPopup = mode === 'popup' && typeof window !== 'undefined' ? window.open('about:blank', '_blank', centeredPopupFeatures()) : null;
    let request;
    try { request = await this.createAuthorizationUrl(options); }
    catch (error) { reservedPopup?.close(); throw error; }
    if (mode === 'redirect' && (this.dpopMemoryOnly || this.memoryTransactions)) throw new Error('Device key storage unavailable. Use popup authorization for this session.');

    if (mode === 'manual') {
      return request;
    }

    if (mode === 'popup') {
      if (typeof window === 'undefined') {
        throw new Error('Popup mode requires a browser window.');
      }

      const popup = reservedPopup;
      if (popup) popup.location.href = this.allowanceUrl(request);
      if (!popup) {
        throw new Error('Popup was blocked.');
      }

      return new Promise((resolve, reject) => {
        const redirectOrigin = new URL(this.redirectUri).origin;
        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          clearTimeout(timeout);
        };

        const onMessage = (event) => {
          if (event.source !== popup || event.origin !== redirectOrigin || !event.data || event.data.state !== request.state || event.data.type !== 'hashbin:oauth:callback') {
            return;
          }
          cleanup();
          if (event.data.error) {
            reject(new Error(event.data.error));
            return;
          }
          this.exchangeCode({ code: event.data.code, state: request.state }).then(resolve, reject);
        };

        const timer = setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Authorization window closed.')); } }, 500);
        const timeout = setTimeout(() => { cleanup(); popup.close(); reject(new Error('Authorization timed out.')); }, 10 * 60 * 1000);
        window.addEventListener('message', onMessage);
      });
    }

    if (typeof window === 'undefined') {
      throw new Error('Redirect mode requires a browser window.');
    }

    window.location.href = this.allowanceUrl(request);
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
        'content-type': 'application/json',
        ...(transaction.dpopJkt ? { DPoP: await this.dpopProof(`${this.baseUrl}/oauth/token`, 'POST') } : {})
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
      if (postMessageToOpener && typeof window !== 'undefined' && window.opener) {
        window.opener.postMessage({ type: 'hashbin:oauth:callback', state: params.get('state'), error: params.get('error') }, new URL(this.redirectUri).origin);
        if (closeWindow) window.close();
      }
      throw new Error(params.get('error'));
    }

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      throw new Error('Authorization callback is missing code or state.');
    }

    if (postMessageToOpener && typeof window !== 'undefined' && window.opener) {
      window.opener.postMessage({ type: 'hashbin:oauth:callback', state, code }, new URL(this.redirectUri).origin);
      if (closeWindow) window.close();
      return { code, state };
    }
    return this.exchangeCode({ code, state });
  }

  setTokens(tokenData) {
    if (!this.storage) {
      return this.memoryTokens = {
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
    if (this.dpopMemoryOnly && normalized.tokenType === 'DPoP') {
      this.memoryTokens = normalized;
      try { this.storage.removeItem(this.tokenKey()); } catch { /* Storage may be disabled. */ }
    } else {
      try { this.storage.setItem(this.tokenKey(), JSON.stringify(normalized)); }
      catch { this.memoryTokens = normalized; }
    }
    return normalized;
  }

  getTokens() {
    if (this.memoryTokens) return this.memoryTokens;
    if (!this.storage) {
      return null;
    }

    try {
      const raw = this.storage.getItem(this.tokenKey());
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  clearTokens() {
    this.memoryTokens = null;
    if (this.storage) {
      try { this.storage.removeItem(this.tokenKey()); } catch { /* Storage may be disabled. */ }
    }
  }

  // Refresh tokens are single-use, so concurrent callers share one renewal;
  // a second request with the same token would be rejected and sign the user out.
  refreshAccessToken() {
    if (!this.refreshing) {
      const before = this.getTokens()?.refreshToken;
      const renew = () => {
        const current = this.getTokens();
        return current?.refreshToken !== before && current?.expiresAt > Date.now() ? current : this.renewTokens();
      };
      const locks = globalThis.navigator?.locks;
      this.refreshing = Promise.resolve(locks ? locks.request(`hashbin:refresh:${this.clientId}`, renew) : renew()).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async renewTokens() {
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
        'content-type': 'application/json',
        ...(tokens.tokenType === 'DPoP' ? { DPoP: await this.dpopProof(`${this.baseUrl}/oauth/token`, 'POST') } : {})
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
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
        Authorization: `${tokens.tokenType === 'DPoP' ? 'DPoP' : 'Bearer'} ${tokens.accessToken}`,
        ...(tokens.tokenType === 'DPoP' ? { DPoP: await this.dpopProof(`${this.baseUrl}${path}`, options.method || 'GET', tokens.accessToken) } : {})
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

  async save(content, { contentType = 'application/octet-stream', maxCostCents = null } = {}) {
    const body = await contentBytes(content);
    const suffix = maxCostCents === null ? '' : '?max_cost_cents=' + encodeURIComponent(maxCostCents);
    const response = await this.authorizedFetch('/api/content' + suffix, {
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

    const result = await response.json();
    if (!await verifyCID(result.cid, body)) throw new Error('Published CID does not match content.');
    return result;
  }

  getContentUrl(cid, { extension = null, download = false } = {}) {
    const suffix = extension ? `.${String(extension).replace(/^\./, '')}` : '';
    const url = new URL(`${this.contentBaseUrl}/${cid}${suffix}`);
    if (download) {
      url.searchParams.set('download', 'true');
    }
    return url.toString();
  }

  async retrieve(cid, options = {}) {
    if (!this.fetch) {
      throw new Error('fetch is unavailable.');
    }

    const response = await this.fetch(this.getContentUrl(cid, options));
    if (!response.ok) {
      throw new Error(`Failed to retrieve content (${response.status}).`);
    }

    const bytes = await response.clone().arrayBuffer();
    if (!await verifyCID(cid, bytes)) throw new Error('Retrieved content does not match CID.');
    return response;
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

export async function save(content, options) { return getDefaultClient().save(content, options); }
export async function disconnect() { return getDefaultClient().disconnect(); }
export async function handlePublishCallback(options) { return getDefaultClient().handlePublishCallback(options); }

export async function getBalance() {
  return getDefaultClient().getBalance();
}

export async function publish(content, options) {
  return getDefaultClient().publish(content, options);
}

export function getContentUrl(cid, options) {
  return getDefaultClient().getContentUrl(cid, options);
}

export async function retrieve(cid, options) {
  return getDefaultClient().retrieve(cid, options);
}

export function getTokens() {
  return getDefaultClient().getTokens();
}

export function clearTokens() {
  return getDefaultClient().clearTokens();
}

export const hashbin = {
  HashBinClient,
  verifyCID,
  save,
  disconnect,
  handlePublishCallback,
  configure,
  createClient,
  authorize,
  handleCallback,
  getBalance,
  publish,
  getContentUrl,
  retrieve,
  getTokens,
  clearTokens
};

if (typeof window !== 'undefined') {
  window.hashbin = hashbin;
}
