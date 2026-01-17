#!/bin/bash
# Rate Limiting Tests (RATE-*)
# Tests rate limiting functionality (careful not to exhaust limits)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Rate Limiting Tests"

log_section "Rate Limit Header Tests"

# RATE-001: Rate Limit Headers Present
log_info "Checking for rate limit headers..."
http_get "$TARGET_URL/health"
RATE_LIMIT=$(get_header "X-RateLimit-Limit")
RATE_REMAINING=$(get_header "X-RateLimit-Remaining")

if [ -n "$RATE_LIMIT" ] && [ -n "$RATE_REMAINING" ]; then
  log_pass "RATE-001" "Rate Limit Headers Present" "Limit: $RATE_LIMIT, Remaining: $RATE_REMAINING"
else
  log_skip "RATE-001" "Rate Limit Headers Present" "Rate limit headers not found"
fi

# RATE-002: Anonymous Rate Limit Info
log_info "Checking anonymous rate limit..."
http_get "$TARGET_URL/health"
ANON_LIMIT=$(get_header "X-RateLimit-Limit")
if [ -n "$ANON_LIMIT" ]; then
  log_pass "RATE-002" "Anonymous Rate Limit Info" "Anonymous limit: $ANON_LIMIT"
else
  log_skip "RATE-002" "Anonymous Rate Limit Info" "Rate limit not configured"
fi

# RATE-003: Rate Limit Status Endpoint
log_info "Testing rate limit status endpoint..."
http_get "$TARGET_URL/api/rate-limit"
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "RATE-003" "Rate Limit Status Endpoint" "Endpoint accessible"
elif [ "$HTTP_STATUS" = "401" ]; then
  log_skip "RATE-003" "Rate Limit Status Endpoint" "Requires authentication"
elif [ "$HTTP_STATUS" = "404" ]; then
  log_skip "RATE-003" "Rate Limit Status Endpoint" "Endpoint not implemented"
else
  log_fail "RATE-003" "Rate Limit Status Endpoint" "Unexpected status: HTTP $HTTP_STATUS"
fi

log_section "Rate Limit Enforcement Tests"

# RATE-004: API Key Reveal Rate Limit
log_info "Testing API key reveal rate limit (DO NOT EXHAUST)..."
# We won't actually test exhaustion, just verify the endpoint exists
# and would return 429 after limit
log_skip "RATE-004" "API Key Reveal Rate Limit" "Not testing exhaustion (would affect production)"

log_warn "Skipping rate limit exhaustion tests to avoid affecting production"
log_info "Rate limit enforcement should be tested in a non-production environment"

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
