#!/bin/bash
# Webhook Endpoint Tests (HOOK-*)
# Tests webhook endpoints (signature validation only)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Webhook Endpoint Tests"

log_section "Stripe Webhook Tests"

# HOOK-001: Stripe Webhook Accessible
log_info "Testing Stripe webhook accessibility..."
http_post "$TARGET_URL/api/payments/webhook" \
  '{"type":"test"}' \
  "Content-Type: application/json"
if [ "$HTTP_STATUS" != "404" ]; then
  log_pass "HOOK-001" "Stripe Webhook Accessible" "Endpoint exists (HTTP $HTTP_STATUS)"
else
  log_fail "HOOK-001" "Stripe Webhook Accessible" "Webhook endpoint returns 404"
fi

# HOOK-002: Webhook Requires Signature
log_info "Testing webhook signature requirement..."
http_post "$TARGET_URL/api/payments/webhook" \
  '{"type":"test"}' \
  "Content-Type: application/json"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ]; then
  if echo "$HTTP_BODY" | grep -qi "signature\|unauthorized\|invalid"; then
    log_pass "HOOK-002" "Webhook Requires Signature" "Rejects requests without signature"
  else
    log_fail "HOOK-002" "Webhook Requires Signature" "No signature error in response"
  fi
else
  log_fail "HOOK-002" "Webhook Requires Signature" "Expected 400/401, got HTTP $HTTP_STATUS"
fi

# HOOK-003: Invalid Signature Rejected
log_info "Testing webhook with invalid signature..."
http_post "$TARGET_URL/api/payments/webhook" \
  '{"type":"test"}' \
  "Content-Type: application/json" \
  "Stripe-Signature: t=123456,v1=invalid_signature"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "401" ]; then
  log_pass "HOOK-003" "Invalid Signature Rejected" "Rejects invalid signature"
else
  log_fail "HOOK-003" "Invalid Signature Rejected" "Expected 400/401, got HTTP $HTTP_STATUS"
fi

# HOOK-004: Webhook Accepts POST Only
log_info "Testing webhook with GET method..."
http_get "$TARGET_URL/api/payments/webhook"
if [ "$HTTP_STATUS" = "405" ] || [ "$HTTP_STATUS" = "404" ]; then
  log_pass "HOOK-004" "Webhook Accepts POST Only" "Rejects GET requests"
else
  log_fail "HOOK-004" "Webhook Accepts POST Only" "Expected 405/404, got HTTP $HTTP_STATUS"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
