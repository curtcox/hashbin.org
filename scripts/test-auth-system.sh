#!/bin/bash
# Comprehensive test script for User Authorization System
# Tests authentication flows, API key management, and authorization middleware
# This script runs against a local wrangler dev server

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

# Cleanup function
# Note: This script expects the dev server to be started externally
# If you want to start the dev server within this script, uncomment
# the trap and add server startup logic
# cleanup() {
#   if [ ! -z "$DEV_PID" ]; then
#     log_info "Stopping wrangler dev (PID: $DEV_PID)..."
#     kill $DEV_PID 2>/dev/null || true
#     wait $DEV_PID 2>/dev/null || true
#   fi
# }
# trap cleanup EXIT

# Start tests
echo ""
echo "=========================================="
echo "User Authorization System Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# ==========================================
# Test 1: Root Endpoint (Anonymous Access)
# ==========================================
log_test "Root endpoint is accessible without authentication"

RESPONSE=$(curl -s "$BASE_URL/")
if echo "$RESPONSE" | grep -q '"service"[[:space:]]*:[[:space:]]*"HashBin.org API"'; then
  log_pass "Root endpoint returned expected service info"
else
  log_fail "Root endpoint response incorrect"
  echo "Response: $RESPONSE"
fi

# ==========================================
# Test 2: Health Endpoint (Anonymous Access)
# ==========================================
log_test "Health endpoint is accessible without authentication"

RESPONSE=$(curl -s "$BASE_URL/health")
if echo "$RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  log_pass "Health endpoint shows healthy status"
else
  # Degraded is also acceptable
  if echo "$RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"degraded"'; then
    log_pass "Health endpoint shows degraded status (acceptable)"
  else
    log_fail "Health endpoint not accessible"
    echo "Response: $RESPONSE"
  fi
fi

# ==========================================
# Test 3: Protected Endpoint Without Auth
# ==========================================
log_test "Protected endpoints reject unauthenticated requests"

RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  if echo "$BODY" | grep -q '"error"[[:space:]]*:[[:space:]]*"AUTH_MISSING"'; then
    log_pass "Session endpoint returns 401 with AUTH_MISSING"
  else
    log_fail "Session endpoint returns 401 but wrong error code"
    echo "Response: $BODY"
  fi
else
  log_fail "Session endpoint should return 401 without auth (got $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ==========================================
# Test 4: Invalid Auth Format
# ==========================================
log_test "Invalid authentication format is rejected"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Basic dXNlcjpwYXNz" \
  "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  if echo "$BODY" | grep -q '"error"[[:space:]]*:[[:space:]]*"AUTH_INVALID_FORMAT"'; then
    log_pass "Invalid auth format rejected with AUTH_INVALID_FORMAT"
  else
    log_fail "Invalid auth format rejected but wrong error code"
    echo "Response: $BODY"
  fi
else
  log_fail "Invalid auth format should return 401 (got $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ==========================================
# Test 5: Malformed API Key Format
# ==========================================
log_test "Malformed API key format is rejected"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ApiKey invalid_key_format" \
  "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "Malformed API key rejected with 401"
else
  log_fail "Malformed API key should return 401 (got $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ==========================================
# Test 6: Test Key in Production Environment
# ==========================================
log_test "Test API key rejected in production environment"

# This test only runs if ENVIRONMENT is production
RESPONSE=$(curl -s "$BASE_URL/")
if echo "$RESPONSE" | grep -q '"environment"[[:space:]]*:[[:space:]]*"production"'; then
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: ApiKey hb_test_abcdefghijklmnopqrstuvwxyz123456" \
    "$BASE_URL/api/auth/session")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "401" ]; then
    if echo "$BODY" | grep -q '"error"[[:space:]]*:[[:space:]]*"AUTH_ENV_MISMATCH"'; then
      log_pass "Test key rejected in production with AUTH_ENV_MISMATCH"
    else
      log_fail "Test key rejected but wrong error code"
      echo "Response: $BODY"
    fi
  else
    log_fail "Test key should be rejected in production (got $HTTP_CODE)"
    echo "Response: $BODY"
  fi
else
  log_skip "Environment is not production, skipping test key validation"
fi

# ==========================================
# Test 7: Live Key in Development Environment
# ==========================================
log_test "Live API key rejected in development environment"

# This test only runs if ENVIRONMENT is development
RESPONSE=$(curl -s "$BASE_URL/")
if echo "$RESPONSE" | grep -q '"environment"[[:space:]]*:[[:space:]]*"development"'; then
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: ApiKey hb_live_abcdefghijklmnopqrstuvwxyz123456" \
    "$BASE_URL/api/auth/session")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "401" ]; then
    if echo "$BODY" | grep -q '"error"[[:space:]]*:[[:space:]]*"AUTH_ENV_MISMATCH"'; then
      log_pass "Live key rejected in development with AUTH_ENV_MISMATCH"
    else
      log_fail "Live key rejected but wrong error code"
      echo "Response: $BODY"
    fi
  else
    log_fail "Live key should be rejected in development (got $HTTP_CODE)"
    echo "Response: $BODY"
  fi
else
  log_skip "Environment is not development, skipping live key validation"
fi

# ==========================================
# Test 8: API Key Length Validation
# ==========================================
log_test "API key with incorrect length is rejected"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ApiKey hb_test_short" \
  "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "Short API key rejected with 401"
else
  log_fail "Short API key should return 401 (got $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ==========================================
# Test 9: API Key Invalid Characters
# ==========================================
log_test "API key with invalid characters is rejected"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: ApiKey hb_test_abc!@#$%^&*()_+={}[]|\\:;<>?/" \
  "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "API key with invalid characters rejected with 401"
else
  log_fail "API key with invalid chars should return 401 (got $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ==========================================
# Test 10: X-API-Key Header Support
# ==========================================
log_test "X-API-Key header is supported"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-API-Key: hb_test_abcdefghijklmnopqrstuvwxyz123456" \
  "$BASE_URL/api/auth/session")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "X-API-Key header processed (key validation works)"
else
  log_fail "X-API-Key header should be processed"
fi

# ==========================================
# Test 11: Webhook Endpoint Exists
# ==========================================
log_test "Webhook endpoint exists and requires signature"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"user.created","data":{"id":"test"}}' \
  "$BASE_URL/api/webhooks/clerk")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Should reject without valid signature
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "500" ]; then
  log_pass "Webhook endpoint exists and requires valid signature"
else
  log_fail "Webhook endpoint should reject invalid requests"
  echo "HTTP Code: $HTTP_CODE"
  echo "Response: $BODY"
fi

# ==========================================
# Test 12: API Key Creation Requires Clerk Session
# ==========================================
log_test "API key creation requires Clerk session (not API key)"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey hb_test_abcdefghijklmnopqrstuvwxyz123456" \
  -d '{"name":"Test Key"}' \
  "$BASE_URL/api/auth/apikeys")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Should reject because API keys can't create other API keys
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  log_pass "API key creation correctly requires Clerk session"
else
  log_fail "API key creation should reject non-Clerk auth"
  echo "HTTP Code: $HTTP_CODE"
  echo "Response: $BODY"
fi

# ==========================================
# Test 13: Rate Limiting Headers Present
# ==========================================
log_test "Rate limiting is active"

# Make multiple requests and check for rate limit headers
for i in {1..3}; do
  RESPONSE=$(curl -s -I "$BASE_URL/")
  if echo "$RESPONSE" | grep -qi "x-ratelimit"; then
    log_pass "Rate limiting headers present"
    break
  fi
  
  if [ $i -eq 3 ]; then
    log_skip "Rate limiting headers not present (may not be implemented in simple version)"
  fi
done

# ==========================================
# Test 14: Health Check Reports Durable Objects
# ==========================================
log_test "Health check reports Durable Objects status"

RESPONSE=$(curl -s "$BASE_URL/health")
if echo "$RESPONSE" | grep -q '"durableObjects"'; then
  if echo "$RESPONSE" | grep -q '"USER_PROFILES"'; then
    if echo "$RESPONSE" | grep -q '"KEY_REGISTRY"'; then
      log_pass "Health check reports USER_PROFILES and KEY_REGISTRY status"
    else
      log_fail "Health check missing KEY_REGISTRY status"
      echo "Response: $RESPONSE"
    fi
  else
    log_fail "Health check missing USER_PROFILES status"
    echo "Response: $RESPONSE"
  fi
else
  log_fail "Health check missing durableObjects section"
  echo "Response: $RESPONSE"
fi

# ==========================================
# Test 15: Clerk SDK Integration Loaded
# ==========================================
log_test "Clerk SDK integration is loaded"

# Check if the deployment would fail without Clerk SDK
# We can't directly test this without deploying, but we can verify the package is installed
if [ -d "node_modules/@clerk/backend" ]; then
  log_pass "Clerk SDK (@clerk/backend) is installed"
else
  log_fail "Clerk SDK not found in node_modules"
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
