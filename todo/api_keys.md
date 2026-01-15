# API Keys Feature Plan

## Overview

This document plans the API keys feature that allows users to create programmatic access tokens for uploading content to HashBin. API keys provide an alternative to Clerk OAuth sessions for automated/scripted uploads.

## Current Implementation Status

The API key infrastructure is **partially implemented**. The following components exist:

### Implemented
- API key generation with cryptographically secure random values
- Key format: `hb_live_<32-chars>` (production) or `hb_test_<32-chars>` (development)
- SHA-256 hashing of keys before storage (keys never stored in plaintext)
- KeyRegistry Durable Object for O(1) key lookups
- UserProfile Durable Object stores user's API keys
- Authentication middleware supports API key validation
- Rate limiting per API key (500 req/min)
- API endpoints for create/list/revoke operations

### Not Implemented / Not Verified
- No automated tests exist
- Frontend UI for API key management
- Usage tracking/analytics dashboard
- Key rotation workflow
- Webhook notifications for key events

---

## Feature Specification

### API Key Format

```
hb_live_<32-alphanumeric-chars>  (production)
hb_test_<32-alphanumeric-chars>  (development)
```

- Total length: 40 characters (8 prefix + 32 random)
- Character set: `A-Za-z0-9` (62 chars, ~190 bits entropy)
- Prefix indicates environment to prevent cross-environment usage

### Authentication Methods

API keys can be provided via:

1. **Authorization header**: `Authorization: ApiKey <key>`
2. **X-API-Key header**: `X-API-Key: <key>`

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/apikeys` | Clerk session | Create new API key |
| GET | `/api/auth/apikeys` | Clerk session | List user's API keys |
| POST | `/api/auth/apikeys/:keyId/reveal` | Fresh Clerk session | Reveal full API key (requires re-auth) |
| DELETE | `/api/auth/apikeys/:keyId` | Clerk session | Revoke an API key |

**Notes**:
- API keys cannot be used to manage other API keys (create/list/revoke/reveal). This prevents a compromised key from accessing other keys.
- The reveal endpoint requires a "fresh" Clerk session (authenticated within the last 5 minutes) to prevent session hijacking attacks.

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `key_id` | UUID | Unique identifier for the key |
| `key_hash` | string | SHA-256 hash of the actual key (for validation) |
| `key_encrypted` | string | AES-256-GCM encrypted key (for reveal functionality) |
| `name` | string | User-provided name (1-255 chars) |
| `created_at` | ISO8601 | When the key was created |
| `expires_at` | ISO8601 | When the key expires |
| `revoked_at` | ISO8601 | When the key was revoked (null if active) |
| `last_used_at` | ISO8601 | Last time the key was used (null if never) |

**Storage Security**: Keys are stored both hashed (for fast O(1) validation via KeyRegistry) and encrypted (for reveal functionality). The encryption key is stored as a Cloudflare secret (`API_KEY_ENCRYPTION_KEY`).

### Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max keys per user | 25 | Prevent abuse, simplify management |
| Max expiration | 5 years | Security best practice |
| Min name length | 1 char | Must have a name |
| Max name length | 255 chars | Reasonable limit |
| Rate limit | 500 req/min | Per-key limit to prevent abuse |

---

## Test Plan

### Unit Tests: Key Generation & Validation

#### `auth/utils.test.js`

```
TEST: generateApiKey - production environment
  GIVEN: environment = 'production'
  WHEN: generateApiKey(environment) is called
  THEN: returns string starting with 'hb_live_'
  AND: total length is exactly 40 characters
  AND: remaining 32 chars are alphanumeric only

TEST: generateApiKey - development environment
  GIVEN: environment = 'development'
  WHEN: generateApiKey(environment) is called
  THEN: returns string starting with 'hb_test_'
  AND: total length is exactly 40 characters

TEST: generateApiKey - uniqueness
  GIVEN: environment = 'production'
  WHEN: generateApiKey is called 1000 times
  THEN: all 1000 keys are unique

TEST: hashApiKey - deterministic
  GIVEN: apiKey = 'hb_test_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  WHEN: hashApiKey(apiKey) is called twice
  THEN: both results are identical SHA-256 hex strings

TEST: hashApiKey - different keys produce different hashes
  GIVEN: key1 = generateApiKey('production')
  AND: key2 = generateApiKey('production')
  WHEN: both are hashed
  THEN: hashes are different

TEST: validateApiKeyFormat - valid production key
  GIVEN: apiKey = 'hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  AND: environment = 'production'
  WHEN: validateApiKeyFormat(apiKey, environment) is called
  THEN: returns { valid: true }

TEST: validateApiKeyFormat - valid test key in development
  GIVEN: apiKey = 'hb_test_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  AND: environment = 'development'
  WHEN: validateApiKeyFormat(apiKey, environment) is called
  THEN: returns { valid: true }

TEST: validateApiKeyFormat - test key in production (environment mismatch)
  GIVEN: apiKey = 'hb_test_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  AND: environment = 'production'
  WHEN: validateApiKeyFormat(apiKey, environment) is called
  THEN: returns { valid: false, error: 'AUTH_ENV_MISMATCH' }

TEST: validateApiKeyFormat - live key in development (environment mismatch)
  GIVEN: apiKey = 'hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  AND: environment = 'development'
  WHEN: validateApiKeyFormat(apiKey, environment) is called
  THEN: returns { valid: false, error: 'AUTH_ENV_MISMATCH' }

TEST: validateApiKeyFormat - wrong prefix
  GIVEN: apiKey = 'xx_fake_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateApiKeyFormat - too short
  GIVEN: apiKey = 'hb_live_ABC'
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateApiKeyFormat - too long
  GIVEN: apiKey = 'hb_live_' + 'A'.repeat(40)
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateApiKeyFormat - invalid characters
  GIVEN: apiKey = 'hb_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ!@'
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateApiKeyFormat - null input
  GIVEN: apiKey = null
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateApiKeyFormat - empty string
  GIVEN: apiKey = ''
  WHEN: validateApiKeyFormat(apiKey, 'production') is called
  THEN: returns { valid: false, error: 'AUTH_INVALID_FORMAT' }

TEST: validateKeyName - valid name
  GIVEN: name = 'My CI/CD Key'
  WHEN: validateKeyName(name) is called
  THEN: returns { valid: true }

TEST: validateKeyName - empty name
  GIVEN: name = ''
  WHEN: validateKeyName(name) is called
  THEN: returns { valid: false }

TEST: validateKeyName - null name
  GIVEN: name = null
  WHEN: validateKeyName(name) is called
  THEN: returns { valid: false }

TEST: validateKeyName - too long (256 chars)
  GIVEN: name = 'A'.repeat(256)
  WHEN: validateKeyName(name) is called
  THEN: returns { valid: false }

TEST: validateKeyName - max length (255 chars)
  GIVEN: name = 'A'.repeat(255)
  WHEN: validateKeyName(name) is called
  THEN: returns { valid: true }

TEST: validateExpiration - no expiration (defaults to 5 years)
  GIVEN: expiresAt = undefined
  WHEN: validateExpiration(expiresAt) is called
  THEN: returns { valid: true, expiresAt: <5 years from now> }

TEST: validateExpiration - valid future date
  GIVEN: expiresAt = <1 year from now>
  WHEN: validateExpiration(expiresAt) is called
  THEN: returns { valid: true, expiresAt: <normalized ISO8601> }

TEST: validateExpiration - past date
  GIVEN: expiresAt = '2020-01-01T00:00:00Z'
  WHEN: validateExpiration(expiresAt) is called
  THEN: returns { valid: false, message: 'Expiration date must be in the future' }

TEST: validateExpiration - more than 5 years
  GIVEN: expiresAt = <6 years from now>
  WHEN: validateExpiration(expiresAt) is called
  THEN: returns { valid: false, message: 'Expiration date cannot be more than 5 years in the future' }

TEST: validateExpiration - invalid date format
  GIVEN: expiresAt = 'not-a-date'
  WHEN: validateExpiration(expiresAt) is called
  THEN: returns { valid: false, message: 'Invalid expiration date format' }

TEST: generateKeyId - returns valid UUID
  WHEN: generateKeyId() is called
  THEN: returns a valid UUID v4 string

TEST: encryptApiKey - produces encrypted output
  GIVEN: apiKey = 'hb_test_ABCDEFGHIJKLMNOPQRSTUVWXYZab'
  AND: encryptionKey = <valid 256-bit key>
  WHEN: encryptApiKey(apiKey, encryptionKey) is called
  THEN: returns base64-encoded ciphertext
  AND: ciphertext is different from plaintext

TEST: decryptApiKey - recovers original key
  GIVEN: encryptedKey from encryptApiKey()
  AND: same encryptionKey used for encryption
  WHEN: decryptApiKey(encryptedKey, encryptionKey) is called
  THEN: returns original apiKey

TEST: decryptApiKey - fails with wrong key
  GIVEN: encryptedKey from encryptApiKey()
  AND: different encryptionKey
  WHEN: decryptApiKey(encryptedKey, wrongKey) is called
  THEN: throws decryption error

TEST: encryptApiKey - unique ciphertext each time (random IV)
  GIVEN: same apiKey and encryptionKey
  WHEN: encryptApiKey is called twice
  THEN: both ciphertexts are different
  AND: both decrypt to same plaintext

TEST: isSessionFresh - returns true for recent session
  GIVEN: session.iat = 2 minutes ago
  WHEN: isSessionFresh(session, 5) is called
  THEN: returns true

TEST: isSessionFresh - returns false for stale session
  GIVEN: session.iat = 10 minutes ago
  WHEN: isSessionFresh(session, 5) is called
  THEN: returns false

TEST: isSessionFresh - returns false for exactly threshold
  GIVEN: session.iat = exactly 5 minutes ago
  WHEN: isSessionFresh(session, 5) is called
  THEN: returns false (must be strictly less than threshold)
```

### Integration Tests: API Endpoints

#### `api/auth.test.js`

```
TEST: POST /api/auth/apikeys - create key with Clerk session
  GIVEN: valid Clerk session token
  AND: request body = { name: 'Test Key', expires_at: <1 year from now> }
  WHEN: POST /api/auth/apikeys
  THEN: status = 201
  AND: response contains api_key (shown only once)
  AND: response contains key_id, name, created_at, expires_at
  AND: response contains warning about saving key

TEST: POST /api/auth/apikeys - create key without expiration (defaults)
  GIVEN: valid Clerk session token
  AND: request body = { name: 'Test Key' }
  WHEN: POST /api/auth/apikeys
  THEN: status = 201
  AND: expires_at is approximately 5 years from now

TEST: POST /api/auth/apikeys - reject API key authentication
  GIVEN: valid API key in Authorization header
  AND: request body = { name: 'New Key' }
  WHEN: POST /api/auth/apikeys
  THEN: status = 403
  AND: error = 'Invalid authentication method'
  AND: message indicates API keys cannot create other keys

TEST: POST /api/auth/apikeys - reject no authentication
  WHEN: POST /api/auth/apikeys without auth
  THEN: status = 401

TEST: POST /api/auth/apikeys - reject invalid JSON body
  GIVEN: valid Clerk session
  AND: request body is not valid JSON
  WHEN: POST /api/auth/apikeys
  THEN: status = 400
  AND: error = 'Invalid request body'

TEST: POST /api/auth/apikeys - reject missing name
  GIVEN: valid Clerk session
  AND: request body = {}
  WHEN: POST /api/auth/apikeys
  THEN: status = 400
  AND: error = 'Invalid key name'

TEST: POST /api/auth/apikeys - reject invalid expiration
  GIVEN: valid Clerk session
  AND: request body = { name: 'Key', expires_at: 'invalid' }
  WHEN: POST /api/auth/apikeys
  THEN: status = 400
  AND: error = 'Invalid expiration'

TEST: POST /api/auth/apikeys - reject when at max keys (25)
  GIVEN: valid Clerk session
  AND: user already has 25 API keys
  WHEN: POST /api/auth/apikeys
  THEN: status = 400
  AND: error = 'AUTH_KEY_LIMIT' or similar

TEST: GET /api/auth/apikeys - list keys with Clerk session
  GIVEN: valid Clerk session
  AND: user has 3 API keys
  WHEN: GET /api/auth/apikeys
  THEN: status = 200
  AND: response is array of 3 key objects
  AND: each key has key_id, name, created_at, expires_at, revoked_at, last_used_at
  AND: NO key contains the actual api_key value

TEST: GET /api/auth/apikeys - empty list for new user
  GIVEN: valid Clerk session for new user
  WHEN: GET /api/auth/apikeys
  THEN: status = 200
  AND: response is empty array []

TEST: GET /api/auth/apikeys - reject API key authentication
  GIVEN: valid API key in Authorization header
  WHEN: GET /api/auth/apikeys
  THEN: status = 403

TEST: DELETE /api/auth/apikeys/:keyId - revoke existing key
  GIVEN: valid Clerk session
  AND: user has key with key_id = 'abc-123'
  WHEN: DELETE /api/auth/apikeys/abc-123
  THEN: status = 200
  AND: key is marked as revoked

TEST: DELETE /api/auth/apikeys/:keyId - revoke non-existent key
  GIVEN: valid Clerk session
  WHEN: DELETE /api/auth/apikeys/non-existent-id
  THEN: status = 404

TEST: DELETE /api/auth/apikeys/:keyId - revoke already revoked key (idempotent)
  GIVEN: valid Clerk session
  AND: key was already revoked
  WHEN: DELETE /api/auth/apikeys/:keyId
  THEN: status = 200
  AND: revoked_at timestamp unchanged

TEST: DELETE /api/auth/apikeys/:keyId - reject API key authentication
  GIVEN: valid API key (even the one being revoked)
  WHEN: DELETE /api/auth/apikeys/:keyId
  THEN: status = 403

TEST: POST /api/auth/apikeys/:keyId/reveal - reveal with fresh session
  GIVEN: valid Clerk session authenticated < 5 minutes ago
  AND: user owns the API key
  WHEN: POST /api/auth/apikeys/:keyId/reveal
  THEN: status = 200
  AND: response contains full api_key value
  AND: response contains warning about key exposure

TEST: POST /api/auth/apikeys/:keyId/reveal - reject stale session
  GIVEN: valid Clerk session authenticated > 5 minutes ago
  WHEN: POST /api/auth/apikeys/:keyId/reveal
  THEN: status = 403
  AND: error = 'FRESH_AUTH_REQUIRED'
  AND: message indicates re-authentication needed

TEST: POST /api/auth/apikeys/:keyId/reveal - reject API key authentication
  GIVEN: valid API key in Authorization header
  WHEN: POST /api/auth/apikeys/:keyId/reveal
  THEN: status = 403

TEST: POST /api/auth/apikeys/:keyId/reveal - reject for revoked key
  GIVEN: fresh Clerk session
  AND: API key has been revoked
  WHEN: POST /api/auth/apikeys/:keyId/reveal
  THEN: status = 400
  AND: error = 'KEY_REVOKED'

TEST: POST /api/auth/apikeys/:keyId/reveal - reject for non-existent key
  GIVEN: fresh Clerk session
  WHEN: POST /api/auth/apikeys/non-existent-id/reveal
  THEN: status = 404

TEST: POST /api/auth/apikeys/:keyId/reveal - reject for other user's key
  GIVEN: fresh Clerk session for User A
  AND: key belongs to User B
  WHEN: POST /api/auth/apikeys/:keyId/reveal
  THEN: status = 404
```

### Integration Tests: API Key Authentication

#### `auth/middleware.test.js`

```
TEST: authenticate - valid API key via Authorization header
  GIVEN: valid, non-expired, non-revoked API key
  AND: header = 'Authorization: ApiKey hb_test_...'
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: true, user: { userId, keyId, authMethod: 'apikey' } }

TEST: authenticate - valid API key via X-API-Key header
  GIVEN: valid API key
  AND: header = 'X-API-Key: hb_test_...'
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: true }

TEST: authenticate - Authorization header takes precedence over X-API-Key
  GIVEN: Authorization header with Clerk token
  AND: X-API-Key header with valid API key
  WHEN: authenticate(request, env) is called
  THEN: authenticates via Clerk, not API key

TEST: authenticate - expired API key
  GIVEN: API key that has passed its expires_at
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_EXPIRED' }

TEST: authenticate - revoked API key
  GIVEN: API key that has been revoked
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_REVOKED' }

TEST: authenticate - API key for deleted user
  GIVEN: valid API key
  AND: user account has been deleted
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_USER_DELETED' }

TEST: authenticate - API key not found in registry
  GIVEN: well-formed but non-existent API key
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_INVALID_FORMAT' }

TEST: authenticate - updates last_used_at on successful auth
  GIVEN: valid API key with last_used_at = null
  WHEN: authenticate(request, env) is called
  THEN: last_used_at is updated to current timestamp

TEST: authenticate - case-insensitive 'ApiKey' scheme
  GIVEN: header = 'Authorization: APIKEY hb_test_...'
  WHEN: authenticate(request, env) is called
  THEN: authenticates successfully

TEST: authenticate - case-insensitive 'apikey' scheme
  GIVEN: header = 'Authorization: apikey hb_test_...'
  WHEN: authenticate(request, env) is called
  THEN: authenticates successfully

TEST: authenticate - updates last_used_at even for revoked key (security signal)
  GIVEN: revoked API key with last_used_at = '2024-01-01T00:00:00Z'
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_REVOKED' }
  AND: last_used_at is updated to current timestamp

TEST: authenticate - updates last_used_at even for expired key (security signal)
  GIVEN: expired API key with last_used_at = '2024-01-01T00:00:00Z'
  WHEN: authenticate(request, env) is called
  THEN: returns { authenticated: false, error: 'AUTH_EXPIRED' }
  AND: last_used_at is updated to current timestamp
```

### Integration Tests: Content Upload with API Key

#### `api/content.test.js`

```
TEST: POST /api/content - upload with valid API key
  GIVEN: valid API key with sufficient balance
  AND: multipart form with content file
  WHEN: POST /api/content
  THEN: status = 201
  AND: content is stored
  AND: balance is debited

TEST: POST /api/content - upload with expired API key
  GIVEN: expired API key
  WHEN: POST /api/content
  THEN: status = 401

TEST: POST /api/content - upload with revoked API key
  GIVEN: revoked API key
  WHEN: POST /api/content
  THEN: status = 401

TEST: POST /api/content - upload with insufficient balance
  GIVEN: valid API key
  AND: user balance = 0
  AND: content requires payment
  WHEN: POST /api/content
  THEN: status = 400
  AND: error = 'insufficient_balance'

TEST: POST /api/content - inline content (free) with API key
  GIVEN: valid API key
  AND: content <= 64 bytes
  WHEN: POST /api/content
  THEN: status = 201
  AND: cost_cents = 0
```

### Integration Tests: Rate Limiting

#### `auth/rate-limit.test.js`

```
TEST: rate limit - API key under limit
  GIVEN: valid API key
  AND: 0 requests in current window
  WHEN: make 100 requests
  THEN: all 100 succeed

TEST: rate limit - API key at limit (500)
  GIVEN: valid API key
  AND: 500 requests already made in current window
  WHEN: make 1 more request
  THEN: status = 429
  AND: error = 'AUTH_RATE_LIMITED'
  AND: Retry-After header present

TEST: rate limit - different API keys have separate limits
  GIVEN: key1 at 500 requests (rate limited)
  AND: key2 at 0 requests
  WHEN: make request with key2
  THEN: succeeds

TEST: rate limit - anonymous requests (100/min limit)
  GIVEN: no authentication
  AND: 100 requests already made from IP
  WHEN: make 1 more request
  THEN: status = 429

TEST: rate limit - Clerk session (1000/min limit)
  GIVEN: Clerk session
  AND: 999 requests made
  WHEN: make 1 more request
  THEN: succeeds

TEST: rate limit - window reset
  GIVEN: API key at rate limit
  WHEN: wait 60 seconds
  THEN: requests succeed again

TEST: rate limit - persists across Worker instances (Durable Objects)
  GIVEN: API key with 400 requests counted in DO
  WHEN: request hits different Worker instance
  AND: makes 100 more requests
  THEN: first 100 succeed (total 500)
  AND: next request returns 429

TEST: rate limit - concurrent requests handled correctly
  GIVEN: API key with 498 requests in window
  WHEN: 5 concurrent requests arrive
  THEN: exactly 2 succeed
  AND: exactly 3 return 429
```

### Integration Tests: RateLimiter Durable Object

#### `durable-objects/rate-limiter.test.js`

```
TEST: increment - first request in window
  GIVEN: empty rate limit state for identifier
  WHEN: POST /increment with identifier = 'key:abc123'
  THEN: returns { count: 1, allowed: true, remaining: 499 }

TEST: increment - request within limit
  GIVEN: identifier has 100 requests in current window
  WHEN: POST /increment
  THEN: returns { count: 101, allowed: true, remaining: 399 }

TEST: increment - request at limit
  GIVEN: identifier has 499 requests in current window
  WHEN: POST /increment
  THEN: returns { count: 500, allowed: true, remaining: 0 }

TEST: increment - request over limit
  GIVEN: identifier has 500 requests in current window
  WHEN: POST /increment
  THEN: returns { count: 500, allowed: false, remaining: 0, resetAt: <timestamp> }

TEST: window expiration - old requests don't count
  GIVEN: identifier had 500 requests 61 seconds ago
  WHEN: POST /increment
  THEN: returns { count: 1, allowed: true, remaining: 499 }

TEST: concurrent increments - transactional safety
  GIVEN: identifier has 498 requests
  WHEN: 5 concurrent POST /increment requests
  THEN: exactly 2 return allowed: true
  AND: exactly 3 return allowed: false
  AND: final count is 500

TEST: different identifiers - isolated counters
  GIVEN: 'key:abc' has 500 requests (rate limited)
  AND: 'key:xyz' has 0 requests
  WHEN: POST /increment for 'key:xyz'
  THEN: returns { count: 1, allowed: true }

TEST: DO failure - returns fail-closed response
  GIVEN: RateLimiter DO is unavailable (timeout/error)
  WHEN: POST /increment
  THEN: returns { allowed: false, error: 'RATE_LIMIT_UNAVAILABLE' }

TEST: DO timeout - fails closed within reasonable time
  GIVEN: RateLimiter DO takes > 5 seconds to respond
  WHEN: POST /increment with 5 second timeout
  THEN: returns 503 status
  AND: error = 'RATE_LIMIT_UNAVAILABLE'
```

### Integration Tests: KeyRegistry Durable Object

#### `durable-objects/key-registry.test.js`

```
TEST: register - store new key mapping
  GIVEN: key_hash, user_id, key_id
  WHEN: POST /register
  THEN: mapping is stored

TEST: lookup - find existing key
  GIVEN: registered key
  WHEN: POST /lookup with key_hash
  THEN: returns { user_id, key_id }

TEST: lookup - key not found
  GIVEN: non-existent key_hash
  WHEN: POST /lookup
  THEN: status = 404

TEST: concurrent registration - handles race conditions
  GIVEN: same key_hash being registered concurrently
  WHEN: both requests complete
  THEN: exactly one mapping exists
  AND: second request fails or returns existing
```

### Integration Tests: UserProfile Durable Object (API Keys)

#### `durable-objects/user-profile-apikeys.test.js`

```
TEST: create API key - stores in profile
  GIVEN: user profile exists
  WHEN: POST /apikeys with key details
  THEN: key is stored in api_keys array

TEST: create API key - enforces 25 key limit
  GIVEN: user has 25 keys
  WHEN: POST /apikeys
  THEN: returns error about limit

TEST: list API keys - returns all keys
  GIVEN: user has 5 keys (2 revoked, 3 active)
  WHEN: GET /apikeys
  THEN: returns all 5 keys

TEST: get single API key - returns key details
  GIVEN: user has key with key_id
  WHEN: GET /apikeys/:keyId
  THEN: returns key object

TEST: revoke API key - sets revoked_at
  GIVEN: active key
  WHEN: DELETE /apikeys/:keyId
  THEN: key.revoked_at is set to current time

TEST: update last_used_at - records usage
  GIVEN: key with last_used_at = null
  WHEN: POST /apikeys/:keyId/use
  THEN: last_used_at is updated

TEST: only active keys count toward 25-key limit
  GIVEN: user has 20 active keys and 10 revoked keys (30 total stored)
  WHEN: POST /apikeys (create new)
  THEN: succeeds (only 20 active keys count toward limit)
  AND: user now has 21 active keys

TEST: can create key after revoking when at limit
  GIVEN: user has exactly 25 active keys (at limit)
  WHEN: user revokes 1 key
  AND: user creates a new key
  THEN: succeeds (now has 24 active + 1 revoked + 1 new = 25 active)
```

### End-to-End Tests

#### `e2e/api-keys.test.js`

```
TEST: full workflow - create key, use for upload, revoke
  1. Login with Clerk
  2. Create API key with name "CI Key"
  3. Verify key returned and save it
  4. Logout from Clerk
  5. Upload content using API key
  6. Verify upload succeeded
  7. Login with Clerk again
  8. List API keys, verify last_used_at updated
  9. Revoke the key
  10. Attempt upload with revoked key
  11. Verify upload fails with 401

TEST: multiple users - keys are isolated
  1. User A creates key "KeyA"
  2. User B creates key "KeyB"
  3. User A lists keys - only sees KeyA
  4. User B lists keys - only sees KeyB

TEST: key expiration - expires at correct time
  1. Create key with expires_at = 1 minute from now
  2. Use key immediately - succeeds
  3. Wait 61 seconds
  4. Use key again - fails with AUTH_EXPIRED

TEST: key reveal - requires fresh authentication
  1. Login with Clerk, create API key
  2. Wait 6 minutes (session becomes stale)
  3. Attempt to reveal key - fails with FRESH_AUTH_REQUIRED
  4. Re-authenticate with Clerk (fresh login)
  5. Reveal key - succeeds, shows full key
  6. Verify revealed key matches original
```

---

## Resolved Decisions

The following design decisions have been finalized:

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Revoked keys count toward limit? | **Only active keys count** | Allows key rotation without hitting limit; revoked keys retained for audit |
| 2 | Re-revoking already revoked keys | **Idempotent 200 response** | Safest for distributed systems; no error, no change |
| 3 | Deleted user's keys in KeyRegistry | **Leave orphaned entries** | Validation fails at user lookup; GC can be added later if needed |
| 4 | API key name uniqueness | **Allow duplicate names** | Names are human reference only; key_id provides uniqueness |
| 5 | Rate limit storage | **Use Durable Objects** | Required for production distributed Workers |
| 6 | Update last_used_at for revoked keys? | **Yes** | Helps detect attempted use of compromised keys |
| 7 | API key scope/permissions | **Defer to future phase** | Full access for MVP; add scopes later if needed |
| 8 | Key rotation workflow | **Manual rotation** | Users create new key, update clients, revoke old key |
| 9 | Frontend UI location | **Dedicated /settings/api-keys page** | Clear, focused location for key management |
| 10 | Key creation audit log | **api_keys array is sufficient** | Timestamps in UserProfile provide adequate audit trail |
| 11 | RateLimiter DO architecture | **Dedicated DO per identifier** | Separate RateLimiter class; instances keyed by `key:<id>`, `user:<id>`, `anon:<ip>` |
| 12 | RateLimiter DO failure behavior | **Fail closed (503)** | Security over availability; deny requests if rate limiting unavailable |
| 13 | API key reveal after creation | **Re-authenticate to reveal** | User can reveal key again after fresh Clerk session or 2FA |

---

## Implementation Tasks

### Phase 1: Testing Infrastructure
1. Set up testing framework (Vitest or Jest)
2. Create test utilities for mocking Durable Objects
3. Create test utilities for mocking Clerk auth
4. Write unit tests for auth/utils.js

### Phase 2: Verify Existing Implementation
1. Write integration tests for POST /api/auth/apikeys
2. Write integration tests for GET /api/auth/apikeys
3. Write integration tests for DELETE /api/auth/apikeys/:keyId
4. Write integration tests for API key authentication in middleware
5. Verify max key limit (25) is enforced

### Phase 3: Key Reveal & Encryption
1. Generate API_KEY_ENCRYPTION_KEY secret (256-bit AES key)
2. Add encryption key to wrangler.toml secrets
3. Implement encryptApiKey() and decryptApiKey() in auth/utils.js
4. Update key creation to store key_encrypted alongside key_hash
5. Implement POST /api/auth/apikeys/:keyId/reveal endpoint
6. Add isSessionFresh() helper for fresh session validation
7. Write tests for reveal endpoint (fresh session, stale session, etc.)

### Phase 4: Fix Any Issues Found
1. Address any bugs discovered during testing
2. Implement any missing functionality identified by tests

### Phase 5: Production Rate Limiting (Durable Objects)
1. Create dedicated RateLimiter Durable Object class
2. Configure wrangler.toml with RATE_LIMITER binding
3. Implement DO identification scheme:
   - API keys: `env.RATE_LIMITER.idFromName('key:' + keyId)`
   - Users: `env.RATE_LIMITER.idFromName('user:' + userId)`
   - Anonymous: `env.RATE_LIMITER.idFromName('anon:' + ipAddress)`
4. Implement sliding window counter with 60-second TTL
5. Add rate limit check to authenticate middleware
6. Implement fail-closed behavior (503 on DO failure)
7. Handle concurrent request counting with DO transactions
8. Add rate limit tests for distributed scenarios

### Phase 6: Frontend UI
1. Design API key management interface at /settings/api-keys
2. Implement key creation form with name and expiration inputs
3. Implement key listing with masked display (last 4 chars visible)
4. Implement "Reveal Key" button with re-authentication flow
5. Implement key revocation with confirmation dialog

### Phase 7: Documentation
1. Update API.md with API key endpoints (including reveal)
2. Add API key usage examples (curl, fetch, SDKs)
3. Document security best practices
4. Document key reveal re-authentication requirement

---

## Security Considerations

1. **Keys hashed + encrypted**: Stored as SHA-256 hashes (for validation) and AES-256-GCM encrypted (for reveal)
2. **Reveal requires fresh auth**: Key reveal requires Clerk session < 5 minutes old
3. **Environment isolation**: Test keys can't be used in production
4. **Can't self-replicate**: API keys cannot create/list/revoke/reveal other API keys
5. **Rate limited**: 500 req/min per key prevents abuse
6. **Fail-closed rate limiting**: Requests denied if RateLimiter DO unavailable
7. **Expiration**: Max 5 years forces periodic review
8. **Revocable**: Keys can be immediately revoked
9. **User deletion**: Deleted users' keys are invalidated
10. **Usage tracking**: last_used_at updated even for failed auth attempts (security signal)

---

## Success Criteria

- [x] All design decisions finalized (13/13 resolved)
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Key reveal with fresh authentication works
- [ ] Rate limiting works in production environment (Durable Objects)
- [ ] Rate limiting fails closed on DO errors
- [ ] Frontend UI at /settings/api-keys is functional and secure
- [ ] Documentation is complete
