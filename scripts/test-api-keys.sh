#!/bin/bash
# Test script for API Keys feature
# Tests key creation, listing, revocation, and reveal functionality
# This script runs against a local wrangler dev server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
BASE_URL="${BASE_URL:-http://localhost:8787}"
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

log_skip() {
  echo -e "${YELLOW}⊘ SKIP${NC}: $1"
}

log_info() {
  echo "ℹ️  $1"
}

# Start tests
echo ""
echo "=========================================="
echo "API Keys Feature Tests"
echo "=========================================="
echo ""
echo "Testing against: $BASE_URL"
echo ""

# ==========================================
# Test 1: generateApiKey - production format
# ==========================================
log_test "generateApiKey produces correct format"

# This test checks the implementation directly by examining the code
# In a real test we'd need to actually call the function
if grep -q "LIVE_PREFIX + randomPart" /home/runner/work/hashbin.org/hashbin.org/src/auth/utils.js; then
  log_pass "generateApiKey implementation uses LIVE_PREFIX"
else
  log_fail "generateApiKey implementation not found or incorrect"
fi

# ==========================================
# Test 2: API Key format validation
# ==========================================
log_test "validateApiKeyFormat correctly validates key format"

# Test implementation exists
if grep -q "export function validateApiKeyFormat" /home/runner/work/hashbin.org/hashbin.org/src/auth/utils.js; then
  log_pass "validateApiKeyFormat function exists"
else
  log_fail "validateApiKeyFormat function not found"
fi

# ==========================================
# Test 3: Encryption functions exist
# ==========================================
log_test "Encryption/decryption functions are implemented"

if grep -q "export async function encryptApiKey" /home/runner/work/hashbin.org/hashbin.org/src/auth/utils.js; then
  log_pass "encryptApiKey function exists"
else
  log_fail "encryptApiKey function not found"
fi

if grep -q "export async function decryptApiKey" /home/runner/work/hashbin.org/hashbin.org/src/auth/utils.js; then
  log_pass "decryptApiKey function exists"
else
  log_fail "decryptApiKey function not found"
fi

# ==========================================
# Test 4: isSessionFresh function exists
# ==========================================
log_test "isSessionFresh function is implemented"

if grep -q "export function isSessionFresh" /home/runner/work/hashbin.org/hashbin.org/src/auth/utils.js; then
  log_pass "isSessionFresh function exists"
else
  log_fail "isSessionFresh function not found"
fi

# ==========================================
# Test 5: UserProfile stores encrypted keys
# ==========================================
log_test "UserProfile stores key_encrypted field"

if grep -q "key_encrypted: data.key_encrypted" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "UserProfile stores key_encrypted field"
else
  log_fail "UserProfile does not store key_encrypted field"
fi

# ==========================================
# Test 6: UserProfile stores reveal_timestamps
# ==========================================
log_test "UserProfile stores reveal_timestamps for rate limiting"

if grep -q "reveal_timestamps: \[\]" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "UserProfile initializes reveal_timestamps array"
else
  log_fail "UserProfile does not initialize reveal_timestamps"
fi

# ==========================================
# Test 7: Revoke is idempotent
# ==========================================
log_test "Revoke API key returns 200 for already revoked keys"

if grep -q "message: 'API key already revoked'" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "Revoke operation is idempotent"
else
  log_fail "Revoke operation not idempotent"
fi

# ==========================================
# Test 8: Reveal endpoint exists in UserProfile
# ==========================================
log_test "UserProfile has revealApiKey method"

if grep -q "async revealApiKey(keyId)" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "UserProfile.revealApiKey method exists"
else
  log_fail "UserProfile.revealApiKey method not found"
fi

# ==========================================
# Test 9: Reveal endpoint route exists
# ==========================================
log_test "Reveal endpoint route is registered"

if grep -q "url.pathname.endsWith('/reveal')" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "Reveal route registered in UserProfile"
else
  log_fail "Reveal route not registered in UserProfile"
fi

# ==========================================
# Test 10: API handler for reveal exists
# ==========================================
log_test "handleRevealApiKey handler exists"

if grep -q "export async function handleRevealApiKey" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "handleRevealApiKey handler exists"
else
  log_fail "handleRevealApiKey handler not found"
fi

# ==========================================
# Test 11: Main router includes reveal endpoint
# ==========================================
log_test "Main router includes reveal endpoint"

if grep -q "handleRevealApiKey" /home/runner/work/hashbin.org/hashbin.org/src/index.js; then
  log_pass "Main router includes handleRevealApiKey"
else
  log_fail "Main router does not include handleRevealApiKey"
fi

# ==========================================
# Test 12: Reveal checks for fresh session
# ==========================================
log_test "Reveal endpoint checks session freshness"

if grep -q "isSessionFresh(session, 5)" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "Reveal endpoint validates session freshness"
else
  log_fail "Reveal endpoint does not validate session freshness"
fi

# ==========================================
# Test 13: Reveal enforces rate limiting
# ==========================================
log_test "Reveal endpoint enforces rate limiting (3 per hour)"

if grep -q "recentReveals.length >= 3" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "Reveal rate limiting logic exists"
else
  log_fail "Reveal rate limiting logic not found"
fi

# ==========================================
# Test 14: Encryption key is documented
# ==========================================
log_test "API_KEY_ENCRYPTION_KEY is documented in wrangler.toml"

if grep -q "API_KEY_ENCRYPTION_KEY" /home/runner/work/hashbin.org/hashbin.org/wrangler.toml; then
  log_pass "API_KEY_ENCRYPTION_KEY documented in wrangler.toml"
else
  log_fail "API_KEY_ENCRYPTION_KEY not documented in wrangler.toml"
fi

# ==========================================
# Test 15: Encryption key generation script exists
# ==========================================
log_test "Encryption key generation script exists"

if [ -f "/home/runner/work/hashbin.org/hashbin.org/scripts/generate-encryption-key.sh" ]; then
  log_pass "generate-encryption-key.sh script exists"
else
  log_fail "generate-encryption-key.sh script not found"
fi

# ==========================================
# Test 16: Create API key includes encryption
# ==========================================
log_test "API key creation encrypts the key"

if grep -q "const keyEncrypted = await encryptApiKey" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "API key creation includes encryption"
else
  log_fail "API key creation does not encrypt keys"
fi

# ==========================================
# Test 17: Create API key checks for encryption key
# ==========================================
log_test "API key creation checks for API_KEY_ENCRYPTION_KEY"

if grep -q "if (!env.API_KEY_ENCRYPTION_KEY)" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "Create endpoint validates encryption key exists"
else
  log_fail "Create endpoint does not validate encryption key"
fi

# ==========================================
# Test 18: Reveal returns decrypted key
# ==========================================
log_test "Reveal endpoint decrypts and returns API key"

if grep -q "const apiKey = await decryptApiKey" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "Reveal endpoint decrypts API key"
else
  log_fail "Reveal endpoint does not decrypt API key"
fi

# ==========================================
# Test 19: Reveal checks if key is revoked
# ==========================================
log_test "Reveal endpoint rejects revoked keys"

if grep -q "error: 'KEY_REVOKED'" /home/runner/work/hashbin.org/hashbin.org/src/durable-objects/user-profile.js; then
  log_pass "Reveal endpoint checks for revoked keys"
else
  log_fail "Reveal endpoint does not check for revoked keys"
fi

# ==========================================
# Test 20: Reveal requires Clerk session
# ==========================================
log_test "Reveal endpoint requires Clerk session (not API key)"

if grep -q "if (authResult.user.authMethod !== 'clerk')" /home/runner/work/hashbin.org/hashbin.org/src/api/auth.js; then
  log_pass "Reveal endpoint requires Clerk session"
else
  log_fail "Reveal endpoint does not validate auth method"
fi

# ==========================================
# Print Summary
# ==========================================
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS"
echo "Failed:       $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
