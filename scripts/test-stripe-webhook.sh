#!/bin/bash
# Test script for Stripe webhook signature verification
# Tests that the webhook handler uses async constructEventAsync method

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
echo "Stripe Webhook Signature Verification Tests"
echo "=========================================="
echo ""
echo "Testing webhook handler implementation"
echo ""

# ==========================================
# Test 1: Uses async constructEventAsync method
# ==========================================
log_test "Webhook handler uses async constructEventAsync (not synchronous constructEvent)"

# Verify that constructEventAsync is used (async method for Cloudflare Workers)
if grep -q "constructEventAsync" src/api/payments.js; then
  log_pass "payments.js uses constructEventAsync for webhook signature verification"
else
  log_fail "payments.js does not use constructEventAsync"
fi

# ==========================================
# Test 2: Does NOT use synchronous constructEvent
# ==========================================
log_test "Webhook handler does not use synchronous constructEvent method"

# Verify that the synchronous constructEvent is NOT used
# Note: We need to check that it's not used in the webhook context
if grep -q "stripe.webhooks.constructEvent(" src/api/payments.js; then
  log_fail "payments.js still uses synchronous constructEvent (will fail in Workers)"
else
  log_pass "payments.js does not use synchronous constructEvent"
fi

# ==========================================
# Test 3: Awaits the async call
# ==========================================
log_test "Webhook handler awaits constructEventAsync call"

# Verify that await is used with constructEventAsync
if grep -q "await.*constructEventAsync" src/api/payments.js; then
  log_pass "payments.js properly awaits constructEventAsync"
else
  log_fail "payments.js does not await constructEventAsync"
fi

# ==========================================
# Test 4: Handles checkout.session.completed event
# ==========================================
log_test "Webhook handler processes checkout.session.completed events"

# Verify the handler has case for checkout.session.completed
if grep -q "case 'checkout.session.completed':" src/api/payments.js; then
  log_pass "Webhook handler includes checkout.session.completed case"
else
  log_fail "Webhook handler missing checkout.session.completed case"
fi

# ==========================================
# Test 5: Signature validation error handling
# ==========================================
log_test "Webhook handler returns 400 on signature validation errors"

# Check that signature errors return 400 status
WEBHOOK_HANDLER=$(sed -n '/async function handleStripeWebhook/,/^export/p' src/api/payments.js)

if echo "$WEBHOOK_HANDLER" | grep -q "status: 400"; then
  if echo "$WEBHOOK_HANDLER" | grep -q "Invalid signature"; then
    log_pass "Webhook handler returns 400 with 'Invalid signature' message"
  else
    log_fail "Webhook handler returns 400 but missing 'Invalid signature' message"
  fi
else
  log_fail "Webhook handler does not return 400 status for signature errors"
fi

# ==========================================
# Test 6: Webhook endpoint configuration
# ==========================================
log_test "Webhook endpoint is properly defined"

# Check that the webhook endpoint is defined in index.js
if grep -q "/api/payments/webhook" src/index.js; then
  log_pass "Webhook endpoint route is defined in index.js"
else
  log_fail "Webhook endpoint route not found in index.js"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
  echo "❌ Some tests failed"
  exit 1
else
  echo "✅ All tests passed"
  exit 0
fi
