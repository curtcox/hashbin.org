# User Authorization Plan

## Overview

This document outlines the plan for implementing user authorization in HashBin.org. The system uses Clerk for OAuth authentication and custom API keys for programmatic access.

## Goals

1. Authenticate users via OAuth providers (Google, Apple, Microsoft, GitHub)
2. Generate and manage API keys for programmatic access
3. Protect endpoints that require authentication
4. Track user actions for billing and accountability
5. Maintain user privacy (minimal data collection)

---

## Architecture

### Authentication Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser   │───▶│    Clerk    │───▶│ Cloudflare      │───▶│  UserProfile    │
│   Client    │◀───│   OAuth     │◀───│ Worker          │◀───│  Durable Object │
└─────────────┘    └─────────────┘    └─────────────────┘    └─────────────────┘
```

### API Key Flow

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client    │───▶│ Cloudflare      │───▶│  UserProfile    │
│ (API Key)   │◀───│ Worker          │◀───│  Durable Object │
└─────────────┘    └─────────────────┘    └─────────────────┘
```

### Components

1. **Clerk SDK Integration** - OAuth provider management
2. **Auth Middleware** - Request validation and user context injection
3. **UserProfile Durable Object** - User data and API key storage
4. **API Key Manager** - Generation, validation, and revocation

---

## Authorization Levels

| Level | Description | Can Access |
|-------|-------------|------------|
| **Anonymous** | No authentication | `GET /`, `GET /health`, `GET /api/content/{hash}` |
| **Authenticated** | Valid Clerk session or API key | Upload content, view own uploads, manage API keys |
| **Payer** | Authenticated + has paid for specific content | View contester contact info for their content |
| **Admin** | Platform administrator | Moderate contests, view logs, manage users |

---

## Implementation Phases

### Phase 3.1: Clerk Integration

- [ ] Add Clerk SDK to dependencies
- [ ] Configure Clerk environment variables
- [ ] Implement session validation middleware
- [ ] Create `/api/auth/session` endpoint for session info
- [ ] Handle Clerk webhooks for user events

### Phase 3.2: User Profile Storage

- [ ] Implement UserProfile Durable Object methods
- [ ] Store user metadata from Clerk (id, provider, created_at)
- [ ] Track upload history per user
- [ ] Track payment history per user

### Phase 3.3: API Key System

- [ ] Generate cryptographically secure API keys
- [ ] Store API keys in UserProfile DO (hashed)
- [ ] Implement API key validation
- [ ] Create API key management endpoints
- [ ] Support multiple API keys per user
- [ ] Implement API key revocation

### Phase 3.4: Authorization Middleware

- [ ] Create middleware to extract auth from request
- [ ] Support both Clerk sessions and API keys
- [ ] Inject user context into request
- [ ] Protect endpoints based on authorization level

---

## API Endpoints

### Session Management

```
POST /api/auth/callback
  - Clerk OAuth callback handler
  - Creates/updates UserProfile DO entry
  - Returns session cookie

GET /api/auth/session
  - Returns current session info
  - Requires: Clerk session
  - Response: { user_id, provider, created_at }

POST /api/auth/logout
  - Invalidates Clerk session
  - Requires: Clerk session
```

### API Key Management

```
POST /api/auth/apikeys
  - Creates a new API key
  - Requires: Clerk session
  - Request: { name: string, expires_at?: timestamp }
  - Response: { key_id, api_key (shown once), name, created_at, expires_at }

GET /api/auth/apikeys
  - Lists user's API keys (without revealing key values)
  - Requires: Clerk session
  - Response: [{ key_id, name, created_at, expires_at, last_used_at }]

DELETE /api/auth/apikeys/{key_id}
  - Revokes an API key
  - Requires: Clerk session
```

### Protected Content Endpoints

```
POST /api/content
  - Upload content
  - Requires: Authenticated (Clerk session OR API key)
  - Links upload to user for billing

GET /api/content/{hash}
  - Download content
  - Requires: Anonymous (public access)
```

---

## Data Structures

### UserProfile Durable Object Schema

```javascript
{
  user_id: string,           // Clerk user ID
  provider: string,          // OAuth provider (google, apple, etc.)
  created_at: timestamp,
  updated_at: timestamp,

  api_keys: [
    {
      key_id: string,        // UUID for identification
      key_hash: string,      // SHA-256 hash of the API key
      name: string,          // User-provided description
      created_at: timestamp,
      expires_at: timestamp | null,
      last_used_at: timestamp | null,
      revoked_at: timestamp | null
    }
  ],

  uploads: [
    {
      content_hash: string,  // 256t hash
      uploaded_at: timestamp,
      size_bytes: number,
      payment_id: string     // Reference to PaymentRecord DO
    }
  ]
}
```

### API Key Format

```
hb_live_<32-character-random-string>
hb_test_<32-character-random-string>
```

- Prefix identifies environment (live/test)
- 32 characters of cryptographically random alphanumeric
- Total length: 40 characters

---

## Security Considerations

1. **API Key Storage**: Keys are hashed using SHA-256 before storage
2. **API Key Transmission**: Keys shown only once at creation time
3. **Session Security**: Clerk handles session tokens and CSRF protection
4. **Rate Limiting**: Applied per-user to prevent abuse
5. **Key Rotation**: Users can create new keys and revoke old ones
6. **Expiration**: Optional expiration dates for API keys

---

## Test Plan

### Unit Tests

#### Clerk Integration Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| CLERK-01 | Valid Clerk JWT is accepted | Valid JWT in Authorization header | Request proceeds with user context |
| CLERK-02 | Expired Clerk JWT is rejected | Expired JWT | 401 Unauthorized |
| CLERK-03 | Malformed Clerk JWT is rejected | Invalid JWT format | 401 Unauthorized |
| CLERK-04 | Missing Authorization header for protected route | No header | 401 Unauthorized |
| CLERK-05 | Clerk webhook creates new user profile | `user.created` webhook | UserProfile DO created |
| CLERK-06 | Clerk webhook updates existing user | `user.updated` webhook | UserProfile DO updated |
| CLERK-07 | Clerk webhook handles user deletion | `user.deleted` webhook | UserProfile DO marked deleted |

#### API Key Generation Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| KEYGEN-01 | Generate API key with valid session | Authenticated user, key name | New API key returned |
| KEYGEN-02 | Generated key has correct format | N/A | Key matches `hb_live_[a-zA-Z0-9]{32}` |
| KEYGEN-03 | Generated key is unique | Generate 1000 keys | All keys are unique |
| KEYGEN-04 | Key generation stores hash, not plaintext | Generate key | Only hash stored in DO |
| KEYGEN-05 | Generate key with expiration | `expires_at` in request | Key has expiration set |
| KEYGEN-06 | Generate key without expiration | No `expires_at` | Key has null expiration |
| KEYGEN-07 | Cannot generate key without authentication | No session | 401 Unauthorized |
| KEYGEN-08 | Key name is required | Empty name | 400 Bad Request |
| KEYGEN-09 | Key name length is validated | Name > 255 chars | 400 Bad Request |
| KEYGEN-10 | Maximum keys per user enforced | User at key limit | 400 Bad Request with limit message |

#### API Key Validation Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| KEYVAL-01 | Valid API key is accepted | Valid key in header | Request proceeds with user context |
| KEYVAL-02 | Non-existent API key is rejected | Unknown key | 401 Unauthorized |
| KEYVAL-03 | Revoked API key is rejected | Revoked key | 401 Unauthorized |
| KEYVAL-04 | Expired API key is rejected | Expired key | 401 Unauthorized |
| KEYVAL-05 | API key for deleted user is rejected | Key for deleted user | 401 Unauthorized |
| KEYVAL-06 | Malformed API key is rejected | Invalid format | 401 Unauthorized |
| KEYVAL-07 | Empty API key is rejected | Empty string | 401 Unauthorized |
| KEYVAL-08 | API key with wrong prefix is rejected | `wrong_prefix_xxx` | 401 Unauthorized |
| KEYVAL-09 | Test key rejected in production | `hb_test_xxx` in prod | 401 Unauthorized |
| KEYVAL-10 | Live key rejected in test environment | `hb_live_xxx` in test | 401 Unauthorized |
| KEYVAL-11 | `last_used_at` updated on successful validation | Valid key used | Timestamp updated |

#### API Key Management Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| KEYMGMT-01 | List keys shows all user's keys | Authenticated user | Array of key metadata |
| KEYMGMT-02 | List keys does not show key values | Authenticated user | No `api_key` field in response |
| KEYMGMT-03 | List keys shows revoked keys | User with revoked keys | Revoked keys included with status |
| KEYMGMT-04 | Revoke key marks it as revoked | Valid key_id | Key `revoked_at` set |
| KEYMGMT-05 | Cannot revoke another user's key | Other user's key_id | 404 Not Found |
| KEYMGMT-06 | Cannot revoke already-revoked key | Revoked key_id | 400 Bad Request |
| KEYMGMT-07 | Revoke non-existent key | Invalid key_id | 404 Not Found |

#### UserProfile Durable Object Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| UPDO-01 | Create new user profile | User data from Clerk | Profile stored successfully |
| UPDO-02 | Retrieve existing user profile | Valid user_id | Profile data returned |
| UPDO-03 | Update user profile | Updated user data | Profile updated |
| UPDO-04 | Delete user profile | Delete request | Profile marked as deleted |
| UPDO-05 | Add upload to user history | Upload record | Upload linked to user |
| UPDO-06 | Retrieve user's upload history | Valid user_id | List of uploads |
| UPDO-07 | User profile not found | Non-existent user_id | 404 Not Found |

#### Authorization Middleware Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| AUTHMW-01 | Anonymous access to public endpoint | No auth, GET / | 200 OK |
| AUTHMW-02 | Anonymous access to public content | No auth, GET /api/content/{hash} | 200 OK (if exists) |
| AUTHMW-03 | Anonymous access to protected endpoint | No auth, POST /api/content | 401 Unauthorized |
| AUTHMW-04 | Clerk session provides user context | Valid Clerk session | Request has `user` object |
| AUTHMW-05 | API key provides user context | Valid API key | Request has `user` object |
| AUTHMW-06 | Both auth methods present uses Clerk | Both provided | Clerk session takes precedence |
| AUTHMW-07 | Auth header with Bearer scheme | `Bearer <token>` | Parsed as Clerk JWT |
| AUTHMW-08 | Auth header with ApiKey scheme | `ApiKey <key>` | Parsed as API key |
| AUTHMW-09 | X-API-Key header accepted | `X-API-Key: <key>` | Parsed as API key |
| AUTHMW-10 | Invalid auth scheme rejected | `Basic <creds>` | 401 Unauthorized |

### Integration Tests

| Test ID | Test Case | Steps | Expected Outcome |
|---------|-----------|-------|------------------|
| INT-01 | Full OAuth login flow | 1. Redirect to Clerk 2. Complete OAuth 3. Callback received | User session created |
| INT-02 | Upload content with session | 1. Login 2. Upload content | Content stored, linked to user |
| INT-03 | Upload content with API key | 1. Create API key 2. Use key to upload | Content stored, linked to user |
| INT-04 | API key lifecycle | 1. Create key 2. Use key 3. Revoke key 4. Use revoked key | Steps 1-3 succeed, step 4 fails |
| INT-05 | Multiple API keys | 1. Create key A 2. Create key B 3. Use both | Both keys work independently |
| INT-06 | User deletion cascade | 1. Delete user in Clerk 2. Webhook received 3. Try API key | Webhook processed, key rejected |
| INT-07 | Session expiration | 1. Login 2. Wait for expiry 3. Make request | Request rejected after expiry |
| INT-08 | Concurrent key creation | Create 10 keys simultaneously | All keys created with unique IDs |
| INT-09 | Rate limiting per user | Exceed rate limit | 429 Too Many Requests |
| INT-10 | Cross-user isolation | User A cannot access User B's keys | 404 for other user's resources |

### Edge Case Tests

| Test ID | Test Case | Scenario | Expected Behavior |
|---------|-----------|----------|-------------------|
| EDGE-01 | Network failure during key creation | DO write fails mid-operation | Atomic rollback, error returned |
| EDGE-02 | Clerk service unavailable | Clerk API down | Graceful degradation, API keys still work |
| EDGE-03 | Key created at expiration boundary | `expires_at` = current time | Key immediately expired |
| EDGE-04 | Unicode in API key name | Emoji and special chars in name | Properly stored and displayed |
| EDGE-05 | Very long user ID from Clerk | 256+ character user ID | Handled correctly |
| EDGE-06 | Simultaneous key revocation | Same key revoked twice concurrently | One succeeds, one fails gracefully |
| EDGE-07 | Upload during user deletion | Upload while delete webhook processing | Upload fails or succeeds atomically |
| EDGE-08 | Clock skew with expiration | Server time differs from client | Server time is authoritative |
| EDGE-09 | API key with null bytes | Key containing `\x00` | Rejected as malformed |
| EDGE-10 | Header injection attempt | `Authorization: Bearer x\r\nX-Admin: true` | Parsed safely, no injection |

### Security Tests

| Test ID | Test Case | Attack Vector | Expected Protection |
|---------|-----------|---------------|---------------------|
| SEC-01 | Timing attack on key validation | Measure response time for valid vs invalid | Constant-time comparison |
| SEC-02 | Key enumeration | Brute force API keys | Rate limiting, no info leak |
| SEC-03 | JWT signature bypass | `alg: none` attack | Signature required |
| SEC-04 | Session fixation | Pre-set session token | Clerk prevents this |
| SEC-05 | CSRF on key creation | Cross-site request | CSRF token required |
| SEC-06 | XSS in key name | `<script>` in name | Output encoded |
| SEC-07 | SQL/NoSQL injection | Malicious user_id | Parameterized queries |
| SEC-08 | Key in URL parameter | `?api_key=xxx` | Keys only in headers |
| SEC-09 | Key logging prevention | Ensure keys not logged | Keys redacted in logs |
| SEC-10 | Webhook signature validation | Forged Clerk webhook | Signature verified |

---

## Open Questions

### Authentication

1. **Q: Should we support multiple OAuth accounts linking to one user?**
   - Example: User logs in with Google, later wants to add GitHub
   - Impact: UserProfile schema, Clerk configuration
   - Options: (a) No linking, separate accounts (b) Allow linking via Clerk

2. **Q: What happens if a user's OAuth provider account is deleted?**
   - Impact: User access, data retention
   - Options: (a) Keep HashBin account (b) Delete HashBin account (c) Mark as orphaned

3. **Q: Should we support anonymous uploads with payment only (no account)?**
   - Impact: User model, payment flow
   - Options: (a) Require account (b) Allow anonymous with payment token

### API Keys

4. **Q: What is the maximum number of API keys per user?**
   - Impact: Storage, abuse prevention
   - Suggested: 10-25 keys per user

5. **Q: What is the default/maximum API key expiration?**
   - Impact: Security, user experience
   - Options: (a) No default, user chooses (b) 1 year default, 2 year max

6. **Q: Should API keys have scopes/permissions?**
   - Example: Read-only key, upload-only key
   - Impact: API design, authorization logic
   - Options: (a) No scopes, full access (b) Scopes per key

7. **Q: Should API key names be unique per user?**
   - Impact: UX, key identification
   - Options: (a) Allow duplicates (b) Enforce uniqueness

### Rate Limiting

8. **Q: What are the rate limits per authorization level?**
   - Impact: Abuse prevention, legitimate use
   - Suggested limits:
     - Anonymous: 100 requests/minute
     - Authenticated: 1000 requests/minute
     - API key: 1000 requests/minute

9. **Q: Are rate limits per-user or per-API-key?**
   - Impact: Multi-key usage patterns
   - Options: (a) Per-user total (b) Per-key individual (c) Both with different limits

### Admin Access

10. **Q: How are admin users designated?**
    - Impact: Admin bootstrap, security
    - Options: (a) Clerk role (b) Env var whitelist (c) Separate admin auth

11. **Q: What admin operations require authentication vs 2FA?**
    - Impact: Security, operations friction
    - Examples: User deletion, contest resolution, system config

### Error Handling

12. **Q: What error details should be exposed for auth failures?**
    - Impact: Security, debugging
    - Options: (a) Generic "Unauthorized" (b) Specific reason codes

### Data Retention

13. **Q: How long do we keep records of revoked API keys?**
    - Impact: Storage, audit trail
    - Options: (a) Forever (b) 90 days (c) Until user deletion

14. **Q: What user data is retained after account deletion?**
    - Impact: Privacy, legal compliance
    - Options: (a) None (b) Anonymized records (c) Payment records only

---

## Dependencies

- **Phase 2 (Content Operations)**: Authorization depends on having content endpoints to protect
- **Clerk Account**: Must set up Clerk application before implementation
- **Environment Variables**:
  - `CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `CLERK_WEBHOOK_SECRET`

---

## Success Criteria

1. Users can authenticate via any supported OAuth provider
2. Users can generate, list, and revoke API keys
3. Protected endpoints reject unauthenticated requests
4. Both Clerk sessions and API keys provide equivalent access
5. All tests pass
6. Security audit reveals no critical vulnerabilities

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-13 | Claude | Initial draft |
