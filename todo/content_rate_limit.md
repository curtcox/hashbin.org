# Content Rate Limiting Plan

## Overview

This document describes a system for rate limiting content retrieval based on Content IDs (CIDs). Users pay for bandwidth by purchasing the right to serve specific content at a defined frequency for a defined duration. This is fundamentally a **bandwidth payment system**, not an access control mechanism.

## Core Concepts

### Rate Limiting Model

Each CID has a **minimum time between requests** (MTBR). When content is requested:
1. Check if CID is inline (≤64 bytes) → serve immediately, no rate limit
2. Check if sufficient time has passed since the last request
3. If yes: serve the content and record the timestamp
4. If no: return a rate limit exceeded error

### Pricing Model

Users pay to **decrease the MTBR** for a specific CID for a specific duration. The price is based on **maximum potential bytes transferred**:

```
Price = Size (bytes) × Max Requests × Rate Per Byte

Where:
  Max Requests = floor(Duration / Minimum Time Between Requests)

Final Price = ceil(Price to nearest $0.01)
```

**Example:**
- Content size: 1 MB (1,048,576 bytes)
- Duration: 30 days (2,592,000 seconds)
- Desired MTBR: 1 second
- Max Requests: 2,592,000
- Max Bytes Transferred: 2,718,177,484,800 bytes (~2.47 TB)
- If Rate = $0.00000000001 per byte: Price = $27.18

**Pricing Rules:**
- No minimum purchase amount
- All purchases rounded up to nearest $0.01
- No bulk discounts
- No refunds under any circumstances
- Payment is for potential bandwidth, not actual usage

### Default Rate Limits

| Content Type | Default MTBR | Notes |
|--------------|--------------|-------|
| Newly uploaded CID | 30 days | For 30 days from upload |
| After 30-day default expires | Infinite | Must purchase bandwidth to serve |
| Existing CIDs (pre-feature) | Infinite | Must purchase bandwidth to serve |
| Inline CID (≤64 bytes) | None | Always free, unlimited |

## Decisions Summary

All open questions have been resolved:

| # | Question | Decision |
|---|----------|----------|
| 1 | Base rate pricing | Variable by content size (per byte) |
| 2 | Minimum purchase | No minimum, round to $0.01 |
| 3 | Pricing model | Price per byte potentially transferred |
| 4 | Bulk discounts | No |
| 5 | Minimum MTBR | 100 milliseconds |
| 6 | Post-expiration behavior | Infinite MTBR (blocked until paid) |
| 7 | Rate limit scope | Global per-CID |
| 8 | Retention conflict | No refund; cannot purchase beyond retention |
| 9 | Who can purchase | Anyone |
| 10 | Transferable | No |
| 11 | Stacking limit | No limit |
| 12 | Contested content refund | No refunds |
| 13 | Existing CIDs | Always rate limit exceeded |
| 14 | Caching vs consistency | Consistency |
| 15 | Edge cache handling | Rate limits are about paying for bandwidth |
| 16 | Request counting | Only track last_served_at |
| 17 | 429 message | "Rate limit exceeded. Wait until {timestamp}" |
| 18 | Expiration notifications | No |
| 19 | Dashboard | Show rate limit with size and retention |
| 20 | Pricing in 429 | No |

## Data Model Changes

### ContentMetadata Durable Object

Add new fields to track rate limiting:

```javascript
{
  // Existing fields...
  hash_256t: string,
  size_bytes: number,
  uploader_id: string,
  created_at: ISO timestamp,
  expires_at: ISO timestamp,

  // New rate limiting fields
  last_served_at: ISO timestamp | null,
  rate_limit_records: [
    {
      record_id: UUID,
      payer_id: string,
      min_time_between_requests_ms: number,  // Milliseconds for 100ms precision
      starts_at: ISO timestamp,
      expires_at: ISO timestamp,
      max_requests: number,
      max_bytes: number,                      // size_bytes × max_requests
      price_cents: number,
      created_at: ISO timestamp
    }
  ],
  // Default rate limit applied at upload (null for existing CIDs)
  default_rate_limit: {
    min_time_between_requests_ms: number,
    expires_at: ISO timestamp
  } | null
}
```

### PaymentRecord Transaction Type

Add new transaction type for rate limit purchases:

```javascript
{
  transaction_id: UUID,
  type: 'rate_limit_purchase',
  user_id: string,
  amount_cents: number,
  balance_before_cents: number,
  balance_after_cents: number,
  cid: string,
  min_time_between_requests_ms: number,
  duration_seconds: number,
  max_requests: number,
  max_bytes: number,
  created_at: ISO timestamp
}
```

## API Endpoints

### GET /api/content/:cid

**Modified behavior:**

1. Check if CID is inline (≤64 bytes encoded) → serve immediately, no rate limit
2. Retrieve ContentMetadata
3. Determine effective MTBR:
   - If no active rate limits → Infinite (return 429)
   - Otherwise → lowest active MTBR
4. Check `last_served_at`:
   - If `null` and has active rate limit: serve content, update `last_served_at`
   - If `now - last_served_at >= effective_mtbr`: serve content, update `last_served_at`
   - Otherwise: return 429 with retry information

**Response headers on success:**
```
X-RateLimit-Content-Reset: <unix timestamp when content can be served again>
X-RateLimit-Content-MTBR-Ms: <current minimum time between requests in milliseconds>
```

**Error response (429 Too Many Requests):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Wait until 2026-02-14T12:00:00Z",
  "cid": "00000008YWJjZGVmZ2g",
  "retry_after_seconds": 2591847,
  "next_available_at": "2026-02-14T12:00:00Z"
}
```

### POST /api/content/rate-limit/purchase

**Authentication:** Required

**Request:**
```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "min_time_between_requests_ms": 1000,
  "duration_seconds": 2592000
}
```

**Validation:**
- CID must exist
- CID must not be inline (would be rejected or no-op)
- `min_time_between_requests_ms` must be >= 100 (100ms minimum)
- `duration_seconds` must be > 0
- `duration_seconds` must not exceed CID's retention expiration
- `max_requests` must be >= 1 (i.e., duration >= MTBR)
- User must have sufficient balance

**Response:**
```json
{
  "purchase_id": "uuid",
  "cid": "00000008YWJjZGVmZ2g",
  "size_bytes": 1048576,
  "min_time_between_requests_ms": 1000,
  "duration_seconds": 2592000,
  "max_requests": 2592000,
  "max_bytes": 2718177484800,
  "price_cents": 2718,
  "starts_at": "2026-01-15T12:00:00Z",
  "expires_at": "2026-02-14T12:00:00Z"
}
```

**Error responses:**

```json
// CID retention expires before purchase duration
{
  "error": "duration_exceeds_retention",
  "message": "Cannot purchase rate limit beyond content retention. Content expires in 15 days.",
  "cid": "00000008YWJjZGVmZ2g",
  "content_expires_at": "2026-01-30T12:00:00Z",
  "max_duration_seconds": 1296000
}
```

```json
// Insufficient balance
{
  "error": "insufficient_balance",
  "message": "Insufficient balance. Required: $27.18, Available: $10.00",
  "required_cents": 2718,
  "available_cents": 1000
}
```

### GET /api/content/:cid/rate-limit

**Response:**
```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "size_bytes": 1048576,
  "is_inline": false,
  "last_served_at": "2026-01-15T11:30:00Z",
  "effective_mtbr_ms": null,
  "next_available_at": null,
  "is_rate_limited": true,
  "active_rate_limits": [],
  "default_rate_limit": null,
  "content_expires_at": "2026-03-15T12:00:00Z"
}
```

When content has active rate limits:
```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "size_bytes": 1048576,
  "is_inline": false,
  "last_served_at": "2026-01-15T11:30:00Z",
  "effective_mtbr_ms": 1000,
  "next_available_at": "2026-01-15T11:30:01Z",
  "is_rate_limited": false,
  "active_rate_limits": [
    {
      "record_id": "uuid",
      "min_time_between_requests_ms": 1000,
      "expires_at": "2026-02-14T12:00:00Z"
    }
  ],
  "default_rate_limit": {
    "min_time_between_requests_ms": 2592000000,
    "expires_at": "2026-02-14T12:00:00Z"
  },
  "content_expires_at": "2026-03-15T12:00:00Z"
}
```

## Business Logic

### Determining Effective MTBR

```javascript
function getEffectiveMTBR(contentMetadata, now) {
  // Collect all active rate limits
  const activeRateLimits = contentMetadata.rate_limit_records.filter(
    record => record.starts_at <= now && record.expires_at > now
  );

  // Include default rate limit if still active
  if (contentMetadata.default_rate_limit?.expires_at > now) {
    activeRateLimits.push({
      min_time_between_requests_ms: contentMetadata.default_rate_limit.min_time_between_requests_ms
    });
  }

  // If no active rate limits, return Infinity (content blocked)
  if (activeRateLimits.length === 0) {
    return Infinity;
  }

  // Return the LOWEST MTBR (most permissive)
  return Math.min(...activeRateLimits.map(r => r.min_time_between_requests_ms));
}
```

### Price Calculation

```javascript
const RATE_PER_BYTE = ???; // TBD - see Follow-up Question #1

function calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds) {
  const mtbrSeconds = mtbrMs / 1000;
  const maxRequests = Math.floor(durationSeconds / mtbrSeconds);

  if (maxRequests < 1) {
    throw new Error('Duration must be at least equal to MTBR');
  }

  const maxBytes = sizeBytes * maxRequests;
  const priceExact = maxBytes * RATE_PER_BYTE;
  const priceCents = Math.ceil(priceExact * 100); // Round up to nearest cent

  return {
    maxRequests,
    maxBytes,
    priceCents
  };
}
```

### Upload Flow Changes

When content is uploaded:
```javascript
// After successful upload (for non-inline CIDs)
contentMetadata.default_rate_limit = {
  min_time_between_requests_ms: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};
contentMetadata.last_served_at = null;
```

### Existing CID Migration

For CIDs uploaded before this feature launches:
```javascript
// No migration needed - absence of default_rate_limit means infinite MTBR
// getEffectiveMTBR returns Infinity when no active rate limits exist
```

## Rules Summary

### Rule 1: Inline CIDs Have No Rate Limit
CIDs that contain their encoded literal contents (≤64 bytes) are served without any rate limit. They do not require bandwidth payment.

### Rule 2: Default Rate Limit for New Uploads
All newly uploaded non-inline CIDs receive a default rate limit of 30-day MTBR for 30 days from upload time. This allows the uploader to serve the content once immediately, then once more 30 days later.

### Rule 3: Infinite MTBR After Expiration
When all rate limits (default and purchased) expire, the effective MTBR becomes infinite. Content cannot be served until someone purchases bandwidth.

### Rule 4: Existing CIDs Are Blocked
CIDs uploaded before this feature launches have no default rate limit and therefore have infinite MTBR. They require a bandwidth purchase to be served.

### Rule 5: Most Permissive Rate Limit Wins
When multiple rate limit records exist for a CID, the one with the lowest MTBR (most permissive) is used.

### Rule 6: Rate Limits Are Global Per-CID
The rate limit applies to ALL requests for a CID, not per-user. If user A requests a CID, user B must also wait for the MTBR to pass.

### Rule 7: No Refunds
- No refunds for unused bandwidth
- No refunds if content is contested/removed
- No refunds if content retention expires
- No refunds under any circumstances

### Rule 8: Cannot Purchase Beyond Retention
Users cannot purchase rate limits that extend beyond the content's retention expiration. The system will reject such purchases with a clear error message.

### Rule 9: Anyone Can Purchase
Any authenticated user can purchase bandwidth for any CID. You do not need to be the uploader.

### Rule 10: Minimum MTBR is 100ms
The minimum allowed time between requests is 100 milliseconds. This prevents abuse while allowing high-frequency serving.

### Rule 11: Consistency Over Performance
Rate limit checks use Durable Objects for strong consistency. This ensures no double-serving even across distributed Workers.

### Rule 12: Rate Limits Apply to Content, Not Metadata
Rate limits only apply to serving the actual content bytes. Metadata queries (checking rate limit status, content info) are not subject to content rate limits.

## Test Plan

### Unit Tests

#### Inline CID Detection Tests
```
TEST-INLINE-001: Inline CID (exactly 64 bytes content) should be served without rate limit
TEST-INLINE-002: Inline CID (1 byte content) should be served without rate limit
TEST-INLINE-003: Non-inline CID (65 bytes content) should be subject to rate limits
TEST-INLINE-004: Inline CID should not have last_served_at updated
TEST-INLINE-005: Inline CID should not return rate limit headers
TEST-INLINE-006: Attempting to purchase bandwidth for inline CID should fail
```

#### Default Rate Limit Tests
```
TEST-DEFAULT-001: Newly uploaded non-inline CID should have 30-day MTBR default
TEST-DEFAULT-002: Default rate limit should expire exactly 30 days after upload
TEST-DEFAULT-003: First request after upload should succeed (last_served_at is null)
TEST-DEFAULT-004: Second request immediately after first should fail with 429
TEST-DEFAULT-005: Request exactly 30 days after first request should succeed (within default window)
TEST-DEFAULT-006: Request 30 days minus 1ms after first request should fail
TEST-DEFAULT-007: After default expires, any request should return 429 with infinite wait
TEST-DEFAULT-008: After default expires, next_available_at should be null (never available without purchase)
```

#### Existing CID Tests
```
TEST-EXISTING-001: CID with no default_rate_limit should return 429
TEST-EXISTING-002: CID with no rate_limit_records should return 429
TEST-EXISTING-003: 429 for existing CID should indicate purchase required
TEST-EXISTING-004: Existing CID becomes servable after bandwidth purchase
```

#### Rate Limit Enforcement Tests
```
TEST-ENFORCE-001: Request before MTBR elapsed should return 429
TEST-ENFORCE-002: Request exactly at MTBR elapsed should succeed
TEST-ENFORCE-003: Request after MTBR elapsed should succeed
TEST-ENFORCE-004: 429 response message should be "Rate limit exceeded. Wait until {ISO timestamp}"
TEST-ENFORCE-005: 429 response should include correct retry_after_seconds
TEST-ENFORCE-006: 429 response should include correct next_available_at timestamp
TEST-ENFORCE-007: Successful request should update last_served_at
TEST-ENFORCE-008: Failed request (429) should NOT update last_served_at
TEST-ENFORCE-009: Rate limit headers should be present on successful requests
TEST-ENFORCE-010: Infinite MTBR should return 429 with null next_available_at
```

#### Rate Limit Purchase Tests
```
TEST-PURCHASE-001: Valid purchase should create rate limit record
TEST-PURCHASE-002: Purchase should deduct correct amount from balance
TEST-PURCHASE-003: Purchase with insufficient balance should fail with clear error
TEST-PURCHASE-004: Purchase price should be size_bytes × max_requests × rate_per_byte
TEST-PURCHASE-005: Purchase price should be rounded up to nearest cent
TEST-PURCHASE-006: Purchase for non-existent CID should fail
TEST-PURCHASE-007: Purchase for inline CID should fail
TEST-PURCHASE-008: Multiple purchases for same CID should stack
TEST-PURCHASE-009: Purchase should record transaction in PaymentRecord
TEST-PURCHASE-010: Purchase with MTBR < 100ms should fail
TEST-PURCHASE-011: Purchase with 0 or negative duration should fail
TEST-PURCHASE-012: Purchase with MTBR > duration should fail (max_requests < 1)
TEST-PURCHASE-013: Purchase extending beyond content retention should fail
TEST-PURCHASE-014: Purchase error should show max allowed duration
TEST-PURCHASE-015: Anyone can purchase bandwidth for any CID
TEST-PURCHASE-016: Purchase by non-uploader should succeed
```

#### Effective MTBR Calculation Tests
```
TEST-MTBR-001: Single active rate limit should be effective
TEST-MTBR-002: Multiple active rate limits should use lowest MTBR
TEST-MTBR-003: Expired rate limit should not be considered
TEST-MTBR-004: Future rate limit (not yet started) should not be considered
TEST-MTBR-005: Default rate limit should be included in calculation
TEST-MTBR-006: No active rate limits should result in Infinity MTBR
TEST-MTBR-007: Mix of default and purchased rate limits should use lowest
TEST-MTBR-008: Null default_rate_limit should be treated as no default
```

#### Rate Limit Expiration Tests
```
TEST-EXPIRE-001: Expired purchase should no longer affect effective MTBR
TEST-EXPIRE-002: When all rate limits expire, effective MTBR should be Infinity
TEST-EXPIRE-003: When one of multiple rate limits expires, next lowest MTBR applies
TEST-EXPIRE-004: Expired default rate limit should not apply
TEST-EXPIRE-005: Expired records should remain in history for audit
```

#### Timestamp and Timing Tests
```
TEST-TIME-001: last_served_at should use server time, not client time
TEST-TIME-002: All timestamps should be in UTC
TEST-TIME-003: Concurrent requests should not both succeed (atomic update via DO)
TEST-TIME-004: Minimum MTBR (100ms) should be enforceable
TEST-TIME-005: Very large MTBR (365 days) should be enforceable
TEST-TIME-006: MTBR stored in milliseconds for 100ms precision
```

#### Price Calculation Tests
```
TEST-PRICE-001: Price should be size × max_requests × rate_per_byte
TEST-PRICE-002: Price of $0.001 should round up to $0.01 (1 cent)
TEST-PRICE-003: Price of $0.019 should round up to $0.02 (2 cents)
TEST-PRICE-004: Price of $1.00 exactly should be 100 cents
TEST-PRICE-005: Very small purchase (sub-cent) should be 1 cent minimum due to rounding
TEST-PRICE-006: Large content × high frequency should calculate correctly
TEST-PRICE-007: max_bytes should equal size_bytes × max_requests
```

### Integration Tests

#### End-to-End Flow Tests
```
TEST-E2E-001: Upload → immediate request succeeds → second request fails with 429
TEST-E2E-002: Upload → wait 30 days → second request succeeds → third fails (still in default window)
TEST-E2E-003: Upload → wait 31 days → any request fails (default expired, infinite MTBR)
TEST-E2E-004: Existing CID → request fails → purchase bandwidth → request succeeds
TEST-E2E-005: Upload → purchase faster rate → verify new rate applies immediately
TEST-E2E-006: Purchase rate limit → expiration → verify reversion to next active or Infinity
TEST-E2E-007: Multiple users requesting same CID → rate limit is global
TEST-E2E-008: Inline content upload → unlimited requests forever
TEST-E2E-009: Purchase → content retention expires → content gone, no refund
```

#### API Response Tests
```
TEST-API-001: GET /api/content/:cid returns correct rate limit headers
TEST-API-002: GET /api/content/:cid/rate-limit returns accurate status
TEST-API-003: POST /api/content/rate-limit/purchase returns correct purchase details
TEST-API-004: 429 response body contains exactly: error, message, cid, retry_after_seconds, next_available_at
TEST-API-005: Rate limit purchase reflects in user balance immediately
TEST-API-006: Rate limit info displayed alongside size and retention
```

#### Concurrent Access Tests
```
TEST-CONCURRENT-001: Two simultaneous requests should result in exactly one success and one 429
TEST-CONCURRENT-002: Rapid sequential requests should respect MTBR
TEST-CONCURRENT-003: Durable Object provides atomic update preventing race conditions
TEST-CONCURRENT-004: Multiple Workers should see consistent last_served_at
```

### Edge Case Tests

```
TEST-EDGE-001: CID with exactly 64-byte content (boundary - is inline)
TEST-EDGE-002: CID with 65-byte content (just over inline threshold - has rate limit)
TEST-EDGE-003: Rate limit purchase at exact moment of default expiration
TEST-EDGE-004: Request at exact moment rate limit expires → should use pre-expiry MTBR
TEST-EDGE-005: Content that was uploaded but never requested (last_served_at null)
TEST-EDGE-006: First request on existing CID (no default) → 429
TEST-EDGE-007: Purchase for CID that user did not upload → succeeds
TEST-EDGE-008: Rate limit check when content has been deleted/expired → appropriate error
TEST-EDGE-009: User deletes account → their rate limit purchases remain active for CID
TEST-EDGE-010: Content retention expires during active rate limit purchase → no refund
TEST-EDGE-011: Purchase duration exactly matches remaining retention → succeeds
TEST-EDGE-012: Purchase duration 1 second over remaining retention → fails
TEST-EDGE-013: MTBR of exactly 100ms → succeeds
TEST-EDGE-014: MTBR of 99ms → fails
TEST-EDGE-015: Duration exactly equal to MTBR (max_requests = 1) → succeeds
TEST-EDGE-016: Zero-byte content (empty file) → is inline, no rate limit
```

## Implementation Phases

### Phase 1: Data Model & Basic Enforcement
- Add rate limit fields to ContentMetadata DO
- Implement `last_served_at` tracking
- Apply 30-day default to new uploads
- Return 429 for rate-limited requests (infinite MTBR)
- Exempt inline CIDs
- Existing CIDs default to infinite MTBR

### Phase 2: Rate Limit Purchase API
- Implement purchase endpoint with validation
- Integrate with payment system
- Create rate limit records
- Calculate effective MTBR with multiple records
- Enforce retention constraint on purchase duration

### Phase 3: User Interface
- Show rate limit status alongside size and retention on content detail page
- Purchase flow in frontend
- Simple 429 error messaging

### Phase 4: Testing & Documentation
- Comprehensive test suite
- API documentation
- User-facing documentation

## Appendix: Example Scenarios

### Scenario A: New Upload Default
1. User uploads 1MB file at T=0
2. CID gets 30-day MTBR, expires at T+30d
3. User A requests content at T+1h → succeeds, last_served_at = T+1h
4. User B requests content at T+2h → 429 "Rate limit exceeded. Wait until T+30d+1h"
5. At T+30d+1h, User B requests → succeeds, last_served_at = T+30d+1h
6. At T+31d, default expires → effective MTBR = Infinity
7. Any request → 429 (must purchase bandwidth)

### Scenario B: Existing CID (Pre-Feature)
1. CID was uploaded before feature launch
2. No default_rate_limit exists
3. User requests content → 429 (infinite MTBR)
4. User purchases 1-second MTBR for 7 days
5. Content now servable once per second for 7 days
6. After 7 days → back to infinite MTBR

### Scenario C: Inline Content
1. User uploads "Hello" (5 bytes)
2. CID is inline (content encoded in CID itself)
3. No rate limit applied, no default set
4. Any user can request unlimited times forever
5. Attempting to purchase bandwidth → error (not applicable)

### Scenario D: Stacked Purchases
1. User A purchases 1-hour MTBR for 30 days
2. User B purchases 1-minute MTBR for 7 days
3. For days 1-7: effective MTBR = 1 minute (lowest)
4. For days 8-30: effective MTBR = 1 hour (only remaining)
5. After day 30: effective MTBR = Infinity (all expired)

### Scenario E: Retention Constraint
1. CID has 15 days remaining retention
2. User tries to purchase 30-day rate limit → error
3. Error: "Cannot purchase rate limit beyond content retention. Content expires in 15 days."
4. User purchases 14-day rate limit → succeeds
5. At day 15, content expires (even if rate limit still "active")

## Follow-up Questions

1. **What is the rate per byte for pricing?**
   - Need a specific number (e.g., $0.00000001 per byte = $10.74 per TB)
   - This determines all pricing in the system

2. **Should edge caching be disabled for rate-limited content?**
   - Since this is about paying for bandwidth, edge cache hits would bypass the payment mechanism
   - Options:
     - A) Disable caching entirely for non-inline content (Cache-Control: no-store)
     - B) Set cache TTL to match MTBR (complex, may not work with infinite MTBR)
     - C) Accept that edge cache may serve some "unpaid" requests (simpler, some revenue leakage)
