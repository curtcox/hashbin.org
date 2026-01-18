#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Balance Tests"
echo "============================================"
echo ""

# Create a test user
BALANCE_TEST_USER="balance_test_user_$$"
AUTH_HEADER="Authorization: LocalDev $BALANCE_TEST_USER"

# B-001: New user starts with balance
response=$(http_get "/api/balance" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "B-001: New user starts with balance"
balance=$(json_get "$body" "balance_cents")
if [ "$balance" = "1000" ]; then
  pass "B-001: Initial balance is 1000 cents (\$10)"
else
  fail "B-001: Initial balance is 1000 cents" "Expected 1000, got $balance"
fi

# B-002: Dev deposit adds funds
response=$(http_post "/api/balance/dev-deposit" '{"amount_cents":500}' "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "B-002: Dev deposit adds funds"
new_balance=$(json_get "$body" "balance_cents")
if [ "$new_balance" = "1500" ]; then
  pass "B-002: Balance increased to 1500 cents"
else
  fail "B-002: Balance increased to 1500 cents" "Expected 1500, got $new_balance"
fi

# B-003: Dev deposit records transaction
response=$(http_get "/api/balance/history" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "B-003: Dev deposit records transaction"
assert_contains "$body" "deposit" "B-003: Transaction type is deposit"

# B-004: Balance history pagination
response=$(http_get "/api/balance/history?limit=5" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "B-004: Balance history pagination"
# Count transactions (simple check - look for transaction IDs)
txn_count=$(echo "$body" | grep -o '"id"' | wc -l)
if [ "$txn_count" -le 5 ]; then
  pass "B-004: Returns at most 5 transactions ($txn_count returned)"
else
  fail "B-004: Returns at most 5 transactions" "Expected <=5, got $txn_count"
fi

# B-005: Balance history offset
response=$(http_get "/api/balance/history?offset=1" "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "200" "B-005: Balance history offset works"

# B-006: Dev deposit requires amount
response=$(http_post "/api/balance/dev-deposit" '{}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "B-006: Dev deposit requires amount"

# B-007: Dev deposit rejects negative
response=$(http_post "/api/balance/dev-deposit" '{"amount_cents":-100}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "B-007: Dev deposit rejects negative amount"

# B-008: Dev deposit rejects zero
response=$(http_post "/api/balance/dev-deposit" '{"amount_cents":0}' "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "B-008: Dev deposit rejects zero amount"

# B-009: Balance fields are correct
response=$(http_get "/api/balance" "$AUTH_HEADER")
body=$(get_body "$response")
assert_json_field "$body" "balance_cents" "B-009: Has balance_cents field"
assert_json_field "$body" "total_deposited_cents" "B-009: Has total_deposited_cents field"
assert_json_field "$body" "total_spent_cents" "B-009: Has total_spent_cents field"

# B-010: Transaction has required fields
response=$(http_get "/api/balance/history" "$AUTH_HEADER")
body=$(get_body "$response")
assert_json_field "$body" "id" "B-010: Transaction has id field"
assert_json_field "$body" "type" "B-010: Transaction has type field"
assert_json_field "$body" "amount_cents" "B-010: Transaction has amount_cents field"
assert_json_field "$body" "created_at" "B-010: Transaction has created_at field"

# Summary
print_summary "Balance Tests"
exit $?
