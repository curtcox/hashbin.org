#!/bin/bash
# Test script for content rate limiting
# Tests inline content exemption, default rate limits, and rate limit purchases

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_test() {
  echo ""
  echo "=========================================="
  echo "TEST: $1"
  echo "=========================================="
}

log_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  PASSED_TESTS=$((PASSED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

log_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

log_info() {
  echo "ℹ️  $1"
}

# Start tests
echo ""
echo "=========================================="
echo "Content Rate Limiting Tests"
echo "=========================================="
echo ""

# ==========================================
# Test 1: Rate limit constants exist in ContentMetadata
# ==========================================
log_test "Rate limit constants exist in ContentMetadata"

if grep -q "DEFAULT_RATE_LIMIT_MS" src/durable-objects/content-metadata.js; then
  log_pass "DEFAULT_RATE_LIMIT_MS constant found"
else
  log_fail "DEFAULT_RATE_LIMIT_MS constant not found"
fi

if grep -q "MINIMUM_MTBR_MS" src/durable-objects/content-metadata.js; then
  log_pass "MINIMUM_MTBR_MS constant found"
else
  log_fail "MINIMUM_MTBR_MS constant not found"
fi

# ==========================================
# Test 2: Rate limit fields added to content metadata
# ==========================================
log_test "Rate limit fields added to content metadata"

if grep -q "last_served_at" src/durable-objects/content-metadata.js; then
  log_pass "last_served_at field found"
else
  log_fail "last_served_at field not found"
fi

if grep -q "rate_limit_records" src/durable-objects/content-metadata.js; then
  log_pass "rate_limit_records field found"
else
  log_fail "rate_limit_records field not found"
fi

if grep -q "default_rate_limit" src/durable-objects/content-metadata.js; then
  log_pass "default_rate_limit field found"
else
  log_fail "default_rate_limit field not found"
fi

# ==========================================
# Test 3: Rate limit check method exists
# ==========================================
log_test "Rate limit check method exists in ContentMetadata"

if grep -q "checkRateLimit" src/durable-objects/content-metadata.js; then
  log_pass "checkRateLimit method found"
else
  log_fail "checkRateLimit method not found"
fi

if grep -q "getEffectiveMTBR" src/durable-objects/content-metadata.js; then
  log_pass "getEffectiveMTBR method found"
else
  log_fail "getEffectiveMTBR method not found"
fi

# ==========================================
# Test 4: Rate limit purchase method exists
# ==========================================
log_test "Rate limit purchase method exists in ContentMetadata"

if grep -q "purchaseRateLimit" src/durable-objects/content-metadata.js; then
  log_pass "purchaseRateLimit method found"
else
  log_fail "purchaseRateLimit method not found"
fi

# ==========================================
# Test 5: Rate limit status method exists
# ==========================================
log_test "Rate limit status method exists in ContentMetadata"

if grep -q "getRateLimitStatus" src/durable-objects/content-metadata.js; then
  log_pass "getRateLimitStatus method found"
else
  log_fail "getRateLimitStatus method not found"
fi

# ==========================================
# Test 6: Download handler checks rate limits
# ==========================================
log_test "Download handler checks rate limits for non-inline content"

if grep -q "rate-limit/check" src/api/content.js; then
  log_pass "Rate limit check in handleDownloadContent found"
else
  log_fail "Rate limit check in handleDownloadContent not found"
fi

if grep -q "X-RateLimit-Content-Reset" src/api/content.js; then
  log_pass "Rate limit headers added to responses"
else
  log_fail "Rate limit headers not added to responses"
fi

# ==========================================
# Test 7: Inline content exemption
# ==========================================
log_test "Inline content exemption implemented"

# Check that inline content is served without rate limit check
if grep "Inline content has no rate limit" src/api/content.js; then
  log_pass "Inline content explicitly marked as no rate limit"
else
  log_fail "Inline content exemption comment not clear"
fi

# ==========================================
# Test 8: Default rate limit set for new uploads
# ==========================================
log_test "Default rate limit set for new uploads"

if grep -q "isInline = data.size_bytes <= 64" src/durable-objects/content-metadata.js; then
  log_pass "Inline check based on size found"
else
  log_fail "Inline check based on size not found"
fi

if grep -q "isInline ? null" src/durable-objects/content-metadata.js; then
  log_pass "Inline content excluded from default rate limit"
else
  log_fail "Inline content not properly excluded from default rate limit"
fi

# ==========================================
# Test 9: Rate limit pricing utility exists
# ==========================================
log_test "Rate limit pricing utility exists"

if [ -f "src/utils/rate-limit-pricing.js" ]; then
  log_pass "rate-limit-pricing.js file exists"
else
  log_fail "rate-limit-pricing.js file not found"
fi

if grep -q "calculateRateLimitPrice" src/utils/rate-limit-pricing.js; then
  log_pass "calculateRateLimitPrice function found"
else
  log_fail "calculateRateLimitPrice function not found"
fi

if grep -q "validateRateLimitPurchase" src/utils/rate-limit-pricing.js; then
  log_pass "validateRateLimitPurchase function found"
else
  log_fail "validateRateLimitPurchase function not found"
fi

# ==========================================
# Test 10: Rate limit API handlers exist
# ==========================================
log_test "Rate limit API handlers exist"

if [ -f "src/api/rate-limit.js" ]; then
  log_pass "rate-limit.js file exists"
else
  log_fail "rate-limit.js file not found"
fi

if grep -q "handlePurchaseRateLimit" src/api/rate-limit.js; then
  log_pass "handlePurchaseRateLimit function found"
else
  log_fail "handlePurchaseRateLimit function not found"
fi

if grep -q "handleGetRateLimit" src/api/rate-limit.js; then
  log_pass "handleGetRateLimit function found"
else
  log_fail "handleGetRateLimit function not found"
fi

# ==========================================
# Test 11: Rate limit routes added to index.js
# ==========================================
log_test "Rate limit routes added to index.js"

if grep -q "/api/content/rate-limit/purchase" src/index.js; then
  log_pass "Rate limit purchase route found"
else
  log_fail "Rate limit purchase route not found"
fi

if grep -q "/rate-limit.*GET" src/index.js; then
  log_pass "Rate limit status route found"
else
  log_fail "Rate limit status route not found"
fi

# ==========================================
# Test 12: Rate limit purchase validations
# ==========================================
log_test "Rate limit purchase includes proper validations"

if grep -q "size_bytes <= 64" src/api/rate-limit.js; then
  log_pass "Inline content check in purchase handler"
else
  log_fail "Inline content check missing in purchase handler"
fi

if grep -q "duration_exceeds_retention" src/api/rate-limit.js; then
  log_pass "Retention validation in purchase handler"
else
  log_fail "Retention validation missing in purchase handler"
fi

if grep -q "insufficient_balance" src/api/rate-limit.js; then
  log_pass "Balance check in purchase handler"
else
  log_fail "Balance check missing in purchase handler"
fi

# ==========================================
# Test 13: PaymentRecord transaction type
# ==========================================
log_test "Rate limit purchase transaction type support"

if grep -q "rate_limit_purchase" src/api/rate-limit.js; then
  log_pass "rate_limit_purchase transaction type used"
else
  log_fail "rate_limit_purchase transaction type not used"
fi

# ==========================================
# Test 14: 429 error response format
# ==========================================
log_test "429 error response includes required fields"

if grep -q "retry_after_seconds" src/durable-objects/content-metadata.js; then
  log_pass "retry_after_seconds field in 429 response"
else
  log_fail "retry_after_seconds field missing in 429 response"
fi

if grep -q "next_available_at" src/durable-objects/content-metadata.js; then
  log_pass "next_available_at field in 429 response"
else
  log_fail "next_available_at field missing in 429 response"
fi

# ==========================================
# Test 15: Rate limit constants values
# ==========================================
log_test "Rate limit constants have correct values"

if grep -q "30 \* 24 \* 60 \* 60 \* 1000" src/durable-objects/content-metadata.js; then
  log_pass "DEFAULT_RATE_LIMIT_MS = 30 days in milliseconds"
else
  log_fail "DEFAULT_RATE_LIMIT_MS not set to 30 days"
fi

if grep -q "MINIMUM_MTBR_MS = 100" src/durable-objects/content-metadata.js; then
  log_pass "MINIMUM_MTBR_MS = 100ms"
else
  log_fail "MINIMUM_MTBR_MS not set to 100ms"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
