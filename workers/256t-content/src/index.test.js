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
  afterEach(() => vi.useRealTimers());

  it('keeps stored content available after the per-IP download window resets', async () => {
    for (let index = 0; index < 30; index++) {
      const response = await worker.fetch(request(cid), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(payload);
      expect(response.headers.get('cache-control')).toContain('immutable');
    }
    const limited = await worker.fetch(request(cid), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.headers.get('access-control-expose-headers')).toBe('Retry-After');
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
