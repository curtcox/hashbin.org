#!/bin/bash
# Test script for Auth Gate functionality
# Tests that protected pages don't immediately redirect when auth is valid

set -e

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
echo "Auth Gate Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# ==========================================
# Test 1: Protected Pages Serve HTML Content
# ==========================================
log_test "Protected pages serve HTML content (not immediate API redirect)"

# Test deposit page (extensionless URL)
RESPONSE=$(curl -s "$BASE_URL/deposit")
if echo "$RESPONSE" | grep -q '<title>Add Funds - HashBin.org</title>'; then
  log_pass "deposit page serves HTML content"
else
  log_fail "deposit page does not serve expected HTML"
  echo "Response preview: ${RESPONSE:0:200}"
fi

# Test upload page (extensionless URL)
RESPONSE=$(curl -s "$BASE_URL/upload")
if echo "$RESPONSE" | grep -q '<title>Upload Content - HashBin.org</title>'; then
  log_pass "upload page serves HTML content"
else
  log_fail "upload page does not serve expected HTML"
  echo "Response preview: ${RESPONSE:0:200}"
fi

# ==========================================
# Test 2: Auth Gate Script is Present
# ==========================================
log_test "Auth gate protection script is present in protected pages"

# Test deposit page
RESPONSE=$(curl -s "$BASE_URL/deposit")
if echo "$RESPONSE" | grep -q 'auth-gate.js'; then
  log_pass "deposit page includes auth-gate.js"
else
  log_fail "deposit page missing auth-gate.js"
fi

# Test upload page
RESPONSE=$(curl -s "$BASE_URL/upload")
if echo "$RESPONSE" | grep -q 'auth-gate.js'; then
  log_pass "upload page includes auth-gate.js"
else
  log_fail "upload page missing auth-gate.js"
fi

# ==========================================
# Test 3: Auth Gate Module Exists
# ==========================================
log_test "Auth gate JavaScript module is accessible"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/js/auth-gate.js")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  if echo "$BODY" | grep -q 'requireAuth'; then
    log_pass "auth-gate.js module is accessible and contains requireAuth"
  else
    log_fail "auth-gate.js module missing requireAuth function"
  fi
else
  log_fail "auth-gate.js module not accessible (HTTP $HTTP_CODE)"
fi

# ==========================================
# Test 4: Wait for Clerk Init Logic is Present
# ==========================================
log_test "Auth gate includes proper Clerk initialization wait logic"

RESPONSE=$(curl -s "$BASE_URL/js/auth-gate.js")
if echo "$RESPONSE" | grep -q 'waitForClerkInit'; then
  log_pass "waitForClerkInit function is present"
else
  log_fail "waitForClerkInit function is missing"
fi

# Check for proper loading check
if echo "$RESPONSE" | grep -q 'Clerk.loaded\|Clerk.load()'; then
  log_pass "Auth gate checks for Clerk loaded state"
else
  log_fail "Auth gate missing Clerk loaded state check"
fi

# ==========================================
# Test 5: Dashboard Page Exists
# ==========================================
log_test "Dashboard page (where authenticated users should land) exists"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/dashboard")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "dashboard page is accessible"
else
  log_fail "dashboard page not accessible (HTTP $HTTP_CODE)"
fi

# ==========================================
# Test 6: No Immediate Redirects in Static Content
# ==========================================
log_test "Protected pages don't contain server-side redirects"

# Check deposit page for redirect meta tags
RESPONSE=$(curl -s "$BASE_URL/deposit")
if echo "$RESPONSE" | grep -qi '<meta.*http-equiv.*refresh'; then
  log_fail "deposit page contains meta refresh redirect"
else
  log_pass "deposit page has no meta refresh redirect"
fi

# Check upload page for redirect meta tags
RESPONSE=$(curl -s "$BASE_URL/upload")
if echo "$RESPONSE" | grep -qi '<meta.*http-equiv.*refresh'; then
  log_fail "upload page contains meta refresh redirect"
else
  log_pass "upload page has no meta refresh redirect"
fi

# ==========================================
# Test 7: Auth Utilities Module Exists
# ==========================================
log_test "Auth utilities (utils.js) module is accessible"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/js/utils.js")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  if echo "$BODY" | grep -q 'redirectWithReturn'; then
    log_pass "utils.js contains redirectWithReturn function"
  else
    log_fail "utils.js missing redirectWithReturn function"
  fi
else
  log_fail "utils.js not accessible (HTTP $HTTP_CODE)"
fi

# ==========================================
# Test 8: Auth Module Exists
# ==========================================
log_test "Auth module (auth.js) is accessible"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/js/auth.js")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  if echo "$BODY" | grep -q 'getAuthState'; then
    log_pass "auth.js contains getAuthState function"
  else
    log_fail "auth.js missing getAuthState function"
  fi
else
  log_fail "auth.js not accessible (HTTP $HTTP_CODE)"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
