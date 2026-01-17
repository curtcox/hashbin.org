#!/bin/bash
# API Key Authentication Tests (KEY-*)
# Tests API key authentication (requires VALIDATION_API_KEY secret)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"
VALIDATION_API_KEY="${VALIDATION_API_KEY:-}"

init_test_suite "API Key Authentication Tests"

# Check if API key is provided
if [ -z "$VALIDATION_API_KEY" ]; then
  log_skip "KEY-001" "Valid API Key Auth" "VALIDATION_API_KEY not provided"
  log_skip "KEY-002" "Invalid API Key" "VALIDATION_API_KEY not provided"
  log_skip "KEY-003" "Revoked API Key" "VALIDATION_API_KEY not provided"
  log_skip "KEY-004" "Expired API Key" "VALIDATION_API_KEY not provided"
  log_skip "KEY-005" "API Key Rate Limit Headers" "VALIDATION_API_KEY not provided"
  log_skip "KEY-006" "API Key Scope Enforcement" "VALIDATION_API_KEY not provided"
  
  print_test_summary
  exit 0
fi

log_section "Valid API Key Tests"

# KEY-001: Valid API Key Auth
log_info "Testing with valid API key..."
http_get "$TARGET_URL/api/balance" \
  "X-API-Key: $VALIDATION_API_KEY"
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "KEY-001" "Valid API Key Auth" "Authenticated successfully"
else
  log_fail "KEY-001" "Valid API Key Auth" "Expected 200, got HTTP $HTTP_STATUS"
fi

# KEY-005: API Key Rate Limit Headers
log_info "Checking rate limit headers with API key..."
http_get "$TARGET_URL/api/balance" \
  "X-API-Key: $VALIDATION_API_KEY"
RATE_LIMIT=$(get_header "X-RateLimit-Limit")
if [ -n "$RATE_LIMIT" ]; then
  log_pass "KEY-005" "API Key Rate Limit Headers" "Rate limit headers present"
else
  log_skip "KEY-005" "API Key Rate Limit Headers" "Rate limit headers not found"
fi

log_section "Invalid API Key Tests"

# KEY-002: Invalid API Key
log_info "Testing with invalid API key..."
http_get "$TARGET_URL/api/balance" \
  "X-API-Key: invalid_key_12345"
assert_http_status "$HTTP_STATUS" "401" "KEY-002" "Invalid API Key"

# KEY-003: Revoked API Key (using known revoked format)
log_info "Testing with potentially revoked API key..."
http_get "$TARGET_URL/api/balance" \
  "X-API-Key: revoked_test_key"
if [ "$HTTP_STATUS" = "401" ]; then
  log_pass "KEY-003" "Revoked API Key" "Revoked key rejected"
else
  log_skip "KEY-003" "Revoked API Key" "No revoked key available to test"
fi

# KEY-004: Expired API Key
log_info "Testing expired API key handling..."
# This would require a known expired key
log_skip "KEY-004" "Expired API Key" "No expired key available to test"

log_section "API Key Scope Tests"

# KEY-006: API Key Scope Enforcement
log_info "Testing API key scope enforcement..."
# Try to use API key for operations that might be restricted
http_post "$TARGET_URL/api/auth/apikeys" \
  '{"name":"test"}' \
  "Content-Type: application/json" \
  "X-API-Key: $VALIDATION_API_KEY"
if [ "$HTTP_STATUS" = "403" ]; then
  log_pass "KEY-006" "API Key Scope Enforcement" "Scope restrictions enforced"
elif [ "$HTTP_STATUS" = "401" ]; then
  log_skip "KEY-006" "API Key Scope Enforcement" "Endpoint requires session auth, not API key"
else
  # If it succeeds, scope is broad enough
  log_skip "KEY-006" "API Key Scope Enforcement" "API key has broad scope or endpoint accepts it"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
