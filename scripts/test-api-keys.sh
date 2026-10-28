#!/bin/bash
# Test script for API Keys feature
# Structural checks for scoped, hash-only API keys
# This script runs against a local wrangler dev server

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
BASE_URL="${BASE_URL:-http://localhost:8787}"
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_test() {
  echo ""
  echo "=========================================="
  echo "TEST: $1"
  echo "=========================================="
}

log_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  PASSED_TESTS=$((PASSED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

log_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

log_skip() {
  echo -e "${YELLOW}⊘ SKIP${NC}: $1"
}

log_info() {
  echo "ℹ️  $1"
}

# Start tests
echo ""
echo "=========================================="
echo "API Keys Feature Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# Each check: a description, then a command that must succeed
check() {
  local description="$1"; shift
  log_test "$description"
  if "$@"; then
    log_pass "$description"
  else
    log_fail "$description"
  fi
}
absent() { ! grep -rqE --exclude="*.test.js" "$1" "${@:2}"; }

check "Keys are signed, routable hbk_ keys" grep -q "API_KEY_PATTERN = keyPattern('hbk')" "$REPO_ROOT/src/auth/download-tokens.js"
check "Key creation requires scopes" grep -q "parseScopes(body.scopes, 'key')" "$REPO_ROOT/src/api/auth.js"
check "Key updates can only narrow scopes" grep -q "SCOPE_WIDENING" "$REPO_ROOT/src/durable-objects/user-profile.js"
check "Pre-scope keys are revoked when seen" grep -q "function retireUnscopedKeys" "$REPO_ROOT/src/durable-objects/user-profile.js"
check "Key management routes are session-only" grep -q "path: '/api/auth/apikeys', access: SESSION" "$REPO_ROOT/src/index.js"
check "Keys default to 90 days and last at most a year" grep -q "DEFAULT_KEY_LIFETIME_DAYS = 90" "$REPO_ROOT/src/auth/utils.js"
check "No reversible key storage or reveal endpoint" absent "encryptApiKey|decryptApiKey|key_encrypted|/reveal" "$REPO_ROOT/src" "$REPO_ROOT/frontend/js"
check "No legacy hb_ / hb2_ key formats are accepted" absent "LEGACY_PREFIX|hb_live_|startsWith\('hb2_'\)" "$REPO_ROOT/src/auth" "$REPO_ROOT/workers/256t-content/src/funding.js"
check "No key lookup table is consulted" absent "KEY_REGISTRY" "$REPO_ROOT/src/auth" "$REPO_ROOT/src/api" "$REPO_ROOT/workers/256t-content/src"
check "Funded key downloads need downloads:spend" grep -q "k.scopes?.includes('downloads:spend')" "$REPO_ROOT/src/utils/download-budget.js"

# ==========================================
# Print Summary
# ==========================================
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS"
echo "Failed:       $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
