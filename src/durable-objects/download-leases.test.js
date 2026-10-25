import { describe, it, expect } from 'vitest';
import { downloadLeaseEntries, readDownloadLease, pruneDownloadLeases } from './download-leases.js';

function storageFixture(entries = {}) {
  const values = new Map(Object.entries(entries));
  const storage = {
    get: async key => structuredClone(values.get(key)),
    list: async ({ prefix, end, limit }) => new Map([...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .filter(([key]) => key.startsWith(prefix) && (!end || key < end)).slice(0, limit)),
    delete: async keys => {
      expect(keys.length).toBeLessThanOrEqual(128);
      for (const key of keys) values.delete(key);
    }
  };
  return { values, storage };
}
const DAY = 86400000;
const budget = () => ({ leases: {} });

describe('download lease receipt retention', () => {
  it('retains outstanding and returned receipts for the full retry window', async () => {
    const lease = { expires_at: 100000, returned_at: '2026-10-25', identity: 'key:key' };
    const f = storageFixture(downloadLeaseEntries(new Map([['id', lease]])));
    expect(await readDownloadLease(f.storage, budget(), new Map(), 'id', 100000 + DAY - 1)).toEqual(lease);
    expect(await readDownloadLease(f.storage, budget(), new Map(), 'id', 100000 + DAY)).toBeNull();
    expect(await pruneDownloadLeases(f.storage, 100000 + DAY - 1)).toBe(100000 + DAY + 999);
    expect(f.values.size).toBe(2);
    expect(await pruneDownloadLeases(f.storage, 100000 + DAY)).toBeNull();
    expect(f.values.size).toBe(0);
  });

  it('prunes in bounded batches and schedules remaining expired rows promptly', async () => {
    const writes = new Map(Array.from({ length: 130 }, (_, i) => [`id-${i}`, { expires_at: 1000 }]));
    const f = storageFixture(downloadLeaseEntries(writes));
    const now = 1000 + DAY;
    expect(await pruneDownloadLeases(f.storage, now)).toBe(now + 1000);
    expect(f.values.size).toBe(132);
    await pruneDownloadLeases(f.storage, now);
    expect(f.values.size).toBe(4);
    expect(await pruneDownloadLeases(f.storage, now)).toBeNull();
  });

  it('preserves a new receipt when its old expiry index is swept', async () => {
    const f = storageFixture(downloadLeaseEntries(new Map([['reused', { expires_at: 1000 }]])));
    for (const [key, value] of Object.entries(downloadLeaseEntries(new Map([['reused', { expires_at: 2000 }]])))) f.values.set(key, value);
    expect(await pruneDownloadLeases(f.storage, 1000 + DAY)).toBe(2000 + DAY);
    expect(f.values.get('download-lease:reused')).toEqual({ expires_at: 2000 });
    expect(f.values.size).toBe(2);
  });
});
