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

HashBin.org supports two authentication methods:

### 1. Clerk OAuth Session (Web Applications)

Use the Clerk frontend SDK to obtain a session token, then include it in requests:

```http
Authorization: Bearer <clerk-jwt-token>
```

**Supported OAuth Providers:**
- Google
- Apple
- Microsoft
- GitHub

### 2. API Keys (Programmatic Access)

Create API keys via the `/api/auth/apikeys` endpoint (requires Clerk session), then include in requests:

**Option A: Authorization Header**
```http
Authorization: ApiKey hb_abcd1234...
```

**Option B: X-API-Key Header**
```http
X-API-Key: hb_abcd1234...
```

**API Key Format:**
- Current: `hb2_<base64url-route>.<43-character-secret>.<22-character-HMAC-tag>`
- Legacy formats: `hb_<32-alphanumeric-characters>`, `hb_live_*` and `hb_test_*`
- New keys route directly to UserProfile; the signed route contains user and key IDs.

**Constraints:**
- Maximum 25 API keys per user
- Maximum expiration: 5 years from creation
- Keys can be revoked at any time

## Rate Limits

Rate limits are enforced per authentication context:

| Authentication | Limit |
|----------------|-------|
| Anonymous | 100 requests/minute |
| Authenticated User | 1,000 requests/minute |
| Per API Key | 500 requests/minute (within user limit) |

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

These endpoints manage user sessions and API keys.

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

These endpoints manage API keys for programmatic access.

---

#### POST /api/auth/apikeys

Create a new API key.

**Authentication:** Required (Clerk session only, not API key)

**Request Body:**
```json
{
  "name": "Production API Key",
  "expires_at": "2031-01-14T00:00:00.000Z"
}
```

**Parameters:**
- `name` (required): Human-readable name for the key (max 255 characters)
- `expires_at` (optional): ISO 8601 timestamp, max 5 years from now. Defaults to 5 years if omitted.

**Response:**
```json
{
  "key_id": "key_abc123",
  "api_key": "hb_abcd1234efgh5678ijkl9012mnop3456",
  "name": "Hosting",
  "created_at": "2026-01-14T00:00:00.000Z",
  "expires_at": "2031-01-14T00:00:00.000Z"
}
```

**⚠️ Important:** The `api_key` value is only shown once. Store it securely.

**Note:** If no name is provided, the system defaults to "Hosting" for the first key, or "Hosting n" (where n >= 2) for subsequent keys.

**Error Responses:**
- `400` - Invalid key name or expiration
- `400 AUTH_KEY_LIMIT` - Maximum 25 keys reached
- `401 AUTH_MISSING` - No authentication provided
- `403` - API keys cannot create other API keys

---

#### GET /api/auth/apikeys

List all API keys for the authenticated user.

**Authentication:** Required (Clerk session only, not API key)

**Response:**
```json
[
  {
    "key_id": "key_abc123",
    "name": "Production API Key",
    "created_at": "2026-01-14T00:00:00.000Z",
    "expires_at": "2031-01-14T00:00:00.000Z",
    "last_used_at": "2026-01-14T03:00:00.000Z",
    "revoked_at": null
  },
  {
    "key_id": "key_xyz789",
    "name": "Development Key",
    "created_at": "2026-01-13T00:00:00.000Z",
    "expires_at": "2031-01-13T00:00:00.000Z",
    "last_used_at": null,
    "revoked_at": "2026-01-14T00:00:00.000Z"
  }
]
```

**Note:** The actual API key value is never returned. Only metadata is provided.

---

#### DELETE /api/auth/apikeys/{key_id}

Revoke an API key.

**Authentication:** Required (Clerk session only)

**Path Parameters:**
- `key_id`: The key ID to revoke

**Response:**
```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

**Error Responses:**
- `404` - Key not found or belongs to another user
- `400` - Key already revoked

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

## Content Endpoints

Uploads go to `hashbin.org`; content is served from the separate origin `https://256t.us/{cid}`.
The frontend's [API reference](https://hashbin.org/docs/api.html) has full request/response details.

### POST /api/content
Upload content (requires authentication; cost is deducted from balance). Body is either raw bytes
(`Content-Type` is stored) or `multipart/form-data` with a `content` file field. Retention is
`retention_months` (query or form field, default 1). Maximum upload size is **90 MB**; larger
requests return `413 Payload Too Large` with `max_upload_bytes` in the body. The current limit is
also published as `max_upload_bytes` in `GET /api/config`.

### GET /api/content/{cid}
Content metadata (public). Includes `url` and `download_domain`.

### POST /api/content/{cid}/extend
Extend retention (requires authentication; cost deducted from balance).

### GET https://256t.us/{cid}[.{ext}]
Download content (public, no cookies). Returns 451 for disputed content and 404 for deleted or expired content.

---

## Developer App Endpoints

Manage OAuth apps for third-party publishing (see `/developers`). Require a signed-in session or API
key; OAuth access tokens are refused.

- `POST /api/developers/apps`: register `{app_name, redirect_uris[]}` and get `client_id` and `client_secret` (shown once)
- `GET /api/developers/apps`: your apps
- `PATCH /api/developers/apps/{app_id}`: change `app_name`, `redirect_uris`, `logo_url`, or `website_url`
- `DELETE /api/developers/apps/{app_id}`: delete the app. Users can't authorize it anymore, refresh
  tokens stop working, and issued access tokens expire within an hour.

Redirect URIs must be `https://` (or `http://localhost` / `http://127.0.0.1` for development), or a native app scheme named after a reversed domain such as `org.example.app://oauth` (RFC 8252), and have no fragment; at most 10.
App names are 1–100 characters. Apps you don't own answer 404.

---

## Examples

### Example: Creating an API Key

```bash
# First, obtain a Clerk session token via OAuth (use Clerk frontend SDK)
# Then create an API key:

curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Authorization: Bearer <clerk-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Application",
    "expires_at": "2029-01-14T00:00:00.000Z"
  }'
```

### Example: Using an API Key

```bash
# List your API keys
curl -X GET https://hashbin.org/api/auth/apikeys \
  -H "X-API-Key: hb_abcd1234efgh5678ijkl9012mnop3456"

# Get session info
curl -X GET https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey hb_abcd1234efgh5678ijkl9012mnop3456"
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

Admin endpoints require X-Admin-Token:

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

New API keys use `hb2_<route>.<random-secret>.<HMAC-tag>`. The route contains the
account and key IDs. `POST /api/auth/apikeys` accepts optional `download_budget`
with daily/monthly caps. Old `hb_` keys continue working on plain CID paths; rotate
them to use the funded `/a/` path. Configure `DOWNLOAD_TOKEN_SECRET` before creating
new keys. It must match across both Workers; changing it invalidates existing v2
keys, signed links, and download sessions.

- Header identity: `GET https://256t.us/a/<cid>[.ext]` with
  `Authorization: ApiKey hb2_...`, `X-API-Key: hb2_...`, or
  `Authorization: Bearer <OAuth-access-token>` with `downloads:spend`.
- Signed link: `GET https://256t.us/s/<token>/<cid>[.ext]`. The signature binds the
  CID and spending identity. Use these for cross-site embeds.
- Browser identity: navigate to the handshake URL. It sets the HttpOnly, Secure,
  SameSite=Lax, Path=/ `__Host-hb_dl` cookie for up to 30 days, then redirects to
  `/a/<cid>`. Cookies work on direct navigation; credentialed CORS is not enabled.
- `OPTIONS` supports GET/HEAD and `Authorization, X-API-Key` with wildcard origin.

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
