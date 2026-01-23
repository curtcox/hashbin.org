# Add Missing Tests to CI

## Overview

This document plans the implementation of tests that were designed in planning documents but never written, and the integration of existing tests into CI. Tests need to be checked for continued correctness and relevance.

**Status:** Planning
**Created:** 2026-01-23
**Updated:** 2026-01-23

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | JavaScript Unit Test Framework | **Vitest** - Keep multiple separate test types |
| 2 | Test Priority | **Security tests first** |
| 3 | CI Workflow Organization | **Add tests to existing workflows** |
| 4 | Test Environment Secrets | **Use mocks** for Clerk/Stripe |
| 5 | Relevance Verification | **Flag tests for clarification** during development when drift detected |
| 6 | Coverage Targets | **No target** - any improvement is good |

---

## Tests Flagged for Drift

The following tests have specifications that may not match current implementation. These should be verified against actual code before implementation.

### Critical Drift: API Key Format

| Test ID | Planned Spec | Actual Implementation | Action Required |
|---------|--------------|----------------------|-----------------|
| KEYGEN-02 | 40 character key | `hb_` prefix + 32 chars = **35 chars** | **UPDATE TEST SPEC** |

**Details:** `src/auth/utils.js:9` defines `API_KEY_LENGTH = 32` with prefix `hb_`, resulting in 35-character keys, not 40.

### Critical Drift: Pricing Calculator

| Test ID | Planned Spec | Actual Implementation | Action Required |
|---------|--------------|----------------------|-----------------|
| PRICE-01 | 1 GB × 1 month = $0.03 | Has **$2.00 minimum** (`MINIMUM_RETENTION_COST_CENTS = 200`) | **ADD NEW TESTS** |
| PRICE-* | Simple calculation | **Inline content (≤64 bytes) is FREE** | **ADD NEW TESTS** |

**Details:** `src/utils/pricing.js:18-19` defines `INLINE_CONTENT_THRESHOLD = 64` and `MINIMUM_RETENTION_COST_CENTS = 200`.

**New tests needed:**
- `PRICE-19`: Inline content (≤64 bytes) returns cost of 0
- `PRICE-20`: Content >64 bytes has minimum cost of $2.00
- `PRICE-21`: Small content (e.g., 1KB for 1 month) returns $2.00 minimum, not calculated rate

### Possible Drift: Key Reveal

| Test ID | Planned Spec | Actual Implementation | Action Required |
|---------|--------------|----------------------|-----------------|
| REVEAL-* | Reveal endpoint with rate limiting | `isSessionFresh()` exists but **verify endpoint exists** | **VERIFY** |

**Details:** `src/auth/utils.js:304-317` has `isSessionFresh()` function. Need to verify the reveal endpoint is implemented in `src/api/auth.js`.

### Possible Drift: Key Name Required

| Test ID | Planned Spec | Actual Implementation | Action Required |
|---------|--------------|----------------------|-----------------|
| KEYGEN-08 | Key name is required | **Empty names allowed** (uses smart default) | **UPDATE TEST SPEC** |

**Details:** `src/auth/utils.js:142-149` explicitly allows empty names: "Empty name is allowed - will use smart default".

### Verified Matches (No Drift)

| Test Category | Planned Spec | Actual Implementation | Status |
|---------------|--------------|----------------------|--------|
| RATE-01/02 | 100 req/min anonymous | `ANONYMOUS_RATE_LIMIT = 100` | MATCHES |
| RATE-03/04 | 1000 req/min authenticated | `USER_RATE_LIMIT = 1000` | MATCHES |
| RATE-05 | 500 req/min per-key | `KEY_RATE_LIMIT = 500` | MATCHES |
| ENCRYPT-* | AES-256-GCM encryption | `encryptApiKey()` uses AES-GCM with 12-byte IV | MATCHES |
| KEYGEN-06 | Default 5 year expiration | `validateExpiration()` defaults to 5 years | MATCHES |
| KEYGEN-09 | 255 char name limit | `validateKeyName()` checks `name.length > 255` | MATCHES |

---

## Summary of Test Gaps

### 1. Unit Tests (JavaScript) - NOT IMPLEMENTED

Multiple planning documents specify JavaScript unit tests (`.test.js` files) that were never created. The project currently has only shell-based integration/API tests.

**Missing Test Files:**
- `src/auth/utils.test.js` - API key generation/validation unit tests
- `src/api/auth.test.js` - Authentication endpoint integration tests
- `src/auth/middleware.test.js` - Middleware authentication tests
- `src/utils/pricing.test.js` - Pricing calculator tests
- `src/durable-objects/key-registry.test.js` - KeyRegistry DO tests
- `src/durable-objects/user-profile.test.js` - UserProfile DO tests

### 2. Shell-Based Tests - EXIST BUT NEED CI VERIFICATION

Existing tests that may not be fully integrated into CI:
- `scripts/api-tests/*` - 11 test suites (claimed 138 tests)
- `scripts/validation/*` - 12 test suites (89 tests documented)
- `scripts/test-*.sh` - Various standalone test scripts

### 3. Manual Tests - NOT AUTOMATED

- `todo/manual_testing_guide.md` - OAuth and account management tests that require Clerk

---

## Detailed Test Inventory

### Category A: Unit Tests from api_keys.md (NOT IMPLEMENTED)

These were specified but never created as JavaScript test files.

#### A1. Key Generation & Validation Tests (33 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| KEYGEN-01 | Generate API key with correct production prefix | P0 | Not Implemented | OK |
| KEYGEN-02 | Generated key has correct format (35 chars) | P0 | Not Implemented | **UPDATED** |
| KEYGEN-03 | Generated key is unique (1000 keys test) | P1 | Not Implemented | OK |
| KEYGEN-04 | Key generation stores hash, not plaintext | P0 | Not Implemented | OK |
| KEYGEN-05 | Generate key with custom expiration | P1 | Not Implemented | OK |
| KEYGEN-06 | Generate key defaults to 5 year expiration | P1 | Not Implemented | OK |
| KEYGEN-07 | Cannot generate key without authentication | P0 | Not Implemented | OK |
| KEYGEN-08 | Empty key name uses smart default | P1 | Not Implemented | **UPDATED** |
| KEYGEN-09 | Key name length validation (>255 chars) | P2 | Not Implemented | OK |
| KEYGEN-10 | Maximum 25 keys per user enforced | P0 | Not Implemented | VERIFY |
| KEYGEN-11 | Expiration beyond 5 years rejected | P1 | Not Implemented | OK |
| KEYGEN-12 | Duplicate key names allowed | P2 | Not Implemented | OK |
| KEYGEN-13 | Key 25 succeeds, key 26 fails | P1 | Not Implemented | VERIFY |
| KEYVAL-01 | Valid API key is accepted | P0 | Not Implemented | OK |
| KEYVAL-02 | Non-existent API key is rejected | P0 | Not Implemented | OK |
| KEYVAL-03 | Revoked API key is rejected | P0 | Not Implemented | OK |
| KEYVAL-04 | Expired API key is rejected | P0 | Not Implemented | OK |
| KEYVAL-05 | API key for deleted user is rejected | P1 | Not Implemented | OK |
| KEYVAL-06 | Malformed API key is rejected | P0 | Not Implemented | OK |
| KEYVAL-07 | Empty API key is rejected | P0 | Not Implemented | OK |
| KEYVAL-08 | API key with wrong prefix is rejected | P0 | Not Implemented | OK |
| KEYVAL-09 | Legacy hb_test_ prefix handled | P0 | Not Implemented | **NEW** |
| KEYVAL-10 | Legacy hb_live_ prefix handled | P0 | Not Implemented | **NEW** |
| KEYVAL-11 | last_used_at updated on successful validation | P2 | Not Implemented | OK |
| KEYMGMT-01 | List keys shows all user's keys | P0 | Not Implemented | OK |
| KEYMGMT-02 | List keys does not show key values | P0 | Not Implemented | OK |
| KEYMGMT-03 | List keys shows revoked keys | P1 | Not Implemented | OK |
| KEYMGMT-04 | Revoke key marks it as revoked | P0 | Not Implemented | OK |
| KEYMGMT-05 | Cannot revoke another user's key | P0 | Not Implemented | OK |
| KEYMGMT-06 | Cannot revoke already-revoked key | P2 | Not Implemented | OK |
| KEYMGMT-07 | Revoke non-existent key returns 404 | P1 | Not Implemented | OK |
| KEYMGMT-08 | Revoked keys retained for 5 years | P2 | Not Implemented | OK |
| ENCRYPT-01 | Encrypt API key with AES-256-GCM | P1 | Not Implemented | OK |
| ENCRYPT-02 | Decrypt API key successfully | P1 | Not Implemented | OK |
| ENCRYPT-03 | Decryption fails with wrong key | P1 | Not Implemented | OK |
| ENCRYPT-04 | Each encryption uses unique IV | P1 | Not Implemented | OK |
| ENCRYPT-05 | Encrypted output is base64 encoded | P1 | Not Implemented | OK |

#### A2. API Key Reveal Tests (12 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| REVEAL-01 | Reveal with fresh session succeeds | P0 | Not Implemented | VERIFY |
| REVEAL-02 | Reveal with stale session (>5 min) rejected | P0 | Not Implemented | VERIFY |
| REVEAL-03 | Reveal with API key authentication rejected | P0 | Not Implemented | VERIFY |
| REVEAL-04 | Reveal revoked key rejected | P1 | Not Implemented | VERIFY |
| REVEAL-05 | Reveal non-existent key returns 404 | P1 | Not Implemented | VERIFY |
| REVEAL-06 | Reveal other user's key returns 404 | P0 | Not Implemented | VERIFY |
| REVEAL-07 | Rate limit (3 per hour) enforced | P1 | Not Implemented | VERIFY |
| REVEAL-08 | Rate limit resets after hour | P1 | Not Implemented | VERIFY |
| REVEAL-09 | Rate limit per key not per user | P2 | Not Implemented | VERIFY |
| REVEAL-10 | Revealed key matches original | P0 | Not Implemented | VERIFY |
| REVEAL-11 | Reveal requires fresh Clerk session | P0 | Not Implemented | VERIFY |
| REVEAL-12 | Encryption uses unique IV each time | P1 | Not Implemented | OK |

### Category B: Unit Tests from user_authorization.md (NOT IMPLEMENTED)

#### B1. Clerk Integration Tests (7 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| CLERK-01 | Valid Clerk JWT is accepted | P0 | Not Implemented | OK |
| CLERK-02 | Expired Clerk JWT is rejected | P0 | Not Implemented | OK |
| CLERK-03 | Malformed Clerk JWT is rejected | P0 | Not Implemented | OK |
| CLERK-04 | Missing Authorization header for protected route | P0 | Not Implemented | OK |
| CLERK-05 | Clerk webhook creates new user profile | P1 | Not Implemented | VERIFY |
| CLERK-06 | Clerk webhook updates existing user | P1 | Not Implemented | VERIFY |
| CLERK-07 | Clerk webhook handles user deletion | P1 | Not Implemented | VERIFY |

#### B2. UserProfile Durable Object Tests (9 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| UPDO-01 | Create new user profile | P0 | Not Implemented | OK |
| UPDO-02 | Retrieve existing user profile | P0 | Not Implemented | OK |
| UPDO-03 | Update user profile | P1 | Not Implemented | OK |
| UPDO-04 | Soft delete user profile | P1 | Not Implemented | OK |
| UPDO-05 | Add upload to user history | P1 | Not Implemented | OK |
| UPDO-06 | Retrieve user's upload history | P1 | Not Implemented | OK |
| UPDO-07 | User profile not found returns 404 | P1 | Not Implemented | OK |
| UPDO-08 | Deleted profile returns AUTH_USER_DELETED | P0 | Not Implemented | OK |
| UPDO-09 | Multiple providers stored correctly | P2 | Not Implemented | VERIFY |

#### B3. Authorization Middleware Tests (10 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| AUTHMW-01 | Anonymous access to public endpoint | P0 | Not Implemented | OK |
| AUTHMW-02 | Anonymous access to public content | P0 | Not Implemented | OK |
| AUTHMW-03 | Anonymous access to protected endpoint rejected | P0 | Not Implemented | OK |
| AUTHMW-04 | Clerk session provides user context | P0 | Not Implemented | OK |
| AUTHMW-05 | API key provides user context | P0 | Not Implemented | OK |
| AUTHMW-06 | Both auth methods present uses Clerk | P2 | Not Implemented | VERIFY |
| AUTHMW-07 | Auth header with Bearer scheme | P1 | Not Implemented | OK |
| AUTHMW-08 | Auth header with ApiKey scheme | P1 | Not Implemented | OK |
| AUTHMW-09 | X-API-Key header accepted | P0 | Not Implemented | OK |
| AUTHMW-10 | Invalid auth scheme rejected | P1 | Not Implemented | OK |
| AUTHMW-11 | LocalDev auth scheme in local mode | P1 | Not Implemented | **NEW** |

#### B4. Rate Limiting Tests (8 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| RATE-01 | Anonymous under limit succeeds (99 req/min) | P0 | Not Implemented | OK |
| RATE-02 | Anonymous at limit returns 429 (101 req/min) | P0 | Not Implemented | OK |
| RATE-03 | Authenticated under limit succeeds (999 req/min) | P1 | Not Implemented | OK |
| RATE-04 | Authenticated at limit returns 429 (1001 req/min) | P1 | Not Implemented | OK |
| RATE-05 | Per-key limit enforced (501 req/min) | P1 | Not Implemented | OK |
| RATE-06 | Multiple keys share user limit | P2 | Not Implemented | VERIFY |
| RATE-07 | Rate limit resets after window | P1 | Not Implemented | OK |
| RATE-08 | Rate limit response includes retry-after | P1 | Not Implemented | OK |

#### B5. Integration Tests (10 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| INT-01 | Full OAuth login flow | P0 | Not Implemented | MOCK |
| INT-02 | Upload content with session | P0 | Not Implemented | MOCK |
| INT-03 | Upload content with API key | P0 | Not Implemented | OK |
| INT-04 | API key lifecycle (create, use, revoke) | P0 | Not Implemented | OK |
| INT-05 | Multiple API keys work independently | P1 | Not Implemented | OK |
| INT-07 | Session expiration handling | P1 | Not Implemented | MOCK |
| INT-08 | Concurrent key creation | P2 | Not Implemented | OK |
| INT-09 | Rate limiting per user | P1 | Not Implemented | OK |
| INT-10 | Cross-user isolation | P0 | Not Implemented | OK |

#### B6. Edge Case Tests (12 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| EDGE-01 | Network failure during key creation | P1 | Not Implemented | MOCK |
| EDGE-02 | Clerk service unavailable | P1 | Not Implemented | MOCK |
| EDGE-03 | Key created at expiration boundary | P2 | Not Implemented | OK |
| EDGE-04 | Unicode in API key name | P2 | Not Implemented | OK |
| EDGE-05 | Very long user ID from Clerk | P2 | Not Implemented | OK |
| EDGE-06 | Simultaneous key revocation | P2 | Not Implemented | OK |
| EDGE-08 | Clock skew with expiration | P2 | Not Implemented | OK |
| EDGE-09 | API key with null bytes | P1 | Not Implemented | OK |
| EDGE-10 | Header injection attempt | P0 | Not Implemented | OK |
| EDGE-11 | 25th key at exact limit | P1 | Not Implemented | VERIFY |
| EDGE-12 | Key expires during request | P2 | Not Implemented | OK |

#### B7. Security Tests (10 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| SEC-01 | Timing attack on key validation | P0 | Not Implemented | OK |
| SEC-02 | Key enumeration prevention | P0 | Not Implemented | OK |
| SEC-03 | JWT signature bypass (alg:none) | P0 | Not Implemented | MOCK |
| SEC-04 | Session fixation prevention | P1 | Not Implemented | MOCK |
| SEC-05 | CSRF on key creation | P1 | Not Implemented | OK |
| SEC-06 | XSS in key name | P0 | Not Implemented | OK |
| SEC-07 | SQL/NoSQL injection in user_id | P0 | Not Implemented | OK |
| SEC-08 | Key in URL parameter rejected | P1 | Not Implemented | VERIFY |
| SEC-09 | Key logging prevention | P1 | Not Implemented | OK |
| SEC-10 | Webhook signature validation | P0 | Not Implemented | OK |

### Category C: Unit Tests from payments.md (NOT IMPLEMENTED)

#### C1. Pricing Calculator Tests (21 tests - updated)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| PRICE-01 | Calculate cost for 1 GB for 1 month | P0 | Not Implemented | **UPDATED** |
| PRICE-02 | Calculate cost for 10 GB for 1 month | P0 | Not Implemented | OK |
| PRICE-03 | Calculate cost for 1 GB for 12 months | P0 | Not Implemented | OK |
| PRICE-04 | Calculate cost for 100 GB for 6 months ($18.00) | P0 | Not Implemented | OK |
| PRICE-05 | Handle 500 MB for 1 month (minimum applies) | P1 | Not Implemented | **UPDATED** |
| PRICE-06 | Calculate Stripe fee (2.9% + $0.30) | P0 | Not Implemented | OK |
| PRICE-07 | Calculate net deposit after fees | P0 | Not Implemented | OK |
| PRICE-08 | Handle $1.00 deposit fee calculation | P0 | Not Implemented | OK |
| PRICE-09 | Handle 0 bytes (returns 0 - inline) | P1 | Not Implemented | **UPDATED** |
| PRICE-10 | Handle negative size (error) | P1 | Not Implemented | OK |
| PRICE-11 | Handle extremely large size (1 PB) | P2 | Not Implemented | OK |
| PRICE-12 | Handle 0 months (error) | P1 | Not Implemented | OK |
| PRICE-13 | Handle negative months (error) | P1 | Not Implemented | OK |
| PRICE-14 | Handle very long durations (100 years) | P2 | Not Implemented | OK |
| PRICE-15 | Round final price to nearest cent | P0 | Not Implemented | OK |
| PRICE-16 | Avoid floating point errors | P0 | Not Implemented | OK |
| PRICE-17 | Use integer cents internally | P0 | Not Implemented | OK |
| PRICE-18 | Calculate minimum cost for file size | P0 | Not Implemented | OK |
| PRICE-19 | Inline content (≤64 bytes) returns cost of 0 | P0 | Not Implemented | **NEW** |
| PRICE-20 | Content >64 bytes has minimum cost of $2.00 | P0 | Not Implemented | **NEW** |
| PRICE-21 | Small content returns $2.00 minimum | P0 | Not Implemented | **NEW** |

#### C2. Balance Operations Tests (12 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| BAL-01 | Credit balance on successful deposit | P0 | Not Implemented | OK |
| BAL-02 | Record transaction with before/after balance | P0 | Not Implemented | OK |
| BAL-03 | Update total_deposited_cents | P1 | Not Implemented | VERIFY |
| BAL-04 | Handle multiple deposits correctly | P1 | Not Implemented | OK |
| BAL-05 | Debit balance on successful upload | P0 | Not Implemented | OK |
| BAL-06 | Update total_spent_cents | P1 | Not Implemented | VERIFY |
| BAL-07 | Reject if balance insufficient | P0 | Not Implemented | OK |
| BAL-08 | Return 0 for new users | P0 | Not Implemented | OK |
| BAL-09 | Never return negative balance | P0 | Not Implemented | OK |
| BAL-10 | Handle concurrent deposits | P1 | Not Implemented | OK |
| BAL-11 | Prevent race conditions (double-spend) | P0 | Not Implemented | OK |
| BAL-12 | Serialize balance modifications | P1 | Not Implemented | OK |

#### C3. Upload Payment Validation Tests (12 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| UPPAY-01 | Allow upload when balance >= cost | P0 | Not Implemented | OK |
| UPPAY-02 | Allow upload when balance exactly equals cost | P1 | Not Implemented | OK |
| UPPAY-03 | Allow upload with balance > 30-day minimum | P0 | Not Implemented | OK |
| UPPAY-04 | Reject when balance < 30-day minimum cost | P0 | Not Implemented | OK |
| UPPAY-05 | Reject when balance < requested retention cost | P0 | Not Implemented | OK |
| UPPAY-06 | Return detailed rejection message | P0 | Not Implemented | OK |
| UPPAY-07 | Include required_cents in response | P1 | Not Implemented | OK |
| UPPAY-08 | Include balance_cents in response | P1 | Not Implemented | OK |
| UPPAY-09 | Include deposit_url in response | P1 | Not Implemented | VERIFY |
| UPPAY-10 | Format rejection message correctly | P1 | Not Implemented | OK |
| UPPAY-11 | Handle very large files correctly | P1 | Not Implemented | OK |
| UPPAY-12 | Handle very long retention correctly | P1 | Not Implemented | OK |

#### C4. Stripe Webhook Handler Tests (15 tests)

| Test ID | Test Name | Priority | Status | Drift? |
|---------|-----------|----------|--------|--------|
| STRIPE-01 | Accept valid Stripe signature | P0 | Not Implemented | MOCK |
| STRIPE-02 | Reject missing signature header | P0 | Not Implemented | MOCK |
| STRIPE-03 | Reject invalid signature | P0 | Not Implemented | MOCK |
| STRIPE-04 | Reject expired signature | P1 | Not Implemented | MOCK |
| STRIPE-05 | Reject replayed webhook (duplicate event ID) | P0 | Not Implemented | OK |
| STRIPE-06 | checkout.session.completed credits balance | P0 | Not Implemented | OK |
| STRIPE-07 | Record transaction with before/after balance | P0 | Not Implemented | OK |
| STRIPE-08 | Webhook is idempotent | P0 | Not Implemented | OK |
| STRIPE-09 | checkout.session.completed extends CID | P0 | Not Implemented | OK |
| STRIPE-10 | Handle anonymous donations | P1 | Not Implemented | OK |
| STRIPE-11 | checkout.session.expired does not affect balance | P1 | Not Implemented | OK |
| STRIPE-12 | charge.dispute.created flags account | P1 | Not Implemented | VERIFY |
| STRIPE-13 | Return 400 for malformed JSON | P1 | Not Implemented | OK |
| STRIPE-14 | Return 200 for unknown event types | P1 | Not Implemented | OK |
| STRIPE-15 | Log errors securely | P1 | Not Implemented | OK |

### Category D: Existing Shell-Based Tests (NEED CI VERIFICATION)

#### D1. Local API Tests (scripts/api-tests/)

These tests exist but need verification they run in CI properly.

| Test Suite | File | Tests | CI Status |
|------------|------|-------|-----------|
| Health & Configuration | test-local-health.sh | 10 | Check |
| Authentication | test-local-auth.sh | ~31 | Check |
| Balance | test-local-balance.sh | 10 | Check |
| Upload | test-local-upload.sh | ~35 | Check |
| Download | test-local-download.sh | ~16 | Check |
| Rate Limit Purchase | test-local-ratelimit-purchase.sh | 10 | Check |
| Content Extension | test-local-extension.sh | 6 | Check |
| User Data | test-local-user.sh | 5 | Check |
| Donation | test-local-donation.sh | 4 | Check |
| Error Handling | test-local-errors.sh | 6 | Check |
| Concurrent Operations | test-local-concurrent.sh | 4 | Check |

**Total: ~137 tests across 11 suites**

#### D2. Deployment Validation Tests (scripts/validation/)

| Test Suite | File | Tests | CI Status |
|------------|------|-------|-----------|
| Infrastructure | test-infrastructure.sh | 10 | Check |
| Frontend | test-frontend.sh | 15 | Check |
| Public API | test-public-api.sh | 10 | Check |
| Auth Boundaries | test-auth-boundaries.sh | 13 | Check |
| Error Handling | test-error-handling.sh | 7 | Check |
| Content Integrity | test-content-integrity.sh | 5 | Check |
| Security | test-security.sh | 5 | Check |
| Performance | test-performance.sh | 7 | Check |
| Webhooks | test-webhooks.sh | 4 | Check |
| Edge | test-edge.sh | 3 | Check |
| API Keys | test-api-keys.sh | 6 | Check |
| Rate Limiting | test-rate-limiting.sh | 4 | Check |

**Total: 89 tests across 12 suites**

#### D3. Standalone Test Scripts

| Script | Purpose | CI Status |
|--------|---------|-----------|
| test-auth-system.sh | Auth system validation | Check |
| test-api-keys.sh | API key feature tests (21 tests) | Check |
| test-stripe-webhook.sh | Stripe webhook tests | Check |
| test-auth-gate.sh | Auth gate tests | Check |
| test-git-sha-injection.sh | Git SHA verification | Check |
| test-local-mode.sh | Local mode tests | Check |
| test-rate-limiting.sh | Rate limiting tests | Check |
| test-transaction-history.sh | Transaction history tests | Check |
| test-upload-balance.sh | Upload balance tests | Check |
| test-user-balance.sh | User balance tests | Check |

---

## Implementation Plan

### Phase 1: Set Up Vitest Infrastructure

1. Install Vitest and dependencies
   ```bash
   npm install -D vitest @cloudflare/vitest-pool-workers
   ```
2. Create `vitest.config.js` for Cloudflare Workers
3. Create mock utilities for Clerk and Stripe
4. Add npm scripts: `npm test`, `npm run test:unit`
5. Configure `.github/workflows/local-api-tests.yml` to include unit tests

### Phase 2: Implement P0 Security Tests (First Priority)

Tests to implement in order:

| # | Test ID | File | Description |
|---|---------|------|-------------|
| 1 | SEC-01 | `src/auth/middleware.test.js` | Timing attack on key validation |
| 2 | SEC-02 | `src/auth/middleware.test.js` | Key enumeration prevention |
| 3 | SEC-03 | `src/auth/middleware.test.js` | JWT signature bypass (alg:none) - mocked |
| 4 | SEC-06 | `src/auth/utils.test.js` | XSS in key name |
| 5 | SEC-07 | `src/durable-objects/user-profile.test.js` | NoSQL injection in user_id |
| 6 | SEC-10 | `src/api/payments.test.js` | Webhook signature validation - mocked |
| 7 | STRIPE-01 | `src/api/payments.test.js` | Accept valid Stripe signature - mocked |
| 8 | STRIPE-02 | `src/api/payments.test.js` | Reject missing signature - mocked |
| 9 | STRIPE-03 | `src/api/payments.test.js` | Reject invalid signature - mocked |
| 10 | STRIPE-05 | `src/api/payments.test.js` | Reject replayed webhook |

### Phase 3: Implement P0 Pricing Tests

Tests to implement:

| # | Test ID | File | Description |
|---|---------|------|-------------|
| 1 | PRICE-19 | `src/utils/pricing.test.js` | Inline content (≤64 bytes) = $0 |
| 2 | PRICE-20 | `src/utils/pricing.test.js` | Minimum cost $2.00 |
| 3 | PRICE-21 | `src/utils/pricing.test.js` | Small content returns minimum |
| 4 | PRICE-01 | `src/utils/pricing.test.js` | 1 GB × 1 month calculation |
| 5 | PRICE-06 | `src/utils/pricing.test.js` | Stripe fee calculation |
| 6 | PRICE-15 | `src/utils/pricing.test.js` | Cent rounding |
| 7 | PRICE-16 | `src/utils/pricing.test.js` | Float precision |

### Phase 4: Implement P0 Auth Tests

Tests to implement:

| # | Test ID | File | Description |
|---|---------|------|-------------|
| 1 | KEYGEN-01 | `src/auth/utils.test.js` | Correct prefix |
| 2 | KEYGEN-02 | `src/auth/utils.test.js` | 35 char format |
| 3 | KEYGEN-04 | `src/auth/utils.test.js` | Hash storage |
| 4 | KEYVAL-01 | `src/auth/middleware.test.js` | Valid key accepted |
| 5 | KEYVAL-02 | `src/auth/middleware.test.js` | Non-existent rejected |
| 6 | KEYVAL-03 | `src/auth/middleware.test.js` | Revoked rejected |
| 7 | KEYVAL-04 | `src/auth/middleware.test.js` | Expired rejected |
| 8 | CLERK-01 | `src/auth/middleware.test.js` | Valid JWT - mocked |
| 9 | CLERK-02 | `src/auth/middleware.test.js` | Expired JWT - mocked |
| 10 | AUTHMW-01 | `src/auth/middleware.test.js` | Anonymous public access |

### Phase 5: Implement P0 Balance Tests

| # | Test ID | File | Description |
|---|---------|------|-------------|
| 1 | BAL-01 | `src/durable-objects/user-profile.test.js` | Credit balance |
| 2 | BAL-05 | `src/durable-objects/user-profile.test.js` | Debit balance |
| 3 | BAL-07 | `src/durable-objects/user-profile.test.js` | Reject insufficient |
| 4 | BAL-08 | `src/durable-objects/user-profile.test.js` | Zero for new users |
| 5 | BAL-09 | `src/durable-objects/user-profile.test.js` | Never negative |
| 6 | BAL-11 | `src/durable-objects/user-profile.test.js` | Double-spend prevention |

### Phase 6: Implement Remaining P1/P2 Tests

Continue with remaining tests by priority.

### Phase 7: CI Integration

1. Add unit tests to `local-api-tests.yml` workflow
2. Ensure tests run before shell-based API tests
3. Add test result reporting
4. No coverage gates (per decision)

---

## Open Questions (Follow-up)

### Q7: Key Reveal Endpoint Implementation

**Question:** Is the key reveal endpoint (`/api/apikeys/:id/reveal`) fully implemented?

**Context:** The `isSessionFresh()` function exists in `src/auth/utils.js`, but need to verify the endpoint exists in `src/api/auth.js` and whether it includes:
- Rate limiting (3 per hour per key)
- Fresh session requirement (5 minutes)
- Encryption/decryption flow

**Action:** Verify before implementing REVEAL-* tests.

---

### Q8: Maximum Keys Per User

**Question:** Is the 25 key limit per user implemented?

**Context:** Tests KEYGEN-10 and KEYGEN-13 assume a 25 key limit. Need to verify this is enforced in the UserProfile Durable Object.

**Action:** Verify in `src/durable-objects/user-profile.js` before implementing tests.

---

### Q9: Local Development Auth

**Question:** Should LocalDev auth scheme be included in tests?

**Context:** The middleware supports `Authorization: LocalDev <user-id>` for local development. This is a third auth method not in the original test plan.

**Options:**
1. Add tests for LocalDev auth (recommended)
2. Skip - only test production auth methods

**Recommendation:** Add AUTHMW-11 test for LocalDev scheme.

---

### Q10: Vitest Pool Workers Configuration

**Question:** What Cloudflare bindings need to be mocked?

**Context:** The codebase uses several Durable Object bindings:
- `USER_PROFILES`
- `KEY_REGISTRY`
- `CONTENT_METADATA`
- `PAYMENT_RECORDS`
- `AUDIT_LOG`

**Action:** Document which bindings each test file needs and create appropriate mocks.

---

## Test Count Summary

| Category | Planned | Updated | Implemented | Gap |
|----------|---------|---------|-------------|-----|
| JavaScript Unit Tests | ~180 | ~186 | 0 | 186 |
| Shell API Tests | 137 | 137 | 137 | 0* |
| Shell Validation Tests | 89 | 89 | 89 | 0* |
| Standalone Test Scripts | ~10 | ~10 | ~10 | 0* |
| **Total** | **~416** | **~422** | **~236** | **~186** |

*Need verification that shell tests are all running in CI

---

## Appendix A: Source Documents

The tests in this plan are sourced from:

1. `done/user_authorization.md` - Auth system test plan (111+ tests)
2. `done/api_keys.md` - API keys test plan (57+ tests)
3. `done/payments.md` - Payments test plan (57+ tests)
4. `todo/local_API_tests.md` - Local API test plan (137 tests)
5. `done/deployment_validation.md` - Deployment validation plan (89 tests)
6. `todo/manual_testing_guide.md` - Manual OAuth testing guide

---

## Appendix B: CI Workflow Files

Current test-related workflows:

1. `.github/workflows/local-api-tests.yml` - PR-triggered API tests (add unit tests here)
2. `.github/workflows/deployment-validation.yml` - Daily + post-deploy validation
3. `.github/workflows/smoke-test.yml` - Quick health checks
4. `.github/workflows/build-report.yml` - Coverage and security reports

---

## Appendix C: Mock Requirements

### Clerk Mock

```javascript
// Mock for @clerk/backend verifyToken
export const mockClerk = {
  validToken: { sub: 'user_123', sid: 'sess_456', iat: Date.now() / 1000 },
  expiredToken: new Error('Token expired'),
  invalidToken: new Error('Invalid token')
};
```

### Stripe Mock

```javascript
// Mock for Stripe webhook signature verification
export const mockStripe = {
  validSignature: 'valid_sig_header',
  invalidSignature: 'invalid_sig',
  constructEvent: (payload, sig, secret) => { /* mock */ }
};
```

### Durable Object Mocks

```javascript
// Mock for UserProfile DO
export const mockUserProfile = {
  balance_cents: 10000,
  api_keys: [],
  // ...
};
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-23 | Claude | Initial draft with full test inventory |
| 0.2 | 2026-01-23 | Claude | Added decisions, drift analysis, follow-up questions |
