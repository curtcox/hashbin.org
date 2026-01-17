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

Administrators are identified by user ID in an allow-list stored as a Cloudflare secret.

```javascript
// Environment variable: ADMIN_USER_IDS (comma-separated Clerk user IDs)
// Example: "user_2abc123,user_2xyz789"
```

Admin endpoints require:
1. Valid Clerk session (not API key)
2. User ID present in ADMIN_USER_IDS

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

Export endpoints return paginated, filterable data in JSON or CSV format.

| Export Type | Endpoint | Data |
|-------------|----------|------|
| Transactions | `/api/admin/export?type=transactions` | All payment records |
| Users | `/api/admin/export?type=users` | User metadata (no PII) |
| Content | `/api/admin/export?type=content` | Content metadata |
| Audit Log | `/api/admin/export?type=audit` | Audit log entries |

---

## Test Plan

### Unit Tests: Admin Authorization

```
TEST: isAdmin - returns true for admin user
  GIVEN: ADMIN_USER_IDS = "user_admin1,user_admin2"
  AND: userId = "user_admin1"
  WHEN: isAdmin(userId, env) is called
  THEN: returns true

TEST: isAdmin - returns false for non-admin user
  GIVEN: ADMIN_USER_IDS = "user_admin1,user_admin2"
  AND: userId = "user_regular"
  WHEN: isAdmin(userId, env) is called
  THEN: returns false

TEST: isAdmin - handles empty admin list
  GIVEN: ADMIN_USER_IDS = ""
  WHEN: isAdmin(userId, env) is called
  THEN: returns false

TEST: isAdmin - handles undefined admin list
  GIVEN: ADMIN_USER_IDS is not set
  WHEN: isAdmin(userId, env) is called
  THEN: returns false

TEST: isAdmin - handles whitespace in admin list
  GIVEN: ADMIN_USER_IDS = " user_admin1 , user_admin2 "
  AND: userId = "user_admin1"
  WHEN: isAdmin(userId, env) is called
  THEN: returns true

TEST: isAdmin - case sensitive matching
  GIVEN: ADMIN_USER_IDS = "user_Admin1"
  AND: userId = "user_admin1"
  WHEN: isAdmin(userId, env) is called
  THEN: returns false
```

### Integration Tests: Admin Endpoints - Authentication

```
TEST: GET /api/admin/stats - rejects unauthenticated request
  GIVEN: no authentication
  WHEN: GET /api/admin/stats
  THEN: status = 401
  AND: error = "Authentication required"

TEST: GET /api/admin/stats - rejects non-admin user
  GIVEN: valid Clerk session for non-admin user
  WHEN: GET /api/admin/stats
  THEN: status = 403
  AND: error = "Admin access required"

TEST: GET /api/admin/stats - rejects API key authentication
  GIVEN: valid API key (even for admin user)
  WHEN: GET /api/admin/stats
  THEN: status = 403
  AND: error = "Clerk session required for admin endpoints"

TEST: GET /api/admin/stats - accepts admin user with Clerk session
  GIVEN: valid Clerk session for admin user
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: response contains statistics object
```

### Integration Tests: Platform Statistics

```
TEST: GET /api/admin/stats - returns complete statistics
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: response.content contains total_files, total_size_bytes, etc.
  AND: response.users contains total_accounts, active_accounts, etc.
  AND: response.financial contains total_revenue_cents, etc.
  AND: response.api_keys contains total_created, active_keys, etc.

TEST: GET /api/admin/stats - returns zero values for empty platform
  GIVEN: admin Clerk session
  AND: no content, users, or transactions exist
  WHEN: GET /api/admin/stats
  THEN: status = 200
  AND: all numeric fields are 0

TEST: GET /api/admin/stats - content counts are accurate
  GIVEN: admin Clerk session
  AND: 10 active files uploaded
  AND: 2 expired files
  AND: 3 inline content items
  WHEN: GET /api/admin/stats
  THEN: response.content.total_files = 12
  AND: response.content.active_files = 10
  AND: response.content.expired_files = 2
  AND: response.content.inline_content_count = 3

TEST: GET /api/admin/stats - user counts are accurate
  GIVEN: admin Clerk session
  AND: 100 total user accounts
  AND: 5 deleted accounts
  WHEN: GET /api/admin/stats
  THEN: response.users.total_accounts = 100
  AND: response.users.deleted_accounts = 5
  AND: response.users.active_accounts = 95

TEST: GET /api/admin/stats - financial totals are accurate
  GIVEN: admin Clerk session
  AND: deposits totaling $500.00
  AND: upload payments totaling $300.00
  AND: donations totaling $50.00
  WHEN: GET /api/admin/stats
  THEN: response.financial.total_deposits_cents = 50000
  AND: response.financial.total_revenue_cents = 35000

TEST: GET /api/admin/stats/financial - returns detailed breakdown
  GIVEN: admin Clerk session
  AND: 10 upload payments ($200 total)
  AND: 5 extensions ($50 total)
  AND: 3 donations ($30 total)
  WHEN: GET /api/admin/stats/financial
  THEN: response.breakdown_by_type.upload_payment.count = 10
  AND: response.breakdown_by_type.upload_payment.total_cents = 20000
  AND: response.breakdown_by_type.cid_extension.count = 5
  AND: response.breakdown_by_type.donation_received.count = 3

TEST: GET /api/admin/stats/financial - includes dispute information
  GIVEN: admin Clerk session
  AND: 2 disputes created (1 resolved, 1 pending)
  WHEN: GET /api/admin/stats/financial
  THEN: response.disputes.total_count = 2
  AND: response.disputes.pending_count = 1
  AND: response.disputes.resolved_count = 1

TEST: GET /api/admin/stats/content - returns content details
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/stats/content
  THEN: response contains size distribution
  AND: response contains retention duration distribution
  AND: response contains upload trends

TEST: GET /api/admin/stats/users - returns user details
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/stats/users
  THEN: response contains registration trends
  AND: response contains balance distribution
  AND: response contains activity levels
```

### Integration Tests: Health Endpoint (Extended)

```
TEST: GET /api/admin/health - returns extended health information
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/health
  THEN: status = 200
  AND: includes all standard health checks
  AND: includes response_time_ms for each component
  AND: includes memory_usage information
  AND: includes request_count metrics

TEST: GET /api/admin/health - returns component latencies
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/health
  THEN: response.checks.durable_objects.response_time_ms exists
  AND: response.checks.r2_bucket.response_time_ms exists

TEST: GET /api/admin/health - includes error details for unhealthy components
  GIVEN: admin Clerk session
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
  GIVEN: admin Clerk session
  AND: 3 active alerts (1 critical, 2 warning)
  WHEN: GET /api/admin/alerts
  THEN: status = 200
  AND: response contains 3 alerts
  AND: alerts sorted by severity (critical first) then created_at

TEST: GET /api/admin/alerts - filters by severity
  GIVEN: admin Clerk session
  AND: 3 alerts (1 critical, 2 warning)
  WHEN: GET /api/admin/alerts?severity=critical
  THEN: response contains 1 alert
  AND: alert.severity = "critical"

TEST: GET /api/admin/alerts - filters by acknowledged status
  GIVEN: admin Clerk session
  AND: 2 unacknowledged, 1 acknowledged alert
  WHEN: GET /api/admin/alerts?acknowledged=false
  THEN: response contains 2 alerts

TEST: POST /api/admin/alerts/:id/acknowledge - acknowledges alert
  GIVEN: admin Clerk session
  AND: unacknowledged alert exists
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: status = 200
  AND: alert.acknowledged_at is set
  AND: alert.acknowledged_by = admin user ID

TEST: POST /api/admin/alerts/:id/acknowledge - idempotent for already acknowledged
  GIVEN: admin Clerk session
  AND: alert already acknowledged
  WHEN: POST /api/admin/alerts/:id/acknowledge
  THEN: status = 200
  AND: acknowledged_at unchanged

TEST: POST /api/admin/alerts/:id/acknowledge - rejects non-existent alert
  GIVEN: admin Clerk session
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
TEST: GET /api/admin/export - transactions export (JSON)
  GIVEN: admin Clerk session
  AND: 50 transactions exist
  WHEN: GET /api/admin/export?type=transactions&format=json
  THEN: status = 200
  AND: Content-Type = "application/json"
  AND: response contains array of transactions
  AND: each transaction has id, type, amount_cents, created_at

TEST: GET /api/admin/export - transactions export (CSV)
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/export?type=transactions&format=csv
  THEN: status = 200
  AND: Content-Type = "text/csv"
  AND: Content-Disposition contains filename
  AND: response is valid CSV with headers

TEST: GET /api/admin/export - pagination support
  GIVEN: admin Clerk session
  AND: 500 transactions exist
  WHEN: GET /api/admin/export?type=transactions&limit=100&offset=0
  THEN: response contains 100 transactions
  AND: response.pagination.total = 500
  AND: response.pagination.has_more = true

TEST: GET /api/admin/export - date range filtering
  GIVEN: admin Clerk session
  AND: transactions from January 1-15
  WHEN: GET /api/admin/export?type=transactions&start_date=2026-01-05&end_date=2026-01-10
  THEN: response only contains transactions from Jan 5-10

TEST: GET /api/admin/export - users export (no PII)
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/export?type=users
  THEN: response contains user metadata
  AND: response does NOT contain email addresses
  AND: response does NOT contain names
  AND: response contains user_id, created_at, last_active_at, balance_cents

TEST: GET /api/admin/export - content export
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/export?type=content
  THEN: response contains content metadata
  AND: each item has hash, size_bytes, created_at, expires_at, download_count

TEST: GET /api/admin/export - audit log export
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/export?type=audit
  THEN: response contains audit log entries
  AND: each entry has timestamp, actor_type, actor_id, action, resource_type

TEST: GET /api/admin/export - rejects invalid type
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/export?type=invalid
  THEN: status = 400
  AND: error = "Invalid export type"

TEST: GET /api/admin/export - respects rate limit
  GIVEN: admin Clerk session
  AND: 5 exports already requested in last minute
  WHEN: GET /api/admin/export
  THEN: status = 429
  AND: Retry-After header present
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
  GIVEN: admin Clerk session
  AND: 25 audit log entries exist
  WHEN: GET /api/admin/audit-log
  THEN: status = 200
  AND: response contains entries sorted by timestamp (newest first)

TEST: GET /api/admin/audit-log - filters by action
  GIVEN: admin Clerk session
  WHEN: GET /api/admin/audit-log?action=alert_acknowledged
  THEN: response only contains alert_acknowledged entries

TEST: GET /api/admin/audit-log - filters by actor
  GIVEN: admin Clerk session
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
  1. Admin logs in with Clerk
  2. Admin views /api/admin/stats
  3. Verify stats returned successfully
  4. Admin views /api/admin/alerts
  5. Admin acknowledges a warning alert
  6. Verify alert is now acknowledged
  7. Admin exports transactions for the month
  8. Verify CSV file is valid
  9. Check audit log contains all actions

TEST: Alert lifecycle - creation to resolution
  1. System detects degraded health (R2 slow)
  2. Alert created automatically
  3. Admin receives alert (via /api/admin/alerts)
  4. Admin acknowledges alert
  5. System health returns to normal
  6. Alert auto-resolved
  7. Alert moves to history

TEST: Non-admin cannot access admin endpoints
  1. Regular user logs in
  2. Attempts GET /api/admin/stats
  3. Receives 403 Forbidden
  4. Attempts GET /api/admin/alerts
  5. Receives 403 Forbidden
  6. Regular endpoints still work normally
```

---

## Open Questions

The following questions need to be resolved before implementation:

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | How should admin users be identified? | A) Clerk user IDs in environment variable<br>B) Admin role in Clerk metadata<br>C) Separate admin authentication system | Affects security model and maintainability |
| 2 | Where should alerts be stored? | A) Dedicated AlertStore Durable Object<br>B) KV with TTL<br>C) External service (PagerDuty, etc.) | Affects durability and query capabilities |
| 3 | Should alerts be sent externally? | A) Email notifications<br>B) Webhook to external service<br>C) Only in-app alerts | Affects response time to critical issues |
| 4 | What anomaly thresholds should trigger alerts? | Specific thresholds for each anomaly type need definition | Affects false positive rate |
| 5 | How should platform statistics be aggregated? | A) Real-time from all DOs (expensive)<br>B) Periodic snapshots (stale)<br>C) Hybrid (counters real-time, aggregates periodic) | Affects cost and freshness |
| 6 | What is the audit log retention period? | A) 30 days<br>B) 90 days<br>C) 1 year<br>D) Indefinite | Affects storage costs and compliance |
| 7 | Should export rate be limited? | A) No limit<br>B) 5 exports per minute<br>C) 1 export per minute | Affects system load |
| 8 | What format should large exports use? | A) JSON only<br>B) CSV only<br>C) Both<br>D) NDJSON for streaming | Affects usability and performance |
| 9 | Should there be an admin UI? | A) API only (use external tools)<br>B) Simple admin dashboard<br>C) Full admin panel | Affects development scope |
| 10 | How should the system handle admin account deletion? | A) Prevent deletion<br>B) Require another admin to remove<br>C) Allow self-deletion with audit | Affects admin management |

---

## Architecture Decisions (Pending)

Decisions to be made based on open questions:

| Decision | Status | Notes |
|----------|--------|-------|
| Admin identification method | PENDING | Q1 |
| Alert storage mechanism | PENDING | Q2 |
| External notification integration | PENDING | Q3 |
| Statistics aggregation strategy | PENDING | Q5 |
| Audit log retention | PENDING | Q6 |

---

## Implementation Tasks (Pending Open Questions)

### Phase 1: Admin Authentication
1. Implement admin identification mechanism
2. Create admin middleware for endpoint protection
3. Add admin check to all /api/admin/* routes
4. Write tests for admin authorization

### Phase 2: Platform Statistics
1. Create PlatformStats Durable Object
2. Integrate counters into content/user/payment flows
3. Implement periodic snapshot mechanism
4. Create /api/admin/stats endpoints
5. Write tests for statistics accuracy

### Phase 3: Alerting System
1. Create AlertStore Durable Object (or KV)
2. Implement alert creation for each trigger type
3. Implement alert acknowledgment endpoint
4. Implement auto-resolution logic
5. (Optional) Add external notification integration
6. Write tests for alert lifecycle

### Phase 4: Anomaly Detection
1. Define thresholds for each anomaly type
2. Implement anomaly detection logic
3. Integrate with alerting system
4. Add cooldown mechanism
5. Write tests for anomaly detection

### Phase 5: Data Export
1. Implement export endpoints for each data type
2. Add pagination support
3. Add date range filtering
4. Add format support (JSON, CSV)
5. Implement export rate limiting
6. Write tests for export functionality

### Phase 6: Audit Log
1. Create AuditLog Durable Object
2. Integrate audit logging into admin endpoints
3. Implement audit log query endpoint
4. Add retention/cleanup mechanism
5. Write tests for audit logging

### Phase 7: Admin UI (if approved)
1. Design admin dashboard layout
2. Implement stats display
3. Implement alert management UI
4. Implement export UI
5. Implement audit log viewer

---

## Security Considerations

1. **Admin identification**: Admin IDs stored as Cloudflare secret, not in code
2. **Session only**: Admin endpoints require Clerk session, not API keys
3. **Audit trail**: All admin actions logged
4. **No PII in exports**: User exports exclude email addresses and names
5. **Rate limiting**: Export endpoints rate-limited to prevent abuse
6. **Principle of least privilege**: Admin access is read-only for most operations
7. **Alert acknowledgment**: Only marks as seen, does not dismiss
8. **Audit log immutability**: Audit entries cannot be deleted or modified

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

**Document Version:** 1.0
**Created:** 2026-01-17
**Status:** Draft - Open Questions Require Resolution
