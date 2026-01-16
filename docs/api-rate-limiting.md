# Content Rate Limiting API

This document describes the API endpoints for managing content rate limits.

## Overview

Content rate limiting allows users to pay for bandwidth by purchasing the right to serve specific content at a defined frequency for a defined duration. This is a bandwidth payment system, not an access control mechanism.

## Key Concepts

- **MTBR (Minimum Time Between Requests)**: The minimum time that must pass between content requests
- **Inline Content**: Content ≤64 bytes that is encoded directly in the CID and has no rate limits
- **Default Rate Limit**: New uploads get a 30-day MTBR for 30 days from upload
- **Purchased Rate Limits**: Users can purchase faster rate limits (lower MTBR) for any duration

## Endpoints

### GET /api/content/:cid/rate-limit

Get the current rate limit status for content.

**Authentication**: Not required (public endpoint)

**Response**: 200 OK

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

**Fields**:
- `is_inline`: If true, content has no rate limits
- `effective_mtbr_ms`: Current MTBR in milliseconds (null if rate limited/infinite)
- `next_available_at`: When content can next be served (null if available now or rate limited)
- `is_rate_limited`: True if effective MTBR is infinite (content blocked)
- `active_rate_limits`: List of currently active purchased rate limits
- `default_rate_limit`: The 30-day default rate limit (if still active)

### POST /api/content/rate-limit/purchase

Purchase bandwidth for content.

**Authentication**: Required

**Request Body**:

```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "min_time_between_requests_ms": 1000,
  "duration_seconds": 2592000
}
```

**Validation Rules**:
- `min_time_between_requests_ms` must be >= 100ms
- `duration_seconds` must be > 0
- `duration_seconds` must not exceed content's remaining retention
- CID must exist and not be inline
- User must have sufficient balance

**Response**: 201 Created

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

**Pricing Formula**:
```
Price = Size (bytes) × Max Requests × Rate Per Byte
Max Requests = floor(Duration / MTBR)
Rate Per Byte = $0.01 / (1024 * 1024 * 1024) = $0.00000000000931 per byte
Final Price = ceil(Price to nearest $0.01)
```

**Error Responses**:

**400 Bad Request - Duration exceeds retention**:
```json
{
  "error": "duration_exceeds_retention",
  "message": "Cannot purchase rate limit beyond content retention. Content expires in 15 days.",
  "cid": "00000008YWJjZGVmZ2g",
  "content_expires_at": "2026-01-30T12:00:00Z",
  "max_duration_seconds": 1296000
}
```

**400 Bad Request - Insufficient balance**:
```json
{
  "error": "insufficient_balance",
  "message": "Insufficient balance. Required: $27.18, Available: $10.00",
  "required_cents": 2718,
  "available_cents": 1000
}
```

**400 Bad Request - Inline content**:
```json
{
  "error": "Invalid content",
  "message": "Cannot purchase rate limits for inline content (≤64 bytes). Inline content has no rate limits."
}
```

### GET /{cid} or GET /{cid}.{ext}

Download content (rate limits enforced here).

**Authentication**: Not required (public endpoint)

**Response Headers** (on success):
```
X-RateLimit-Content-Reset: 1737027601
X-RateLimit-Content-MTBR-Ms: 1000
```

**Error Response**: 429 Too Many Requests

```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Wait until 2026-02-14T12:00:00Z",
  "cid": "00000008YWJjZGVmZ2g",
  "retry_after_seconds": 2591847,
  "next_available_at": "2026-02-14T12:00:00Z"
}
```

**Special Cases**:
- Inline content (≤64 bytes): Never rate limited, served immediately
- First request after upload: Allowed (uses default rate limit)
- No active rate limits: Returns 429 with `next_available_at: null`

## Rate Limiting Rules

1. **Inline CIDs Have No Rate Limit**: Content ≤64 bytes is served without rate limits
2. **Default Rate Limit for New Uploads**: Non-inline content gets 30-day MTBR for 30 days
3. **Infinite MTBR After Expiration**: When all rate limits expire, content is blocked (429)
4. **Existing CIDs Are Blocked**: Content uploaded before this feature has infinite MTBR
5. **Most Permissive Rate Limit Wins**: Lowest MTBR among active rate limits is used
6. **Rate Limits Are Global Per-CID**: Rate limits apply to ALL requests, not per-user
7. **No Refunds**: No refunds under any circumstances
8. **Cannot Purchase Beyond Retention**: Purchases cannot extend beyond content expiration
9. **Anyone Can Purchase**: Any authenticated user can purchase bandwidth for any CID
10. **Minimum MTBR is 100ms**: Cannot purchase rate limits faster than 100ms

## Example Scenarios

### Scenario A: New Upload Default

1. User uploads 1MB file at T=0
2. CID gets 30-day MTBR, expires at T+30d
3. User A requests at T+1h → succeeds (first request)
4. User B requests at T+2h → 429 "Wait until T+30d+1h"
5. At T+30d+1h, request succeeds
6. At T+31d, default expires → infinite MTBR (429)

### Scenario B: Existing CID (Pre-Feature)

1. CID uploaded before feature launch
2. No default_rate_limit
3. Request → 429 (infinite MTBR)
4. User purchases 1-second MTBR for 7 days
5. Content servable once per second for 7 days
6. After 7 days → infinite MTBR again

### Scenario C: Inline Content

1. User uploads "Hello" (5 bytes)
2. CID is inline (content in CID itself)
3. No rate limit, no default
4. Unlimited requests forever
5. Attempting to purchase → error

### Scenario D: Stacked Purchases

1. User A purchases 1-hour MTBR for 30 days
2. User B purchases 1-minute MTBR for 7 days
3. Days 1-7: effective MTBR = 1 minute (lowest)
4. Days 8-30: effective MTBR = 1 hour
5. After day 30: infinite MTBR (all expired)

## Testing

Run the rate limiting test suite:

```bash
npm run test:ratelimit
```

This runs 30 comprehensive tests covering:
- Data model changes
- Rate limit enforcement
- Purchase API validation
- Pricing calculations
- Error responses
- Inline content exemption
