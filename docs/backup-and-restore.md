# Backup and Restore

Content bytes live in R2 (`hashbin-content-256t-prod`), which Cloudflare stores durably. Everything
else (balances, payment history, content metadata, disputes, API keys, OAuth apps, deletion
records) lives in Durable Objects, which this system snapshots nightly to the
`hashbin-backups-prod` R2 bucket.

- **Recovery point:** up to 24 hours (nightly snapshot). Stripe's dashboard is an independent
  record of every deposit.
- **Retention:** the 30 most recent snapshots. Older ones are deleted when a run finishes.
- **Not covered:** a per-write event log (Decision #15's ≤1h RPO) is deferred (STATUS.md B8).

## How it works

Durable Objects can't be listed from a Worker, so each per-entity object registers its own name
with the `BackupIndex` Durable Object the first time it handles a request:

| Namespace | Named by | Registered by |
|-----------|----------|---------------|
| `USER_PROFILES` | user ID | the object itself |
| `PAYMENT_RECORDS` | user ID | enumerated from the `USER_PROFILES` index |
| `CONTENT_METADATA` | CID | the object itself, plus every CID in the `ExpirationIndex` each run |
| `DISPUTE_RECORD` | `dispute:{cid}` | the object itself |
| `SUPPLIER_REGISTRY` | supplier ID | the object itself |

Fixed-name objects (`KEY_REGISTRY`, `EXPIRATION_INDEX`, `DELETION_RECORD`, `DISPUTE_INDEX`,
`ADMIN_ACTION_LOG`, `APPLICATION_REGISTRY`, `AUDIT_LOG`, `INFRASTRUCTURE_COST`, `ALERT_STORE`,
`PLATFORM_STATS`) are always included. The list lives in `src/utils/backup.js`. **When you add a
new Durable Object class that holds state, add it there.**

The daily cron (`0 2 * * *`) starts a run. `BackupIndex` then processes 50 objects per alarm
invocation until it's done, so a run isn't limited by one invocation's subrequest budget. Each
object's whole storage is read through an internal `/__backup` path and written to R2:

```
snapshots/{run_id}/SINGLETONS/00000.jsonl
snapshots/{run_id}/USER_PROFILES/00000.jsonl     one {"binding","name","entries"} per line
snapshots/{run_id}/manifest.json                 written last: counts, failures, complete: true
```

If the last completed snapshot is more than 48 hours old or had failures, the cron raises a
`backup_unhealthy` critical alert (see `GET /api/admin/alerts`).

## Checking backups

```bash
ADMIN_TOKEN=...   # the ADMIN_SECRET_TOKEN secret

# Last completed run, any run in progress, and how many objects are indexed
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://hashbin.org/api/admin/backups

# Start a run now
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" https://hashbin.org/api/admin/backups/run

# List a run's files, and download one
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://hashbin.org/api/admin/backups/{run_id}/files
curl -H "X-Admin-Token: $ADMIN_TOKEN" "https://hashbin.org/api/admin/backups/file?key=snapshots/{run_id}/manifest.json"
```

`failed` in `last_run` should be 0. `errors` lists up to 50 objects that couldn't be read.

## Restoring

Restores go through `POST /api/admin/restore` one object at a time.
`scripts/backup/restore-snapshot.mjs` drives it from a snapshot. Only use completed runs (the
script refuses runs without a manifest).

```bash
export ADMIN_TOKEN=...

# 1. See what a restore would touch
node scripts/backup/restore-snapshot.mjs --run 2026-10-07T02-00-00-123Z --dry-run

# 2a. After total data loss: restore everything. Objects that already have data are skipped.
node scripts/backup/restore-snapshot.mjs --run 2026-10-07T02-00-00-123Z

# 2b. Roll back one object (for example one user's profile), replacing its current data
node scripts/backup/restore-snapshot.mjs --run 2026-10-07T02-00-00-123Z \
  --binding USER_PROFILES --name user_abc123 --overwrite
```

After restoring a user profile, check its balance against Stripe for deposits made after the
snapshot time, and against `PAYMENT_RECORDS` for that user. A restore replays storage as it
was at snapshot time, so anything written after the snapshot is lost for that object.

Use `--base-url http://localhost:8787` to rehearse against local dev
(`npx wrangler dev --config wrangler.local.toml --local --var ADMIN_SECRET_TOKEN:<64 hex chars>`).
