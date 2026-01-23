#!/bin/bash
# Test suite for InfrastructureCost Durable Object

set -e

echo "=== InfrastructureCost Tests ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_endpoint() {
  local description="$1"
  local method="$2"
  local path="$3"
  local data="$4"
  local expected_status="$5"
  
  echo -n "  Testing: $description..."
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      "http://127.0.0.1:8787$path" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    response=$(curl -s -w "\n%{http_code}" -X GET \
      "http://127.0.0.1:8787$path")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected_status" ]; then
    echo -e " ${GREEN}✓${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo "$body"
    return 0
  else
    echo -e " ${RED}✗${NC}"
    echo "  Expected status: $expected_status, Got: $http_code"
    echo "  Response: $body"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Note: This test requires a running local dev server
# Run: npm run dev:local

echo ""
echo "Note: These tests require manual setup of InfrastructureCost DO in a running local dev environment."
echo "For now, we'll just verify the code structure is valid."
echo ""

# Verify the file exists and has valid syntax
echo "Checking InfrastructureCost file..."
if [ -f "$PROJECT_ROOT/src/durable-objects/infrastructure-cost.js" ]; then
  echo -e "${GREEN}✓${NC} InfrastructureCost file exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} InfrastructureCost file not found"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Verify export in index.js
echo "Checking index.js exports..."
if grep -q "export { InfrastructureCost }" "$PROJECT_ROOT/src/index.js"; then
  echo -e "${GREEN}✓${NC} InfrastructureCost exported from index.js"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} InfrastructureCost not exported from index.js"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Verify wrangler.toml binding
echo "Checking wrangler.toml binding..."
if grep -q "INFRASTRUCTURE_COST" "$PROJECT_ROOT/wrangler.toml"; then
  echo -e "${GREEN}✓${NC} INFRASTRUCTURE_COST binding exists in wrangler.toml"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} INFRASTRUCTURE_COST binding not found in wrangler.toml"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Verify migration
echo "Checking migrations..."
if grep -q "InfrastructureCost" "$PROJECT_ROOT/wrangler.toml"; then
  echo -e "${GREEN}✓${NC} InfrastructureCost migration exists in wrangler.toml"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} InfrastructureCost migration not found in wrangler.toml"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Verify basic structure with Node
echo "Checking JavaScript syntax..."
node -e "
import('./src/durable-objects/infrastructure-cost.js')
  .then(module => {
    if (module.InfrastructureCost) {
      console.log('${GREEN}✓${NC} InfrastructureCost class exports correctly');
      process.exit(0);
    } else {
      console.log('${RED}✗${NC} InfrastructureCost class not found in exports');
      process.exit(1);
    }
  })
  .catch(err => {
    console.log('${RED}✗${NC} Error loading InfrastructureCost:', err.message);
    process.exit(1);
  });
" 2>&1
if [ $? -eq 0 ]; then
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== Test Summary ==="
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "Total: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All InfrastructureCost structure tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some InfrastructureCost structure tests failed${NC}"
  exit 1
fi
