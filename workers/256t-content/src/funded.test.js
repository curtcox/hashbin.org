import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserProfile } from '../../../src/durable-objects/user-profile.js';
import { generateApiKey, signDownloadToken, signOAuthJwt } from '../../../src/auth/download-tokens.js';
import { sha256Hex } from '../../../src/auth/oauth.js';
import { setTimeout as realTimeout } from 'node:timers/promises';

const prefix = Buffer.alloc(6); prefix.writeUIntBE(100, 0, 6);
const cid = prefix.toString('base64url') + Buffer.alloc(64, 42).toString('base64url');
const caps = { daily_cap_cents: 10, monthly_cap_cents: 10 };
let worker, env, user, profile, key, calls, stored;
function req(path = `/a/${cid}`, headers = {}, method = 'GET') {
  return new Request(`https://256t.us${path}`, { method, headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } });
}
const auth = () => ({ Authorization: `ApiKey ${key}` });
beforeEach(async () => {
  vi.stubGlobal('scheduler', { wait: realTimeout });
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  worker = (await import('./index.js')).default;
  key = await generateApiKey('user', 'key', 'shared-secret');
  profile = { user_id: 'user', balance_cents: 10, api_keys: [{ key_id: 'key', key_hash: await sha256Hex(key), expires_at: '2099-01-01', scopes: ['downloads:spend'] }],
    oauth_grants: [{ grant_id: 'grant', app_id: 'app', scopes: ['downloads:spend'], spending_limit: 1, spending_used: 0 }] };
  stored = structuredClone(profile);
  const rows = new Map();
  const state = { storage: { get: async id => structuredClone(id === 'profile' ? stored : rows.get(id)),
    put: async (key, value) => {
      for (const [id, data] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) {
        if (id === 'profile') stored = structuredClone(data); else rows.set(id, structuredClone(data));
      }
    }, setAlarm: async () => {} } };
  user = new UserProfile(state, {});
  calls = vi.fn(request => user.fetch(request));
  const binding = object => ({ idFromName: name => name, get: () => object });
  env = {
    ENVIRONMENT: 'local',
    DOWNLOAD_TOKEN_SECRET: 'shared-secret', OAUTH_SIGNING_KEY: 'oauth-secret', COST_SAFETY_ALLOWANCE_ONLY: 'true',
    USER_PROFILES: binding({ fetch: calls }),
    CONTENT_METADATA: binding({ fetch: vi.fn(async () => Response.json({ count: 0 }, { status: 429 })) }),
    INFRASTRUCTURE_COST: binding({ fetch: async () => Response.json({ brake: true, hard_stop: false }) }),
    CONTENT_BUCKET: { head: async () => null, get: async name => name.endsWith('.meta')
      ? { json: async () => ({ version: 2, expires_at: '2099-01-01' }) }
      : { body: 'a'.repeat(100), size: 100 } }
  };
  await user.fetch(new Request('https://internal/download/budget', { method: 'PUT', body: JSON.stringify({ account: caps }) }));
  await user.fetch(new Request('https://internal/download/key-budget', { method: 'PUT', body: JSON.stringify({ key_id: 'key', caps }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
  it.each([{}, { Authorization: 'ApiKey hb_junk' }, { Authorization: 'ApiKey hb_' + 'a'.repeat(32) }, { Authorization: 'Bearer junk' }, { 'X-API-Key': 'hbk_forged' }, { 'X-API-Key': 'hb_' + 'a'.repeat(32) }])('rejects missing/junk credentials before ANY DO access: %j', async headers => {
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
    env.INFRASTRUCTURE_COST.get = () => ({ fetch: async () => Response.json({ hard_stop: true, brake: true }) });
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

it('refuses retired key formats and keys without downloads:spend', async () => {
  expect((await worker.fetch(req(`/${cid}`, { 'X-API-Key': 'hb_' + 'a'.repeat(32) }), env)).status).toBe(401);
  stored.api_keys[0].scopes = ['content:write'];
  expect((await worker.fetch(req(`/${cid}`, auth()), env)).status).toBe(401);
});

it('keeps using prepaid requests when a funding confirmation expires at the cap', async () => {
  stored.balance_cents = 1;
  stored.download_budget.account = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  stored.download_budget.keys.key = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  // Warm up adaptive leases, then reserve the remaining cap just before the
  // initial funding confirmation expires. The last lease is still paid for.
  for (let i = 0; i < 2047; i++) expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  vi.advanceTimersByTime(59000);
  for (let i = 0; i < 250; i++) expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  expect(stored.download_budget.spend.account.day_uc).toBe(1000000);
  vi.advanceTimersByTime(1000);
  const remaining = 2500 - 2297;
  const responses = await Promise.all(Array.from({ length: remaining }, () => worker.fetch(req(undefined, auth()), env)));
  expect(responses.every(r => r.status === 200 && r.headers.get('X-Budget') === 'funded')).toBe(true);
  expect(stored.download_budget.spend.account.day_uc).toBe(1000000);
  const exhausted = await worker.fetch(req(undefined, auth()), env);
  expect(exhausted.status).toBe(429);
  expect(exhausted.headers.get('X-Budget')).toBe('exhausted');
});

it('revalidates revoked credentials even while a prepaid lease remains', async () => {
  for (let i = 0; i < 3; i++) await worker.fetch(req(undefined, auth()), env);
  vi.advanceTimersByTime(59000);
  await worker.fetch(req(undefined, auth()), env); // A new lease ends at t=119s.
  stored.api_keys[0].revoked_at = new Date().toISOString();
  vi.advanceTimersByTime(1000);
  expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(401);
  vi.advanceTimersByTime(59000);
  expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(401);
});

it('samples invalid funded credentials without accessing a Durable Object', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const writeDataPoint = vi.fn();
  env.DOWNLOAD_ANALYTICS = { writeDataPoint };
  expect((await worker.fetch(req(undefined, { 'X-API-Key': 'hbk_forged' }), env)).status).toBe(401);
  expect(calls).not.toHaveBeenCalled();
  expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
    indexes: [cid], blobs: [cid, '401', 'miss', 'anon'], doubles: [100, 0, 0]
  });
});

it.each([false, true])('attributes funded delivery and failures once with their lease cost (failure=%s)', async failure => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const writeDataPoint = vi.fn();
  env.DOWNLOAD_ANALYTICS = { writeDataPoint };
  if (failure) env.CONTENT_BUCKET.get = async () => { throw new Error('R2 unavailable'); };
  const response = await worker.fetch(req(undefined, auth()), env);
  expect(response.status).toBe(failure ? 503 : 200);
  expect(response.headers.get('X-Budget')).toBe('funded');
  expect(writeDataPoint).toHaveBeenCalledTimes(1);
  const point = writeDataPoint.mock.calls[0][0];
  expect(point.blobs).toEqual([cid, String(response.status), 'miss', 'funded']);
  expect(point.doubles[1]).toBeCloseTo(0.0004);
  expect(point.doubles[2]).toBeGreaterThan(0);
});

it('shares a paid key lease across direct requests and signed URLs at an exhausted cap', async () => {
  stored.balance_cents = 1;
  stored.download_budget.account = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  stored.download_budget.keys.key = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  for (let i = 0; i < 2297; i++) expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  expect(stored.download_budget.spend.account.day_uc).toBe(1000000);
  const iat = Date.now() / 1000;
  const token = await signDownloadToken({ u: 'user', k: 'key', kind: 'key', cid, type: 'url', iat, exp: iat + 60 }, env.DOWNLOAD_TOKEN_SECRET);
  const responses = await Promise.all(Array.from({ length: 203 }, (_, i) => worker.fetch(i % 2
    ? req(`/s/${token}/${cid}`) : req(undefined, auth()), env)));
  expect(responses.every(r => r.status === 200 && r.headers.get('X-Budget') === 'funded')).toBe(true);
  expect(stored.download_budget.spend.account.day_uc).toBe(1000000);
});

it.each([{}, null, { brake: false }, { hard_stop: false }, { hard_stop: 'false', brake: false }, { hard_stop: false, brake: 0 }])('fails closed for an invalid safety response: %j', async safety => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  env.INFRASTRUCTURE_COST.get = () => ({ fetch: async () => Response.json(safety) });
  try { expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(503); }
  finally { log.mockRestore(); }
  expect(calls).not.toHaveBeenCalled();
  expect(stored.balance_cents).toBe(10);
});

it('refuses production content when the safety binding is missing', async () => {
  env.ENVIRONMENT = 'production'; delete env.INFRASTRUCTURE_COST;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(503); }
  finally { log.mockRestore(); }
  expect(calls).not.toHaveBeenCalled();
});

it('validates each credential proof before sharing an existing paid lease', async () => {
  await worker.fetch(req(undefined, auth()), env);
  await worker.fetch(req(undefined, auth()), env); // One paid request remains.
  const wrongKey = await generateApiKey('user', 'key', env.DOWNLOAD_TOKEN_SECRET);
  const response = await worker.fetch(req(undefined, { Authorization: `ApiKey ${wrongKey}` }), env);
  expect(response.status).toBe(401);
  const before = stored.download_budget.spend.account.day_uc;
  expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  expect(stored.download_budget.spend.account.day_uc).toBe(before);
});

it('keeps different request prices separate even when the cheaper price has unused credit', async () => {
  stored.balance_cents = 1;
  stored.download_budget.account = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  stored.download_budget.keys.key = { daily_cap_cents: 1, monthly_cap_cents: 1 };
  for (let i = 0; i < 2297; i++) await worker.fetch(req(undefined, auth()), env);
  const bigPrefix = Buffer.alloc(6); bigPrefix.writeUIntBE(1024 ** 3, 0, 6);
  const bigCid = bigPrefix.toString('base64url') + Buffer.alloc(64, 42).toString('base64url');
  const denied = await worker.fetch(req(`/a/${bigCid}`, auth()), env);
  expect(denied.status).toBe(429);
  expect(denied.headers.get('X-Budget')).toBe('exhausted');
  const paid = await worker.fetch(req(undefined, auth()), env);
  expect(paid.status).toBe(200);
  expect(paid.headers.get('X-Budget')).toBe('funded');
  expect(stored.download_budget.spend.account.day_uc).toBe(1000000);
});

it('rejects malformed safety state before using a cached body or spending budget', async () => {
  const match = vi.fn(async () => new Response('cached', { headers: { 'X-Cache-Until': String(Date.now() + 60000) } }));
  vi.stubGlobal('caches', { default: { match } });
  env.INFRASTRUCTURE_COST.get = () => ({ fetch: async () => Response.json({}) });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(503); }
  finally { log.mockRestore(); }
  expect(match).not.toHaveBeenCalled(); expect(calls).not.toHaveBeenCalled();
});

it('rechecks safety after its TTL and recovers immediately from a malformed response', async () => {
  let safety = { hard_stop: false, brake: true };
  const fetch = vi.fn(async () => Response.json(safety));
  env.INFRASTRUCTURE_COST.get = () => ({ fetch });
  expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  safety = {};
  vi.advanceTimersByTime(60000);
  const before = stored.balance_cents;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(503); }
  finally { log.mockRestore(); }
  expect(stored.balance_cents).toBe(before);
  safety = { hard_stop: false, brake: true };
  expect((await worker.fetch(req(undefined, auth()), env)).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(3);
});
