// Keep retry receipts out of the profile blob and expire them after one day.
const RETRY_MS = 86400000;
const PREFIX = 'download-lease:';
const EXPIRY_PREFIX = 'download-lease-expiry:';
const timestamp = value => String(value).padStart(16, '0');

export async function readDownloadLease(storage, budget, writes, id, now) {
  const lease = writes.get(id) || (Object.hasOwn(budget.leases, id) ? budget.leases[id] : await storage.get(`${PREFIX}${id}`));
  return lease && lease.expires_at + RETRY_MS > now ? lease : null;
}

export function downloadLeaseEntries(writes) {
  const entries = {};
  for (const [id, lease] of writes) {
    entries[`${PREFIX}${id}`] = lease;
    entries[`${EXPIRY_PREFIX}${timestamp(lease.expires_at + RETRY_MS)}:${id}`] = id;
  }
  return entries;
}

export async function pruneDownloadLeases(storage, now) {
  const expired = await storage.list({ prefix: EXPIRY_PREFIX, end: `${EXPIRY_PREFIX}${timestamp(now)};`, limit: 64 });
  const keys = [];
  for (const [index, id] of expired) {
    const lease = await storage.get(`${PREFIX}${id}`);
    // The same ID may have been reused after its retry window elapsed.
    if (lease && lease.expires_at + RETRY_MS <= now) keys.push(`${PREFIX}${id}`);
    keys.push(index);
  }
  if (keys.length) await storage.delete(keys); // At most 128 keys per batch.
  const first = await storage.list({ prefix: EXPIRY_PREFIX, limit: 1 });
  if (!first.size) return null;
  const expires = Number(first.keys().next().value.slice(EXPIRY_PREFIX.length).split(':')[0]);
  return Math.max(now + 1000, expires);
}
