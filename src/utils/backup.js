/**
 * Durable Object backup helpers
 *
 * Durable Objects can't be enumerated from a Worker, so every per-entity object
 * (user, content, dispute, supplier) registers its name with the BackupIndex the
 * first time it is accessed. The nightly snapshot then walks that index.
 * See docs/backup-and-restore.md.
 */

export const BACKUP_PATH = '/__backup';
export const RESTORE_PATH = '/__restore';

// Storage key that marks an object as registered with the BackupIndex (never backed up)
const REGISTERED_FLAG = '__backup_registered';

// storage.put(entries) accepts at most 128 keys per call
const PUT_BATCH = 128;

/**
 * Per-entity namespaces, in snapshot order. PAYMENT_RECORDS objects are named by
 * user ID, so they are enumerated from the USER_PROFILES index.
 */
export const INDEXED_BINDINGS = ['USER_PROFILES', 'CONTENT_METADATA', 'DISPUTE_RECORD', 'SUPPLIER_REGISTRY'];
export const DERIVED_BINDINGS = { PAYMENT_RECORDS: 'USER_PROFILES' };

/** Fixed-name objects, backed up in full every run */
export const SINGLETONS = [
  ['KEY_REGISTRY', 'global'],
  ['EXPIRATION_INDEX', 'global'],
  ['DELETION_RECORD', 'global'],
  ['DISPUTE_INDEX', 'dispute-index:global'],
  ['ADMIN_ACTION_LOG', 'admin-action-log:global'],
  ['APPLICATION_REGISTRY', 'global'],
  ['AUDIT_LOG', 'global'],
  ['INFRASTRUCTURE_COST', 'global'],
  ['ALERT_STORE', 'global'],
  ['PLATFORM_STATS', 'global']
];

/** Every binding a snapshot may contain (and a restore may target) */
export const RESTORABLE_BINDINGS = new Set([
  ...INDEXED_BINDINGS,
  ...Object.keys(DERIVED_BINDINGS),
  ...SINGLETONS.map(([binding]) => binding)
]);

/**
 * Serve the internal backup/restore paths for a Durable Object.
 * Only reachable from Worker code: no route forwards external requests to a DO.
 * @param {DurableObjectState} state - Durable Object state
 * @param {Request} request - Incoming request
 * @returns {Promise<Response|null>} Response, or null if the path isn't a backup path
 */
export async function handleBackupRequest(state, request) {
  const { pathname } = new URL(request.url);

  if (pathname === BACKUP_PATH && request.method === 'GET') {
    const entries = Object.fromEntries(await state.storage.list());
    delete entries[REGISTERED_FLAG];
    return Response.json({ entries });
  }

  if (pathname === RESTORE_PATH && request.method === 'POST') {
    const { entries, overwrite = false } = await request.json();
    if (!entries || typeof entries !== 'object') {
      return Response.json({ error: 'ENTRIES_REQUIRED' }, { status: 400 });
    }

    const existing = await state.storage.list({ limit: 2 });
    const hasData = [...existing.keys()].some(key => key !== REGISTERED_FLAG);
    if (hasData && !overwrite) {
      return Response.json({ error: 'NOT_EMPTY', message: 'Object already has data; pass overwrite: true to replace it' }, { status: 409 });
    }
    if (hasData) {
      await state.storage.deleteAll();
    }

    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += PUT_BATCH) {
      const batch = {};
      for (const key of keys.slice(i, i + PUT_BATCH)) batch[key] = entries[key];
      await state.storage.put(batch);
    }
    return Response.json({ restored: keys.length });
  }

  return null;
}

/**
 * Record this object's name in the BackupIndex once (idempotent, best effort)
 * @param {DurableObjectState} state - Durable Object state
 * @param {Object} env - Environment bindings
 * @param {string} binding - Binding name of this object's namespace
 * @param {string} name - Name this object was created with (idFromName)
 * @returns {Promise<boolean>} True once the object is registered
 */
export async function registerForBackup(state, env, binding, name) {
  if (!name || !env?.BACKUP_INDEX) return false;
  if (await state.storage.get(REGISTERED_FLAG)) return true;

  try {
    const stub = env.BACKUP_INDEX.get(env.BACKUP_INDEX.idFromName('global'));
    const response = await stub.fetch(new Request('https://backup-index/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ binding, name })
    }));
    if (!response.ok) return false;
    await state.storage.put(REGISTERED_FLAG, true);
    return true;
  } catch (error) {
    // Retried on the next access
    console.error(`Backup registration failed for ${binding}/${name}:`, error);
    return false;
  }
}
