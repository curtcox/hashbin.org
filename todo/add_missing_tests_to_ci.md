# Add Missing Tests to CI

## Overview

This document plans the implementation of tests that were designed in planning documents but never written, and the integration of existing tests into CI. Tests need to be checked for continued correctness and relevance.

**Status:** Planning
**Created:** 2026-01-23

---

## Summary of Test Gaps

### 1. Unit Tests (JavaScript) - NOT IMPLEMENTED

Multiple planning documents specify JavaScript unit tests (`.test.js` files) that were never created. The project currently has only shell-based integration/API tests.

**Missing Test Files:**
- `auth/utils.test.js` - API key generation/validation unit tests
- `api/auth.test.js` - Authentication endpoint integration tests
- `auth/middleware.test.js` - Middleware authentication tests
- `api/content.test.js` - Content upload with API key tests
- `auth/rate-limit.test.js` - Rate limiting tests
- `durable-objects/rate-limiter.test.js` - RateLimiter DO tests
- `durable-objects/key-registry.test.js` - KeyRegistry DO tests
- `durable-objects/user-profile-apikeys.test.js` - UserProfile DO API key tests
- `e2e/api-keys.test.js` - End-to-end API key workflow tests

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

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| KEYGEN-01 | Generate API key with correct production prefix | P0 | Not Implemented |
| KEYGEN-02 | Generated key has correct format (40 chars) | P0 | Not Implemented |
| KEYGEN-03 | Generated key is unique (1000 keys test) | P1 | Not Implemented |
| KEYGEN-04 | Key generation stores hash, not plaintext | P0 | Not Implemented |
| KEYGEN-05 | Generate key with custom expiration | P1 | Not Implemented |
| KEYGEN-06 | Generate key defaults to 5 year expiration | P1 | Not Implemented |
| KEYGEN-07 | Cannot generate key without authentication | P0 | Not Implemented |
| KEYGEN-08 | Key name is required | P1 | Not Implemented |
| KEYGEN-09 | Key name length validation (>255 chars) | P2 | Not Implemented |
| KEYGEN-10 | Maximum 25 keys per user enforced | P0 | Not Implemented |
| KEYGEN-11 | Expiration beyond 5 years rejected | P1 | Not Implemented |
| KEYGEN-12 | Duplicate key names allowed | P2 | Not Implemented |
| KEYGEN-13 | Key 25 succeeds, key 26 fails | P1 | Not Implemented |
| KEYVAL-01 | Valid API key is accepted | P0 | Not Implemented |
| KEYVAL-02 | Non-existent API key is rejected | P0 | Not Implemented |
| KEYVAL-03 | Revoked API key is rejected | P0 | Not Implemented |
| KEYVAL-04 | Expired API key is rejected | P0 | Not Implemented |
| KEYVAL-05 | API key for deleted user is rejected | P1 | Not Implemented |
| KEYVAL-06 | Malformed API key is rejected | P0 | Not Implemented |
| KEYVAL-07 | Empty API key is rejected | P0 | Not Implemented |
| KEYVAL-08 | API key with wrong prefix is rejected | P0 | Not Implemented |
| KEYVAL-09 | Test key rejected in production | P0 | Not Implemented |
| KEYVAL-10 | Live key rejected in test environment | P0 | Not Implemented |
| KEYVAL-11 | last_used_at updated on successful validation | P2 | Not Implemented |
| KEYMGMT-01 | List keys shows all user's keys | P0 | Not Implemented |
| KEYMGMT-02 | List keys does not show key values | P0 | Not Implemented |
| KEYMGMT-03 | List keys shows revoked keys | P1 | Not Implemented |
| KEYMGMT-04 | Revoke key marks it as revoked | P0 | Not Implemented |
| KEYMGMT-05 | Cannot revoke another user's key | P0 | Not Implemented |
| KEYMGMT-06 | Cannot revoke already-revoked key | P2 | Not Implemented |
| KEYMGMT-07 | Revoke non-existent key returns 404 | P1 | Not Implemented |
| KEYMGMT-08 | Revoked keys retained for 5 years | P2 | Not Implemented |
| ENCRYPT-* | Encryption/decryption tests (8 tests) | P1 | Not Implemented |

#### A2. API Key Reveal Tests (12 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| REVEAL-01 | Reveal with fresh session succeeds | P0 | Not Implemented |
| REVEAL-02 | Reveal with stale session (>5 min) rejected | P0 | Not Implemented |
| REVEAL-03 | Reveal with API key authentication rejected | P0 | Not Implemented |
| REVEAL-04 | Reveal revoked key rejected | P1 | Not Implemented |
| REVEAL-05 | Reveal non-existent key returns 404 | P1 | Not Implemented |
| REVEAL-06 | Reveal other user's key returns 404 | P0 | Not Implemented |
| REVEAL-07 | Rate limit (3 per hour) enforced | P1 | Not Implemented |
| REVEAL-08 | Rate limit resets after hour | P1 | Not Implemented |
| REVEAL-09 | Rate limit per key not per user | P2 | Not Implemented |
| REVEAL-10 | Revealed key matches original | P0 | Not Implemented |
| REVEAL-11 | Reveal requires fresh Clerk session | P0 | Not Implemented |
| REVEAL-12 | Encryption uses unique IV each time | P1 | Not Implemented |

### Category B: Unit Tests from user_authorization.md (NOT IMPLEMENTED)

#### B1. Clerk Integration Tests (7 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| CLERK-01 | Valid Clerk JWT is accepted | P0 | Not Implemented |
| CLERK-02 | Expired Clerk JWT is rejected | P0 | Not Implemented |
| CLERK-03 | Malformed Clerk JWT is rejected | P0 | Not Implemented |
| CLERK-04 | Missing Authorization header for protected route | P0 | Not Implemented |
| CLERK-05 | Clerk webhook creates new user profile | P1 | Not Implemented |
| CLERK-06 | Clerk webhook updates existing user | P1 | Not Implemented |
| CLERK-07 | Clerk webhook handles user deletion | P1 | Not Implemented |

#### B2. UserProfile Durable Object Tests (9 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| UPDO-01 | Create new user profile | P0 | Not Implemented |
| UPDO-02 | Retrieve existing user profile | P0 | Not Implemented |
| UPDO-03 | Update user profile | P1 | Not Implemented |
| UPDO-04 | Soft delete user profile | P1 | Not Implemented |
| UPDO-05 | Add upload to user history | P1 | Not Implemented |
| UPDO-06 | Retrieve user's upload history | P1 | Not Implemented |
| UPDO-07 | User profile not found returns 404 | P1 | Not Implemented |
| UPDO-08 | Deleted profile returns AUTH_USER_DELETED | P0 | Not Implemented |
| UPDO-09 | Multiple providers stored correctly | P2 | Not Implemented |

#### B3. Authorization Middleware Tests (10 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| AUTHMW-01 | Anonymous access to public endpoint | P0 | Not Implemented |
| AUTHMW-02 | Anonymous access to public content | P0 | Not Implemented |
| AUTHMW-03 | Anonymous access to protected endpoint rejected | P0 | Not Implemented |
| AUTHMW-04 | Clerk session provides user context | P0 | Not Implemented |
| AUTHMW-05 | API key provides user context | P0 | Not Implemented |
| AUTHMW-06 | Both auth methods present uses Clerk | P2 | Not Implemented |
| AUTHMW-07 | Auth header with Bearer scheme | P1 | Not Implemented |
| AUTHMW-08 | Auth header with ApiKey scheme | P1 | Not Implemented |
| AUTHMW-09 | X-API-Key header accepted | P0 | Not Implemented |
| AUTHMW-10 | Invalid auth scheme rejected | P1 | Not Implemented |

#### B4. Rate Limiting Tests (8 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| RATE-01 | Anonymous under limit succeeds (99 req/min) | P0 | Not Implemented |
| RATE-02 | Anonymous at limit returns 429 (101 req/min) | P0 | Not Implemented |
| RATE-03 | Authenticated under limit succeeds (999 req/min) | P1 | Not Implemented |
| RATE-04 | Authenticated at limit returns 429 (1001 req/min) | P1 | Not Implemented |
| RATE-05 | Per-key limit enforced (501 req/min) | P1 | Not Implemented |
| RATE-06 | Multiple keys share user limit | P2 | Not Implemented |
| RATE-07 | Rate limit resets after window | P1 | Not Implemented |
| RATE-08 | Rate limit response includes retry-after | P1 | Not Implemented |

#### B5. Integration Tests (10 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| INT-01 | Full OAuth login flow | P0 | Not Implemented |
| INT-02 | Upload content with session | P0 | Not Implemented |
| INT-03 | Upload content with API key | P0 | Not Implemented |
| INT-04 | API key lifecycle (create, use, revoke) | P0 | Not Implemented |
| INT-05 | Multiple API keys work independently | P1 | Not Implemented |
| INT-07 | Session expiration handling | P1 | Not Implemented |
| INT-08 | Concurrent key creation | P2 | Not Implemented |
| INT-09 | Rate limiting per user | P1 | Not Implemented |
| INT-10 | Cross-user isolation | P0 | Not Implemented |

#### B6. Edge Case Tests (12 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| EDGE-01 | Network failure during key creation | P1 | Not Implemented |
| EDGE-02 | Clerk service unavailable | P1 | Not Implemented |
| EDGE-03 | Key created at expiration boundary | P2 | Not Implemented |
| EDGE-04 | Unicode in API key name | P2 | Not Implemented |
| EDGE-05 | Very long user ID from Clerk | P2 | Not Implemented |
| EDGE-06 | Simultaneous key revocation | P2 | Not Implemented |
| EDGE-08 | Clock skew with expiration | P2 | Not Implemented |
| EDGE-09 | API key with null bytes | P1 | Not Implemented |
| EDGE-10 | Header injection attempt | P0 | Not Implemented |
| EDGE-11 | 25th key at exact limit | P1 | Not Implemented |
| EDGE-12 | Key expires during request | P2 | Not Implemented |

#### B7. Security Tests (10 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| SEC-01 | Timing attack on key validation | P0 | Not Implemented |
| SEC-02 | Key enumeration prevention | P0 | Not Implemented |
| SEC-03 | JWT signature bypass (alg:none) | P0 | Not Implemented |
| SEC-04 | Session fixation prevention | P1 | Not Implemented |
| SEC-05 | CSRF on key creation | P1 | Not Implemented |
| SEC-06 | XSS in key name | P0 | Not Implemented |
| SEC-07 | SQL/NoSQL injection in user_id | P0 | Not Implemented |
| SEC-08 | Key in URL parameter rejected | P1 | Not Implemented |
| SEC-09 | Key logging prevention | P1 | Not Implemented |
| SEC-10 | Webhook signature validation | P0 | Not Implemented |

### Category C: Unit Tests from payments.md (NOT IMPLEMENTED)

#### C1. Pricing Calculator Tests (18 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| PRICE-01 | Calculate cost for 1 GB for 1 month ($0.03) | P0 | Not Implemented |
| PRICE-02 | Calculate cost for 10 GB for 1 month ($0.30) | P0 | Not Implemented |
| PRICE-03 | Calculate cost for 1 GB for 12 months ($0.36) | P0 | Not Implemented |
| PRICE-04 | Calculate cost for 100 GB for 6 months ($18.00) | P0 | Not Implemented |
| PRICE-05 | Handle 500 MB for 1 month (rounding) | P1 | Not Implemented |
| PRICE-06 | Calculate Stripe fee (2.9% + $0.30) | P0 | Not Implemented |
| PRICE-07 | Calculate net deposit after fees | P0 | Not Implemented |
| PRICE-08 | Handle $1.00 deposit fee calculation | P0 | Not Implemented |
| PRICE-09 | Handle 0 bytes (error) | P1 | Not Implemented |
| PRICE-10 | Handle negative size (error) | P1 | Not Implemented |
| PRICE-11 | Handle extremely large size (1 PB) | P2 | Not Implemented |
| PRICE-12 | Handle 0 months (error) | P1 | Not Implemented |
| PRICE-13 | Handle negative months (error) | P1 | Not Implemented |
| PRICE-14 | Handle very long durations (100 years) | P2 | Not Implemented |
| PRICE-15 | Round final price to nearest cent | P0 | Not Implemented |
| PRICE-16 | Avoid floating point errors | P0 | Not Implemented |
| PRICE-17 | Use integer cents internally | P0 | Not Implemented |
| PRICE-18 | Calculate minimum cost for file size | P0 | Not Implemented |

#### C2. Balance Operations Tests (12 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| BAL-01 | Credit balance on successful deposit | P0 | Not Implemented |
| BAL-02 | Record transaction with before/after balance | P0 | Not Implemented |
| BAL-03 | Update total_deposited_cents | P1 | Not Implemented |
| BAL-04 | Handle multiple deposits correctly | P1 | Not Implemented |
| BAL-05 | Debit balance on successful upload | P0 | Not Implemented |
| BAL-06 | Update total_spent_cents | P1 | Not Implemented |
| BAL-07 | Reject if balance insufficient | P0 | Not Implemented |
| BAL-08 | Return 0 for new users | P0 | Not Implemented |
| BAL-09 | Never return negative balance | P0 | Not Implemented |
| BAL-10 | Handle concurrent deposits | P1 | Not Implemented |
| BAL-11 | Prevent race conditions (double-spend) | P0 | Not Implemented |
| BAL-12 | Serialize balance modifications | P1 | Not Implemented |

#### C3. Upload Payment Validation Tests (12 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| UPPAY-01 | Allow upload when balance >= cost | P0 | Not Implemented |
| UPPAY-02 | Allow upload when balance exactly equals cost | P1 | Not Implemented |
| UPPAY-03 | Allow upload with balance > 30-day minimum | P0 | Not Implemented |
| UPPAY-04 | Reject when balance < 30-day minimum cost | P0 | Not Implemented |
| UPPAY-05 | Reject when balance < requested retention cost | P0 | Not Implemented |
| UPPAY-06 | Return detailed rejection message | P0 | Not Implemented |
| UPPAY-07 | Include required_cents in response | P1 | Not Implemented |
| UPPAY-08 | Include balance_cents in response | P1 | Not Implemented |
| UPPAY-09 | Include deposit_url in response | P1 | Not Implemented |
| UPPAY-10 | Format rejection message correctly | P1 | Not Implemented |
| UPPAY-11 | Handle very large files correctly | P1 | Not Implemented |
| UPPAY-12 | Handle very long retention correctly | P1 | Not Implemented |

#### C4. Stripe Webhook Handler Tests (15 tests)

| Test ID | Test Name | Priority | Status |
|---------|-----------|----------|--------|
| STRIPE-01 | Accept valid Stripe signature | P0 | Not Implemented |
| STRIPE-02 | Reject missing signature header | P0 | Not Implemented |
| STRIPE-03 | Reject invalid signature | P0 | Not Implemented |
| STRIPE-04 | Reject expired signature | P1 | Not Implemented |
| STRIPE-05 | Reject replayed webhook (duplicate event ID) | P0 | Not Implemented |
| STRIPE-06 | checkout.session.completed credits balance | P0 | Not Implemented |
| STRIPE-07 | Record transaction with before/after balance | P0 | Not Implemented |
| STRIPE-08 | Webhook is idempotent | P0 | Not Implemented |
| STRIPE-09 | checkout.session.completed extends CID | P0 | Not Implemented |
| STRIPE-10 | Handle anonymous donations | P1 | Not Implemented |
| STRIPE-11 | checkout.session.expired does not affect balance | P1 | Not Implemented |
| STRIPE-12 | charge.dispute.created flags account | P1 | Not Implemented |
| STRIPE-13 | Return 400 for malformed JSON | P1 | Not Implemented |
| STRIPE-14 | Return 200 for unknown event types | P1 | Not Implemented |
| STRIPE-15 | Log errors securely | P1 | Not Implemented |

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

## Open Questions

### Q1: JavaScript Unit Test Framework

**Question:** Should we implement the planned JavaScript unit tests?

**Context:** Multiple planning documents specify JavaScript unit tests that were never created. The project currently uses only shell-based tests.

**Options:**
1. **Implement with Vitest** - Modern, fast test runner compatible with Workers
2. **Implement with Jest** - Well-known, more configuration required for Workers
3. **Convert to shell tests** - Continue with shell-only approach
4. **Skip unit tests** - Rely on integration tests only

**Recommendation:** TBD

---

### Q2: Test Priority for Implementation

**Question:** Which test categories should be prioritized first?

**Options:**
1. **Security tests first (SEC-*)** - Critical for production
2. **Core auth tests first (KEYVAL-*, CLERK-*)** - Foundation for other features
3. **Payment tests first (STRIPE-*, PRICE-*)** - Money handling is critical
4. **All P0 tests first** - Systematic priority-based approach

**Recommendation:** TBD

---

### Q3: CI Workflow Organization

**Question:** How should tests be organized in CI?

**Current state:**
- `local-api-tests.yml` - Runs on PR to main/develop
- `deployment-validation.yml` - Runs daily and after deploy
- `smoke-test.yml` - Quick post-deploy check

**Options:**
1. **Keep current organization** - Add unit tests to existing workflows
2. **Create separate unit test workflow** - `unit-tests.yml` for JavaScript tests
3. **Consolidate all tests** - Single comprehensive workflow with stages
4. **Matrix-based workflow** - Parallel execution of different test types

**Recommendation:** TBD

---

### Q4: Test Environment Secrets

**Question:** How should tests handle secrets (Clerk, Stripe)?

**Context:** Many tests require Clerk session or Stripe keys to run properly.

**Options:**
1. **Mock all external services** - No real Clerk/Stripe calls in tests
2. **Use test mode secrets** - Real test-mode API calls
3. **Skip tests requiring secrets** - Run only when secrets available
4. **Hybrid approach** - Mock by default, real calls in nightly builds

**Recommendation:** TBD

---

### Q5: Relevance of Planned Tests

**Question:** Are all planned tests still relevant?

**Context:** Some tests were planned months ago. The implementation may have changed.

**Tests to verify relevance:**
- CLERK-* tests - Is Clerk integration still as designed?
- RATE-* tests - Is rate limiting implemented as specified?
- REVEAL-* tests - Is key reveal implemented?
- EDGE-* tests - Are edge cases still applicable?

**Action Required:** Review each test category against current implementation before implementing.

---

### Q6: Coverage Targets

**Question:** What code coverage targets should we set?

**Options:**
1. **No target** - Any improvement is good
2. **50% minimum** - Basic coverage
3. **70% minimum** - Reasonable coverage
4. **80%+ target** - High coverage (industry standard)

**Recommendation:** TBD

---

## Implementation Plan (Draft)

### Phase 1: Audit Existing Tests

1. Verify all shell-based tests pass locally
2. Verify CI workflows execute all test suites
3. Document any failing or skipped tests
4. Identify tests that need updating

### Phase 2: Set Up JavaScript Test Infrastructure

1. Choose test framework (Vitest recommended for Cloudflare Workers)
2. Configure test environment
3. Create test utilities and mocks
4. Add npm scripts for test execution

### Phase 3: Implement P0 Security Tests

1. SEC-01 through SEC-10 from user_authorization.md
2. STRIPE-01 through STRIPE-05 from payments.md
3. Timing attack prevention verification
4. Injection attack prevention verification

### Phase 4: Implement P0 Core Auth Tests

1. KEYVAL-01 through KEYVAL-08
2. CLERK-01 through CLERK-04
3. AUTHMW-01 through AUTHMW-05
4. Basic API key lifecycle tests

### Phase 5: Implement P0 Payment Tests

1. PRICE-01 through PRICE-08
2. BAL-01 through BAL-09
3. UPPAY-01 through UPPAY-06
4. STRIPE-06 through STRIPE-08

### Phase 6: Implement P1 Tests

1. Remaining key validation tests
2. Rate limiting tests
3. Integration tests
4. Edge case tests

### Phase 7: CI Integration

1. Add unit test workflow
2. Configure coverage reporting
3. Set up coverage badges
4. Configure required status checks

---

## Test Count Summary

| Category | Planned | Implemented | Gap |
|----------|---------|-------------|-----|
| JavaScript Unit Tests | ~180 | 0 | 180 |
| Shell API Tests | 137 | 137 | 0* |
| Shell Validation Tests | 89 | 89 | 0* |
| Standalone Test Scripts | ~10 | ~10 | 0* |
| **Total** | **~416** | **~236** | **~180** |

*Need verification that shell tests are all running in CI

---

## Next Steps

1. **Resolve open questions Q1-Q6** with stakeholder input
2. **Audit existing shell tests** to verify CI integration
3. **Decide on JavaScript test framework** if proceeding with unit tests
4. **Prioritize test categories** based on risk assessment
5. **Create implementation timeline** based on available resources

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

1. `.github/workflows/local-api-tests.yml` - PR-triggered API tests
2. `.github/workflows/deployment-validation.yml` - Daily + post-deploy validation
3. `.github/workflows/smoke-test.yml` - Quick health checks
4. `.github/workflows/build-report.yml` - Coverage and security reports

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-23 | Claude | Initial draft with full test inventory |
