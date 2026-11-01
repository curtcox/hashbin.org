import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { aliasFixture } from '../../../test-utils/alias-fixture.js';
import { generate256tHash } from '../../../src/utils/hash256t.js';
import { generateApiKey, verifyApiKey, signDownloadToken } from '../../../src/auth/download-tokens.js';

let f, worker, cid, personalCid, headers;
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  vi.resetModules(); worker = (await import('./index.js')).default;
  f = aliasFixture(); cid = await generate256tHash(new Uint8Array([1])); personalCid = await generate256tHash(new Uint8Array([2]));
  f.env.DOWNLOAD_TOKEN_SECRET = 'local-secret';
  f.env.DOWNLOAD_ANALYTICS = { writeDataPoint: vi.fn() };
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const entries = new Map();
  vi.stubGlobal('caches', { default: { match: vi.fn(async key => entries.get(key.url)?.clone()), put: vi.fn(async (key, response) => entries.set(key.url, response.clone())) } });
  await f.global('document', 'claim', { cid });
  await f.personal('viewer', '/personal', { name: 'document', cid: personalCid });
  const key = await generateApiKey('viewer', 'key', f.env.DOWNLOAD_TOKEN_SECRET);
  const identity = await verifyApiKey(key, f.env.DOWNLOAD_TOKEN_SECRET);
  const user = f.env.USER_PROFILES.get('viewer'); const profile = await user.state.storage.get('profile');
  profile.api_keys = [{ key_id: 'key', key_hash: identity.key_hash, scopes: ['aliases:read'], expires_at: '2099-01-01' }];
  await user.state.storage.put('profile', profile);
  headers = { Authorization: `ApiKey ${key}` };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const request = (path = '/@document', options = {}) => worker.fetch(new Request(`https://256t.us${path}`, options), f.env);

it('redirects anonymous globals and private overrides with distinct HTTP caching and strict paths', async () => {
  const anonymous = await request(); expect(anonymous.status).toBe(302);
  expect(anonymous.headers.get('location')).toBe(`/${cid}`);
  expect(anonymous.headers.get('cache-control')).toBe('public, max-age=60');
  const personal = await request('/@document', { headers });
  expect(personal.headers.get('location')).toBe(`/${personalCid}`);
  expect(personal.headers.get('cache-control')).toBe('private, no-store');
  expect((await request('/a/@document', { headers })).headers.get('location')).toBe(`/a/${personalCid}`);
  expect((await request('/a/@document')).status).toBe(401);
  const head = await request('/@document', { headers, method: 'HEAD' });
  expect(head.status).toBe(302); expect(await head.text()).toBe('');
  expect(f.env.DOWNLOAD_ANALYTICS.writeDataPoint).toHaveBeenCalledWith(expect.objectContaining({ blobs: ['@document', '302', 'miss', 'anon'] }));
});

it('coalesces private misses and bounds repoint propagation by 60 seconds', async () => {
  const viewer = f.env.USER_PROFILES.get('viewer'); viewer.fetch.mockClear();
  await Promise.all(Array.from({ length: 10 }, () => request('/@document', { headers })));
  expect(viewer.fetch).toHaveBeenCalledTimes(1);
  await f.personal('viewer', '/personal/document', { cid }, 'PUT');
  expect((await request('/@document', { headers })).headers.get('location')).toBe(`/${personalCid}`);
  vi.advanceTimersByTime(60001);
  expect((await request('/@document', { headers })).headers.get('location')).toBe(`/${cid}`);
});

it('shares globals and negative cache entries across anonymous and identified lookups', async () => {
  const global = f.env.ALIAS_RECORDS.get('alias:unclaimed');
  expect((await request('/@unclaimed')).status).toBe(404);
  expect((await request('/@unclaimed', { headers })).status).toBe(404);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60001);
  await request('/@unclaimed'); expect(global.fetch).toHaveBeenCalledTimes(2);
});

it('does not extend the internal 60-second change window with another full HTTP TTL', async () => {
  await request();
  vi.advanceTimersByTime(59000);
  await f.global('document', 'value', { cid: personalCid });
  const stale = await request();
  expect(stale.headers.get('location')).toBe(`/${cid}`);
  expect(stale.headers.get('cache-control')).toBe('public, max-age=1');
  vi.advanceTimersByTime(1001);
  expect((await request()).headers.get('location')).toBe(`/${personalCid}`);
});

it('does not resolve expired private entries or leak restricted CIDs across credentials', async () => {
  const viewer = f.env.USER_PROFILES.get('viewer');
  const alias = await viewer.state.storage.get('personal-alias:document'); alias.paid_through = new Date(Date.now() + 1000).toISOString();
  await viewer.state.storage.put('personal-alias:document', alias);
  expect((await request('/@document', { headers })).headers.get('location')).toBe(`/${personalCid}`);
  vi.advanceTimersByTime(1001);
  expect((await request('/@document', { headers })).headers.get('location')).toBe(`/${cid}`);
  const profile = await viewer.state.storage.get('profile'); profile.api_keys[0].revoked_at = new Date().toISOString(); await viewer.state.storage.put('profile', profile);
  vi.advanceTimersByTime(60001);
  expect((await request('/@document', { headers })).status).toBe(401);
});

it('supports the HTTP-only download session and rejects signed alias paths and invalid identities', async () => {
  const viewer = f.env.USER_PROFILES.get('viewer'); const profile = await viewer.state.storage.get('profile');
  profile.download_budget = { sessions: { session: { active: true, expires_at: Date.now() + 60000 } } }; await viewer.state.storage.put('profile', profile);
  const cookie = await signDownloadToken({ type: 'cookie', kind: 'session', u: 'viewer', sid: 'session', iat: Date.now() / 1000, exp: Date.now() / 1000 + 60 }, f.env.DOWNLOAD_TOKEN_SECRET);
  expect((await request('/@document', { headers: { Cookie: `__Host-hb_dl=${cookie}` } })).headers.get('location')).toBe(`/${personalCid}`);
  expect((await request('/s/token/@document')).status).toBe(404);
  expect((await request('/@document', { headers: { Authorization: 'ApiKey bad' } })).status).toBe(401);
  expect((await request('/@a..b')).status).toBe(404);
});

it('rate limits every alias lookup and samples refusals', async () => {
  for (let i = 0; i < 30; i++) expect((await request()).status).toBe(302);
  expect((await request()).status).toBe(429);
  expect(f.env.DOWNLOAD_ANALYTICS.writeDataPoint).toHaveBeenLastCalledWith(expect.objectContaining({ blobs: ['@document', '429', 'miss', 'anon'] }));
});

it.each([['brake', 429], ['hard_stop', 503], ['unavailable', 503]])('fails closed on %s', async (mode, status) => {
  f.env.INFRASTRUCTURE_COST = { idFromName: n => n, get: () => ({ fetch: async () => mode === 'unavailable' ? Response.json({}, { status: 503 }) : Response.json({ hard_stop: mode === 'hard_stop', brake: true }) }) };
  const response = await request('/@document', { headers });
  expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store');
});
