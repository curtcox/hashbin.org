// Credentials accepted by the WAF-exempt content paths must be verifiable locally.
import { signOAuthJwt, verifyOAuthJwt, sha256Hex } from './oauth.js';

const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(
  atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))));

async function tag(input, secret) {
  if (!secret) throw new Error('DOWNLOAD_TOKEN_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))).slice(0, 16)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function checkTag(input, signature, secret) {
  const expected = await tag(input, secret);
  if (signature.length !== expected.length) throw new Error('Invalid signature');
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (different) throw new Error('Invalid signature');
}
// API keys: hbk_<route>.<random>.<tag>. The route names the account and key, so a key
// can be checked without a lookup table; scopes and caveats stay server-side.
export const API_KEY_PATTERN = /^hbk_([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})$/;
export async function generateApiKey(userId, keyId, secret) {
  const route = encode({ u: userId, k: keyId });
  const random = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const input = `${route}.${random}`;
  return `hbk_${input}.${await tag(input, secret)}`;
}
export async function verifyApiKey(value, secret) {
  const match = value?.match(API_KEY_PATTERN);
  if (!match) throw new Error('Invalid API key');
  await checkTag(`${match[1]}.${match[2]}`, match[3], secret);
  const route = decode(match[1]);
  if (typeof route.u !== 'string' || !route.u || typeof route.k !== 'string' || !route.k) throw new Error('Invalid route');
  return { ...route, kind: 'key', key_hash: await sha256Hex(value) };
}
export async function signDownloadToken(payload, secret) {
  const data = encode(payload);
  return `${data}.${await tag(data, secret)}`;
}
export async function verifyDownloadToken(token, secret, type, maxSeconds) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token');
  await checkTag(parts[0], parts[1], secret);
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
