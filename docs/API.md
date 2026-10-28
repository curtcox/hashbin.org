# HashBin.org API Reference

## Overview

The HashBin.org API is built on Cloudflare Workers and provides RESTful endpoints for content management, authentication, and account operations.
Uploads are served from a dedicated content domain so user-controlled files do not share an origin with auth cookies, the dashboard, or API routes.

**Base URL**: 
- Development: `http://localhost:8787`
- Production: `https://hashbin.org`

**Content URL Base**:
- Production: `https://256t.us/{cid}`
- Upload and metadata responses include a `url` field and metadata responses include `download_domain`.

## Authentication

Every credential carries **scopes** (what it may do) and may carry **caveats** (how
much). Each API route declares the scope it needs; anything undeclared is refused.

| Credential | How it is sent | What it may do |
|---|---|---|
| Signed-in session (Clerk) | `Authorization: Bearer <clerk-jwt>` | Everything for the account. The `ADMIN_USER_ID` session also holds every admin scope. |
| API key | `Authorization: ApiKey hbk_…` or `X-API-Key: hbk_…` | Only its scopes, within its caveats |
| SDK app access token (OAuth + DPoP) | `Authorization: DPoP <access-token>` and `DPoP: <proof-jwt>` | Approved scopes/limits, constrained to the signing key |
| Unbound app access token (raw OAuth) | `Authorization: Bearer <access-token>` | Approved scopes/limits, without device binding |
| Admin key | `Authorization: ApiKey hba_…` | Only its admin scopes |

Account management is **session-only**: API keys, admin keys, developer apps, account
settings, app authorizations, download budgets and sessions, deposits, provider linking
and account deletion can never be reached with a key or app token.

### Scopes

| Scope | Allows |
|---|---|
| `content:write` | `POST /api/content` (spends) |
| `content:extend` | `POST /api/content/{cid}/extend` (spends) |
| `content:delete` | `DELETE /api/content/{cid}` for content you uploaded |
| `uploads:read` | `GET /api/user/uploads` |
| `balance:read` | `GET /api/balance` |
| `transactions:read` | `GET /api/balance/history` |
| `ratelimit:purchase` | `POST /api/content/rate-limit/purchase` (spends) |
| `downloads:spend` | `POST /api/downloads/sign` and funded downloads on 256t.us (spends) |
| `suppliers:read` | `GET /api/suppliers` |
| `suppliers:write` | Create, change, remove and rescan suppliers |
| `admin:disputes` | Dispute review and resolution, repeat infringers, admin action log |
| `admin:takedown` | `POST /api/admin/content/{cid}/delete`, and deleting any content |
| `admin:stats` | Statistics, admin health, alerts (read, acknowledge, test), audit log |
| `admin:costs` | Costs, profitability, cost-safety brake |
| `admin:backups` | Backup status, files and runs |
| `admin:restore` | `POST /api/admin/restore` |
| `admin:export` | `GET /api/admin/export` |
| `admin:accounts` | `POST /api/admin/accounts/move`: move an account to a new user ID (`{from, to, dry_run}`) |

Admin scopes are held only by admin keys and the `ADMIN_USER_ID` session. A missing
scope answers `403 insufficient_scope`; a session-only route answers `403 session_required`.

### Caveats

Optional limits on a key or app grant. They can be tightened later, never loosened.

| Caveat | Limits |
|---|---|
| `monthly_spend_limit_cents` | Total spent through the credential per month: uploads, extensions, rate-limit purchases and download leases. Required for apps that hold a spending scope. |
| `max_retention_months` | Retention one upload or extension may buy (apps publish at the lower of this and your default) |
| `max_upload_bytes` | Largest upload |
| `content_types` | Media types an upload may declare |
| `cids` | The only content the credential may extend, delete, buy rate limits for, sign or download |
| `expires_at` | (App grants) when the grant stops working; keys use their own `expires_at` |

A request outside a caveat answers `403 caveat_violation` naming the caveat; spending past
the monthly limit answers `400 spending_limit_exceeded`.

### API keys

Format: `hbk_<route>.<random>.<tag>`. The signed route names the account and key, so no
lookup table is needed; HashBin stores only the key's SHA-256 hash and shows the key
once. Keys need at least one scope, last 90 days by default and at most a year, and
number at most 25 active per account. Keys from before scopes existed (`hb_…`, `hb2_…`)
are revoked.

### App tokens (OAuth)

For a browser save button, prefer SDK `publish()`: the user approves the exact bytes and
price on HashBin, and the client receives only a verified CID. Use an OAuth allowance for
background saves or other delegated API operations. See [browser client safety](browser-client-safety.md).

OAuth uses authorization code + PKCE (S256), with no client secret. Each approval is a separate
grant. Users can remove requested scopes and tighten `spending_limit` (US dollars/month),
`max_retention_months` and `max_upload_bytes` (1–5242880 for this consent field). Spending scopes
require a monthly cap. SDK defaults are $1/month and 1 MiB per file; consent defaults to a
30-day grant and offers 1, 7, 30, 90 or 365 days, or no grant expiry.

| Endpoint | Contract |
| --- | --- |
| `GET /oauth/authorize` | Consent page; `client_id`, exact registered `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`; optional limits above and `dpop_jkt` |
| `POST /oauth/authorize` | Account session only; JSON authorization fields plus optional `granted_scopes`, `granted_spending_limit`, `granted_max_retention_months`, `granted_max_upload_bytes`, `expires_in_days`; redirect to the registered URI, or `{redirect_to}` for `Accept: application/json` |
| `POST /oauth/token` | JSON `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`; a DPoP-bound code requires the matching proof |
| `POST /oauth/token` (refresh) | JSON `grant_type=refresh_token`, **`client_id`**, `refresh_token`; bound refresh tokens require a proof from the original key |
| `GET /oauth/dpop-nonce` | `{nonce}`: a server-signed nonce valid for five minutes; no credential needed |
| `POST /oauth/revoke` | JSON `{token, token_type_hint: "refresh_token"}` revokes the token's grant and refresh family, even for an already-rotated refresh token; access-token revocation also identifies the grant; invalid/already-revoked inputs return 200 quietly |

Authorization codes expire after 10 minutes and work once. Access tokens last **15 minutes**.
New refresh tokens expire after **seven idle days**; the original family's absolute lifetime
is **90 days**, regardless of rotation. Grant expiry can end access sooner. A replayed rotated
refresh token revokes the whole grant. Missing/mismatched `client_id`, revoked/expired grants,
and key mismatches cannot mint replacement tokens. Token requests may pass `scope` to request
fewer of the grant's permissions. Token and nonce responses are not cacheable.

New hosted-SDK authorizations include `dpop_jkt` and receive `token_type: "DPoP"`, with `cnf.jkt`
in the signed access token. Raw OAuth without DPoP still receives bearer tokens; existing tokens
are not retroactively bound. Clients outside the SDK must implement DPoP and refresh locking
separately. The bundled native and command-line examples currently use unbound OAuth.

#### DPoP proof requirements

Get a nonce from `/oauth/dpop-nonce`. Send a signed ES256 JWT in `DPoP` on exchange, refresh and
every bound resource request. Its protected header uses `typ: "dpop+jwt"`, `alg: "ES256"` and a
public EC P-256 `jwk` without private material. The authorization request's `dpop_jkt` is the
SHA-256 JWK thumbprint; the same key must sign the exchange and future proofs.

Claims: exact HTTP method `htm`; absolute `htu` containing origin/path without query or fragment;
integer `iat` within 60 seconds; a unique `jti` (16–200 characters); and the server `nonce`.
Resource requests also need `ath`, the Base64URL SHA-256 hash of the access token, and
`Authorization: DPoP <access-token>`. The API and funded-content worker share replay receipts.
A token-endpoint proof or code-binding failure returns `400 invalid_dpop_proof`; an invalid
resource credential returns 401. Obtain a new nonce before the cached one expires.

#### Shared-origin registration and account recovery

Create/update developer apps with `shared_origin_acknowledged: true` when known GitHub/GitLab
shared hosts or another active app use a redirect origin. Otherwise registration returns
`400 shared_origin_acknowledgement_required`, including `warnings` (origins/app names) and a
`guide` URL. CORS derives from active registrations only, and paths cannot isolate co-hosted apps.

`GET /api/account/authorizations` returns `authorizations` with grant limits, current monthly
spend, `last_used_at`, and recent `uploads`, plus bounded `security_events` for first use,
refresh reuse revocation and reaching 80% of the monthly cap. These are in-app notifications.
`DELETE /api/account/authorizations/:grantId` revokes one grant; an app ID revokes its grants.
`DELETE /api/account/authorizations` revokes all OAuth grants and refresh tokens. Separately
managed API keys remain active. These management routes require the account session.

### Admin keys

Format: `hba_<route>.<random>.<tag>`. Issued, listed and revoked only by the
`ADMIN_USER_ID` session (`POST|GET /api/admin/keys`, `DELETE /api/admin/keys/{key_id}`, or
`/admin/keys.html`), each with chosen admin scopes and an expiry of 1–90 days. They stop
working if `ADMIN_USER_ID` changes. There is no shared admin token.

All key and download-token tags use separate keys derived from `DOWNLOAD_TOKEN_SECRET`, so
one kind of credential can never verify as another.

## Rate Limits

Rate limits are enforced per authentication context:

| Authentication | Limit |
|----------------|-------|
| Anonymous | 100 requests/minute |
| Signed-in session | 1,000 requests/minute |
| Per API key, app grant or admin key | 500 requests/minute |

The content download host (`256t.us`) separately allows 30 requests per IP per
minute for anonymous or exhausted identities. Confirmed funded content requests bypass this limit; see Funded downloads below. An HTTP 429 means the request was throttled, not that the content is
missing. Bulk download and verification clients should wait for the `Retry-After`
header, then retry the same CID. Error responses are not cacheable; HTTP 404
indicates missing, deleted, or expired content.

When rate limit is exceeded, the API returns:
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "error": "AUTH_RATE_LIMITED",
  "message": "Rate limit exceeded. Please try again later."
}
```

## Error Codes

### Authentication Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_MISSING` | No authentication provided | 401 |
| `AUTH_INVALID_FORMAT` | Malformed token or key | 401 |
| `AUTH_EXPIRED` | Token or key has expired | 401 |
| `AUTH_REVOKED` | API key has been revoked | 401 |
| `AUTH_USER_DELETED` | User account has been deleted | 401 |
| `AUTH_ENV_MISMATCH` | Test key in prod or vice versa | 401 |
| `AUTH_RATE_LIMITED` | Rate limit exceeded | 429 |
| `AUTH_KEY_LIMIT` | Maximum API keys reached (25) | 400 |
| `insufficient_scope` | The credential lacks the route's scope | 403 |
| `session_required` | The route is for the account's own sign-in only | 403 |
| `caveat_violation` | The request is outside one of the credential's caveats | 403 |
| `spending_limit_exceeded` | The key's or app's monthly spending limit would be passed | 400 |

### Error Response Format

```json
{
  "error": "AUTH_MISSING",
  "message": "No authentication provided"
}
```

## Endpoints

### Public Endpoints

These endpoints are accessible without authentication.

---

#### GET /

Returns service information and status.

**Response:**
```json
{
  "service": "HashBin.org API",
  "version": "0.1.0",
  "environment": "production",
  "status": "operational",
  "phase": "Phase 1 - Infrastructure Setup",
  "endpoints": {
    "health": "/health"
  }
}
```

---

#### GET /health

Returns comprehensive health check with component status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-14T03:00:00.000Z",
  "environment": "production",
  "checks": {
    "worker": {
      "status": "operational",
      "message": "Worker is responding"
    },
    "environment": {
      "status": "operational",
      "message": "Environment configuration valid"
    },
    "durableObjects": {
      "status": "operational",
      "message": "All Durable Objects accessible",
      "details": {
        "CONTENT_METADATA": { "available": true, "accessible": true },
        "USER_PROFILES": { "available": true, "accessible": true },
        "KEY_REGISTRY": { "available": true, "accessible": true },
        "PAYMENT_RECORDS": { "available": true, "accessible": true },
        "CONTEST_RECORDS": { "available": true, "accessible": true },
        "MESSAGE_THREADS": { "available": true, "accessible": true }
      }
    },
    "r2": {
      "status": "operational",
      "message": "All R2 buckets accessible",
      "details": {
        "CONTENT_BUCKET": { "available": true, "accessible": true },
        "BACKUP_BUCKET": { "available": true, "accessible": true }
      }
    }
  }
}
```

**Status Values:**
- `healthy` - All systems operational
- `degraded` - Some systems have issues but service is functional
- `unhealthy` - Critical systems are down (returns HTTP 503)

---

### Authentication Endpoints

These endpoints manage user sessions and API keys. App OAuth endpoints and recovery controls are described above.

---

#### GET /api/auth/session

Get information about the current authenticated session.

**Authentication:** Required (Clerk session or API key)

**Response:**
```json
{
  "user_id": "user_abc123",
  "auth_method": "clerk",
  "session_id": "sess_xyz789",
  "profile": {
    "user_id": "user_abc123",
    "providers": [
      {
        "provider": "google",
        "provider_user_id": "google_id_123",
        "linked_at": "2026-01-14T00:00:00.000Z"
      }
    ],
    "created_at": "2026-01-14T00:00:00.000Z",
    "updated_at": "2026-01-14T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 AUTH_MISSING` - No authentication provided
- `401 AUTH_INVALID_FORMAT` - Invalid token/key format
- `401 AUTH_EXPIRED` - Token/key has expired

---

#### POST /api/auth/logout

Invalidate the current Clerk session.

**Authentication:** Required (Clerk session only, not API key)

**Response:**
```json
{
  "success": true,
  "message": "Session invalidated successfully"
}
```

**Error Responses:**
- `401 AUTH_MISSING` - No authentication provided
- `403` - API keys cannot be used for logout

---

#### POST /api/auth/callback

OAuth callback handler for custom flows.

**Note:** In standard Clerk integration, OAuth callbacks are handled by Clerk's frontend SDK. This endpoint is provided for completeness but returns 501 Not Implemented.

**Response:**
```json
{
  "error": "Not implemented",
  "message": "OAuth callbacks are typically handled by Clerk frontend SDK."
}
```

---

#### POST /api/auth/link

Link additional OAuth provider to existing account.

**Authentication:** Required (Clerk session only)

**Note:** OAuth provider linking is handled by Clerk's frontend SDK. This endpoint is provided for documentation but returns 501 Not Implemented.

**Response:**
```json
{
  "error": "Not implemented",
  "message": "OAuth provider linking is handled by Clerk frontend SDK. Use Clerk Components."
}
```

After linking a provider via Clerk's frontend, the `user.updated` webhook will automatically update the backend profile.

---

### API Key Management

These endpoints manage API keys. They are session-only.

---

#### POST /api/auth/apikeys

Create a new API key.

**Request Body:**
```json
{
  "name": "Publisher",
  "scopes": ["content:write"],
  "caveats": { "max_upload_bytes": 1048576, "max_retention_months": 12, "monthly_spend_limit_cents": 200 },
  "expires_at": "2027-01-27T00:00:00.000Z"
}
```

**Parameters:**
- `scopes` (required): at least one user scope
- `caveats` (optional): see Caveats
- `name` (optional): defaults to "Key", then "Key 2", "Key 3"…
- `expires_at` (optional): at most a year ahead; defaults to 90 days
- `download_budget` (optional): `{daily_cap_cents, monthly_cap_cents}` for `downloads:spend`

**Response (201):** the key's metadata (`key_id`, `name`, `scopes`, `caveats`, `created_at`,
`expires_at`) and `api_key`, which is shown only here.

**Error Responses:** `400` for invalid scopes, caveats, name or expiration, or `AUTH_KEY_LIMIT`.

---

#### GET /api/auth/apikeys

List the account's keys with `scopes`, `caveats`, `last_used_at`, `usage_count` and `revoked`.
Key values and hashes are never returned.

---

#### PATCH /api/auth/apikeys/{key_id}

Rename a key or narrow it: `{ "name"?, "scopes"?, "caveats"? }`. Scopes may only be removed
(`400 SCOPE_WIDENING` otherwise) and caveats only tightened (`400 CAVEAT_WIDENING`). A Clerk
session must be under 5 minutes old (`403 FRESH_AUTH_REQUIRED`).

---

#### DELETE /api/auth/apikeys/{key_id}

Revoke an API key. Revoking an already revoked key succeeds.

---

#### DELETE /api/auth/account

Delete user account (soft delete).

**Authentication:** Required (Clerk session with 2FA confirmation)

**⚠️ Important:** This action:
- Marks the account as deleted (soft delete)
- Revokes all API keys
- Deletes all user data except payment records
- Cannot be undone

**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully",
  "retained_data": ["payment_records"]
}
```

**Error Responses:**
- `401` - No authentication provided
- `403` - 2FA confirmation required

---

## Balance Management

These endpoints manage user account balance for content storage payments.

---

#### GET /api/balance

Get the current user's account balance.

**Authentication:** Required (Clerk session or API key)

**Response:**
```json
{
  "balance_cents": 0,
  "total_deposited_cents": 0,
  "total_spent_cents": 0
}
```

**Fields:**
- `balance_cents`: Current account balance in cents (1 dollar = 100 cents)
- `total_deposited_cents`: Lifetime total of all deposits
- `total_spent_cents`: Lifetime total of all spending

**Notes:**
- New users automatically receive a balance of $0.00 (0 cents) upon first login
- Balance is displayed as cents in the API but formatted as dollars in the UI ($0.00)
- All users can view their balance immediately after account creation

**Error Responses:**
- `401 AUTH_MISSING` - No authentication provided
- `404` - User profile not found

**Example:**
```bash
curl -X GET https://hashbin.org/api/balance \
  -H "Authorization: Bearer <clerk-jwt-token>"
```

---

#### GET /api/balance/history

Get transaction history for the current user's balance.

**Authentication:** Required (Clerk session or API key)

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter by transaction type (`deposit`, `debit`, `refund`)

**Response:**
```json
{
  "transactions": [
    {
      "id": "txn_abc123",
      "type": "deposit",
      "amount_cents": 1000,
      "balance_after_cents": 1000,
      "created_at": "2026-01-14T00:00:00.000Z",
      "description": "Stripe payment"
    },
    {
      "id": "txn_xyz789",
      "type": "debit",
      "amount_cents": 50,
      "balance_after_cents": 950,
      "created_at": "2026-01-14T01:00:00.000Z",
      "description": "Content storage for hash abc..."
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 2
  }
}
```

**Error Responses:**
- `401 AUTH_MISSING` - No authentication provided
- `400` - Invalid query parameters

---

## Hosted publishing endpoints

Third-party clients should invoke these through SDK `publish()`; they do not receive a
HashBin credential. The hosted page is `/publish?client_id=…&redirect_uri=…&state=…&mode=popup|redirect`.
Popup data/results use correlated `postMessage` with exact source/origin checks. Redirect
handoffs use fragments. Hosted saves accept **1 byte to 5 MiB**; SDK fragment handoffs are
limited to **512 KiB**, independently of the raw upload API's 90 MB ceiling.

| Endpoint | Access | Result |
| --- | --- | --- |
| `GET /api/publish/app?client_id=…&redirect_uri=…` | Public | Validates the active app/exact redirect, returns name and shared-origin warnings |
| `POST /api/publish?client_id=…&redirect_uri=…&retention_months=…` | Account session | Raw bytes with their `Content-Type`; returns `cid`, `size_bytes`, `retention_months`, `cost_cents`, `balance_cents`, and a signed `approval` valid for five minutes |
| `POST /api/publish` with `X-HashBin-Approval: <approval>` | Same account session | Identical raw bytes and type; consumes the bound approval once, rechecks app/price and uploads; returns the normal upload result |

The review page renders content as text and denies framing. Clients never receive its approval
ticket. A mismatch returns `400 approval_mismatch`, an expired/invalid ticket returns
`400 approval_expired`, reuse returns `409 approval_used`, and a changed price returns
`409 price_changed`. Multipart form uploads are not accepted on this endpoint: its approval
must bind the exact bytes that are stored. Use a new review after any failed approval.

## Content Endpoints

Uploads go to `hashbin.org`; content is served from the separate origin `https://256t.us/{cid}`.
The frontend's [API reference](https://hashbin.org/docs/api.html) has full request/response details.

### POST /api/content
Upload content (requires authentication; cost is deducted from balance). Body is either raw bytes
(`Content-Type` is stored) or `multipart/form-data` with a `content` file field. Retention is
`retention_months` (query or form field, default 1). Maximum upload size is **90 MB**; larger
requests return `413 Payload Too Large` with `max_upload_bytes` in the body. The current limit is
also published as `max_upload_bytes` in `GET /api/config`. OAuth uploads use the account's
retention default, narrowed by the grant's retention cap, rather than caller retention fields.

Optional query parameter `max_cost_cents` sets a per-upload ceiling, including when duplicate
content extends retention. It must be a non-negative safe integer written in decimal digits;
empty, negative, fractional and unsafe values return `400 invalid_max_cost`. If the computed
charge exceeds it, the server returns `409 max_cost_exceeded` with `cost_cents` and
`max_cost_cents` before debit or storage. This does not replace the credential's monthly cap.
SDK `save(content, {maxCostCents})` sends this parameter.

### GET /api/content/{cid}
Content metadata (public). Includes `url` and `download_domain`.

### POST /api/content/{cid}/extend
Extend retention (requires authentication; cost deducted from balance).

### GET https://256t.us/{cid}[.{ext}]
Download content (public, no cookies). Returns 451 for disputed content and 404 for deleted or expired content.

---

## Developer App Endpoints

Manage OAuth apps for third-party publishing (see `/developers`). Session-only.

- `POST /api/developers/apps`: register `{app_name, redirect_uris[]}` and get `client_id` (apps are public PKCE clients, with no secret)
- `GET /api/developers/apps`: your apps
- `PATCH /api/developers/apps/{app_id}`: change `app_name`, `redirect_uris`, `logo_url`, or `website_url`
- `DELETE /api/developers/apps/{app_id}`: delete the app. Users can't authorize it anymore, refresh
  tokens stop working, and issued access tokens expire within an hour.

Redirect URIs must be `https://` (or `http://localhost` / `http://127.0.0.1` for development), or a native app scheme named after a reversed domain such as `org.example.app://oauth` (RFC 8252), and have no fragment; at most 10.
App names are 1–100 characters. Apps you don't own answer 404.

App authorizations (session-only):

- `GET /api/account/authorizations`: each grant with its app, `scopes`, `caveats` and `created_at`
- `PATCH /api/account/authorizations/{grant_id}`: `{ "scopes"?, "caveats"? }`, narrowing only
- `DELETE /api/account/authorizations/{grant_id}`: revoke one grant (an app ID revokes all of that app's grants)

---

## Examples

### Example: Creating an API Key

```bash
# With a Clerk session token from the signed-in web app:
curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Authorization: Bearer <clerk-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Publisher", "scopes": ["content:write"], "caveats": {"monthly_spend_limit_cents": 200}}'
```

### Example: Using an API Key

```bash
# Publish within the key's scope
curl -X POST "https://hashbin.org/api/content?retention_months=12" \
  -H "X-API-Key: hbk_..." -H "Content-Type: text/plain" --data-binary @notes.txt

# Anything else is refused (403 insufficient_scope or session_required)
curl https://hashbin.org/api/balance -H "Authorization: ApiKey hbk_..."
```

### Example: Checking Health

```bash
curl -X GET https://hashbin.org/health
```

---

## Changelog

### Version 0.1.0 (2026-01-14)

**Phase 3 Complete: Authentication & Authorization**
- Clerk OAuth integration
- API key management
- Session management
- Rate limiting
- Account management
- All 15 tests passing

---

## Support

- **Documentation**: [GitHub Repository](https://github.com/curtcox/hashbin.org)
- **Issues**: [GitHub Issues](https://github.com/curtcox/hashbin.org/issues)


### Cost safety and prepaid downloads

Paid content includes a finite lifetime request allowance tied to its payments
and reserved storage costs. Every 256t.us GET/HEAD, including a cache hit,
consumes a reservation. Exhaustion returns 429 with Retry-After: 60. Counter
unavailability returns 503. Successful responses expose X-Cache: HIT/MISS and
are cached for at most one hour, bounded by expiry. Additional bandwidth
purchases prepay finite requests at max($0.02/GiB, $4/million requests).

Uploads accept 1–120 whole retention months. Extensions and donations cannot
push outstanding retention beyond 10 years from today. Inline uploads are
limited to 60 per account per UTC hour. Accounts under 30 days old may deposit
at most $20 per checkout. The total card charge is
ceil((credit_cents + 30) / 0.971); the existing $1 minimum credit remains.

Admin endpoints require `admin:costs` (the admin's session or an admin key):

- GET /api/admin/cost-safety: current monthly snapshot, projection, sampled top
  files, stale-data flag and effective brake state.
- POST /api/admin/cost-safety with {"brake":true} or {"brake":false}: latch or
  release allowance-only service. The environment emergency switch takes priority.
- GET /api/admin/cost-safety/history?limit=168: up to 1,000 hourly reports;
  paginate using next_before as before. Reports are retained for 93 days.

History also includes completed-month refreshes. `period` identifies the billing
month, `usage_end` its usage cutoff, `recorded_at` the observation time, and
`closed_month` distinguishes completed periods from live MTD reports. Return
`next_before` unchanged as `before`; it can include a period suffix for reports
collected in the same hour. Completed-month refreshes do not replace the live
`/api/admin/cost-safety` dashboard report.

New reports include `usage` and `usage_units` for Worker requests/CPU,
R2 class A/B/free operations and integrated storage, and DO requests/duration/
rows/integrated storage. Legacy measurements are null. When revenue collection
fails, `revenue_known` is false, `revenue_cents` and `revenue_kept_cents` are null,
and `revenue_error` explains the failure. Costs, projection and brake evaluation
continue and produce a critical revenue-unavailable alert. An unknown revenue
value must not be interpreted as zero.

`npm run cost-safety:report` exports paginated history using
`COST_SAFETY_ADMIN_KEY` (an `admin:costs` admin key) and reconciles completed periods with normalized
invoice amounts. See the [export runbook](cost-safety.md#export-and-invoice-reconciliation).

The admin page is /admin/costs.html. See [operator setup and policy](cost-safety.md)
for analytics secrets, notification settings, thresholds, and remaining limits.

## Funded downloads on 256t.us

Downloads use the file's included or purchased allowance first. With an explicitly
enabled account budget, and key/grant caps where applicable, the requester pays
after that allowance runs out. The price for each GET, HEAD and cache hit is the
greater of $4 per million requests and $0.02 per GiB of the size encoded in the CID.
Amounts in budget spending fields are integer micro-cents (1 cent = 1,000,000 uc).
Daily and monthly caps are whole cents, in UTC calendar windows.

| Endpoint | Body / result |
| --- | --- |
| `GET /api/downloads/budget` | Account caps (`null` means off), key/grant caps, `spend`, `float_uc`, balance |
| `PUT /api/downloads/budget` | `{ "account": { "daily_cap_cents": 25, "monthly_cap_cents": 200 } }`; use `account: null` to disable |
| `PUT /api/auth/apikeys/:id/download-budget` | `{ "caps": { "daily_cap_cents": 10, "monthly_cap_cents": 100 } }`; `caps: null` disables |
| `PUT /api/oauth/grants/:id/download-budget` | Same caps; the grant's existing monthly spending limit also applies |
| `POST /api/downloads/sign` | `{ "cids": ["<cid>"], "expires_in": 3600 }`; 1–100 CIDs, expiry 1–604800 seconds; returns `urls: [{cid,url}]` and `expires_at` |
| `POST /api/downloads/session` | `{ "cid": "<optional redirect CID>" }`; returns a 60-second handshake `url` to navigate to |
| `GET /api/downloads/sessions` | Lists browser sessions and sessions backing account signed links |
| `DELETE /api/downloads/sessions` | `{ "session_id": "..." }`; revokes within 60 seconds |

Management endpoints require the account's Clerk session (LocalDev in local mode).
Signed URL minting also accepts an API key or an OAuth token with `downloads:spend`.
API keys and grants cannot increase their own or the account's caps. Account signed
links use revocable sessions listed on the account page. Key/grant signed links spend
from the minting key/grant and stop working when it is revoked. A valid credential
whose budget cannot cover the request falls back to anonymous limits with
`X-Budget: exhausted`.

API keys (`hbk_…`) need the `downloads:spend` scope to fund downloads, and
`POST /api/auth/apikeys` accepts optional `download_budget` with daily/monthly caps. A
key's or grant's `cids` caveat limits which content it may fund, and its monthly
spending limit applies to download leases too. Configure `DOWNLOAD_TOKEN_SECRET` before
creating keys. It must match across both Workers; changing it invalidates existing keys,
signed links, and download sessions.

- Header identity: `GET https://256t.us/a/<cid>[.ext]` with
  `Authorization: ApiKey hbk_...`, `X-API-Key: hbk_...`, or
  `Authorization: DPoP <OAuth-access-token>` plus a valid `DPoP` proof with
  `downloads:spend`. Unbound raw/legacy OAuth tokens use `Authorization: Bearer …`. Bound
  tokens cannot use the bearer path. Proof `htu` names the actual content-host URL.
- Signed link: `GET https://256t.us/s/<token>/<cid>[.ext]`. The signature binds the
  CID and spending identity. Use these for cross-site embeds.
- Browser identity: navigate to the handshake URL. It sets the HttpOnly, Secure,
  SameSite=Lax, Path=/ `__Host-hb_dl` cookie for up to 30 days, then redirects to
  `/a/<cid>`. Cookies work on direct navigation; credentialed CORS is not enabled.
- `OPTIONS` supports GET/HEAD and `Authorization, X-API-Key, DPoP` with wildcard origin.

`X-Budget` is `file`, `funded`, `anon`, or `exhausted` and is exposed to CORS callers.
Funded requests bypass the content Worker's per-IP and cost-brake limits. The strict
no-429 promise requires the `/a/` or `/s/` WAF exemption described in
[Cost safety](cost-safety.md). Plain paths remain subject to the zone WAF. Invalid
credentials get 401; unavailable/deleted/expired files get 404, disputed files 451,
and DO failures, invalid required safety state or the hard stop 503. Hashbin.org API limits are unchanged.

Whole cents are debited into reusable spending credit as `download_spend`
transactions. Leases consume this credit and reserve cap usage before delivery.
Direct credentials and signed URLs for the same spending identity and request
price share paid leases; each credential remains independently validated.
Unreported lease remainders stay spent (up to 250 requests per outstanding lease;
$0.001 at the minimum price, more for large files). Returned remainders restore
credit and applicable caps. At UTC month rollover, whole cents of unused credit
return as `download_refund`; a fractional cent stays available as spending credit.
Cap changes and revocations apply on the next lease, within 60 seconds.
