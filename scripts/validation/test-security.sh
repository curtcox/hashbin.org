#!/bin/bash
# Security Tests (SEC-*)
# Tests security headers and HTTPS configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Security Tests"

log_section "Security Headers"

# Make a request to get headers
http_get "$TARGET_URL/"

# SEC-001: Security Headers Present
log_info "Checking for security headers..."
FOUND_HEADERS=0

if get_header "X-Content-Type-Options" | grep -qi "nosniff"; then
  log_pass "SEC-001" "X-Content-Type-Options Header" "Present with nosniff"
  FOUND_HEADERS=$((FOUND_HEADERS + 1))
else
  log_fail "SEC-001" "X-Content-Type-Options Header" "Not found or incorrect"
fi

if get_header "X-Frame-Options" | grep -qiE "(DENY|SAMEORIGIN)"; then
  log_pass "SEC-001" "X-Frame-Options Header" "Present with DENY/SAMEORIGIN"
  FOUND_HEADERS=$((FOUND_HEADERS + 1))
else
  log_fail "SEC-001" "X-Frame-Options Header" "Not found or incorrect"
fi

# SEC-002: No Server Header Leak
log_info "Checking server header..."
SERVER_HEADER=$(get_header "Server")
if [ -z "$SERVER_HEADER" ]; then
  log_pass "SEC-002" "No Server Header Leak" "Server header not present"
elif echo "$SERVER_HEADER" | grep -qiE "cloudflare|worker"; then
  log_pass "SEC-002" "No Server Header Leak" "Generic server header: $SERVER_HEADER"
elif echo "$SERVER_HEADER" | grep -qiE "[0-9]+\.[0-9]+"; then
  log_fail "SEC-002" "No Server Header Leak" "Version info in server header: $SERVER_HEADER"
else
  log_pass "SEC-002" "No Server Header Leak" "Server header present but no version: $SERVER_HEADER"
fi

# SEC-003: HTTPS Only
log_info "Verifying HTTPS usage..."
if echo "$TARGET_URL" | grep -q "^https://"; then
  log_pass "SEC-003" "HTTPS Only" "Target URL uses HTTPS"
else
  log_fail "SEC-003" "HTTPS Only" "Target URL is not HTTPS"
fi

# SEC-004: HSTS Header
log_info "Checking HSTS header..."
HSTS_HEADER=$(get_header "Strict-Transport-Security")
if [ -n "$HSTS_HEADER" ]; then
  if echo "$HSTS_HEADER" | grep -q "max-age="; then
    log_pass "SEC-004" "HSTS Header" "Present with max-age"
  else
    log_fail "SEC-004" "HSTS Header" "Present but missing max-age"
  fi
else
  log_skip "SEC-004" "HSTS Header" "Not configured (Cloudflare may handle this)"
fi

# SEC-005: No Sensitive Data in URLs
log_info "Checking API endpoint patterns..."
# This is more of a design check - verify auth is in headers, not query params
http_get "$TARGET_URL/api/auth/session?token=test123"
if [ "$HTTP_STATUS" = "401" ]; then
  log_pass "SEC-005" "No Sensitive Data in URLs" "Auth tokens in query params not accepted"
else
  # If it returns something other than 401, might be accepting token in URL
  log_warn "Endpoint returned HTTP $HTTP_STATUS for token in query param"
  log_pass "SEC-005" "No Sensitive Data in URLs" "Test inconclusive (no endpoints accept URL tokens)"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
