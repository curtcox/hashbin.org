#!/bin/bash
# Performance Tests (PERF-*)
# Tests response times and performance optimizations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Performance Tests"

log_section "Response Time Tests"

# PERF-001: Root Page Response Time
log_info "Testing root page response time..."
http_get "$TARGET_URL/"
assert_response_time "$HTTP_TIME_MS" "1000" "PERF-001" "Root Page Response Time"

# PERF-002: Health Endpoint Response Time
log_info "Testing health endpoint response time..."
http_get "$TARGET_URL/health"
assert_response_time "$HTTP_TIME_MS" "2000" "PERF-002" "Health Endpoint Response Time"

# PERF-003: API Endpoint Response Time
log_info "Testing API endpoint response time..."
http_post "$TARGET_URL/api/payments/calculate" \
  '{"size_bytes": 1048576, "retention_months": 1}' \
  "Content-Type: application/json"
assert_response_time "$HTTP_TIME_MS" "500" "PERF-003" "API Endpoint Response Time"

# PERF-004: Static Asset Response Time
log_info "Testing static asset response time..."
http_get "$TARGET_URL/css/base.css"
assert_response_time "$HTTP_TIME_MS" "500" "PERF-004" "Static Asset Response Time"

log_section "Optimization Headers"

# PERF-005: Cache Headers Present
log_info "Checking cache headers on static assets..."
http_get "$TARGET_URL/css/base.css"
CACHE_HEADER=$(get_header "Cache-Control")
if [ -n "$CACHE_HEADER" ]; then
  log_pass "PERF-005" "Cache Headers Present" "Cache-Control: $CACHE_HEADER"
else
  log_skip "PERF-005" "Cache Headers Present" "No Cache-Control header found"
fi

# PERF-006: Gzip/Brotli Compression
log_info "Checking compression..."
http_get "$TARGET_URL/"
ENCODING_HEADER=$(get_header "Content-Encoding")
if echo "$ENCODING_HEADER" | grep -qiE "gzip|br|brotli"; then
  log_pass "PERF-006" "Gzip/Brotli Compression" "Content-Encoding: $ENCODING_HEADER"
else
  log_skip "PERF-006" "Gzip/Brotli Compression" "No compression detected (Cloudflare may handle this)"
fi

# PERF-007: Connection Reuse
log_info "Checking connection reuse headers..."
http_get "$TARGET_URL/"
CONN_HEADER=$(get_header "Connection")
if echo "$CONN_HEADER" | grep -qi "keep-alive"; then
  log_pass "PERF-007" "Connection Reuse" "Keep-Alive enabled"
else
  # HTTP/2 doesn't use Keep-Alive header
  if echo "$HTTP_HEADERS" | grep -qi "HTTP/2"; then
    log_pass "PERF-007" "Connection Reuse" "HTTP/2 detected (connection multiplexing)"
  else
    log_skip "PERF-007" "Connection Reuse" "No Keep-Alive or HTTP/2 detected"
  fi
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
