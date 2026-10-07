/**
 * R2 cleanup for soft-deleted content
 *
 * Deleting content (uploader or admin) soft-deletes its metadata, writes a
 * `{cid}.deleted` marker (so 256t.us stops serving it immediately), and queues the
 * CID in the DeletionRecord. Once an entry is older than the retention window, this
 * job removes the stored bytes and sidecar objects from R2. The `.deleted` marker
 * stays so the content keeps answering 404 and can't be resurrected.
 */

export const R2_CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;
// Each item costs ~2 subrequests (R2 batch delete + metadata update); stay well
// under the per-invocation limit alongside the other cron tasks. Leftovers run tomorrow.
export const R2_CLEANUP_BATCH = 200;

/**
 * @param {Object} env - Environment bindings
 * @param {Date} [now] - Current time (for tests)
 * @returns {Promise<{cleaned: number, failed: number}>} Counts
 */
export async function cleanupPendingR2Deletions(env, now = new Date()) {
  const deletionRecord = env.DELETION_RECORD.get(env.DELETION_RECORD.idFromName('global'));
  const before = new Date(now.getTime() - R2_CLEANUP_DELAY_MS).toISOString();

  const response = await deletionRecord.fetch(
    new Request(`http://internal/pending?before=${encodeURIComponent(before)}&limit=${R2_CLEANUP_BATCH}`)
  );
  const { pending = [] } = await response.json();

  const done = [];
  let failed = 0;
  for (const entry of pending) {
    const cid = entry.hash_256t;
    try {
      await env.CONTENT_BUCKET.delete([cid, `${cid}.meta`, `${cid}.disputed`]);
      const metadata = env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(cid));
      await metadata.fetch(new Request('http://internal/r2-deleted', { method: 'POST' }));
      done.push(entry.key);
    } catch (error) {
      failed++;
      console.error(`R2 cleanup failed for ${cid}:`, error);
    }
  }

  if (done.length > 0) {
    await deletionRecord.fetch(new Request('http://internal/pending/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys: done })
    }));
  }

  return { cleaned: done.length, failed };
}
