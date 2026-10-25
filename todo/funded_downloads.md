# Funded downloads: no 429 for identified requests with budget

## Status

**Phase:** Implemented locally, 2026-10-24; hardened 2026-10-25. Builds on L22 and S20 (`docs/cost-safety.md`). Owner WAF configuration and live acceptance remain pending.
**Row:** B11 in `STATUS.md`.

## Remaining work

- [x] Implement phases 1–6, regression coverage and API/UI documentation.
- [x] Make native acceptance self-contained with
  `npm run test:funded:local`; require it and unit tests in deployment CI.
- [x] Preserve cost projection/brake checks during revenue outages and retain
  billing measurements for invoice reconciliation.
- [ ] Complete [Cloudflare work](cost_safety_cloudflare.md), especially CF2/CF3
  shared credentials/deployment, CF5 WAF exemption and CF7–CF9 live acceptance.
- [ ] Complete [Stripe work](cost_safety_stripe.md), ST1–ST4, to establish live
  checkout, webhook, dispute and accounting behavior.
- [ ] Calibrate lease operation counts and kept revenue with CF10/ST5 production
  evidence. Aggregate invoice totals do not identify per-action counts.

All accepted repository phases are implemented. Further production acceptance
depends on the external checklists. Owner pricing/shutdown decisions and the
optional questions below are distinct from those setup tasks.

## Implementation notes

Phases 1–6 are implemented, with tests and API/UI documentation. Phase 0 and live
acceptance require the actual Cloudflare zone; the candidate Free-plan expression
and acceptance checklist are in `docs/cost-safety.md`.

- Idle leases return after 25 seconds via waitUntil to fit Workers’ 30-second
  post-response lifetime; active leases and revocation still expire within 60 seconds.
- Whole-cent balance accounting means month rollover refunds whole cents of float;
  fractional cents remain reusable credit. Returned remainders are credited exactly once.
- Durable outbox events make payment/revenue recording retryable and idempotent.
- Cost modeling includes singleton leases: these can exceed the minimum price.
  The hourly monitor alerts when sampled funded costs exceed 50% of price.
- The unreported-charge bound is 250 requests **per outstanding identity/price lease**;
  $0.001 is the floor-priced case, not the bound for larger files.
- Funding checks honor unused requests in an active prepaid lease when its earlier
  confirmation expires. A fully reserved cap or balance cannot turn those paid
  requests into 429s. The original lease expiry still bounds revocation.
- New budget requests preserve earlier accounting alarms, so continuous traffic
  cannot postpone transaction/revenue delivery indefinitely.
- Analytics includes refused and failed deliveries once per request, retaining
  funded charges and lease overhead when delivery fails after spending.
- Returned credit commits even if the replacement lease is denied for revocation,
  the hard stop or malformed renewal parameters. Returned allocation IDs cannot
  charge again within the 24-hour receipt window; changed retry parameters fail.
- Receipts and their expiry indexes are separate from the profile and commit in
  the same atomic batch as balance/spending/outbox changes. Alarm cleanup is
  bounded; old profile leases migrate on return and unreported leases stay spent.
- New browser sessions reclaim revoked/expired entries and abandoned handshakes.
  Active sessions retain their lifetime, and inherited properties are invalid IDs.
- Native workerd testing exposed cross-request promise cancellation. File and
  identity lease coordination now uses request-owned scheduler waits with timeout
  cleanup. `npm run test:api:funded` covers the real runtime and accounting alarm.
- Pending accounting events now live in separate ordered rows, so outages do not
  grow the profile blob. Bounded alarm batches acknowledge delivered prefixes in
  a transaction, preserve idempotent replay and migrate old inline outboxes.
  Receipt cleanup and accounting delivery retry independently.
- Hourly monitoring preserves successful top-file/funded-total query results
  independently and flags incomplete funded metrics instead of assuming zero.
- Direct credentials and signed URLs share the same identity/price lease, while
  key hashes and OAuth app IDs retain independent validity checks. Switching forms
  at a fully reserved cap can still spend the paid remainder, without new charges.
- File reservations and content deliveries use a shared strict safety protocol:
  unavailable/malformed state or missing bindings outside local mode return 503
  before reserving or spending. Valid safety caching remains bounded to 60 seconds.
- Month rollover now preserves the previous month's final-hour costs and matches
  them to that month's net funded revenue. Completed reports refresh late credit
  returns without changing the live dashboard month or double-counting usage.

Initial local verification (2026-10-24): 468 unit tests passed (2 skipped), 41 authentication API
acceptance checks passed, both Worker dry-run bundles passed, and browser checks
confirmed account/key cap persistence and v2 key creation without page errors or
mobile overflow. No production deployment was performed.

Follow-up verification (2026-10-25): 479 unit tests passed (2 skipped), including
cap exhaustion across confirmation expiry, the original revocation deadline,
accounting alarm scheduling, and refused/funded analytics. Both Worker dry-run
bundles passed. The full `npm test` command stops at the existing GNU `sed`
syntax in `scripts/inject-git-sha.sh` on macOS; production deployment and live
acceptance remain pending.

Latest verification (2026-10-25): 568 unit tests passed (2 skipped), both Worker
dry-run bundles passed, and native local acceptance served 2,500 funded
GET/HEAD/signed requests within an exact one-cent cap before exhausted fallback.
The real accounting alarm recorded the debit. The local content configuration
and repeatable acceptance commands are in `docs/cost-safety.md`. Live WAF and
regional acceptance remain pending. Regression coverage includes a 1,501-event
backlog outside the profile, bounded/ordered draining, large legacy migration,
failed acknowledgements, independent maintenance failures, partial analytics
outages, mixed direct/signed use at a fully reserved cap, invalid credential
proofs, separate request prices and fail-closed safety validation before cache use.
Month-boundary coverage now includes real PlatformStats lease/return revenue,
exact month-end cutoffs, late ledger delivery and independent live/backfill failures.

Current verification (2026-10-25): **577 unit tests pass (2 skipped)**, the full
repository suite and both Worker dry-run builds pass, and the isolated native
runner passes the 2,500-request/accounting check with generated local secrets
and temporary state. CI requires unit/native checks. Raw usage export and invoice
reconciliation are ready; actual Cloudflare/Stripe evidence is pending. Hourly
spike baselines account for missed cron duration. Revenue failures expose unknown
revenue and alert while retaining cost projection and brake evaluation. The
earlier macOS frontend SHA-injection failure has been fixed portably.

## The promise

> A GET or HEAD for a 256t.us file, made with an account or API key that has download
> budget left, is never answered 429 while the file is available.

"Available" means the file exists, has not expired and is not deleted or disputed. Those
cases still return 404 or 451. Other non-429 answers stay possible: 401 for a bad
credential, and 503 when a Durable Object can't be reached or the new hard stop is on.

"Budget left" means all of these hold:

1. Download spending is turned on for the account, with a daily and a monthly cap.
2. If a key or OAuth grant made the request, that key has its own daily and monthly caps.
3. The request fits under every cap that applies (the account's, plus the key's if any).
4. The account balance covers the request.

The promise is strict on the funded paths, `/a/…` and `/s/…` (see Identity). On plain
`/<cid>` paths a funded identity still pays and skips the Worker's limits, but the zone
WAF rule runs before the Worker and can still answer 429.

Out of scope: hashbin.org API GETs. They keep their per-key limits in
`src/auth/middleware.js` `applyRateLimit`. They're cheap, and a paying user shouldn't
reach those limits.

## Decisions (owner, 2026-10-24)

| Question | Decision |
|----------|----------|
| Where the money comes from | **Caps on the live balance.** Nothing is set aside in escrow. Downloads debit the normal balance, up to the daily and monthly caps. |
| How callers identify themselves | **All three:** a header (API key or OAuth token), signed URLs, and a 256t.us login cookie. |
| Who pays when the file still has allowance | **The file's allowance first.** The requester's budget pays only after the file's own allowance (included or purchased) runs out. |
| The cost brake and per-IP limits | **Funded requests bypass both.** That covers the Worker's 30 per minute limit, the WAF's 5 per 10 seconds, and `COST_SAFETY_ALLOWANCE_ONLY` and the automatic brake. A separate hard stop answers 503. |
| Price | **The greater of $4 per million and $0.02 per GiB**, the same floor bandwidth purchases use. |
| Key caps vs account caps | **Both apply.** The account caps limit the total; key caps limit each key within it. |
| When an identity can't pay | **Treat it as anonymous** (it may get 429), and add `X-Budget: exhausted`. |

## Why funded requests bypass the brake

Funded downloads are paid for before they're served. At the $4/M floor, HashBin keeps
$4 × 0.92 = $3.68/M after Stripe. A download costs about $1.24/M
(`DOWNLOAD_COST_DOLLARS`). Full leases amortize coordination across up to 250
requests; cold singleton leases can cost more than the price. The current model
includes receipts, cleanup and accounting at 8 DO requests, 20 row reads and
24 row writes per lease, pending invoice calibration. Prepayment bounds the
account's spending; it does not guarantee a positive margin on every funded
request. The hard stop remains the emergency switch, and the hourly monitor
alerts when estimated funded costs exceed 50% of price.

## Design

### 1. Identity on 256t.us (verified locally first)

The funded paths are exempt from the WAF, so a flood of junk credentials there must be
rejected **without a DO call**. Every credential the content Worker accepts is checked
locally first, with an HMAC or a JWT signature. A new secret, `DOWNLOAD_TOKEN_SECRET`, is
shared by both Workers.

| Form | Path | Local check | Lookup after the check |
|------|------|-------------|------------------------|
| `Authorization: ApiKey hb_…` / `X-API-Key` | `/a/<cid>[.ext]` (plain paths also accepted) | **Key format v2:** `hb2_<route>.<secret>.<tag>`, where `tag` = HMAC(secret, route‖secret), truncated. `route` holds the user ID and key ID, so the Worker never needs the global `KeyRegistry`. | The UserProfile DO named by the route |
| `Authorization: Bearer <oauth token>` | `/a/…` | The existing access-token signature, plus a new `downloads:spend` scope | The grant in UserProfile |
| Signed URL | `/s/<token>/<cid>[.ext]` | `token` = base64url({u, k?, cid, exp}) + HMAC. Tied to one CID. Lasts at most 7 days. | UserProfile |
| Cookie `__Host-hb_dl` | any path | HMAC over {u, session id, exp}. Lasts at most 30 days. | UserProfile (session not revoked) |

- **v1 keys** (`hb_…` today) can't be checked locally. They work only on plain paths,
  where the WAF still applies, and are found through KeyRegistry, cached per isolate for
  60 seconds. Key creation switches to v2. The keys UI suggests rotating old keys.
- **Signed URLs** come from `POST /api/downloads/sign` (signed in with a key, an OAuth
  token or Clerk), with up to 100 CIDs per call. Each URL spends from the identity that
  minted it and is limited by that identity's caps. If a URL leaks, revoke the key.
- **Cookie handshake:** a button on hashbin.org ("Use my budget when browsing 256t.us")
  mints a token that lasts 60 seconds. It sends the browser to `256t.us/_/session?t=…`,
  which sets the cookie (HttpOnly, Secure, SameSite=Lax) and redirects to the file. The
  account page lists sessions and can revoke them. The cookie works when someone opens
  256t.us directly. Browsers block third-party cookies, so pages that embed files should
  use signed URLs.
- **CORS:** answer `OPTIONS` (today it returns 405), allowing `Authorization` and
  `X-API-Key`. `Allow-Origin: *` stays, with no credentialed CORS.
- On `/a/` and `/s/`, a missing or bad credential gets **401** and still counts toward
  the per-IP limit. A request with no identity gets no bypass.

### 2. Budget state (in UserProfile)

The budget lives next to the balance, so a single DO transaction can check the caps,
record spending and debit the balance. Spending and the debit can't drift apart.

```
download_budget: {
  account: { daily_cap_cents, monthly_cap_cents } | null   // null = off (opt-in)
  keys:    { [key_id | grant_id]: { daily_cap_cents, monthly_cap_cents } }
  spend:   { day: 'YYYY-MM-DD', month: 'YYYY-MM',            // UTC windows
             account: { day_uc, month_uc },
             keys: { [id]: { day_uc, month_uc } } }
  float_uc                                                  // whole cents debited, not yet leased
  sessions: { [session_id]: { created_at, revoked_at } }
}
```

- Amounts are stored in **micro-cents** (uc, 10⁻⁶ ¢). One request at $4/M costs 400 uc.
- A key with no caps can't spend. An OAuth grant counts as a key. Its existing monthly
  `spending_limit` is also checked against download spending, together with its other
  spending (`user-profile.js:1385`).
- The balance is in whole cents. When a lease needs more than `float_uc`, the DO debits
  `ceil(shortfall)` cents into the float through the existing debit path, recorded as a
  `download_spend` transaction. At the end of each month, any float left over goes back
  to the balance.
- Changing a cap takes effect at the next lease, within 60 seconds.

### 3. Leases (how one request gets paid for)

The design follows ContentMetadata reservations: the isolate holds a lease, spends it
locally, and asks again when it runs out or expires.

- `POST /download/lease {identity, price_uc, unused_uc?}` returns
  `{lease_uc, expires_at, funded}` or `{funded: false, reason}`.
- The lease is the smallest of: the remaining room under every cap that applies, the
  balance plus the float, and an adaptive size. The adaptive size starts at one request
  and doubles each time a lease is used up within its 60 seconds, up to 250 requests.
  Bursts get fast leases, and a single page view reserves almost nothing.
- **Returning unused lease:** the isolate reports what's left of its last lease when it
  asks for the next one, or in `ctx.waitUntil` once the lease expires. The DO credits it
  back to the caps and the float. A lease that's never reported (because the isolate was
  evicted) stays spent. The unreported bound is 250 requests per outstanding
  identity/price lease. That is $0.001 at the minimum price and more for larger
  files; idle returns normally run after 25 seconds. The budget UI explains this exposure.
- The price is per request, computed from the size in the CID's length prefix, so it
  needs no R2 read: `identifiedDownloadPriceUc(size)` in `cost-policy.js`, the greater
  of 400 uc and 2 ¢ per GiB. GET, HEAD and cache hits cost the same, as they do today.
- Revoking a key or session, or a takedown, takes effect within one lease period (60
  seconds). That matches how fast takedowns reach the file's own allowance today.

### 4. Request flow in `workers/256t-content/src/index.js`

```
parse identity (local check only)           → bad on /a/ or /s/: 401
file allowance lease (takeDownload)         → got one: serve, X-Budget: file
identity valid?
  identity lease                            → got one: serve, X-Budget: funded
  not funded                                → X-Budget: exhausted, continue as anonymous
anonymous: per-IP limit, brake              → 429 as today
```

- The Worker's per-IP limit is skipped only for an identity this isolate has confirmed
  as funded in the last 60 seconds. Otherwise free accounts could use a key to get past
  the per-IP limit and drain files' allowances.
- `COST_SAFETY_ALLOWANCE_ONLY` and the automatic brake no longer stop funded leases.
  The new `COST_SAFETY_HARD_STOP=true` (on the main Worker, read through the existing
  `/safety` call) makes both leases refuse, and the Worker answers **503** to everyone.
- The analytics sample gets a `funded` / `file` / `anon` blob, so top-file reports show
  who paid.

### 5. API and UI

- `GET/PUT /api/downloads/budget`: the account caps, spending so far and the float.
- `PUT /api/auth/apikeys/:id/download-budget`: a key's caps.
  `PUT /api/oauth/grants/:id/download-budget`: a grant's caps.
- `POST /api/downloads/sign` mints signed URLs. `POST /api/downloads/session` mints the
  cookie-handshake token. `GET`/`DELETE /api/downloads/sessions` list and revoke
  sessions.
- The OAuth consent page shows `downloads:spend` with its caps.
- Pages: a budget card on `account.html`, a caps field on
  `api-keys-detail.html` and `api-keys-create.html`, `download_spend` rows in
  `transactions.html`, and a "Use my budget when browsing" button with links to
  `256t.us/a/…` from `info.html`.
- Docs: `docs/API.md`, `docs/cost-safety.md`, pricing, the FAQ and the terms (download
  charges are made only with the user's explicit opt-in and stay within the caps they set).

### 6. Cost model and monitoring

- Download spending counts as earned revenue in PlatformStats, so the S20 alerts compare
  costs against it.
- Add an identified-download row to `scripts/cost-safety-model.js` and
  `docs/business/price-floor.org`: margin per request at the floor, including lease DO
  traffic and the worst-case unreported leases.
- Add a monitor alert if funded traffic's cost per request ever exceeds 50% of its
  price.

## Phases

0. **Ops check (owner, pending CF5).** Actual WAF validation, fallback choices
   and completion evidence live in [the Cloudflare checklist](cost_safety_cloudflare.md).
   Shared credentials, deployment and live acceptance are tracked there too.
1. **Pricing and budget state.** Add `identifiedDownloadPriceUc`, the UserProfile
   `download_budget` with UTC window rollover, the cap endpoints and `download_spend`
   transactions.
2. **Leases.** Add the UserProfile `/download/lease` with adaptive sizing, returned
   remainders and the float. Add a content-Worker binding to `USER_PROFILES`.
3. **Credentials.** Add the v2 key format with local HMAC checks, the `downloads:spend`
   scope, signed URLs, the cookie handshake and sessions.
4. **Content Worker flow.** Add `/a/`, `/s/`, `/_/session` and `OPTIONS`, plus the flow
   above, the per-IP bypass, the brake bypass, the hard stop and `X-Budget`.
5. **UI and docs.**
6. **Cost model and monitoring rows.** Then a STATUS update.

## Tests

- Pricing at the floor and at large sizes. Day and month rollover at UTC midnight.
- Both caps apply: the key's cap, the account's cap, and an OAuth grant's
  `spending_limit`.
- A lease never goes past a cap or the balance when several isolates ask at once.
  Returned remainders credit the caps back. Unreported leases stay spent.
- The file's allowance is used first. The identity pays only after it runs out.
- **The promise:** a funded identity sends a burst from one IP with the brake on and
  the file's allowance used up, and gets no 429.
- A junk credential on `/a/` or `/s/` gets 401 with **no** DO fetch, which the test
  checks with a stub. v1 keys are refused on `/a/`.
- Signed URLs: bound to their CID, expiry, a tampered tag, and spending from the
  identity that minted them. Cookie: handshake, revocation within 60 seconds,
  `__Host-` attributes.
- An unfunded identity falls back to anonymous, gets `X-Budget: exhausted`, and the
  per-IP limit applies.
- The hard stop answers 503 to everyone. 404 and 451 behave as before.
- CORS preflight on `/a/`.
- Live acceptance: the WAF exemption matches custom-domain traffic, and a funded burst
  from one IP gets no 429.

## Open questions

- Should identified cache hits cost less? Today a hit costs the same as a miss.
- Should a key be able to mint signed URLs offline, from a per-key secret? That would
  need a DO call for each forged token. It's left out for now.
- Should spending notify the owner by email at 80% and 100% of a cap?
