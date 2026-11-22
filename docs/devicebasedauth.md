# devicebasedauth.org credentials

[devicebasedauth.org](https://devicebasedauth.org) ("DBA") issues device-bound credentials:
the private key is generated on the device and never leaves it, and the credential lists what
that device may do, for which site, when and where. HashBin accepts them instead of API keys,
and as a device session. Design and open items: [`todo/dba_integration.md`](../todo/dba_integration.md)
(STATUS S24, S25).

## Using one

1. Link your DBA account once, signed in to HashBin: **Account Settings → devicebasedauth.org
   → Link** (or `POST /api/auth/dba/link/start`, below). One DBA account links to at most one
   HashBin account; credentials from unlinked DBA accounts get `403 AUTH_DBA_NOT_LINKED`.
2. Create a credential for audience `hashbin.org` at DBA, granting the HashBin scopes it needs
   as actions named `hashbin:<scope>`, e.g. `dba enroll --aud hashbin.org --action hashbin:content:write`.
3. Send it with a fresh DPoP proof per request: `Authorization: DBA <credential>` and
   `DPoP: <proof>` (the DBA SDK and CLI do this). A credential with periodic confirmation also
   sends `DBA-Confirmation: <confirmation>`.

Short-lived DBA access tokens (`dba token --aud hashbin.org`) are accepted as
`Authorization: Bearer <token>` (JWS `typ` `dba-access+jwt`), with the same grants and no
device binding.

## What a credential may do

- **Scopes.** Each `hashbin:<scope>` action its grants allow right now (time windows, places,
  expiry, confirmation) is a scope it holds. Every user scope can be granted, including
  `downloads:spend`.
- **Device session.** `hashbin:session` makes the credential a session: it holds every user
  scope and reaches session routes, but not routes that mint credentials outliving the device
  or end the account (create or change API keys, register or change developer apps, approve
  apps at `/oauth/authorize`, widen app grants, raise key or grant download budgets, open
  browser download sessions, link sign-in providers, link or unlink DBA, delete the account,
  admin keys). Those answer `403 session_required`. It still spends as the credential, under its
  cap, so revoking the device ends everything it could do.
- **Spending.** The tightest `limits.spend_usd_per_month` among its `hashbin:` grants becomes
  its `monthly_spend_limit_cents` (rounded down). Uploads, extensions, rate-limit purchases,
  alias purchases and renewals, and funded downloads all count against it.
- **Downloads.** With `downloads:spend`, `POST /api/downloads/sign` signs 256t.us links whose
  spending identity is the credential; a link never outlives the credential's expiry. Funded
  downloads are bounded by the account's download caps, the grant's spend cap and, if set, the
  credential's own download caps (Account Settings, or the route below). A link stops being
  funded once the credential is revoked at DBA or the account is unlinked.
- **Auto-renewals** paid through a credential stop once DBA revokes it or the version last
  presented here expires; presenting the renewed credential again resumes them.

## Grants that need DBA online

Grants with `require.step_up`, `require.gates`, `require.online` or `limits.uses`, and actions
whose hashbin.org catalog policy requires gates, can only be decided by DBA. When a route needs
such a scope, HashBin asks DBA (`POST /api/v1/authorize`, billed to the hashbin.org operator):

| Answer | Means |
|---|---|
| The route runs | DBA allowed it |
| `403 gate_pending` with `gate_request: { id, retry_after, deadline }` | The grant's gates have not approved yet. Retry after `retry_after` seconds with a fresh proof (DBA's SDK `fetchWithGates()` and `dba curl --dba-wait` do this) |
| `403 dba_denied` with `code` and `reasons` | DBA refused |
| `403 online_required` | HashBin has no DBA API key configured (`DBA_API_KEY`), so these grants cannot be used |

Only the scope the route needs is checked online; scopes allowed offline never are.

## Revocation

HashBin verifies credentials offline with DBA's keys, status lists (cached at most 5 minutes)
and the hashbin.org action catalog. DBA also pushes revocations to
`POST /api/dba/events` (signed `dba-event+jwt`, spec/events.md at DBA); every isolate picks
them up within 30 seconds. If DBA's keys, status lists or catalog cannot be fetched,
verification fails closed with `503 AUTH_DBA_UNAVAILABLE`. DPoP proofs are accepted once across
all isolates.

## Browser apps on any site

API calls carrying `Authorization: DBA` get CORS from any origin (no cookies; the key cannot be
exported from the page). Preflights on `/api/` that ask to send `DPoP` are allowed from any
origin. Other credentials still get CORS only on registered developer-app origins.

## Routes

| Route | Access | Does |
|---|---|---|
| `GET /api/auth/dba/link` | session | `{ linked, account, linked_at, issuer }` |
| `POST /api/auth/dba/link/start` | account session | `{ url }`: send the browser there; DBA returns it to `/auth/dba/callback` |
| `POST /api/auth/dba/link/finish` | account session | Body `{ code, state }` from the callback. `409 dba_account_linked_elsewhere` if another HashBin account holds the DBA account |
| `DELETE /api/auth/dba/link` | account session | Unlink; that DBA account's credentials stop working here at once |
| `GET /api/auth/dba/credentials` | session | `{ credentials: [{ credential_id, last_used_at, scopes, monthly_spend_limit_cents, spend_used_cents, expires_at, revoked, download_caps }] }`: credentials that have spent or signed downloads here |
| `PUT /api/auth/dba/credentials/{cid}/download-budget` | account session | Body `{ caps: { daily_cap_cents, monthly_cap_cents } }` or `{ caps: null }` |
| `POST /api/dba/events` | public (DBA-signed) | DBA's revocation webhook; `204` when applied |

"Session" is the account's own sign-in or a device session; "account session" is the
account's own sign-in only.

## Errors

| Code | Status | Means |
|---|---|---|
| `AUTH_DBA_PROOF_INVALID` | 401 | Missing, wrong, stale or replayed DPoP proof (`dba_code` says which) |
| `AUTH_DBA_NOT_LINKED` | 403 | The credential's DBA account (`dba_account`) is not linked |
| `AUTH_DBA_UNAVAILABLE` | 503 | DBA's keys, status lists or catalog could not be fetched |
| `AUTH_KEY_REVOKED` / `AUTH_EXPIRED` | 401 | Revoked at DBA, or expired |
| `gate_pending`, `dba_denied`, `online_required` | 403 | See "Grants that need DBA online" |

## Operating it

- `DBA_ISSUER` (variable, optional): the issuer, default `https://devicebasedauth.org`. Local
  mode also accepts `http://localhost…`.
- `DBA_API_KEY` (secret, optional): a DBA API key of the hashbin.org audience owner, for online
  decisions. Without it, online-only grants answer `online_required`.
- At DBA, as the hashbin.org audience owner: register `https://hashbin.org/auth/dba/callback`
  for client `hashbin.org`, and set the revocation webhook to `https://hashbin.org/api/dba/events`
  (`PATCH /api/v1/audiences/hashbin.org` with `{"revocation_webhook": …}`; test it with
  `POST /api/v1/audiences/hashbin.org/webhook-test`).
- Durable Objects: `DBA_LINKS` (DbaLink, backed up), `DBA_REVOCATIONS` (DbaRevocations) and
  `DBA_REPLAY` (DbaReplayCache).
