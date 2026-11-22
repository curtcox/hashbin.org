# Availability statistics: how much of a file's traffic is served versus 429

## Status

**Phase:** Planned 2026-11-19; owner decisions recorded the same day. Builds on L22
(file allowances), B11 (funded downloads) and `done/content_rate_limit_ui.md` (the
info and upload pages).
**Row:** S23 in `STATUS.md`.

## Decisions (owner, 2026-11-19)

| Question | Decision |
|----------|----------|
| Who sees a file's numbers | **Split.** Totals, fractions, reasons and remaining allowance are public for any CID. Hourly and daily series and `cost_to_cover` are for people who paid to store or serve the file. |
| Zone WAF 429s | **Not counted, and disclosed.** The page and API say firewall refusals aren't included (`waf_counted: false`). |
| Funded downloaders | **They count as having paid to serve.** Funded serves are tracked per CID in UserProfile, capped at 100 CIDs per user per month. |
| Alerts | **In-app only.** Email waits for B1's email notifications. |
| Priority | **Soon after launch.** Under L22, 429s are the normal outcome for any popular file. |

## Remaining work

- [ ] Phase 1: count outcomes in the 256t.us Worker and report them to ContentMetadata.
- [ ] Phase 2: store hourly and daily buckets in ContentMetadata; public availability API.
- [ ] Phase 3: index the content each user has paid for; the per-user availability API.
- [ ] Phase 4: make every 429 point at the statistics.
- [ ] Phase 5: UI (info page card, account availability page) and docs.
- [ ] Phase 6: cost model rows, monitoring and live acceptance (ops: WAF counts).

Done means: anyone who gets a 429 from 256t.us can follow a link in the response to
that file's availability numbers; anyone who paid to store or serve a file sees, for
each such file, how many requests were served and how many were rate limited, why,
and what fixing it would have cost; and the added cost stays within the margins in
`docs/cost-safety.md`.

## Why this needs new counting

The 256t.us Worker (`workers/256t-content/src/index.js`) can answer 429 for four
reasons, and none of them is visible to users today:

| Reason | Where | Fixed by |
|--------|-------|----------|
| `allowance` — the file's included and purchased requests are used up | `takeDownload` gets 429 from `ContentMetadata.reserveDownloads` | Buying bandwidth for the file |
| `brake` — the cost brake is on, so purchased requests are withheld | same reserve call, `brake && !funded` | An admin releasing the brake; funded requesters bypass it |
| `requester` — the Worker's per-IP limit (30 per minute per isolate) | `enforceRateLimit` | The requester using funded downloads (B11) |
| `budget` — an identified requester's download budget ran out | `serveContent`, `X-Budget: exhausted` | The requester raising caps or balance |
| `waf` — the zone WAF rate rule (5 per 10 seconds) | Cloudflare, before the Worker runs | Funded paths `/a/` and `/s/` (exempt) |

What exists:

- `DOWNLOAD_ANALYTICS` samples 1% of requests with CID, status, cache hit and payer.
  The hourly cost monitor reads it for top files. A 1% sample is too coarse for a
  low-traffic file (most files would show zero), and the Analytics Engine SQL API needs
  an account token, so it can't back a public per-file page.
- `ContentMetadata` knows how many requests it has *reserved* (`download-budget.reserved`
  and `purchases`), in leases of up to 250. It never learns how many of those were
  served, and it never sees 429s answered from an isolate's cached empty lease or the
  per-IP limit.
- `download_count` on the content record is incremented only by the development-only
  handler.

Writing every request to a Durable Object is not an option: it would add a DO request
to the path that L22 and S20 keep DO-free, and a 429 flood would become a billing flood.

## Design

### 1. Counting in the content Worker (best effort, batched)

Each isolate keeps a counter map keyed by CID, alongside the existing lease map
(`budgetsByEnv`), bounded by the same `MAX_LOCAL_ENTRIES` trim:

```
{ served: { included, purchased, funded, cache_hits },
  limited: { allowance, brake, requester, budget },
  unavailable: { gone, legal, error },          // 404, 451, 503
  since }                                        // first unreported count
```

- `served.included` / `served.purchased` need to know which pool a lease came from.
  `reserveDownloads` adds `source: 'included' | 'purchased'` to its response; the
  isolate tags the lease and counts each request against it. Funded serves count as
  `funded`. Cache hits are counted in both their pool and `cache_hits`, since they
  consume allowance like misses.
- The 429 branches set a `reason` before returning, so the counter and the response
  header (section 4) use the same value.
- **Reporting rides the existing reserve call.** `takeDownload` already calls
  `/download/reserve` at most once a minute per isolate per file, including for files
  whose allowance is exhausted (the empty lease expires after 60 seconds). The request
  gains a JSON body `{ report: counts }`, and the counter resets when the DO accepts it.
  Busy files cost no extra DO requests.
- **Idle tails** are flushed by a `ctx.waitUntil` timer 25 seconds after the first
  unreported count, the same pattern funded lease returns use. That is a new
  `POST /availability/report`, at most one per isolate per file per minute.
- Files that are only ever answered by the per-IP limit never call reserve; they are
  covered by the idle flush.
- Counts lost to isolate eviction are not recovered. The UI calls the numbers
  "at least" and says up to about a minute of traffic per edge location can be missing.
- Inline CIDs (≤ 64 bytes) have no ContentMetadata and no allowance. They are not
  tracked; the info page keeps saying they are only limited per requester.

### 2. Storage and the public API (ContentMetadata)

ContentMetadata adds availability rows, separate from `content` and `download-budget`
so reports don't rewrite the content blob:

- `avail:h:<YYYY-MM-DDTHH>` hourly buckets, kept 14 days.
- `avail:d:<YYYY-MM-DD>` daily buckets, kept for the life of the content (capped at 400 days).
- `avail:total` lifetime totals.

A report writes three rows in one transaction, rolling the hour and day by the
DO's clock. Old buckets are pruned in the existing alarm, bounded per run. Reports
for deleted or expired content are accepted and dropped.

Reports are validated: integer, non-negative, each field at most
`COST_POLICY.leaseSize × 1000` per report. Only the content Worker can call it (DO
stubs aren't reachable from outside), so validation guards against bugs, not attacks.

`GET /api/content/:cid/availability` (access `PUBLIC`, cached 60 seconds):

```json
{
  "cid": "…",
  "counted_since": "2026-11-20T00:00:00Z",
  "windows": {
    "24h":  { "served": 1200, "limited": 300, "limited_fraction": 0.2,
              "limited_by": { "allowance": 280, "brake": 0, "requester": 20, "budget": 0 },
              "unavailable": 0 },
    "7d": { … }, "30d": { … }, "lifetime": { … }
  },
  "allowance": { "included_remaining": 0, "purchased_remaining": 0,
                 "projected_exhaustion_at": null },
  "cost_to_cover": { "7d_limited_requests": 1900, "price_cents": 1 },
  "waf_counted": false
}
```

- `limited_fraction = limited / (served + limited)`. 404, 451 and 503 answers are
  reported separately, not in the fraction.
- `projected_exhaustion_at` divides remaining allowance by the 7-day served rate.
- `cost_to_cover` prices last week's `allowance` and `brake` refusals with the
  bandwidth purchase formula in `src/utils/pricing.js`, so a payer sees what buying
  bandwidth would have cost. `requester` and `budget` refusals are excluded, because
  bandwidth doesn't fix them.
- Without a signed-in payer, the response omits `cost_to_cover`. With one (anyone
  whose `paid_content` index, section 3, lists the CID), it includes `cost_to_cover`,
  and `?series=hourly|daily` adds the buckets. The route is `PUBLIC` and checks for
  a payer itself when credentials are present; responses for payers are
  `private, no-store`.

### 3. Content each user has paid for

"Paid to store or serve" means any of: uploaded it, extended or donated retention,
bought bandwidth for it, or had a funded download of it.

- UserProfile gains a `paid_content` index: `cid → { roles: [upload, extension,
  donation, bandwidth, funded], first_paid_at, last_paid_at }`, written at the same
  points that already record a transaction with a `cid` (`src/api/content.js`,
  `src/api/payments.js`, `src/api/rate-limit.js`).
- A one-time backfill reads `upload_history` and `PaymentRecord` transactions that
  have a `cid`, run lazily the first time a user opens the page.
- `GET /api/user/availability` (new scope `availability:read` in `USER_SCOPES`, so
  keys and OAuth apps can read it as well as the signed-in site): one page of up to 50 paid CIDs with the 7-day window, the
  allowance block and `cost_to_cover`, fanned out to ContentMetadata in parallel.
  Sort by `limited_fraction`, `limited`, `served`, `projected_exhaustion_at` or
  `last_paid_at`; filter by role and by "has limits in the last 7 days".
- Funded serves: the isolate tags funded counts with the identity's user ID and
  sends per-CID counts with each lease return (which already goes to that user's
  UserProfile, so it adds no DO requests). UserProfile adds the CID to
  `paid_content` with role `funded` and keeps the monthly count, capped at 100 CIDs
  per month. Funded serves beyond the cap still count in ContentMetadata's totals.

### 4. Pointing every 429 at the numbers

Every 429 (and 503) from 256t.us for a CID adds:

- `Link: <https://hashbin.org/info.html?cid=<cid>#availability>; rel="help"`
- `X-HashBin-Limit-Reason: allowance | brake | requester | budget`
- A body line: `See availability for this file: https://hashbin.org/info.html?cid=…`

Both headers are added to `Access-Control-Expose-Headers`, so browser apps can read
them. The SDK (`frontend/sdk/hashbin.js`) exposes `reason` and `availabilityUrl` on
download errors in the next SDK release (a new immutable version, per AGENTS.md).

WAF 429s never reach the Worker. Cloudflare rate limiting rules can return a custom
response body on some plans; if the zone's plan allows it, the body carries the same
link (optional ops work alongside CF5). They are not counted; the card and the API
say so.

### 5. UI

- **`info.html` availability card** (anchor `#availability`), below the existing rate
  limit card: served versus limited for 24 hours, 7 days and 30 days as stacked bars
  with text percentages (not color alone), the reason breakdown with one sentence
  each, remaining allowance and projected exhaustion. Actions depend on the reason:
  "Buy bandwidth" (links to `/dashboard/uploads/{cid}/` with the purchase form
  pre-filled from `cost_to_cover`) for `allowance`; "Use your download budget" for
  `requester` and `budget`. When opened from a 429 (`?limited=<reason>`), a banner
  explains that refusal first.
- **`/dashboard/availability/`**: a table of the user's paid content, sortable and
  filterable as in section 3, with the same actions per row. Linked from
  `dashboard.html`, `/dashboard/uploads/` and `frontend/sitemap.html`.
- **Upload detail page**: the hourly chart and the purchase form side by side, so the
  decision and the purchase are on one page.
- **In-app alert**: `dashboard.html` shows a banner when any of the user's paid files
  had more than 10% of its requests limited by `allowance` or `brake` over the
  last 7 days, linking to `/dashboard/availability/` filtered to those files. The
  banner comes from the same `GET /api/user/availability` call (`?limited_only=true`),
  so it needs no new storage. No email.
- All dynamic text goes through `escapeHtml` or `textContent`; API calls on load go
  through `getSessionToken()` (L18).

### 6. Cost and monitoring

- Busy files: zero added DO requests; each reserve call writes up to three more rows.
- Idle tails: at most one DO request and three row writes per isolate per file per
  minute that saw traffic. Add this to `scripts/cost-safety-model.js` and
  `docs/business/price-floor.org` as a worst case (a 429 flood across every colo).
- The hourly monitor compares the sum of reported counts with the 1% Analytics Engine
  sample for the top files and alerts if they diverge by more than 20%, which would
  mean reports are being lost or double-counted.

## Phases

1. **Counting.** Counter map, `reason` on every 429 branch, `source` on reservations,
   report on reserve, idle flush, `/availability/report`.
2. **Storage and public API.** Buckets, pruning, `GET /api/content/:cid/availability`,
   route entry and regenerated route index in `docs/API.md`.
3. **Paid-content index.** `paid_content` writes, lazy backfill, the `availability:read`
   scope and `GET /api/user/availability`.
4. **429 links.** Headers, body line, CORS exposure; SDK release; WAF custom response (ops).
5. **UI and docs.** Info card, availability page, upload detail chart, sitemap,
   `docs/API.md`, `docs/cost-safety.md`, public docs page.
6. **Cost model, monitoring, acceptance.** Model rows, divergence alert, then STATUS.

## Tests

- Each 429 branch counts its own reason exactly once and sets the matching header;
  404/451/503 count as unavailable, not limited.
- Included, purchased and funded serves are attributed to the right pool, including
  a lease that crosses from included to purchased.
- A busy file sends its report with reserve calls and makes no extra DO requests
  (stub counts fetches). An idle file flushes once after 25 seconds.
- A rejected or failed report keeps the counts for the next attempt; an accepted one
  clears them. Counts never go to the DO twice.
- Hour and day rollover at UTC boundaries; pruning keeps 14 days of hours and is
  bounded per alarm.
- `limited_fraction` with zero traffic is `null`, not `NaN`.
- `cost_to_cover` matches the purchase API's price for the same request count and
  excludes `requester` and `budget` refusals.
- `GET /api/user/availability` lists uploads, extensions, donations, bandwidth
  purchases and funded serves, paginates, sorts, and backfills once. The funded cap
  stops adding CIDs at 100 per month without losing ContentMetadata totals.
- The public availability response omits `cost_to_cover` and series for anonymous
  callers and for signed-in users who haven't paid for the CID.
- The dashboard banner appears at more than 10% `allowance`/`brake` limiting and not
  for `requester`/`budget` limiting alone.
- The route test accepts the new routes' access declarations; the docs route index
  is regenerated.
- Playwright: the info card from a 429 link, the availability table's sort and
  filter, and the pre-filled purchase form.

## Later

- Email alerts at a limited-fraction threshold, once B1 adds email notifications.
- Counting WAF 429s from Cloudflare's firewall analytics, if the zone's plan exposes
  per-path rate-limit events.
