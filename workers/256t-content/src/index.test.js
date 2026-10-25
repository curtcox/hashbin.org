import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function cidFor(size = 100) {
  const prefix = Buffer.alloc(6);
  prefix.writeUIntBE(size, 0, 6);
  return prefix.toString('base64url') + Buffer.alloc(64, 42).toString('base64url');
}

function request(cid, options = {}) {
  return new Request(`https://256t.us/${cid}`, {
    headers: { 'CF-Connecting-IP': '192.0.2.1' }, ...options
  });
}

describe('content worker transient errors', () => {
  let worker;
  let env;
  const cid = cidFor();
  const payload = 'a'.repeat(100);

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
    worker = (await import('./index.js')).default;
    env = {
      CONTENT_METADATA: { idFromName: name => name, get: () => ({ fetch: async () => Response.json({ count: 250, expires_at: Date.now() + 60000 }) }) },
      CONTENT_BUCKET: {
        head: vi.fn(async () => null),
        get: vi.fn(async key => {
          if (key.endsWith('.meta')) return { json: async () => ({ expires_at: '2036-10-17T00:00:00Z' }) };
          if (key === cid) return { body: payload, size: 100, httpMetadata: { contentType: 'text/plain' } };
          return null;
        })
      }
    };
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function memoryCache() {
    const entries = new Map();
    const cache = {
      match: vi.fn(async key => {
        const response = entries.get(key.url);
        return response && Number(response.headers.get('X-Cache-Until')) > Date.now() ? response.clone() : undefined;
      }),
      put: vi.fn(async (key, response) => entries.set(key.url, response.clone()))
    };
    vi.stubGlobal('caches', { default: cache });
    return cache;
  }

  it('caches successful bodies, shares the GET key with HEAD, and checks allowance before a hit', async () => {
    const cache = memoryCache();
    const reserve = vi.fn(async () => Response.json({ count: 2, expires_at: Date.now() + 60000 }));
    env.CONTENT_METADATA.get = () => ({ fetch: reserve });
    expect((await worker.fetch(request(cid), env)).headers.get('x-cache')).toBe('MISS');
    const reads = env.CONTENT_BUCKET.get.mock.calls.length;
    const head = await worker.fetch(request(cid, { method: 'HEAD' }), env);
    expect(head.headers.get('x-cache')).toBe('HIT');
    expect(await head.text()).toBe('');
    expect(env.CONTENT_BUCKET.get).toHaveBeenCalledTimes(reads);
    reserve.mockResolvedValue(Response.json({ count: 0 }, { status: 429 }));
    const denied = await worker.fetch(request(cid), env);
    expect(denied.status).toBe(429);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it('uses two R2 reads on a migrated cache miss and preserves expiry in cached responses', async () => {
    memoryCache();
    env.CONTENT_BUCKET.get.mockImplementation(async key => key.endsWith('.meta')
      ? { json: async () => ({ version: 2, expires_at: new Date(Date.now() + 120000).toISOString() }) }
      : { body: payload, size: 100 });
    const first = await worker.fetch(request(cid), env);
    expect(first.headers.get('cache-control')).toBe('public, max-age=120');
    expect(env.CONTENT_BUCKET.head).not.toHaveBeenCalled();
    expect(env.CONTENT_BUCKET.get).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10000);
    const second = await worker.fetch(request(cid), env);
    expect(second.headers.get('cache-control')).toBe('public, max-age=110');
    expect(second.headers.get('x-cache')).toBe('HIT');
  });

  it('blocks a cached file after a dispute when the one-minute lease expires', async () => {
    memoryCache();
    const reserve = vi.fn(async () => Response.json({ count: 250, expires_at: Date.now() + 60000 }));
    env.CONTENT_METADATA.get = () => ({ fetch: reserve });
    expect((await worker.fetch(request(cid), env)).status).toBe(200);
    reserve.mockResolvedValue(Response.json({ count: 0 }, { status: 451 }));
    vi.advanceTimersByTime(60000);
    expect((await worker.fetch(request(cid), env)).status).toBe(451);
  });

  it('never duplicates a lease while concurrent requests wait for the same reservation', async () => {
    const reserve = vi.fn().mockImplementationOnce(async () => Response.json({ count: 5, expires_at: Date.now() + 60000 }))
      .mockImplementation(async () => Response.json({ count: 0 }, { status: 429 }));
    env.CONTENT_METADATA.get = () => ({ fetch: reserve });
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => worker.fetch(request(cid, {
      headers: { 'CF-Connecting-IP': `192.0.2.${i}` }
    }), env)));
    expect(responses.filter(response => response.ok)).toHaveLength(5);
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the prepaid counter is unavailable', async () => {
    delete env.CONTENT_METADATA;
    expect((await worker.fetch(request(cid), env)).status).toBe(503);
    expect(env.CONTENT_BUCKET.get).not.toHaveBeenCalled();
  });

  it('keeps stored content available after the per-IP download window resets', async () => {
    for (let index = 0; index < 30; index++) {
      const response = await worker.fetch(request(cid), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(payload);
      expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    }
    const limited = await worker.fetch(request(cid), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.headers.get('access-control-expose-headers')).toBe('X-Budget, X-Cache, Retry-After');
    expect(limited.headers.get('access-control-allow-origin')).toBe('*');
    vi.advanceTimersByTime(60_000);
    const retry = await worker.fetch(request(cid), env);
    expect(retry.status).toBe(200);
    expect(await retry.text()).toBe(payload);
  });

  it('does not cache a missing response before a later upload makes content available', async () => {
    const missingCID = cidFor(101);
    const missing = await worker.fetch(request(missingCID), env);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    env.CONTENT_BUCKET.get.mockResolvedValue({ body: 'new upload', size: 10 });
    const uploaded = await worker.fetch(request(missingCID), env);
    expect(uploaded.status).toBe(200);
    expect(await uploaded.text()).toBe('new upload');
  });

  it('does not cache expired, deleted, disputed, invalid, or unsupported requests', async () => {
    env.CONTENT_BUCKET.get.mockResolvedValueOnce({ json: async () => ({ expires_at: '2020-01-01T00:00:00Z' }) });
    const expired = await worker.fetch(request(cid), env);
    expect(expired.status).toBe(404);
    expect(expired.headers.get('cache-control')).toBe('no-store');
    env.CONTENT_BUCKET.head.mockResolvedValueOnce({});
    const deleted = await worker.fetch(request(cid), env);
    expect(deleted.status).toBe(404);
    expect(deleted.headers.get('cache-control')).toBe('no-store');
    env.CONTENT_BUCKET.head.mockResolvedValueOnce(null).mockResolvedValueOnce({});
    const disputed = await worker.fetch(request(cid), env);
    expect(disputed.status).toBe(451);
    expect(disputed.headers.get('cache-control')).toBe('no-store');
    const invalid = await worker.fetch(new Request('https://256t.us/invalid!'), env);
    expect(invalid.status).toBe(404);
    expect(invalid.headers.get('cache-control')).toBe('no-store');
    const unsupported = await worker.fetch(request(cid, { method: 'POST' }), env);
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('cache-control')).toBe('no-store');
  });
});
