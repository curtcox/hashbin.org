#!/bin/bash
# Frontend Availability Tests (FE-*)
# Tests frontend pages and static assets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Frontend Availability Tests"

log_section "Root and Core Pages"

# FE-001: Root Page Load
log_info "Testing root page..."
http_get "$TARGET_URL/"
assert_http_status "$HTTP_STATUS" "200" "FE-001" "Root Page Load"
ROOT_HTML="$HTTP_BODY"

# FE-002: Root Page Contains Git SHA
log_info "Checking for git SHA in HTML..."
if echo "$ROOT_HTML" | grep -q "<!-- git-sha: [0-9a-f]\{7,40\} -->"; then
  GIT_SHA_HTML=$(echo "$ROOT_HTML" | grep -o "<!-- git-sha: [0-9a-f]\{7,40\} -->" | grep -o "[0-9a-f]\{7,40\}")
  log_pass "FE-002" "Root Page Contains Git SHA" "SHA: $GIT_SHA_HTML"
else
  log_fail "FE-002" "Root Page Contains Git SHA" "Git SHA comment not found in HTML"
fi

log_section "Application Pages"

# FE-003: Dashboard Page Load
log_info "Testing dashboard page..."
http_get "$TARGET_URL/dashboard.html"
assert_http_status "$HTTP_STATUS" "200" "FE-003" "Dashboard Page Load"

# FE-004: Upload Page Load
log_info "Testing upload page..."
http_get "$TARGET_URL/upload.html"
assert_http_status "$HTTP_STATUS" "200" "FE-004" "Upload Page Load"

# FE-005: Retrieve Page Load
log_info "Testing retrieve page..."
http_get "$TARGET_URL/retrieve.html"
assert_http_status "$HTTP_STATUS" "200" "FE-005" "Retrieve Page Load"

# FE-006: Deposit Page Load
log_info "Testing deposit page..."
http_get "$TARGET_URL/deposit.html"
assert_http_status "$HTTP_STATUS" "200" "FE-006" "Deposit Page Load"

# FE-007: Info Page Load
log_info "Testing info page..."
http_get "$TARGET_URL/info.html"
assert_http_status "$HTTP_STATUS" "200" "FE-007" "Info Page Load"

# FE-008: API Keys Page Load
log_info "Testing API keys page..."
http_get "$TARGET_URL/api-keys.html"
assert_http_status "$HTTP_STATUS" "200" "FE-008" "API Keys Page Load"

# FE-009: API Keys Create Page Load
log_info "Testing API keys create page..."
http_get "$TARGET_URL/api-keys-create.html"
assert_http_status "$HTTP_STATUS" "200" "FE-009" "API Keys Create Page Load"

# FE-010: API Keys Detail Page Load
log_info "Testing API keys detail page..."
http_get "$TARGET_URL/api-keys-detail.html"
assert_http_status "$HTTP_STATUS" "200" "FE-010" "API Keys Detail Page Load"

log_section "Static Assets"

# FE-011: CSS Assets Load
log_info "Testing CSS assets..."
http_get "$TARGET_URL/css/base.css"
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "FE-011" "CSS Assets Load" "base.css loaded"
else
  log_fail "FE-011" "CSS Assets Load" "HTTP $HTTP_STATUS for base.css"
fi

# FE-012: JS Assets Load
log_info "Testing JS assets..."
http_get "$TARGET_URL/js/app.js"
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "FE-012" "JS Assets Load" "app.js loaded"
else
  log_fail "FE-012" "JS Assets Load" "HTTP $HTTP_STATUS for app.js"
fi

log_section "Frontend Integration Tests"

# FE-013: Auth Gate Script Present
log_info "Checking for auth-gate.js in protected pages..."
http_get "$TARGET_URL/dashboard.html"
if echo "$HTTP_BODY" | grep -q "auth-gate"; then
  log_pass "FE-013" "Auth Gate Script Present" "Found in dashboard.html"
else
  log_fail "FE-013" "Auth Gate Script Present" "Not found in dashboard.html"
fi

# FE-014: Clerk SDK Loaded
log_info "Checking for Clerk SDK in pages..."
http_get "$TARGET_URL/dashboard.html"
if echo "$HTTP_BODY" | grep -q "clerk"; then
  log_pass "FE-014" "Clerk SDK Loaded" "Found Clerk reference in HTML"
else
  log_fail "FE-014" "Clerk SDK Loaded" "No Clerk reference found"
fi

# FE-015: 404 Page Handling
log_info "Testing 404 handling..."
http_get "$TARGET_URL/nonexistent-page-12345.html"
if [ "$HTTP_STATUS" = "404" ]; then
  log_pass "FE-015" "404 Page Handling" "Returns 404 for non-existent page"
else
  log_fail "FE-015" "404 Page Handling" "Expected 404, got HTTP $HTTP_STATUS"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
