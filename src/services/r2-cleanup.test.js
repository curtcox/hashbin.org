import { describe, expect, it, vi } from 'vitest';
import { cleanupPendingR2Deletions } from './r2-cleanup.js';
import { DeletionRecord } from '../durable-objects/deletion-record.js';

function createStorage() {
  const data = new Map();
  return {
    data,
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
    async delete(keys) { for (const key of [].concat(keys)) data.delete(key); },
    async list({ prefix = '', end, limit = Infinity } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix) && (!end || k < end)).sort();
      return new Map(keys.slice(0, limit).map(k => [k, data.get(k)]));
    }
  };
}

function setup() {
  const record = new DeletionRecord({ storage: createStorage() }, {});
  const r2Deleted = [];
  const env = {
    DELETION_RECORD: { idFromName: () => 'global', get: () => record },
    CONTENT_BUCKET: { delete: vi.fn(async () => undefined) },
    CONTENT_METADATA: {
      idFromName: name => name,
      get: name => ({ fetch: async () => { r2Deleted.push(name); return new Response('{}'); } })
    }
  };
  return { record, env, r2Deleted };
}

async function queue(record, cid) {
  await record.fetch(new Request('http://internal/pending', { method: 'POST', body: JSON.stringify({ hash_256t: cid }) }));
}

describe('cleanupPendingR2Deletions', () => {
  it('waits 24 hours, then removes the R2 objects and dequeues', async () => {
    const { record, env, r2Deleted } = setup();
    await queue(record, 'cidA');

    // Too soon: nothing happens
    expect(await cleanupPendingR2Deletions(env, new Date())).toEqual({ cleaned: 0, failed: 0 });
    expect(env.CONTENT_BUCKET.delete).not.toHaveBeenCalled();

    // A day later the bytes and sidecars go; the .deleted marker stays
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await cleanupPendingR2Deletions(env, later)).toEqual({ cleaned: 1, failed: 0 });
    expect(env.CONTENT_BUCKET.delete).toHaveBeenCalledWith(['cidA', 'cidA.meta', 'cidA.disputed']);
    expect(r2Deleted).toEqual(['cidA']);

    // Dequeued: a second run does nothing
    expect(await cleanupPendingR2Deletions(env, later)).toEqual({ cleaned: 0, failed: 0 });
  });

  it('keeps failed items queued for the next run', async () => {
    const { record, env } = setup();
    await queue(record, 'cidB');
    env.CONTENT_BUCKET.delete.mockRejectedValueOnce(new Error('R2 down'));

    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await cleanupPendingR2Deletions(env, later)).toEqual({ cleaned: 0, failed: 1 });
    expect(await cleanupPendingR2Deletions(env, later)).toEqual({ cleaned: 1, failed: 0 });
  });
});
