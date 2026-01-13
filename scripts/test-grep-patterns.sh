#!/bin/bash
# Test script to verify grep patterns work with both formatted and unformatted JSON
# This script documents the fix for the deployment failure issue where grep patterns
# didn't match the formatted JSON response from the health endpoint.
#
# Issue: https://github.com/curtcox/hashbin.org/issues/XXX
# The health endpoint returns pretty-printed JSON with spaces like:
#   {"status": "healthy", ...}
# But the original grep patterns were looking for:
#   "status":"healthy" (no spaces)

set -e

echo "=========================================="
echo "Testing Grep Patterns for JSON Matching"
echo "=========================================="
echo ""

# Test Case 1: Formatted JSON with spaces (actual API response)
echo "Test 1: Formatted JSON with spaces"
echo "-----------------------------------"
BODY1='{"status": "healthy", "environment": "production"}'
echo "Input: $BODY1"

if echo "$BODY1" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "✅ PASS: Pattern matched formatted JSON"
else
  echo "❌ FAIL: Pattern should match formatted JSON"
  exit 1
fi
echo ""

# Test Case 2: Compact JSON without spaces
echo "Test 2: Compact JSON without spaces"
echo "-----------------------------------"
BODY2='{"status":"healthy","environment":"production"}'
echo "Input: $BODY2"

if echo "$BODY2" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "✅ PASS: Pattern matched compact JSON"
else
  echo "❌ FAIL: Pattern should match compact JSON"
  exit 1
fi
echo ""

# Test Case 3: Pretty-printed multi-line JSON (realistic scenario)
echo "Test 3: Pretty-printed multi-line JSON"
echo "---------------------------------------"
BODY3='{
  "status": "healthy",
  "timestamp": "2026-01-13T22:28:23.723Z",
  "environment": "production",
  "checks": {
    "worker": {
      "status": "operational"
    }
  }
}'
echo "Input: (multi-line JSON)"

if echo "$BODY3" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "✅ PASS: Pattern matched pretty-printed JSON"
else
  echo "❌ FAIL: Pattern should match pretty-printed JSON"
  exit 1
fi
echo ""

# Test Case 4: Should NOT match unhealthy
echo "Test 4: Should NOT match unhealthy"
echo "-----------------------------------"
BODY4='{"status": "unhealthy", "environment": "production"}'
echo "Input: $BODY4"

if echo "$BODY4" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "❌ FAIL: Should not match unhealthy status"
  exit 1
else
  echo "✅ PASS: Correctly rejected unhealthy status"
fi
echo ""

# Test Case 5: Should NOT match degraded
echo "Test 5: Should NOT match degraded"
echo "-----------------------------------"
BODY5='{"status": "degraded", "environment": "production"}'
echo "Input: $BODY5"

if echo "$BODY5" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
  echo "❌ FAIL: Should not match degraded status"
  exit 1
else
  echo "✅ PASS: Correctly rejected degraded status"
fi
echo ""

# Test Case 6: Environment matching with spaces
echo "Test 6: Environment matching"
echo "-----------------------------"
BODY6='{"status": "healthy", "environment": "production"}'
ENV_NAME="production"
echo "Input: $BODY6"
echo "Expected environment: $ENV_NAME"

if echo "$BODY6" | grep -q "\"environment\"[[:space:]]*:[[:space:]]*\"$ENV_NAME\""; then
  echo "✅ PASS: Environment pattern matched"
else
  echo "❌ FAIL: Environment pattern should match"
  exit 1
fi
echo ""

# Test Case 7: Environment mismatch
echo "Test 7: Environment mismatch"
echo "-----------------------------"
BODY7='{"status": "healthy", "environment": "production"}'
ENV_NAME="development"
echo "Input: $BODY7"
echo "Expected environment: $ENV_NAME"

if echo "$BODY7" | grep -q "\"environment\"[[:space:]]*:[[:space:]]*\"$ENV_NAME\""; then
  echo "❌ FAIL: Should not match different environment"
  exit 1
else
  echo "✅ PASS: Correctly rejected environment mismatch"
fi
echo ""

echo "=========================================="
echo "✅ All tests passed!"
echo "=========================================="
echo ""
echo "The grep patterns now correctly handle:"
echo "  • Compact JSON: {\"status\":\"healthy\"}"
echo "  • Formatted JSON: {\"status\": \"healthy\"}"
echo "  • Pretty-printed JSON (multi-line)"
echo ""
echo "Pattern used: '\"status\"[[:space:]]*:[[:space:]]*\"healthy\"'"
echo "This pattern matches optional whitespace around the colon."
echo "=========================================="
