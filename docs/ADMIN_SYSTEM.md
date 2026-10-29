# Admin System Setup and Usage

## Overview

The HashBin.org admin system provides comprehensive monitoring and management capabilities for platform administrators. The system includes statistics tracking, alerting, audit logging, and data export functionality.

## Setup

### 1. Name the admin

Set `ADMIN_USER_ID` to the admin's Clerk user ID (shown as `user_id` by
`GET /api/auth/session` while signed in):

```bash
wrangler secret put ADMIN_USER_ID
```

That account's own sign-in holds every admin scope. Its API keys and app tokens do not.

### 2. Issue admin keys for scripts

Signed in as the admin, open **`/admin/keys.html`** (or `POST /api/admin/keys`) and issue a
key with only the admin scopes the script needs and an expiry of at most 90 days. Scripts
send it as `Authorization: ApiKey hba_…`. Admin keys are stored as hashes, cannot issue
other admin keys, and stop working if `ADMIN_USER_ID` changes.

| Scope | Endpoints |
|---|---|
| `admin:disputes` | `/api/admin/disputes*`, `/api/admin/repeat-infringers`, `/api/admin/actions` |
| `admin:takedown` | `POST /api/admin/content/{cid}/delete` |
| `admin:stats` | `/api/admin/stats*`, `/api/admin/health`, `/api/admin/alerts*`, `/api/admin/audit-log` |
| `admin:costs` | `/api/admin/costs*`, `/api/admin/profitability`, `/api/admin/cost-safety*` |
| `admin:backups` | `/api/admin/backups*` |
| `admin:restore` | `POST /api/admin/restore` |
| `admin:export` | `GET /api/admin/export` |
| `admin:accounts` | `POST /api/admin/accounts/move` (see `todo/clerk_remaining.md` CL13) |

### 3. Verify Durable Objects Migration

Ensure the new Durable Objects are deployed:

```bash
# Check wrangler.toml includes v3 migration
grep -A 2 "tag = \"v3\"" wrangler.toml

# Should show:
# [[migrations]]
# tag = "v3"
# new_sqlite_classes = ["PlatformStats", "AlertStore", "AuditLog"]
```

### 4. Deploy

Deploy the updated worker:

```bash
npm run deploy
```

## API Endpoints

Each admin endpoint needs its admin scope (table above): the admin's own session, or an
admin key with that scope. The examples use an admin key in `$ADMIN_KEY`.

### Platform Statistics

#### GET /api/admin/stats

Get aggregate platform statistics across all categories.

**Response:**
```json
{
  "timestamp": "2026-01-21T12:00:00Z",
  "period": "all_time",
  "content": {
    "total_files": 12500,
    "total_size_bytes": 5368709120,
    "inline_content_count": 850,
    "active_files": 11200,
    "total_downloads": 45000
  },
  "users": {
    "total_accounts": 1250,
    "active_accounts": 980,
    "deleted_accounts": 15
  },
  "financial": {
    "total_revenue_cents": 1500000,
    "total_deposits_cents": 1600000,
    "platform_balance_cents": 150000
  }
}
```

#### GET /api/admin/stats/financial

Detailed financial metrics and breakdowns.

**Response:**
```json
{
  "timestamp": "2026-01-21T12:00:00Z",
  "summary": {
    "total_revenue_cents": 1500000,
    "total_deposits_cents": 1600000,
    "net_revenue_cents": 1500000
  },
  "breakdown_by_type": {
    "upload_payment": { "count": 5200, "total_cents": 1200000 },
    "cid_extension": { "count": 350, "total_cents": 150000 },
    "donation_received": { "count": 120, "total_cents": 100000 }
  },
  "deposits": {
    "count": 640,
    "total_cents": 1600000,
    "average_cents": 2500
  }
}
```

#### GET /api/admin/stats/content

Content-specific statistics.

#### GET /api/admin/stats/users

User-specific statistics.

### Health Monitoring

#### GET /api/admin/health

Extended health check with response time metrics.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-21T12:00:00Z",
  "services": {
    "worker": "operational",
    "durable_objects": "operational",
    "r2": "operational",
    "clerk": "configured",
    "stripe": "configured"
  },
  "response_times": {
    "worker_ms": 1,
    "durable_objects_ms": 15,
    "r2_ms": 8,
    "total_ms": 24
  }
}
```

### Alerts

#### GET /api/admin/alerts

List system alerts with optional filtering.

**Query Parameters:**
- `severity` - Filter by severity (critical, warning)
- `status` - Filter by status (active, acknowledged, resolved)
- `limit` - Max results to return (default: 100)

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert_abc123",
      "type": "dispute_created",
      "severity": "critical",
      "title": "New Stripe Dispute Received",
      "message": "Dispute for payment pi_xyz789 - Amount: $10.00",
      "metadata": {
        "dispute_id": "dp_xyz",
        "payment_intent_id": "pi_xyz789",
        "amount_cents": 1000
      },
      "created_at": "2026-01-21T10:00:00Z",
      "acknowledged_at": null,
      "resolved_at": null
    }
  ],
  "count": 1
}
```

#### POST /api/admin/alerts/:id/acknowledge

Acknowledge an alert.

**Request Body:**
```json
{
  "acknowledged_by": "admin"
}
```

### Audit Log

#### GET /api/admin/audit-log

View audit log entries with filtering.

**Query Parameters:**
- `actor_type` - Filter by actor type (admin, system, user)
- `actor_id` - Filter by specific actor
- `action` - Filter by action type
- `resource_type` - Filter by resource type
- `start_date` - ISO 8601 date for range start
- `end_date` - ISO 8601 date for range end
- `limit` - Results per page (default: 100)
- `offset` - Offset for pagination (default: 0)

**Response:**
```json
{
  "entries": [
    {
      "id": "audit_abc123",
      "timestamp": "2026-01-21T10:00:00Z",
      "actor_type": "admin",
      "actor_id": "admin",
      "action": "view_stats",
      "resource_type": "platform_stats",
      "resource_id": "global",
      "metadata": {},
      "ip_address": null
    }
  ],
  "total": 50,
  "limit": 100,
  "offset": 0,
  "has_more": false
}
```

### Data Export

#### GET /api/admin/export

Export platform data in CSV format.

**Query Parameters:**
- `type` - Export type (required): `audit`, `transactions`, `users`, `content`
- `limit` - Max records to export (default: 1000)
- `offset` - Offset for pagination (default: 0)
- `start_date` - ISO 8601 date for range start (optional)
- `end_date` - ISO 8601 date for range end (optional)

**Response:**
CSV file download with appropriate headers.

**Rate Limit:** 1 export per minute (to be implemented)

## Alert Notifications

New alerts (stale or failed backups, repeat infringers, unusual deposit/upload rates) are pushed
to `ALERT_WEBHOOK_URL` when that secret is set (GitHub secret of the same name; CI publishes
it). The JSON body has `text` (Slack), `content` (Discord), and the full `alert`, so a Slack or
Discord incoming-webhook URL works as is; any other endpoint receives the same JSON. Duplicate
alerts of the same type within an hour aren't re-sent.

```bash
# Send a test notification
curl -X POST -H "Authorization: ApiKey $ADMIN_KEY" https://hashbin.org/api/admin/alerts/test
```

## Backups

Snapshot status, on-demand runs, and restores: see [backup-and-restore.md](backup-and-restore.md).

## Content Moderation (Disputes and Takedowns)

The easiest way is the moderation page, **`/admin/disputes.html`**: signed in as the admin (or
with the legacy token, kept only in that tab's session storage), review open disputes with reporter contact details, mark
them under review, deny them (content restored), or uphold them (content taken down). The
repeat-infringer list is on the same page. Everything below is the equivalent API.

The dispute endpoints need `admin:disputes` (takedowns `admin:takedown`): the admin's session
or an admin key with that scope.

```bash
# List open disputes, including reporter contact info
curl -H "Authorization: ApiKey $ADMIN_KEY" https://hashbin.org/api/admin/disputes

# Mark a dispute under review (content stays blocked with HTTP 451 on 256t.us)
curl -X PATCH -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"status":"under_review"}' https://hashbin.org/api/admin/disputes/{cid}

# Deny a dispute (content becomes available again)
curl -X PATCH -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"status":"closed_denied","resolution_reason":"Not infringing"}' \
  https://hashbin.org/api/admin/disputes/{cid}

# Uphold a dispute: same as taking the content down (below), with your reason on the dispute
curl -X PATCH -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"status":"closed_deleted","resolution_reason":"Infringes the reporter'"'"'s registered work"}' \
  https://hashbin.org/api/admin/disputes/{cid}

# Take content down (closes any open dispute, writes a public deletion record)
curl -X POST -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"reason":"DMCA notice upheld"}' https://hashbin.org/api/admin/content/{cid}/delete

# Review the moderation log
curl -H "Authorization: ApiKey $ADMIN_KEY" https://hashbin.org/api/admin/actions

# Accounts with repeated upheld copyright removals (defaults: 3 in 365 days)
curl -H "Authorization: ApiKey $ADMIN_KEY" "https://hashbin.org/api/admin/repeat-infringers?min=3&days=365"
```

Copyright disputes never expire: the content stays blocked until you deny or uphold. When the
designated agent receives a valid counter-notice (DMCA §3), forward it to the reporter and record
it; the nightly job restores the content 12 weekdays after receipt (`closed_restored`) unless you
record a reported court action first. Both buttons are on `/admin/disputes.html`, or:

```bash
# Counter-notice received (received_at defaults to now)
curl -X PATCH -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"action":"counter_notice","received_at":"2026-10-23T12:00:00Z"}' \
  https://hashbin.org/api/admin/disputes/{cid}

# The reporter says they filed a court action: cancel the scheduled restore
curl -X PATCH -H "Authorization: ApiKey $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"action":"court_action"}' https://hashbin.org/api/admin/disputes/{cid}
```

Upholding deletes the content for good, so a later counter-notice can't restore it.

Removing content while a **copyright** dispute is open records a strike against the uploader.
The nightly cron raises a `repeat_infringer` alert when any account reaches the threshold; close
those accounts per the DMCA policy (`frontend/dmca.html` §5).

### Intimate image reports (TAKE IT DOWN Act)

Reports with reason `ncii` (intimate image shared without consent) follow the process published
at `/take-it-down.html`. They differ from other disputes:

- **Deadline.** Each has a `removal_due_at` 48 hours after filing and never expires. Content is
  blocked (451) from the moment of the report, and stays blocked until you decide.
- **Alerts.** Filing raises a critical `ncii_report` alert. The hourly cron raises a critical
  `ncii_deadline` alert while any report is within 24 hours of its deadline or past it. Both name
  only the CID, so `ALERT_WEBHOOK_URL` needs to be set for them to reach you.
- **Deciding.** `/admin/disputes.html` lists these first, earliest deadline first, with the
  reporter's signature and whether they act for the person shown. Uphold (`closed_deleted`) a
  valid request: the law requires removal and doesn't ask you to decide whether consent was
  given. Deny only an invalid request, such as content that isn't an intimate image;
  denying makes the content public again. Never repeat the report's details in the public
  resolution reason.
- **Copies.** Identical files share a CID, so upholding removes every identical copy, and the
  same bytes can't be uploaded again (410). Edited or re-encoded copies have their own CIDs and
  need their own reports.
- **Privacy.** The public dispute API omits the explanation, links, statement and contact for
  these reports; only `GET /api/admin/disputes` returns them.
- **Other disputes.** An intimate image report replaces another open dispute on the same CID
  (that one closes as `closed_superseded`) and skips the 30-day re-report cooldown.
- **Minors.** An image of anyone under 18 is CSAM: uphold it and report it to NCMEC
  (`docs/legal-review.md` item 7).

## Usage Examples

### Using curl

```bash
# Set your admin token
ADMIN_KEY="hba_..."   # an admin key with the scopes you need

# Get platform statistics
curl -H "Authorization: ApiKey $ADMIN_KEY" \
  https://hashbin.org/api/admin/stats

# Get financial details
curl -H "Authorization: ApiKey $ADMIN_KEY" \
  https://hashbin.org/api/admin/stats/financial

# List active critical alerts
curl -H "Authorization: ApiKey $ADMIN_KEY" \
  "https://hashbin.org/api/admin/alerts?severity=critical&status=active"

# Acknowledge an alert
curl -X POST \
  -H "Authorization: ApiKey $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"acknowledged_by":"admin"}' \
  https://hashbin.org/api/admin/alerts/alert_abc123/acknowledge

# View recent audit log
curl -H "Authorization: ApiKey $ADMIN_KEY" \
  "https://hashbin.org/api/admin/audit-log?limit=50"

# Export audit log as CSV
curl -H "Authorization: ApiKey $ADMIN_KEY" \
  "https://hashbin.org/api/admin/export?type=audit" \
  > audit-export.csv
```

### Using JavaScript

```javascript
const ADMIN_KEY = 'hba_...'; // an admin key with admin:stats

async function getStats() {
  const response = await fetch('https://hashbin.org/api/admin/stats', {
    headers: {
      Authorization: `ApiKey ${ADMIN_KEY}`
    }
  });
  return await response.json();
}

async function listAlerts() {
  const response = await fetch(
    'https://hashbin.org/api/admin/alerts?status=active',
    {
      headers: {
        Authorization: `ApiKey ${ADMIN_KEY}`
      }
    }
  );
  return await response.json();
}
```

## Security Considerations

1. **Least privilege**: Give each script an admin key with only the scopes it needs and a short
   expiry. Revoke it at `/admin/keys.html` when it is no longer needed or may be exposed.

2. **No shared secret**: Admin access is the `ADMIN_USER_ID` sign-in or an admin key; there is
   no shared admin token (retired 2026-10-27).

3. **Access Logging**: All admin actions are automatically logged in the audit log.

4. **HTTPS Only**: Admin endpoints should only be accessed over HTTPS in production.

5. **Single Admin**: The system supports exactly one administrator, `ADMIN_USER_ID`. Changing it
   invalidates every admin key.

## Testing

Run the admin endpoint tests:

```bash
# Local testing (requires local dev server running)
ADMIN_KEY="hba_..." \
  BASE_URL="http://localhost:8787" \
  bash scripts/test-admin-endpoints.sh
```

## Monitoring Dashboard (Future)

A web-based admin dashboard UI is planned for future implementation. For now, use the API endpoints directly with curl, Postman, or custom scripts.

## Troubleshooting

### 401 Unauthorized

- Send the admin key as `Authorization: ApiKey hba_...`, and check it is unexpired and unrevoked
  at `/admin/keys.html` and holds the endpoint's scope
- Check that `ADMIN_USER_ID` is set (`wrangler secret list`); admin keys stop working if it changes

### Empty Statistics

- Statistics are tracked in real-time but start from zero after deployment
- Upload content, make deposits, etc. to populate statistics
- Scheduled snapshot jobs (not yet implemented) will compute historical aggregates

### Alerts Not Appearing

- Only dispute alerts are currently implemented
- Health check and anomaly detection alerts are planned for future implementation
- Check console logs for alert creation errors

## Future Enhancements

Planned features not yet implemented:

1. **Anomaly Detection**: Automated alerts for unusual patterns
2. **Scheduled Jobs**: Periodic snapshot computation and audit cleanup
3. **Health Check Alerts**: Automated alerts when services degrade
4. **Admin Dashboard UI**: Web interface for monitoring
5. **Export Rate Limiting**: Enforce 1 export per minute limit
6. **Full Export Types**: Complete implementation of transaction, user, and content exports
