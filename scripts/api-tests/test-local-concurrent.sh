#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Concurrent Operations Tests"
echo "============================================"
echo ""

# Create a test user
CONCURRENT_USER="concurrent_user_$$"
AUTH_HEADER="Authorization: LocalDev $CONCURRENT_USER"

# Add funds
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$AUTH_HEADER" > /dev/null

# C-001: Concurrent balance reads
info "C-001: Testing concurrent balance reads..."
temp_results=$(mktemp)
TEMP_FILES+=("$temp_results")

# Launch 5 concurrent balance reads
for i in {1..5}; do
  (http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents" >> "$temp_results") &
done
wait

# Check all results are the same
balances=$(cat "$temp_results" | sort -u | wc -l)
if [ "$balances" -eq 1 ]; then
  pass "C-001: Concurrent balance reads return consistent data"
else
  fail "C-001: Concurrent balance reads return consistent data" "Got $balances different values"
fi

# C-002: Concurrent uploads
info "C-002: Testing concurrent uploads..."
balance_before=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")

# Launch 3 concurrent uploads
pids=()
for i in {1..3}; do
  content="Concurrent test content $i $(random_string 32)"
  temp_file=$(create_temp_file "$content")
  (http_post_file "/api/content" "$temp_file" "$AUTH_HEADER" "text/plain" > /dev/null) &
  pids+=($!)
done

# Wait for all uploads to complete
for pid in "${pids[@]}"; do
  wait "$pid"
done

balance_after=$(http_get "/api/balance" "$AUTH_HEADER" | get_body | json_get "balance_cents")
if [ "$balance_after" -lt "$balance_before" ]; then
  pass "C-002: Concurrent uploads all succeeded, balance updated"
else
  fail "C-002: Concurrent uploads all succeeded" "Balance did not decrease"
fi

# C-003: Concurrent API key creates
info "C-003: Testing concurrent API key creates..."
temp_keys=$(mktemp)
TEMP_FILES+=("$temp_keys")

# Launch 3 concurrent API key creations
for i in {1..3}; do
  (http_post "/api/auth/apikeys" "{\"name\":\"concurrent_key_$i\"}" "$AUTH_HEADER" | get_body | json_get "api_key" >> "$temp_keys") &
done
wait

# Check all keys are unique
unique_keys=$(cat "$temp_keys" | grep -v '^$' | sort -u | wc -l)
total_keys=$(cat "$temp_keys" | grep -v '^$' | wc -l)
if [ "$unique_keys" -eq "$total_keys" ] && [ "$total_keys" -ge 2 ]; then
  pass "C-003: Concurrent API key creates - all unique ($unique_keys keys)"
else
  fail "C-003: Concurrent API key creates" "Expected unique keys, got $unique_keys unique out of $total_keys"
fi

# C-004: Upload during download
info "C-004: Testing upload during download..."
# First upload content
test_content="Test content for concurrent ops"
temp_file=$(create_temp_file "$test_content")
response=$(http_post_file "/api/content" "$temp_file" "$AUTH_HEADER" "text/plain")
test_cid=$(get_body "$response" | json_get "cid")

# Start download in background
download_status=""
(
  status=$(curl -sf -w "%{http_code}" -o /dev/null "$BASE_URL/$test_cid" || echo "000")
  echo "$status" > /tmp/download_status_$$
) &
download_pid=$!

# Start upload in background
upload_status=""
new_content="Upload during download test"
new_file=$(create_temp_file "$new_content")
(
  response=$(http_post_file "/api/content" "$new_file" "$AUTH_HEADER" "text/plain")
  status=$(get_status "$response")
  echo "$status" > /tmp/upload_status_$$
) &
upload_pid=$!

# Wait for both
wait "$download_pid"
wait "$upload_pid"

download_status=$(cat /tmp/download_status_$$ 2>/dev/null || echo "000")
upload_status=$(cat /tmp/upload_status_$$ 2>/dev/null || echo "000")
rm -f /tmp/download_status_$$ /tmp/upload_status_$$

if [ "$download_status" = "200" ] && [ "$upload_status" = "201" ]; then
  pass "C-004: Upload during download - both succeeded"
else
  fail "C-004: Upload during download" "Download: $download_status, Upload: $upload_status"
fi

# Summary
print_summary "Concurrent Operations Tests"
exit $?
