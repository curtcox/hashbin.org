# System Management Plan

## Overview

This document plans the system management functionality that enables administrators to monitor, manage, and maintain the HashBin.org platform. The goal is to provide comprehensive visibility into system health, financial metrics, platform statistics, and operational alerts.

## User Stories (from user_stories.md)

### Platform Administrators - System Management
- [UI: N/A | API: ✅] **As an administrator**, I would like to monitor system health across all components so that I can ensure uptime.
- [UI: N/A | API: ✅] **As an administrator**, I would like to track financial metrics (revenue, costs, profit) so that the platform is sustainable.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to see aggregate platform statistics so that I can understand usage patterns.
- [UI: 📋 | API: 📋] **As an administrator**, I would like alerts for unusual activity so that I can respond to issues proactively.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to export data for transparency so that operations remain auditable.

### System Operations - Monitoring & Observability
- [UI: N/A | API: ✅] **As the system**, I would like to log authentication failures so that security issues can be investigated.
- [UI: N/A | API: ✅] **As the system**, I would like to track API key last-used timestamps so that inactive keys can be identified.
- [UI: N/A | API: ✅] **As the system**, I would like to expose health check endpoints so that monitoring systems can verify status.
- [UI: N/A | API: 📋] **As the system**, I would like to emit metrics for all operations so that performance can be analyzed.
- [UI: N/A | API: 📋] **As the system**, I would like to alert on anomalies so that issues can be addressed promptly.

---

## Current Implementation Status

### Implemented ✅

1. **Health Endpoint** (`GET /health`)
   - Worker status validation
   - Environment configuration checks
   - Durable Object connectivity tests (6 DOs)
   - R2 bucket access validation
   - Clerk and Stripe integration status
   - Returns structured JSON with operational/degraded/down status

2. **Financial Data Tracking**
   - PaymentRecord DO stores all transactions (deposits, uploads, donations, rate limit purchases)
   - UserProfile DO tracks balance_cents, total_deposited_cents, total_spent_cents
   - `GET /api/balance/history` provides transaction history per user

3. **API Key Tracking**
   - last_used_at timestamps updated on each authentication attempt
   - usage_count tracked per key
   - Reveal timestamps for rate limiting

4. **Basic Logging**
   - Console logging for deposits, disputes, webhooks, errors
   - LOG_LEVEL environment variable (debug, info, warn, error)

### Not Implemented ❌

1. **Admin API endpoints** - No dedicated admin endpoints exist
2. **Aggregate statistics** - No platform-wide stats collection
3. **Alerting system** - No email/webhook notifications
4. **Metrics emission** - No structured metrics (Prometheus, StatsD)
5. **Admin dashboard UI** - No UI for system monitoring
6. **Data export** - No bulk export functionality
7. **Anomaly detection** - No threshold-based alerting

---

## Feature Specification

### Admin Role & Authentication

**Decision:** Separate admin authentication system (single admin only).

The platform has exactly one administrator. Admin access is controlled via a dedicated admin secret token stored as a Cloudflare secret, independent of the Clerk user system.

```javascript
// Cloudflare secret: ADMIN_SECRET_TOKEN
// Format: A cryptographically secure token (e.g., 64-character hex string)
// Example: "a1b2c3d4e5f6..." (generated via crypto.randomBytes(32).toString('hex'))
```

Admin endpoints require:
1. Valid `X-Admin-Token` header matching `ADMIN_SECRET_TOKEN`
2. No Clerk session or API key required (admin auth is independent)

**Important constraints:**
- There is exactly ONE admin - no concept of multiple admins
- Admin accounts cannot be added or removed programmatically
- Admin deletion is not allowed
- The admin token must be rotated manually via Cloudflare dashboard if compromised

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Aggregate platform statistics |
| GET | `/api/admin/stats/financial` | Financial metrics summary |
| GET | `/api/admin/stats/content` | Content statistics summary |
| GET | `/api/admin/stats/users` | User statistics summary |
| GET | `/api/admin/health` | Extended health check with metrics |
| GET | `/api/admin/export` | Export platform data (paginated) |
| GET | `/api/admin/alerts` | View current alerts |
| POST | `/api/admin/alerts/:id/acknowledge` | Acknowledge an alert |
| GET | `/api/admin/audit-log` | View audit log entries |

### Statistics Data Model

#### Platform Statistics (`GET /api/admin/stats`)

```json
{
  "timestamp": "2026-01-17T12:00:00Z",
  "period": "all_time",
  "content": {
    "total_files": 12500,
    "total_size_bytes": 5368709120,
    "inline_content_count": 850,
    "active_files": 11200,
    "expired_files": 1300,
    "expiring_soon_count": 45
  },
  "users": {
    "total_accounts": 1250,
    "active_accounts": 980,
    "deleted_accounts": 15,
    "accounts_with_balance": 450
  },
  "financial": {
    "total_revenue_cents": 1500000,
    "total_deposits_cents": 1600000,
    "total_spent_cents": 1450000,
    "platform_balance_cents": 150000,
    "average_deposit_cents": 2500
  },
  "api_keys": {
    "total_created": 320,
    "active_keys": 280,
    "revoked_keys": 40
  },
  "rate_limits": {
    "total_purchases": 150,
    "total_revenue_cents": 25000
  }
}
```

#### Financial Metrics (`GET /api/admin/stats/financial`)

```json
{
  "timestamp": "2026-01-17T12:00:00Z",
  "summary": {
    "total_revenue_cents": 1500000,
    "total_deposits_cents": 1600000,
    "total_refunds_cents": 0,
    "net_revenue_cents": 1500000
  },
  "breakdown_by_type": {
    "upload_payment": { "count": 5200, "total_cents": 1200000 },
    "cid_extension": { "count": 350, "total_cents": 150000 },
    "donation_received": { "count": 120, "total_cents": 100000 },
    "rate_limit_purchase": { "count": 150, "total_cents": 50000 }
  },
  "deposits": {
    "count": 640,
    "total_cents": 1600000,
    "average_cents": 2500,
    "min_cents": 100,
    "max_cents": 50000
  },
  "disputes": {
    "total_count": 2,
    "pending_count": 1,
    "resolved_count": 1
  },
  "recent_transactions": [
    {
      "id": "txn_abc123",
      "type": "deposit",
      "amount_cents": 1000,
      "created_at": "2026-01-17T11:30:00Z"
    }
  ]
}
```

### Alerting System

**Decisions:**
- Storage: Dedicated `AlertStore` Durable Object
- Notifications: In-app alerts only (no external email/webhook)

#### Alert Types

| Alert Type | Trigger Condition | Severity |
|------------|-------------------|----------|
| `health_degraded` | Any health check returns degraded | warning |
| `health_unhealthy` | Any health check returns unhealthy | critical |
| `dispute_created` | New Stripe dispute received | critical |
| `high_error_rate` | Error rate > threshold in window | warning |
| `storage_threshold` | R2 usage > 80% of limit | warning |
| `unusual_activity` | Transaction velocity anomaly | warning |
| `authentication_failures` | High auth failure rate | warning |

#### Alert Data Model

```json
{
  "id": "alert_abc123",
  "type": "dispute_created",
  "severity": "critical",
  "title": "New Stripe Dispute Received",
  "message": "Dispute for payment pi_xyz789 - Amount: $10.00",
  "metadata": {
    "payment_intent_id": "pi_xyz789",
    "amount_cents": 1000,
    "reason": "fraudulent"
  },
  "created_at": "2026-01-17T10:00:00Z",
  "acknowledged_at": null,
  "acknowledged_by": null,
  "resolved_at": null
}
```

### Statistics Durable Object

**Decision:** Hybrid aggregation strategy - counters updated in real-time, complex aggregates computed periodically via scheduled jobs.

A new `PlatformStats` Durable Object will aggregate and cache platform-wide statistics.

```javascript
class PlatformStats {
  // Counters (updated on each operation)
  total_uploads: number
  total_uploads_bytes: number
  total_downloads: number
  total_deposits: number
  total_deposits_cents: number
  total_users: number

  // Snapshots (computed periodically)
  last_snapshot_at: timestamp
  active_content_count: number
  active_content_bytes: number
  platform_balance_cents: number
}
```

### Audit Log

**Decision:** 1-year retention period with automatic cleanup.

All admin actions and significant system events are logged.

```json
{
  "id": "audit_abc123",
  "timestamp": "2026-01-17T10:00:00Z",
  "actor_type": "admin|system|user",
  "actor_id": "user_2abc123",
  "action": "alert_acknowledged",
  "resource_type": "alert",
  "resource_id": "alert_xyz789",
  "metadata": {},
  "ip_address": "192.168.1.1"
}
```

### Data Export

**Decision:** CSV format only, rate limited to 1 export per minute.

Export endpoints return paginated, filterable data in CSV format.

| Export Type | Endpoint | Data |
|-------------|----------|------|
| Transactions | `/api/admin/export?type=transactions` | All payment records |
| Users | `/api/admin/export?type=users` | User metadata (no PII) |
| Content | `/api/admin/export?type=content` | Content metadata |
| Audit Log | `/api/admin/export?type=audit` | Audit log entries |

**Rate Limit:** Maximum 1 export request per minute to prevent system overload.

---

## Test Plan

### Unit Tests: Admin Authorization

```
TEST: validateAdminToken - returns true for valid token
  GIVEN: ADMIN_SECRET_TOKEN = "a1b2c3d4..." (64 hex chars)
  AND: providedToken = "a1b2c3d4..." (matching)
  WHEN: validateAdminToken(providedToken, env) is called
  THEN: returns true

TEST: validateAdminToken - returns false for invalid token
  GIVEN: ADMIN_SECRET_TOKEN = "a1b2c3d4..."
  AND: providedToken = "wrong_token"
  WHEN: validateAdminToken(providedToken, env) is called
  THEN: returns false

TEST: validateAdminToken - returns false for empty token
  GIVEN: ADMIN_SECRET_TOKEN = "a1b2c3d4..."
  AND: providedToken = ""
  WHEN: validateAdminToken(providedToken, env) is called
  THEN: returns false

TEST: validateAdminToken - returns false when secret not configured
  GIVEN: ADMIN_SECRET_TOKEN is not set
  AND: providedToken = "any_token"
  WHEN: validateAdminToken(providedToken, env) is called
  THEN: returns false

TEST: validateAdminToken - constant-time comparison
  GIVEN: ADMIN_SECRET_TOKEN = "a1b2c3d4..."
  WHEN: validateAdminToken is called with wrong token
  THEN: uses constant-time comparison to prevent timing attacks

TEST: validateAdminToken - case sensitive
  GIVEN: ADMIN_SECRET_TOKEN = "A1B2C3D4..."
  AND: providedToken = "a1b2c3d4..."
  WHEN: validateAdminToken(providedToken, env) is called
  THEN: returns false
```

### Integration Tests: Admin Endpoints - Authentication

```
TEST: GET /api/admin/stats - rejects request without X-Admin-Token
  GIVEN: no X-Admin-Token header
  WHEN: GET /api/admin/stats
  THEN: status = 401
  AND: error = "Admin authentication required"

TEST: GET /api/admin/stats - rejects invalid admin token
  GIVEN: X-Admin-Token = "wrong_token"
  WHEN: GET /api/admin/stats
  THEN: status = 401
  AND: error = "Invalid admin token"

TEST: GET /api/admin/stats - rejects Clerk session (wrong auth method)
  GIVEN: valid Clerk session but no X-Admin-Token
  WHEN: GET /api/admin/stats
  THEN: status = 401
  AND: error = "Admin authentication required"

TEST: GET /api/admin/stats - rejects API key (wrong auth method)
  GIVEN: valid API key but no X-Admin-Token
  WHEN: GET /api/admin/stats
  THEN: status = 401
  AND: error = "Admin authentication required"

TEST: GET /api/admin/stats - accepts valid admin token
  GIVEN: X-Admin-Token = <valid ADMIN_SECRET_TOKEN>
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: response contains statistics object

TEST: All admin endpoints require X-Admin-Token
  GIVEN: no X-Admin-Token header
  WHEN: GET /api/admin/health
  THEN: status = 401
  WHEN: GET /api/admin/alerts
  THEN: status = 401
  WHEN: GET /api/admin/export
  THEN: status = 401
  WHEN: GET /api/admin/audit-log
  THEN: status = 401
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: status = 401
```

### Integration Tests: Platform Statistics

```
TEST: GET /api/admin/stats - returns complete statistics
  GIVEN: valid admin token
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: response.content contains total_files, total_size_bytes, etc.
  AND: response.users contains total_accounts, active_accounts, etc.
  AND: response.financial contains total_revenue_cents, etc.
  AND: response.api_keys contains total_created, active_keys, etc.

TEST: GET /api/admin/stats - returns zero values for empty platform
  GIVEN: valid admin token
  AND: no content, users, or transactions exist
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: all numeric fields are 0

TEST: GET /api/admin/stats - content counts are accurate
  GIVEN: valid admin token
  AND: 10 active files uploaded
  AND: 2 expired files
  AND: 3 inline content items
  WHEN: GET /api/admin/stats
  THEN: response.content.total_files = 12
  AND: response.content.active_files = 10
  AND: response.content.expired_files = 2
  AND: response.content.inline_content_count = 3

TEST: GET /api/admin/stats - user counts are accurate
  GIVEN: valid admin token
  AND: 100 total user accounts
  AND: 5 deleted accounts
  WHEN: GET /api/admin/stats
  THEN: response.users.total_accounts = 100
  AND: response.users.deleted_accounts = 5
  AND: response.users.active_accounts = 95

TEST: GET /api/admin/stats - financial totals are accurate
  GIVEN: valid admin token
  AND: deposits totaling $500.00
  AND: upload payments totaling $300.00
  AND: donations totaling $50.00
  WHEN: GET /api/admin/stats
  THEN: response.financial.total_deposits_cents = 50000
  AND: response.financial.total_revenue_cents = 35000

TEST: GET /api/admin/stats/financial - returns detailed breakdown
  GIVEN: valid admin token
  AND: 10 upload payments ($200 total)
  AND: 5 extensions ($50 total)
  AND: 3 donations ($30 total)
  WHEN: GET /api/admin/stats/financial
  THEN: response.breakdown_by_type.upload_payment.count = 10
  AND: response.breakdown_by_type.upload_payment.total_cents = 20000
  AND: response.breakdown_by_type.cid_extension.count = 5
  AND: response.breakdown_by_type.donation_received.count = 3

TEST: GET /api/admin/stats/financial - includes dispute information
  GIVEN: valid admin token
  AND: 2 disputes created (1 resolved, 1 pending)
  WHEN: GET /api/admin/stats/financial
  THEN: response.disputes.total_count = 2
  AND: response.disputes.pending_count = 1
  AND: response.disputes.resolved_count = 1

TEST: GET /api/admin/stats/content - returns content details
  GIVEN: valid admin token
  WHEN: GET /api/admin/stats/content
  THEN: response contains size distribution
  AND: response contains retention duration distribution
  AND: response contains upload trends

TEST: GET /api/admin/stats/users - returns user details
  GIVEN: valid admin token
  WHEN: GET /api/admin/stats/users
  THEN: response contains registration trends
  AND: response contains balance distribution
  AND: response contains activity levels
```

### Integration Tests: Health Endpoint (Extended)

```
TEST: GET /api/admin/health - returns extended health information
  GIVEN: valid admin token
  WHEN: GET /api/admin/health
  THEN: status = 200
  AND: includes all standard health checks
  AND: includes response_time_ms for each component
  AND: includes memory_usage information
  AND: includes request_count metrics

TEST: GET /api/admin/health - returns component latencies
  GIVEN: valid admin token
  WHEN: GET /api/admin/health
  THEN: response.checks.durable_objects.response_time_ms exists
  AND: response.checks.r2_bucket.response_time_ms exists

TEST: GET /api/admin/health - includes error details for unhealthy components
  GIVEN: valid admin token
  AND: R2 bucket is unavailable
  WHEN: GET /api/admin/health
  THEN: response.checks.r2_bucket.status = "down"
  AND: response.checks.r2_bucket.error contains error message

TEST: GET /health - public endpoint still works without admin auth
  GIVEN: no authentication
  WHEN: GET /health
  THEN: status = 200
  AND: response contains basic health information
  AND: response does NOT contain extended metrics
```

### Integration Tests: Alerting System

```
TEST: Alert creation - dispute triggers critical alert
  GIVEN: Stripe webhook delivers dispute event
  WHEN: webhook processed
  THEN: new alert created with type = "dispute_created"
  AND: alert severity = "critical"
  AND: alert contains payment intent details

TEST: Alert creation - health degradation triggers warning
  GIVEN: health check detects degraded component
  WHEN: scheduled health check runs
  THEN: new alert created with type = "health_degraded"
  AND: alert severity = "warning"

TEST: GET /api/admin/alerts - returns active alerts
  GIVEN: valid admin token
  AND: 3 active alerts (1 critical, 2 warning)
  WHEN: GET /api/admin/alerts
  THEN: status = 200
  AND: response contains 3 alerts
  AND: alerts sorted by severity (critical first) then created_at

TEST: GET /api/admin/alerts - filters by severity
  GIVEN: valid admin token
  AND: 3 alerts (1 critical, 2 warning)
  WHEN: GET /api/admin/alerts?severity=critical
  THEN: response contains 1 alert
  AND: alert.severity = "critical"

TEST: GET /api/admin/alerts - filters by acknowledged status
  GIVEN: valid admin token
  AND: 2 unacknowledged, 1 acknowledged alert
  WHEN: GET /api/admin/alerts?acknowledged=false
  THEN: response contains 2 alerts

TEST: POST /api/admin/alerts/:id/acknowledge - acknowledges alert
  GIVEN: valid admin token
  AND: unacknowledged alert exists
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: status = 200
  AND: alert.acknowledged_at is set
  AND: alert.acknowledged_by = admin user ID

TEST: POST /api/admin/alerts/:id/acknowledge - idempotent for already acknowledged
  GIVEN: valid admin token
  AND: alert already acknowledged
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: status = 200
  AND: acknowledged_at unchanged

TEST: POST /api/admin/alerts/:id/acknowledge - rejects non-existent alert
  GIVEN: valid admin token
  WHEN: POST /api/admin/alerts/non-existent/acknowledge
  THEN: status = 404

TEST: Alert auto-resolution - resolves when condition clears
  GIVEN: alert exists for "health_degraded"
  WHEN: health check shows all components healthy
  THEN: alert.resolved_at is set automatically
```

### Integration Tests: Anomaly Detection

```
TEST: Unusual activity - high deposit velocity triggers alert
  GIVEN: normal deposit rate is 10/hour
  AND: 50 deposits received in last hour
  WHEN: anomaly detection runs
  THEN: alert created with type = "unusual_activity"
  AND: alert.metadata contains deposit_count and threshold

TEST: Unusual activity - high error rate triggers alert
  GIVEN: normal error rate is 1%
  AND: error rate reaches 10% in 5-minute window
  WHEN: anomaly detection runs
  THEN: alert created with type = "high_error_rate"
  AND: severity = "warning"

TEST: Authentication failures - high failure rate triggers alert
  GIVEN: 100 authentication failures in 5 minutes from same IP
  WHEN: anomaly detection runs
  THEN: alert created with type = "authentication_failures"
  AND: alert.metadata contains ip_address and failure_count

TEST: Anomaly detection - does not alert on normal activity
  GIVEN: normal activity levels
  WHEN: anomaly detection runs
  THEN: no new alerts created

TEST: Anomaly detection - respects cooldown period
  GIVEN: alert already created for same anomaly 30 minutes ago
  AND: anomaly condition still present
  WHEN: anomaly detection runs
  THEN: no duplicate alert created
```

### Integration Tests: Data Export

```
TEST: GET /api/admin/export - transactions export (CSV)
  GIVEN: valid admin token
  AND: 50 transactions exist
  WHEN: GET /api/admin/export?type=transactions
  THEN: status = 200
  AND: Content-Type = "text/csv"
  AND: Content-Disposition = "attachment; filename=transactions_2026-01-17.csv"
  AND: response is valid CSV with headers
  AND: headers include: id, type, amount_cents, user_id, created_at

TEST: GET /api/admin/export - pagination support
  GIVEN: valid admin token
  AND: 500 transactions exist
  WHEN: GET /api/admin/export?type=transactions&limit=100&offset=0
  THEN: CSV contains 100 data rows (plus header)
  AND: X-Total-Count header = 500
  AND: X-Has-More header = true

TEST: GET /api/admin/export - date range filtering
  GIVEN: valid admin token
  AND: transactions from January 1-15
  WHEN: GET /api/admin/export?type=transactions&start_date=2026-01-05&end_date=2026-01-10
  THEN: CSV only contains transactions from Jan 5-10

TEST: GET /api/admin/export - users export (no PII)
  GIVEN: valid admin token
  WHEN: GET /api/admin/export?type=users
  THEN: Content-Type = "text/csv"
  AND: CSV does NOT contain email column
  AND: CSV does NOT contain name column
  AND: CSV contains columns: user_id, created_at, last_active_at, balance_cents

TEST: GET /api/admin/export - content export
  GIVEN: valid admin token
  WHEN: GET /api/admin/export?type=content
  THEN: Content-Type = "text/csv"
  AND: CSV contains columns: hash, size_bytes, created_at, expires_at, download_count

TEST: GET /api/admin/export - audit log export
  GIVEN: valid admin token
  WHEN: GET /api/admin/export?type=audit
  THEN: Content-Type = "text/csv"
  AND: CSV contains columns: timestamp, actor_type, actor_id, action, resource_type, resource_id

TEST: GET /api/admin/export - rejects invalid type
  GIVEN: valid admin token
  WHEN: GET /api/admin/export?type=invalid
  THEN: status = 400
  AND: error = "Invalid export type. Valid types: transactions, users, content, audit"

TEST: GET /api/admin/export - rate limit (1 per minute)
  GIVEN: valid admin token
  AND: 1 export already requested in last 60 seconds
  WHEN: GET /api/admin/export
  THEN: status = 429
  AND: Retry-After header present (seconds until next allowed request)

TEST: GET /api/admin/export - rate limit resets after minute
  GIVEN: valid admin token
  AND: last export was 61 seconds ago
  WHEN: GET /api/admin/export?type=transactions
  THEN: status = 200
  AND: CSV returned successfully

TEST: GET /api/admin/export - CSV escapes special characters
  GIVEN: valid admin token
  AND: transaction exists with description containing comma and quotes
  WHEN: GET /api/admin/export?type=transactions
  THEN: special characters are properly escaped per RFC 4180
```

### Integration Tests: Audit Log

```
TEST: Audit log - records admin stats access
  GIVEN: admin accesses /api/admin/stats
  WHEN: request completes
  THEN: audit log entry created
  AND: entry.action = "admin_stats_viewed"
  AND: entry.actor_id = admin user ID

TEST: Audit log - records alert acknowledgment
  GIVEN: admin acknowledges alert
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: audit log entry created
  AND: entry.action = "alert_acknowledged"
  AND: entry.resource_id = alert ID

TEST: Audit log - records data export
  GIVEN: admin exports transactions
  WHEN: GET /api/admin/export?type=transactions
  THEN: audit log entry created
  AND: entry.action = "data_exported"
  AND: entry.metadata.export_type = "transactions"

TEST: GET /api/admin/audit-log - returns audit entries
  GIVEN: valid admin token
  AND: 25 audit log entries exist
  WHEN: GET /api/admin/audit-log
  THEN: status = 200
  AND: response contains entries sorted by timestamp (newest first)

TEST: GET /api/admin/audit-log - filters by action
  GIVEN: valid admin token
  WHEN: GET /api/admin/audit-log?action=alert_acknowledged
  THEN: response only contains alert_acknowledged entries

TEST: GET /api/admin/audit-log - filters by actor
  GIVEN: valid admin token
  WHEN: GET /api/admin/audit-log?actor_id=user_admin1
  THEN: response only contains entries by user_admin1
```

### Integration Tests: PlatformStats Durable Object

```
TEST: PlatformStats - increment upload counter
  GIVEN: PlatformStats DO exists
  WHEN: POST /increment?type=upload&bytes=1048576
  THEN: total_uploads incremented by 1
  AND: total_uploads_bytes incremented by 1048576

TEST: PlatformStats - increment download counter
  GIVEN: PlatformStats DO exists
  WHEN: POST /increment?type=download
  THEN: total_downloads incremented by 1

TEST: PlatformStats - increment user counter
  GIVEN: PlatformStats DO exists
  WHEN: POST /increment?type=user
  THEN: total_users incremented by 1

TEST: PlatformStats - get current stats
  GIVEN: PlatformStats DO has accumulated data
  WHEN: GET /stats
  THEN: returns all current counter values

TEST: PlatformStats - snapshot creation
  GIVEN: PlatformStats DO exists
  WHEN: POST /snapshot with aggregated content/user data
  THEN: snapshot stored with timestamp
  AND: active_content_count updated
  AND: active_content_bytes updated

TEST: PlatformStats - concurrent increments handled correctly
  GIVEN: PlatformStats DO exists
  WHEN: 100 concurrent POST /increment?type=upload requests
  THEN: total_uploads = exactly 100

TEST: PlatformStats - handles DO restart
  GIVEN: PlatformStats DO had counters
  WHEN: DO restarts (alarm or deployment)
  THEN: counters persisted in storage are restored
```

### End-to-End Tests

```
TEST: Admin workflow - view stats, acknowledge alert, export data
  1. Admin sends request with X-Admin-Token header
  2. GET /api/admin/stats - verify stats returned (200)
  3. GET /api/admin/alerts - verify alerts list returned
  4. POST /api/admin/alerts/:id/acknowledge - acknowledge warning alert
  5. GET /api/admin/alerts/:id - verify alert is now acknowledged
  6. GET /api/admin/export?type=transactions - download CSV
  7. Verify CSV file is valid and contains expected columns
  8. GET /api/admin/audit-log - verify all actions logged

TEST: Alert lifecycle - creation to resolution
  1. Simulate degraded R2 response time
  2. Wait for scheduled health check to run
  3. Verify alert created with type = "health_degraded"
  4. GET /api/admin/alerts - verify alert visible
  5. POST /api/admin/alerts/:id/acknowledge - admin acknowledges
  6. Restore R2 to healthy state
  7. Wait for next health check
  8. Verify alert.resolved_at is now set
  9. Alert remains in history but marked resolved

TEST: Unauthorized access rejected
  1. Request with no X-Admin-Token:
     - GET /api/admin/stats → 401
     - GET /api/admin/alerts → 401
     - GET /api/admin/export → 401
  2. Request with wrong X-Admin-Token:
     - GET /api/admin/stats → 401
  3. Request with Clerk session (not admin token):
     - GET /api/admin/stats → 401
  4. Regular user endpoints still work:
     - GET /health → 200
     - GET /api/balance (with Clerk) → 200

TEST: Export rate limiting enforced
  1. GET /api/admin/export?type=transactions → 200 (CSV returned)
  2. Immediately GET /api/admin/export?type=users → 429 (rate limited)
  3. Wait 60 seconds
  4. GET /api/admin/export?type=users → 200 (allowed again)
```

---

## Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | How should admin users be identified? | **Separate admin authentication system** | Single admin with dedicated secret token, independent of Clerk |
| 2 | Where should alerts be stored? | **Dedicated AlertStore Durable Object** | Provides durability and query capabilities |
| 3 | Should alerts be sent externally? | **Only in-app alerts** | Simplifies implementation; admin polls API |
| 5 | How should platform statistics be aggregated? | **Hybrid approach** | Counters real-time, aggregates periodic |
| 6 | What is the audit log retention period? | **1 year** | Balance between compliance and storage costs |
| 7 | Should export rate be limited? | **1 export per minute** | Prevents system overload |
| 8 | What format should large exports use? | **CSV only** | Simple, universal format |
| 9 | Should there be an admin UI? | **API only** | Admin uses external tools (curl, Postman, scripts) |
| 10 | How should the system handle admin account deletion? | **Not allowed** | Single admin; token rotated manually if needed |

---

## Open Questions

The following questions need to be resolved before implementation:

| # | Question | Proposed Answer | Notes |
|---|----------|-----------------|-------|
| 4 | What anomaly thresholds should trigger alerts? | See proposed thresholds below | Need confirmation |
| 11 | What format should the admin secret token use? | 64-character hex string (256 bits) | Need confirmation |
| 12 | How should the admin authenticate? | `X-Admin-Token` header | Need confirmation |

### Proposed Anomaly Thresholds (Q4)

| Alert Type | Threshold | Window | Cooldown |
|------------|-----------|--------|----------|
| `high_error_rate` | Error rate > 5% | 5 minutes | 1 hour |
| `authentication_failures` | > 50 failures from same IP | 5 minutes | 1 hour |
| `unusual_deposit_velocity` | > 5x normal hourly rate OR > 20 deposits/hour | 1 hour | 2 hours |
| `unusual_upload_velocity` | > 5x normal hourly rate OR > 100 uploads/hour | 1 hour | 2 hours |
| `storage_threshold` | R2 usage > 80% of quota | Daily check | 24 hours |
| `health_degraded` | Any component returns degraded | Health check interval | Until resolved |
| `health_unhealthy` | Any component returns unhealthy | Health check interval | Until resolved |
| `dispute_created` | Any Stripe dispute | Immediate | None (always alert) |

**Notes on thresholds:**
- "Normal rate" is calculated as rolling 7-day average
- Cooldown prevents alert spam for ongoing issues
- `dispute_created` always triggers immediately (no cooldown) since disputes are critical
- Health alerts auto-resolve when condition clears

---

## Architecture Decisions

| Decision | Status | Choice |
|----------|--------|--------|
| Admin identification method | ✅ RESOLVED | Separate auth with `ADMIN_SECRET_TOKEN` |
| Alert storage mechanism | ✅ RESOLVED | AlertStore Durable Object |
| External notification integration | ✅ RESOLVED | None (in-app only) |
| Statistics aggregation strategy | ✅ RESOLVED | Hybrid (counters real-time, aggregates periodic) |
| Audit log retention | ✅ RESOLVED | 1 year |
| Export format | ✅ RESOLVED | CSV only |
| Export rate limit | ✅ RESOLVED | 1 per minute |
| Admin UI | ✅ RESOLVED | API only |
| Admin deletion | ✅ RESOLVED | Not allowed (single admin) |
| Anomaly thresholds | ⏳ PROPOSED | Awaiting confirmation |
| Admin token format | ⏳ PROPOSED | 64-char hex, `X-Admin-Token` header |

---

## Implementation Tasks

### Phase 1: Admin Authentication ✅ READY
1. Generate `ADMIN_SECRET_TOKEN` (64-char hex) and add to Cloudflare secrets
2. Create `validateAdminToken(token, env)` function with constant-time comparison
3. Create admin middleware that checks `X-Admin-Token` header
4. Add admin middleware to all `/api/admin/*` routes
5. Write tests for admin token validation

### Phase 2: Platform Statistics ✅ READY
1. Create `PlatformStats` Durable Object class
2. Add counter increment methods (uploads, downloads, users, deposits)
3. Integrate counter calls into content upload, download, user creation, payment flows
4. Implement scheduled job for periodic snapshot aggregation
5. Create `/api/admin/stats` endpoint (returns all stats)
6. Create `/api/admin/stats/financial` endpoint (detailed financial breakdown)
7. Create `/api/admin/stats/content` endpoint (content details)
8. Create `/api/admin/stats/users` endpoint (user details)
9. Write tests for statistics accuracy

### Phase 3: Alerting System ✅ READY
1. Create `AlertStore` Durable Object class
2. Implement alert creation method with deduplication
3. Integrate alert creation into:
   - Stripe webhook handler (dispute_created)
   - Health check (health_degraded, health_unhealthy)
4. Create `GET /api/admin/alerts` endpoint with filtering
5. Create `POST /api/admin/alerts/:id/acknowledge` endpoint
6. Implement auto-resolution logic for health alerts
7. Write tests for alert lifecycle

### Phase 4: Anomaly Detection ⏳ AWAITING THRESHOLD CONFIRMATION
1. Implement anomaly detection scheduled job
2. Add detection logic for each anomaly type:
   - high_error_rate (> 5% in 5 min)
   - authentication_failures (> 50 from same IP in 5 min)
   - unusual_deposit_velocity (> 5x normal or > 20/hour)
   - unusual_upload_velocity (> 5x normal or > 100/hour)
   - storage_threshold (> 80% R2 quota)
3. Implement cooldown mechanism to prevent alert spam
4. Integrate with AlertStore DO
5. Write tests for anomaly detection

### Phase 5: Data Export ✅ READY
1. Create `GET /api/admin/export` endpoint
2. Implement CSV generation for each data type:
   - transactions (from PaymentRecord DOs)
   - users (from UserProfile DOs, no PII)
   - content (from ContentMetadata DOs)
   - audit (from AuditLog DO)
3. Add pagination support (limit/offset query params)
4. Add date range filtering (start_date/end_date)
5. Implement rate limiting (1 export per minute)
6. Ensure proper CSV escaping per RFC 4180
7. Write tests for export functionality

### Phase 6: Audit Log ✅ READY
1. Create `AuditLog` Durable Object class
2. Implement audit entry creation with timestamp, actor, action, resource
3. Integrate audit logging into all admin endpoints
4. Create `GET /api/admin/audit-log` endpoint with filtering
5. Implement 1-year retention with scheduled cleanup job
6. Write tests for audit logging

### Phase 7: Extended Health Endpoint ✅ READY
1. Create `GET /api/admin/health` endpoint (extends public `/health`)
2. Add response time measurements for each component
3. Add memory/resource usage metrics
4. Write tests for extended health information

---

## Security Considerations

1. **Admin token storage**: `ADMIN_SECRET_TOKEN` stored as Cloudflare secret, never in code or logs
2. **Token-based auth**: Admin endpoints require `X-Admin-Token` header (not Clerk session or API key)
3. **Constant-time comparison**: Token validation uses constant-time comparison to prevent timing attacks
4. **Single admin**: No multi-admin complexity; token rotation handled manually via Cloudflare dashboard
5. **Audit trail**: All admin actions logged with timestamp, action, and metadata
6. **No PII in exports**: User exports exclude email addresses and names
7. **Rate limiting**: Export endpoints limited to 1/minute to prevent abuse
8. **Principle of least privilege**: Admin access is read-only for most operations
9. **Alert acknowledgment**: Only marks as seen, does not dismiss or delete
10. **Audit log immutability**: Audit entries cannot be deleted or modified
11. **Token in header only**: Token must be in `X-Admin-Token` header, not query params (prevents logging)

---

## Success Criteria

- [ ] Admin users can be identified and authenticated
- [ ] Platform statistics endpoint returns accurate data
- [ ] Financial metrics are correctly calculated
- [ ] Alerts are created for critical events
- [ ] Alerts can be viewed and acknowledged
- [ ] Data can be exported in requested formats
- [ ] Audit log captures all admin actions
- [ ] All tests pass
- [ ] No security vulnerabilities in admin endpoints

---

**Document Version:** 1.1
**Created:** 2026-01-17
**Last Updated:** 2026-01-17
**Status:** Nearly Ready - Awaiting confirmation on anomaly thresholds and admin token format
