import { verifyDownloadApiKey, verifyDownloadToken, verifyDownloadOAuth, signDownloadToken } from '../../../src/auth/download-tokens.js';
import { sha256Hex } from '../../../src/auth/oauth.js';

const byEnv = new WeakMap();
function state(env) {
  if (!byEnv.has(env)) byEnv.set(env, { confirmations: new Map(), leases: new Map(), legacy: new Map() });
  return byEnv.get(env);
}
function boundedSet(map, key, value) {
  if (map.size >= 10000 && !map.has(key)) map.delete(map.keys().next().value);
  map.set(key, value);
}
export async function parseIdentity(request, env, cid, signedToken, strict) {
  if (signedToken) {
    const identity = await verifyDownloadToken(signedToken, env.DOWNLOAD_TOKEN_SECRET, 'url', 7 * 86400);
    if (identity.cid !== cid) throw new Error('Wrong CID');
    return identity;
  }
  const authorization = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-API-Key') || (/^ApiKey /i.test(authorization || '') ? authorization.slice(7) : null);
  if (apiKey?.startsWith('hb2_')) return verifyDownloadApiKey(apiKey, env.DOWNLOAD_TOKEN_SECRET);
  if (apiKey) {
    if (strict || !/^hb_[A-Za-z0-9]{32}$/.test(apiKey)) throw new Error('Legacy key requires a plain path');
    const hash = await sha256Hex(apiKey), cache = state(env).legacy;
    let entry = cache.get(hash);
    if (!entry || entry.until <= Date.now()) {
      const response = await env.KEY_REGISTRY.get(env.KEY_REGISTRY.idFromName('global')).fetch(new Request('https://internal/lookup', {
        method: 'POST', body: JSON.stringify({ key_hash: hash }) }));
      if (!response.ok) throw new Error('Invalid legacy key');
      const info = await response.json();
      entry = { until: Date.now() + 60000, u: info.user_id, k: info.key_id };
      boundedSet(cache, hash, entry);
    }
    return { u: entry.u, k: entry.k, kind: 'key', key_hash: hash };
  }
  if (/^Bearer /i.test(authorization || '')) return verifyDownloadOAuth(authorization.slice(7), env.OAUTH_SIGNING_KEY);
  if (authorization) throw new Error('Invalid authorization');
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-hb_dl=([^;]+)/)?.[1];
  if (cookie) return verifyDownloadToken(cookie, env.DOWNLOAD_TOKEN_SECRET, 'cookie', 30 * 86400);
  if (strict) throw new Error('Identity required');
  return null;
}
function stub(env, identity) { return env.USER_PROFILES.get(env.USER_PROFILES.idFromName(identity.u)); }
function idKey(identity) { return `${identity.u}:${identity.kind}:${identity.k || identity.sid}:${identity.key_hash || ''}`; }
async function call(env, identity, path, data) {
  const response = await stub(env, identity).fetch(new Request(`https://internal/download/${path}`, { method: 'POST',
    body: JSON.stringify({ identity, ...data }) }));
  if (response.status === 401 || response.status === 404) return { invalid: true };
  if (!response.ok) throw new Error('Funding unavailable');
  return response.json();
}
export async function confirmedFunding(env, identity, price) {
  const cache = state(env).confirmations, key = `${idKey(identity)}:${price}`;
  let entry = cache.get(key);
  if (entry?.pending) return entry.pending;
  if (!entry || entry.expires_at <= Date.now()) {
    const pending = call(env, identity, 'check', { price_uc: price, requests: 1, request_id: crypto.randomUUID() }).then(result => {
      const confirmation = { ...result, expires_at: Math.min(Date.now() + 60000, (identity.exp || Infinity) * 1000) };
      boundedSet(cache, key, confirmation);
      return confirmation;
    }).catch(error => { cache.delete(key); throw error; });
    boundedSet(cache, key, { pending });
    entry = await pending;
  }
  return entry;
}
export async function takeFundedDownload(env, identity, price, ctx) {
  const leases = state(env).leases, key = `${idKey(identity)}:${price}`;
  // A per-identity queue ensures one lease cannot be duplicated by concurrent waiters.
  let entry = leases.get(key);
  if (!entry) { entry = { tail: Promise.resolve(), requests: 1, remaining: 0 }; boundedSet(leases, key, entry); }
  const operation = entry.tail.then(async () => {
    let newLease = false;
    if (!entry.expires_at || entry.expires_at <= Date.now() || entry.remaining < price) {
      const exhaustedQuickly = entry.lease_id && entry.remaining === 0 && entry.expires_at > Date.now();
      entry.requests = exhaustedQuickly ? Math.min(250, entry.requests * 2) : 1;
      const result = await call(env, identity, 'lease', { price_uc: price, requests: entry.requests, request_id: crypto.randomUUID(),
        ...(entry.lease_id ? { lease_id: entry.lease_id, unused_uc: entry.remaining } : {}) });
      if (!result.funded) return result;
      if (!Number.isSafeInteger(result.lease_uc) || result.lease_uc < price || result.lease_uc > price * entry.requests ||
        !Number.isFinite(result.expires_at) || result.expires_at <= Date.now() || result.expires_at > Date.now() + 60000) throw new Error('Invalid funded lease');
      newLease = true;
      Object.assign(entry, result, { remaining: result.lease_uc });
      if (ctx?.waitUntil) {
        const leaseId = result.lease_id;
        ctx.waitUntil(new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(25000, result.expires_at - Date.now())))).then(() => {
          const release = entry.tail.then(async () => {
            if (entry.lease_id !== leaseId) return;
            const unused = entry.remaining;
            entry.expires_at = 0; entry.remaining = 0; delete entry.lease_id;
            await call(env, identity, 'return', { lease_id: leaseId, unused_uc: unused });
          });
          entry.tail = release.catch(() => {});
          return release;
        }).catch(error => console.warn('Unused download lease remains spent', error.message)));
      }
    }
    entry.remaining -= price;
    return { funded: true, new_lease: newLease };
  });
  entry.tail = operation.catch(() => {});
  return operation;
}
export async function hardStopped(env) {
  if (env.COST_SAFETY_HARD_STOP === 'true') return true;
  if (!env.INFRASTRUCTURE_COST) return false;
  const current = state(env);
  if (!current.safety || current.safety.until <= Date.now()) {
    if (!current.safetyPending) current.safetyPending = (async () => {
      const response = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global')).fetch(new Request('https://internal/safety'));
      if (!response.ok) throw new Error('Safety unavailable');
      current.safety = { ...await response.json(), until: Date.now() + 60000 };
    })().finally(() => { current.safetyPending = null; });
    await current.safetyPending;
  }
  return current.safety.hard_stop === true;
}
export async function handshake(request, env) {
  const token = new URL(request.url).searchParams.get('t');
  let identity;
  try { identity = await verifyDownloadToken(token, env.DOWNLOAD_TOKEN_SECRET, 'handshake', 60); }
  catch { return new Response('Invalid handshake', { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  const response = await stub(env, identity).fetch(new Request('https://internal/download/session/activate', { method: 'POST', body: JSON.stringify({ sid: identity.sid }) }));
  if (!response.ok) return new Response('Invalid handshake', { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  const session = await response.json(), iat = Math.floor(Date.now() / 1000);
  const cookie = await signDownloadToken({ u: identity.u, sid: identity.sid, kind: 'session', type: 'cookie', iat, exp: Math.floor(session.expires_at / 1000) }, env.DOWNLOAD_TOKEN_SECRET);
  const target = identity.cid ? `/a/${encodeURIComponent(identity.cid)}` : '/health';
  return new Response(null, { status: 303, headers: { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Set-Cookie': `__Host-hb_dl=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(session.expires_at / 1000) - iat}` } });
}
