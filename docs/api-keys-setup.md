# API Keys Setup Guide

This guide explains how to set up and use the API keys feature in HashBin.org.

## Prerequisites

- Cloudflare Workers account with API access
- Wrangler CLI installed (`npm install -g wrangler`)
- Clerk account configured (for authentication)

## Setup Steps

### 1. Generate Encryption Key

The API keys feature requires a 256-bit AES encryption key to securely store API keys for the reveal functionality.

```bash
# Generate a new encryption key
./scripts/generate-encryption-key.sh
```

This will output a base64-encoded encryption key. **Save this key securely!**

### 2. Add Encryption Key as Secret

Add the encryption key as a Cloudflare secret using Wrangler:

```bash
# For development environment
echo 'YOUR_KEY_HERE' | wrangler secret put API_KEY_ENCRYPTION_KEY --env development

# For production environment
echo 'YOUR_KEY_HERE' | wrangler secret put API_KEY_ENCRYPTION_KEY --env production
```

**Important:** Replace `YOUR_KEY_HERE` with the actual key from step 1.

### 3. Deploy

Deploy your Worker with the new API keys functionality:

```bash
# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

## API Endpoints

### Create API Key

```bash
POST /api/auth/apikeys
Authorization: Bearer <clerk-jwt>
Content-Type: application/json

{
  "name": "My CI/CD Key",
  "expires_at": "2025-12-31T23:59:59Z"  # Optional, defaults to 5 years
}
```

Response:
```json
{
  "key_id": "uuid-here",
  "name": "My CI/CD Key",
  "created_at": "2024-01-15T12:00:00Z",
  "expires_at": "2029-01-15T12:00:00Z",
  "api_key": "hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab1234",
  "warning": "Save this API key securely. It will not be shown again."
}
```

**Note:** The `api_key` is only returned once during creation.

### List API Keys

```bash
GET /api/auth/apikeys
Authorization: Bearer <clerk-jwt>
```

Response:
```json
[
  {
    "key_id": "uuid-here",
    "name": "My CI/CD Key",
    "created_at": "2024-01-15T12:00:00Z",
    "expires_at": "2029-01-15T12:00:00Z",
    "last_used_at": "2024-01-16T08:30:00Z",
    "revoked": false
  }
]
```

### Reveal API Key

Requires a **fresh** Clerk session (authenticated within last 5 minutes).

```bash
POST /api/auth/apikeys/:keyId/reveal
Authorization: Bearer <clerk-jwt>
```

Response:
```json
{
  "key_id": "uuid-here",
  "name": "My CI/CD Key",
  "api_key": "hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab1234",
  "created_at": "2024-01-15T12:00:00Z",
  "expires_at": "2029-01-15T12:00:00Z",
  "last_used_at": "2024-01-16T08:30:00Z",
  "warning": "Keep this API key secure. Limit how often you reveal it."
}
```

**Rate Limiting:** Maximum 3 reveals per hour per key.

**Fresh Session Requirement:** If your session is older than 5 minutes, you'll receive a 403 error asking you to re-authenticate.

### Revoke API Key

```bash
DELETE /api/auth/apikeys/:keyId
Authorization: Bearer <clerk-jwt>
```

Response:
```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

**Note:** Revoking an already revoked key returns the same success response (idempotent).

### Use API Key for Authentication

API keys can be used instead of Clerk sessions for authenticated requests:

```bash
# Method 1: Authorization header
curl -H "Authorization: ApiKey hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab1234" \
  https://hashbin.org/api/content

# Method 2: X-API-Key header
curl -H "X-API-Key: hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab1234" \
  https://hashbin.org/api/content
```

## Security Features

1. **Encryption at Rest:** API keys are stored both hashed (SHA-256) and encrypted (AES-256-GCM)
2. **Fresh Session Required:** Revealing keys requires recent authentication
3. **Rate Limited:** Reveals are limited to 3 per hour per key
4. **Environment Isolation:** Test keys (`hb_test_*`) won't work in production
5. **Non-Replicating:** API keys cannot create/list/revoke/reveal other keys
6. **Expiration:** Keys expire after maximum 5 years
7. **Revocable:** Keys can be immediately revoked

## Testing

Run the test suite to verify the implementation:

```bash
npm run test:apikeys
```

This runs 21 tests covering:
- Key generation and format validation
- Encryption/decryption
- Session freshness validation
- Reveal endpoint with rate limiting
- Idempotent revoke operation

## Troubleshooting

### "API_KEY_ENCRYPTION_KEY not configured"

The encryption key secret is missing. Follow setup steps 1-2 above.

### "FRESH_AUTH_REQUIRED" when revealing key

Your Clerk session is older than 5 minutes. Re-authenticate in your app to get a fresh session.

### "REVEAL_RATE_LIMITED"

You've revealed this key 3 times in the last hour. Wait for the rate limit to reset (check `retry_after_seconds` in response).

### Test/Live key environment mismatch

- Test keys (`hb_test_*`) can only be used in development
- Live keys (`hb_live_*`) can only be used in production

## Next Steps

- **Frontend UI:** Build a user interface at `/settings/api-keys` for key management
- **Production Rate Limiting:** Implement RateLimiter Durable Object for distributed rate limiting
- **Documentation:** Add comprehensive API documentation with more examples
