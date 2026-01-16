# Edge Caching Strategy for Rate-Limited Content

## Overview

This document analyzes edge caching strategies for content subject to rate limiting. The core tension: rate limiting is fundamentally a bandwidth payment mechanism, but edge caches can serve content without hitting the origin server, potentially bypassing the payment enforcement.

## Context

The [content rate limiting system](content_rate_limit.md) charges users based on maximum potential bytes transferred:

```
Price = Size × Max Requests × Rate Per Byte
```

Users pay upfront for the bandwidth they might consume. The system tracks `last_served_at` at the origin to enforce minimum time between requests (MTBR).

## The Problem

When content is cached at edge locations:
1. User A requests content → origin serves it, updates `last_served_at`, edge caches it
2. User B requests content from same edge → edge serves cached copy, origin never sees the request
3. The `last_served_at` is not updated, and no rate limit is enforced for User B's request

This creates a gap between what was paid for (potential bandwidth from origin) and what's actually consumed (bandwidth from edge + origin).

## Options Analysis

### Option A: Disable Caching Entirely

**Implementation:**
```http
Cache-Control: no-store, no-cache, must-revalidate
```

**Pros:**
- Simplest to implement
- Perfect enforcement of rate limits
- No revenue leakage
- Predictable behavior

**Cons:**
- Higher latency for all requests (always hit origin)
- Higher origin server load
- Higher bandwidth costs for origin-to-edge transfer
- Worse user experience globally
- Does not leverage Cloudflare's global network effectively

**Revenue Impact:** None (all requests enforced)

**Cost Impact:** Higher (more origin bandwidth, more DO invocations)

### Option B: Set Cache TTL to Match MTBR

**Implementation:**
```http
Cache-Control: public, max-age={MTBR_seconds}
```

**Pros:**
- Leverages edge caching within the paid window
- Rate limit roughly aligned with cache expiration
- Better performance than no caching

**Cons:**
- Complex implementation (dynamic Cache-Control headers)
- Does not work with infinite MTBR (cannot set infinite max-age)
- Edge locations have independent caches (global rate limit vs per-edge cache)
- Race conditions: content could be served from multiple edges simultaneously
- Cache invalidation across edges is not instant
- MTBR can be as low as 100ms, which would mean essentially no caching

**Revenue Impact:** Some leakage due to multi-edge serving and timing gaps

**Cost Impact:** Lower than Option A, but complex to tune

### Option C: Accept Edge Cache Leakage

**Implementation:**
```http
Cache-Control: public, max-age=60
```
(Or use Cloudflare's default caching behavior)

**Pros:**
- Best performance and user experience
- Lowest origin costs
- Simplest ongoing maintenance
- Leverages Cloudflare's CDN fully
- Cached content reduces load on Durable Objects

**Cons:**
- Some requests bypass rate limiting
- Revenue leakage for popular content
- Users effectively get more bandwidth than paid for
- Makes the "paying for bandwidth" model somewhat inconsistent

**Revenue Impact:** Moderate leakage, especially for popular content

**Cost Impact:** Lowest (CDN absorbs most traffic)

### Option D: Hybrid Approach with Tiered Caching

**Implementation:**
- No caching for content with MTBR < 60 seconds (high-frequency, premium tier)
- Standard caching (e.g., 60 seconds) for content with MTBR >= 60 seconds

```javascript
function getCacheControl(effectiveMtbrMs) {
  if (effectiveMtbrMs < 60000) {
    return 'no-store, no-cache, must-revalidate';
  }
  return 'public, max-age=60';
}
```

**Pros:**
- Balances enforcement with performance
- Premium (low MTBR) content gets strict enforcement
- Casual content gets better performance
- Revenue protected for high-value purchases

**Cons:**
- More complex logic
- Two different behaviors to explain/document
- Edge cases at the threshold

**Revenue Impact:** Protected for premium tier, some leakage for standard tier

**Cost Impact:** Moderate (premium tier has higher costs, standard tier has lower)

### Option E: Disable Caching with Edge Compute Enforcement

**Implementation:**
- Use Cloudflare Workers at the edge to check rate limits
- Store rate limit state in Durable Objects (already planned)
- Serve from edge cache only after DO confirms request is allowed

**Pros:**
- Perfect rate limit enforcement
- Can still leverage edge caching for the response body
- Low latency for rate limit checks (DO is distributed)
- Most architecturally sound solution

**Cons:**
- Already the current design (DO-based enforcement)
- Every request still hits the DO
- No reduction in DO invocations
- Caching only helps with response body transfer, not logic

**Revenue Impact:** None (all requests enforced)

**Cost Impact:** Higher (every request invokes DO)

## Recommendation

**Recommended: Option A - Disable Caching Entirely**

### Rationale

1. **Consistency with the Business Model**

   The rate limiting system is explicitly a bandwidth payment mechanism. Users pay for "maximum potential bytes transferred." If edge caching allows unpaid bandwidth consumption, the pricing model becomes misleading. Disabling caching ensures the system works exactly as documented.

2. **Simplicity**

   Options B and D introduce complexity with unclear benefits. The edge cache TTL approach (Option B) has fundamental issues with infinite MTBR and multi-edge synchronization. The hybrid approach (Option D) creates two different behaviors that are harder to explain and maintain.

3. **Durable Objects Already Handle Distribution**

   The architecture already uses Durable Objects for rate limit enforcement. DOs provide strong consistency across all edge locations. Adding edge caching creates a second layer that undermines this consistency. The DO design assumes all requests hit the origin.

4. **Cost Consideration is Secondary**

   While disabling caching increases origin costs, this is offset by:
   - Rate limiting naturally reduces request volume
   - Users are paying for the bandwidth they consume
   - The pricing can factor in these costs
   - Inline content (<=64 bytes) has no rate limit and can be cached separately

5. **Predictability for Users**

   Users who purchase bandwidth want predictable behavior. If edge caching causes some requests to succeed "for free," it creates confusion. A request that should fail (rate limited) might succeed from a warm cache, then fail on the next request.

6. **Revenue Protection**

   The $0.01/GB pricing is already very low. Any revenue leakage from edge caching would erode margins further. Strict enforcement ensures the business model is sustainable.

### Implementation

For non-inline content responses:
```http
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
```

For inline content (<=64 bytes), which has no rate limit:
```http
Cache-Control: public, max-age=31536000, immutable
```

### Exceptions

Consider allowing caching for:
- **Inline CIDs**: Already exempt from rate limiting, can be cached indefinitely
- **Content metadata endpoints**: Rate limit status checks don't serve content bytes
- **Static assets**: CSS, JS, images for the web UI (not user content)

### Future Considerations

If origin costs become prohibitive, revisit Option D (hybrid approach) with clear documentation that:
- Content with MTBR < X gets strict enforcement
- Content with MTBR >= X may be served from cache within a window
- Pricing reflects this distinction

However, start with the simpler, more consistent Option A and optimize only if needed.

## Summary Table

| Option | Enforcement | Performance | Complexity | Recommendation |
|--------|-------------|-------------|------------|----------------|
| A: No caching | Perfect | Lower | Low | **Recommended** |
| B: TTL = MTBR | Approximate | Better | High | Not recommended |
| C: Accept leakage | Poor | Best | Low | Not recommended |
| D: Hybrid | Mixed | Mixed | Medium | Future consideration |
| E: Edge compute | Perfect | Medium | High | Already the design |

## Decision

**Disable edge caching for all rate-limited content (non-inline CIDs).**

This ensures the rate limiting system works as designed and documented, maintains pricing integrity, and keeps the implementation simple. Inline content can be cached aggressively since it has no rate limits.
