import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunWorker } from './index.js';
import { ApplicationRegistry } from '../../../src/durable-objects/application-registry.js';
import { labelAppId, appLabel } from '../../../src/utils/run-origin.js';
import { computeCID } from '../../../frontend/sdk/hashbin.js';

const appId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const domain = 'run.example';
const origin = `https://${appLabel(appId)}.${domain}`;
function setup({ status = 'active', cap = 20000, allowLocal = false, appStatus = 'active' } = {}) {
  const values = new Map([['apps', [{ app_id: appId, owner_user_id: 'owner', status: appStatus, redirect_uris: ['https://app.example/callback', 'http://localhost:8080/cb', 'org.example.app:/cb'], run: { status, daily_request_cap: cap, allow_local: allowLocal } }]]]);
  const registry = new ApplicationRegistry({ storage: { get: async key => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)) } }, { RUN_DOMAIN: domain });
  const registryFetch = vi.fn(request => registry.fetch(request));
  const env = {
    RUN_DOMAIN: domain, ENVIRONMENT: 'local',
    APPLICATION_REGISTRY: { idFromName: name => name, get: () => ({ fetch: registryFetch }) },
    CONTENT_BUCKET: { get: vi.fn(async () => ({ body: new TextEncoder().encode('runtime') })) },
    CONTENT_METADATA: { idFromName: name => name, get: () => ({ fetch: async () => Response.json({ expires_at: '2099-01-01T00:00:00Z' }) }) }
  };
  return { env, values, registryFetch };
}
const request = (path = '/frame/v0.4.0', options = {}) => new Request(`${origin}${path}`, options);

describe('hosted run origin', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('maps only deterministic lowercase UUID labels', () => {
    expect(labelAppId(appLabel(appId))).toBe(appId);
    for (const label of ['app_123', 'a123', 'A' + 'f'.repeat(32), 'a' + 'g'.repeat(32), appLabel(appId) + '.extra']) expect(labelAppId(label)).toBeNull();
  });

  it.each([['off', 404], ['suspended', 403]])('refuses %s apps without caching the response', async (status, expected) => {
    const { env } = setup({ status });
    const response = await createRunWorker().fetch(request(), env);
    expect(response.status).toBe(expected);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('caches unknown apps for 60 seconds and rejects invalid hosts', async () => {
    const { env, registryFetch } = setup({ appStatus: 'deleted' });
    const worker = createRunWorker();
    for (let i = 0; i < 2; i++) expect((await worker.fetch(request(), env)).status).toBe(404);
    expect(registryFetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 60001);
    expect((await worker.fetch(request(), env)).status).toBe(404);
    expect(registryFetch).toHaveBeenCalledTimes(2);
    for (const host of ['evil.example', 'other.run.example', `${appLabel(appId)}.extra.run.example`]) expect((await worker.fetch(new Request(`https://${host}/frame/v0.4.0`), env)).status).toBe(404);
  });

  it.each([false, true])('uses registered web embedders, allow_local=%s, and no cookies', async allowLocal => {
    const { env, registryFetch } = setup({ allowLocal });
    const response = await createRunWorker().fetch(request(undefined, { headers: { Cookie: 'session=secret' } }), env);
    expect(response.status).toBe(200);
    const policy = response.headers.get('content-security-policy');
    expect(policy).toContain('frame-ancestors https://app.example');
    expect(policy.includes('http://localhost:8080')).toBe(allowLocal);
    expect(policy).not.toContain('org.example');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('vary')).toBe('Host');
    expect(response.headers.get('set-cookie')).toBeNull();
    for (const [internal] of registryFetch.mock.calls) expect(internal.headers.get('cookie')).toBeNull();
    expect(await response.text()).toContain('hashbin-embedders');
    for (const header of ['x-content-type-options', 'referrer-policy', 'cross-origin-resource-policy', 'permissions-policy', 'strict-transport-security']) expect(response.headers.has(header)).toBe(true);
  });

  it('denies framing when there are no web embedders', async () => {
    const { env, values } = setup();
    values.get('apps')[0].redirect_uris = ['org.example.app:/cb'];
    expect((await createRunWorker().fetch(request(), env)).headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('keeps HEAD bodies empty, including early refusals and the apex', async () => {
    const { env } = setup();
    const worker = createRunWorker();
    for (const url of [origin + '/frame/v0.4.0', 'https://run.example/', 'https://invalid.run.example/frame/v0.4.0']) {
      const response = await worker.fetch(new Request(url, { method: 'HEAD' }), env);
      expect(await response.text()).toBe('');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('serves only supported bootstrap versions with immutable headers', async () => {
    const { env } = setup();
    const worker = createRunWorker();
    const frame = await worker.fetch(request(), env);
    expect(await frame.text()).toContain('/frame/v0.4.1.js');
    const legacy = await worker.fetch(request('/frame/v0.4.0.js'), env);
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get('location')).toBe('/frame/v0.4.1.js');
    expect(legacy.headers.get('cache-control')).toBe('no-store');
    const response = await worker.fetch(request('/frame/v0.4.1.js'), env);
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(await response.text()).toContain('embedders.includes(event.origin)');
    for (const path of ['/frame/v0.3.0', '/frame/v99.0.0', '/sw.js', '/anything']) expect((await worker.fetch(request(path), env)).status).toBe(404);
  });

  it('enforces same-origin fetch metadata and serves pinned CIDs through the edge cache', async () => {
    const { env } = setup();
    const cid = await computeCID('x'.repeat(65));
    const worker = createRunWorker({ test: { '1': { 'runtime.js': { cid, type: 'text/javascript', sha256: 'a'.repeat(64) } } } });
    const cache = new Map();
    vi.stubGlobal('caches', { default: { match: async key => cache.get(key.url)?.clone(), put: async (key, response) => cache.set(key.url, response) } });
    expect((await worker.fetch(request('/r/test/1/runtime.js'), env)).status).toBe(403);
    expect((await worker.fetch(request('/r/test/1/runtime.js', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), env)).status).toBe(403);
    const runtimeRequest = path => request(path, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    expect((await worker.fetch(runtimeRequest('/r/test/1/missing.js'), env)).status).toBe(404);
    for (let i = 0; i < 2; i++) {
      const response = await worker.fetch(runtimeRequest('/r/test/1/runtime.js'), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toBe(`"${cid}"`);
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(await response.text()).toBe('runtime');
    }
    expect(env.CONTENT_BUCKET.get).toHaveBeenCalledTimes(1);
  });

  it('enforces the IP window and resets after one minute', async () => {
    const { env } = setup();
    const worker = createRunWorker();
    for (let i = 0; i < 120; i++) expect((await worker.fetch(request('/health'), env)).status).toBe(200);
    expect((await worker.fetch(request('/health'), env)).status).toBe(429);
    vi.setSystemTime(Date.now() + 60001);
    expect((await worker.fetch(request('/health'), env)).status).toBe(200);
  });

  it('enforces a durable daily app cap across isolates and retries usage without double counting', async () => {
    const { env, values } = setup({ cap: 2 });
    const worker = createRunWorker();
    expect((await worker.fetch(request('/health'), env)).status).toBe(200);
    expect((await worker.fetch(request('/health'), { ...env })).status).toBe(429);
    vi.setSystemTime(Date.now() + 60001);
    expect((await worker.fetch(request('/health'), env)).status).toBe(200);
    expect((await worker.fetch(request('/health'), env)).status).toBe(429);
    const day = new Date().toISOString().slice(0, 10);
    expect(values.get(`run:usage:${appId}:${day}`)).toMatchObject({ reserved: 2, requests: 2 });
  });

  it.each(['hard_stop', 'run_brake'])('fails closed on %s and cost service outages', async flag => {
    const { env } = setup();
    env.INFRASTRUCTURE_COST = { idFromName: x => x, get: () => ({ fetch: async () => Response.json({ hard_stop: false, brake: false, [flag]: true }) }) };
    const response = await createRunWorker().fetch(request(), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    env.INFRASTRUCTURE_COST.get = () => ({ fetch: async () => { throw new Error('offline'); } });
    expect((await createRunWorker().fetch(request(), env)).status).toBe(503);
  });
});
