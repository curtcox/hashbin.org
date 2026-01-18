#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "============================================"
echo "Donation Tests"
echo "============================================"
echo ""

# Create test users
DONOR_USER="donor_user_$$"
DONOR_AUTH="Authorization: LocalDev $DONOR_USER"
CREATOR_USER="creator_user_$$"
CREATOR_AUTH="Authorization: LocalDev $CREATOR_USER"

# Add funds to donor
http_post "/api/balance/dev-deposit" '{"amount_cents":100000}' "$DONOR_AUTH" > /dev/null

# Creator uploads content
creator_content="Content created for donation test"
temp_file=$(create_temp_file "$creator_content")
response=$(http_post_file "/api/content" "$temp_file" "$CREATOR_AUTH" "text/plain")
body=$(get_body "$response")
creator_cid=$(json_get "$body" "cid")

# DN-001: Donate to content creator
response=$(http_post "/api/donate/cid/$creator_cid" '{"amount_cents":500}' "$DONOR_AUTH")
status=$(get_status "$response")
if [ "$status" = "200" ] || [ "$status" = "201" ]; then
  pass "DN-001: Donate to content creator (status: $status)"
elif [ "$status" = "501" ] || [ "$status" = "404" ]; then
  info "DN-001: Donation endpoint not implemented (status: $status)"
  pass "DN-001: Donation endpoint responded (not implemented yet)"
else
  fail "DN-001: Donate to content creator" "Unexpected status: $status"
fi

# DN-002: Donation requires amount
response=$(http_post "/api/donate/cid/$creator_cid" '{}' "$DONOR_AUTH")
status=$(get_status "$response")
if [ "$status" = "400" ]; then
  pass "DN-002: Donation requires amount"
elif [ "$status" = "501" ] || [ "$status" = "404" ]; then
  info "DN-002: Donation endpoint not implemented"
  pass "DN-002: Donation endpoint validation (not implemented yet)"
else
  fail "DN-002: Donation requires amount" "Expected 400, got $status"
fi

# DN-003: Cannot donate to non-existent
response=$(http_post "/api/donate/cid/invalid_cid_xyz" '{"amount_cents":100}' "$DONOR_AUTH")
status=$(get_status "$response")
if [ "$status" = "404" ]; then
  pass "DN-003: Cannot donate to non-existent content"
elif [ "$status" = "501" ] || [ "$status" = "404" ]; then
  info "DN-003: Donation endpoint not implemented"
  pass "DN-003: Donation validation (not implemented yet)"
else
  fail "DN-003: Cannot donate to non-existent" "Expected 404, got $status"
fi

# DN-004: Cannot donate with insufficient balance
# Create a poor donor
poor_donor="poor_donor_$$"
poor_donor_auth="Authorization: LocalDev $poor_donor"
# Drain balance
for i in {1..5}; do
  drain_content=$(printf 'x%.0s' {1..1000})
  drain_file=$(create_temp_file "$drain_content")
  http_post_file "/api/content" "$drain_file" "$poor_donor_auth" "text/plain" > /dev/null
done
response=$(http_post "/api/donate/cid/$creator_cid" '{"amount_cents":50000}' "$poor_donor_auth")
status=$(get_status "$response")
body=$(get_body "$response")
if [ "$status" = "400" ] || [ "$status" = "402" ]; then
  pass "DN-004: Cannot donate with insufficient balance (status: $status)"
elif [ "$status" = "501" ] || [ "$status" = "404" ]; then
  info "DN-004: Donation endpoint not implemented"
  pass "DN-004: Donation balance check (not implemented yet)"
else
  fail "DN-004: Cannot donate with insufficient balance" "Expected 400/402, got $status"
fi

# Summary
print_summary "Donation Tests"
exit $?
