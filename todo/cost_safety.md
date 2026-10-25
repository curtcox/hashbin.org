# Never pay Stripe and Cloudflare more than customers pay

## Status

**Phase:** Code implemented 2026-10-24, hardened 2026-10-25; deployment, owner dashboard setup and live
acceptance checks remain. See `docs/cost-safety.md` for the implemented policy,
operator runbook, defaults, proposal changes, and financial limits.
Measurements/simulation remain pending production evidence.

The implementation uses prepaid reservations instead of delayed count flushing;
reduces the suggested minimum where storage would exhaust its margin; uses
explicit prepaid bandwidth purchases instead of automatic debits; keeps the
$1 deposit minimum with corrected gross-up; caps outstanding retention at 10
years; and caps individual deposits at $20 for accounts under 30 days old.
The absolute no-loss goal below remains an aspiration: refused Worker requests
and distributed free traffic remain billable without an upstream spending cap.
**Rows:** L22, S20–S22 in `STATUS.md`; also touches L20, S17, S18, B9.
**Numbers:** `docs/business/price-floor.org` (the price-floor sheet). Prices checked 2026-10-24.

Follow-up implementation (2026-10-25): per-file analytics now includes HTTP
401/404/429/451/503 responses, including per-IP refusals and delivery exceptions,
so refused traffic can appear in hourly top-file alerts. Each request is sampled
once, preserving cache-hit, payer and funded lease-cost attribution. Continuous
budget traffic also preserves the earliest accounting alarm so earned revenue
cannot be indefinitely delayed by new requests. See `docs/cost-safety.md`.

Further implementation (2026-10-25): unused funded credit survives rejected
renewals, lease retry receipts are atomic and expire through bounded alarm
cleanup, and revoked/abandoned browser sessions free capacity. Native workerd
acceptance caught and now covers cross-request promise cancellation in bursts.
The funded cost model and price-floor table include receipt/index/cleanup work
(8 DO requests, 20 row reads and 24 row writes per lease as planning assumptions).
568 unit tests pass (2 skipped); the native burst serves exactly 2,500 requests
for a one-cent cap and records its debit through the accounting alarm. Production
calibration and live operator setup remain pending.

Accounting events now persist as ordered rows outside the profile, with bounded
alarm delivery and transactional acknowledgement. Receipt cleanup and delivery
continue independently through outages. The monitor also retains successful
top-file/funded-total analytics when the other query fails, and rejects malformed
funded metric columns while preserving cost snapshots and the brake.

The safety protocol now validates both boolean switches for file reservations
and deliveries; missing bindings outside local mode and invalid/unavailable
shared state produce 503 before allowance or balance spending. Direct and signed
requests for the same spending identity/price share their paid lease, preserving
credential checks while avoiding duplicate reservations at exhausted caps.

Month-boundary monitoring now refreshes the complete previous month during the
first two UTC days, recovers known incomplete snapshots after longer outages,
and updates original-month revenue for delayed funded-credit returns. Completed
reports replace costs rather than adding them, retain separate history cursors,
and can latch the brake without replacing the active dashboard report. Their
alerts identify the month and final-hour files; backfill failures do not stop
the current run. Regression tests cover exact/leap/year boundaries, final-hour
bursts, corrections, net funded revenue, pagination and partial failures.

## The goal and the rule that gets there

HashBin should never owe Stripe and Cloudflare more than it collects from customers, beyond the
fixed $7.01 a month for the Workers plan and both domains (about $84 a year, well inside the
$500 loss budget).

Prices alone can't guarantee that, because the largest cost has no limit. The rule:

> **Every action that costs money is paid for in advance, and service stops or slows when the
> payment runs out.** Prices set the margin; prepayment with a hard stop removes the risk.

Then monitoring catches what the rule misses (a bug, a miscount, a price change) within an hour,
not at the end of the month.

## Where things stand

From the price-floor sheet and the code:

| Cost | Paid for today? | Bounded? |
|------|-----------------|----------|
| R2 storage ($0.015/GB-month) | Yes: $0.03/GB-month, prepaid at upload | Yes, but prepaid retention has no cap (S17) |
| Upload requests (about $19 per million) | Yes: every upload pays at least 1¢ | Yes |
| Inline uploads (64 bytes or less, about $10 per million) | No, free | Only by sign-in |
| **256t.us downloads ($1.78 per million)** | **No, free** | **No.** Only a 30-a-minute per-IP limit, counted per Worker instance |
| Requests over the per-IP limit ($0.32 per million) | No | No |
| Card fee | Added at checkout, but about 1.7¢ short per $10 (Stripe takes 2.9% of the fee too) | Yes |
| Disputes (lost deposit + $15) | No | Only by deposit size |
| Workers plan and domains ($7.01/month) | Covered at about 514 paid GB | Fixed |

Findings behind this table:

- Each 256t.us download is a Worker request and four R2 reads (`.deleted`, `.disputed`, `.meta`,
  the file). One file downloaded 200 million times a month costs about **$350 a month**.
- **Nothing is cached.** 256t.us sends `Cache-Control: public, max-age=31536000, immutable`, but a
  Worker on its own domain runs before Cloudflare's cache. Two fetches of the same file on
  2026-10-24 returned no `cf-cache-status` header. `docs/decisions/edge_cache.md` assumes the
  opposite.
- The MTBR rate limit and bandwidth purchases exist only in `handleDownloadContent`, which answers
  only in local development (B9). If it ever goes live, it sells bandwidth at $0.02 a GB but costs
  $2.39 per million requests, so it would lose money on files under about 136 KB.
- **Monitoring can't see costs.** `/api/admin/profitability` compares revenue with infrastructure
  costs that only someone typing into `POST /api/admin/costs/record` ever records. The 256t.us
  Worker records nothing at all. Deposit and upload spike checks use hourly rates but run once a
  day in the 2 AM cron. Dispute alerts fire immediately, which is good. Cloudflare has no hard
  spending cap.

## Phase 0: today, in dashboards (owner, about 15 minutes)

1. **Cloudflare usage-based billing notifications** (Notifications → Usage Based Billing) for
   Workers requests, Workers CPU, R2 class B operations, R2 storage and Durable Objects. Set each
   threshold near the monthly free allowance, so anything beyond normal shows up the same day.
   (S21)
2. **Set `ALERT_WEBHOOK_URL`** and test it with `POST /api/admin/alerts/test` (S3's ops step).
   Everything below alerts through it.
3. In Stripe, turn on email notifications for disputes and check that Radar's default rules are on.

## Phase 1: see costs within an hour (code, S20)

1. **Run the cron hourly** instead of daily. Keep the nightly jobs nightly by checking the hour
   inside the handler. Move `runAnomalyDetection` to the hourly run.
2. **Hourly cost monitor.** Query Cloudflare's GraphQL Analytics API for month-to-date usage:
   Worker requests and CPU for both Workers, R2 operations by class and R2 storage for the content
   bucket, Durable Object requests, duration, rows written and storage. Verify the dataset names
   against Cloudflare's docs when building it. Price the usage with one shared table of current
   prices; this also fixes S18, since `src/utils/cost-estimation.js` should read the same table.
   Store hourly snapshots in the InfrastructureCost DO in place of hand-entered costs.
   - Needs an API token with read-only account analytics, stored as a Worker secret (owner).
3. **Compare with revenue** from PlatformStats, after Stripe (use the sheet's "kept per $1",
   about 0.92). Alert when:
   - month-to-date cost exceeds month-to-date revenue kept, plus the fixed $7.01;
   - month-end projection (cost so far ÷ fraction of month gone) passes a threshold
     (suggest $25, then raise it as revenue grows);
   - any hour costs more than 10× the trailing daily average.
4. **Count downloads per file on 256t.us**, so an alert can say which file is the cause.
   Workers Analytics Engine fits (one data point per request, queried hourly), but check its
   price first; sampling 1 in 100 requests would make it nearly free.
5. **Show it** on the admin page: month to date, projected, top files by downloads.

Done when: a test that replays a burst of synthetic downloads raises an alert within one hour,
naming the file.

## Phase 2: make each download cheaper (code, S22)

1. **Cache successful 256t.us responses** with the Cache API (`caches.default`), keyed by URL.
   A hit costs one Worker request ($0.30 per million) instead of $1.78.
2. **Takedowns must still work.** The Cache API is per data center, so deleting an entry in one
   place leaves copies elsewhere. Either keep the cache TTL short (an hour stays well inside the
   TAKE IT DOWN Act's 48 hours), or purge by URL through Cloudflare's purge API when a dispute,
   deletion or expiry lands. Test purge-by-URL against Cache API entries before relying on it.
3. **Read less on a miss.** Move the deleted and disputed flags into `.meta`, so a miss is one
   `.meta` read plus the file (two class B reads, not four). Keep writing the marker objects until
   every reader has moved over.
4. Update `docs/decisions/edge_cache.md`: its premise (that Cloudflare caches these responses on
   its own) doesn't hold for a Worker on a custom domain.

Done when: a second fetch from the same place shows a cache hit, and a disputed file stops being
served everywhere within the chosen TTL.

## Phase 3: bound what one file can cost (code, L22; replaces B9's design)

The B9 default (one request per 30 days, then none) would make new files nearly unusable.
Instead, tie downloads to what the file has paid for:

1. **Each paid GB-month includes a download allowance.** The sheet says one paid GB-month at
   $0.03 covers about 7,000 uncached downloads; with caching (Phase 2) it covers several times
   more. Suggested start: **2,000 downloads per paid GB-month, and at least 5,000 per file over
   its whole paid retention**, so small files are usable. The 2,000 uses under a third of the
   storage margin before caching. The 5,000 is what a file's 1¢ minimum charge covers (it pays
   1¢ once for its whole retention, not each month), so it stays safe for the smallest files.
2. **Past the allowance**, the uploader chooses for each file: keep serving and charge their
   balance (suggest **$4 per million downloads**, about twice the uncached cost), or throttle.
   Inline files and files with no allowance left get the throttle.
3. **Count cheaply.** Counting every request in a Durable Object would cost more than the request
   itself ($0.15 per million plus a row written). Instead, have each Worker instance count in
   memory and flush to a per-file counter every minute or every few hundred requests, and have
   the hourly job mark files over allowance in a small list that 256t.us caches. Enforcement then
   lags by minutes; the most a file can overrun is that lag times the Worker's top speed, and
   Phase 1 reports it.
4. **Keep the per-IP limit**, and add a Cloudflare rate-limiting rule on 256t.us so requests from
   one address are refused before they reach the Worker (the free plan includes one rule; check
   what it allows).
5. If `handleDownloadContent` ever serves production traffic, price its bandwidth as the larger of
   $0.02 a GB and the per-request price above.

Done when: the sheet's "most one file can cost in a month" (Phase 6) is less than the most that
file can have paid, for every file size.

## Phase 4: price changes (code/legal)

| Change | Why | Row |
|--------|-----|-----|
| **Keep $0.03/GB-month for storage** | Almost twice the $0.0164 floor. Raising it to $0.05 would bring break-even from about 514 paid GB down to about 230, but the fixed cost is small and known. | — |
| **Download allowance and $4 per million past it** | The only cost today with no price and no limit (Phase 3). | L22 |
| **$10 minimum deposit with the card fee absorbed**, or keep adding the fee but charge (credit + $0.30) / 0.971 | The first avoids the surcharge rules and keeps 92.3¢ per dollar; the second at least comes out even. | L20 |
| **Cap the first deposit on a new account** (suggest $20 until the account is 30 days old) | A chargeback after the credit is spent costs the deposit plus $15. | L20 |
| **Cap prepaid retention** (suggest 10 years) | Every prepaid month must keep being paid for in R2. | S17 |
| **Rate-limit free inline uploads per account** | Free and cheap, but unbounded. | L22 |

## Phase 5: an automatic brake (code, part of S20)

When Phase 1's projection passes a hard limit (suggest twice the alert threshold), throttle the
files with the most downloads beyond what they've paid for, and alert. Add a manual switch (an
environment variable or admin endpoint) that makes 256t.us serve only files within their
allowance. This turns a missed alert into a slowdown instead of a bill.

## Phase 6: calculate it better (docs)

1. **Worst case per file.** Add a table to the price-floor sheet: for each file size, the most it
   can pay versus the most it can cost in a month, given the allowance, overage price and
   enforcement lag. This is the number that shows the risk is gone; averages hide it.
2. **Calibrate.** After a month of Phase 1 data, replace the sheet's guessed operation counts
   (requests, R2 reads, DO calls per action) with measured ones, and check the total against the
   Cloudflare invoice.
3. **Month by month.** Prepaid retention brings money in up front and costs R2 over the months
   after it. Model it month by month next to the reserve sheet.
4. **Simulate after measuring.** Downloads and disputes are heavy-tailed: a few files get most
   downloads, and disputes are rare but expensive. Once two months of per-file counts exist, run
   a Monte Carlo simulation (a small script; Sheets has no random numbers) to estimate how often a
   month loses more than a given amount. Before that data exists, a simulation would only restate
   the guesses.

## Decisions for the owner

1. The allowance (2,000 per paid GB-month, 5,000 minimum per file?) and whether overage is paid,
   throttled, or the uploader's choice.
2. The overage price ($4 per million?).
3. L20: absorb the fee with a $10 minimum, or charge the corrected gross-up.
4. The first-deposit cap and the retention cap.
5. Alert and brake thresholds ($25 and $50 projected per month to start?).
6. Whether L22 must be done before launch. This plan recommends yes: without it, one popular file
   can cost more in a month than the yearly loss budget.

## Order

Phase 0 now; Phases 1 and 2 next (no decisions needed beyond the analytics token); Phase 3 and the
Phase 4 prices once decisions 1–4 are made; Phase 5 with Phase 3; Phase 6 alongside, simulation
last.
