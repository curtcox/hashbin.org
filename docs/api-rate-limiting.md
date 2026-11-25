# Buying download allowance

Every non-inline file on `256t.us` has a finite lifetime download allowance, paid for by its
storage payments ([cost-safety.md](cost-safety.md)). When it runs out, downloads return
`429` with `Retry-After: 60`. Anyone signed in can prepay more downloads for any CID with
the rate-limit purchase API below. Inline content (64 bytes or less, encoded in the CID itself)
has no allowance and can't be bought for.

Paying per identity rather than per file is a separate mechanism:
[funded downloads](API.md#funded-downloads-on-256tus).

## Endpoints

### POST /api/content/rate-limit/purchase

Needs `ratelimit:purchase` (a signed-in session, or a key, app grant or device credential
holding that scope). The price is debited from the caller's balance.

```json
{
  "cid": "00000008YWJjZGVmZ2g",
  "min_time_between_requests_ms": 1000,
  "duration_seconds": 2592000
}
```

The two numbers define a count: `max_requests = floor(duration_seconds / (min_time_between_requests_ms / 1000))`.
The API keeps this "minimum time between requests" (MTBR) shape for compatibility, but in
production the result is simply `max_requests` extra downloads, with no pacing. They are used
once the file's included allowance runs out, and lapse at the purchase's `expires_at`. The request is refused when:

- `min_time_between_requests_ms` is under 100, `duration_seconds` is not positive, or the
  duration is shorter than one interval;
- the duration runs past the content's expiry (`400 duration_exceeds_retention`, with
  `max_duration_seconds`);
- the content is inline or doesn't exist;
- the balance is too low (`400 insufficient_balance`, with `required_cents` and
  `available_cents`), or the credential's monthly spending limit would be passed.

While the cost brake is latched, purchased downloads aren't served (the file's included
allowance still is); see [cost-safety.md](cost-safety.md).

**Price** (`src/utils/rate-limit-pricing.js`), rounded up to a whole cent:

```
max(size_bytes × max_requests × $0.02/GiB,  max_requests × $4 per million)
```

The `201` response returns `purchase_id`, `cid`, `size_bytes`, the two input values,
`max_requests`, `max_bytes`, `price_cents`, `starts_at` and `expires_at`. Purchases are not
refundable, and the purchase is recorded in the buyer's transaction history.

### GET /api/content/{cid}/rate-limit

Public. Reports the file's size, whether it is inline, and its purchased rate limits
(`active_rate_limits`, `default_rate_limit`, `effective_mtbr_ms`, `next_available_at`,
`is_rate_limited`), with `content_expires_at`. These MTBR fields describe the
local-development model below, not production availability: in production, a download is
available while the file's allowance has requests left.

## Local development

`npm run dev:local` serves downloads from the main Worker (`handleDownloadContent`), which
still enforces MTBR literally: the lowest MTBR among active purchases wins, and new uploads get
a 30-day default. Responses carry `X-RateLimit-Content-Reset` and `X-RateLimit-Content-MTBR-Ms`,
and a throttled request gets `429 rate_limit_exceeded` with `retry_after_seconds`. Use
`npm run test:api:ratelimit` against a local server to exercise the purchase API.
