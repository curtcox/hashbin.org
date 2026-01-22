#!/usr/bin/env bash
set -euo pipefail

# Integration tests for supplier registration and management

echo "============================================"
echo "Supplier Integration Tests"
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

BASE_URL="${BASE_URL:-http://localhost:8787}"
TEST_USER="supplier_integration_test_$$"
AUTH_HEADER="Authorization: LocalDev $TEST_USER"

echo "=== Supplier Registration Tests ==="

# I1: Register single CID supplier (use a valid-format CID for testing)
# For testing, we use a properly formatted CID even though we won't scan it
TEST_CID="AAAAA757nKdtrwSEpqwvo5YVhusXd4wN5uOnCv7dwzQj"
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Single CID\",\"supplier_type\":\"SINGLE_CID\",\"base_url\":\"https://256t.org\",\"single_cid\":\"$TEST_CID\"}")

supplier_id=$(echo "$response" | grep -o '"supplier_id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$supplier_id" ] && echo "$response" | grep -q '"scan_status":"pending"'; then
  pass "I1: Register single CID supplier"
else
  fail "I1: Register single CID supplier" "Expected success with supplier_id"
fi

# I2: Register group CID supplier
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Group","supplier_type":"CID_GROUP","base_url":"https://raw.githubusercontent.com/test/repo/main/cids"}')

supplier_id2=$(echo "$response" | grep -o '"supplier_id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$supplier_id2" ]; then
  pass "I2: Register group CID supplier"
else
  fail "I2: Register group CID supplier" "Expected success"
fi

# I3: Unauthenticated registration fails
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","supplier_type":"CID_GROUP","base_url":"https://example.com"}')

if echo "$response" | grep -q "Unauthorized"; then
  pass "I3: Unauthenticated registration fails"
else
  fail "I3: Unauthenticated registration" "Expected 401 Unauthorized"
fi

# I4: Duplicate supplier URL allowed
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Duplicate URL","supplier_type":"CID_GROUP","base_url":"https://256t.org"}')

if echo "$response" | grep -q '"supplier_id"'; then
  pass "I4: Duplicate supplier URL allowed"
else
  fail "I4: Duplicate URL" "Expected success (duplicates allowed)"
fi

echo ""
echo "=== Supplier Listing Tests ==="

# I7: List own suppliers
response=$(curl -s -X GET "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER")

count=$(echo "$response" | grep -o '"supplier_id"' | wc -l)
if [ "$count" -ge 3 ]; then
  pass "I7: List own suppliers (found $count)"
else
  fail "I7: List own suppliers" "Expected at least 3 suppliers, found $count"
fi

# I8: Empty list for new user
new_user="supplier_new_user_$$"
response=$(curl -s -X GET "$BASE_URL/api/suppliers" \
  -H "Authorization: LocalDev $new_user")

if echo "$response" | grep -q '"suppliers":\[\]'; then
  pass "I8: Empty list for new user"
else
  fail "I8: Empty list" "Expected empty array"
fi

# I9: Cannot see other user's suppliers
other_user="supplier_other_user_$$"
response=$(curl -s -X GET "$BASE_URL/api/suppliers" \
  -H "Authorization: LocalDev $other_user")

if echo "$response" | grep -q '"suppliers":\[\]'; then
  pass "I9: Cannot see other user's suppliers"
else
  fail "I9: Supplier isolation" "Expected empty array"
fi

echo ""
echo "=== Supplier Details Tests ==="

# Get details of first supplier
if [ -n "$supplier_id" ]; then
  response=$(curl -s -X GET "$BASE_URL/api/suppliers/$supplier_id" \
    -H "$AUTH_HEADER")
  
  if echo "$response" | grep -q "\"supplier_id\":\"$supplier_id\""; then
    pass "Supplier details: Get supplier by ID"
  else
    fail "Supplier details" "Could not get supplier details"
  fi
fi

echo ""
echo "=== Supplier Update Tests ==="

# Update supplier name
if [ -n "$supplier_id" ]; then
  response=$(curl -s -X PATCH "$BASE_URL/api/suppliers/$supplier_id" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"name":"Updated Name"}')
  
  if echo "$response" | grep -q '"name":"Updated Name"'; then
    pass "Supplier update: Update supplier name"
  else
    fail "Supplier update" "Could not update name"
  fi
fi

# Update supplier active status
if [ -n "$supplier_id" ]; then
  response=$(curl -s -X PATCH "$BASE_URL/api/suppliers/$supplier_id" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"is_active":false}')
  
  if echo "$response" | grep -q '"is_active":false'; then
    pass "Supplier update: Disable supplier"
  else
    fail "Supplier update" "Could not disable supplier"
  fi
fi

echo ""
echo "=== Supplier Deletion Tests ==="

# I13: Cannot delete other's supplier
other_user="supplier_delete_test_$$"
if [ -n "$supplier_id" ]; then
  response=$(curl -s -X DELETE "$BASE_URL/api/suppliers/$supplier_id" \
    -H "Authorization: LocalDev $other_user")
  
  if echo "$response" | grep -q "Forbidden"; then
    pass "I13: Cannot delete other's supplier"
  else
    fail "I13: Delete ownership check" "Expected 403 Forbidden"
  fi
fi

# I12: Delete own supplier
if [ -n "$supplier_id2" ]; then
  response=$(curl -s -X DELETE "$BASE_URL/api/suppliers/$supplier_id2" \
    -H "$AUTH_HEADER")
  
  if echo "$response" | grep -q '"success":true'; then
    pass "I12: Delete own supplier"
  else
    fail "I12: Delete supplier" "Expected success"
  fi
fi

# I15: Delete non-existent supplier
response=$(curl -s -X DELETE "$BASE_URL/api/suppliers/fake_id_12345" \
  -H "$AUTH_HEADER")

if echo "$response" | grep -q "not found" || echo "$response" | grep -q "Supplier not found"; then
  pass "I15: Delete non-existent supplier returns 404"
else
  fail "I15: Delete non-existent" "Expected 404"
fi

echo ""
echo "=== Rescan Tests ==="

# Register a supplier for rescan tests
response=$(curl -s -X POST "$BASE_URL/api/suppliers" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Rescan Test","supplier_type":"CID_GROUP","base_url":"https://example.com"}')

rescan_supplier_id=$(echo "$response" | grep -o '"supplier_id":"[^"]*"' | cut -d'"' -f4)

# I18: Manual rescan request
if [ -n "$rescan_supplier_id" ]; then
  # Wait a moment for initial scan to potentially start
  sleep 2
  
  response=$(curl -s -X POST "$BASE_URL/api/suppliers/$rescan_supplier_id/scan" \
    -H "$AUTH_HEADER")
  
  if echo "$response" | grep -q '"success":true' || echo "$response" | grep -q "Please wait"; then
    pass "I18: Manual rescan request accepted or in cooldown"
  else
    fail "I18: Manual rescan" "Unexpected response"
  fi
fi

# I21: Cannot scan other's supplier
other_user="supplier_scan_test_$$"
if [ -n "$rescan_supplier_id" ]; then
  response=$(curl -s -X POST "$BASE_URL/api/suppliers/$rescan_supplier_id/scan" \
    -H "Authorization: LocalDev $other_user")
  
  if echo "$response" | grep -q "Forbidden"; then
    pass "I21: Cannot scan other's supplier"
  else
    fail "I21: Scan ownership check" "Expected 403 Forbidden"
  fi
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
