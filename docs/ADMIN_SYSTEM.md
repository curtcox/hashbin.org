# Admin System Setup and Usage

## Overview

The HashBin.org admin system provides comprehensive monitoring and management capabilities for platform administrators. The system includes statistics tracking, alerting, audit logging, and data export functionality.

## Setup

### 1. Generate Admin Token

The admin system uses a single secret token for authentication. Generate a secure 64-character hex token:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32
```

### 2. Add Token to Cloudflare

Add the token as a Cloudflare secret:

```bash
# For production
wrangler secret put ADMIN_SECRET_TOKEN

# When prompted, paste your generated token
```

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

All admin endpoints require the `X-Admin-Token` header with a valid token.

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

## Usage Examples

### Using curl

```bash
# Set your admin token
ADMIN_TOKEN="your-64-char-hex-token-here"

# Get platform statistics
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://hashbin.org/api/admin/stats

# Get financial details
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://hashbin.org/api/admin/stats/financial

# List active critical alerts
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://hashbin.org/api/admin/alerts?severity=critical&status=active"

# Acknowledge an alert
curl -X POST \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"acknowledged_by":"admin"}' \
  https://hashbin.org/api/admin/alerts/alert_abc123/acknowledge

# View recent audit log
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://hashbin.org/api/admin/audit-log?limit=50"

# Export audit log as CSV
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://hashbin.org/api/admin/export?type=audit" \
  > audit-export.csv
```

### Using JavaScript

```javascript
const ADMIN_TOKEN = 'your-64-char-hex-token-here';

async function getStats() {
  const response = await fetch('https://hashbin.org/api/admin/stats', {
    headers: {
      'X-Admin-Token': ADMIN_TOKEN
    }
  });
  return await response.json();
}

async function listAlerts() {
  const response = await fetch(
    'https://hashbin.org/api/admin/alerts?status=active',
    {
      headers: {
        'X-Admin-Token': ADMIN_TOKEN
      }
    }
  );
  return await response.json();
}
```

## Security Considerations

1. **Token Storage**: Store the admin token securely. Never commit it to version control.

2. **Token Rotation**: If the token is compromised, immediately rotate it via Cloudflare dashboard:
   ```bash
   wrangler secret put ADMIN_SECRET_TOKEN
   ```

3. **Access Logging**: All admin actions are automatically logged in the audit log.

4. **HTTPS Only**: Admin endpoints should only be accessed over HTTPS in production.

5. **Single Admin**: The system supports exactly one administrator. There is no programmatic way to add or remove admin accounts.

## Testing

Run the admin endpoint tests:

```bash
# Local testing (requires local dev server running)
ADMIN_TOKEN="test-admin-token-for-local-dev-only" \
  BASE_URL="http://localhost:8787" \
  bash scripts/test-admin-endpoints.sh
```

## Monitoring Dashboard (Future)

A web-based admin dashboard UI is planned for future implementation. For now, use the API endpoints directly with curl, Postman, or custom scripts.

## Troubleshooting

### 401 Unauthorized

- Verify the `X-Admin-Token` header is present
- Ensure the token matches the `ADMIN_SECRET_TOKEN` secret in Cloudflare
- Check that the secret was properly set: `wrangler secret list`

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
