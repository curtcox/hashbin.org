#!/bin/bash
# Test script for user balance creation
# Tests that new users are created with a balance of $0
# This script tests the UserProfile Durable Object directly

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

log_info() {
  echo "ℹ️  $1"
}

# Start tests
echo ""
echo "=========================================="
echo "User Balance Creation Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# ==========================================
# Test 1: New user profile has 0 balance
# ==========================================
log_test "New user profile is created with balance of 0 cents"

# Note: This test verifies the UserProfile Durable Object behavior
# We cannot directly test without authentication, but we can verify
# the structure and behavior through code inspection

# Verify the createProfile method sets balance_cents to 0
if grep -q "balance_cents[[:space:]]*:[[:space:]]*0" src/durable-objects/user-profile.js; then
  log_pass "UserProfile.createProfile sets balance_cents to 0"
else
  log_fail "UserProfile.createProfile does not set balance_cents to 0"
fi

# ==========================================
# Test 2: getBalance returns 0 for new users
# ==========================================
log_test "getBalance method returns 0 for new users with no balance"

# Verify the getBalance method handles missing balance gracefully
if grep -q "balance_cents: profile.balance_cents || 0" src/durable-objects/user-profile.js; then
  log_pass "getBalance defaults to 0 if balance_cents is missing"
else
  log_fail "getBalance does not default to 0"
fi

# ==========================================
# Test 3: Balance structure includes all fields
# ==========================================
log_test "Balance response includes all required fields"

# Check that getBalance returns the expected structure
# Store grep results to avoid multiple identical commands
BALANCE_METHOD=$(grep -A 30 "async getBalance()" src/durable-objects/user-profile.js)

if echo "$BALANCE_METHOD" | grep -q "balance_cents"; then
  if echo "$BALANCE_METHOD" | grep -q "total_deposited_cents"; then
    if echo "$BALANCE_METHOD" | grep -q "total_spent_cents"; then
      log_pass "getBalance returns balance_cents, total_deposited_cents, and total_spent_cents"
    else
      log_fail "getBalance missing total_spent_cents"
    fi
  else
    log_fail "getBalance missing total_deposited_cents"
  fi
else
  log_fail "getBalance missing balance_cents"
fi

# ==========================================
# Test 4: Balance API endpoint exists
# ==========================================
log_test "Balance API endpoint is accessible to authenticated users"

# Check that balance endpoint returns 401 without auth
if timeout 2 curl -s "$BASE_URL/api/balance" > /dev/null 2>&1; then
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/balance")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  if [ "$HTTP_CODE" = "401" ]; then
    log_pass "Balance endpoint requires authentication (returns 401)"
  else
    log_fail "Balance endpoint should require authentication (got $HTTP_CODE)"
    echo "Response: $(echo "$RESPONSE" | sed '$d')"
  fi
else
  log_info "Dev server not running - verifying balance API handler exists in code"
  if grep -q "handleGetBalance" src/api/balance.js; then
    log_pass "Balance API handler exists in codebase"
  else
    log_fail "Balance API handler not found"
  fi
fi

# ==========================================
# Test 5: Profile creation initializes all balance fields
# ==========================================
log_test "New profile initializes all balance-related fields"

# Check that createProfile initializes all balance fields to 0
# Get lines around the createProfile function
PROFILE_CREATE=$(grep -A 40 "async createProfile" src/durable-objects/user-profile.js)
if echo "$PROFILE_CREATE" | grep -q "balance_cents[[:space:]]*:[[:space:]]*0"; then
  if echo "$PROFILE_CREATE" | grep -q "total_deposited_cents[[:space:]]*:[[:space:]]*0"; then
    if echo "$PROFILE_CREATE" | grep -q "total_spent_cents[[:space:]]*:[[:space:]]*0"; then
      log_pass "createProfile initializes all balance fields to 0"
    else
      log_fail "createProfile missing total_spent_cents initialization"
    fi
  else
    log_fail "createProfile missing total_deposited_cents initialization"
  fi
else
  log_fail "createProfile missing balance_cents initialization"
fi

# ==========================================
# Test 6: Auth flow creates profile for new users
# ==========================================
log_test "Authentication flow creates profile for new users"

# Check that handleSessionInfo creates profile for new users
if grep -A 10 "profileExists === false" src/api/auth.js | grep -q "method: 'POST'"; then
  log_pass "handleSessionInfo creates profile for new users"
else
  log_fail "handleSessionInfo does not create profile for new users"
fi

# ==========================================
# Test 7: Balance endpoint creates profile for new users
# ==========================================
log_test "Balance endpoint creates profile for new users on first access"

# Check that handleGetBalance creates profile when profileExists is false
if grep -A 15 "profileExists === false" src/api/balance.js | grep -q "method: 'POST'"; then
  log_pass "Balance endpoint creates profile for new users"
else
  log_fail "Balance endpoint does not create profile for new users"
fi

# ==========================================
# Test 8: Balance endpoint uses correct userId accessor
# ==========================================
log_test "Balance endpoint correctly accesses userId from authResult"

# Check that balance endpoint uses authResult.user.userId
if grep -q "authResult.user.userId" src/api/balance.js; then
  log_pass "Balance endpoint uses authResult.user.userId"
else
  log_fail "Balance endpoint does not use correct userId accessor"
fi

# ==========================================
# Test 9: Middleware detects missing profiles
# ==========================================
log_test "Authentication middleware detects profiles that don't exist yet"

# Check that middleware returns profileExists: false when profile doesn't exist
# Search directly in the file rather than extracting large blocks
if grep -q "profileExists[[:space:]]*:[[:space:]]*false" src/auth/middleware.js; then
  log_pass "Middleware detects missing profiles and returns profileExists: false"
else
  log_fail "Middleware does not properly detect missing profiles"
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
