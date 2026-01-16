# HashBin.org API Reference

## Overview

The HashBin.org API is built on Cloudflare Workers and provides RESTful endpoints for content management, authentication, and account operations.

**Base URL**: 
- Development: `http://localhost:8787`
- Production: `https://hashbin.org`

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
- Current: `hb_<32-alphanumeric-characters>`
- Legacy formats (still supported): `hb_live_*` and `hb_test_*`
- Total length: 35 characters (current format)

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

## Content Endpoints (Planned)

The following endpoints are planned for Phase 2 (Core Content Operations):

### POST /api/content
Upload new content (requires authentication)

### GET /api/content/{hash}
Download content by 256t hash (public access)

### GET /api/content/{hash}/metadata
Get content metadata (public access)

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
