#!/bin/bash
# Error Handling Tests (ERR-*)
# Tests error handling and edge cases

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Error Handling Tests"

log_section "Malformed Request Tests"

# ERR-001: Invalid JSON Body
log_info "Testing with invalid JSON..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{invalid json}' \
  "Content-Type: application/json"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "422" ]; then
  log_pass "ERR-001" "Invalid JSON Body" "Correctly rejects invalid JSON"
else
  log_fail "ERR-001" "Invalid JSON Body" "Expected 400/422, got HTTP $HTTP_STATUS"
fi

# ERR-002: Missing Required Fields
log_info "Testing with missing required fields..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 1000}' \
  "Content-Type: application/json"
# Missing retention_months field
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "422" ] || [ "$HTTP_STATUS" = "200" ]; then
  # 200 might be OK if field has default
  log_pass "ERR-002" "Missing Required Fields" "Handles missing fields (HTTP $HTTP_STATUS)"
else
  log_fail "ERR-002" "Missing Required Fields" "Unexpected status: HTTP $HTTP_STATUS"
fi

# ERR-003: Invalid Content-Type
log_info "Testing with wrong content-type..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 1000, "retention_months": 1}' \
  "Content-Type: text/plain"
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "415" ] || [ "$HTTP_STATUS" = "200" ]; then
  # Some servers might be lenient
  log_pass "ERR-003" "Invalid Content-Type" "Handles wrong content-type (HTTP $HTTP_STATUS)"
else
  log_fail "ERR-003" "Invalid Content-Type" "Unexpected status: HTTP $HTTP_STATUS"
fi

# ERR-004: Method Not Allowed
log_info "Testing with wrong HTTP method..."
http_get "$TARGET_URL/api/payments/calculate"
if [ "$HTTP_STATUS" = "405" ] || [ "$HTTP_STATUS" = "404" ]; then
  log_pass "ERR-004" "Method Not Allowed" "Rejects GET on POST-only endpoint"
else
  log_fail "ERR-004" "Method Not Allowed" "Expected 405/404, got HTTP $HTTP_STATUS"
fi

# ERR-005: Unknown API Endpoint
log_info "Testing unknown endpoint..."
http_get "$TARGET_URL/api/nonexistent/endpoint/12345"
assert_http_status "$HTTP_STATUS" "404" "ERR-005" "Unknown API Endpoint"

log_section "Error Response Format"

# ERR-006: Server Error Response Format
log_info "Checking error response format..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": -1000, "retention_months": 1}' \
  "Content-Type: application/json"
if is_json "$HTTP_BODY"; then
  if echo "$HTTP_BODY" | jq -e '.error' > /dev/null 2>&1 || \
     echo "$HTTP_BODY" | jq -e '.message' > /dev/null 2>&1; then
    log_pass "ERR-006" "Server Error Response Format" "Error response is JSON with error field"
  else
    log_fail "ERR-006" "Server Error Response Format" "JSON response missing error/message field"
  fi
else
  log_fail "ERR-006" "Server Error Response Format" "Error response is not JSON"
fi

# ERR-007: No Stack Traces Exposed
log_info "Checking for stack traces in errors..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": "invalid", "retention_months": 1}' \
  "Content-Type: application/json"
if echo "$HTTP_BODY" | grep -qi "stack\|trace\|\.js:\|line [0-9]\+\|at "; then
  log_fail "ERR-007" "No Stack Traces Exposed" "Stack trace found in error response"
else
  log_pass "ERR-007" "No Stack Traces Exposed" "No stack traces in error response"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
