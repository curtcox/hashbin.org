import { describe, expect, it } from 'vitest';
import { BackupIndex } from './backup-index.js';
import { handleBackupRequest, registerForBackup } from '../utils/backup.js';
import { handleRestoreObject } from '../api/admin-backups.js';

/** In-memory stand-in for DurableObjectStorage (KV API subset used here) */
function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  let alarm = null;
  return {
    data,
    get alarm() { return alarm; },
    async get(key) { return data.get(key); },
    async put(keyOrEntries, value) {
      if (typeof keyOrEntries === 'string') data.set(keyOrEntries, value);
      else for (const [k, v] of Object.entries(keyOrEntries)) data.set(k, v);
    },
    async delete(key) { return data.delete(key); },
    async deleteAll() { data.clear(); },
    async list({ prefix = '', limit = Infinity, startAfter } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix) && (!startAfter || k > startAfter)).sort();
      return new Map(keys.slice(0, limit).map(k => [k, data.get(k)]));
    },
    async setAlarm(time) { alarm = time; }
  };
}

/** Namespace of objects that only answer the backup/restore paths */
function createNamespace(objects = {}) {
  const states = new Map();
  const stateFor = name => {
    if (!states.has(name)) states.set(name, { storage: createStorage(objects[name] || {}) });
    return states.get(name);
  };
  return {
    states,
    stateFor,
    idFromName: name => name,
    get: name => ({ fetch: async request => (await handleBackupRequest(stateFor(name), request)) || new Response('nope', { status: 404 }) })
  };
}

function createBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) { objects.set(key, String(value)); },
    async get(key) {
      return objects.has(key) ? { body: objects.get(key), httpMetadata: {} } : null;
    },
    async list({ prefix = '', delimiter } = {}) {
      const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
      if (delimiter) {
        const prefixes = [...new Set(keys.map(k => prefix + k.slice(prefix.length).split(delimiter)[0] + delimiter))];
        return { objects: [], delimitedPrefixes: prefixes, truncated: false };
      }
      return { objects: keys.map(key => ({ key, size: objects.get(key).length })), truncated: false };
    },
    async delete(keys) { for (const key of [].concat(keys)) objects.delete(key); }
  };
}

async function runSnapshotToCompletion(index, state) {
  await index.fetch(new Request('https://backup-index/snapshot/start', { method: 'POST' }));
  for (let i = 0; i < 100 && (await state.storage.get('run')); i++) {
    await index.alarm();
  }
}

describe('handleBackupRequest', () => {
  it('exports all keys except the registration flag', async () => {
    const state = { storage: createStorage({ profile: { user_id: 'u1', balance_cents: 500 }, __backup_registered: true }) };
    const response = await handleBackupRequest(state, new Request('https://x/__backup'));
    expect(await response.json()).toEqual({ entries: { profile: { user_id: 'u1', balance_cents: 500 } } });
  });

  it('refuses to restore over existing data unless overwrite is set', async () => {
    const state = { storage: createStorage({ profile: { user_id: 'u1', balance_cents: 1 } }) };
    const body = { entries: { profile: { user_id: 'u1', balance_cents: 500 } } };
    const refused = await handleBackupRequest(state, new Request('https://x/__restore', { method: 'POST', body: JSON.stringify(body) }));
    expect(refused.status).toBe(409);

    const restored = await handleBackupRequest(state, new Request('https://x/__restore', { method: 'POST', body: JSON.stringify({ ...body, overwrite: true }) }));
    expect(restored.status).toBe(200);
    expect(state.storage.data.get('profile').balance_cents).toBe(500);
  });

  it('ignores other paths', async () => {
    const state = { storage: createStorage() };
    expect(await handleBackupRequest(state, new Request('https://x/profile'))).toBeNull();
  });
});

describe('BackupIndex snapshot', () => {
  function setup() {
    const users = { u1: { profile: { user_id: 'u1', balance_cents: 1200 } }, u2: { profile: { user_id: 'u2', balance_cents: 0 } } };
    const env = {
      USER_PROFILES: createNamespace(users),
      PAYMENT_RECORDS: createNamespace({ u1: { transactions: ['t1'], 'tx:t1': { amount_cents: 1200 } } }),
      CONTENT_METADATA: createNamespace({ cidA: { content: { hash_256t: 'cidA' } }, cidB: { content: { hash_256t: 'cidB' } } }),
      DISPUTE_RECORD: createNamespace(),
      SUPPLIER_REGISTRY: createNamespace(),
      DELETION_RECORD: createNamespace({ global: { deletions: [], stats: { total_deletions: 0 } } }),
      EXPIRATION_INDEX: createNamespace({ global: { '2026-11-07': ['cidA', 'cidB'] } }),
      BACKUP_BUCKET: createBucket()
    };
    const state = { storage: createStorage() };
    env.BACKUP_INDEX = { idFromName: () => 'global', get: () => index };
    const index = new BackupIndex(state, env);
    return { env, state, index };
  }

  it('registers objects and snapshots every indexed and singleton object to R2', async () => {
    const { env, state, index } = setup();

    // Objects register themselves on first access
    for (const name of ['u1', 'u2']) {
      await registerForBackup(env.USER_PROFILES.stateFor(name), env, 'USER_PROFILES', name);
    }
    await registerForBackup(env.CONTENT_METADATA.stateFor('cidA'), env, 'CONTENT_METADATA', 'cidA');

    await runSnapshotToCompletion(index, state);

    const lastRun = await state.storage.get('last_run');
    expect(lastRun.complete).toBe(true);
    // cidB never registered itself; it is picked up from the ExpirationIndex
    expect(lastRun.counts).toMatchObject({ USER_PROFILES: 2, CONTENT_METADATA: 2, PAYMENT_RECORDS: 1, SINGLETONS: 2 });

    const keys = [...env.BACKUP_BUCKET.objects.keys()];
    expect(keys).toContain(`snapshots/${lastRun.id}/manifest.json`);
    const userFile = keys.find(k => k.includes('/USER_PROFILES/'));
    const lines = env.BACKUP_BUCKET.objects.get(userFile).trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(l => l.name).sort()).toEqual(['u1', 'u2']);
    expect(lines.find(l => l.name === 'u1').entries.profile.balance_cents).toBe(1200);
    // Missing singleton bindings are recorded as failures, not crashes
    expect(lastRun.failed).toBeGreaterThan(0);
  });

  it('refuses to start a second run while one is in progress', async () => {
    const { index } = setup();
    await index.fetch(new Request('https://backup-index/snapshot/start', { method: 'POST' }));
    const second = await index.fetch(new Request('https://backup-index/snapshot/start', { method: 'POST' }));
    expect(second.status).toBe(409);
  });

  it('restores an object through the admin endpoint and re-indexes it', async () => {
    const { env, state, index } = setup();
    env.ADMIN_SECRET_TOKEN = 'a'.repeat(64);
    const request = new Request('https://hashbin.test/api/admin/restore', {
      method: 'POST',
      headers: { 'X-Admin-Token': 'a'.repeat(64) },
      body: JSON.stringify({ binding: 'USER_PROFILES', name: 'u9', entries: { profile: { user_id: 'u9', balance_cents: 42 } } })
    });

    const response = await handleRestoreObject(request, env);
    expect(response.status).toBe(200);
    expect(env.USER_PROFILES.stateFor('u9').storage.data.get('profile').balance_cents).toBe(42);
    expect(state.storage.data.has('idx:USER_PROFILES:u9')).toBe(true);
    expect(index).toBeDefined();
  });

  it('rejects restores to unknown bindings', async () => {
    const { env } = setup();
    env.ADMIN_SECRET_TOKEN = 'a'.repeat(64);
    const request = new Request('https://hashbin.test/api/admin/restore', {
      method: 'POST',
      headers: { 'X-Admin-Token': 'a'.repeat(64) },
      body: JSON.stringify({ binding: 'BACKUP_BUCKET', name: 'x', entries: {} })
    });
    expect((await handleRestoreObject(request, env)).status).toBe(400);
  });
});
