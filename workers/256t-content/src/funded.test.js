import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserProfile } from '../../../src/durable-objects/user-profile.js';
import { generateDownloadApiKey, signDownloadToken, signOAuthJwt } from '../../../src/auth/download-tokens.js';
import { sha256Hex } from '../../../src/auth/oauth.js';

const prefix = Buffer.alloc(6); prefix.writeUIntBE(100, 0, 6);
const cid = prefix.toString('base64url') + Buffer.alloc(64, 42).toString('base64url');
const caps = { daily_cap_cents: 10, monthly_cap_cents: 10 };
let worker, env, user, profile, key, calls, stored;
function req(path = `/a/${cid}`, headers = {}, method = 'GET') {
  return new Request(`https://256t.us${path}`, { method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } });
}
const auth = () => ({ Authorization: `ApiKey ${key}` });
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  worker = (await import('./index.js')).default;
  key = await generateDownloadApiKey('user', 'key', 'shared-secret');
  profile = { user_id: 'user', balance_cents: 10, api_keys: [{ key_id: 'key', key_hash: await sha256Hex(key), expires_at: '2099-01-01' }],
    oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 1, spending_used: 0 }] };
  stored = structuredClone(profile);
  const state = { storage: { get: async () => structuredClone(stored), put: async (_, value) => { stored = structuredClone(value); }, setAlarm: async () => {} } };
  user = new UserProfile(state, {});
  calls = vi.fn(request => user.fetch(request));
  const binding = object => ({ idFromName: name => name, get: () => object });
  env = {
    DOWNLOAD_TOKEN_SECRET: 'shared-secret', OAUTH_SIGNING_KEY: 'oauth-secret', COST_SAFETY_ALLOWANCE_ONLY: 'true',
    USER_PROFILES: binding({ fetch: calls }),
    CONTENT_METADATA: binding({ fetch: vi.fn(async () => Response.json({ count: 0 }, { status: 429 })) }),
    INFRASTRUCTURE_COST: binding({ fetch: async () => Response.json({ brake: true }) }),
    CONTENT_BUCKET: { head: async () => null, get: async name => name.endsWith('.meta')
      ? { json: async () => ({ version: 2, expires_at: '2099-01-01' }) }
      : { body: 'a'.repeat(100), size: 100 } }
  };
  await user.fetch(new Request('https://internal/download/budget', { method: 'PUT', body: JSON.stringify({ account: caps }) }));
  await user.fetch(new Request('https://internal/download/key-budget', { method: 'PUT', body: JSON.stringify({ key_id: 'key', caps }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('funded content delivery', () => {
  it('delivers a concurrent funded burst from one IP with allowance exhausted and brake on, without 429', async () => {
    const responses = await Promise.all(Array.from({ length: 100 }, (_, i) => worker.fetch(req(`/a/${cid}.txt`, auth(), i % 2 ? 'HEAD' : 'GET'), env)));
    expect(responses.every(r => r.status === 200 && r.headers.get('X-Budget') === 'funded')).toBe(true);
    expect(stored.download_budget.spend.account.day_uc).toBeGreaterThanOrEqual(100 * 400);
    expect(stored.balance_cents).toBe(9);
    expect(calls.mock.calls.filter(([r]) => new URL(r.url).pathname === '/download/lease')).toHaveLength(7);
  });
  it('uses the file allowance first without debiting the requester and bypasses IP limits for confirmed funding', async () => {
    env.CONTENT_METADATA.get = () => ({ fetch: async () => Response.json({ count: 250, expires_at: Date.now() + 60000 }) });
    const responses = await Promise.all(Array.from({ length: 40 }, () => worker.fetch(req(undefined, auth()), env)));
    expect(responses.every(r => r.status === 200 && r.headers.get('X-Budget') === 'file')).toBe(true);
    expect(stored.balance_cents).toBe(10);
    expect(stored.download_budget.spend.account.day_uc).toBe(0);
  });
  it.each([{}, { Authorization: 'ApiKey hb_junk' }, { Authorization: 'ApiKey hb_' + 'a'.repeat(32) }, { Authorization: 'Bearer junk' }, { 'X-API-Key': 'hb2_forged' }])('rejects missing/junk credentials before ANY DO access: %j', async headers => {
    const forbidden = { idFromName: () => { throw new Error('DO touched'); } };
    const r = await worker.fetch(req(undefined, headers), { ...env, USER_PROFILES: forbidden, CONTENT_METADATA: forbidden, INFRASTRUCTURE_COST: forbidden });
    expect(r.status).toBe(401); expect(calls).not.toHaveBeenCalled();
  });
  it('rejects a tampered signed token and a URL for another CID before DO access', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = await signDownloadToken({ u: 'user', k: 'key', kind: 'key', cid, type: 'url', iat, exp: iat + 60 }, env.DOWNLOAD_TOKEN_SECRET);
    expect((await worker.fetch(req(`/s/${token}/${cid}`), env)).headers.get('X-Budget')).toBe('funded');
    calls.mockClear();
    expect((await worker.fetch(req(`/s/${token}/${cid.slice(0, -1)}A`), env)).status).toBe(401);
    expect((await worker.fetch(req(`/s/${token.slice(0, -1)}!/${cid}`), env)).status).toBe(401);
    vi.advanceTimersByTime(60000);
    expect((await worker.fetch(req(`/s/${token}/${cid}`), env)).status).toBe(401);
    expect(calls).not.toHaveBeenCalled();
  });
  it('accepts scoped OAuth tokens and applies their grant caps', async () => {
    await user.fetch(new Request('https://internal/download/key-budget', { method: 'PUT', body: JSON.stringify({ kind: 'oauth', key_id: 'grant', caps }) }));
    const token = await signOAuthJwt({ token_type: 'access', user_id: 'user', grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], exp: Date.now() / 1000 + 60 }, env.OAUTH_SIGNING_KEY);
    const r = await worker.fetch(req(undefined, { Authorization: `Bearer ${token}` }), env);
    expect(r.status).toBe(200); expect(r.headers.get('X-Budget')).toBe('funded');
  });
  it('sets the host-only cookie, refuses handshake replay, and revokes the session within a lease', async () => {
    const created = await (await user.fetch(new Request('https://internal/download/sessions', { method: 'POST', body: '{}' }))).json();
    const iat = Date.now() / 1000;
    const token = await signDownloadToken({ u: 'user', sid: created.sid, cid, type: 'handshake', iat, exp: iat + 60 }, env.DOWNLOAD_TOKEN_SECRET);
    const r = await worker.fetch(req(`/_/session?t=${token}`), env);
    expect(r.status).toBe(303); expect(r.headers.get('Location')).toBe(`/a/${cid}`);
    const cookie = r.headers.get('Set-Cookie');
    expect(cookie).toContain('__Host-hb_dl='); expect(cookie).toContain('Path=/; HttpOnly; Secure; SameSite=Lax'); expect(cookie).not.toContain('Domain=');
    expect((await worker.fetch(req(`/_/session?t=${token}`), env)).status).toBe(401);
    expect((await worker.fetch(req(undefined, { Cookie: cookie.split(';')[0] }), env)).status).toBe(200);
    await user.fetch(new Request('https://internal/download/sessions', { method: 'DELETE', body: JSON.stringify({ sid: created.sid }) }));
    vi.advanceTimersByTime(60000);
    expect((await worker.fetch(req(undefined, { Cookie: cookie.split(';')[0] }), env)).status).toBe(401);
  });
  it('falls back to anonymous limits when caps are off and marks exhausted', async () => {
    stored.download_budget.account = null;
    env.CONTENT_METADATA.get = () => ({ fetch: async () => Response.json({ count: 250, expires_at: Date.now() + 60000 }) });
    for (let i = 0; i < 30; i++) expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
    const r = await worker.fetch(req(undefined, auth()), env);
    expect(r.status).toBe(429); expect(r.headers.get('X-Budget')).toBe('exhausted');
  });
  it.each([404, 451, 503])('preserves availability failures (%s) before spending', async status => {
    env.CONTENT_METADATA.get = () => ({ fetch: async () => Response.json({ count: 0 }, { status }) });
    expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(status);
    expect(stored.balance_cents).toBe(10);
  });
  it('hard-stops both funded and anonymous requests with 503', async () => {
    env.INFRASTRUCTURE_COST.get = () => ({ fetch: async () => Response.json({ hard_stop: true }) });
    expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(503);
    expect((await worker.fetch(req(`/${cid}`), env)).status).toBe(503);
    expect(calls).not.toHaveBeenCalled();
  });
  it('handles CORS preflight without credentials or a DO call', async () => {
    const r = await worker.fetch(req(undefined, {}, 'OPTIONS'), env);
    expect(r.status).toBe(204); expect(r.headers.get('Access-Control-Allow-Headers')).toContain('X-API-Key');
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBeNull(); expect(calls).not.toHaveBeenCalled();
  });
  it('returns an idle remainder through waitUntil before its 30-second lifetime', async () => {
    const tasks = [], ctx = { waitUntil: p => tasks.push(p) };
    await worker.fetch(req(undefined, auth()), env, ctx);
    await worker.fetch(req(undefined, auth()), env, ctx); // second lease has two requests, one unused
    expect(stored.download_budget.spend.account.day_uc).toBe(1200);
    await vi.advanceTimersByTimeAsync(25000);
    await Promise.all(tasks);
    expect(stored.download_budget.spend.account.day_uc).toBe(800);
  });
});

it('renews shared file leases before charging waiters in a burst', async () => {
  let remaining = 100;
  const reserve = vi.fn(async () => {
    const count = Math.min(5, remaining); remaining -= count;
    return Response.json({ count, expires_at: Date.now() + 60000 }, { status: count ? 200 : 429 });
  });
  env.CONTENT_METADATA.get = () => ({ fetch: reserve });
  const responses = await Promise.all(Array.from({ length: 75 }, () => worker.fetch(req(undefined, auth()), env)));
  expect(responses.every(r => r.status === 200 && r.headers.get('X-Budget') === 'file')).toBe(true);
  expect(stored.balance_cents).toBe(10);
  expect(reserve).toHaveBeenCalledTimes(15);
});

it('accepts a legacy key only on a plain path and caches its registry lookup', async () => {
  const legacy = 'hb_' + 'a'.repeat(32);
  stored.api_keys[0].key_hash = await sha256Hex(legacy);
  const lookup = vi.fn(async () => Response.json({ user_id: 'user', key_id: 'key' }));
  env.KEY_REGISTRY = { idFromName: id => id, get: () => ({ fetch: lookup }) };
  expect((await worker.fetch(req(`/${cid}`, { 'X-API-Key': legacy }), env)).status).toBe(200);
  expect((await worker.fetch(req(`/${cid}`, { 'X-API-Key': legacy }), env)).status).toBe(200);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect((await worker.fetch(req(`/a/${cid}`, { 'X-API-Key': legacy }), env)).status).toBe(401);
  expect(lookup).toHaveBeenCalledTimes(1);
});
