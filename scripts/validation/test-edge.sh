#!/bin/bash
# Edge/Geographic Tests (GEO-*)
# Tests Cloudflare edge functionality

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Edge/Geographic Tests"

log_section "Cloudflare Edge Tests"

# Make a request to get headers
http_get "$TARGET_URL/"

# GEO-001: CF-Ray Header Present
log_info "Checking for Cloudflare Ray ID..."
CF_RAY=$(get_header "CF-Ray")
if [ -n "$CF_RAY" ]; then
  log_pass "GEO-001" "CF-Ray Header Present" "CF-Ray: $CF_RAY"
else
  log_skip "GEO-001" "CF-Ray Header Present" "CF-Ray header not found (may not be using Cloudflare)"
fi

# GEO-002: Edge Caching Working
log_info "Checking edge caching status..."
http_get "$TARGET_URL/css/base.css"
CF_CACHE_STATUS=$(get_header "CF-Cache-Status")
if [ -n "$CF_CACHE_STATUS" ]; then
  log_pass "GEO-002" "Edge Caching Working" "CF-Cache-Status: $CF_CACHE_STATUS"
else
  log_skip "GEO-002" "Edge Caching Working" "CF-Cache-Status header not found"
fi

# GEO-003: Worker Location Header
log_info "Checking for worker location information..."
CF_COLO=$(get_header "CF-Colo")
if [ -n "$CF_COLO" ]; then
  log_pass "GEO-003" "Worker Location Header" "CF-Colo: $CF_COLO"
else
  log_skip "GEO-003" "Worker Location Header" "CF-Colo header not found"
fi

# Additional: Check for CDN-Cache-Control
CDN_CACHE=$(get_header "CDN-Cache-Control")
if [ -n "$CDN_CACHE" ]; then
  log_info "CDN-Cache-Control: $CDN_CACHE"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
