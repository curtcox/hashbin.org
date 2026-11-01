# Aliases: human-readable names for CIDs

## Status

**Phase:** Planned 2026-11-01; nothing built. Row B17 in `STATUS.md`.

Owner decisions are still needed before Phase 2 ships (global prices) and before Phase 3
ships (Terms wording); see [Owner decisions still open](#owner-decisions-still-open).
Phase 1 can start now: the personal alias price is set (A15). [Costs](#costs) has the
cost math the limits are based on.

## Goal

Let people refer to content by a name they choose instead of a 94-character CID, and change
which CID a name points to without changing the name.

- **Global aliases** are one namespace shared by everyone. Each name has at most one owner,
  who pays a yearly fee for it, sets its value, and can sell it to another user for
  balance.
- **Personal aliases** belong to one account and are visible only to it. When that account
  resolves a name, its personal alias wins over the global alias of the same name. Each
  costs one cent a month, prepaid from balance.
- Values can be changed on the website and through the API.

Done means: a signed-in user can claim, renew, repoint, list, sell, and buy global aliases
and create personal ones from `/dashboard/aliases` and the API; `https://256t.us/@{name}`
resolves for everyone, honoring personal aliases for identified viewers; every money
movement shows in both parties' transaction history; and the Terms describe it.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| A1 | How is an unowned global name acquired? | **Yearly fee** paid from balance, like a domain. Prepay 1–10 years (the S17 retention cap). Lapsed names return to the pool. (Owner, 2026-11-01) |
| A2 | Where do sale proceeds go? | **Seller's HashBin balance, minus a HashBin fee.** Proceeds stay non-withdrawable balance. The Terms change to allow this one kind of transfer; general transfers (B5) stay undecided. (Owner, 2026-11-01) |
| A3 | Who sees personal aliases? | **Owner only.** They override the global alias only when the owner resolves the name with their own identity. No public `/~user/` namespace. (Owner, 2026-11-01) |
| A4 | Market mechanism | **Fixed-price listings plus offers.** Owners may list at a price (buy now) and accept or decline offers. No auctions. (Owner, 2026-11-01) |
| A5 | Allowed names | Lowercase ASCII `a-z`, `0-9`, `-`, `_`, `.`; 1–63 characters; first and last character a letter or digit; no `..`. Input is lowercased, so names are case-insensitive. These are all RFC 3986 unreserved characters, so a name never needs percent-encoding as a path segment. Unicode and other `pchar` characters are left out on purpose (homograph and escaping confusion). Names that are themselves valid 256t identifiers are refused, so an alias can never pass for a CID. |
| A6 | Reserved names | A short list (`api`, `admin`, `www`, `hashbin`, `256t`, `help`, `support`, `login`, `oauth`, `security`, `abuse`, `dmca`, …) lives in `src/utils/alias-names.js`. Only admins can assign them. |
| A7 | Public URL | `https://256t.us/@{name}` answers `302` to `/{cid}`. Redirecting (not serving in place) keeps the bytes at their CID URL, so CID verification, the edge cache and funded-download accounting are untouched. `@` cannot start a CID, so the path can't collide. Info page: `https://hashbin.org/aliases/view.html?name={name}`. |
| A8 | What a value can be | Any valid 256t CID, hosted here or not (inline CIDs and alternate suppliers count). The UI warns when the CID isn't stored on HashBin or expires before the alias does. Aliases point only at CIDs, never at other aliases. |
| A9 | Caching of resolution | Anonymous redirects: `Cache-Control: public, max-age=60`. Any request with an identity (cookie, key, OAuth, signed URL) may hit a personal alias, so its redirect is `private, no-store`. Inside the worker, the global record is cached 60 s for every viewer, and an identified user's personal aliases are cached in isolate memory for 60 s (like `confirmedFunding`), so a stream of identified lookups costs about what anonymous ones do. A value change takes at most 60 s to reach anyone, including the owner on another isolate; the dashboard says so. |
| A10 | Public history | A global alias keeps its last 100 value changes (CID, time) and ownership changes (time, price), shown on its info page, so a reader can see when a name was repointed. Owner identity is never shown publicly (Privacy Policy). Personal aliases keep no public history. |
| A11 | Expiry | At the paid-through time resolution stops (`410`, "alias expired"). For 30 days only the last owner can renew; after that the name is free to claim. Listings and open offers end at expiry. Opt-in auto-renew charges the balance 7 days before expiry. When a name is released, its `AliasRecord` deletes all its storage (`deleteAll`), so lapsed names leave nothing behind; the public history of a released name goes with it. |
| A12 | Sale terms | A sale moves the name, its remaining paid term and its current value to the buyer. Buyer ≠ seller. Prices are integer cents, at least $1.00. The fee is taken from the seller's side. |
| A13 | Offers | An offer debits the buyer immediately and the alias record holds the funds, so accepting can't fail on the buyer's balance. The hold is returned when the offer is declined, withdrawn, expires (default 7 days, max 30), or the alias sells, lapses or is suspended. One open offer per buyer per name. |
| A14 | Moderation | Alias names can be reported (trademark, impersonation, abuse) through the existing dispute flow with a new target type. Admins can suspend a global alias (resolution `451`), restore it, or reclaim it (ends ownership; no refund, matching Decision #13). |
| A15 | Personal alias price | **One cent a month per alias**, prepaid from balance (Owner, 2026-11-01). Prepaid like retention and global names, not billed monthly: creating one buys 1–120 months (default 12, so 12¢), and each has its own paid-through time. Renewal, opt-in auto-renew 7 days before expiry, and no refund on delete or account deletion (Decision #13). At expiry it stops resolving; it is kept 30 days so a renewal restores it, then deleted. Changing its value is free, within A16. |
| A16 | Change limits | **100 changes a day per account**, counting every personal create, value change and delete and every global value change. Counted in the account's `UserProfile` DO, because the per-isolate counters in `src/auth/middleware.js` are best-effort. The limit lives in `src/utils/cost-policy.js` with the other safety limits. At 100 a day, an account holding a single alias still costs less than that alias's 0.92¢ of kept revenue ([Costs](#costs)). |
| A17 | Cost brake | Alias resolution on 256t.us and at `/api/aliases/{name}/resolve` follows the S20 cost brake and hard stop, the same way downloads do, and is sampled in cost monitoring. |

## Architecture

### Storage

- **`AliasRecord` Durable Object, one per global name** (`idFromName('alias:' + name)`).
  It is the single authority for owner, value, paid-through time, auto-renew, listing,
  open offers and their held funds, history, and suspension. One DO per name serializes
  every claim, sale and offer on that name without cross-name locking.
- **Personal aliases in the `UserProfile` DO**, as `personal-alias:{name}` storage keys
  (not inside the profile object, which is already large), each with its CID, paid-through
  time and auto-renew flag. Cap: 1,000 per account. The balance lives in the same DO, so a
  personal alias charge and the alias write are one atomic storage put: no saga needed.
  The profile's existing `alarm()` also schedules the earliest personal renewal or expiry
  (taking the minimum with its other alarm uses); auto-renew charges every alias due in
  one debit and one transaction.
- **The daily change counter (A16)** is a `UserProfile` storage key, so personal changes
  check it in the same put. Global value changes ask the owner's profile to count the
  change before `AliasRecord` commits it.
- **The owner's index of global aliases and open offers** also lives in `UserProfile`
  (`global-alias:{name}` keys), written by `AliasRecord` through its outbox, so
  `/dashboard/aliases` loads from one DO.
- **Expiry:** reuse the `ExpirationIndex` pattern (or a new day-bucketed index) so the
  nightly cron renews, lapses and releases names and expires offers without scanning.

### Money: a saga with an outbox

There are no transactions across DOs, so each money movement is ordered so that a crash at
any point leaves the alias record able to finish or undo it:

1. `AliasRecord` records a pending operation with a `request_id` (the client may supply
   one; retries with the same id return the first result).
2. It debits the payer's `UserProfile` with that `request_id`.
3. On success it commits the change (owner, term, offer hold) **and**, in the same storage
   put, queues outbox entries: seller credit, HashBin fee revenue (`PlatformStats`),
   `PaymentRecord` transactions for both parties, and the owner-index updates.
4. An alarm delivers the outbox, retrying until each entry is acknowledged.
5. If the debit fails, the pending operation is dropped and nothing changes. If the record
   finds a pending operation with no outcome (crash between 2 and 3), it asks the profile
   whether that `request_id` was debited and finishes or abandons accordingly.

Prerequisite: `debitBalance` and `depositBalance` in `src/durable-objects/user-profile.js`
take no idempotency key today. Add an optional `request_id` with a bounded receipt store
(the download leases already keep receipts this way) so step 2, outbox credits and refunds
are safe to retry. Copy the delivery loop from `src/durable-objects/download-outbox.js`.

New transaction types for `PaymentRecord` and the history page: `alias_registration`,
`alias_renewal`, `alias_purchase`, `alias_sale` (net of fee, fee shown), `alias_offer_hold`,
`alias_offer_return`, and `personal_alias` (creation or renewal; lists the names and
months).

Prices and the sale fee go in `src/utils/pricing.js` (`PERSONAL_ALIAS_MONTHLY_CENTS = 1`,
plus the global prices once set), never duplicated in the frontend; the UI reads quotes
from the API. The daily change limit goes in `src/utils/cost-policy.js`.

### Resolution on 256t.us

`workers/256t-content/src/index.js` matches `^/@([^/]+)$` before the CID path:

1. If the cost brake or hard stop is on (`readCostSafety`), answer as a download would
   (A17). Normalize and validate the name (`404` if invalid).
2. Run `parseIdentity` non-strictly. With an identity, look the name up in that user's
   personal aliases, fetched from `UserProfile` as one map of unexpired names and cached
   in isolate memory for 60 s, bounded like the funding caches. A hit redirects with
   `private, no-store`.
3. Otherwise read `AliasRecord` through the Cache API (60 s, for every viewer) and
   redirect, or answer `404` (never claimed), `410` (expired) or `451` (suspended). Cache
   the `404` answer for a never-claimed name too, so probing unclaimed names doesn't reach
   a DO each time.
4. The redirect target is `/{cid}`, or `/a/{cid}` when the request was strict, so the
   identity carries through. A signed-URL token is for one CID, so signed URLs never use
   aliases.
5. Count the request with `enforceRateLimit` and `sampleDownload` (as status 302), so
   alias lookups show up in cost monitoring. The 256t.us worker needs an `ALIAS_RECORDS`
   binding.

Browser SDK: `hashbin.resolveAlias(name)` calls `GET /api/aliases/{name}/resolve` and
returns the CID, which the caller then downloads and verifies as today. This is a new SDK
version (`node scripts/release-browser-sdk.mjs`); never edit `frontend/sdk/vX.Y.Z/`.

### API

All in a new `src/api/aliases.js`, declared in `API_ROUTES`. New scopes in
`src/auth/scopes.js`: `aliases:read`, `aliases:write` (personal aliases; values and
auto-renew of owned global names), `aliases:purchase` (claim, renew, buy, make and
withdraw offers; added to `SPENDING_SCOPES` so key and grant spend limits apply), and
`aliases:sell` (list, unlist, accept and decline offers).

| Method | Path | Access | Does |
|--------|------|--------|------|
| GET | `/api/aliases/{name}` | PUBLIC | Status (free, owned, expired, reserved, suspended), value, paid-through, listing price, public history, claim price if free |
| GET | `/api/aliases/{name}/resolve` | PUBLIC | `{ cid, source: 'personal' \| 'global' }`; uses the caller's identity when present |
| POST | `/api/aliases/{name}/claim` | `aliases:purchase` | `{ years, cid, request_id }` |
| POST | `/api/aliases/{name}/renew` | `aliases:purchase` | `{ years, request_id }`; owner, or last owner in the 30-day grace |
| PUT | `/api/aliases/{name}/value` | `aliases:write` | `{ cid }`; owner only |
| PATCH | `/api/aliases/{name}` | `aliases:write` | `{ auto_renew }` |
| PUT, DELETE | `/api/aliases/{name}/listing` | `aliases:sell` | Set or remove a buy-now price |
| POST | `/api/aliases/{name}/buy` | `aliases:purchase` | `{ price_cents, request_id }`; refuses if the price changed |
| GET, POST | `/api/aliases/{name}/offers` | `aliases:sell` / `aliases:purchase` | Owner lists offers; buyer makes `{ amount_cents, expires_in_days, request_id }` |
| DELETE | `/api/aliases/{name}/offers/{id}` | `aliases:purchase` | Buyer withdraws (hold returned) |
| POST | `/api/aliases/{name}/offers/{id}/(accept\|decline)` | `aliases:sell` | Owner decides |
| GET | `/api/user/aliases` | `aliases:read` | Owned global names, personal aliases, own open offers, changes left today |
| POST | `/api/user/aliases/personal` | `aliases:purchase` | Create: `{ name, cid, months, request_id }`, charged 1¢ × months |
| POST | `/api/user/aliases/personal/{name}/renew` | `aliases:purchase` | `{ months, request_id }`; also restores one within 30 days of expiry |
| PUT | `/api/user/aliases/personal/{name}` | `aliases:write` | Change the value: `{ cid }` (free; counts toward A16) |
| PATCH | `/api/user/aliases/personal/{name}` | `aliases:write` | `{ auto_renew }` |
| DELETE | `/api/user/aliases/personal/{name}` | `aliases:write` | Delete; no refund |
| POST | `/api/admin/aliases/{name}/(suspend\|restore\|reclaim\|assign)` | `admin:takedown` | Moderation and reserved names |

Errors are `{ error, ... }` JSON: `invalid_name`, `reserved_name`, `name_taken`,
`not_owner`, `price_changed`, `insufficient_balance`, `alias_expired`, `alias_suspended`,
`change_limit` (`429` with `Retry-After` at the next UTC day). Changes are limited per
account by A16; claims and offers get their own per-account limits. Regenerate the route
index in `docs/API.md` afterward.

### Website

- `/dashboard/aliases`: owned global names (value, paid-through, auto-renew, renew,
  listing, incoming offers), personal aliases (add with a months picker and its price,
  edit, renew, auto-renew, delete, paid-through), the user's outgoing offers, and changes
  left today. Changing a value asks for the CID, shows what it points to now, and says
  the change can take up to a minute to reach every viewer.
- `/aliases/view.html?name=`: public info page with status, value, history, claim form if
  free, buy-now and make-offer if listed or owned by someone else, and "Report this alias".
- An "Add alias" action on `/dashboard/uploads/{cid}` that prefills the CID.
- Transaction history labels and filters for the new types.
- Link the public page from `frontend/sitemap.html`; escape every name and CID with
  `escapeHtml`.

### Things that touch existing systems

- **Account deletion** (`src/api/auth.js`, the Clerk webhook): global names are released
  at once, listings cancelled, outgoing offers returned, incoming offers declined, and
  personal aliases deleted with no refund of prepaid months.
- **Account move** (`src/services/account-move.js`): moves personal aliases and global
  ownership; `AliasRecord` must accept an admin owner change.
- **Backups** (`BackupIndex`): register each `AliasRecord` like other per-object DOs.
- **New DO checklist**: export from `src/index.js`, binding and migration in
  `wrangler.toml`, same binding in `wrangler.local.toml`, and the content worker's
  `wrangler.toml`.
- **Decision #12 (hash-only access)** in `todo/master_plan.md` gains an exception: names
  resolve to CIDs by exact lookup only. There is no search or browse of aliases.
- **Disputes**: a `target_type` of `alias` on `/api/disputes`, with the admin review page
  offering suspend and reclaim.

## Phases

Each phase is shippable on its own and keeps `npm run test:unit` and `npm run lint` green.

### Phase 1: names and paid personal aliases

- [ ] `src/utils/alias-names.js`: normalize, validate (A5), reserved list (A6), refuse
      valid 256t identifiers; table-driven tests.
- [ ] `PERSONAL_ALIAS_MONTHLY_CENTS` in `pricing.js`, the daily change limit in
      `cost-policy.js`, and a cost test (see [Costs](#costs)) that fails if the limit or
      prices change so that one alias's kept revenue no longer covers its worst case.
- [ ] Personal alias storage, charges, change counter and routes in `UserProfile`; the
      `/api/user/aliases...` routes; new scopes; the `personal_alias` transaction type.
- [ ] Renewal, auto-renew, expiry and 30-day deletion through the profile alarm.
- [ ] `/api/aliases/{name}/resolve` with personal-only resolution.
- [ ] `/@{name}` in the content worker (personal aliases only for now; `404` otherwise),
      with tests for identity, the isolate cache, caching headers, strict paths, rate
      limiting, the brake and hard stop, and cost sampling.
- [ ] Personal aliases section of `/dashboard/aliases`.

### Phase 2: claiming, renewing and repointing global aliases

- [ ] Idempotent `debitBalance`/`depositBalance` with `request_id` receipts.
- [ ] `AliasRecord` DO with claim, renew, value, auto-renew, history, outbox; bindings,
      migration, backups.
- [ ] Expiry index and nightly cron: auto-renew, expire, release after grace and
      `deleteAll` on release.
- [ ] Global value changes count toward the owner's A16 limit.
- [ ] Global resolution on 256t.us (A7, A9) and in the resolve endpoint.
- [ ] Public info page, dashboard owned-names section, transaction types.
- [ ] Prices in `pricing.js` once the owner sets them.

### Phase 3: listings and buy-now

- [ ] Listing routes, buy saga (debit buyer, transfer, credit seller minus fee, fee to
      `PlatformStats`), `price_changed` guard.
- [ ] Buy button on the info page; listing controls on the dashboard.
- [ ] Terms and Privacy Policy wording (owner) before this phase is deployed.

### Phase 4: offers with held funds

- [ ] Offer routes, holds, returns on every ending (A13), offer expiry in the cron.
- [ ] Offer UI for both sides; holds shown in transaction history.

### Phase 5: moderation and lifecycle

- [ ] Alias disputes, admin suspend/restore/reclaim/assign, reserved-name assignment.
- [ ] Account deletion and account move handling.
- [ ] Local API suite in `scripts/api-tests/` covering a full claim → list → offer →
      accept → repoint cycle between two `LocalDev` users; Playwright test for the
      dashboard.

### Phase 6: SDK and docs

- [ ] `resolveAlias` in `frontend/sdk/hashbin.js`; release a new SDK version and register
      it (see `AGENTS.md`).
- [ ] `docs/API.md`, `frontend/docs/` page on aliases, pricing page entry.

## Costs

Rates are the marginal list prices in `src/utils/cost-policy.js` (reviewed 2026-10-24).
Recompute them here when that file changes; the Phase 1 cost test does the same check in
code. Every number below is the worst case a user can reach within the limits.

### Storage: negligible

| Item | Size | Cost |
|------|------|------|
| One personal alias (key, name, CID, timestamps) | ~250 B | $0.20/GB-month → $0.00000005/month |
| One account at the 1,000-alias cap | ~250 KB | $0.00005/month (revenue: $10.00/month) |
| One global name with 100 history entries and offers | ~15 KB | $0.000003/month |

Backups add one more copy of the same bytes in R2 ($0.015/GB-month), which doesn't
change the picture. Released global names delete their storage (A11); expired personal
aliases are deleted 30 days after expiry (A15).

### Changes: what A16 is sized for

One create, value change or delete costs about **$2.51 per million**:

| Part | Per million |
|------|-------------|
| Worker request | $0.30 |
| CPU, ~3 ms at $0.02/M ms | $0.06 |
| DO request | $0.15 |
| Rows written: the value, plus the change counter or history entry | $2.00 |

- An account needs at least one paid alias to make any change. One personal alias brings
  in 1¢ a month, of which HashBin keeps 0.92¢ after card fees (`revenueKept`).
- At the A16 limit of 100 changes a day: 3,000 a month × $2.51/M = **0.75¢ a month**,
  under the 0.92¢ that one alias keeps. (The 60-an-hour limit first planned allowed
  43,800 a month, about 11¢: $1.32 a year, more than a global name's suggested $1.00
  yearly fee.)
- Creating the 1,000th alias, or the first, costs the same 0.00025¢ to write; the charge
  for it is at least 1¢.
- Charges are prepaid, so a renewal is one debit (a few DO requests and rows, well under
  0.01¢) for any number of months or aliases.

### Resolution: bounded by caching and the brake, not by revenue

| Lookup | Per million |
|--------|-------------|
| Anonymous, cached record | $0.30 Worker + ~$0.04 CPU = **~$0.34** |
| Identified, uncached (as first planned) | ~$0.34 + profile DO $0.15 + alias DO $0.15 + duration ≈ **~$0.65** |
| Identified, with A9 caching | **~$0.34**, plus at most one profile DO call per user per isolate per minute |

For comparison, a funded download costs about $1.24/M and is charged $4/M. Lookups are
free to the viewer, so nothing pays for them per request. With A9 caching they cost the
same as any junk request to 256t.us today: a client making 100 requests a second for a
month (260 million) costs about $90 either way. That traffic is bounded by the same
things that bound junk traffic now: the WAF rule (`todo/cost_safety_cloudflare.md`) and
the S20 brake (A17). The new risk caching removes is the DO calls: without it, the same
client would cost about $170 and would add load to its own profile DO.

## Owner decisions still open

1. **Yearly price.** Suggested $1.00/year for every name, with no length tiers to start.
2. **Sale fee.** Suggested 10% of the price, minimum $0.10.
3. **Terms of Service** (L5): allow alias sales to move balance between users; say an
   alias is a license to a name, not ownership of a trademark; say names can be suspended
   or reclaimed without refund; say what happens to names when HashBin shuts down (S17).
4. **Fraud exposure.** Balance can't be cashed out, so a stolen card can at most become
   another user's storage credit through a sale. Suggested start: no holding period on
   proceeds, but an alert when one account's alias sales exceed $50 in a day. Revisit if
   chargebacks on deposits that bought aliases appear.
5. **Trademark claims** on names: whether to follow a UDRP-style rule (a mark holder can
   take a name from a bad-faith holder) or only remove abusive names.
