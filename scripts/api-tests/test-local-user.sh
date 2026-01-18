#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "User Data Tests"
echo "============================================"
echo ""

# UD-003: New user has no uploads
NEW_USER="new_user_$$"
NEW_AUTH="Authorization: LocalDev $NEW_USER"
response=$(http_get "/api/user/uploads" "$NEW_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "UD-003: List user uploads for new user"
if echo "$body" | grep -q '\[\]' || echo "$body" | grep -q '"uploads".*\[\]'; then
  pass "UD-003: New user has empty uploads array"
else
  # Check if there are no uploads listed
  upload_count=$(echo "$body" | grep -o '"cid"' | wc -l)
  if [ "$upload_count" -eq 0 ]; then
    pass "UD-003: New user has no uploads"
  else
    fail "UD-003: New user has no uploads" "Found $upload_count uploads"
  fi
fi

# Create a test user with uploads
USER_TEST="user_data_test_$$"
USER_AUTH="Authorization: LocalDev $USER_TEST"

# Add funds
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$USER_AUTH" > /dev/null

# Upload test content
test_content="User data test content"
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content" "$temp_file" "$USER_AUTH" "text/plain")
body=$(get_body "$response")
test_cid=$(json_get "$body" "cid")

# UD-001: List user uploads
response=$(http_get "/api/user/uploads" "$USER_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "UD-001: List user uploads"
if echo "$body" | grep -q '\['; then
  pass "UD-001: Response is array or contains array"
else
  fail "UD-001: Response is array" "Not an array format"
fi

# UD-002: Uploads include metadata
assert_json_field "$body" "cid" "UD-002: Upload has cid field"
assert_json_field "$body" "size_bytes" "UD-002: Upload has size_bytes field"
assert_json_field "$body" "created_at" "UD-002: Upload has created_at field"

# UD-004: Upload appears in list
assert_contains "$body" "$test_cid" "UD-004: Uploaded CID appears in user uploads list"

# UD-005: Uploads pagination
response=$(http_get "/api/user/uploads?limit=5" "$USER_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "UD-005: Uploads pagination with limit"
upload_count=$(echo "$body" | grep -o '"cid"' | wc -l)
if [ "$upload_count" -le 5 ]; then
  pass "UD-005: Returns at most 5 uploads ($upload_count returned)"
else
  fail "UD-005: Returns at most 5 uploads" "Expected <=5, got $upload_count"
fi

# Summary
print_summary "User Data Tests"
exit $?
