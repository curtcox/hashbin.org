# devicebasedauth.org integration

Row **S24** (device-bound keys and account linking) and **S25** (sign in with
devicebasedauth.org) in `STATUS.md`. The user-facing reference is
[`docs/devicebasedauth.md`](../docs/devicebasedauth.md).

## Status

**Phase:** code complete on `main` (2026-11-22) and deployed. What remains is owner setup at
devicebasedauth.org, a live check, and live browser acceptance. The owner chose direct DBA sign-in alongside Clerk (2026-11-27);
S25 Stage A is optional.

[devicebasedauth.org](https://devicebasedauth.org) ("DBA", repo `curtcox/device-based-auth`)
issues revocable, device-bound credentials: a device makes its own P-256 key, and DBA signs a
readable list of what that device may do, for which site, when and where. Its plan for HashBin
is §9 of `todo/master_plan.md` in that repo. The HashBin scopes are DBA actions
`hashbin:<scope>`, plus `hashbin:session`.

## What exists

| Piece | Where |
|---|---|
| Vendored verifier `@devicebasedauth/verify` (DBA commit `60aa3c3`); never edit, refresh by copying | `src/vendor/devicebasedauth/` (its README says how) |
| Issuer config, the shared verifier (replay cache, catalog, online key), OIDC client, link-index helpers | `src/auth/dba.js` |
| Validating a credential, pushed revocations, online decisions | `src/auth/dba-auth.js` (called from `src/auth/middleware.js` and the dispatcher in `src/api-routes.js`) |
| `ACCOUNT_SESSION` access: the account's own sign-in, never a device session | `src/auth/scopes.js`, `API_ROUTES` |
| Link and credential routes; the revocation webhook | `src/api/dba.js`, `src/api/dba-events.js` |
| `DbaLink` (DBA account → user, `v13`, backed up), `DbaRevocations` and `DbaReplayCache` (`v14`) | `src/durable-objects/dba-link.js`, `dba-revocations.js`, vendored `replay-do.js` |
| Profile side: `dba_link`, pending OIDC state, `dba_credentials` records, the credentials list | `src/durable-objects/user-profile-dba.js`, `src/utils/credential-spend.js` |
| Revocation checks before stored-spender charges and download leases | `src/durable-objects/dba-spend-check.js`, `src/durable-objects/download-budget.js` |
| Signed download links with a `dba` identity | `src/api/downloads.js`, `src/utils/download-budget.js` |
| Any-origin CORS for `Authorization: DBA` | `src/auth/oauth-cors.js` |
| Account Settings section (link, credentials, caps) and the callback page | `frontend/account.html#dba`, `frontend/js/dba-link.js`, `frontend/auth/dba/callback.html` |
| Tests with a fake DBA (credentials, status lists, ID tokens and events signed with the vendored `issuer.js`; JWKS, status list, catalog, OIDC and `/authorize` served by a stubbed `fetch`) | `test-utils/dba-fixture.js`, `src/auth/dba*.test.js`, `src/durable-objects/dba-link.test.js` |

The branch's first version was checked once end to end against DBA's real Worker run
in-process (OIDC link, a credential enrolled at DBA reading the balance, an access token,
scope and session refusals, and revocation at DBA answering 401). The later additions are
tested against the fake only.

## How it works

- **Verification is offline.** DBA's JWKS (1 hour), status lists (at most 5 minutes) and the
  hashbin.org catalog (1 hour) are cached in one verifier per issuer per isolate. Failure to
  fetch any of them fails closed (`503 AUTH_DBA_UNAVAILABLE`). DPoP proof ids are claimed in
  `DbaReplayCache` (16 shards), so a proof works once across all isolates; that object being
  unreachable also fails closed.
- **Revocation.** Status lists are authoritative. DBA's webhook (`POST /api/dba/events`,
  public, issuer-signed) records revoked status entries in `DbaRevocations` until the
  credential's expiry; isolates read that set at most every 30 seconds. A read failure there
  counts as "nothing pushed" (the status list still applies).
- **Account linking** is OIDC (authorization code + PKCE, no client secret), client ID
  `hashbin.org`, redirect `https://hashbin.org/auth/dba/callback` (local mode: this origin's).
  State, nonce and verifier stay in the profile DO for 10 minutes and are taken on first use.
  Finishing writes `DbaLink` first, then the profile; a credential is accepted only when both
  agree. One DBA account links to one user; a stale link can be taken over.
- **Scopes.** Each `hashbin:<scope>` the grants allow offline now is held. Scopes allowed only
  online (step-up, gates, `limits.uses`, `require.online`, gated catalog actions) are listed in
  `user.dba.onlineScopes`; the dispatcher asks DBA's `/authorize` for the one a route needs
  (only with `DBA_API_KEY`), answering `403 gate_pending` with DBA's `gate_request` until gates
  settle. Confirmations (`DBA-Confirmation`) are verified and passed to the evaluator.
- **Device sessions.** `hashbin:session` sets `session` and `deviceSession` and every user
  scope. `SESSION` routes accept it; `ACCOUNT_SESSION` routes (keys, apps, OAuth authorize,
  grant edits, download sessions and key budgets, provider and DBA linking, account deletion)
  and `ADMIN_SESSION` refuse it.
- **Spending.** The tightest `limits.spend_usd_per_month` of the `hashbin:` grants becomes
  `monthly_spend_limit_cents`. `spenderOf` returns `{ kind: 'dba', id, account, scopes,
  caveats, status, exp }`; the profile keeps a record per credential (100 most recent) with the
  month's usage, status entry and expiry. Stored spenders (auto-renewals) keep only
  `{ kind, id, account }` (`storedSpender`); before charging one the profile checks
  `DbaRevocations` and the status list, and a record past its last-seen expiry spends nothing.
- **Downloads.** `/api/downloads/sign` records the credential and signs links with identity
  `{ u, k: cid, kind: 'dba' }`, expiring no later than the credential. Leases check the
  record (linked, not revoked, unexpired, `downloads:spend`, cids caveat) and DBA revocation,
  then apply account caps, the grant's spend cap and optional per-credential download caps.
- **CORS.** Requests with `Authorization: DBA` get `Access-Control-Allow-Origin` for any
  origin; `/api/` preflights asking for `dpop` are allowed from any origin.

### Decisions taken

- **Device sessions reach everything but minting and ending the account** (owner, 2026-11-22).
- **Any-origin CORS for DBA credentials** (owner, 2026-11-22): no cookies, non-exportable key.
- **Online decisions are supported** when `DBA_API_KEY` is set (owner, 2026-11-22); each is
  billed to the hashbin.org operator. Without it, online-only grants answer `online_required`.
- **HashBin uses `createVerifier`, not `createSiteAuth`.** It needs per-request link lookups,
  confirmations and online decisions per route; see "Upstream notes".
- **Account moves** (`src/services/account-move.js`) drop the DBA link; the owner links again.

## Remaining

### Owner (ops)

- [x] **Fund the operator account at devicebasedauth.org** that owns the `hashbin.org`
  audience. DBA bills the audience operator for OIDC logins (linking) and online decisions.
- [x] **Register the revocation webhook** as the audience owner:
  `PATCH /api/v1/audiences/hashbin.org` with `{"revocation_webhook": "https://hashbin.org/api/dba/events"}`,
  then `POST /api/v1/audiences/hashbin.org/webhook-test` (expect status 204).
- [ ] **Optional: `DBA_API_KEY`** GitHub secret (an API key of the audience owner with the
  right to call `/api/v1/authorize`), pushed by the deploy workflow. Needed only for gated or
  other online-only grants.
- [ ] **Set `DBA_ISSUER`** only if it is not `https://devicebasedauth.org`.
- [ ] **Live check:** link a real DBA account in Account Settings, run
  `dba enroll --aud hashbin.org --action hashbin:balance:read` and
  `dba curl https://hashbin.org/api/balance`, revoke the device at devicebasedauth.org, and
  confirm the next call answers 401 within seconds (webhook) or 5 minutes (status list).
  Also enroll one with `hashbin:session` and confirm `POST /api/auth/apikeys` answers 403.
- [ ] **(S25 Stage A, optional)** Add devicebasedauth.org as a custom OIDC provider in the
  Clerk dashboard (DBA decision D7: check the Clerk plan supports it). DBA must register
  Clerk's callback URL. Revoking the device stops future sign-ins but not that Clerk session;
  Stage B (device sessions) is the revocable alternative.

### Code

- [ ] **Local development against a local DBA.** DBA's local issuer is fixed at
  `http://localhost:8787`, HashBin's dev server's port too, so HashBin must run on another port,
  and DBA only accepts the redirect URIs registered for `hashbin.org`. A DBA-side change could
  register localhost callbacks for first-party audiences in local mode.
- [x] **HashBin's own pages on device credentials.** `frontend/js/device-auth.js` restores and
  enrolls non-extractable browser keys; `auth-loader.js` selects the device before initializing
  Clerk. Page API calls, uploads and publishing use the SDK transport; device sessions cannot
  change their account link. Browser tests cover real signed proofs, nonce retries, reloads,
  rejected credentials, cross-origin refusal, enrollment with Clerk down and key deletion.
- [ ] **Direct DBA auth on 256t.us** (downloads with `Authorization: DBA` instead of a signed
  link). Not needed while signed links cover it.
- [ ] Refresh the vendored verifier when DBA ships fixes.

### Upstream notes for devicebasedauth.org (`packages/verify`)

- `createSiteAuth().authenticate` evaluates grants without the verified confirmation
  (`allowedActions(payload, actions, { request, proof })`), so credentials with a `confirm`
  block fail there with `confirmation_required`. HashBin calls `decide` itself and passes it.
- `handleEvent` applies revocations to one verifier in one isolate; Workers sites need their
  own shared store (HashBin's `DbaRevocations`). A durable helper like `replay-do.js` would help.

## Done means

S24: a HashBin user links a DBA account in production, a device enrolled for `hashbin.org`
publishes, reads and signs downloads within its grants and spend cap, a gated grant waits for
approval, and revoking the device at devicebasedauth.org stops it within seconds (webhook) and
at most 5 minutes. S25: "Sign in with devicebasedauth.org" works (Stage A), and device
sessions are refused every minting route in production (Stage B).
