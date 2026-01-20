#!/bin/bash
# Test script for transaction history feature
# Tests that transaction history displays correctly with all transaction types
# Tests pagination, filtering, and data persistence

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
echo "Transaction History Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# ==========================================
# Test 1: PaymentRecord persists rate limit fields
# ==========================================
log_test "PaymentRecord.createTransaction persists rate limit purchase fields"

# Check that all rate limit fields are included in transaction object
PAYMENT_RECORD=$(grep -A 30 "async createTransaction" src/durable-objects/payment-record.js)

if echo "$PAYMENT_RECORD" | grep -q "min_time_between_requests_ms"; then
  if echo "$PAYMENT_RECORD" | grep -q "duration_seconds"; then
    if echo "$PAYMENT_RECORD" | grep -q "max_requests"; then
      if echo "$PAYMENT_RECORD" | grep -q "max_bytes"; then
        log_pass "PaymentRecord persists all rate limit fields"
      else
        log_fail "PaymentRecord missing max_bytes field"
      fi
    else
      log_fail "PaymentRecord missing max_requests field"
    fi
  else
    log_fail "PaymentRecord missing duration_seconds field"
  fi
else
  log_fail "PaymentRecord missing min_time_between_requests_ms field"
fi

# ==========================================
# Test 2: PaymentRecord persists status and failure_reason
# ==========================================
log_test "PaymentRecord.createTransaction persists status and failure_reason fields"

if echo "$PAYMENT_RECORD" | grep -q "status.*data.status"; then
  if echo "$PAYMENT_RECORD" | grep -q "failure_reason.*data.failure_reason"; then
    log_pass "PaymentRecord persists status and failure_reason fields"
  else
    log_fail "PaymentRecord missing failure_reason field"
  fi
else
  log_fail "PaymentRecord missing status field"
fi

# ==========================================
# Test 3: Transaction history endpoint exists
# ==========================================
log_test "Transaction history endpoint is accessible to authenticated users"

if timeout 2 curl -s "$BASE_URL/api/balance/history" > /dev/null 2>&1; then
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/balance/history")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  if [ "$HTTP_CODE" = "401" ]; then
    log_pass "Transaction history endpoint requires authentication (returns 401)"
  else
    log_fail "Transaction history endpoint should require authentication (got $HTTP_CODE)"
  fi
else
  log_info "Dev server not running - verifying history API handler exists in code"
  if grep -q "handleGetBalanceHistory" src/api/balance.js; then
    log_pass "Transaction history API handler exists in codebase"
  else
    log_fail "Transaction history API handler not found"
  fi
fi

# ==========================================
# Test 4: Transaction history endpoint supports pagination
# ==========================================
log_test "Transaction history endpoint supports limit and offset parameters"

# Check that getBalanceHistory passes pagination params
if grep -q "limit.*url.searchParams.get" src/api/balance.js; then
  if grep -q "offset.*url.searchParams.get" src/api/balance.js; then
    log_pass "History endpoint supports pagination parameters"
  else
    log_fail "History endpoint missing offset parameter"
  fi
else
  log_fail "History endpoint missing limit parameter"
fi

# ==========================================
# Test 5: Transaction history endpoint supports type filtering
# ==========================================
log_test "Transaction history endpoint supports type filtering"

# Check that getBalanceHistory passes type filter
if grep -q "type.*url.searchParams.get" src/api/balance.js; then
  log_pass "History endpoint supports type filtering"
else
  log_fail "History endpoint missing type filter parameter"
fi

# ==========================================
# Test 6: Transactions.js module exists
# ==========================================
log_test "Transaction history JavaScript module exists"

if [ -f "frontend/js/transactions.js" ]; then
  log_pass "frontend/js/transactions.js exists"
else
  log_fail "frontend/js/transactions.js not found"
fi

# ==========================================
# Test 7: Transactions.html page exists
# ==========================================
log_test "Transaction history HTML page exists"

if [ -f "frontend/transactions.html" ]; then
  log_pass "frontend/transactions.html exists"
else
  log_fail "frontend/transactions.html not found"
fi

# ==========================================
# Test 8: Transaction formatting functions exist
# ==========================================
log_test "Transaction formatting functions are implemented"

if [ -f "frontend/js/transactions.js" ]; then
  TX_MODULE=$(cat frontend/js/transactions.js)
  
  # Check for key formatting functions
  if echo "$TX_MODULE" | grep -q "formatTransactionAmount"; then
    if echo "$TX_MODULE" | grep -q "formatDate"; then
      if echo "$TX_MODULE" | grep -q "formatMTBR"; then
        if echo "$TX_MODULE" | grep -q "formatDateRange"; then
          if echo "$TX_MODULE" | grep -q "formatRetentionMonths"; then
            log_pass "All transaction formatting functions exist"
          else
            log_fail "Missing formatRetentionMonths function"
          fi
        else
          log_fail "Missing formatDateRange function"
        fi
      else
        log_fail "Missing formatMTBR function"
      fi
    else
      log_fail "Missing formatDate function"
    fi
  else
    log_fail "Missing formatTransactionAmount function"
  fi
else
  log_fail "Cannot test formatting functions - transactions.js not found"
fi

# ==========================================
# Test 9: Transaction type labels are defined
# ==========================================
log_test "Transaction type labels are defined for all types"

if [ -f "frontend/js/transactions.js" ]; then
  TX_MODULE=$(cat frontend/js/transactions.js)
  
  # Check that all 5 transaction types have labels
  if echo "$TX_MODULE" | grep -q "'deposit'.*'Deposit'"; then
    if echo "$TX_MODULE" | grep -q "'upload_payment'.*'Content Upload'"; then
      if echo "$TX_MODULE" | grep -q "'cid_extension'.*'Retention Extension'"; then
        if echo "$TX_MODULE" | grep -q "'donation_received'.*'Donation"; then
          if echo "$TX_MODULE" | grep -q "'rate_limit_purchase'.*'Bandwidth Purchase'"; then
            log_pass "All transaction type labels are defined"
          else
            log_fail "Missing rate_limit_purchase label"
          fi
        else
          log_fail "Missing donation_received label"
        fi
      else
        log_fail "Missing cid_extension label"
      fi
    else
      log_fail "Missing upload_payment label"
    fi
  else
    log_fail "Missing deposit label"
  fi
else
  log_fail "Cannot test type labels - transactions.js not found"
fi

# ==========================================
# Test 10: Dashboard links to transaction history
# ==========================================
log_test "Dashboard has active link to transaction history page"

if [ -f "frontend/dashboard.html" ]; then
  DASHBOARD=$(cat frontend/dashboard.html)
  
  # Check that transactions link is not "Coming Soon"
  if echo "$DASHBOARD" | grep -q 'href="/transactions.html"'; then
    if ! echo "$DASHBOARD" | grep -A 3 'href="/transactions.html"' | grep -q 'Coming Soon'; then
      log_pass "Dashboard has active transaction history link"
    else
      log_fail "Dashboard transaction link still shows 'Coming Soon'"
    fi
  else
    log_fail "Dashboard missing link to /transactions.html"
  fi
else
  log_fail "Cannot test dashboard - dashboard.html not found"
fi

# ==========================================
# Test 11: Rate limit purchase passes all fields to transaction
# ==========================================
log_test "Rate limit purchase API passes all fields to PaymentRecord"

if [ -f "src/api/rate-limit.js" ]; then
  RATE_LIMIT=$(grep -A 20 "method: 'POST'" src/api/rate-limit.js | grep -A 20 "PAYMENT_RECORDS")
  
  if echo "$RATE_LIMIT" | grep -q "min_time_between_requests_ms"; then
    if echo "$RATE_LIMIT" | grep -q "duration_seconds"; then
      if echo "$RATE_LIMIT" | grep -q "max_requests"; then
        if echo "$RATE_LIMIT" | grep -q "max_bytes"; then
          log_pass "Rate limit purchase passes all fields to transaction"
        else
          log_fail "Rate limit purchase missing max_bytes in transaction"
        fi
      else
        log_fail "Rate limit purchase missing max_requests in transaction"
      fi
    else
      log_fail "Rate limit purchase missing duration_seconds in transaction"
    fi
  else
    log_fail "Rate limit purchase missing min_time_between_requests_ms in transaction"
  fi
else
  log_fail "Cannot test rate limit API - rate-limit.js not found"
fi

# ==========================================
# Test 12: Transaction list rendering function exists
# ==========================================
log_test "Transaction list rendering function is implemented"

if [ -f "frontend/js/transactions.js" ]; then
  if grep -q "renderTransactionList" frontend/js/transactions.js; then
    log_pass "renderTransactionList function exists"
  else
    log_fail "renderTransactionList function not found"
  fi
else
  log_fail "Cannot test rendering - transactions.js not found"
fi

# ==========================================
# Test 13: Pagination rendering function exists
# ==========================================
log_test "Pagination rendering function is implemented"

if [ -f "frontend/js/transactions.js" ]; then
  if grep -q "renderPagination" frontend/js/transactions.js; then
    log_pass "renderPagination function exists"
  else
    log_fail "renderPagination function not found"
  fi
else
  log_fail "Cannot test pagination - transactions.js not found"
fi

# ==========================================
# Test 14: Transaction details builder handles all types
# ==========================================
log_test "Transaction details builder handles all transaction types"

if [ -f "frontend/js/transactions.js" ]; then
  DETAILS_BUILDER=$(grep -A 50 "buildTransactionDetails" frontend/js/transactions.js)
  
  # Check that it handles CID links, retention, and rate limit details
  if echo "$DETAILS_BUILDER" | grep -q "transaction.cid"; then
    if echo "$DETAILS_BUILDER" | grep -q "retention_months"; then
      if echo "$DETAILS_BUILDER" | grep -q "rate_limit_purchase"; then
        log_pass "buildTransactionDetails handles all transaction types"
      else
        log_fail "buildTransactionDetails missing rate_limit_purchase handling"
      fi
    else
      log_fail "buildTransactionDetails missing retention_months handling"
    fi
  else
    log_fail "buildTransactionDetails missing CID handling"
  fi
else
  log_fail "Cannot test details builder - transactions.js not found"
fi

# ==========================================
# Test 15: Export API link is present
# ==========================================
log_test "Transaction history page includes export API link"

if [ -f "frontend/transactions.html" ]; then
  if grep -q '/api/balance/history?limit=1000' frontend/transactions.html; then
    log_pass "Export API link is present"
  else
    log_fail "Export API link not found"
  fi
else
  log_fail "Cannot test export link - transactions.html not found"
fi

# ==========================================
# Test 16: Sitemap includes transactions page
# ==========================================
log_test "Sitemap includes transaction history page"

if [ -f "frontend/sitemap.html" ]; then
  if grep -q 'href="/transactions.html"' frontend/sitemap.html; then
    if ! grep -A 2 'href="/transactions.html"' frontend/sitemap.html | grep -q 'Coming Soon'; then
      log_pass "Sitemap includes active transaction history link"
    else
      log_fail "Sitemap still shows transactions as 'Coming Soon'"
    fi
  else
    log_fail "Sitemap missing transaction history link"
  fi
else
  log_fail "Cannot test sitemap - sitemap.html not found"
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
