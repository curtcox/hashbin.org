# Least-privilege keys: every issued credential carries only what it needs

## Status

**Phase:** Implemented and deployed 2026-10-27 (commits 81b7dd9 through 405af40), except
retiring `ADMIN_SECRET_TOKEN`, which waits on `ADMIN_USER_ID` being configured in
production. Row B12 in `STATUS.md`.

### Remaining

- [ ] Set the production `ADMIN_USER_ID` secret (GitHub secret of the same name, or
  `wrangler secret put ADMIN_USER_ID`) to the admin's Clerk user ID. Production has none,
  so today the legacy token is the only way into admin.
- [ ] Keep the token through the move to a production Clerk instance, which changes the
  admin's user ID: [clerk_remaining.md](clerk_remaining.md) CL12–CL15. Retiring it is CL15.
- [ ] Then (CL15) remove `X-Admin-Token` support (`validateAdminToken` and its branch in
  `authenticate()`, the token fallbacks in `frontend/js/admin-auth.js` and the admin
  pages, scripts and docs), the deploy.yml step, and the `ADMIN_SECRET_TOKEN` secret.
- [ ] Delete the unused `API_KEY_ENCRYPTION_KEY` Worker secret and GitHub secret.

### How it differs from the plan

- Phase 6 shipped before Phase 5, so admin keys were signed with their own derived key
  from the start.
- The KeyRegistry class was deleted in a second deploy (migration v11), after the 256t.us
  Worker had shipped without its binding; deleting it in the same deploy would have
  failed while the old content Worker still bound it.
- The monthly spend limit also covers funded download leases, for keys and grants alike.
  It is optional on keys and required on app grants that hold a spending scope.
- Admin key use is recorded on the key (`last_used_at`, `usage_count`); admin actions
  name the key in the admin action log. Reads are not logged one by one.
- Admin pages act as the signed-in admin and keep the legacy token field as a fallback
  until the token is retired.

### Also fixed along the way

- `/oauth/authorize` (POST) accepted API keys and app tokens, letting a delegated
  credential approve new grants; it is now session-only.
- `GET /api/auth/session` returned the whole profile to any credential; now session-only.
- Re-uploading existing content and rate-limit purchases were outside the app spending limit.
- The rate-limit purchase rollback called a profile route that does not exist, so a failed
  purchase was never refunded.
- Refresh-token rotation still minted tokens for a revoked grant.

### Known unrelated issues

- `U-034` and `E-005` in the local API suites ask for 1,000,000 months of retention, above
  the 120-month cap, so they fail before reaching the balance check they mean to test.
- The deploy workflow's native funded acceptance intermittently hits a workerd segmentation
  fault in CI (also on commits before this work); re-running the failed job passes.

## Goal

Anyone who issues a credential (an API key, an OAuth grant, an admin key, a signed
download link) can narrow it to exactly the capability needed, and the server
denies everything else by default. A leaked credential can then do no more than the
narrowest job it was issued for.

## Decisions taken

- **Scopes plus caveats.** Scopes name *what* a credential may do (`resource:action`,
  shared by API keys, OAuth grants and admin keys). Caveats limit *how much*:
  spend, retention, upload size, CID allow-list, expiry. All are stored server-side
  and enforced in one place.
- **No legacy support.** The only current user is the owner. Old key formats, the
  KeyRegistry lookup and existing keys are removed outright; keys are reissued with
  scopes after deploy.
- **Scoped admin keys.** The shared `ADMIN_SECRET_TOKEN` is replaced by issued admin
  keys scoped per area. Delegated credentials never inherit admin power from the
  account they belong to.

## Inventory: every credential the app issues or accepts

| # | Credential | Format / where minted | Lifetime | Stored as | Can do today |
|---|---|---|---|---|---|
| 1 | Clerk session JWT | Clerk (not us); `Authorization: Bearer` | Clerk-managed | — | Everything for the account. **Root credential.** |
| 2 | LocalDev identity | `Authorization: LocalDev <user>`; local mode only | request | — | Same as a session (local mode only) |
| 3 | API key v2 | `hb2_<route>.<random>.<hmac>`; `src/api/auth.js:372`, `src/auth/download-tokens.js:23` | default **5 years** | SHA-256 hash **plus reversibly encrypted copy** (reveal) | Acts as the whole account except key management, linking, account deletion and budget management (see gaps) |
| 4 | API key legacy | `hb_` / `hb_live_` / `hb_test_` + 32 chars; looked up via `KEY_REGISTRY` | as stored | hash | Same as #3; also funded downloads on the plain path |
| 5 | OAuth authorization code | HS256 JWT, `OAUTH_SIGNING_KEY`; `src/api/oauth.js:324` | 10 min, not single-use | — | Exchange for #6/#7 with PKCE verifier |
| 6 | OAuth access token | HS256 JWT; `src/api/oauth.js:704,777` | 1 h | — | Scopes `content:write`, `content:read`, `balance:read`, `downloads:spend`, **plus several unscoped endpoints** (see gaps) |
| 7 | OAuth refresh token | `hbr_<user>.<random>`; rotated on use | 30 days, sliding forever | hash in profile | Mint #6 for the grant's scopes |
| 8 | OAuth client secret | `hbs_…`; `src/durable-objects/application-registry.js:150` | forever | hash | **Nothing** — never checked (PKCE public clients) |
| 9 | Signed download URL token | `signDownloadToken({type:'url'})`; `src/api/downloads.js:50` | ≤ 7 days, one CID | — | Funded download of one CID, charged to the minting key/grant/session |
| 10 | Download handshake token | `type:'handshake'`; `src/api/downloads.js:60` | 60 s | — | Start a browser download session |
| 11 | Download session cookie | `__Host-hb_dl`, `type:'cookie'`; `workers/256t-content/src/funding.js:131` | ≤ 30 days, revocable | session in profile | Funded downloads within account caps |
| 12 | Admin token | static `ADMIN_SECRET_TOKEN`, `X-Admin-Token` | forever | wrangler secret, pasted into admin pages' sessionStorage | **Every** admin endpoint: stats, costs, backups, restore, export, disputes, takedowns |

Inbound-only secrets (Stripe webhook signature, Clerk/Svix webhook signature,
`CLERK_SECRET_KEY`) are not issued to anyone and are out of scope.

## Gaps found

- **G1 — API keys are the whole account.** `src/index.js:199` sets `request.user`
  for API keys; most handlers only reject OAuth (`isOAuthAuth`), so a key named
  "Hosting" can delete content, buy rate limits, extend retention, manage suppliers,
  create OAuth apps, change default retention, revoke OAuth grants, read balance
  history and spend download budget.
- **G2 — Admin through any API key.** `isAdminRequest` (`src/auth/admin.js:67`)
  accepts any `request.user` whose ID is `ADMIN_USER_ID`, so every API key the admin
  creates can resolve disputes and take content down.
- **G3 — OAuth reaches unscoped endpoints.** No scope check on
  `POST /api/content/rate-limit/purchase` (spends balance, bypasses the grant's
  spending limit), supplier create/update/delete/rescan, `POST /api/balance/deposit`,
  `GET|PATCH /api/account/settings`, `GET /api/account/authorizations`,
  `DELETE /api/account/authorizations/:app`.
- **G4 — OAuth can raise its own spend.** `PATCH /api/account/settings` lets a
  `content:write` app set `default_retention_months` to 120, which multiplies the cost
  of every upload it makes.
- **G5 — Spending limit covers uploads only.** `spending_limit` is checked in the
  upload debit (`user-profile.js:1420`) but not for rate-limit purchases or
  extensions.
- **G6 — `content:read` grants nothing.** The endpoints it describes are public.
- **G7 — Token scopes ignored.** Middleware uses `grant.scopes || payload.scopes`
  (`middleware.js:315`), so a narrower access token cannot exist; and one grant per
  (user, app) means two installs of the same app cannot hold different scopes.
- **G8 — Users cannot narrow at consent.** The consent page is approve/deny for the
  app's full request; scopes and limit cannot be lowered, then or later.
- **G9 — No grant expiry.** Refresh tokens slide forever.
- **G10 — Keys are recoverable.** API keys are stored reversibly encrypted with
  `API_KEY_ENCRYPTION_KEY` for the reveal feature; anyone with that secret and DO
  storage can recover every key.
- **G11 — Long default key lifetime** (5 years).
- **G12 — Unused client secret** is still generated and returned (#8).
- **G13 — One HMAC key for every download-token purpose and API-key tags**
  (`DOWNLOAD_TOKEN_SECRET`); purposes are distinguished only by payload shape.
- **G14 — Authorization codes are replayable** within 10 minutes (PKCE mitigates).
- **G15 — Single root admin token**, pasted into a browser tab and shared by scripts.

## Design

### Scope vocabulary

One list in a new `src/auth/scopes.js`, used by API keys, OAuth grants, admin keys
and the consent/key-creation UIs. Each scope names the endpoints it unlocks.

| Scope | Endpoints | Spends? | API key | OAuth | Admin key |
|---|---|---|---|---|---|
| `content:write` | `POST /api/content` | yes | ✓ | ✓ | |
| `content:extend` | `POST /api/content/:cid/extend` | yes | ✓ | ✓ | |
| `content:delete` | `DELETE /api/content/:cid` (own) | | ✓ | ✓ | |
| `uploads:read` | `GET /api/user/uploads` | | ✓ | ✓ | |
| `balance:read` | `GET /api/balance` | | ✓ | ✓ | |
| `transactions:read` | `GET /api/balance/history` | | ✓ | ✓ | |
| `ratelimit:purchase` | `POST /api/content/rate-limit/purchase` | yes | ✓ | ✓ | |
| `downloads:spend` | funded downloads, `POST /api/downloads/sign` | yes | ✓ | ✓ | |
| `suppliers:read` | `GET /api/suppliers`, `GET /api/suppliers/:id` (own) | | ✓ | ✓ | |
| `suppliers:write` | supplier create/update/delete/rescan | | ✓ | ✓ | |
| `admin:disputes` | `/api/admin/disputes*`, repeat infringers, admin actions | | | | ✓ |
| `admin:takedown` | `POST /api/admin/content/:cid/delete` | | | | ✓ |
| `admin:stats` | `/api/admin/stats*`, health, alerts (read/ack), audit log | | | | ✓ |
| `admin:costs` | `/api/admin/costs*`, profitability, cost safety | | | | ✓ |
| `admin:backups` | backup status/run/file/list | | | | ✓ |
| `admin:restore` | `POST /api/admin/restore` | | | | ✓ |
| `admin:export` | `GET /api/admin/export` | | | | ✓ |

`content:read` is removed. **Session-only** (never delegable, enforced by one guard
instead of per-handler `isOAuthAuth` checks): API key and admin key management,
developer apps, account settings, OAuth authorization list/revoke, download
budgets/caps and sessions, deposits, provider linking, account deletion.

### Caveats

Stored with the key or grant; each is optional and only ever narrows.

| Caveat | Applies to | Enforced where |
|---|---|---|
| `expires_at` | all | middleware (keys default 90 days, max 1 year; grants optional) |
| `monthly_spend_limit_cents` | every spending scope | the single profile debit path, not per handler |
| `max_retention_months` | `content:write`, `content:extend` | before pricing; uploads use `min(default, cap)` |
| `max_upload_bytes` | `content:write` | before reading the body |
| `content_types` | `content:write` | upload validation |
| `cids` (allow-list) | `content:extend`, `content:delete`, `ratelimit:purchase`, `downloads:spend` | handler after CID parse; funding check on 256t.us |
| download caps | `downloads:spend` | existing per-key/grant caps |

IP or origin pinning is left out of the first pass (see open questions).

### Enforcement

- `authenticate()` returns a uniform `principal`: `{ userId, kind: 'session' | 'key' |
  'oauth' | 'admin', id, scopes, caveats }`. Sessions (and local mode) get the
  implicit root principal: all non-admin scopes, no caveats; the `ADMIN_USER_ID`
  session also gets all `admin:*` scopes.
- One `authorize(principal, scope, context)` returns a 403 response or null. It checks
  the scope, then the caveats relevant to `context` (CID, bytes, retention, type).
  `requireSession(principal)` guards session-only routes.
- Route table in `src/index.js` declares the required scope per route, so a new
  route without a declaration fails a unit test (default deny).
- `request.user` is set for every principal; handlers read `principal`, never
  `authMethod`. `isAdminRequest` becomes `authorize(principal, 'admin:…')`.
- Effective OAuth scopes = `grant.scopes ∩ token.scopes`; effective caveats are the
  tighter of grant and token.
- Spending: every debit (`upload`, `extend`, `rate-limit purchase`, download leases)
  passes the principal to the profile DO, which applies `monthly_spend_limit_cents`
  for keys and grants alike.

### Credential formats

- **API keys and admin keys** keep the v2 signed-route shape, with a purpose tag in
  the route so admin and user keys can never be confused:
  `hbk_<route>.<random>.<tag>` (user) and `hba_<route>.<random>.<tag>` (admin).
  Scopes and caveats live in the profile/admin store, not in the key, so they can be
  narrowed or revoked without reissuing.
- Stored as hash only. Shown once at creation; reveal is removed.
- Per-purpose HMAC subkeys derived from `DOWNLOAD_TOKEN_SECRET` (HKDF with
  labels `api-key`, `admin-key`, `dl-url`, `dl-handshake`, `dl-cookie`).

## Phases

### Phase 1 — Central scope model and default deny

- [x] Add `src/auth/scopes.js`: scope list, descriptions, which credential kinds may
  hold each, session-only route list.
- [x] Make `authenticate()` return the uniform principal; add `authorize()` and
  `requireSession()`.
- [x] Declare a scope (or `public` / `session`) for every route in `src/index.js`;
  add a test that walks the route table and fails on undeclared routes.
- [x] Replace every `isOAuthAuth` / `authMethod !==` check with the declared guard.
- [x] Tests: for each route × credential kind, allowed vs 403 (closes G1, G3).

### Phase 2 — Scoped API keys, no legacy

- [x] Key creation takes `scopes` (required, non-empty) and optional caveats;
  validate against the scope table.
- [x] Rename prefix to `hbk_`; delete `hb_`/`hb_live_`/`hb_test_` parsing in
  `src/auth/utils.js`, the legacy branch in `workers/256t-content/src/funding.js`,
  and the `KEY_REGISTRY` Durable Object (bindings in both `wrangler*.toml`, backup
  list in `src/utils/backup.js`, health list in `src/index.js`, plus a
  `deleted_classes` migration).
- [x] Remove reveal: `encryptApiKey`, `POST /api/auth/apikeys/:id/reveal`, the
  `API_KEY_ENCRYPTION_KEY` secret and the reveal UI (closes G10).
- [x] Default expiry 90 days, max 1 year (G11).
- [x] `downloadIdentityValid` requires `downloads:spend` on keys too.
- [x] Revoke all existing keys at deploy; document reissuing in
  `docs/api-keys-setup.md`.
- [x] UI (`frontend/api-keys-create.html`, `api-keys-detail.html`): scope checkboxes
  with nothing pre-checked except a chosen preset ("Publish only", "Publish +
  balance", "Downloads only"), caveat fields, and a scope/caveat summary on detail.
  Allow narrowing an existing key (never widening).

### Phase 3 — Caveats

- [x] Store caveats on keys and grants; validate on creation/consent.
- [x] Enforce `max_upload_bytes`, `content_types`, `max_retention_months` in
  `handleUploadContent`; `max_retention_months` and `cids` in extend.
- [x] `cids` in delete, rate-limit purchase and `downloads/sign`; carry the CID
  check into the 256t.us funding path for direct key/OAuth downloads.
- [x] Move spend-limit enforcement to the single profile debit and call it from
  extend and rate-limit purchase (closes G5). Rename grant `spending_limit` (USD) to
  `monthly_spend_limit_cents` for keys and grants alike.
- [x] Tests per caveat: just inside allowed, just outside denied.

### Phase 4 — OAuth narrowing

- [x] Replace `content:read` with `uploads:read` etc. from the shared table; update
  consent text, `frontend/developers.html`, `docs/API.md`,
  `docs/publishing-from-the-command-line.md`, examples and the video-series scope
  lists (G6).
- [x] Consent page: scope checkboxes (user may uncheck any), editable spend limit
  (may only lower the app's request, and is required when a spending scope is
  granted), retention cap, optional grant expiry (G8, G9).
- [x] Account page: edit an existing grant's scopes/caveats downward.
- [x] Token endpoint accepts `scope` on `authorization_code` and `refresh_token`
  requests to mint narrower access tokens (RFC 6749 §6); middleware intersects
  token and grant scopes (G7).
- [x] Allow several grants per (user, app), each with its own refresh tokens, so
  two installs can hold different scopes. Revoke by grant ID.
- [x] Single-use authorization codes: record the code `jti` in the profile until
  expiry (G14).
- [x] Stop generating client secrets (G12).
- [x] Update `scripts/publish.mjs` to request only `content:write balance:read` with
  a retention cap.

### Phase 5 — Scoped admin keys

- [x] Admin keys (`hba_`) issued only from the `ADMIN_USER_ID` session, with
  `admin:*` scopes and caveats (expiry required, max 90 days). Store them in a
  dedicated admin-keys store, hash only.
- [x] Admin UI pages (`frontend/admin/*`) use the admin's Clerk session instead of a
  pasted token; add an admin-keys management page.
- [x] `scripts/cost-safety-report.mjs` uses an `admin:costs` key;
  `scripts/backup/restore-snapshot.mjs` uses `admin:backups admin:restore`.
- [x] `isAdminRequest` / `requireAdmin` become `authorize(principal, 'admin:…')`;
  user API keys and OAuth tokens can never hold `admin:*` (closes G2).
- [ ] Remove `ADMIN_SECRET_TOKEN` and `X-Admin-Token` support, the deploy.yml step and
  the GitHub secret (G15). Break-glass is the admin's Clerk session.
- [x] Every admin key use is written to the admin action log with the key ID.

### Phase 6 — Token hygiene

- [x] HKDF per-purpose subkeys for download tokens and key tags (G13); one-time
  rotation invalidates outstanding links and sessions, acceptable with one user.
- [x] Signed download URLs record the minting credential's caveats at check time
  (already re-validated through `downloadIdentityValid`; add CID caveat).
- [x] Rate limiting keyed by principal (`kind:id`) for every kind, not only keys.

### Phase 7 — Docs and status

- [x] `docs/API.md`, `docs/api-keys-setup.md`, `docs/ADMIN_SYSTEM.md`,
  `docs/backup-and-restore.md`, `frontend/docs/*`: scope table, caveats, key
  formats, admin keys.
- [x] Add a `STATUS.md` row pointing here.

## Acceptance

- A route × credential-kind matrix test passes with default deny for every
  undeclared combination.
- A key created with only `content:write`, `max_upload_bytes: 1048576`,
  `max_retention_months: 12`, `monthly_spend_limit_cents: 200` can publish a 1 MB file
  for 12 months and is refused for: 1 MB + 1 byte, 13 months, the 201st cent of the
  month, deletion, balance read, settings, suppliers, downloads and admin routes.
- An OAuth app approved with only `balance:read` cannot purchase rate limits, change
  settings or revoke grants.
- The admin's own API key cannot reach any admin route.
- No code path accepts `hb_`, `hb2_`, `X-Admin-Token`, or reveals a stored key.
- Unit tests, `npm run test:funded:local` and both Worker dry-runs pass.

## Open questions

1. **IP / origin pinning.** Worth adding a `source_ips` caveat for server-side keys
   (checked against `CF-Connecting-IP`)? Left out of the first pass.
2. **Offline attenuation.** Holders cannot derive narrower keys without calling the
   server. A `POST /api/auth/apikeys/:id/derive` that a key can call to mint a
   strictly narrower child key would cover most uses; full macaroon/Biscuit tokens
   are not planned.
3. **Deposits.** Treated as session-only. Should an app ever be able to start a
   Stripe checkout for the user (the user still pays on Stripe's page)?
