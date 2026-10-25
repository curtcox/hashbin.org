# Cost safety

Implemented policy and operator runbook for `todo/cost_safety.md` (2026-10-24).

## Policy

The shared price/policy table is `src/utils/cost-policy.js`. Storage remains
$0.03/GiB-month (called GB in the product). Lifetime download allowances target
2,000/paid GiB-month and a 5,000/file minimum, **capped by the money left after
reserving the entire storage term and upload operations**. The cap matters:
5,000 uncached downloads plus storage can exceed a 1-cent payment. Reserves use
decimal GB conservatively, the content Worker's full 10 ms CPU limit, two R2
reads (four for legacy sidecars) and amortized counters. Included usage is ignored.

Exhausted files return 429. The existing bandwidth purchase API prepays extra
finite request counts from the payer's balance at the greater of $0.02/GiB or
$4/million requests, rounded up to a cent. There are no automatic debits or
postpaid downloads. Legacy purchases receive at most the requests their actual
price covers at $4/million. A cost safety brake stops extra purchased downloads
while permitting included allowances. It stays latched until an admin releases
it; an over-limit monitor run can latch it again.

ContentMetadata persists reservations of up to 250 requests before serving.
GET, HEAD and cache hits consume the same budget across all isolates/colos.
Reservations last at most 60 seconds and are never returned: restarts can waste
allowance but cannot create more. Extensions add allowance without resetting use.

Outstanding retention, including extensions/donations, is capped at 120 months
from today. Existing longer terms are grandfathered but cannot be extended.
Donation quotes fit the remaining term; if another purchase fills the cap after
Stripe checkout, the rejected payment is refunded with an idempotent key.
Inline uploads are limited to 60/account/UTC hour. Accounts under 30 days old
(or with unknown age) may deposit at most $20 per checkout. The $1 minimum stays;
the corrected total is `ceil((credit_cents + 30) / 0.971)`. The card-fee legal
question remains open in STATUS L20; corrected arithmetic does not resolve it.

## Caching and availability

The content Worker explicitly uses `caches.default`. Successful GET bodies are
cached by canonical URL, extension and download disposition for at most one
hour, bounded by content expiry. HEAD shares GET entries but never writes an
empty body. `X-Cache: HIT/MISS` exposes cache use. Hits reduce client max-age by
the entry's age; errors and throttles use `no-store`.

Version 2 `.meta` sidecars hold expiry and deleted/disputed flags. The owning DO
serializes sidecar writes with retention changes and takedowns. Transient R2
write failures schedule an alarm to republish current state. Legacy sidecars
still read markers; migration preserves marker state. Marker writes remain for
older readers. New reservations check takedowns, so paid files stop within one
minute of a successful DO update. Inline files and marker-only updates stop
within the one-hour TTL. No global purge behavior is assumed.

## Monitoring

The production cron runs hourly; anomaly detection and monitoring run separately
from maintenance, which stays at 02:00 UTC. The monitor introspects required
billing fields and queries daily windows from month start through scheduled
time. Workers requests/total CPU cover the two configured Workers. R2 operations,
Standard storage (including backups), DO requests/duration/rows/storage cover the entire
account; a shared account can therefore overstate this project's costs. Keep R2
buckets on Standard: Infrequent Access retrieval/storage is outside this table. Storage
uses daily maximum bytes. Required dataset errors, missing fields, unpriced
operation types or truncated results raise `cost_monitor_unavailable` without
overwriting the last good snapshot. Download attribution failure raises its own
alert and leaves cost snapshots/brake running. Verify full-month access on the account.

InfrastructureCost replaces cumulative MTD snapshots transactionally, rather
than counting them twice, and retains hourly reports for 93 days. PlatformStats
tracks monthly earned revenue and hourly deposit/upload counts. Historical
revenue is not guessed/backfilled; the first partial month is conservative.
AlertStore provides existing webhook delivery and hourly deduplication:

- Costs exceed 92% of monthly earned revenue plus the fixed $7.01 budget.
- Month-end variable-cost projection exceeds $25.
- Hourly cost rate exceeds 10 times the preceding day's hourly average.
- Projection exceeds $50: latch the brake and send a critical alert.

The content Worker samples 1% of valid-file requests to `hashbin_downloads`.
Points carry weight 100; SQL also multiplies by `_sample_interval`. Top-file
reports show HTTP status, including refusals. Counts are estimates, not billing
counters. Analytics Engine currently does not bill; its published future rates
are $0.25/M writes beyond 10M and $1/M reads beyond 1M. At 1% sampling writes add
$0.0025/M content requests before included usage; review when billing changes.

`/admin/costs.html` shows MTD costs, kept revenue, projection, snapshot age,
brake controls and top files. It warns after two hours without data. Its admin
token stays only in page memory. APIs require `X-Admin-Token`:

- `GET /api/admin/cost-safety`
- `POST /api/admin/cost-safety` with `{"brake":true}` or `{"brake":false}`
- `GET /api/admin/cost-safety/history?limit=168` (maximum 1,000 reports;
  paginate by passing returned `next_before` as `before`)

Main-Worker variables: `COST_SAFETY_ALLOWANCE_ONLY=true` is the manual brake;
`COST_SAFETY_ALERT_CENTS`/`COST_SAFETY_BRAKE_CENTS` default to 2500/5000;
`COST_SAFETY_WORKERS` overrides the comma-separated Worker names. Set the manual
switch on the **main Worker**, which owns ContentMetadata. Setting it on the
content Worker additionally blocks free inline downloads.

## Operator setup and live acceptance

1. Create a read-only Account Analytics token with GraphQL and Analytics Engine
   SQL read access. Set main-Worker secrets `CLOUDFLARE_ANALYTICS_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. CI supports matching GitHub secrets and preserves a
   manually set analytics token when the optional GitHub secret is absent.
2. Set `ALERT_WEBHOOK_URL`; test `POST /api/admin/alerts/test` with the admin token.
3. Deploy the main Worker before the content Worker, whose config binds the
   shared ContentMetadata namespace and Analytics Engine dataset.
4. Set Cloudflare usage billing notifications for Workers requests/CPU, R2 class
   B/storage and DO usage near their included allowances.
5. Configure the zone's free WAF rate rule for `256t.us` and `www.256t.us`,
   counting by IP, blocking over 5 requests/10 seconds (the Free plan period).
   Exempt `/a/` and `/s/` using the B11 expression below.
   Keep cached traffic counted and verify custom-domain requests match the rule.
   The Worker retains its separate 30/minute per-IP limit.
6. Enable Stripe dispute emails and verify Radar defaults.
7. Fetch a paid CID twice from one location; confirm MISS then HIT. Exercise a
   dispute: paid responses must stop within 60 seconds, inline/marker-only
   responses within one hour. Confirm every analytics dataset is available and
   an hourly report and webhook notification arrive.

Local tests replay a synthetic burst and assert an alert names its file, and
cover concurrent reservations, snapshot retries, retention limits and caching.
Live account schema/access, regional caching, WAF matching and delivery still
need the setup above; bundling alone cannot verify them.

## Financial limits and follow-up

This bounds successful stored downloads, not every possible bill. Worker
refusals still cost money. Distributed invalid requests, free inline traffic,
failed reservations, account farming, international card fees and disputes can
still cost money. A CPU limit and allowance-only switch are not Cloudflare
spending caps. The original absolute no-loss claim cannot be guaranteed by app
code while arbitrary public requests are billable. Upstream WAF protection,
notifications, hourly monitoring and operator intervention remain required.
The deposit limit bounds individual checkouts, not total chargebacks.

`node scripts/cost-safety-model.js` generates the accepted-download worst-case
and prepaid cohort tables in `docs/business/price-floor.org`. These use stated
operation-count assumptions, which require invoice calibration after a month.
After two months, fit heavy-tailed traffic/dispute distributions from retained
observations before implementing Monte Carlo simulation. Neither measurement
task can be completed before evidence exists.

## Sources reviewed 2026-10-24

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [R2 analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)
- [DO datasets and introspection](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/)
- [Cloudflare GraphQL reference](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/graphql-api/api.md)
- [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)
- [WAF rate rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Free-plan setup](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/waf/create-rate-limiting-rule.mdx)

## Funded download deployment and acceptance (B11)

Configure the same `DOWNLOAD_TOKEN_SECRET` on both Workers and share the existing
`OAUTH_SIGNING_KEY` with the content Worker. CI requires the download secret and
uploads both shared secrets. Deploy the main Worker first. The content Worker now
binds `USER_PROFILES`, `KEY_REGISTRY` (legacy plain-path keys only), and
`INFRASTRUCTURE_COST` as well as `CONTENT_METADATA`.

Set `COST_SAFETY_HARD_STOP=true` on the main Worker for emergency HTTP 503 on all
content deliveries. The content Worker reads it through `/safety`, cached for at
most 60 seconds, including for inline and cached content. It can also be set on
the content Worker for an immediate local stop. The manual allowance-only switch
and automatic cost brake continue to constrain anonymous traffic. Confirmed funded
identities bypass them and the Worker's 30/minute per-IP limit; junk credentials
on protected paths are rejected locally without any DO call.

Replace the **single zone WAF rate rule's matching expression** with:

```text
not starts_with(http.request.uri.path, "/a/") and
not starts_with(http.request.uri.path, "/s/")
```

Retain 5 requests / 10 seconds, IP counting, and cached traffic in the rule. The
Free plan allows the path field, not a host or header condition. This expression
therefore applies to the content zone. Cloudflare documents path support on Free
and the logical NOT and starts_with operators: [rate limiting availability](https://developers.cloudflare.com/waf/rate-limiting-rules/),
[operators](https://developers.cloudflare.com/ruleset-engine/rules-language/operators/).
This supports the proposed expression in principle; the owner's actual zone rule
validation and custom-domain acceptance remain required. If the account rejects
starts_with, try `not (http.request.uri.path wildcard "/a/*") and not (http.request.uri.path wildcard "/s/*")`.
If neither validates, use a dedicated funded hostname/route or explicitly review
an upgrade; do not claim the strict promise is live before this check.

Local verification covers concurrent leases, account/key/grant caps, balance,
UTC rollover, remainders, outbox retries, scoped OAuth, signed URL signatures/CID/
expiry, cookie activation/replay/revocation, CORS, availability status, exhausted
fallback, and a funded burst with the allowance exhausted and brake enabled.
Live acceptance still requires these operator steps:

1. Validate and save the path exemption in the actual zone. Check normalized path
   behavior on `256t.us` and `www.256t.us` (the latter redirects).
2. Opt in with small account/key caps, fund the balance, and use an available file
   whose file allowance is exhausted. Enable the ordinary cost brake.
3. Send more than 30 GET/HEAD requests from one IP to `/a/<cid>` and a minted `/s/`
   link. Verify no 429, `X-Budget: funded`, bounded debits and transaction history.
4. Disable the budget, revoke the key/session, and exercise a takedown. Confirm
   each takes effect within 60 seconds. Check 404/451 and exhausted fallback.
5. Enable the hard stop and verify 503 on plain, funded, signed, inline and cached
   requests within 60 seconds. Restore the switch afterward.

Leases start at one request, double during bursts, and top out at 250. They end
at UTC midnight when that comes first. The Worker returns idle remainders after
25 seconds when waitUntil is available, fitting Workers' 30-second post-response
lifetime; renewal also returns remainders. Eviction or a failed return leaves the
lease spent. An accounting outbox commits with the balance and retries through a
DO alarm. PaymentRecord and PlatformStats deliveries are idempotent. Revenue is
recognized when credit is leased, reversed for returned requests, and attributed
to the original UTC month. Rollover refunds whole cents of float; fractional cents
remain reusable credit because balances use whole cents.

Analytics adds a payer blob (`funded`, `file`, `anon`) and estimated price/lease
coordination cost. The hourly monitor alerts when sampled funded delivery cost
plus coordination exceeds 50% of price. The deterministic model includes cold
one-request leases as well as full leases: cold, low-volume requests can cost more
than the $4/M floor. This is a real limitation of the adaptive design, not a
profit guarantee. Idle/unreported leased requests still count toward the caps;
250 outstanding requests cost $0.001 only at the minimum price (a 1 GiB file costs
$5 for that many requests). See the identified rows in `scripts/cost-safety-model.js`.
