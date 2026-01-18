#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Content Extension Tests"
echo "============================================"
echo ""

# Create a test user
EXTENSION_TEST_USER="extension_test_user_$$"
AUTH_HEADER="Authorization: LocalDev $EXTENSION_TEST_USER"

# Add funds
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$AUTH_HEADER" > /dev/null

# Upload test content
test_content="Content extension test"
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content?retention_months=1" "$temp_file" "$AUTH_HEADER" "text/plain")
body=$(get_body "$response")
test_cid=$(json_get "$body" "cid")

# E-001: Extend content retention
response=$(http_post "/api/content/$test_cid/extend" '{"additional_months":1}' "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "E-001: Extend content retention"
assert_json_field "$body" "expires_at" "E-001: Response contains new expires_at"

# E-002: Extension deducts balance
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
# Upload new content
new_content="Another content for extension"
new_file=$(create_temp_file "$new_content")
response=$(http_post_file "/api/content?retention_months=1" "$new_file" "$AUTH_HEADER" "text/plain")
new_cid=$(get_body "$response" | json_get "cid")
# Extend it
http_post "/api/content/$new_cid/extend" '{"additional_months":1}' "$AUTH_HEADER" > /dev/null
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" -lt "$balance_before" ]; then
  pass "E-002: Extension deducts balance"
else
  fail "E-002: Extension deducts balance" "Balance did not decrease"
fi

# E-003: Extension creates transaction
response=$(http_get "/api/balance/history" "$AUTH_HEADER")
body=$(get_body "$response")
assert_contains "$body" "extension" "E-003: Extension creates transaction"

# E-004: Cannot extend non-existent
response=$(http_post "/api/content/invalid_cid_xyz/extend" '{"additional_months":1}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "404" "E-004: Cannot extend non-existent content"

# E-005: Insufficient balance rejected
# Create a poor user
poor_user="poor_ext_user_$$"
poor_auth="Authorization: LocalDev $poor_user"
# Upload content
poor_content="Poor user content"
poor_file=$(create_temp_file "$poor_content")
response=$(http_post_file "/api/content?retention_months=1" "$poor_file" "$poor_auth" "text/plain")
poor_cid=$(get_body "$response" | json_get "cid")
# Drain balance
for i in {1..5}; do
  drain_content=$(printf 'x%.0s' {1..1000})
  drain_file=$(create_temp_file "$drain_content")
  http_post_file "/api/content" "$drain_file" "$poor_auth" "text/plain" > /dev/null
done
# Try to extend
response=$(http_post "/api/content/$poor_cid/extend" '{"additional_months":1}' "$poor_auth")
status=$(get_status "$response")
body=$(get_body "$response")
if [ "$status" = "400" ] || [ "$status" = "402" ]; then
  pass "E-005: Insufficient balance rejected (status: $status)"
  assert_contains "$body" "insufficient" "E-005: Error mentions insufficient balance"
else
  fail "E-005: Insufficient balance rejected" "Expected 400/402, got $status"
fi

# E-006: Extension requires months
response=$(http_post "/api/content/$test_cid/extend" '{}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "E-006: Extension requires additional_months"

response=$(http_post "/api/content/$test_cid/extend" '{"additional_months":0}' "$AUTH_HEADER")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "422" ]; then
  pass "E-006: Extension rejects zero months"
else
  fail "E-006: Extension rejects zero months" "Expected 400/422, got $status"
fi

# Summary
print_summary "Content Extension Tests"
exit $?
