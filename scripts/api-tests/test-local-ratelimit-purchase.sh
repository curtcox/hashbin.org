#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Rate Limit Purchase Tests"
echo "============================================"
echo ""

# Create a test user and upload test content
RL_PURCHASE_USER="rl_purchase_user_$$"
AUTH_HEADER="Authorization: LocalDev $RL_PURCHASE_USER"

# Add funds
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$AUTH_HEADER" > /dev/null

# Upload test content (must be >64 bytes to have rate limit)
test_content="Rate limit purchase test content $(random_string 32) $(random_string 32)"
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content" "$temp_file" "$AUTH_HEADER" "text/plain")
body=$(get_body "$response")
test_cid=$(json_get "$body" "cid")

# R-001: Purchase rate limit reduction
response=$(http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$test_cid\",\"mtbr_ms\":100,\"duration_months\":1}" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "R-001: Purchase rate limit reduction"

# R-002: Purchase 100ms MTBR
mtbr=$(json_get "$body" "mtbr_ms")
if [ "$mtbr" = "100" ]; then
  pass "R-002: MTBR set to 100ms"
else
  fail "R-002: MTBR set to 100ms" "Expected 100, got $mtbr"
fi

# R-003: Download succeeds after 100ms wait
# First download
curl -sf -o /dev/null "$BASE_URL/$test_cid"
# Wait 100ms
sleep 0.15
# Second download should succeed
status=$(curl -sf -w "%{http_code}" -o /dev/null "$BASE_URL/$test_cid")
if [ "$status" = "200" ]; then
  pass "R-003: Download succeeds after 100ms wait"
else
  fail "R-003: Download succeeds after 100ms wait" "Expected 200, got $status"
fi

# R-004: Purchase deducts balance
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
# Upload new content
new_content="New content for balance test $(random_string 32) $(random_string 32)"
new_file=$(create_temp_file "$new_content")
response=$(http_post_file "/api/content" "$new_file" "$AUTH_HEADER" "text/plain")
new_cid=$(get_body "$response" | json_get "cid")
# Purchase rate limit
http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$new_cid\",\"mtbr_ms\":100,\"duration_months\":1}" "$AUTH_HEADER" > /dev/null
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" -lt "$balance_before" ]; then
  pass "R-004: Purchase deducts balance"
else
  fail "R-004: Purchase deducts balance" "Balance did not decrease"
fi

# R-005: Purchase creates transaction
response=$(http_get "/api/balance/history" "$AUTH_HEADER")
body=$(get_body "$response")
assert_contains "$body" "rate_limit" "R-005: Purchase creates transaction"

# R-006: Cannot purchase for inline content
inline_content="Tiny"
inline_file=$(create_temp_file "$inline_content")
response=$(http_post_file "/api/content" "$inline_file" "$AUTH_HEADER" "text/plain")
inline_cid=$(get_body "$response" | json_get "cid")
response=$(http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$inline_cid\",\"mtbr_ms\":100,\"duration_months\":1}" "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "R-006: Cannot purchase rate limit for inline content"

# R-007: Cannot exceed retention
# Upload content with 1 month retention
one_month_content="One month content $(random_string 32) $(random_string 32)"
one_month_file=$(create_temp_file "$one_month_content")
response=$(http_post_file "/api/content?retention_months=1" "$one_month_file" "$AUTH_HEADER" "text/plain")
one_month_cid=$(get_body "$response" | json_get "cid")
# Try to purchase rate limit for 2 months
response=$(http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$one_month_cid\",\"mtbr_ms\":100,\"duration_months\":2}" "$AUTH_HEADER")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "422" ]; then
  pass "R-007: Cannot exceed retention duration (status: $status)"
else
  fail "R-007: Cannot exceed retention duration" "Expected 400/422, got $status"
fi

# R-008: Insufficient balance rejected
# Create a new poor user
poor_user="poor_rl_user_$$"
poor_auth="Authorization: LocalDev $poor_user"
# Upload content
poor_content=$(printf 'Poor user content %.0s' {1..2500})
poor_file=$(create_temp_file "$poor_content")
response=$(http_post_file "/api/content" "$poor_file" "$poor_auth" "text/plain")
poor_cid=$(get_body "$response" | json_get "cid")
# Drain balance
for i in {1..5}; do
  drain_content=$(printf 'x%.0s' {1..1000})
  drain_file=$(create_temp_file "$drain_content")
  http_post_file "/api/content" "$drain_file" "$poor_auth" "text/plain" > /dev/null
done
# Try to purchase rate limit
response=$(http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$poor_cid\",\"mtbr_ms\":100,\"duration_months\":1}" "$poor_auth")
status=$(get_status "$response")
body=$(get_body "$response")
if [ "$status" = "400" ] || [ "$status" = "402" ]; then
  pass "R-008: Insufficient balance rejected (status: $status)"
  assert_contains "$body" "insufficient" "R-008: Error mentions insufficient balance"
else
  fail "R-008: Insufficient balance rejected" "Expected 400/402, got $status"
fi

# R-009: Invalid CID rejected
response=$(http_post "/api/content/rate-limit/purchase" '{"cid":"invalid_cid_xyz","mtbr_ms":100,"duration_months":1}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "404" "R-009: Invalid CID rejected"

# R-010: Purchase validates MTBR minimum
response=$(http_post "/api/content/rate-limit/purchase" "{\"cid\":\"$test_cid\",\"mtbr_ms\":50,\"duration_months\":1}" "$AUTH_HEADER")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "422" ]; then
  pass "R-010: Purchase validates MTBR minimum (status: $status)"
else
  fail "R-010: Purchase validates MTBR minimum" "Expected 400/422, got $status"
fi

# Summary
print_summary "Rate Limit Purchase Tests"
exit $?
