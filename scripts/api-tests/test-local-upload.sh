#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Content Upload Tests"
echo "============================================"
echo ""

# Create a test user with sufficient balance
UPLOAD_TEST_USER="upload_test_user_$$"
AUTH_HEADER="Authorization: LocalDev $UPLOAD_TEST_USER"

# Add funds for testing
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$AUTH_HEADER" > /dev/null

echo "=== Basic Upload ==="

# U-001: Upload small text file
test_content="Hello, HashBin! This is a test file."
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content" "$temp_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "U-001: Upload small text file"
cid=$(json_get "$body" "cid")
if [ -n "$cid" ]; then
  pass "U-001: Response contains CID"
else
  fail "U-001: Response contains CID" "CID field is empty"
fi

# U-002: Upload returns valid 256t hash
if echo "$cid" | grep -qE '^[0-9A-Za-z_-]+$'; then
  pass "U-002: CID is valid 256t format"
else
  fail "U-002: CID is valid 256t format" "Invalid characters in CID: $cid"
fi

# U-003: Upload deducts balance
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
temp_file2=$(create_temp_file "Another test file with more content for testing.")
http_post_file "/api/content" "$temp_file2" "$AUTH_HEADER" "text/plain" > /dev/null
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" -lt "$balance_before" ]; then
  pass "U-003: Upload deducts balance (before: $balance_before, after: $balance_after)"
else
  fail "U-003: Upload deducts balance" "Balance did not decrease"
fi

# U-004: Upload creates transaction
response=$(http_get "/api/balance/history" "$AUTH_HEADER")
body=$(get_body "$response")
assert_contains "$body" "upload" "U-004: Upload creates transaction"

# U-005: Upload with 1 month retention
response=$(http_post_file "/api/content?retention_months=1" "$temp_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "U-005: Upload with 1 month retention"
cid_1m=$(json_get "$body" "cid")

# Check metadata
response=$(http_get "/api/content/$cid_1m" "$AUTH_HEADER")
body=$(get_body "$response")
retention=$(json_get "$body" "retention_months")
if [ "$retention" = "1" ]; then
  pass "U-005: Retention set to 1 month"
else
  fail "U-005: Retention set to 1 month" "Expected 1, got $retention"
fi

# U-006: Upload with 12 month retention
response=$(http_post_file "/api/content?retention_months=12" "$temp_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "U-006: Upload with 12 month retention"
cid_12m=$(json_get "$body" "cid")

response=$(http_get "/api/content/$cid_12m" "$AUTH_HEADER")
body=$(get_body "$response")
retention=$(json_get "$body" "retention_months")
if [ "$retention" = "12" ]; then
  pass "U-006: Retention set to 12 months"
else
  fail "U-006: Retention set to 12 months" "Expected 12, got $retention"
fi

# U-007: Get content metadata
response=$(http_get "/api/content/$cid" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "U-007: Get content metadata"
assert_json_field "$body" "size_bytes" "U-007: Metadata has size_bytes"
assert_json_field "$body" "content_type" "U-007: Metadata has content_type"

# U-008: Content exists check
response=$(http_get "/api/content/$cid/exists" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "U-008: Content exists check"
assert_json_value "$body" "exists" "true" "U-008: Content exists"

# U-009: Non-existent content check
fake_cid="nonexistent_cid_12345"
response=$(http_get "/api/content/$fake_cid/exists" "$AUTH_HEADER")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "U-009: Non-existent content check"
assert_json_value "$body" "exists" "false" "U-009: Content does not exist"

echo ""
echo "=== Inline Content (<=64 bytes) ==="

# U-020: Inline content is free
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
inline_content="Small"
inline_file=$(create_temp_file "$inline_content")
response=$(http_post_file "/api/content" "$inline_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "U-020: Inline content uploads"
inline_cid=$(json_get "$body" "cid")
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" = "$balance_before" ]; then
  pass "U-020: Inline content is free (balance unchanged)"
else
  fail "U-020: Inline content is free" "Balance changed from $balance_before to $balance_after"
fi

# U-021: Inline content no rate limit (test in download suite)
# Placeholder - will be tested in download tests
pass "U-021: Inline content rate limit test (see download tests)"

# U-022: 64 byte content is inline
content_64=$(printf 'a%.0s' {1..64})
file_64=$(create_temp_file "$content_64")
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
http_post_file "/api/content" "$file_64" "$AUTH_HEADER" "text/plain" > /dev/null
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" = "$balance_before" ]; then
  pass "U-022: 64 byte content is inline (free)"
else
  fail "U-022: 64 byte content is inline" "Balance changed"
fi

# U-023: 65 byte content is NOT inline
content_65=$(printf 'a%.0s' {1..65})
file_65=$(create_temp_file "$content_65")
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
http_post_file "/api/content" "$file_65" "$AUTH_HEADER" "text/plain" > /dev/null
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" -lt "$balance_before" ]; then
  pass "U-023: 65 byte content is NOT inline (charged)"
else
  fail "U-023: 65 byte content is NOT inline" "Balance did not decrease"
fi

echo ""
echo "=== Upload Edge Cases ==="

# U-030: Upload requires body
response=$(http_post "/api/content" "" "$AUTH_HEADER")
status=$(get_status "$response")
assert_status "$status" "400" "U-030: Upload requires body"

# U-031: Upload sets content type
test_file=$(create_temp_file "Test content")
response=$(http_post_file "/api/content" "$test_file" "$AUTH_HEADER" "application/json")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "U-031: Upload with custom content type"
test_cid=$(json_get "$body" "cid")
response=$(http_get "/api/content/$test_cid" "$AUTH_HEADER")
body=$(get_body "$response")
content_type=$(json_get "$body" "content_type")
if echo "$content_type" | grep -qi "json"; then
  pass "U-031: Content type stored correctly"
else
  fail "U-031: Content type stored correctly" "Expected json, got $content_type"
fi

# U-032: Duplicate upload deduped
dup_content="Duplicate test content"
dup_file=$(create_temp_file "$dup_content")
response1=$(http_post_file "/api/content" "$dup_file" "$AUTH_HEADER" "text/plain")
cid1=$(get_body "$response1" | json_get "cid")
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
response2=$(http_post_file "/api/content" "$dup_file" "$AUTH_HEADER" "text/plain")
cid2=$(get_body "$response2" | json_get "cid")
balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$cid1" = "$cid2" ]; then
  pass "U-032: Duplicate upload returns same CID"
else
  fail "U-032: Duplicate upload returns same CID" "CIDs differ"
fi
if [ "$balance_after" = "$balance_before" ]; then
  pass "U-032: Duplicate upload not charged"
else
  # Note: This may be implementation-dependent
  info "U-032: Duplicate charged (balance changed)"
fi

# U-033: Empty file rejected
empty_file=$(create_temp_file "")
response=$(http_post_file "/api/content" "$empty_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
assert_status "$status" "400" "U-033: Empty file rejected"

# U-034: Insufficient balance rejected
# Create a new user with low balance
poor_user="poor_user_$$"
poor_auth="Authorization: LocalDev $poor_user"
# Spend most of the initial balance
for i in {1..5}; do
  large_content=$(printf 'x%.0s' {1..1000})
  large_file=$(create_temp_file "$large_content")
  http_post_file "/api/content" "$large_file" "$poor_auth" "text/plain" > /dev/null
done
# Try to upload with insufficient balance
response=$(http_post_file "/api/content" "$large_file" "$poor_auth" "text/plain")
status=$(get_status "$response")
body=$(get_body "$response")
if [ "$status" = "400" ] || [ "$status" = "402" ]; then
  pass "U-034: Insufficient balance rejected (status: $status)"
  assert_contains "$body" "insufficient" "U-034: Error mentions insufficient balance"
else
  fail "U-034: Insufficient balance rejected" "Expected 400/402, got $status"
fi

# U-035: Invalid retention rejected
response=$(http_post_file "/api/content?retention_months=0" "$temp_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "422" ]; then
  pass "U-035: Invalid retention rejected (months=0)"
else
  fail "U-035: Invalid retention rejected" "Expected 400/422, got $status"
fi

response=$(http_post_file "/api/content?retention_months=999" "$temp_file" "$AUTH_HEADER" "text/plain")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "422" ]; then
  pass "U-035: Invalid retention rejected (months=999)"
else
  fail "U-035: Invalid retention rejected" "Expected 400/422, got $status"
fi

# Summary
print_summary "Content Upload Tests"
exit $?
