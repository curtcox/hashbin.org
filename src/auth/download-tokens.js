// Credentials accepted by the WAF-exempt content paths must be verifiable locally.
import { signOAuthJwt, verifyOAuthJwt, sha256Hex } from './oauth.js';

const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(
  atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))));

// Each purpose signs with its own key derived from DOWNLOAD_TOKEN_SECRET (HKDF), so a
// tag made for one kind of credential can never verify as another.
const PURPOSES = new Set(['api-key', 'admin-key', 'dl-url', 'dl-handshake', 'dl-cookie']);
const derivedKeys = new Map();
function purposeKey(secret, purpose) {
  if (!secret) throw new Error('DOWNLOAD_TOKEN_SECRET is not configured');
  if (!PURPOSES.has(purpose)) throw new Error('Unknown signing purpose');
  const cacheKey = `${purpose}\u0000${secret}`;
  if (!derivedKeys.has(cacheKey)) {
    if (derivedKeys.size >= 20) derivedKeys.delete(derivedKeys.keys().next().value);
    derivedKeys.set(cacheKey, (async () => {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(`hashbin:${purpose}`) },
        base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
    })());
  }
  return derivedKeys.get(cacheKey);
}
async function tag(input, secret, purpose) {
  const key = await purposeKey(secret, purpose);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))).slice(0, 16)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function checkTag(input, signature, secret, purpose) {
  const expected = await tag(input, secret, purpose);
  if (signature.length !== expected.length) throw new Error('Invalid signature');
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (different) throw new Error('Invalid signature');
}
// Keys: <prefix>_<route>.<random>.<tag>. The route names the account and key, so a key
// can be checked without a lookup table; scopes and caveats stay server-side.
// hbk_ keys act for a user; hba_ keys carry admin scopes for ADMIN_USER_ID.
const KEY_PURPOSES = { hbk: 'api-key', hba: 'admin-key' };
const keyPattern = prefix => new RegExp(`^${prefix}_([A-Za-z0-9_-]{1,1024})\\.([A-Za-z0-9_-]{43})\\.([A-Za-z0-9_-]{22})$`);
export const API_KEY_PATTERN = keyPattern('hbk');
export const ADMIN_KEY_PATTERN = keyPattern('hba');
export async function generateApiKey(userId, keyId, secret, prefix = 'hbk') {
  const route = encode({ u: userId, k: keyId });
  const random = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const input = `${route}.${random}`;
  return `${prefix}_${input}.${await tag(input, secret, KEY_PURPOSES[prefix])}`;
}
export async function verifyApiKey(value, secret, prefix = 'hbk') {
  const match = value?.match(keyPattern(prefix));
  if (!match) throw new Error('Invalid key');
  await checkTag(`${match[1]}.${match[2]}`, match[3], secret, KEY_PURPOSES[prefix]);
  const route = decode(match[1]);
  if (typeof route.u !== 'string' || !route.u || typeof route.k !== 'string' || !route.k) throw new Error('Invalid route');
  return { ...route, kind: 'key', key_hash: await sha256Hex(value) };
}
export async function signDownloadToken(payload, secret) {
  const data = encode(payload);
  return `${data}.${await tag(data, secret, `dl-${payload.type}`)}`;
}
export async function verifyDownloadToken(token, secret, type, maxSeconds) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token');
  await checkTag(parts[0], parts[1], secret, `dl-${type}`);
  const payload = decode(parts[0]);
  const now = Math.floor(Date.now() / 1000);
  if (payload.type !== type || typeof payload.u !== 'string' || !payload.u || !Number.isInteger(payload.exp) ||
    !Number.isInteger(payload.iat) || payload.exp <= now || payload.iat > now || payload.exp - payload.iat > maxSeconds) throw new Error('Expired or invalid token');
  return payload;
}
export async function verifyDownloadOAuth(token, secret) {
  if (!secret || token.length > 8192) throw new Error('Invalid OAuth token');
  const payload = await verifyOAuthJwt(token, secret);
  if (payload.token_type !== 'access' || !payload.user_id || !payload.grant_id || !payload.app_id ||
    !Number.isFinite(payload.exp) || !payload.scopes?.includes('downloads:spend')) throw new Error('Missing download scope');
  return { u: payload.user_id, k: payload.grant_id, app_id: payload.app_id, kind: 'oauth', exp: payload.exp };
}
// Keep JWT support in this shared module's dependency graph; no Clerk SDK in the content Worker.
export { signOAuthJwt };
