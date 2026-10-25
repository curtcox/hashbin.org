const PREFIX = 'download-outbox:';
const BATCH_SIZE = 16;

// Include pending events in the same atomic put as the balance and receipts.
// The array remains only as a staging area and for migration of old profiles.
export function stageDownloadOutbox(profile, entries) {
  const capacity = Math.min(120, 128 - Object.keys(entries).length);
  const events = profile.download_outbox?.splice(0, capacity) || [];
  for (const event of events) entries[`${PREFIX}${String(event.sequence).padStart(16, '0')}`] = event;
  if (events.length) profile.download_outbox_pending = (profile.download_outbox_pending || 0) + events.length;
}

export function hasDownloadOutbox(profile) {
  return Boolean(profile?.download_outbox_pending || profile?.download_outbox?.length);
}

async function deliver(owner, event) {
  let namespace, name, path, body;
  if (event.transaction) {
    namespace = owner.env.PAYMENT_RECORDS; name = event.user_id;
    path = '/transaction'; body = event.transaction;
  } else if (event.revenue_cents !== undefined) {
    namespace = owner.env.PLATFORM_STATS; name = 'global';
    path = '/download-revenue'; body = event;
  }
  if (!namespace) throw new Error('Download accounting bindings unavailable');
  const response = await namespace.get(namespace.idFromName(name)).fetch(new Request(`https://internal${path}`, {
    method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
  }));
  if (!response.ok) throw new Error('Download accounting unavailable');
}

export async function flushDownloadOutbox(owner) {
  const profile = await owner.state.storage.get('profile');
  if (!profile) return false;
  if (profile.download_outbox?.length) {
    const entries = { profile };
    stageDownloadOutbox(profile, entries);
    await owner.state.storage.put(entries);
  }
  const rows = await owner.state.storage.list({ prefix: PREFIX, limit: BATCH_SIZE });
  const delivered = [];
  const started = Date.now();
  let failure;
  try {
    for (const [key, event] of rows) {
      // Leave room for account requests between batches, even with slow sinks.
      if (delivered.length && Date.now() - started >= 1000) break;
      await deliver(owner, event);
      delivered.push(key);
    }
  } catch (error) { failure = error; }
  if (delivered.length) {
    const updated = { ...profile, download_outbox_pending: Math.max(0, (profile.download_outbox_pending || 0) - delivered.length) };
    // A failed acknowledgement leaves the events queued for idempotent replay.
    await owner.state.storage.transaction(async storage => {
      await storage.delete(delivered);
      await storage.put('profile', updated);
    });
    profile.download_outbox_pending = updated.download_outbox_pending;
  }
  if (failure) throw failure;
  return hasDownloadOutbox(profile);
}
