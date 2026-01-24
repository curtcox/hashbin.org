#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Extended Download Tests (Info Page & 451)"
echo "============================================"
echo ""

# Create a test user and upload test content
EXTENDED_TEST_USER="extended_download_test_user_$$"
AUTH_HEADER="Authorization: LocalDev $EXTENDED_TEST_USER"

# Add funds
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$AUTH_HEADER" > /dev/null

echo "=== Info Page Route Tests ==="

# Upload test content
test_content="Test content for info page"
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content" "$temp_file" "$AUTH_HEADER" "text/plain")
body=$(get_body "$response")
test_cid=$(json_get "$body" "cid")

# DE-001: Test /info/{cid} redirect route
response=$(curl -sL -w "\n%{http_code}" "$BASE_URL/info/$test_cid")
status=$(echo "$response" | tail -n1)
html=$(echo "$response" | head -n -1)

if [ "$status" = "200" ] && echo "$html" | grep -q "Content Information"; then
  pass "DE-001: /info/{cid} route redirects to info.html"
else
  fail "DE-001: /info/{cid} route redirects to info.html" "Status: $status"
fi

# DE-002: Test that info page URL contains CID parameter
response_url=$(curl -sL -w "\n%{url_effective}" -o /dev/null "$BASE_URL/info/$test_cid")

if echo "$response_url" | grep -q "cid=$test_cid"; then
  pass "DE-002: Info page redirects with CID parameter"
else
  fail "DE-002: Info page redirects with CID parameter" "URL: $response_url"
fi

# DE-003: Test info page with non-existent CID (should still load page, but show error via JS)
response=$(curl -sL -w "\n%{http_code}" "$BASE_URL/info/nonexistentcid123")
status=$(echo "$response" | tail -n1)

if [ "$status" = "200" ]; then
  pass "DE-003: Info page loads even with non-existent CID"
else
  fail "DE-003: Info page loads even with non-existent CID" "Status: $status"
fi

echo ""
echo "=== Contested Content (451) Tests ==="

# Note: These tests validate the data model and response format
# The actual marking of content as contested would require admin API endpoints
# For now, we test that the download handler respects the contested field

# DE-004: Download regular (non-contested) content should work
temp_download=$(mktemp)
TEMP_FILES+=("$temp_download")
status=$(curl -s -w "%{http_code}" -o "$temp_download" "$BASE_URL/$test_cid")
if [ "$status" = "200" ]; then
  pass "DE-004: Non-contested content downloads successfully"
else
  fail "DE-004: Non-contested content downloads successfully" "Status: $status"
fi

# DE-005: Verify metadata includes contested field
metadata=$(curl -s "$BASE_URL/api/content/$test_cid" -H "$AUTH_HEADER")
if echo "$metadata" | grep -q '"contested"'; then
  pass "DE-005: Content metadata includes contested field"
else
  fail "DE-005: Content metadata includes contested field" "Field not found"
fi

# DE-006: Verify contested defaults to false
contested_value=$(echo "$metadata" | grep -o '"contested":[^,}]*' | cut -d: -f2 | tr -d ' ')
if [ "$contested_value" = "false" ]; then
  pass "DE-006: Contested field defaults to false"
else
  fail "DE-006: Contested field defaults to false" "Value: $contested_value"
fi

echo ""
echo "=== Test Summary ==="
print_summary
