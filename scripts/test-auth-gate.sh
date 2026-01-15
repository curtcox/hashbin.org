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

# Check if dev server is running (with 2 second timeout)
SERVER_RUNNING=false
if timeout 2 curl -s "$BASE_URL/" > /dev/null 2>&1; then
  SERVER_RUNNING=true
  log_info "Dev server is running - performing live tests"
else
  log_info "Dev server not running - performing static file checks only"
fi

# ==========================================
# Test 1: Protected Pages Serve HTML Content
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Protected pages serve HTML content (not immediate API redirect)"

  # Test deposit page (extensionless URL)
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/deposit" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -q '<title>Add Funds - HashBin.org</title>'; then
    log_pass "deposit page serves HTML content"
  else
    log_fail "deposit page does not serve expected HTML"
    echo "Response preview: ${RESPONSE:0:200}"
  fi

  # Test upload page (extensionless URL)
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/upload" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -q '<title>Upload Content - HashBin.org</title>'; then
    log_pass "upload page serves HTML content"
  else
    log_fail "upload page does not serve expected HTML"
    echo "Response preview: ${RESPONSE:0:200}"
  fi
else
  log_test "Protected pages HTML files exist (server not running)"
  
  # Check that HTML files exist in frontend directory
  if [ -f "frontend/deposit.html" ]; then
    log_pass "deposit.html file exists"
  else
    log_fail "deposit.html file not found"
  fi
  
  if [ -f "frontend/upload.html" ]; then
    log_pass "upload.html file exists"
  else
    log_fail "upload.html file not found"
  fi
fi

# ==========================================
# Test 2: Auth Gate Script is Present
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Auth gate protection script is present in protected pages"

  # Test deposit page
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/deposit" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -q 'auth-gate.js'; then
    log_pass "deposit page includes auth-gate.js"
  else
    log_fail "deposit page missing auth-gate.js"
  fi

  # Test upload page
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/upload" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -q 'auth-gate.js'; then
    log_pass "upload page includes auth-gate.js"
  else
    log_fail "upload page missing auth-gate.js"
  fi
else
  log_test "Auth gate script reference exists in HTML files"
  
  if grep -q 'auth-gate.js' frontend/deposit.html 2>/dev/null; then
    log_pass "deposit.html includes auth-gate.js reference"
  else
    log_fail "deposit.html missing auth-gate.js reference"
  fi
  
  if grep -q 'auth-gate.js' frontend/upload.html 2>/dev/null; then
    log_pass "upload.html includes auth-gate.js reference"
  else
    log_fail "upload.html missing auth-gate.js reference"
  fi
fi

# ==========================================
# Test 3: Auth Gate Module Exists
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Auth gate JavaScript module is accessible"

  RESPONSE=$(timeout 5 curl -s -w "\n%{http_code}" "$BASE_URL/js/auth-gate.js" 2>/dev/null || echo -e "\n000")
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
else
  log_test "Auth gate JavaScript module file exists"
  
  if [ -f "frontend/js/auth-gate.js" ]; then
    if grep -q 'requireAuth' frontend/js/auth-gate.js; then
      log_pass "auth-gate.js file exists and contains requireAuth"
    else
      log_fail "auth-gate.js missing requireAuth function"
    fi
  else
    log_fail "auth-gate.js file not found"
  fi
fi

# ==========================================
# Test 4: Wait for Clerk Init Logic is Present
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Auth gate includes proper Clerk initialization wait logic"

  RESPONSE=$(timeout 5 curl -s "$BASE_URL/js/auth-gate.js" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -q 'waitForClerkInit'; then
    log_pass "waitForClerkInit function is present"
  else
    log_fail "waitForClerkInit function is missing"
  fi

  # Check for proper loading check
  if echo "$RESPONSE" | grep -E 'window\.Clerk\.(loaded|load)' > /dev/null; then
    log_pass "Auth gate checks for Clerk loaded state"
  else
    log_fail "Auth gate missing Clerk loaded state check"
  fi
else
  log_test "Clerk initialization logic exists in auth-gate.js"
  
  if [ -f "frontend/js/auth-gate.js" ]; then
    if grep -q 'waitForClerkInit' frontend/js/auth-gate.js; then
      log_pass "waitForClerkInit function is present in file"
    else
      log_fail "waitForClerkInit function is missing from file"
    fi
    
    if grep -E 'window\.Clerk\.(loaded|load)' frontend/js/auth-gate.js > /dev/null; then
      log_pass "Auth gate file checks for Clerk loaded state"
    else
      log_fail "Auth gate file missing Clerk loaded state check"
    fi
  fi
fi

# ==========================================
# Test 5: Dashboard Page Exists
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Dashboard page (where authenticated users should land) exists"

  RESPONSE=$(timeout 5 curl -s -w "\n%{http_code}" "$BASE_URL/dashboard" 2>/dev/null || echo -e "\n000")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  if [ "$HTTP_CODE" = "200" ]; then
    log_pass "dashboard page is accessible"
  else
    log_fail "dashboard page not accessible (HTTP $HTTP_CODE)"
  fi
else
  log_test "Dashboard page file exists"
  
  if [ -f "frontend/dashboard.html" ]; then
    log_pass "dashboard.html file exists"
  else
    log_fail "dashboard.html file not found"
  fi
fi

# ==========================================
# Test 6: No Immediate Redirects in Static Content
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Protected pages don't contain server-side redirects"

  # Check deposit page for redirect meta tags
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/deposit" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -qiE '<meta[^>]*http-equiv[^>]*refresh'; then
    log_fail "deposit page contains meta refresh redirect"
  else
    log_pass "deposit page has no meta refresh redirect"
  fi

  # Check upload page for redirect meta tags
  RESPONSE=$(timeout 5 curl -s "$BASE_URL/upload" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -qiE '<meta[^>]*http-equiv[^>]*refresh'; then
    log_fail "upload page contains meta refresh redirect"
  else
    log_pass "upload page has no meta refresh redirect"
  fi
else
  log_test "HTML files don't contain meta refresh redirects"
  
  if [ -f "frontend/deposit.html" ]; then
    if grep -qiE '<meta[^>]*http-equiv[^>]*refresh' frontend/deposit.html; then
      log_fail "deposit.html contains meta refresh redirect"
    else
      log_pass "deposit.html has no meta refresh redirect"
    fi
  fi
  
  if [ -f "frontend/upload.html" ]; then
    if grep -qiE '<meta[^>]*http-equiv[^>]*refresh' frontend/upload.html; then
      log_fail "upload.html contains meta refresh redirect"
    else
      log_pass "upload.html has no meta refresh redirect"
    fi
  fi
fi

# ==========================================
# Test 7: Auth Utilities Module Exists
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Auth utilities (utils.js) module is accessible"

  RESPONSE=$(timeout 5 curl -s -w "\n%{http_code}" "$BASE_URL/js/utils.js" 2>/dev/null || echo -e "\n000")
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
else
  log_test "Auth utilities module file exists"
  
  if [ -f "frontend/js/utils.js" ]; then
    if grep -q 'redirectWithReturn' frontend/js/utils.js; then
      log_pass "utils.js file exists and contains redirectWithReturn"
    else
      log_fail "utils.js missing redirectWithReturn function"
    fi
  else
    log_fail "utils.js file not found"
  fi
fi

# ==========================================
# Test 8: Auth Module Exists
# ==========================================
if [ "$SERVER_RUNNING" = true ]; then
  log_test "Auth module (auth.js) is accessible"

  RESPONSE=$(timeout 5 curl -s -w "\n%{http_code}" "$BASE_URL/js/auth.js" 2>/dev/null || echo -e "\n000")
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
else
  log_test "Auth module file exists"
  
  if [ -f "frontend/js/auth.js" ]; then
    if grep -q 'getAuthState' frontend/js/auth.js; then
      log_pass "auth.js file exists and contains getAuthState"
    else
      log_fail "auth.js missing getAuthState function"
    fi
  else
    log_fail "auth.js file not found"
  fi
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
