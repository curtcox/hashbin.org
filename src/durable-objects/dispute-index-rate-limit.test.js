import { describe, expect, it } from 'vitest';
import { DisputeIndex } from './dispute-index.js';

function createStorage() {
  const data = new Map();
  return {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
    async delete(keys) { for (const key of [].concat(keys)) data.delete(key); },
    async list({ prefix = '', end, limit = Infinity } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix) && (!end || k < end)).sort();
      return new Map(keys.slice(0, limit).map(k => [k, data.get(k)]));
    }
  };
}

const submit = (index, ipHash) => index.fetch(new Request('http://internal/rate-limit', {
  method: 'POST',
  body: JSON.stringify({ ip_hash: ipHash })
})).then(r => r.json());

describe('DisputeIndex submission rate limit', () => {
  it('allows 10 submissions per IP per hour, then refuses with a retry time', async () => {
    const index = new DisputeIndex({ storage: createStorage() }, {});
    for (let i = 0; i < 10; i++) {
      expect((await submit(index, 'ip-a')).allowed).toBe(true);
    }
    const refused = await submit(index, 'ip-a');
    expect(refused.allowed).toBe(false);
    expect(refused.retry_after_seconds).toBeGreaterThan(0);
    expect(refused.retry_after_seconds).toBeLessThanOrEqual(3600);

    // Other IPs are unaffected
    expect((await submit(index, 'ip-b')).allowed).toBe(true);
  });
});
