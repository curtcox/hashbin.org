# Content Rate Limiting Plan

## Overview

This document describes a system for rate limiting content retrieval based on Content IDs (CIDs). Users can pay to increase the serving frequency of specific content for a defined duration.

## Core Concepts

### Rate Limiting Model

Each CID has a **minimum time between requests** (MTBR). When content is requested:
1. Check if sufficient time has passed since the last request
2. If yes: serve the content and record the timestamp
3. If no: return a rate limit exceeded error

### Pricing Model

Users pay to **decrease the MTBR** for a specific CID for a specific duration. The price is calculated as:

```
Price = Base Rate × Max Requests During Duration

Where:
  Max Requests = Duration / Minimum Time Between Requests
```

**Example:**
- Duration: 30 days (2,592,000 seconds)
- Desired MTBR: 1 second
- Max Requests: 2,592,000
- If Base Rate = $0.000001 per request: Price = $2.59

### Default Rate Limits

| Content Type | Default MTBR | Duration |
|--------------|--------------|----------|
| Newly uploaded CID | 30 days | 30 days from upload |
| Inline CID (≤64 bytes) | None | Permanent |
| Expired rate limit purchase | Reverts to previous tier or default |

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
      min_time_between_requests_seconds: number,
      starts_at: ISO timestamp,
      expires_at: ISO timestamp,
      max_requests: number,
      price_cents: number,
      created_at: ISO timestamp
    }
  ],
  // Default rate limit applied at upload
  default_rate_limit: {
    min_time_between_requests_seconds: number,
    expires_at: ISO timestamp
  }
}
```

### New Table: RateLimitPurchase (or extend PaymentRecord)

```javascript
{
  purchase_id: UUID,
  transaction_id: UUID,  // Links to PaymentRecord
  user_id: string,
  cid: string,
  min_time_between_requests_seconds: number,
  duration_seconds: number,
  starts_at: ISO timestamp,
  expires_at: ISO timestamp,
  max_requests: number,
  price_cents: number,
  created_at: ISO timestamp
}
```

## API Endpoints

### GET /api/content/:cid

**Modified behavior:**

1. Check if CID is inline (≤64 bytes encoded) → serve immediately, no rate limit
2. Retrieve ContentMetadata
3. Determine effective MTBR (lowest active rate limit, or default)
4. Check `last_served_at`:
   - If `null` or `now - last_served_at >= effective_mtbr`: serve content, update `last_served_at`
   - Otherwise: return 429 with retry information

**New response headers:**
```
X-RateLimit-Content-Reset: <unix timestamp when content can be served again>
X-RateLimit-Content-MTBR: <current minimum time between requests in seconds>
Retry-After: <seconds until content can be served>
```

**New error response (429 Too Many Requests):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Content rate limit exceeded. Try again later.",
  "cid": "00000008YWJjZGVmZ2g",
  "retry_after_seconds": 2591847,
  "next_available_at": "2026-02-14T12:00:00Z",
  "current_mtbr_seconds": 2592000,
  "upgrade_url": "/api/content/rate-limit/purchase"
}
```

### POST /api/content/rate-limit/purchase

**Request:**
```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "min_time_between_requests_seconds": 60,
  "duration_seconds": 2592000
}
```

**Response:**
```json
{
  "purchase_id": "uuid",
  "cid": "00000008YWJjZGVmZ2g",
  "min_time_between_requests_seconds": 60,
  "duration_seconds": 2592000,
  "max_requests": 43200,
  "price_cents": 432,
  "starts_at": "2026-01-15T12:00:00Z",
  "expires_at": "2026-02-14T12:00:00Z"
}
```

### GET /api/content/:cid/rate-limit

**Response:**
```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "is_inline": false,
  "last_served_at": "2026-01-15T11:30:00Z",
  "effective_mtbr_seconds": 2592000,
  "next_available_at": "2026-02-14T11:30:00Z",
  "active_rate_limits": [
    {
      "record_id": "uuid",
      "min_time_between_requests_seconds": 2592000,
      "expires_at": "2026-02-14T12:00:00Z",
      "is_default": true
    }
  ],
  "default_rate_limit": {
    "min_time_between_requests_seconds": 2592000,
    "expires_at": "2026-02-14T12:00:00Z"
  }
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
      min_time_between_requests_seconds: contentMetadata.default_rate_limit.min_time_between_requests_seconds,
      is_default: true
    });
  }

  // If no active rate limits, content has no MTBR (unlimited)
  if (activeRateLimits.length === 0) {
    return 0; // No rate limit
  }

  // Return the LOWEST MTBR (most permissive)
  return Math.min(...activeRateLimits.map(r => r.min_time_between_requests_seconds));
}
```

### Price Calculation

```javascript
function calculateRateLimitPrice(mtbrSeconds, durationSeconds, baseRatePerRequest) {
  const maxRequests = Math.floor(durationSeconds / mtbrSeconds);
  const priceCents = Math.ceil(maxRequests * baseRatePerRequest * 100);
  return {
    maxRequests,
    priceCents: Math.max(priceCents, MINIMUM_PURCHASE_CENTS) // e.g., 100 cents minimum
  };
}
```

### Upload Flow Changes

When content is uploaded:
```javascript
// After successful upload
contentMetadata.default_rate_limit = {
  min_time_between_requests_seconds: 30 * 24 * 60 * 60, // 30 days in seconds
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};
contentMetadata.last_served_at = null;
```

## Edge Cases and Rules

### Rule 1: Inline CIDs Have No Rate Limit
CIDs that contain their encoded literal contents (≤64 bytes) are served without any rate limit. These are identified by decoding the CID and checking if the content can be extracted directly.

### Rule 2: Default Rate Limit for New Uploads
All newly uploaded CIDs receive a default rate limit of 30 days MTBR for 30 days from upload time.

### Rule 3: Most Permissive Rate Limit Wins
When multiple rate limit records exist for a CID, the one with the lowest MTBR (most permissive) is used.

### Rule 4: Rate Limits Are Global Per-CID
The rate limit applies to ALL requests for a CID, not per-user. If user A requests a CID, user B must also wait for the MTBR to pass.

### Rule 5: Expired Rate Limits Revert
When a purchased rate limit expires, the effective MTBR reverts to the next most permissive active rate limit, or to unlimited if no rate limits remain.

### Rule 6: Rate Limit Purchases Stack
Multiple users can purchase rate limits for the same CID. The most permissive one applies.

### Rule 7: Rate Limits Apply to Content, Not Metadata
Rate limits only apply to serving the actual content. Metadata queries (e.g., checking rate limit status) are not rate limited by this system.

### Rule 8: Last Served Timestamp is Authoritative
The `last_served_at` timestamp is updated atomically when content is served, ensuring consistent enforcement across distributed Workers.

## Test Plan

### Unit Tests

#### Inline CID Detection Tests
```
TEST-INLINE-001: Inline CID (exactly 64 bytes content) should be served without rate limit
TEST-INLINE-002: Inline CID (1 byte content) should be served without rate limit
TEST-INLINE-003: Non-inline CID (65 bytes content) should be subject to rate limits
TEST-INLINE-004: Inline CID should not have last_served_at updated
TEST-INLINE-005: Inline CID should not return rate limit headers
```

#### Default Rate Limit Tests
```
TEST-DEFAULT-001: Newly uploaded CID should have 30-day MTBR default
TEST-DEFAULT-002: Default rate limit should expire exactly 30 days after upload
TEST-DEFAULT-003: Content requested within 30 days of upload and within 30 days of last request should be rate limited
TEST-DEFAULT-004: After default expires (30 days from upload), CID should have no rate limit if no purchases
TEST-DEFAULT-005: First request after upload should succeed (last_served_at is null)
TEST-DEFAULT-006: Second request immediately after first should fail with 429
TEST-DEFAULT-007: Request exactly 30 days after first request should succeed
TEST-DEFAULT-008: Request 30 days minus 1 second after first request should fail
```

#### Rate Limit Enforcement Tests
```
TEST-ENFORCE-001: Request before MTBR elapsed should return 429
TEST-ENFORCE-002: Request exactly at MTBR elapsed should succeed
TEST-ENFORCE-003: Request after MTBR elapsed should succeed
TEST-ENFORCE-004: 429 response should include correct retry_after_seconds
TEST-ENFORCE-005: 429 response should include correct next_available_at timestamp
TEST-ENFORCE-006: Successful request should update last_served_at
TEST-ENFORCE-007: Failed request (429) should NOT update last_served_at
TEST-ENFORCE-008: Rate limit headers should be present on successful requests
TEST-ENFORCE-009: Rate limit headers should be present on 429 responses
```

#### Rate Limit Purchase Tests
```
TEST-PURCHASE-001: Valid purchase should create rate limit record
TEST-PURCHASE-002: Purchase should deduct correct amount from balance
TEST-PURCHASE-003: Purchase with insufficient balance should fail
TEST-PURCHASE-004: Purchase price should be calculated as max_requests × base_rate
TEST-PURCHASE-005: Purchase should respect minimum purchase amount
TEST-PURCHASE-006: Purchase for non-existent CID should fail
TEST-PURCHASE-007: Purchase for inline CID should fail (or succeed but be no-op?)
TEST-PURCHASE-008: Multiple purchases for same CID should stack
TEST-PURCHASE-009: Purchase should record transaction in PaymentRecord
TEST-PURCHASE-010: Purchase with 0 or negative MTBR should fail
TEST-PURCHASE-011: Purchase with 0 or negative duration should fail
TEST-PURCHASE-012: Purchase with MTBR greater than duration should fail (max_requests < 1)
```

#### Effective MTBR Calculation Tests
```
TEST-MTBR-001: Single active rate limit should be effective
TEST-MTBR-002: Multiple active rate limits should use lowest MTBR
TEST-MTBR-003: Expired rate limit should not be considered
TEST-MTBR-004: Future rate limit (not yet started) should not be considered
TEST-MTBR-005: Default rate limit should be included in calculation
TEST-MTBR-006: No active rate limits should result in MTBR of 0 (unlimited)
TEST-MTBR-007: Mix of default and purchased rate limits should use lowest
TEST-MTBR-008: Rate limit expiring during request should use pre-expiry MTBR
```

#### Rate Limit Expiration Tests
```
TEST-EXPIRE-001: Expired purchase should no longer affect effective MTBR
TEST-EXPIRE-002: When all rate limits expire, content should be unlimited
TEST-EXPIRE-003: When one of multiple rate limits expires, next lowest MTBR applies
TEST-EXPIRE-004: Expired default rate limit should not apply
TEST-EXPIRE-005: Expired records should remain in history but marked inactive
```

#### Timestamp and Timing Tests
```
TEST-TIME-001: last_served_at should use server time, not client time
TEST-TIME-002: Timezone handling should be consistent (UTC)
TEST-TIME-003: Clock skew between Workers should not cause double-serving
TEST-TIME-004: Concurrent requests should not both succeed (atomic update)
TEST-TIME-005: Very small MTBR (1 second) should be enforceable
TEST-TIME-006: Very large MTBR (365 days) should be enforceable
```

### Integration Tests

#### End-to-End Flow Tests
```
TEST-E2E-001: Upload → immediate request succeeds → second request fails
TEST-E2E-002: Upload → wait 30 days → unlimited requests
TEST-E2E-003: Upload → purchase faster rate → verify new rate applies
TEST-E2E-004: Purchase rate limit → expiration → verify reversion to default
TEST-E2E-005: Multiple users requesting same CID → rate limit is global
TEST-E2E-006: Inline content upload → unlimited requests
```

#### API Response Tests
```
TEST-API-001: GET /api/content/:cid returns correct rate limit headers
TEST-API-002: GET /api/content/:cid/rate-limit returns accurate status
TEST-API-003: POST /api/content/rate-limit/purchase returns correct purchase details
TEST-API-004: 429 response body contains all required fields
TEST-API-005: Rate limit purchase reflects in user balance immediately
```

#### Concurrent Access Tests
```
TEST-CONCURRENT-001: Two simultaneous requests should result in one 429
TEST-CONCURRENT-002: Rapid sequential requests should respect MTBR
TEST-CONCURRENT-003: Durable Object lock should prevent race conditions
TEST-CONCURRENT-004: Multiple Workers should see consistent last_served_at
```

### Edge Case Tests

```
TEST-EDGE-001: CID with exactly 64-byte content (boundary of inline)
TEST-EDGE-002: CID with 65-byte content (just over inline threshold)
TEST-EDGE-003: Rate limit purchase at exact moment of default expiration
TEST-EDGE-004: Request at exact moment rate limit expires
TEST-EDGE-005: Content that was uploaded but never requested
TEST-EDGE-006: Content requested once then never again for years
TEST-EDGE-007: Purchase for CID that user did not upload (should this be allowed?)
TEST-EDGE-008: Rate limit check when content has been deleted/expired
TEST-EDGE-009: User deletes account - what happens to their rate limit purchases?
TEST-EDGE-010: Content expiration during active rate limit purchase
```

## Open Questions

### Pricing Questions

1. **Q: What is the base rate per request for pricing?**
   - Options: $0.000001, $0.00001, $0.0001, variable by content size?
   - Impact: Directly affects all purchase prices

2. **Q: Should there be a minimum purchase amount?**
   - Current suggestion: $1.00 minimum (consistent with upload pricing)
   - Alternative: No minimum, allow micro-purchases

3. **Q: Should pricing vary by content size?**
   - Option A: Flat rate per request regardless of size
   - Option B: Price per GB transferred (similar to CDN pricing)
   - Option C: Tiered pricing based on content size

4. **Q: Should there be bulk discounts for longer durations or lower MTBRs?**
   - Example: 10% off for 1-year purchases

### Rate Limit Questions

5. **Q: What is the minimum allowed MTBR?**
   - Options: 1 second, 100ms, unlimited (whatever you pay for)?
   - Security consideration: Prevent abuse/DDoS amplification

6. **Q: What happens to content with no active rate limits and expired default?**
   - Option A: Unlimited (no rate limit)
   - Option B: System-wide default (e.g., 1 request per second)
   - Option C: Per-user rate limit kicks in

7. **Q: Should rate limits be per-CID globally or per-user-per-CID?**
   - Current design: Global per-CID
   - Alternative: Each user has their own rate limit quota for each CID

8. **Q: What happens if the CID's retention expires during an active rate limit purchase?**
   - Option A: Refund remaining value
   - Option B: No refund (user should have extended retention)
   - Option C: Rate limit purchase automatically extends retention

### Business Logic Questions

9. **Q: Can anyone purchase a rate limit for any CID, or only the uploader?**
   - Option A: Anyone can purchase (democratized)
   - Option B: Only uploader can purchase
   - Option C: Uploader + anyone uploader authorizes

10. **Q: Should rate limit purchases be transferable?**
    - Can a user sell/gift their rate limit purchase to another?

11. **Q: Should there be a limit on how many rate limit purchases a single CID can have?**
    - Prevent abuse of the stacking behavior

12. **Q: What happens to rate limit purchases if content is contested/removed?**
    - Refund policy for content moderation cases

### Technical Questions

13. **Q: How do we handle the 30-day default for CIDs uploaded before this feature launches?**
    - Option A: All existing CIDs are grandfathered with no rate limit
    - Option B: All existing CIDs get 30-day default starting from feature launch
    - Option C: Migration script to set defaults based on upload date

14. **Q: Should rate limit status be cached?**
    - Trade-off: Performance vs. consistency
    - Durable Objects provide strong consistency but have latency

15. **Q: How do we handle rate limit checks for content served from edge cache?**
    - Option A: Disable caching for rate-limited content
    - Option B: Cache with short TTL matching MTBR
    - Option C: Cache invalidation on rate limit changes

16. **Q: Should we track actual request count against max_requests?**
    - Current design: Only tracks last_served_at
    - Alternative: Also track count to show "X of Y requests used"

### User Experience Questions

17. **Q: How should we communicate rate limits to users who don't know about them?**
    - Need clear messaging when they first encounter a 429

18. **Q: Should users be notified when their rate limit purchase is about to expire?**
    - Email notification X days before expiration?

19. **Q: Should there be a dashboard showing all rate limit purchases?**
    - View active purchases, expiration dates, usage

20. **Q: Should the 429 response include pricing for the user to upgrade?**
    - Show "Pay $X to get immediate access"

## Implementation Phases

### Phase 1: Data Model & Basic Enforcement
- Add rate limit fields to ContentMetadata DO
- Implement `last_served_at` tracking
- Apply 30-day default to new uploads
- Return 429 for rate-limited requests
- Exempt inline CIDs

### Phase 2: Rate Limit Purchase API
- Implement purchase endpoint
- Integrate with payment system
- Create rate limit records
- Calculate effective MTBR with multiple records

### Phase 3: User Interface
- Rate limit status on content detail page
- Purchase flow in frontend
- Dashboard for managing purchases
- Clear 429 error messaging

### Phase 4: Migration & Edge Cases
- Handle existing content
- Edge cache integration
- Monitoring and alerting
- Documentation

## Appendix: Example Scenarios

### Scenario A: New Upload Default
1. User uploads 1MB file at T=0
2. CID gets 30-day MTBR, expires at T+30d
3. User A requests content at T+1h → succeeds, last_served_at = T+1h
4. User B requests content at T+2h → fails (need to wait until T+30d+1h)
5. User B waits and requests at T+30d+1h → succeeds

### Scenario B: Purchased Rate Limit
1. Content exists with 30-day default
2. User purchases 1-hour MTBR for 7 days, starting now
3. Effective MTBR drops to 1 hour
4. After 7 days, effective MTBR returns to 30 days (if default still active)

### Scenario C: Inline Content
1. User uploads "Hello" (5 bytes)
2. CID is inline (content encoded in CID itself)
3. No rate limit applied
4. Any user can request unlimited times

### Scenario D: Stacked Purchases
1. User A purchases 1-hour MTBR for 30 days
2. User B purchases 1-minute MTBR for 7 days
3. For days 1-7: effective MTBR = 1 minute (lowest)
4. For days 8-30: effective MTBR = 1 hour (only remaining)
5. After day 30: no rate limit (all expired)
