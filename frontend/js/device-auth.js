/** Browser device sessions (S25). The SDK keeps the private key non-extractable in IndexedDB. */
const FLAG = 'hashbin-device-session';
const SLOT = 'hashbin-pages';
let client;
let session = null;
let issuer = 'https://devicebasedauth.org';

function remembered(value) {
  try {
    if (value === undefined) return localStorage.getItem(FLAG) === '1';
    if (value) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG);
  } catch { /* A browser without storage can still use this page's session. */ }
  return false;
}

async function device() {
  if (!client) {
    const { DBA } = await import('./dba-sdk.js');
    client = new DBA({ origin: issuer, name: SLOT });
  }
  return client;
}

function target(url) {
  const parsed = new URL(url, location.href);
  if (parsed.origin !== location.origin) throw new Error('Device credentials can only be sent to this HashBin origin.');
  return parsed.href;
}

async function checkSession() {
  const response = await client.fetchWithGates(target('/api/auth/session'), { redirect: 'error' });
  const body = await response.json().catch(() => ({}));
  session = response.ok && typeof body.user_id === 'string' ? body : null;
  return { response, body };
}

/** Restore the selected device without loading Clerk, even when the server refuses it. */
export async function restoreDevice(config) {
  issuer = config.dba_issuer || issuer;
  if (!remembered()) return false;
  let dba;
  try {
    dba = await device();
    if (!await dba.ready() || !dba.payload?.aud?.includes('hashbin.org')) throw new Error('No usable device key');
  } catch {
    remembered(false);
    client = null;
    return false;
  }
  // A revoked device must never silently become an existing Clerk session.
  try { await checkSession(); } catch { session = null; }
  if (session) dba.autoRenew({ onError: () => {} });
  return true;
}

/** Whether this page selected device authentication. */
export function usingDevice() { return !!client; }

/** A display identity established by the site's verified session endpoint. */
export function deviceAuthState() {
  if (!session) return { authenticated: false, deviceSession: true };
  const payload = client.payload;
  return {
    authenticated: true, deviceSession: true, sessionId: null,
    user: { id: session.user_id, fullName: payload.device?.name || 'This browser', email: null, imageUrl: '/img/hashbin-logo.png', provider: 'devicebasedauth.org' }
  };
}

/** Approve a new session key for this browser, then prove it works before remembering it. */
export async function signInDevice(config) {
  issuer = config.dba_issuer || issuer;
  const dba = await device();
  if (await dba.ready()) await dba.forget();
  await dba.enroll({ aud: ['hashbin.org'], grants: [{ actions: ['hashbin:session'] }], device: { name: 'HashBin browser', kind: 'browser' } });
  const { response, body } = await checkSession();
  if (!session) {
    await forgetDevice();
    throw new Error(body.message || body.error || `Device sign-in refused (HTTP ${response.status}). Link your account in Account Settings first.`);
  }
  remembered(true);
  location.reload();
}

/** Fresh, method- and URL-bound headers for callers that need headers rather than fetch. */
export async function deviceHeaders(method, url) {
  if (!session || !url || !method) return null;
  return client.headers(method, target(url));
}

/** Send with the SDK's DPoP nonce and gate retries. Redirects cannot carry the credential away. */
export async function deviceFetch(url, options = {}) {
  if (!session) throw new Error('Device sign-in expired or was refused. Sign in again.');
  const response = await client.fetchWithGates(target(url), { ...options, redirect: 'error' });
  if (response.status === 401) session = null;
  return response;
}

/** Delete only this slot's device key, leaving regular account sign-in available. */
export async function forgetDevice() {
  remembered(false);
  session = null;
  await client?.forget();
  client = null;
}
