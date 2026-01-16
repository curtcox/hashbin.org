# Edge Caching Strategy for Rate-Limited Content

## Overview

This document analyzes edge caching strategies for content subject to rate limiting.

## Key Finding: Cloudflare CDN Bandwidth is Free

Cloudflare does not charge for edge cache bandwidth on any plan (including Free). All plans include unlimited CDN bandwidth. Workers also have no egress/bandwidth charges.

This fundamentally changes the analysis. If hashbin incurs no cost for edge-cached requests, there's no financial reason to disable caching.

Sources:
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) - "no data transfer (egress) or throughput (bandwidth) charges"
- [Cloudflare Plans](https://www.cloudflare.com/plans/) - unlimited bandwidth on all plans

## Recommendation

**Use default Cloudflare caching behavior.**

### Rationale

1. **No cost to hashbin** - Edge-cached requests don't cost anything
2. **Better performance** - Users get faster responses from nearby edge locations
3. **Lower DO load** - Fewer requests hit Durable Objects, reducing invocation costs
4. **Simplest solution** - No custom cache headers or logic needed

### What Rate Limiting Actually Protects

With free edge bandwidth, rate limiting serves to:
- Protect origin/Durable Object resources from abuse
- Provide a simple monetization model based on content popularity
- Give uploaders control over how frequently their content can be requested from origin

Edge cache hits don't undermine these goals - they reduce load on the origin.

## Implementation

Use Cloudflare's default caching. No special `Cache-Control` headers needed for rate-limited content.

For inline content (≤64 bytes), which has no rate limit:
```http
Cache-Control: public, max-age=31536000, immutable
```

## Decision

**Allow edge caching with default behavior.** Cloudflare doesn't charge for it, so there's no reason to disable it. The simpler solution wins.
