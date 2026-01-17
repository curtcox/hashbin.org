#!/bin/bash
# Content Integrity Tests (INT-*)
# Tests content and deployment integrity

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"
EXPECTED_GIT_SHA="${EXPECTED_GIT_SHA:-}"

init_test_suite "Content Integrity Tests"

log_section "Git SHA Consistency"

# Get SHA from health endpoint
log_info "Fetching git SHA from health endpoint..."
http_get "$TARGET_URL/health"
HEALTH_SHA=$(echo "$HTTP_BODY" | jq -r '.gitSha')

# Get SHA from HTML
log_info "Fetching git SHA from HTML..."
http_get "$TARGET_URL/"
HTML_SHA=$(echo "$HTTP_BODY" | grep -o "<!-- git-sha: [0-9a-f]\{7,40\} -->" | grep -o "[0-9a-f]\{7,40\}" || echo "")

# INT-001: Git SHA Consistency
log_info "Comparing SHAs..."
if [ -z "$HTML_SHA" ]; then
  log_fail "INT-001" "Git SHA Consistency" "No SHA found in HTML"
elif [ "$HEALTH_SHA" = "$HTML_SHA" ]; then
  log_pass "INT-001" "Git SHA Consistency" "SHAs match: $HEALTH_SHA"
else
  log_fail "INT-001" "Git SHA Consistency" "Health SHA ($HEALTH_SHA) != HTML SHA ($HTML_SHA)"
fi

# INT-002: Version Consistency (if expected SHA provided)
if [ -n "$EXPECTED_GIT_SHA" ]; then
  log_info "Verifying against expected SHA: $EXPECTED_GIT_SHA..."
  if [ "$HEALTH_SHA" = "$EXPECTED_GIT_SHA" ]; then
    log_pass "INT-002" "Version Consistency" "Deployed SHA matches expected: $EXPECTED_GIT_SHA"
  else
    log_fail "INT-002" "Version Consistency" "Expected $EXPECTED_GIT_SHA, got $HEALTH_SHA"
  fi
else
  log_skip "INT-002" "Version Consistency" "EXPECTED_GIT_SHA not provided"
fi

log_section "Static Resources"

# INT-003: Favicon Present
log_info "Checking favicon..."
http_get "$TARGET_URL/favicon.ico"
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "204" ]; then
  log_pass "INT-003" "Favicon Present" "Favicon accessible"
elif [ "$HTTP_STATUS" = "404" ]; then
  log_skip "INT-003" "Favicon Present" "Favicon not configured (404)"
else
  log_fail "INT-003" "Favicon Present" "Unexpected status: HTTP $HTTP_STATUS"
fi

# INT-004: Robots.txt Present
log_info "Checking robots.txt..."
http_get "$TARGET_URL/robots.txt"
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "INT-004" "Robots.txt Present" "robots.txt accessible"
elif [ "$HTTP_STATUS" = "404" ]; then
  log_skip "INT-004" "Robots.txt Present" "robots.txt not configured (404)"
else
  log_fail "INT-004" "Robots.txt Present" "Unexpected status: HTTP $HTTP_STATUS"
fi

log_section "Security - Debug Endpoints"

# INT-005: No Debug Endpoints Exposed
log_info "Checking for exposed debug endpoints..."
DEBUG_PATHS=("/debug" "/admin" "/test" "/.env" "/config" "/phpinfo.php")
ALL_404=true

for path in "${DEBUG_PATHS[@]}"; do
  http_get "$TARGET_URL$path"
  if [ "$HTTP_STATUS" != "404" ]; then
    log_warn "Debug path $path returned HTTP $HTTP_STATUS (expected 404)"
    ALL_404=false
  fi
done

if [ "$ALL_404" = true ]; then
  log_pass "INT-005" "No Debug Endpoints Exposed" "All debug paths return 404"
else
  log_fail "INT-005" "No Debug Endpoints Exposed" "Some debug endpoints accessible"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
