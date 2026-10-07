/**
 * Admin Backup API
 * Snapshot status, on-demand runs, snapshot file access, and restore.
 * All endpoints require X-Admin-Token. See docs/backup-and-restore.md.
 */

import { requireAdmin } from '../auth/admin.js';
import { INDEXED_BINDINGS, RESTORABLE_BINDINGS, RESTORE_PATH } from '../utils/backup.js';

const RUN_ID_PATTERN = /^[0-9T-]+Z$/;

function backupIndex(env) {
  return env.BACKUP_INDEX.get(env.BACKUP_INDEX.idFromName('global'));
}

/**
 * GET /api/admin/backups
 * Last completed snapshot, any run in progress, and index sizes
 */
export async function handleGetBackupStatus(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  const index = backupIndex(env);
  const [status, counts] = await Promise.all([
    index.fetch(new Request('https://backup-index/snapshot/status')).then(r => r.json()),
    index.fetch(new Request('https://backup-index/count')).then(r => r.json())
  ]);
  return Response.json({ ...status, indexed: counts.counts });
}

/**
 * POST /api/admin/backups/run
 * Start a snapshot now (it also runs nightly from the cron trigger)
 */
export async function handleRunBackup(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  return backupIndex(env).fetch(new Request('https://backup-index/snapshot/start', { method: 'POST' }));
}

/**
 * GET /api/admin/backups/{run_id}/files
 * List the files in one snapshot
 */
export async function handleListBackupFiles(request, env, runId) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;
  if (!RUN_ID_PATTERN.test(runId)) {
    return Response.json({ error: 'INVALID_RUN_ID' }, { status: 400 });
  }

  const files = [];
  let cursor;
  do {
    const listing = await env.BACKUP_BUCKET.list({ prefix: `snapshots/${runId}/`, cursor });
    files.push(...listing.objects.map(object => ({ key: object.key, size: object.size })));
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return Response.json({ run_id: runId, files });
}

/**
 * GET /api/admin/backups/file?key=snapshots/...
 * Download one snapshot file
 */
export async function handleGetBackupFile(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key.startsWith('snapshots/') || key.includes('..')) {
    return Response.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  const object = await env.BACKUP_BUCKET.get(key);
  if (!object) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return new Response(object.body, {
    headers: { 'content-type': object.httpMetadata?.contentType || 'application/octet-stream' }
  });
}

/**
 * POST /api/admin/restore
 * Body: { binding, name, entries, overwrite? } (one line of a snapshot file)
 * Writes the entries into that Durable Object. Refuses to overwrite existing data
 * unless overwrite is true.
 */
export async function handleRestoreObject(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  const { binding, name, entries, overwrite = false } = await request.json();
  if (!RESTORABLE_BINDINGS.has(binding) || !env[binding]) {
    return Response.json({ error: 'INVALID_BINDING' }, { status: 400 });
  }
  if (typeof name !== 'string' || !name || !entries || typeof entries !== 'object') {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const stub = env[binding].get(env[binding].idFromName(name));
  const response = await stub.fetch(new Request(`https://restore${RESTORE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries, overwrite: overwrite === true })
  }));

  // Re-index restored objects so the next snapshot includes them even if the index was lost
  if (response.ok && INDEXED_BINDINGS.includes(binding)) {
    await backupIndex(env).fetch(new Request('https://backup-index/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ binding, name })
    }));
  }
  return response;
}
