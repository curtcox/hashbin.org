#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Health & Configuration Tests"
echo "============================================"
echo ""

# H-001: Health endpoint returns 200
response=$(http_get "/health")
status=$(get_status "$response")
assert_status "$status" "200" "H-001: Health endpoint returns 200"

# H-002: Health response contains required fields
body=$(get_body "$response")
assert_json_field "$body" "status" "H-002: Health response contains 'status' field"
assert_json_field "$body" "checks" "H-002: Health response contains 'checks' field"
assert_json_field "$body" "environment" "H-002: Health response contains 'environment' field"

# H-003: Health shows local environment
assert_json_value "$body" "environment" "local" "H-003: Health shows local environment"

# H-004: Health checks show operational status
if echo "$body" | grep -q '"durableObjects".*"operational"'; then
  pass "H-004: Health checks show durable objects operational"
else
  fail "H-004: Health checks show durable objects operational" "Expected durableObjects to be operational"
fi

# H-005: Health checks show R2 status
if echo "$body" | grep -q '"r2".*"operational"'; then
  pass "H-005: Health checks show R2 operational"
else
  fail "H-005: Health checks show R2 operational" "Expected R2 to be operational"
fi

# H-006: Config endpoint returns 200
response=$(http_get "/api/config")
status=$(get_status "$response")
assert_status "$status" "200" "H-006: Config endpoint returns 200"

# H-007: Config shows local mode enabled
body=$(get_body "$response")
assert_json_value "$body" "isLocalMode" "true" "H-007: Config shows local mode enabled"

# H-008: Config shows auth mode
assert_json_field "$body" "authMode" "H-008: Config shows auth mode"

# H-009: Root returns HTML
response=$(http_get "/")
status=$(get_status "$response")
assert_status "$status" "200" "H-009: Root returns HTML"

# H-010: Root contains HashBin branding
body=$(get_body "$response")
assert_contains "$body" "HashBin" "H-010: Root contains HashBin branding"

# Summary
print_summary "Health & Configuration Tests"
exit $?
