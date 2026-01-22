#!/usr/bin/env bash
set -euo pipefail

# Unit tests for supplier validation utilities
# Tests URL validation, SSRF protection, CID validation, etc.

echo "============================================"
echo "Supplier Validation Unit Tests"
echo "============================================"
echo ""

# Test counters
PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "✓ $1"
  ((PASS_COUNT++))
}

fail() {
  echo "✗ $1: $2"
  ((FAIL_COUNT++))
}

# Since these are unit tests for utilities, we'll test them via the API
# by attempting to create suppliers with various invalid inputs

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_USER="supplier_validation_test_$$"
AUTH_HEADER="Authorization: LocalDev $TEST_USER"

echo "=== URL Validation Tests ==="

# U6: HTTPS URL accepted
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"https://example.com"}')
if echo "$response" | grep -q '"supplier_id"'; then
  pass "U6: HTTPS URL accepted"
else
  fail "U6: HTTPS URL accepted" "Expected success"
fi

# U7: HTTP URL rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"http://example.com"}')
if echo "$response" | grep -q "Only HTTPS URLs are allowed"; then
  pass "U7: HTTP URL rejected"
else
  fail "U7: HTTP URL rejected" "Expected HTTPS error"
fi

# U8: Private IP rejected (10.x.x.x)
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"https://10.0.0.1"}')
if echo "$response" | grep -q "Private IP addresses are not allowed"; then
  pass "U8: Private IP rejected (10.x)"
else
  fail "U8: Private IP rejected" "Expected private IP error"
fi

# U9: Localhost rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"https://localhost"}')
if echo "$response" | grep -q "Localhost URLs are not allowed"; then
  pass "U9: Localhost rejected"
else
  fail "U9: Localhost rejected" "Expected localhost error"
fi

# U10: Internal DNS rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"https://internal.local"}')
if echo "$response" | grep -q "Internal DNS domains are not allowed"; then
  pass "U10: Internal DNS rejected"
else
  fail "U10: Internal DNS rejected" "Expected .local error"
fi

# U11: Valid domain accepted
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test2","supplier_type":"CID_GROUP","base_url":"https://256t.org"}')
if echo "$response" | grep -q '"supplier_id"'; then
  pass "U11: Valid domain accepted"
else
  fail "U11: Valid domain accepted" "Expected success"
fi

# U12: URL with path accepted
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test3","supplier_type":"CID_GROUP","base_url":"https://github.com/user/repo/cids"}')
if echo "$response" | grep -q '"supplier_id"'; then
  pass "U12: URL with path accepted"
else
  fail "U12: URL with path accepted" "Expected success"
fi

# U13: URL with port accepted
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test4","supplier_type":"CID_GROUP","base_url":"https://example.com:8443"}')
if echo "$response" | grep -q '"supplier_id"'; then
  pass "U13: URL with port accepted"
else
  fail "U13: URL with port accepted" "Expected success"
fi

# U14: Empty URL rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":""}')
if echo "$response" | grep -q "URL cannot be empty"; then
  pass "U14: Empty URL rejected"
else
  fail "U14: Empty URL rejected" "Expected empty URL error"
fi

# U15: Malformed URL rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"not-a-url"}')
if echo "$response" | grep -q "Malformed URL"; then
  pass "U15: Malformed URL rejected"
else
  fail "U15: Malformed URL rejected" "Expected malformed URL error"
fi

echo ""
echo "=== Supplier Type Validation Tests ==="

# U16: SINGLE_CID requires single_cid field
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"SINGLE_CID","base_url":"https://example.com"}')
if echo "$response" | grep -q "single_cid is required"; then
  pass "U16: SINGLE_CID requires single_cid field"
else
  fail "U16: SINGLE_CID requires single_cid" "Expected single_cid error"
fi

# U17: CID_GROUP doesn't require single_cid
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test5","supplier_type":"CID_GROUP","base_url":"https://example.com"}')
if echo "$response" | grep -q '"supplier_id"'; then
  pass "U17: CID_GROUP doesn't require single_cid"
else
  fail "U17: CID_GROUP validation" "Expected success"
fi

# U18: SINGLE_CID with invalid CID rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"SINGLE_CID","base_url":"https://example.com","single_cid":"invalid"}')
if echo "$response" | grep -q "Invalid CID format"; then
  pass "U18: SINGLE_CID with invalid CID rejected"
else
  fail "U18: Invalid CID rejected" "Expected invalid CID error"
fi

# U19: Unknown supplier type rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"UNKNOWN","base_url":"https://example.com"}')
if echo "$response" | grep -q "Supplier type must be one of"; then
  pass "U19: Unknown supplier type rejected"
else
  fail "U19: Unknown type rejected" "Expected type error"
fi

echo ""
echo "=== Name Validation Tests ==="

# Empty name rejected
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"","supplier_type":"CID_GROUP","base_url":"https://example.com"}')
if echo "$response" | grep -q "Supplier name cannot be empty"; then
  pass "Name validation: Empty name rejected"
else
  fail "Name validation" "Expected empty name error"
fi

# Long name rejected
long_name=$(printf 'a%.0s' {1..101})
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$long_name\",\"supplier_type\":\"CID_GROUP\",\"base_url\":\"https://example.com\"}")
if echo "$response" | grep -q "must be 100 characters or less"; then
  pass "Name validation: Long name rejected (>100 chars)"
else
  fail "Name validation" "Expected long name error"
fi

echo ""
echo "============================================"
echo "Test Results:"
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "============================================"

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
