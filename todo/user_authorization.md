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

### Escalation Flow (Contests & DMCA)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Request   │───▶│  Automated  │───▶│     AI      │───▶│    Owner    │
│   Received  │    │  (No AI)    │    │   Review    │    │   Review    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                         │                  │                  │
                         ▼                  ▼                  ▼
                    Auto-resolve       AI-resolve        Manual decision
```

### Components

1. **Clerk SDK Integration** - OAuth provider management
2. **Auth Middleware** - Request validation and user context injection
3. **UserProfile Durable Object** - User data and API key storage
4. **API Key Manager** - Generation, validation, and revocation
5. **Escalation Engine** - Tiered processing for contests and DMCA

---

## Authorization Levels

| Level | Description | Can Access |
|-------|-------------|------------|
| **Anonymous** | No authentication | `GET /`, `GET /health`, `GET /api/content/{hash}` |
| **Authenticated** | Valid Clerk session or API key | Upload content, view own uploads, manage API keys, delete own account |
| **Payer** | Authenticated + has paid for specific content | View contester contact info for their content |

**Note**: There is no admin role. The system operates without administrative users. Contest moderation and DMCA requests are handled through a tiered automated escalation system (automated → AI → owner).

---

## Decisions

The following decisions have been made for this implementation:

### Authentication

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multiple OAuth account linking | **Yes, supported** | Users can link Google, Apple, Microsoft, GitHub to single account via Clerk |
| OAuth provider account deleted | **Keep HashBin account** | User retains access via other linked providers or can re-link |
| Anonymous uploads | **Not supported** | Account required for all uploads (simplifies billing and accountability) |

### API Keys

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Maximum keys per user | **25** | Sufficient for multiple integrations without enabling abuse |
| Default/maximum expiration | **5 years** | Long-lived for convenience; users can set shorter if desired |
| API key scopes | **No scopes, full access** | Simplicity; all keys have same permissions as user |
| Key name uniqueness | **Allow duplicates** | Users may want multiple keys with same purpose |

### Rate Limiting

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rate limits | **Anonymous: 100/min, Authenticated: 1000/min** | Prevents abuse while allowing legitimate use |
| Limit scope | **Both per-user AND per-key** | User has 1000/min total; each key has individual 500/min limit |

### Operations

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Admin users | **None** | System operates without admins; automated escalation handles moderation |
| 2FA requirement | **User self-deletion only** | Only action requiring extra verification is account deletion |

### Error Handling

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth error details | **Specific reason codes** | Helps debugging while using codes (not messages) to avoid info leaks |

### Data Retention

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Revoked key retention | **5 years** | Audit trail for security investigations |
| Post-deletion retention | **Payment records only** | Legal/financial compliance; all other data deleted |

### Moderation & Content

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contest moderation | **Automated escalation: No-AI → AI → Owner** | Three-tier system handles disputes without permanent admins |
| DMCA handling | **Automated escalation: No-AI → AI → Owner** | Same three-tier escalation for legal compliance |
| Orphaned accounts | **Content expires normally** | If user can't log in, content follows standard retention/expiration |
| Abuse/spam handling | **Rate limiting only** | Content is hash-only access (low discoverability); rate limits prevent abuse |

---

## Escalation System

The escalation system handles contests and DMCA requests without requiring admin users.

### Tier 1: Automated (No AI)

- Pattern matching for obvious cases (exact hash matches, known bad actors)
- Validation of required fields (valid email, proper format)
- Auto-reject malformed or incomplete requests
- Auto-approve clear-cut cases matching predefined rules

### Tier 2: AI Review

- Cases that don't match Tier 1 patterns are reviewed by AI
- AI evaluates evidence, compares claims, assesses validity
- AI can approve, reject, or escalate to owner
- All AI decisions are logged with reasoning

### Tier 3: Owner Review

- Complex cases requiring human judgment
- Edge cases where AI confidence is low
- Appeals of Tier 1 or Tier 2 decisions
- Owner receives notification and makes final decision

### Escalation States

| State | Description |
|-------|-------------|
| `PENDING_TIER1` | Awaiting automated processing |
| `PENDING_TIER2` | Awaiting AI review |
| `PENDING_TIER3` | Awaiting owner review |
| `APPROVED` | Request approved, action taken |
| `REJECTED` | Request rejected with reason |
| `EXPIRED` | No response within SLA, default action taken |

---

## Implementation Phases

### Phase 3.1: Clerk Integration

- [ ] Add Clerk SDK to dependencies
- [ ] Configure Clerk environment variables
- [ ] Implement session validation middleware
- [ ] Create `/api/auth/session` endpoint for session info
- [ ] Handle Clerk webhooks for user events
- [ ] Configure multi-provider account linking in Clerk

### Phase 3.2: User Profile Storage

- [ ] Implement UserProfile Durable Object methods
- [ ] Store user metadata from Clerk (id, linked providers, created_at)
- [ ] Track upload history per user
- [ ] Track payment history per user
- [ ] Support multiple linked OAuth providers per user

### Phase 3.3: API Key System

- [ ] Generate cryptographically secure API keys
- [ ] Store API keys in UserProfile DO (hashed)
- [ ] Implement API key validation
- [ ] Create API key management endpoints
- [ ] Support up to 25 API keys per user
- [ ] Implement API key revocation
- [ ] Set 5-year maximum expiration

### Phase 3.4: Authorization Middleware

- [ ] Create middleware to extract auth from request
- [ ] Support both Clerk sessions and API keys
- [ ] Inject user context into request
- [ ] Protect endpoints based on authorization level
- [ ] Implement rate limiting (per-user and per-key)

### Phase 3.5: Account Management

- [ ] Implement self-service account deletion
- [ ] Require 2FA confirmation for account deletion
- [ ] Retain payment records after deletion
- [ ] Delete all other user data on account deletion

### Phase 3.6: Escalation System (Note: May be Phase 6)

- [ ] Implement escalation state machine
- [ ] Build Tier 1 automated rules engine
- [ ] Integrate AI for Tier 2 review
- [ ] Build owner notification system
- [ ] Create escalation tracking and logging

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
  - Response: { user_id, providers: [], created_at }

POST /api/auth/logout
  - Invalidates Clerk session
  - Requires: Clerk session

POST /api/auth/link
  - Links additional OAuth provider to account
  - Requires: Clerk session
  - Handled by Clerk SDK

DELETE /api/auth/account
  - Deletes user account (requires 2FA)
  - Requires: Clerk session + 2FA confirmation
  - Retains: Payment records only
```

### API Key Management

```
POST /api/auth/apikeys
  - Creates a new API key
  - Requires: Clerk session
  - Request: { name: string, expires_at?: timestamp }
  - Constraints: max 25 keys, max 5 year expiration
  - Response: { key_id, api_key (shown once), name, created_at, expires_at }

GET /api/auth/apikeys
  - Lists user's API keys (without revealing key values)
  - Requires: Clerk session
  - Response: [{ key_id, name, created_at, expires_at, last_used_at, revoked }]

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
  providers: [               // Linked OAuth providers
    {
      provider: string,      // google, apple, microsoft, github
      provider_user_id: string,
      linked_at: timestamp
    }
  ],
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: timestamp | null,  // Soft delete for retention

  api_keys: [
    {
      key_id: string,        // UUID for identification
      key_hash: string,      // SHA-256 hash of the API key
      name: string,          // User-provided description (duplicates allowed)
      created_at: timestamp,
      expires_at: timestamp, // Max 5 years from creation
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

### Auth Error Codes

| Code | Description |
|------|-------------|
| `AUTH_MISSING` | No authentication provided |
| `AUTH_INVALID_FORMAT` | Malformed token or key |
| `AUTH_EXPIRED` | Token or key has expired |
| `AUTH_REVOKED` | API key has been revoked |
| `AUTH_USER_DELETED` | User account has been deleted |
| `AUTH_ENV_MISMATCH` | Test key in prod or vice versa |
| `AUTH_RATE_LIMITED` | Rate limit exceeded |
| `AUTH_KEY_LIMIT` | Maximum API keys reached |

---

## Security Considerations

1. **API Key Storage**: Keys are hashed using SHA-256 before storage
2. **API Key Transmission**: Keys shown only once at creation time
3. **Session Security**: Clerk handles session tokens and CSRF protection
4. **Rate Limiting**: Per-user (1000/min) and per-key (500/min) limits
5. **Key Rotation**: Users can create new keys and revoke old ones
6. **Expiration**: Maximum 5-year expiration on all API keys
7. **Account Deletion**: Requires 2FA confirmation
8. **Error Codes**: Specific codes without leaking sensitive details

---

## Test Plan

### Unit Tests

#### Clerk Integration Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| CLERK-01 | Valid Clerk JWT is accepted | Valid JWT in Authorization header | Request proceeds with user context |
| CLERK-02 | Expired Clerk JWT is rejected | Expired JWT | 401 with `AUTH_EXPIRED` |
| CLERK-03 | Malformed Clerk JWT is rejected | Invalid JWT format | 401 with `AUTH_INVALID_FORMAT` |
| CLERK-04 | Missing Authorization header for protected route | No header | 401 with `AUTH_MISSING` |
| CLERK-05 | Clerk webhook creates new user profile | `user.created` webhook | UserProfile DO created |
| CLERK-06 | Clerk webhook updates existing user | `user.updated` webhook | UserProfile DO updated |
| CLERK-07 | Clerk webhook handles user deletion | `user.deleted` webhook | UserProfile DO marked deleted |

#### Account Linking Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| LINK-01 | Link second OAuth provider | User with Google adds GitHub | Both providers in profile |
| LINK-02 | Link all four OAuth providers | Add Google, Apple, Microsoft, GitHub | All four providers linked |
| LINK-03 | Unlink provider with multiple linked | Remove one of several | Provider removed, others remain |
| LINK-04 | Cannot unlink last provider | Try to unlink only provider | 400 Bad Request (must have one) |
| LINK-05 | Login with any linked provider | User with Google+GitHub logs in via GitHub | Same user session |
| LINK-06 | Duplicate provider link rejected | Link Google twice | 400 Bad Request |
| LINK-07 | Provider already linked to other user | Link GitHub already on another account | 400 Bad Request with clear error |

#### API Key Generation Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| KEYGEN-01 | Generate API key with valid session | Authenticated user, key name | New API key returned |
| KEYGEN-02 | Generated key has correct format | N/A | Key matches `hb_live_[a-zA-Z0-9]{32}` |
| KEYGEN-03 | Generated key is unique | Generate 1000 keys | All keys are unique |
| KEYGEN-04 | Key generation stores hash, not plaintext | Generate key | Only hash stored in DO |
| KEYGEN-05 | Generate key with expiration | `expires_at` in request | Key has expiration set |
| KEYGEN-06 | Generate key without expiration | No `expires_at` | Key defaults to 5 year expiration |
| KEYGEN-07 | Cannot generate key without authentication | No session | 401 with `AUTH_MISSING` |
| KEYGEN-08 | Key name is required | Empty name | 400 Bad Request |
| KEYGEN-09 | Key name length is validated | Name > 255 chars | 400 Bad Request |
| KEYGEN-10 | Maximum 25 keys per user enforced | User at 25 keys | 400 with `AUTH_KEY_LIMIT` |
| KEYGEN-11 | Expiration beyond 5 years rejected | `expires_at` > 5 years | 400 Bad Request |
| KEYGEN-12 | Duplicate key names allowed | Create two keys with same name | Both keys created |
| KEYGEN-13 | Key 25 succeeds, key 26 fails | Create 26 keys | Keys 1-25 succeed, 26 fails |

#### API Key Validation Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| KEYVAL-01 | Valid API key is accepted | Valid key in header | Request proceeds with user context |
| KEYVAL-02 | Non-existent API key is rejected | Unknown key | 401 with `AUTH_INVALID_FORMAT` |
| KEYVAL-03 | Revoked API key is rejected | Revoked key | 401 with `AUTH_REVOKED` |
| KEYVAL-04 | Expired API key is rejected | Expired key | 401 with `AUTH_EXPIRED` |
| KEYVAL-05 | API key for deleted user is rejected | Key for deleted user | 401 with `AUTH_USER_DELETED` |
| KEYVAL-06 | Malformed API key is rejected | Invalid format | 401 with `AUTH_INVALID_FORMAT` |
| KEYVAL-07 | Empty API key is rejected | Empty string | 401 with `AUTH_MISSING` |
| KEYVAL-08 | API key with wrong prefix is rejected | `wrong_prefix_xxx` | 401 with `AUTH_INVALID_FORMAT` |
| KEYVAL-09 | Test key rejected in production | `hb_test_xxx` in prod | 401 with `AUTH_ENV_MISMATCH` |
| KEYVAL-10 | Live key rejected in test environment | `hb_live_xxx` in test | 401 with `AUTH_ENV_MISMATCH` |
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
| KEYMGMT-08 | Revoked keys retained for 5 years | Check after revocation | Key record still present |

#### UserProfile Durable Object Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| UPDO-01 | Create new user profile | User data from Clerk | Profile stored successfully |
| UPDO-02 | Retrieve existing user profile | Valid user_id | Profile data returned |
| UPDO-03 | Update user profile | Updated user data | Profile updated |
| UPDO-04 | Soft delete user profile | Delete request | Profile `deleted_at` set |
| UPDO-05 | Add upload to user history | Upload record | Upload linked to user |
| UPDO-06 | Retrieve user's upload history | Valid user_id | List of uploads |
| UPDO-07 | User profile not found | Non-existent user_id | 404 Not Found |
| UPDO-08 | Deleted profile returns deleted status | Query deleted user | 401 with `AUTH_USER_DELETED` |
| UPDO-09 | Multiple providers stored | User with 3 providers | All providers retrievable |

#### Account Deletion Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| DEL-01 | Delete account without 2FA fails | Delete request, no 2FA | 403 Forbidden |
| DEL-02 | Delete account with 2FA succeeds | Delete request + 2FA | Account marked deleted |
| DEL-03 | Payment records retained after deletion | Query after deletion | Payment records exist |
| DEL-04 | API keys invalidated after deletion | Use key after deletion | 401 with `AUTH_USER_DELETED` |
| DEL-05 | Upload history deleted | Query after deletion | No upload records |
| DEL-06 | User profile soft-deleted | Check DO after deletion | `deleted_at` timestamp set |
| DEL-07 | Cannot re-register with deleted email | Same OAuth after delete | New account created (not restored) |

#### Authorization Middleware Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| AUTHMW-01 | Anonymous access to public endpoint | No auth, GET / | 200 OK |
| AUTHMW-02 | Anonymous access to public content | No auth, GET /api/content/{hash} | 200 OK (if exists) |
| AUTHMW-03 | Anonymous access to protected endpoint | No auth, POST /api/content | 401 with `AUTH_MISSING` |
| AUTHMW-04 | Clerk session provides user context | Valid Clerk session | Request has `user` object |
| AUTHMW-05 | API key provides user context | Valid API key | Request has `user` object |
| AUTHMW-06 | Both auth methods present uses Clerk | Both provided | Clerk session takes precedence |
| AUTHMW-07 | Auth header with Bearer scheme | `Bearer <token>` | Parsed as Clerk JWT |
| AUTHMW-08 | Auth header with ApiKey scheme | `ApiKey <key>` | Parsed as API key |
| AUTHMW-09 | X-API-Key header accepted | `X-API-Key: <key>` | Parsed as API key |
| AUTHMW-10 | Invalid auth scheme rejected | `Basic <creds>` | 401 with `AUTH_INVALID_FORMAT` |

#### Rate Limiting Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| RATE-01 | Anonymous under limit succeeds | 99 requests/min | All succeed |
| RATE-02 | Anonymous at limit returns 429 | 101 requests/min | 101st returns 429 |
| RATE-03 | Authenticated under limit succeeds | 999 requests/min | All succeed |
| RATE-04 | Authenticated at limit returns 429 | 1001 requests/min | 1001st returns 429 |
| RATE-05 | Per-key limit enforced | 501 requests/min on one key | 501st returns 429 |
| RATE-06 | Multiple keys share user limit | 600 req on key A, 600 on key B | Some rejected (user limit 1000) |
| RATE-07 | Rate limit resets after window | Wait 1 minute | Requests succeed again |
| RATE-08 | Rate limit response includes retry-after | Exceed limit | Header `Retry-After` present |

#### Escalation System Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| ESC-01 | Malformed contest auto-rejected at Tier 1 | Missing required fields | State: `REJECTED`, reason logged |
| ESC-02 | Clear-cut contest auto-approved at Tier 1 | Exact hash match, valid claim | State: `APPROVED` |
| ESC-03 | Ambiguous contest escalates to Tier 2 | No pattern match | State: `PENDING_TIER2` |
| ESC-04 | AI approves contest at Tier 2 | AI confidence high, approve | State: `APPROVED`, AI reasoning logged |
| ESC-05 | AI rejects contest at Tier 2 | AI confidence high, reject | State: `REJECTED`, AI reasoning logged |
| ESC-06 | AI escalates to Tier 3 | AI confidence low | State: `PENDING_TIER3` |
| ESC-07 | Owner approves at Tier 3 | Owner clicks approve | State: `APPROVED` |
| ESC-08 | Owner rejects at Tier 3 | Owner clicks reject | State: `REJECTED` |
| ESC-09 | DMCA auto-validated at Tier 1 | Valid format, verified email | Proceeds to Tier 2 |
| ESC-10 | DMCA missing required fields rejected | Incomplete request | State: `REJECTED` |
| ESC-11 | DMCA escalates to owner | AI uncertain | State: `PENDING_TIER3` |
| ESC-12 | Escalation timeout defaults action | No response in SLA | State: `EXPIRED`, default action |
| ESC-13 | Appeal triggers re-review | User appeals Tier 1 decision | Re-enters at Tier 2 |
| ESC-14 | All escalation decisions logged | Any state transition | Full audit trail stored |

#### Orphaned Account Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| ORPH-01 | Single provider deleted, no other linked | Google account deleted, only provider | Account becomes inaccessible |
| ORPH-02 | Orphaned user content expires normally | Content with standard retention | Content expires per retention policy |
| ORPH-03 | Orphaned user cannot create new sessions | Try to log in | No valid provider, cannot auth |
| ORPH-04 | Orphaned user API keys still work until expiry | Use existing API key | Key works until expiration |
| ORPH-05 | New OAuth login creates new account | Same email, new registration | Fresh account created |

### Integration Tests

| Test ID | Test Case | Steps | Expected Outcome |
|---------|-----------|-------|------------------|
| INT-01 | Full OAuth login flow | 1. Redirect to Clerk 2. Complete OAuth 3. Callback received | User session created |
| INT-02 | Upload content with session | 1. Login 2. Upload content | Content stored, linked to user |
| INT-03 | Upload content with API key | 1. Create API key 2. Use key to upload | Content stored, linked to user |
| INT-04 | API key lifecycle | 1. Create key 2. Use key 3. Revoke key 4. Use revoked key | Steps 1-3 succeed, step 4 fails with `AUTH_REVOKED` |
| INT-05 | Multiple API keys | 1. Create key A 2. Create key B 3. Use both | Both keys work independently |
| INT-06 | User deletion cascade | 1. Delete account with 2FA 2. Try API key 3. Check payment records | Key rejected, payments retained |
| INT-07 | Session expiration | 1. Login 2. Wait for expiry 3. Make request | Request rejected with `AUTH_EXPIRED` |
| INT-08 | Concurrent key creation | Create 10 keys simultaneously | All keys created with unique IDs |
| INT-09 | Rate limiting per user | Exceed user rate limit | 429 with `AUTH_RATE_LIMITED` |
| INT-10 | Cross-user isolation | User A cannot access User B's keys | 404 for other user's resources |
| INT-11 | Link multiple providers | 1. Login Google 2. Link GitHub 3. Logout 4. Login GitHub | Same user session |
| INT-12 | Provider account deleted, other works | 1. Link Google+GitHub 2. Delete Google account 3. Login GitHub | Access maintained via GitHub |
| INT-13 | Full escalation flow - contest | 1. Submit contest 2. Tier 1 processes 3. Escalates 4. Owner decides | Contest resolved |
| INT-14 | Full escalation flow - DMCA | 1. Submit DMCA 2. Auto-validate 3. AI review 4. Content action | DMCA processed |

### Edge Case Tests

| Test ID | Test Case | Scenario | Expected Behavior |
|---------|-----------|----------|-------------------|
| EDGE-01 | Network failure during key creation | DO write fails mid-operation | Atomic rollback, error returned |
| EDGE-02 | Clerk service unavailable | Clerk API down | Graceful degradation, API keys still work |
| EDGE-03 | Key created at expiration boundary | `expires_at` = current time | Key immediately expired |
| EDGE-04 | Unicode in API key name | Emoji and special chars in name | Properly stored and displayed |
| EDGE-05 | Very long user ID from Clerk | 256+ character user ID | Handled correctly |
| EDGE-06 | Simultaneous key revocation | Same key revoked twice concurrently | One succeeds, one fails gracefully |
| EDGE-07 | Upload during user deletion | Upload while delete processing | Upload fails or succeeds atomically |
| EDGE-08 | Clock skew with expiration | Server time differs from client | Server time is authoritative |
| EDGE-09 | API key with null bytes | Key containing `\x00` | Rejected with `AUTH_INVALID_FORMAT` |
| EDGE-10 | Header injection attempt | `Authorization: Bearer x\r\nX-Admin: true` | Parsed safely, no injection |
| EDGE-11 | 25th key at exact limit | User has 24 keys, creates 25th | Succeeds, 26th fails |
| EDGE-12 | Key expires during request | Key expires mid-request | Request completes or fails atomically |
| EDGE-13 | Link provider during deletion | Link OAuth while delete in progress | One operation fails cleanly |
| EDGE-14 | Escalation during system maintenance | Submit while AI unavailable | Queued, processed when available |
| EDGE-15 | Owner unavailable for Tier 3 | Owner doesn't respond | SLA expires, default action taken |

### Security Tests

| Test ID | Test Case | Attack Vector | Expected Protection |
|---------|-----------|---------------|---------------------|
| SEC-01 | Timing attack on key validation | Measure response time for valid vs invalid | Constant-time comparison |
| SEC-02 | Key enumeration | Brute force API keys | Rate limiting, generic error codes |
| SEC-03 | JWT signature bypass | `alg: none` attack | Signature required |
| SEC-04 | Session fixation | Pre-set session token | Clerk prevents this |
| SEC-05 | CSRF on key creation | Cross-site request | CSRF token required |
| SEC-06 | XSS in key name | `<script>` in name | Output encoded |
| SEC-07 | SQL/NoSQL injection | Malicious user_id | Parameterized queries |
| SEC-08 | Key in URL parameter | `?api_key=xxx` | Keys only in headers |
| SEC-09 | Key logging prevention | Ensure keys not logged | Keys redacted in logs |
| SEC-10 | Webhook signature validation | Forged Clerk webhook | Signature verified |
| SEC-11 | 2FA bypass on deletion | Skip 2FA step | 403 Forbidden |
| SEC-12 | Delete other user's account | Attempt with wrong user_id | 403/404 (no access) |
| SEC-13 | Fake DMCA submission | Fraudulent takedown request | Email verification, audit trail |
| SEC-14 | Escalation manipulation | Try to skip tiers | Tier progression enforced |

---

## Escalation System Decisions

The following decisions have been made for the escalation system:

### Escalation Triggers

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tier 1 → Tier 2 triggers | **All conditions apply** | Escalate when: (a) no pattern match in rule set, (b) confidence score below threshold, OR (c) specific content types flag for AI review |
| Tier 2 → Tier 3 triggers | **All conditions apply** | Escalate when: (a) AI confidence below threshold, (b) AI explicitly flags "needs human review", (c) content value above threshold, OR (d) user requests human review |

### Notification & SLAs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Owner notification method | **Webhook** | External webhook integration allows flexible routing to owner's preferred notification system |
| Tier 1 SLA | **Immediate** | Automated processing completes in milliseconds |
| Tier 2 SLA | **Hours** | AI review should complete within hours; allows for retries and queue processing |
| Tier 3 SLA | **Days** | Owner review is async; provides reasonable time for manual human review |

### Timeout & Appeals

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default action on SLA expiry | **No action** | If owner doesn't respond within SLA, no action is taken; content status remains unchanged |
| Appeal process | **Next tier** | One appeal allowed per decision; appeals escalate to the next tier for re-review |

### AI Service

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI service for Tier 2 | **OpenRouter** | OpenRouter provides access to multiple models with a unified API; allows flexibility in model selection |

---

## Open Questions

No open questions remain. All decisions have been made.

---

## Dependencies

- **Phase 2 (Content Operations)**: Authorization depends on having content endpoints to protect
- **Clerk Account**: Must set up Clerk application before implementation
- **AI Service**: OpenRouter API for Tier 2 escalation
- **Environment Variables**:
  - `CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `CLERK_WEBHOOK_SECRET`
  - `OPENROUTER_API_KEY` (for Tier 2)
  - `OWNER_NOTIFICATION_EMAIL`

---

## Success Criteria

1. Users can authenticate via any supported OAuth provider
2. Users can link multiple OAuth providers to one account
3. Users can generate, list, and revoke up to 25 API keys
4. Protected endpoints reject unauthenticated requests with specific error codes
5. Both Clerk sessions and API keys provide equivalent access
6. Rate limiting works at both per-user and per-key levels
7. Account deletion requires 2FA and retains only payment records
8. Escalation system processes contests and DMCA requests through all tiers
9. Orphaned accounts have content expire normally
10. All tests pass
11. Security audit reveals no critical vulnerabilities

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-13 | Claude | Initial draft |
| 0.2 | 2026-01-13 | Claude | Added decisions, removed admin role, added account linking |
| 0.3 | 2026-01-13 | Claude | Added escalation system, orphaned account handling, new tests |
| 0.4 | 2026-01-13 | Claude | Resolved all escalation open questions |
