# Local API Tests Plan

## Overview

This document outlines the plan for automated API integration tests that run against the local development server. These tests will validate actual HTTP API behavior by making real requests to the locally running server.

**Goals:**
- Create automated tests that can run locally via command line
- Add tests to GitHub Actions to run before PR approval
- Achieve comprehensive coverage of all API endpoints and edge cases

**Testing Approach:**
- Use bash scripts with `curl` for consistency with existing test infrastructure
- Use `LocalDev` authentication for authenticated endpoints
- Use `dev-deposit` endpoint to set up test balances
- Each test suite should be independently runnable
- Tests should be idempotent where possible (can run multiple times)

---

## Prerequisites

- Local server running: `npm run dev:local`
- Base URL: `http://localhost:8787`
- Tests use `LocalDev` auth: `Authorization: LocalDev <test_user_id>`

---

## Test Suites

### 1. Health & Configuration Tests (`test-local-health.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| H-001 | Health endpoint returns 200 | GET | `/health` | 200 OK with JSON body |
| H-002 | Health response contains required fields | GET | `/health` | Body has `status`, `checks`, `environment` |
| H-003 | Health shows local environment | GET | `/health` | `environment: "local"` |
| H-004 | Health checks show operational status | GET | `/health` | `checks.durableObjects.status: "operational"` |
| H-005 | Health checks show R2 status | GET | `/health` | `checks.r2.status: "operational"` |
| H-006 | Config endpoint returns 200 | GET | `/api/config` | 200 OK with JSON body |
| H-007 | Config shows local mode enabled | GET | `/api/config` | `isLocalMode: true` |
| H-008 | Config shows auth mode | GET | `/api/config` | Contains `authMode` field |
| H-009 | Root returns HTML | GET | `/` | 200 OK with HTML content type |
| H-010 | Root contains HashBin branding | GET | `/` | Body contains "HashBin" |

### 2. Authentication Tests (`test-local-auth.sh`)

#### 2.1 Unauthenticated Access

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| A-001 | Session endpoint requires auth | GET | `/api/auth/session` | 401 with `AUTH_MISSING` |
| A-002 | Balance endpoint requires auth | GET | `/api/balance` | 401 with `AUTH_MISSING` |
| A-003 | Upload endpoint requires auth | POST | `/api/content` | 401 with `AUTH_MISSING` |
| A-004 | Balance history requires auth | GET | `/api/balance/history` | 401 with `AUTH_MISSING` |
| A-005 | User uploads requires auth | GET | `/api/user/uploads` | 401 with `AUTH_MISSING` |
| A-006 | API key list requires auth | GET | `/api/auth/apikeys` | 401 with `AUTH_MISSING` |

#### 2.2 LocalDev Authentication

| Test ID | Test Name | Method | Endpoint | Auth Header | Expected Result |
|---------|-----------|--------|----------|-------------|-----------------|
| A-010 | LocalDev auth creates session | GET | `/api/auth/session` | `LocalDev test_user_1` | 200 with `user_id`, `auth_method: "local"` |
| A-011 | LocalDev auth with different user | GET | `/api/auth/session` | `LocalDev test_user_2` | 200 with different `user_id` |
| A-012 | LocalDev auth rejects empty user | GET | `/api/auth/session` | `LocalDev ` | 401 with error |
| A-013 | LocalDev auth rejects too long user | GET | `/api/auth/session` | `LocalDev <257 chars>` | 400/401 with error |
| A-014 | Invalid auth header format | GET | `/api/auth/session` | `Invalid xyz` | 401 with `AUTH_INVALID` |
| A-015 | Malformed Bearer token | GET | `/api/auth/session` | `Bearer invalid` | 401 with error |
| A-016 | Malformed ApiKey header | GET | `/api/auth/session` | `ApiKey invalid` | 401 with error |

#### 2.3 API Key Authentication (LocalDev)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| A-020 | Create API key via LocalDev | POST | `/api/auth/apikeys` | 201 with `api_key` starting with `hb_` |
| A-021 | API key format is correct | POST | `/api/auth/apikeys` | Key is 35 chars: `hb_` + 32 alphanumeric |
| A-022 | List API keys | GET | `/api/auth/apikeys` | 200 with array of keys |
| A-023 | Auth with new API key | GET | `/api/auth/session` | 200 with `auth_method: "api_key"` |
| A-024 | Revoke API key | DELETE | `/api/auth/apikeys/{key_id}` | 200 OK |
| A-025 | Revoked key is rejected | GET | `/api/auth/session` | 401 with `AUTH_KEY_REVOKED` |
| A-026 | Revoke is idempotent | DELETE | `/api/auth/apikeys/{key_id}` | 200 (already revoked) |
| A-027 | API key creation with name | POST | `/api/auth/apikeys` | 201 with custom `name` |
| A-028 | API key with expiration | POST | `/api/auth/apikeys` | 201 with `expires_at` set |
| A-029 | Max API keys enforced | POST | `/api/auth/apikeys` | 400 after 25 keys |
| A-030 | Invalid key ID returns 404 | DELETE | `/api/auth/apikeys/invalid_id` | 404 with error |
| A-031 | X-API-Key header works | GET | `/api/auth/session` | 200 (alternative header) |

### 3. Balance Tests (`test-local-balance.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| B-001 | New user starts with balance | GET | `/api/balance` | 200 with `balance_cents: 1000` ($10) |
| B-002 | Dev deposit adds funds | POST | `/api/balance/dev-deposit` | 200 with updated balance |
| B-003 | Dev deposit records transaction | GET | `/api/balance/history` | Shows deposit transaction |
| B-004 | Balance history pagination | GET | `/api/balance/history?limit=5` | Max 5 results |
| B-005 | Balance history offset | GET | `/api/balance/history?offset=1` | Skips first result |
| B-006 | Dev deposit requires amount | POST | `/api/balance/dev-deposit` | 400 if `amount_cents` missing |
| B-007 | Dev deposit rejects negative | POST | `/api/balance/dev-deposit` | 400 if `amount_cents < 0` |
| B-008 | Dev deposit rejects zero | POST | `/api/balance/dev-deposit` | 400 if `amount_cents = 0` |
| B-009 | Balance fields are correct | GET | `/api/balance` | Has `balance_cents`, `total_deposited_cents`, `total_spent_cents` |
| B-010 | Transaction has required fields | GET | `/api/balance/history` | Each txn has `id`, `type`, `amount_cents`, `created_at` |

### 4. Content Upload Tests (`test-local-upload.sh`)

#### 4.1 Basic Upload

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| U-001 | Upload small text file | POST | `/api/content` | 201 with `cid` |
| U-002 | Upload returns valid 256t hash | POST | `/api/content` | CID is valid 256t format |
| U-003 | Upload deducts balance | POST | `/api/content` | Balance reduced after upload |
| U-004 | Upload creates transaction | GET | `/api/balance/history` | Shows `upload` transaction |
| U-005 | Upload with 1 month retention | POST | `/api/content` | `retention_months: 1` in metadata |
| U-006 | Upload with 12 month retention | POST | `/api/content` | `retention_months: 12` in metadata |
| U-007 | Get content metadata | GET | `/api/content/{cid}` | 200 with `size_bytes`, `content_type` |
| U-008 | Content exists check | GET | `/api/content/{cid}/exists` | 200 with `exists: true` |
| U-009 | Non-existent content check | GET | `/api/content/{cid}/exists` | 200 with `exists: false` |

#### 4.2 Inline Content (<=64 bytes)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| U-020 | Inline content is free | POST | `/api/content` | Balance unchanged for <=64 bytes |
| U-021 | Inline content no rate limit | GET | `/{cid}` | No rate limit headers |
| U-022 | 64 byte content is inline | POST | `/api/content` | Treated as inline |
| U-023 | 65 byte content is NOT inline | POST | `/api/content` | Balance charged |

#### 4.3 Upload Edge Cases

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| U-030 | Upload requires body | POST | `/api/content` | 400 if no file |
| U-031 | Upload sets content type | POST | `/api/content` | Correct MIME type stored |
| U-032 | Duplicate upload deduped | POST | `/api/content` | Same CID returned, no double charge |
| U-033 | Empty file rejected | POST | `/api/content` | 400 for 0-byte file |
| U-034 | Insufficient balance rejected | POST | `/api/content` | 400 with `insufficient_balance` |
| U-035 | Invalid retention rejected | POST | `/api/content` | 400 for invalid months |

### 5. Content Download Tests (`test-local-download.sh`)

#### 5.1 Basic Download

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| D-001 | Download content by CID | GET | `/{cid}` | 200 with original content |
| D-002 | Download with extension | GET | `/{cid}.txt` | 200 with correct content type |
| D-003 | Download non-existent CID | GET | `/{invalid_cid}` | 404 |
| D-004 | Download sets content type | GET | `/{cid}` | Correct `Content-Type` header |
| D-005 | Download sets content length | GET | `/{cid}` | Correct `Content-Length` header |

#### 5.2 Rate Limiting

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| D-010 | First download succeeds | GET | `/{cid}` | 200 |
| D-011 | Immediate re-download blocked | GET | `/{cid}` | 429 with `retry_after_seconds` |
| D-012 | 429 includes next_available_at | GET | `/{cid}` | Body has `next_available_at` |
| D-013 | Rate limit headers present | GET | `/{cid}` | `X-RateLimit-Content-Reset` header |
| D-014 | Get rate limit status | GET | `/api/content/{cid}/rate-limit` | 200 with current status |
| D-015 | Inline content no rate limit | GET | `/{inline_cid}` | Never returns 429 |

### 6. Rate Limit Purchase Tests (`test-local-ratelimit-purchase.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| R-001 | Purchase rate limit reduction | POST | `/api/content/rate-limit/purchase` | 200 with new MTBR |
| R-002 | Purchase deducts balance | POST | `/api/content/rate-limit/purchase` | Balance reduced |
| R-003 | Purchase creates transaction | GET | `/api/balance/history` | Shows `rate_limit_purchase` |
| R-004 | Cannot purchase for inline | POST | `/api/content/rate-limit/purchase` | 400 for inline content |
| R-005 | Cannot exceed retention | POST | `/api/content/rate-limit/purchase` | 400 if duration > retention |
| R-006 | Insufficient balance rejected | POST | `/api/content/rate-limit/purchase` | 400 with `insufficient_balance` |
| R-007 | Invalid CID rejected | POST | `/api/content/rate-limit/purchase` | 404 for non-existent CID |
| R-008 | Purchase validates MTBR minimum | POST | `/api/content/rate-limit/purchase` | 400 if MTBR < 100ms |

### 7. Content Extension Tests (`test-local-extension.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| E-001 | Extend content retention | POST | `/api/content/{cid}/extend` | 200 with new `expires_at` |
| E-002 | Extension deducts balance | POST | `/api/content/{cid}/extend` | Balance reduced |
| E-003 | Extension creates transaction | GET | `/api/balance/history` | Shows `extension` transaction |
| E-004 | Cannot extend non-existent | POST | `/api/content/{invalid}/extend` | 404 |
| E-005 | Insufficient balance rejected | POST | `/api/content/{cid}/extend` | 400 with `insufficient_balance` |
| E-006 | Extension requires months | POST | `/api/content/{cid}/extend` | 400 if months missing |

### 8. User Data Tests (`test-local-user.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| UD-001 | List user uploads | GET | `/api/user/uploads` | 200 with array |
| UD-002 | Uploads include metadata | GET | `/api/user/uploads` | Each has `cid`, `size_bytes`, `created_at` |
| UD-003 | New user has no uploads | GET | `/api/user/uploads` | Empty array |
| UD-004 | Upload appears in list | GET | `/api/user/uploads` | After upload, CID in list |
| UD-005 | Uploads pagination | GET | `/api/user/uploads?limit=5` | Max 5 results |

### 9. Donation Tests (`test-local-donation.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| DN-001 | Donate to content creator | POST | `/api/donate/cid/{cid}` | 200 or appropriate response |
| DN-002 | Donation requires amount | POST | `/api/donate/cid/{cid}` | 400 if amount missing |
| DN-003 | Cannot donate to non-existent | POST | `/api/donate/cid/{invalid}` | 404 |
| DN-004 | Cannot donate with insufficient balance | POST | `/api/donate/cid/{cid}` | 400 with error |

### 10. Error Handling Tests (`test-local-errors.sh`)

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| ERR-001 | Invalid JSON body | POST | `/api/content` | 400 with parse error |
| ERR-002 | Wrong HTTP method | PUT | `/api/balance` | 405 Method Not Allowed |
| ERR-003 | Non-existent endpoint | GET | `/api/nonexistent` | 404 |
| ERR-004 | Malformed CID | GET | `/@#$%^&` | 404 or 400 |
| ERR-005 | Missing required fields | POST | `/api/auth/apikeys` | 400 with field error |
| ERR-006 | Error response format | ANY | various | All errors have `error` and `message` |

### 11. Concurrent Operations Tests (`test-local-concurrent.sh`)

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| C-001 | Concurrent balance reads | Multiple GET /api/balance | All return consistent data |
| C-002 | Concurrent uploads | Multiple POST /api/content | All succeed, balance correct |
| C-003 | Concurrent API key creates | Multiple POST /api/auth/apikeys | All created, no duplicates |
| C-004 | Upload during download | Upload + download same CID | Both succeed |

---

## GitHub Actions Integration

### Workflow: `local-api-tests.yml`

```yaml
name: Local API Tests

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  api-tests:
    name: Run Local API Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Start local server
        run: |
          npm run dev:local &
          sleep 10  # Wait for server to start

      - name: Wait for server ready
        run: |
          for i in {1..30}; do
            if curl -sf http://localhost:8787/health > /dev/null; then
              echo "Server is ready"
              exit 0
            fi
            echo "Waiting for server... ($i/30)"
            sleep 2
          done
          echo "Server failed to start"
          exit 1

      - name: Run Health Tests
        run: bash scripts/api-tests/test-local-health.sh

      - name: Run Auth Tests
        run: bash scripts/api-tests/test-local-auth.sh

      - name: Run Balance Tests
        run: bash scripts/api-tests/test-local-balance.sh

      - name: Run Upload Tests
        run: bash scripts/api-tests/test-local-upload.sh

      - name: Run Download Tests
        run: bash scripts/api-tests/test-local-download.sh

      - name: Run Rate Limit Tests
        run: bash scripts/api-tests/test-local-ratelimit-purchase.sh

      - name: Run Extension Tests
        run: bash scripts/api-tests/test-local-extension.sh

      - name: Run User Tests
        run: bash scripts/api-tests/test-local-user.sh

      - name: Run Error Tests
        run: bash scripts/api-tests/test-local-errors.sh
```

### Test Script Structure

Each test script will follow this pattern:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_USER="api_test_user_$(date +%s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TOTAL=0
PASSED=0
FAILED=0

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; ((PASSED++)); ((TOTAL++)); }
fail() { echo -e "${RED}❌ FAIL${NC}: $1"; ((FAILED++)); ((TOTAL++)); }

# Test implementations...

# Summary
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"
[ $FAILED -eq 0 ] && exit 0 || exit 1
```

---

## Open Questions

### Test Infrastructure

1. **Q1: Should tests be ordered or independent?**
   - Option A: Each test is fully independent (slower, more setup per test)
   - Option B: Tests run in sequence with shared state (faster, but order-dependent)
   - *Recommendation: Option B for speed, with clear test ordering*

2. **Q2: Should tests clean up after themselves?**
   - Option A: Tests clean up created resources (API keys, content)
   - Option B: Tests don't clean up, rely on fresh user IDs each run
   - *Recommendation: Option B, use unique user IDs per test run*

3. **Q3: How should we handle flaky network/timing issues?**
   - Option A: Retry failed tests automatically
   - Option B: Fail fast, investigate flakiness
   - *Recommendation: Option B for CI, with clear error messages*

### Test Coverage

4. **Q4: Should we test API key reveal functionality?**
   - Note: Reveal requires "fresh session" (<5 min) which is Clerk-specific
   - LocalDev auth may not support session freshness checks
   - *Need to verify if reveal works with LocalDev*

5. **Q5: Should we test logout endpoint?**
   - Note: Logout is Clerk-specific and returns 501 for non-Clerk sessions
   - *Probably skip or test that it returns appropriate error for LocalDev*

6. **Q6: Should we test Stripe webhook endpoint?**
   - Note: Requires valid Stripe signature
   - Option A: Mock Stripe signatures locally
   - Option B: Skip webhook tests in local mode
   - *Recommendation: Option B, test webhook in production smoke tests only*

7. **Q7: What timeout should we use for rate limit tests?**
   - Default MTBR is 30 days - too long for tests
   - Need a way to test rate limiting without waiting 30 days
   - Option A: Purchase very low MTBR for test content
   - Option B: Add test-only endpoint to set rate limits
   - *Need to determine feasible approach*

### GitHub Actions

8. **Q8: Should API tests run on every commit or only PRs?**
   - Option A: Every push to any branch
   - Option B: Only on PRs to main/develop
   - Option C: Both, but with different test subsets
   - *Recommendation: Option B to save CI minutes*

9. **Q9: Should API tests be blocking for PR merge?**
   - Option A: Required to pass before merge
   - Option B: Advisory only (warning on failure)
   - *Recommendation: Option A*

10. **Q10: How long should we allow for the full test suite?**
    - Estimate: 2-5 minutes for all tests
    - Should we set a timeout?
    - *Need to measure actual runtime*

### Edge Cases

11. **Q11: Should we test large file uploads?**
    - Risk: Slow tests, resource usage
    - Option A: Test with files up to 10MB
    - Option B: Skip large file tests in CI
    - *Need to determine max size worth testing*

12. **Q12: Should we test content expiration?**
    - Note: Content expiration is time-based
    - Cannot easily test in short-running CI
    - *Probably skip, test logic via unit tests instead*

13. **Q13: How should we test 2FA requirements?**
    - Note: Account deletion requires 2FA
    - LocalDev auth doesn't support 2FA
    - *Skip 2FA-protected endpoints or mock 2FA*

---

## Test Priority Matrix

| Priority | Test Suite | Reason |
|----------|------------|--------|
| P0 (Critical) | Health & Config | Basic availability |
| P0 (Critical) | Auth - Unauthenticated | Security boundary |
| P0 (Critical) | Auth - LocalDev | Required for all other tests |
| P1 (High) | Upload | Core functionality |
| P1 (High) | Download | Core functionality |
| P1 (High) | Balance | Money handling |
| P2 (Medium) | API Keys | Important feature |
| P2 (Medium) | Rate Limiting | Important feature |
| P2 (Medium) | Error Handling | User experience |
| P3 (Low) | Content Extension | Less common flow |
| P3 (Low) | Donations | Less common flow |
| P3 (Low) | Concurrent Tests | Edge cases |

---

## File Structure

```
scripts/
├── api-tests/
│   ├── common.sh              # Shared utilities
│   ├── test-local-health.sh
│   ├── test-local-auth.sh
│   ├── test-local-balance.sh
│   ├── test-local-upload.sh
│   ├── test-local-download.sh
│   ├── test-local-ratelimit-purchase.sh
│   ├── test-local-extension.sh
│   ├── test-local-user.sh
│   ├── test-local-donation.sh
│   ├── test-local-errors.sh
│   └── test-local-concurrent.sh
└── run-all-api-tests.sh       # Master runner

.github/workflows/
└── local-api-tests.yml
```

---

## Next Steps

1. Resolve open questions above
2. Implement `common.sh` with shared utilities
3. Implement test scripts in priority order (P0 first)
4. Create GitHub Actions workflow
5. Add to PR requirements
6. Document test maintenance procedures
