import { beforeEach, describe, it, expect } from 'vitest';
import { handleDownloads } from './downloads.js';
import worker from '../index.js';
import { handleCreateApiKey } from './auth.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { verifyDownloadApiKey, verifyDownloadToken } from '../auth/download-tokens.js';
import { sha256Hex } from '../auth/oauth.js';

let env, profile, user, key;
const cid = 'AAAAAABk' + 'a'.repeat(86);
function req(path, method = 'GET', body, authorization = 'LocalDev user') {
  return new Request(`https://hashbin.org${path}`, { method, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  profile = { user_id: 'user', balance_cents: 100, api_keys: [], oauth_grants: [], oauth_refresh_tokens: [] };
  user = new UserProfile({ storage: { get: async () => structuredClone(profile),
    put: async (key, value) => { profile = structuredClone(typeof key === 'string' ? value : key.profile); }, setAlarm: async () => {} } }, {});
  env = { ENVIRONMENT: 'local', USER_PROFILES: { idFromName: id => id, get: () => user }, DOWNLOAD_TOKEN_SECRET: 'download-secret',
    KEY_REGISTRY: { idFromName: id => id, get: () => ({ fetch: async () => Response.json({ registered: true }) }) } };
});
describe('download API', () => {
  it('creates routable v2 keys with explicit caps in the profile', async () => {
    const caps = { daily_cap_cents: 10, monthly_cap_cents: 100 };
    const r = await handleCreateApiKey(req('/api/auth/apikeys', 'POST', { name: 'Downloader', scopes: ['downloads:spend'], download_budget: caps }), env);
    expect(r.status).toBe(201);
    key = (await r.json()).api_key;
    const identity = await verifyDownloadApiKey(key, env.DOWNLOAD_TOKEN_SECRET);
    expect(identity.u).toBe('user');
    expect(profile.download_budget.keys[identity.k]).toEqual(caps);
    expect(profile.api_keys[0].key_hash).toBe(await sha256Hex(key));
  });
  it('creates signed URLs from a key identity, bounds lifetime and batch size, and enforces owner-only budget management', async () => {
    const created = await handleCreateApiKey(req('/api/auth/apikeys', 'POST', { name: 'Downloader', scopes: ['downloads:spend'] }), env);
    key = (await created.json()).api_key;
    const identity = await verifyDownloadApiKey(key, env.DOWNLOAD_TOKEN_SECRET);
    const signed = await worker.fetch(req('/api/downloads/sign', 'POST', { cids: [cid] }, `ApiKey ${key}`), env, {});
    expect(signed.status).toBe(200);
    const { urls } = await signed.json();
    const token = new URL(urls[0].url).pathname.split('/')[2];
    const payload = await verifyDownloadToken(token, env.DOWNLOAD_TOKEN_SECRET, 'url', 604800);
    expect(payload).toMatchObject({ u: 'user', k: identity.k, kind: 'key', cid });
    expect((await worker.fetch(req('/api/downloads/budget', 'PUT', { account: null }, `ApiKey ${key}`), env, {})).status).toBe(403);
    const publisher = await (await handleCreateApiKey(req('/api/auth/apikeys', 'POST', { name: 'Publisher', scopes: ['content:write'] }), env)).json();
    expect((await worker.fetch(req('/api/downloads/sign', 'POST', { cids: [cid] }, `ApiKey ${publisher.api_key}`), env, {})).status).toBe(403);
    expect((await handleDownloads(req('/api/downloads/sign', 'POST', { cids: [cid], expires_in: 604801 }), env)).status).toBe(400);
    expect((await handleDownloads(req('/api/downloads/sign', 'POST', { cids: Array(101).fill(cid) }), env)).status).toBe(400);
  });
  it('manages account caps, session handshakes, listing, revocation and account signed links', async () => {
    const account = { daily_cap_cents: 5, monthly_cap_cents: 50 };
    expect((await handleDownloads(req('/api/downloads/budget', 'PUT', { account }), env)).status).toBe(200);
    const handshake = await (await handleDownloads(req('/api/downloads/session', 'POST', { cid }), env)).json();
    const token = new URL(handshake.url).searchParams.get('t');
    const payload = await verifyDownloadToken(token, env.DOWNLOAD_TOKEN_SECRET, 'handshake', 60);
    expect(payload.cid).toBe(cid);
    const sessions = await (await handleDownloads(req('/api/downloads/sessions'), env)).json();
    expect(sessions.sessions).toHaveLength(1);
    expect((await handleDownloads(req('/api/downloads/sessions', 'DELETE', { session_id: payload.sid }), env)).status).toBe(200);
    const signed = await (await handleDownloads(req('/api/downloads/sign', 'POST', { cids: [cid] }), env)).json();
    const link = await verifyDownloadToken(new URL(signed.urls[0].url).pathname.split('/')[2], env.DOWNLOAD_TOKEN_SECRET, 'url', 604800);
    expect(link.kind).toBe('session'); expect(profile.download_budget.sessions[link.sid].active).toBe(true);
  });
  it('rejects malformed caps, unauthenticated callers, and malformed JSON', async () => {
    expect((await handleDownloads(req('/api/downloads/budget', 'PUT', { account: { daily_cap_cents: 1.5, monthly_cap_cents: 5 } }), env)).status).toBe(400);
    expect((await worker.fetch(req('/api/downloads/budget', 'GET', undefined, 'ApiKey junk'), env, {})).status).toBe(401);
    const bad = req('/api/downloads/budget', 'PUT', {});
    expect((await handleDownloads(new Request(bad.url, { method: 'PUT', headers: bad.headers, body: '{' }), env)).status).toBe(400);
  });
  it.each(['__proto__', 'constructor', 'toString'])('rejects inherited properties as session IDs (%s)', async sessionId => {
    const target = sessionId === '__proto__' ? Object.prototype : Object.prototype[sessionId];
    const previous = Object.getOwnPropertyDescriptor(target, 'revoked_at');
    try {
      const response = await handleDownloads(req('/api/downloads/sessions', 'DELETE', { session_id: sessionId }), env);
      expect(response.status).toBe(404);
      expect(Object.getOwnPropertyDescriptor(target, 'revoked_at')).toEqual(previous);
    } finally {
      if (previous) Object.defineProperty(target, 'revoked_at', previous); else delete target.revoked_at;
    }
  });
});
