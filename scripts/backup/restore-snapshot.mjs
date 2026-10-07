/**
 * Restore Durable Object state from a backup snapshot through the admin API.
 *
 * Usage:
 *   ADMIN_TOKEN=... node scripts/backup/restore-snapshot.mjs --run <run_id> [options]
 *
 * Options:
 *   --base-url <url>     API origin (default https://hashbin.org)
 *   --run <run_id>       Snapshot to restore (see GET /api/admin/backups)
 *   --binding <BINDING>  Only restore this namespace (e.g. USER_PROFILES)
 *   --name <name>        Only restore this object (e.g. a user ID or CID)
 *   --overwrite          Replace objects that already have data (default: skip them)
 *   --dry-run            List what would be restored without writing anything
 *
 * See docs/backup-and-restore.md.
 */

const args = process.argv.slice(2);
const option = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = name => args.includes(name);

const baseUrl = option('--base-url', 'https://hashbin.org').replace(/\/$/, '');
const runId = option('--run');
const onlyBinding = option('--binding');
const onlyName = option('--name');
const overwrite = flag('--overwrite');
const dryRun = flag('--dry-run');
const token = process.env.ADMIN_TOKEN;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  return response;
}

async function main() {
  if (!runId || !token) {
    fail('Usage: ADMIN_TOKEN=... node scripts/backup/restore-snapshot.mjs --run <run_id> [--binding B] [--name N] [--overwrite] [--dry-run] [--base-url URL]');
    return;
  }

  const listing = await api(`/api/admin/backups/${encodeURIComponent(runId)}/files`);
  if (!listing.ok) {
    fail(`Could not list snapshot ${runId}: HTTP ${listing.status} ${await listing.text()}`);
    return;
  }
  const { files } = await listing.json();
  const manifestFile = files.find(file => file.key.endsWith('/manifest.json'));
  if (!manifestFile) {
    fail(`Snapshot ${runId} has no manifest.json; it did not finish. Pick a completed run.`);
    return;
  }

  const totals = { restored: 0, skipped_existing: 0, failed: 0 };
  for (const file of files.filter(f => f.key.endsWith('.jsonl'))) {
    const fileBinding = file.key.split('/')[2];
    if (onlyBinding && fileBinding !== onlyBinding && fileBinding !== 'SINGLETONS') continue;

    const download = await api(`/api/admin/backups/file?key=${encodeURIComponent(file.key)}`);
    if (!download.ok) {
      console.error(`Download failed for ${file.key}: HTTP ${download.status}`);
      totals.failed += 1;
      continue;
    }

    for (const line of (await download.text()).split('\n')) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      if (onlyBinding && record.binding !== onlyBinding) continue;
      if (onlyName && record.name !== onlyName) continue;

      const label = `${record.binding}/${record.name} (${Object.keys(record.entries).length} keys)`;
      if (dryRun) {
        console.log(`would restore ${label}`);
        continue;
      }

      const response = await api('/api/admin/restore', {
        method: 'POST',
        body: JSON.stringify({ ...record, overwrite })
      });
      if (response.ok) {
        totals.restored += 1;
        console.log(`restored ${label}`);
      } else if (response.status === 409) {
        totals.skipped_existing += 1;
        console.log(`skipped ${label}: already has data (use --overwrite to replace)`);
      } else {
        totals.failed += 1;
        console.error(`FAILED ${label}: HTTP ${response.status} ${await response.text()}`);
      }
    }
  }

  console.log(JSON.stringify(totals));
  if (totals.failed > 0) process.exitCode = 1;
}

await main();
