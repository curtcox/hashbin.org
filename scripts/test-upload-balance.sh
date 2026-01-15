#!/bin/bash
# Test script for upload page balance loading
# Tests that upload.js correctly uses authenticatedFetch for balance API calls

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
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

log_info() {
  echo "ℹ️  $1"
}

# Start tests
echo ""
echo "=========================================="
echo "Upload Page Balance Loading Tests"
echo "=========================================="
echo ""

# ==========================================
# Test 1: upload.js imports authenticatedFetch
# ==========================================
log_test "upload.js imports authenticatedFetch utility"

if grep -q "import.*authenticatedFetch.*from.*utils.js" frontend/js/upload.js; then
  log_pass "upload.js imports authenticatedFetch from utils.js"
else
  log_fail "upload.js does not import authenticatedFetch"
fi

# ==========================================
# Test 2: upload.js imports getSessionToken
# ==========================================
log_test "upload.js imports getSessionToken for FormData uploads"

if grep -q "import.*getSessionToken.*from.*auth.js" frontend/js/upload.js; then
  log_pass "upload.js imports getSessionToken from auth.js"
else
  log_fail "upload.js does not import getSessionToken"
fi

# ==========================================
# Test 3: loadBalance uses authenticatedFetch
# ==========================================
log_test "loadBalance function uses authenticatedFetch instead of fetch"

# Check that loadBalance uses authenticatedFetch
if grep -A 10 "async function loadBalance" frontend/js/upload.js | grep -q "authenticatedFetch"; then
  log_pass "loadBalance uses authenticatedFetch"
else
  log_fail "loadBalance does not use authenticatedFetch"
fi

# Verify it doesn't use plain fetch with credentials: 'include'
if grep -A 10 "async function loadBalance" frontend/js/upload.js | grep -q "credentials: 'include'"; then
  log_fail "loadBalance still uses credentials: 'include' (should be removed)"
else
  log_pass "loadBalance does not use deprecated credentials: 'include'"
fi

# ==========================================
# Test 4: Upload handler uses Authorization header
# ==========================================
log_test "handleUpload function adds Authorization header for file uploads"

# Check that handleUpload gets session token
if grep -A 40 "async function handleUpload" frontend/js/upload.js | grep -q "getSessionToken()"; then
  log_pass "handleUpload calls getSessionToken()"
else
  log_fail "handleUpload does not call getSessionToken()"
fi

# Check that handleUpload adds Authorization header
if grep -A 40 "async function handleUpload" frontend/js/upload.js | grep -q "'Authorization'.*Bearer"; then
  log_pass "handleUpload adds Authorization header with Bearer token"
else
  log_fail "handleUpload does not add Authorization header"
fi

# ==========================================
# Test 5: authenticatedFetch utility exists
# ==========================================
log_test "authenticatedFetch utility function exists in utils.js"

if grep -q "export async function authenticatedFetch" frontend/js/utils.js; then
  log_pass "authenticatedFetch function exists in utils.js"
else
  log_fail "authenticatedFetch function not found in utils.js"
fi

# Check that authenticatedFetch adds Authorization header
if grep -A 15 "export async function authenticatedFetch" frontend/js/utils.js | grep -q "Authorization"; then
  log_pass "authenticatedFetch adds Authorization header"
else
  log_fail "authenticatedFetch does not add Authorization header"
fi

# ==========================================
# Test 6: Balance endpoint requires authentication
# ==========================================
log_test "Balance API endpoint requires authentication"

if grep -A 5 "export async function handleGetBalance" src/api/balance.js | grep -q "authenticate(request, env)"; then
  log_pass "handleGetBalance calls authenticate middleware"
else
  log_fail "handleGetBalance does not call authenticate middleware"
fi

if grep -A 10 "export async function handleGetBalance" src/api/balance.js | grep -q "authResult.authenticated"; then
  log_pass "handleGetBalance checks authentication result"
else
  log_fail "handleGetBalance does not check authentication result"
fi

# ==========================================
# Test 7: Balance endpoint returns 401 for unauthenticated requests
# ==========================================
log_test "Balance endpoint returns 401 for unauthenticated users"

if grep -A 15 "!authResult.authenticated" src/api/balance.js | grep -q "status: 401"; then
  log_pass "Balance endpoint returns 401 status for unauthenticated requests"
else
  log_fail "Balance endpoint does not return 401 for unauthenticated requests"
fi

# ==========================================
# Test 8: Upload page is protected by auth gate
# ==========================================
log_test "Upload page requires authentication via auth-gate.js"

if grep -q "auth-gate.js" frontend/upload.html; then
  log_pass "upload.html includes auth-gate.js"
else
  log_fail "upload.html does not include auth-gate.js"
fi

if grep -q "requireAuth" frontend/upload.html; then
  log_pass "upload.html calls requireAuth()"
else
  log_fail "upload.html does not call requireAuth()"
fi

# ==========================================
# Test 9: Error handling for authentication failures
# ==========================================
log_test "Upload handles authentication errors gracefully"

# Check that loadBalance has try-catch
if grep -A 15 "async function loadBalance" frontend/js/upload.js | grep -q "catch (error)"; then
  log_pass "loadBalance has error handling"
else
  log_fail "loadBalance missing error handling"
fi

# Check that handleUpload checks for auth token
if grep -A 50 "async function handleUpload" frontend/js/upload.js | grep -q "if (!token)"; then
  log_pass "handleUpload checks for missing auth token"
else
  log_fail "handleUpload does not check for missing auth token"
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
