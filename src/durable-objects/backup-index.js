/**
 * BackupIndex Durable Object (single 'global' instance)
 *
 * 1. Index: names of every per-entity Durable Object, registered on first access.
 * 2. Snapshot runner: copies every object's storage to BACKUP_BUCKET as JSONL,
 *    a batch per alarm so runs aren't bounded by one invocation's subrequest limit.
 *
 * Layout in R2:
 *   snapshots/{run_id}/{BINDING}/{part}.jsonl   one {binding, name, entries} per line
 *   snapshots/{run_id}/manifest.json            written last; complete: true
 */

import { DERIVED_BINDINGS, INDEXED_BINDINGS, SINGLETONS, BACKUP_PATH } from '../utils/backup.js';

const BATCH_SIZE = 50;
const KEEP_RUNS = 30;
const STALE_RUN_MS = 6 * 60 * 60 * 1000;
const MAX_RECORDED_ERRORS = 50;

const indexPrefix = binding => `idx:${binding}:`;

export class BackupIndex {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/register' && request.method === 'POST') {
        const { binding, name } = await request.json();
        if (!INDEXED_BINDINGS.includes(binding) || typeof name !== 'string' || !name) {
          return Response.json({ error: 'INVALID_REGISTRATION' }, { status: 400 });
        }
        await this.state.storage.put(`${indexPrefix(binding)}${name}`, 1);
        return Response.json({ registered: true });
      }

      if (url.pathname === '/count' && request.method === 'GET') {
        const counts = {};
        for (const binding of INDEXED_BINDINGS) {
          counts[binding] = (await this.state.storage.list({ prefix: indexPrefix(binding) })).size;
        }
        return Response.json({ counts });
      }

      if (url.pathname === '/snapshot/start' && request.method === 'POST') {
        return await this.startSnapshot();
      }

      if (url.pathname === '/snapshot/status' && request.method === 'GET') {
        return Response.json({
          running: (await this.state.storage.get('run')) || null,
          last_run: (await this.state.storage.get('last_run')) || null
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('BackupIndex error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  async startSnapshot() {
    const existing = await this.state.storage.get('run');
    if (existing && Date.now() - Date.parse(existing.started_at) < STALE_RUN_MS) {
      return Response.json({ error: 'ALREADY_RUNNING', run: existing }, { status: 409 });
    }

    const startedAt = new Date().toISOString();
    const run = {
      id: startedAt.replace(/[:.]/g, '-'),
      started_at: startedAt,
      queue: ['SINGLETONS', ...INDEXED_BINDINGS, ...Object.keys(DERIVED_BINDINGS)],
      position: 0,
      cursor: null,
      part: 0,
      counts: {},
      failed: 0,
      errors: []
    };
    await this.state.storage.put('run', run);
    await this.state.storage.setAlarm(Date.now());
    return Response.json({ started: true, run }, { status: 202 });
  }

  async alarm() {
    const run = await this.state.storage.get('run');
    if (!run) return;

    try {
      const binding = run.queue[run.position];
      if (!binding) {
        await this.finishSnapshot(run);
        return;
      }

      const done = binding === 'SINGLETONS'
        ? await this.snapshotSingletons(run)
        : await this.snapshotBatch(run, binding);

      if (done) {
        run.position += 1;
        run.cursor = null;
        run.part = 0;
      }
      await this.state.storage.put('run', run);
      await this.state.storage.setAlarm(Date.now() + 100);
    } catch (error) {
      // Keep going: record the failure and retry this step shortly
      console.error('Backup snapshot step failed:', error);
      this.recordError(run, 'step', run.queue[run.position], error);
      await this.state.storage.put('run', run);
      await this.state.storage.setAlarm(Date.now() + 30_000);
    }
  }

  async snapshotSingletons(run) {
    const lines = [];
    for (const [binding, name] of SINGLETONS) {
      const exported = await this.exportObject(run, binding, name);
      if (!exported) continue;
      lines.push(exported.line);
      if (binding === 'EXPIRATION_INDEX') {
        await this.backfillContentIndex(exported.entries);
      }
    }
    await this.writePart(run, 'SINGLETONS', lines);
    run.counts.SINGLETONS = lines.length;
    return true;
  }

  async snapshotBatch(run, binding) {
    const sourceBinding = DERIVED_BINDINGS[binding] || binding;
    const prefix = indexPrefix(sourceBinding);
    const listOptions = { prefix, limit: BATCH_SIZE };
    if (run.cursor) listOptions.startAfter = run.cursor;
    const keys = [...(await this.state.storage.list(listOptions)).keys()];

    const lines = [];
    for (const key of keys) {
      const exported = await this.exportObject(run, binding, key.slice(prefix.length));
      if (exported) lines.push(exported.line);
    }
    if (lines.length > 0) {
      await this.writePart(run, binding, lines);
      run.part += 1;
    }
    run.counts[binding] = (run.counts[binding] || 0) + lines.length;
    run.cursor = keys.length > 0 ? keys[keys.length - 1] : run.cursor;
    return keys.length < BATCH_SIZE;
  }

  async exportObject(run, binding, name) {
    const namespace = this.env[binding];
    if (!namespace) {
      this.recordError(run, binding, name, new Error('binding missing'));
      return null;
    }
    try {
      const response = await namespace.get(namespace.idFromName(name)).fetch(new Request(`https://backup${BACKUP_PATH}`));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { entries } = await response.json();
      if (Object.keys(entries).length === 0) return null;
      return { line: JSON.stringify({ binding, name, entries }), entries };
    } catch (error) {
      this.recordError(run, binding, name, error);
      return null;
    }
  }

  /**
   * Index every live CID listed in the ExpirationIndex (date → [cid]), so content
   * that predates the BackupIndex is backed up even if it is never accessed again
   */
  async backfillContentIndex(expirationEntries) {
    const additions = {};
    for (const cids of Object.values(expirationEntries)) {
      if (!Array.isArray(cids)) continue;
      for (const cid of cids) additions[`${indexPrefix('CONTENT_METADATA')}${cid}`] = 1;
    }
    const keys = Object.keys(additions);
    for (let i = 0; i < keys.length; i += 128) {
      const batch = {};
      for (const key of keys.slice(i, i + 128)) batch[key] = 1;
      await this.state.storage.put(batch);
    }
  }

  async writePart(run, binding, lines) {
    if (lines.length === 0) return;
    const key = `snapshots/${run.id}/${binding}/${String(run.part).padStart(5, '0')}.jsonl`;
    await this.env.BACKUP_BUCKET.put(key, `${lines.join('\n')}\n`, {
      httpMetadata: { contentType: 'application/x-ndjson' }
    });
  }

  recordError(run, binding, name, error) {
    run.failed += 1;
    if (run.errors.length < MAX_RECORDED_ERRORS) {
      run.errors.push({ binding, name, error: String(error?.message || error) });
    }
  }

  async finishSnapshot(run) {
    const manifest = {
      id: run.id,
      started_at: run.started_at,
      finished_at: new Date().toISOString(),
      counts: run.counts,
      failed: run.failed,
      errors: run.errors,
      complete: true
    };
    await this.env.BACKUP_BUCKET.put(`snapshots/${run.id}/manifest.json`, JSON.stringify(manifest, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
    await this.state.storage.put('last_run', manifest);
    await this.state.storage.delete('run');

    try {
      await this.pruneOldRuns();
    } catch (error) {
      console.error('Pruning old snapshots failed:', error);
    }
  }

  async pruneOldRuns() {
    const listing = await this.env.BACKUP_BUCKET.list({ prefix: 'snapshots/', delimiter: '/' });
    const runs = (listing.delimitedPrefixes || []).sort();
    for (const prefix of runs.slice(0, Math.max(0, runs.length - KEEP_RUNS))) {
      let cursor;
      do {
        const objects = await this.env.BACKUP_BUCKET.list({ prefix, cursor });
        const keys = objects.objects.map(object => object.key);
        if (keys.length > 0) await this.env.BACKUP_BUCKET.delete(keys);
        cursor = objects.truncated ? objects.cursor : undefined;
      } while (cursor);
    }
  }
}
