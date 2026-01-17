#!/bin/bash
# Public API Tests (API-*)
# Tests public API endpoints that don't require authentication

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Public API Tests"

log_section "Payment Calculation API"

# API-001: Calculate Retention Endpoint
log_info "Testing calculate retention endpoint with valid size..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 1048576, "retention_months": 1}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "200" "API-001" "Calculate Retention Endpoint"

# API-002: Calculate Retention - Zero Size
log_info "Testing calculate with zero size..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 0, "retention_months": 1}' \
  "Content-Type: application/json"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "422" ]; then
  log_pass "API-002" "Calculate Retention - Zero Size" "Correctly rejects zero size"
else
  log_fail "API-002" "Calculate Retention - Zero Size" "Expected 400/422, got HTTP $HTTP_STATUS"
fi

# API-003: Calculate Retention - Large Size
log_info "Testing calculate with large size (1TB)..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 1099511627776, "retention_months": 1}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "200" "API-003" "Calculate Retention - Large Size"

# API-004: Calculate Retention - Invalid Input
log_info "Testing calculate with negative size..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": -1000, "retention_months": 1}' \
  "Content-Type: application/json"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "422" ]; then
  log_pass "API-004" "Calculate Retention - Invalid Input" "Correctly rejects negative size"
else
  log_fail "API-004" "Calculate Retention - Invalid Input" "Expected 400/422, got HTTP $HTTP_STATUS"
fi

log_section "Content API"

# API-005: Content HEAD Request - Non-existent
log_info "Testing HEAD request for non-existent content..."
FAKE_HASH="0000000000000000000000000000000000000000000000000000000000000000"
http_head "$TARGET_URL/api/content/$FAKE_HASH"
if [ "$HTTP_STATUS" = "404" ]; then
  log_pass "API-005" "Content HEAD Request - Non-existent" "Returns 404"
else
  log_fail "API-005" "Content HEAD Request - Non-existent" "Expected 404, got HTTP $HTTP_STATUS"
fi

# API-006: Content GET Request - Non-existent
log_info "Testing GET request for non-existent content..."
http_get "$TARGET_URL/api/content/$FAKE_HASH"
if [ "$HTTP_STATUS" = "404" ]; then
  log_pass "API-006" "Content GET Request - Non-existent" "Returns 404"
else
  log_fail "API-006" "Content GET Request - Non-existent" "Expected 404, got HTTP $HTTP_STATUS"
fi

# API-007: CID-Based Download - Non-existent
log_info "Testing CID-based download for non-existent content..."
FAKE_CID="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
http_get "$TARGET_URL/$FAKE_CID"
if [ "$HTTP_STATUS" = "404" ] || [ "$HTTP_STATUS" = "400" ]; then
  log_pass "API-007" "CID-Based Download - Non-existent" "Returns 404/400"
else
  log_fail "API-007" "CID-Based Download - Non-existent" "Expected 404/400, got HTTP $HTTP_STATUS"
fi

log_section "API Headers and Configuration"

# API-008: CORS Headers Present
log_info "Checking CORS headers on API responses..."
http_get "$TARGET_URL/api/payments/calculate" \
  "Origin: https://example.com"
CORS_HEADER=$(get_header "Access-Control-Allow-Origin")
if [ -n "$CORS_HEADER" ]; then
  log_pass "API-008" "CORS Headers Present" "CORS header: $CORS_HEADER"
else
  # CORS might only be on OPTIONS preflight, check that
  # Note: Using direct curl here because OPTIONS method is not in http_client library
  # and is only needed for this specific CORS preflight test
  local temp_status=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: POST" \
    "$TARGET_URL/api/payments/calculate" 2>/dev/null || echo "000")
  if [ "$temp_status" = "200" ] || [ "$temp_status" = "204" ]; then
    log_pass "API-008" "CORS Headers Present" "OPTIONS preflight supported"
  else
    log_skip "API-008" "CORS Headers Present" "CORS headers not found (may not be configured)"
  fi
fi

# API-009: Content-Type Headers
log_info "Checking content-type headers..."
http_get "$TARGET_URL/api/payments/calculate"
CONTENT_TYPE=$(get_header "Content-Type")
if echo "$CONTENT_TYPE" | grep -qi "json"; then
  log_pass "API-009" "Content-Type Headers" "JSON content-type for API"
else
  log_fail "API-009" "Content-Type Headers" "Expected JSON, got: $CONTENT_TYPE"
fi

# Also check HTML pages
http_get "$TARGET_URL/"
CONTENT_TYPE=$(get_header "Content-Type")
if echo "$CONTENT_TYPE" | grep -qi "html"; then
  log_pass "API-009" "Content-Type Headers" "HTML content-type for pages"
else
  log_warn "Expected HTML content-type for pages, got: $CONTENT_TYPE"
fi

# API-010: Rate Limit Headers
log_info "Checking rate limit headers..."
http_get "$TARGET_URL/api/payments/calculate"
RATE_LIMIT_HEADER=$(get_header "X-RateLimit-Limit")
if [ -n "$RATE_LIMIT_HEADER" ]; then
  log_pass "API-010" "Rate Limit Headers" "Rate limit headers present"
else
  log_skip "API-010" "Rate Limit Headers" "Rate limit headers not found (may not be implemented yet)"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
