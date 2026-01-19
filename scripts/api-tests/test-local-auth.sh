#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Authentication Tests"
echo "============================================"
echo ""

# ===== 2.1 Unauthenticated Access =====
echo "=== Unauthenticated Access ==="

# A-001: Session endpoint requires auth
response=$(http_get "/api/auth/session")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-001: Session endpoint requires auth"
assert_json_field "$body" "error" "A-001: Error response contains error field"

# A-002: Balance endpoint requires auth
response=$(http_get "/api/balance")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-002: Balance endpoint requires auth"
assert_json_field "$body" "error" "A-002: Error response contains error field"

# A-003: Upload endpoint requires auth
response=$(http_post "/api/content" "{}")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-003: Upload endpoint requires auth"
assert_json_field "$body" "error" "A-003: Error response contains error field"

# A-004: Balance history requires auth
response=$(http_get "/api/balance/history")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-004: Balance history requires auth"
assert_json_field "$body" "error" "A-004: Error response contains error field"

# A-005: User uploads requires auth
response=$(http_get "/api/user/uploads")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-005: User uploads requires auth"
assert_json_field "$body" "error" "A-005: Error response contains error field"

# A-006: API key list requires auth
response=$(http_get "/api/auth/apikeys")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-006: API key list requires auth"
assert_json_field "$body" "error" "A-006: Error response contains error field"

echo ""
echo "=== LocalDev Authentication ==="

# A-010: LocalDev auth creates session
TEST_USER_1="test_user_1_$$"
response=$(http_get "/api/auth/session" "Authorization: LocalDev $TEST_USER_1")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "A-010: LocalDev auth creates session"
assert_json_field "$body" "user_id" "A-010: Response contains user_id"
assert_json_value "$body" "auth_method" "local" "A-010: auth_method is local"

# A-011: LocalDev auth with different user
TEST_USER_2="test_user_2_$$"
response=$(http_get "/api/auth/session" "Authorization: LocalDev $TEST_USER_2")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "A-011: LocalDev auth with different user"
user_id=$(json_get "$body" "user_id")
if [ "$user_id" != "$TEST_USER_1" ]; then
  pass "A-011: Different user ID returned"
else
  fail "A-011: Different user ID returned" "Got same user_id as previous test"
fi

# A-012: LocalDev auth rejects empty user
response=$(http_get "/api/auth/session" "Authorization: LocalDev ")
status=$(get_status "$response")
assert_status "$status" "401" "A-012: LocalDev auth rejects empty user"

# A-013: LocalDev auth rejects too long user
LONG_USER=$(printf 'a%.0s' {1..257})
response=$(http_get "/api/auth/session" "Authorization: LocalDev $LONG_USER")
status=$(get_status "$response")
if [ "$status" = "400" ] || [ "$status" = "401" ]; then
  pass "A-013: LocalDev auth rejects too long user (status: $status)"
else
  fail "A-013: LocalDev auth rejects too long user" "Expected 400 or 401, got $status"
fi

# A-014: Invalid auth header format
response=$(http_get "/api/auth/session" "Authorization: Invalid xyz")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-014: Invalid auth header format"
assert_json_field "$body" "error" "A-014: Error response contains error field"

# A-015: Malformed Bearer token
response=$(http_get "/api/auth/session" "Authorization: Bearer invalid")
status=$(get_status "$response")
assert_status "$status" "401" "A-015: Malformed Bearer token"

# A-016: Malformed ApiKey header
response=$(http_get "/api/auth/session" "Authorization: ApiKey invalid")
status=$(get_status "$response")
assert_status "$status" "401" "A-016: Malformed ApiKey header"

echo ""
echo "=== API Key Authentication ==="

# Create a test user for API key tests
API_TEST_USER="api_key_test_user_$$"
API_AUTH="Authorization: LocalDev $API_TEST_USER"

# A-020: Create API key via LocalDev
response=$(http_post "/api/auth/apikeys" '{"name":"test_key"}' "$API_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "A-020: Create API key via LocalDev"
api_key=$(json_get "$body" "api_key")
if [ -n "$api_key" ]; then
  pass "A-020: Response contains api_key"
else
  fail "A-020: Response contains api_key" "api_key field is empty"
fi

# A-021: API key format is correct
if echo "$api_key" | grep -qE '^hb_[a-zA-Z0-9]{32}$'; then
  pass "A-021: API key format is correct (hb_ + 32 chars)"
else
  fail "A-021: API key format is correct" "Expected hb_<32chars>, got: $api_key"
fi

# Store key_id for later tests
key_id=$(json_get "$body" "key_id")

# A-022: List API keys
response=$(http_get "/api/auth/apikeys" "$API_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "A-022: List API keys"
assert_contains "$body" "$key_id" "A-022: Created key appears in list"

# A-023: Auth with new API key
response=$(http_get "/api/auth/session" "Authorization: ApiKey $api_key")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "A-023: Auth with new API key"
assert_json_value "$body" "auth_method" "apikey" "A-023: auth_method is apikey"

# A-024: Revoke API key
response=$(http_delete "/api/auth/apikeys/$key_id" "$API_AUTH")
status=$(get_status "$response")
assert_status "$status" "200" "A-024: Revoke API key"

# A-025: Revoked key is rejected
response=$(http_get "/api/auth/session" "Authorization: ApiKey $api_key")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "401" "A-025: Revoked key is rejected"
assert_contains "$body" "AUTH_KEY_REVOKED" "A-025: Error code is AUTH_KEY_REVOKED"

# A-026: Revoke is idempotent
response=$(http_delete "/api/auth/apikeys/$key_id" "$API_AUTH")
status=$(get_status "$response")
assert_status "$status" "200" "A-026: Revoke is idempotent"

# A-027: API key creation with name
response=$(http_post "/api/auth/apikeys" '{"name":"my_custom_key"}' "$API_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "A-027: API key creation with name"
assert_json_value "$body" "name" "my_custom_key" "A-027: Custom name is set"

# A-028: API key with expiration
future_date=$(utc_rfc3339_days_from_now 30)
response=$(http_post "/api/auth/apikeys" "{\"name\":\"expiring_key\",\"expires_at\":\"$future_date\"}" "$API_AUTH")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "201" "A-028: API key with expiration"
assert_json_field "$body" "expires_at" "A-028: expires_at field is present"

# A-029: Max API keys enforced
# Create multiple keys until we hit the limit
info "Testing max API keys (may take a moment)..."
keys_created=0
max_attempts=30
for i in $(seq 1 $max_attempts); do
  response=$(http_post "/api/auth/apikeys" "{\"name\":\"key_$i\"}" "$API_AUTH")
  status=$(get_status "$response")
  if [ "$status" = "400" ]; then
    body=$(get_body "$response")
    if echo "$body" | grep -qi "limit\|maximum\|max"; then
      pass "A-029: Max API keys enforced (after $keys_created keys)"
      break
    fi
  elif [ "$status" = "201" ]; then
    keys_created=$((keys_created + 1))
    if [ $keys_created -ge 25 ]; then
      # Try one more - should fail
      response=$(http_post "/api/auth/apikeys" "{\"name\":\"excess_key\"}" "$API_AUTH")
      status=$(get_status "$response")
      if [ "$status" = "400" ]; then
        pass "A-029: Max API keys enforced at 25 keys"
        break
      else
        fail "A-029: Max API keys enforced" "Expected 400 after 25 keys, got $status"
        break
      fi
    fi
  else
    fail "A-029: Max API keys enforced" "Unexpected status: $status"
    break
  fi
done

# A-030: Invalid key ID returns 404
response=$(http_delete "/api/auth/apikeys/invalid_key_id_xyz" "$API_AUTH")
status=$(get_status "$response")
assert_status "$status" "404" "A-030: Invalid key ID returns 404"

# A-031: X-API-Key header works
# Create a new user to avoid API key limits
X_API_USER="x_api_user_$$"
X_API_AUTH="Authorization: LocalDev $X_API_USER"
response=$(http_post "/api/auth/apikeys" '{"name":"x_header_test"}' "$X_API_AUTH")
body=$(get_body "$response")
x_api_key=$(json_get "$body" "api_key")
response=$(http_get "/api/auth/session" "X-API-Key: $x_api_key")
status=$(get_status "$response")
assert_status "$status" "200" "A-031: X-API-Key header works"

# Summary
print_summary "Authentication Tests"
exit $?
