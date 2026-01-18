# Local API Tests Plan

## Overview

This document outlines the plan for automated API integration tests that run against the local development server. These tests will validate actual HTTP API behavior by making real requests to the locally running server.

**Goals:**
- Create automated tests that can run locally via command line
- Add tests to GitHub Actions to run before PR approval (required to pass)
- Achieve comprehensive coverage of all API endpoints and edge cases

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test ordering | Sequential with shared state | Faster execution, tests build on each other |
| Cleanup strategy | Fresh user IDs per run | No cleanup needed, isolation via unique IDs |
| Flaky test handling | Fail fast | Investigate and fix rather than mask issues |
| API key reveal testing | Skip | Requires Clerk session freshness, not available in LocalDev |
| Logout endpoint testing | Skip | Clerk-specific, returns 501 for LocalDev |
| Stripe webhook testing | Skip in local mode | Requires valid Stripe signatures; test in production smoke tests |
| Rate limit testing | Purchase 100ms MTBR | Minimum allowed MTBR enables quick re-download tests |
| CI trigger | PRs to main/develop only | Save CI minutes |
| PR blocking | Required to pass | Ensure quality before merge |
| CI timeout | 5 minutes | Sufficient for all tests |
| Large file testing | Skip | Slow and resource-intensive |
| Content expiration testing | Use non-existent CID | Non-existent content returns same 404 as expired |
| 2FA endpoint testing | Skip | Not available in LocalDev |

---

## Prerequisites

- Local server running: `npm run dev:local`
- Base URL: `http://localhost:8787`
- Tests use `LocalDev` auth: `Authorization: LocalDev <test_user_id>`
- Each test run generates a unique user ID: `api_test_user_$(date +%s)`

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
| D-006 | Download expired content (non-existent) | GET | `/{never_uploaded_cid}` | 404 (same as expired) |

#### 5.2 Rate Limiting

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| D-010 | First download succeeds | GET | `/{cid}` | 200 |
| D-011 | Immediate re-download blocked | GET | `/{cid}` | 429 with `retry_after_seconds` |
| D-012 | 429 includes next_available_at | GET | `/{cid}` | Body has `next_available_at` |
| D-013 | Rate limit headers present | GET | `/{cid}` | `X-RateLimit-Content-Reset` header |
| D-014 | Get rate limit status | GET | `/api/content/{cid}/rate-limit` | 200 with current status |
| D-015 | Inline content no rate limit | GET | `/{inline_cid}` | Never returns 429 |
| D-016 | Download after MTBR expires | GET | `/{cid}` | 200 after waiting 100ms+ |

### 6. Rate Limit Purchase Tests (`test-local-ratelimit-purchase.sh`)

**Note:** Tests purchase 100ms MTBR (minimum allowed) to enable rapid re-download testing.

| Test ID | Test Name | Method | Endpoint | Expected Result |
|---------|-----------|--------|----------|-----------------|
| R-001 | Purchase rate limit reduction | POST | `/api/content/rate-limit/purchase` | 200 with new MTBR |
| R-002 | Purchase 100ms MTBR | POST | `/api/content/rate-limit/purchase` | MTBR set to 100ms |
| R-003 | Download succeeds after 100ms wait | GET | `/{cid}` | 200 after short wait |
| R-004 | Purchase deducts balance | POST | `/api/content/rate-limit/purchase` | Balance reduced |
| R-005 | Purchase creates transaction | GET | `/api/balance/history` | Shows `rate_limit_purchase` |
| R-006 | Cannot purchase for inline | POST | `/api/content/rate-limit/purchase` | 400 for inline content |
| R-007 | Cannot exceed retention | POST | `/api/content/rate-limit/purchase` | 400 if duration > retention |
| R-008 | Insufficient balance rejected | POST | `/api/content/rate-limit/purchase` | 400 with `insufficient_balance` |
| R-009 | Invalid CID rejected | POST | `/api/content/rate-limit/purchase` | 404 for non-existent CID |
| R-010 | Purchase validates MTBR minimum | POST | `/api/content/rate-limit/purchase` | 400 if MTBR < 100ms |

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

## Skipped Tests (By Design)

The following are explicitly **not tested** in this suite:

| Feature | Reason |
|---------|--------|
| API key reveal | Requires Clerk session freshness (<5 min) |
| Logout endpoint | Clerk-specific, returns 501 for LocalDev |
| Stripe webhooks | Requires valid Stripe signatures |
| Large file uploads | Slow and resource-intensive |
| Content expiration | Time-based; use non-existent CID as proxy |
| 2FA-protected endpoints | Not available in LocalDev auth |
| Account deletion | Requires 2FA verification |

---

## GitHub Actions Integration

### Workflow: `local-api-tests.yml`

```yaml
name: Local API Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  api-tests:
    name: Run Local API Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5

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
          echo $! > /tmp/server.pid

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

      - name: Run API Tests
        run: bash scripts/run-all-api-tests.sh

      - name: Stop server
        if: always()
        run: |
          if [ -f /tmp/server.pid ]; then
            kill $(cat /tmp/server.pid) 2>/dev/null || true
          fi
```

### Master Test Runner: `scripts/run-all-api-tests.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "Running All Local API Tests"
echo "============================================"

# Run tests in priority order (P0 first, then P1, etc.)
# Tests are sequential and may share state

bash "$SCRIPT_DIR/api-tests/test-local-health.sh"
bash "$SCRIPT_DIR/api-tests/test-local-auth.sh"
bash "$SCRIPT_DIR/api-tests/test-local-balance.sh"
bash "$SCRIPT_DIR/api-tests/test-local-upload.sh"
bash "$SCRIPT_DIR/api-tests/test-local-download.sh"
bash "$SCRIPT_DIR/api-tests/test-local-ratelimit-purchase.sh"
bash "$SCRIPT_DIR/api-tests/test-local-extension.sh"
bash "$SCRIPT_DIR/api-tests/test-local-user.sh"
bash "$SCRIPT_DIR/api-tests/test-local-donation.sh"
bash "$SCRIPT_DIR/api-tests/test-local-errors.sh"
bash "$SCRIPT_DIR/api-tests/test-local-concurrent.sh"

echo ""
echo "============================================"
echo "All API Tests Completed Successfully"
echo "============================================"
```

### Test Script Template

Each test script follows this pattern:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_USER="api_test_user_$(date +%s)_$$"
AUTH_HEADER="Authorization: LocalDev $TEST_USER"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
TOTAL=0
PASSED=0
FAILED=0

# Helper functions
pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((PASSED++))
  ((TOTAL++))
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  ((FAILED++))
  ((TOTAL++))
}

info() {
  echo -e "${YELLOW}ℹ️  INFO${NC}: $1"
}

# Test implementations here...

# Summary
echo ""
echo "=========================================="
echo "Test Summary: $TOTAL total, $PASSED passed, $FAILED failed"
echo "=========================================="
[ $FAILED -eq 0 ] && exit 0 || exit 1
```

---

## Test Priority Matrix

| Priority | Test Suite | Tests | Reason |
|----------|------------|-------|--------|
| P0 (Critical) | Health & Config | 10 | Basic availability |
| P0 (Critical) | Auth - Unauthenticated | 6 | Security boundary |
| P0 (Critical) | Auth - LocalDev | 7 | Required for all other tests |
| P0 (Critical) | Auth - API Keys | 12 | Important auth flow |
| P1 (High) | Upload | 18 | Core functionality |
| P1 (High) | Download | 17 | Core functionality |
| P1 (High) | Balance | 10 | Money handling |
| P2 (Medium) | Rate Limiting | 10 | Important feature |
| P2 (Medium) | Error Handling | 6 | User experience |
| P3 (Low) | Content Extension | 6 | Less common flow |
| P3 (Low) | User Data | 5 | Less common flow |
| P3 (Low) | Donations | 4 | Less common flow |
| P3 (Low) | Concurrent Tests | 4 | Edge cases |

**Total: 115 tests**

---

## File Structure

```
scripts/
├── api-tests/
│   ├── common.sh                        # Shared utilities and helpers
│   ├── test-local-health.sh             # H-001 to H-010
│   ├── test-local-auth.sh               # A-001 to A-031
│   ├── test-local-balance.sh            # B-001 to B-010
│   ├── test-local-upload.sh             # U-001 to U-035
│   ├── test-local-download.sh           # D-001 to D-016
│   ├── test-local-ratelimit-purchase.sh # R-001 to R-010
│   ├── test-local-extension.sh          # E-001 to E-006
│   ├── test-local-user.sh               # UD-001 to UD-005
│   ├── test-local-donation.sh           # DN-001 to DN-004
│   ├── test-local-errors.sh             # ERR-001 to ERR-006
│   └── test-local-concurrent.sh         # C-001 to C-004
└── run-all-api-tests.sh                 # Master runner

.github/workflows/
└── local-api-tests.yml                  # CI workflow
```

---

## npm Scripts (to be added to package.json)

```json
{
  "scripts": {
    "test:api": "bash scripts/run-all-api-tests.sh",
    "test:api:health": "bash scripts/api-tests/test-local-health.sh",
    "test:api:auth": "bash scripts/api-tests/test-local-auth.sh",
    "test:api:balance": "bash scripts/api-tests/test-local-balance.sh",
    "test:api:upload": "bash scripts/api-tests/test-local-upload.sh",
    "test:api:download": "bash scripts/api-tests/test-local-download.sh",
    "test:api:ratelimit": "bash scripts/api-tests/test-local-ratelimit-purchase.sh",
    "test:api:extension": "bash scripts/api-tests/test-local-extension.sh",
    "test:api:user": "bash scripts/api-tests/test-local-user.sh",
    "test:api:donation": "bash scripts/api-tests/test-local-donation.sh",
    "test:api:errors": "bash scripts/api-tests/test-local-errors.sh",
    "test:api:concurrent": "bash scripts/api-tests/test-local-concurrent.sh"
  }
}
```

---

## Next Steps

1. Implement `common.sh` with shared utilities (curl helpers, assertions, setup)
2. Implement test scripts in priority order (P0 → P1 → P2 → P3)
3. Add npm scripts to `package.json`
4. Create GitHub Actions workflow file
5. Configure branch protection to require API tests
6. Run full suite and measure actual execution time
