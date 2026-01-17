#!/bin/bash
# Authentication Boundary Tests (AUTH-*)
# Tests that protected endpoints properly require authentication

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Authentication Boundary Tests"

log_section "Unauthenticated Access Tests"

# AUTH-001: Session Endpoint - No Auth
log_info "Testing session endpoint without authentication..."
http_get "$TARGET_URL/api/auth/session"
assert_http_status "$HTTP_STATUS" "401" "AUTH-001" "Session Endpoint - No Auth"

# AUTH-002: API Keys List - No Auth
log_info "Testing API keys list without authentication..."
http_get "$TARGET_URL/api/auth/apikeys"
assert_http_status "$HTTP_STATUS" "401" "AUTH-002" "API Keys List - No Auth"

# AUTH-003: Balance Endpoint - No Auth
log_info "Testing balance endpoint without authentication..."
http_get "$TARGET_URL/api/balance"
assert_http_status "$HTTP_STATUS" "401" "AUTH-003" "Balance Endpoint - No Auth"

# AUTH-004: Upload Endpoint - No Auth
log_info "Testing upload endpoint without authentication..."
http_post "$TARGET_URL/api/content/upload" \
  '{"content":"test"}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "401" "AUTH-004" "Upload Endpoint - No Auth"

# AUTH-005: User Uploads - No Auth
log_info "Testing user uploads endpoint without authentication..."
http_get "$TARGET_URL/api/user/uploads"
assert_http_status "$HTTP_STATUS" "401" "AUTH-005" "User Uploads - No Auth"

# AUTH-006: Logout Endpoint - No Auth
log_info "Testing logout endpoint without authentication..."
http_post "$TARGET_URL/api/auth/logout" "" "Content-Type: application/json"
if [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "200" ]; then
  # 200 might be OK for logout (idempotent)
  log_pass "AUTH-006" "Logout Endpoint - No Auth" "Returns $HTTP_STATUS"
else
  log_fail "AUTH-006" "Logout Endpoint - No Auth" "Expected 401/200, got HTTP $HTTP_STATUS"
fi

# AUTH-007: Create API Key - No Auth
log_info "Testing create API key without authentication..."
http_post "$TARGET_URL/api/auth/apikeys" \
  '{"name":"test"}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "401" "AUTH-007" "Create API Key - No Auth"

# AUTH-008: Delete Account - No Auth
log_info "Testing delete account without authentication..."
http_delete "$TARGET_URL/api/auth/account"
assert_http_status "$HTTP_STATUS" "401" "AUTH-008" "Delete Account - No Auth"

# AUTH-009: Checkout Create - No Auth
log_info "Testing checkout create without authentication..."
http_post "$TARGET_URL/api/payments/create-checkout" \
  '{"amount":1000}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "401" "AUTH-009" "Checkout Create - No Auth"

# AUTH-010: Rate Limit Purchase - No Auth
log_info "Testing rate limit purchase without authentication..."
http_post "$TARGET_URL/api/rate-limit/purchase" \
  '{"plan":"pro"}' \
  "Content-Type: application/json"
assert_http_status "$HTTP_STATUS" "401" "AUTH-010" "Rate Limit Purchase - No Auth"

log_section "Invalid Authentication Tests"

# AUTH-011: Invalid Bearer Token
log_info "Testing with invalid bearer token..."
http_get "$TARGET_URL/api/auth/session" \
  "Authorization: Bearer invalid_token_12345"
assert_http_status "$HTTP_STATUS" "401" "AUTH-011" "Invalid Bearer Token"

# AUTH-012: Malformed Auth Header
log_info "Testing with malformed auth header..."
http_get "$TARGET_URL/api/auth/session" \
  "Authorization: NotBearer something"
assert_http_status "$HTTP_STATUS" "401" "AUTH-012" "Malformed Auth Header"

# AUTH-013: Expired Token Handling
log_info "Testing with expired JWT..."
# Use a known expired JWT (expired in 2020)
EXPIRED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj0u6gFlxH8zP6JqPYdTSqSKqhPqY5P8l-6Q-vVc"
http_get "$TARGET_URL/api/auth/session" \
  "Authorization: Bearer $EXPIRED_JWT"
assert_http_status "$HTTP_STATUS" "401" "AUTH-013" "Expired Token Handling"

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
