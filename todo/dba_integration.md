# devicebasedauth.org integration

Row **S24** (device-bound keys and account linking) and **S25** (sign in with
devicebasedauth.org) in `STATUS.md`.

## Status

**Phase:** S24 implemented and merged to `main` 2026-11-22 (not yet deployed or live-checked).
The owner steps below remain. S25 has not started.

[devicebasedauth.org](https://devicebasedauth.org) ("DBA", repo
`curtcox/device-based-auth`) issues revocable, device-bound credentials: a device makes its
own P-256 key, and DBA signs a readable list of what that device may do, for which site, when
and where. Its plan for HashBin is §9 of `todo/master_plan.md` in that repo. The HashBin
scopes are mirrored there as DBA actions `hashbin:<scope>` (`src/services/first-party.js`),
plus `hashbin:session`.

## What exists

| Piece | Where |
|---|---|
| Vendored verifier `@devicebasedauth/verify` (DBA commit `da2b296`); never edit, refresh by copying | `src/vendor/devicebasedauth/` (its README says how) |
| Issuer config, shared verifier and OIDC client, link-index helpers | `src/auth/dba.js` |
| Credential kind `dba` in the middleware: `Authorization: DBA <credential>` + `DPoP: <proof>`, and `Authorization: Bearer <token>` when the JWS `typ` is `dba-access+jwt` (checked before Clerk) | `src/auth/middleware.js` |
| Link API: `GET`/`DELETE /api/auth/dba/link`, `POST /api/auth/dba/link/start`, `POST /api/auth/dba/link/finish` (all session-only) | `src/api/dba.js`, `API_ROUTES` in `src/index.js` |
| `DbaLink` Durable Object: DBA account → HashBin user, one object per DBA account (binding `DBA_LINKS`, migration `v13`, backed up) | `src/durable-objects/dba-link.js` |
| Reverse link `profile.dba_link`, pending OIDC state (storage key `dba-oidc-state`), DBA spending records `profile.dba_credentials` | `src/durable-objects/user-profile.js`, `src/utils/credential-spend.js` |
| Account Settings section (status, Link/Unlink, CLI and browser SDK instructions) and the callback page | `frontend/account.html#dba`, `frontend/js/dba-link.js`, `frontend/auth/dba/callback.html`, `frontend/js/dba-callback.js` |
| Docs | `docs/API.md` ("devicebasedauth.org credentials"), `frontend/docs/api.html`, `docs/backup-and-restore.md` |
| Tests with a fake DBA issuer (credentials, status lists and ID tokens signed with the vendored `issuer.js`; JWKS, status list and OIDC endpoints served by a stubbed `fetch`) | `src/auth/dba.test.js`, `src/durable-objects/dba-link.test.js` |

It was also checked once end to end against DBA's real Worker run in-process (with DBA's own
`test-utils/env.js`): the OIDC link, a credential enrolled at DBA reading the balance, an
access token, scope and session refusals, and revocation at DBA answering 401.

## How it works

- **Verification is offline.** DBA's JWKS (cached 1 hour) and status lists (cached at most 5
  minutes) are fetched from `DBA_ISSUER` and kept in module-level verifiers, so the caches and
  the DPoP replay cache survive across requests in an isolate. If they can't be fetched,
  requests fail closed with `503 AUTH_DBA_UNAVAILABLE`. Revoking a device at DBA stops it here
  within the status list's TTL.
- **Account linking** is OIDC (authorization code + PKCE, no client secret) with client ID
  `hashbin.org` and redirect `https://hashbin.org/auth/dba/callback` (in local mode,
  `<this origin>/auth/dba/callback`). The state, nonce and PKCE verifier stay in the user's
  profile DO for 10 minutes and are taken (deleted) on first use, so a code only completes the
  link that started it. Finishing writes the `DbaLink` index first, then the profile. A
  credential is accepted only when both agree, so a half-finished link or unlink never lets one
  in. One DBA account links to one HashBin user (`409 dba_account_linked_elsewhere`); a link
  whose owner's profile no longer names it (unlinked, deleted, moved) can be taken over.
- **What a credential may do.** Its grants' `hashbin:<scope>` actions, evaluated now (time
  windows, places, expiry), become the user's `scopes`, and the route table does the rest.
  The tightest `limits.spend_usd_per_month` becomes `caveats.monthly_spend_limit_cents`
  (rounded down). `spenderOf` returns `{ kind: 'dba', id: cid, account, scopes, caveats }`,
  and the profile keeps the month's usage per credential (the 100 most recently used), so
  balance debits, personal and global alias purchases and their auto-renewals all honour the
  cap. Unlinking makes those records invalid, which also stops auto-renewals paid through a
  DBA credential.
- **Errors.** `AUTH_DBA_PROOF_INVALID` (401: missing, wrong, stale or replayed DPoP proof),
  `AUTH_DBA_NOT_LINKED` (403, with `dba_account`), `AUTH_DBA_UNAVAILABLE` (503), and
  `AUTH_KEY_REVOKED` or `AUTH_EXPIRED` (401). The DBA reason is in `dba_code`. Anything else
  is `AUTH_INVALID_FORMAT`.

### Decisions taken

- **`hashbin:session` does not make a DBA credential the account session.** The credential
  is `session: false`, like an API key. A session can create API keys, register apps, deposit,
  change settings and delete the account, so a device credential holding it could mint
  long-lived credentials that outlive revoking the device. Revisit with S25 Stage B, where
  HashBin's own pages would run on device credentials; that needs a decision on which
  session-only routes a device session may reach.
- **No `downloads:spend` yet.** Signed download links outlive the request and are charged on
  256t.us against a revocable spending identity (key, grant or browser session). DBA
  credentials have none there yet, so `DBA_UNSUPPORTED_SCOPES` in `src/auth/dba.js` strips it.
- **HashBin resolves `linkedUser`, not `createSiteAuth`.** The site helper's
  `linkedUser(acct)` callback gets no request context, and a verifier created per request
  would lose its caches. HashBin keeps one `createSiteAuth` per issuer with a pass-through
  `linkedUser` and then looks the account up itself (index and profile).
- **Account moves** (`src/services/account-move.js`) drop the DBA link; the owner links again.

## Remaining

### Owner (ops)

- [ ] **Set `DBA_ISSUER`** only if it is not `https://devicebasedauth.org`. It is a plain
  variable (`wrangler.toml` `[vars]`): https only, except `http://localhost…` in local mode.
- [ ] **Fund the operator account at devicebasedauth.org** that owns the `hashbin.org`
  audience. DBA bills the audience operator for OIDC logins (account linking) and any online
  decisions. HashBin verifies offline, so ordinary API calls cost the operator nothing.
- [ ] **Deploy** (merging to `main` deploys). Migration `v13` creates `DbaLink`. Then link a
  real DBA account in Account Settings, run
  `dba enroll --aud hashbin.org --action hashbin:balance:read` and
  `dba curl https://hashbin.org/api/balance`, revoke the device at devicebasedauth.org, and
  confirm the next call answers 401 within 5 minutes.
- [ ] **(S25 Stage A, optional)** Add devicebasedauth.org as a custom OIDC provider in
  HashBin's Clerk dashboard for a "Sign in with devicebasedauth.org" button (DBA decision D7:
  check that the Clerk plan supports custom OIDC providers). DBA must register Clerk's
  callback URL for that client. Limitation: sign-in gives an ordinary Clerk session, so
  revoking the device stops future sign-ins but does not end that session.

### Code

- [ ] **Local development against a local DBA.** Both Workers default to port 8787 and DBA's
  local issuer is fixed at `http://localhost:8787`, so HashBin has to run on another port. DBA
  only accepts the redirect URIs registered for `hashbin.org` (the production ones), so the
  local callback must be added there first; the end-to-end check did that with
  `PATCH /api/v1/audiences/hashbin.org` as DBA's operator. A DBA-side change could register
  localhost callbacks for first-party audiences in local mode.
- [ ] **CORS for browser apps on other origins.** Cross-origin API calls are allowed only
  from registered developer-app origins (`src/auth/oauth-cors.js`). DBA credentials need no
  cookie and are bound to a non-extractable key, so allowing any origin for
  `Authorization: DBA` requests may be reasonable. Decide with B13 in mind.
- [ ] **`downloads:spend` for DBA credentials** (give them a spending identity on 256t.us).
- [ ] **Device-bound sessions (S25 Stage B):** HashBin pages using `dba.js` for API calls,
  and the session decision above.
- [ ] **List linked DBA credentials** (from `profile.dba_credentials`: last use, month's
  spend) on Account Settings, like app authorizations.
- [ ] **Auto-renewals after revocation at DBA.** An alias auto-renewal paid through a DBA
  credential keeps working after that credential is revoked at DBA, until the account is
  unlinked, because HashBin learns of revocations only when a credential is presented.
  Options: check the status list from the renewal alarm, or pay renewals from the session.
- [ ] Refresh the vendored verifier when DBA ships fixes (see "Upstream notes").

### Upstream notes for devicebasedauth.org (`packages/verify`)

- `createSiteAuth`'s `linkedUser(acct)` gets no request or context. Sites that look links up
  through per-request bindings must either lose the verifier caches or bypass `linkedUser`
  (HashBin bypasses it). Passing `request` as a second argument would fix it.
- `verify()` fetches the JWKS before decoding the credential, and failed JWKS fetches are not
  cached, so while DBA is unreachable every request with any `Authorization: DBA …` header
  makes an outbound fetch.
- `createOidcClient().finish` requires `aud` to be a string; OIDC allows an array.
- `credentialFromRequest` matches `DBA ` and `Bearer ` case-sensitively; HTTP auth schemes are
  case-insensitive.

## Done means

S24: a HashBin user links a DBA account in production, a device enrolled for `hashbin.org`
publishes and reads within its grants and spend cap, and revoking it at devicebasedauth.org
stops it within 5 minutes. S25: "Sign in with devicebasedauth.org" works (Stage A), then
HashBin's own pages run on device credentials (Stage B).
