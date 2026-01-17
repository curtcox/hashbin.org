#!/bin/bash
# Infrastructure Health Tests (INF-*)
# Tests infrastructure components: health endpoint, integrations, TLS, etc.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reporting.sh"
source "$SCRIPT_DIR/lib/http-client.sh"
source "$SCRIPT_DIR/lib/assertions.sh"

# Configuration
TARGET_URL="${TARGET_URL:-https://hashbin.org}"
VERBOSE="${VERBOSE:-false}"

init_test_suite "Infrastructure Health Tests"

log_section "Phase 1: Smoke Tests (Critical)"

# INF-001: Health Endpoint Availability
log_info "Testing health endpoint..."
http_get "$TARGET_URL/health"
assert_http_status "$HTTP_STATUS" "200" "INF-001" "Health Endpoint Availability"

# Store health response for subsequent tests
HEALTH_RESPONSE="$HTTP_BODY"

# INF-002: Health Response Structure
log_info "Validating health response structure..."
assert_json_field_exists "$HEALTH_RESPONSE" ".status" "INF-002" "Health Response Has Status Field"
assert_json_field_exists "$HEALTH_RESPONSE" ".checks.clerk" "INF-002" "Health Response Has Clerk Check"
assert_json_field_exists "$HEALTH_RESPONSE" ".checks.stripe" "INF-002" "Health Response Has Stripe Check"
assert_json_field_exists "$HEALTH_RESPONSE" ".checks.r2" "INF-002" "Health Response Has R2 Check"
assert_json_field_exists "$HEALTH_RESPONSE" ".checks.durableObjects" "INF-002" "Health Response Has Durable Objects Check"
assert_json_field_exists "$HEALTH_RESPONSE" ".gitSha" "INF-002" "Health Response Has Git SHA"

log_section "Integration Status Tests"

# INF-003: Clerk Integration Status
log_info "Checking Clerk integration status..."
CLERK_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.clerk.status')
if [ "$CLERK_STATUS" = "operational" ] || [ "$CLERK_STATUS" = "connected" ] || [ "$CLERK_STATUS" = "degraded" ]; then
  log_pass "INF-003" "Clerk Integration Status" "Status: $CLERK_STATUS"
else
  log_fail "INF-003" "Clerk Integration Status" "Unexpected status: $CLERK_STATUS"
fi

# INF-004: Stripe Integration Status
log_info "Checking Stripe integration status..."
STRIPE_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.stripe.status')
if [ "$STRIPE_STATUS" = "operational" ] || [ "$STRIPE_STATUS" = "connected" ] || [ "$STRIPE_STATUS" = "degraded" ] || [ "$STRIPE_STATUS" = "down" ]; then
  log_pass "INF-004" "Stripe Integration Status" "Status: $STRIPE_STATUS"
else
  log_fail "INF-004" "Stripe Integration Status" "Unexpected status: $STRIPE_STATUS"
fi

# INF-005: R2 Storage Status
log_info "Checking R2 storage status..."
R2_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.r2.status')
if [ "$R2_STATUS" = "operational" ] || [ "$R2_STATUS" = "available" ]; then
  log_pass "INF-005" "R2 Storage Status" "Status: $R2_STATUS"
else
  log_fail "INF-005" "R2 Storage Status" "Unexpected status: $R2_STATUS"
fi

# INF-006: Durable Objects Status
log_info "Checking Durable Objects status..."
DO_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.durableObjects.status')
if [ "$DO_STATUS" = "operational" ] || [ "$DO_STATUS" = "available" ]; then
  log_pass "INF-006" "Durable Objects Status" "Status: $DO_STATUS"
else
  log_fail "INF-006" "Durable Objects Status" "Unexpected status: $DO_STATUS"
fi

log_section "Git SHA and Deployment Verification"

# INF-007: Git SHA Presence
log_info "Validating Git SHA format..."
GIT_SHA=$(echo "$HEALTH_RESPONSE" | jq -r '.gitSha')
if [ "$GIT_SHA" = "null" ] || [ "$GIT_SHA" = "unknown" ] || [ -z "$GIT_SHA" ]; then
  log_fail "INF-007" "Git SHA Presence" "Git SHA is missing or invalid: $GIT_SHA"
else
  # Check if it's a valid SHA (40-char full SHA or 7+ char short SHA)
  if echo "$GIT_SHA" | grep -qE '^[0-9a-f]{7,40}$'; then
    log_pass "INF-007" "Git SHA Presence" "Valid SHA: $GIT_SHA"
  else
    log_fail "INF-007" "Git SHA Presence" "Invalid SHA format: $GIT_SHA"
  fi
fi

log_section "Performance Tests"

# INF-008: Response Time Check
log_info "Checking health endpoint response time..."
http_get "$TARGET_URL/health"
assert_response_time "$HTTP_TIME_MS" "2000" "INF-008" "Health Endpoint Response Time"

log_section "TLS and Security Tests"

# INF-009: TLS Certificate Valid
log_info "Checking TLS certificate..."
if echo "$TARGET_URL" | grep -q "^https://"; then
  CERT_INFO=$(curl -vI "$TARGET_URL" 2>&1 | grep -E "SSL certificate verify|subject|expire" || echo "")
  if echo "$CERT_INFO" | grep -q "SSL certificate verify ok"; then
    log_pass "INF-009" "TLS Certificate Valid" "Certificate OK"
  elif curl -s -f "$TARGET_URL/health" > /dev/null 2>&1; then
    # If we can connect, assume cert is valid (curl would fail on invalid cert)
    log_pass "INF-009" "TLS Certificate Valid" "HTTPS connection successful"
  else
    log_fail "INF-009" "TLS Certificate Valid" "Certificate validation failed"
  fi
else
  log_skip "INF-009" "TLS Certificate Valid" "Target URL is not HTTPS"
fi

# INF-010: HTTP to HTTPS Redirect
log_info "Checking HTTP to HTTPS redirect..."
if echo "$TARGET_URL" | grep -q "^https://"; then
  HTTP_URL=$(echo "$TARGET_URL" | sed 's/^https:/http:/')
  FINAL_URL=$(http_follow_redirect "$HTTP_URL")
  
  if echo "$FINAL_URL" | grep -q "^https://"; then
    log_pass "INF-010" "HTTP to HTTPS Redirect" "Redirects to HTTPS"
  else
    log_warn "HTTP does not redirect to HTTPS (Final URL: $FINAL_URL)"
    log_fail "INF-010" "HTTP to HTTPS Redirect" "No redirect to HTTPS detected"
  fi
else
  log_skip "INF-010" "HTTP to HTTPS Redirect" "Target URL is not HTTPS"
fi

# Print summary
print_test_summary

# Exit with appropriate code
exit_with_results
