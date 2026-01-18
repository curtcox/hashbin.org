#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "============================================"
echo "Running All Local API Tests"
echo "============================================"
echo ""

# Counters
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

# Track failures
declare -a FAILED_SUITE_NAMES

# Helper function to run a test suite
run_suite() {
  local suite_name="$1"
  local suite_script="$2"
  
  echo ""
  echo "============================================"
  echo "Running: $suite_name"
  echo "============================================"
  
  TOTAL_SUITES=$((TOTAL_SUITES + 1))
  
  if [ ! -f "$suite_script" ]; then
    echo -e "${RED}ERROR${NC}: Test script not found: $suite_script"
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_SUITE_NAMES+=("$suite_name")
    return 1
  fi
  
  if bash "$suite_script"; then
    echo -e "${GREEN}✅ $suite_name PASSED${NC}"
    PASSED_SUITES=$((PASSED_SUITES + 1))
  else
    echo -e "${RED}❌ $suite_name FAILED${NC}"
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_SUITE_NAMES+=("$suite_name")
  fi
}

# Run tests in priority order (P0 first, then P1, etc.)
# Tests are sequential and may share state

run_suite "Health & Configuration Tests" "$SCRIPT_DIR/api-tests/test-local-health.sh"
run_suite "Authentication Tests" "$SCRIPT_DIR/api-tests/test-local-auth.sh"
run_suite "Balance Tests" "$SCRIPT_DIR/api-tests/test-local-balance.sh"
run_suite "Upload Tests" "$SCRIPT_DIR/api-tests/test-local-upload.sh"
run_suite "Download Tests" "$SCRIPT_DIR/api-tests/test-local-download.sh"
run_suite "Rate Limit Purchase Tests" "$SCRIPT_DIR/api-tests/test-local-ratelimit-purchase.sh"
run_suite "Content Extension Tests" "$SCRIPT_DIR/api-tests/test-local-extension.sh"
run_suite "User Data Tests" "$SCRIPT_DIR/api-tests/test-local-user.sh"
run_suite "Donation Tests" "$SCRIPT_DIR/api-tests/test-local-donation.sh"
run_suite "Error Handling Tests" "$SCRIPT_DIR/api-tests/test-local-errors.sh"
run_suite "Concurrent Operations Tests" "$SCRIPT_DIR/api-tests/test-local-concurrent.sh"

# Print final summary
echo ""
echo "============================================"
echo "All API Tests Summary"
echo "============================================"
echo "Total Suites:  $TOTAL_SUITES"
echo "Passed Suites: $PASSED_SUITES"
echo "Failed Suites: $FAILED_SUITES"
echo "============================================"

if [ $FAILED_SUITES -eq 0 ]; then
  echo -e "${GREEN}✅ All API Tests Completed Successfully${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some Test Suites Failed:${NC}"
  for suite in "${FAILED_SUITE_NAMES[@]}"; do
    echo -e "  ${RED}- $suite${NC}"
  done
  echo ""
  exit 1
fi
