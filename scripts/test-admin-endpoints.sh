#!/bin/bash
# Test script for Admin System Management endpoints
# Tests admin authentication and all admin endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
BASE_URL="${BASE_URL:-http://localhost:8787}"
ADMIN_TOKEN="${ADMIN_TOKEN:-test-admin-token-for-local-dev-only}"
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
  echo -e "${YELLOW}ℹ️  INFO${NC}: $1"
}

# Test 1: Admin authentication - missing token
log_test "Admin authentication - missing token"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "Missing token returns 401"
else
  log_fail "Expected 401, got $HTTP_CODE"
  echo "Response: $BODY"
fi

# Test 2: Admin authentication - invalid token
log_test "Admin authentication - invalid token"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: invalid-token" \
  "$BASE_URL/api/admin/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "401" ]; then
  log_pass "Invalid token returns 401"
else
  log_fail "Expected 401, got $HTTP_CODE"
  echo "Response: $BODY"
fi

# Test 3: Admin authentication - valid token
log_test "Admin authentication - valid token"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Valid token returns 200"
  echo "Response: $BODY" | head -c 200
else
  log_fail "Expected 200, got $HTTP_CODE"
  echo "Response: $BODY"
fi

# Test 4: Get platform statistics
log_test "GET /api/admin/stats"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "timestamp"; then
  log_pass "Platform stats endpoint works"
  echo "Sample response: $BODY" | head -c 200
else
  log_fail "Platform stats failed"
  echo "Response: $BODY"
fi

# Test 5: Get financial statistics
log_test "GET /api/admin/stats/financial"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/stats/financial")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "summary"; then
  log_pass "Financial stats endpoint works"
else
  log_fail "Financial stats failed"
  echo "Response: $BODY"
fi

# Test 6: Get content statistics
log_test "GET /api/admin/stats/content"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/stats/content")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "total_files"; then
  log_pass "Content stats endpoint works"
else
  log_fail "Content stats failed"
  echo "Response: $BODY"
fi

# Test 7: Get user statistics
log_test "GET /api/admin/stats/users"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/stats/users")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "total_accounts"; then
  log_pass "User stats endpoint works"
else
  log_fail "User stats failed"
  echo "Response: $BODY"
fi

# Test 8: Get admin health check
log_test "GET /api/admin/health"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "response_times"; then
  log_pass "Admin health endpoint works"
  echo "Response: $BODY" | head -c 200
else
  log_fail "Admin health check failed"
  echo "Response: $BODY"
fi

# Test 9: Get alerts
log_test "GET /api/admin/alerts"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/alerts")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "alerts"; then
  log_pass "Alerts endpoint works"
else
  log_fail "Alerts endpoint failed"
  echo "Response: $BODY"
fi

# Test 10: Get audit log
log_test "GET /api/admin/audit-log"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/audit-log")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "entries"; then
  log_pass "Audit log endpoint works"
  echo "Response: $BODY" | head -c 200
else
  log_fail "Audit log failed"
  echo "Response: $BODY"
fi

# Test 11: Export data - invalid type
log_test "GET /api/admin/export?type=invalid"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/export?type=invalid")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "400" ]; then
  log_pass "Invalid export type returns 400"
else
  log_fail "Expected 400, got $HTTP_CODE"
fi

# Test 12: Export data - valid type
log_test "GET /api/admin/export?type=audit"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$BASE_URL/api/admin/export?type=audit")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Export endpoint works"
  echo "CSV preview: $BODY" | head -c 200
else
  log_fail "Export failed"
  echo "Response: $BODY"
fi

# Print summary
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Total tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed${NC}"
  exit 1
fi
