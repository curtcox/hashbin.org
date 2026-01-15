#!/bin/bash
# Test reporter script for CI
# Runs all tests and generates a summary for GitHub Actions
# This makes test results visible directly on the PR

# Note: Not using 'set -e' because we need to continue running
# even when individual test suites fail to collect all results
# Using pipefail for robustness (useful if future changes add pipelines)
set -o pipefail

# Track temporary files for cleanup
declare -a TEMP_FILES

# Cleanup function
cleanup() {
  for temp_file in "${TEMP_FILES[@]}"; do
    if [ -f "$temp_file" ]; then
      rm -f "$temp_file"
    fi
  done
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Helper function to escape output for markdown code blocks
# Replaces triple backticks with a safe alternative to prevent breaking the code block
# Uses zero-width joiner characters (U+200D) between backticks: ` ‍ ` ‍ `
escape_for_markdown() {
  local text="$1"
  # Replace ``` with `‍`‍` (backtick + zero-width joiner between each)
  echo "$text" | sed 's/```/`‍`‍`/g'
}

# Initialize counters
TOTAL_TEST_SUITES=0
PASSED_TEST_SUITES=0
FAILED_TEST_SUITES=0

# Test suite results
declare -a SUITE_RESULTS
declare -a SUITE_NAMES
declare -a SUITE_OUTPUTS

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to run a test suite
run_test_suite() {
  local suite_name="$1"
  local suite_script="$2"
  
  echo ""
  echo "=========================================="
  echo "Running: $suite_name"
  echo "=========================================="
  
  TOTAL_TEST_SUITES=$((TOTAL_TEST_SUITES + 1))
  SUITE_NAMES+=("$suite_name")
  
  # Validate that the test script exists
  if [ ! -f "$suite_script" ]; then
    echo -e "${RED}ERROR${NC}: Test script not found: $suite_script"
    echo ""
    SUITE_RESULTS+=("FAIL")
    SUITE_OUTPUTS+=("Test script not found: $suite_script")
    FAILED_TEST_SUITES=$((FAILED_TEST_SUITES + 1))
    
    # Add GitHub Actions annotation if running in CI
    if [ -n "$GITHUB_ACTIONS" ]; then
      echo "::error title=Test Script Not Found::$suite_name - script not found: $suite_script"
    fi
    
    return 1
  fi
  
  # Capture output and exit code
  # Using a more robust method with temporary files
  local output
  local exit_code
  local temp_file
  
  temp_file=$(mktemp)
  TEMP_FILES+=("$temp_file")  # Track for safety (cleanup trap handles unexpected exits)
  
  bash "$suite_script" > "$temp_file" 2>&1
  exit_code=$?
  output=$(cat "$temp_file")
  rm -f "$temp_file"
  
  # Store results
  SUITE_OUTPUTS+=("$output")
  
  if [ $exit_code -eq 0 ]; then
    SUITE_RESULTS+=("PASS")
    PASSED_TEST_SUITES=$((PASSED_TEST_SUITES + 1))
    echo -e "${GREEN}✅ PASSED${NC}: $suite_name"
    
    # Add GitHub Actions annotation if running in CI
    if [ -n "$GITHUB_ACTIONS" ]; then
      echo "::notice title=Test Suite Passed::$suite_name completed successfully"
    fi
  else
    SUITE_RESULTS+=("FAIL")
    FAILED_TEST_SUITES=$((FAILED_TEST_SUITES + 1))
    echo -e "${RED}❌ FAILED${NC}: $suite_name"
    
    # Add GitHub Actions annotation if running in CI
    if [ -n "$GITHUB_ACTIONS" ]; then
      echo "::error title=Test Suite Failed::$suite_name failed with exit code $exit_code"
    fi
  fi
  
  # Print output
  echo "$output"
  echo ""
}

# Main execution
echo ""
echo "=========================================="
echo "HashBin.org Test Suite"
echo "=========================================="
echo ""

# Run test suites
run_test_suite "Grep Patterns Test" "scripts/test-grep-patterns.sh"
run_test_suite "User Balance Test" "scripts/test-user-balance.sh"
run_test_suite "Auth Gate Test" "scripts/test-auth-gate.sh"

# Generate summary
echo ""
echo "=========================================="
echo "Test Suite Summary"
echo "=========================================="
echo "Total Suites:  $TOTAL_TEST_SUITES"
echo -e "Passed:        ${GREEN}$PASSED_TEST_SUITES${NC}"
echo -e "Failed:        ${RED}$FAILED_TEST_SUITES${NC}"
echo ""

# Generate GitHub Actions Job Summary if running in CI
if [ -n "$GITHUB_STEP_SUMMARY" ]; then
  echo "Generating GitHub Actions summary..."
  
  {
    echo "## 📊 Test Results"
    echo ""
    echo "| Test Suite | Status | Details |"
    echo "|------------|--------|---------|"
    
    for i in "${!SUITE_NAMES[@]}"; do
      name="${SUITE_NAMES[$i]}"
      result="${SUITE_RESULTS[$i]}"
      
      if [ "$result" = "PASS" ]; then
        echo "| $name | ✅ **PASSED** | All checks passed |"
      else
        echo "| $name | ❌ **FAILED** | See logs for details |"
      fi
    done
    
    echo ""
    echo "### Summary"
    echo ""
    echo "- **Total Test Suites:** $TOTAL_TEST_SUITES"
    echo "- **Passed:** ✅ $PASSED_TEST_SUITES"
    echo "- **Failed:** ❌ $FAILED_TEST_SUITES"
    
    if [ $FAILED_TEST_SUITES -eq 0 ]; then
      echo ""
      echo "✅ **All tests passed!**"
    else
      echo ""
      echo "❌ **Some tests failed. Please review the logs above.**"
    fi
    
    echo ""
    echo "---"
    echo ""
    echo "<details>"
    echo "<summary>📋 Detailed Test Output</summary>"
    echo ""
    
    for i in "${!SUITE_NAMES[@]}"; do
      name="${SUITE_NAMES[$i]}"
      output="${SUITE_OUTPUTS[$i]}"
      result="${SUITE_RESULTS[$i]}"
      
      echo ""
      echo "#### $name"
      echo ""
      if [ "$result" = "PASS" ]; then
        echo "Status: ✅ **PASSED**"
      else
        echo "Status: ❌ **FAILED**"
      fi
      echo ""
      echo "\`\`\`text"
      # Escape output to prevent markdown injection
      escaped_output=$(escape_for_markdown "$output")
      echo "$escaped_output"
      echo "\`\`\`"
      echo ""
    done
    
    echo "</details>"
    
  } >> "$GITHUB_STEP_SUMMARY"
  
  echo "✅ Summary written to GitHub Actions job summary"
fi

# Exit with failure if any tests failed
if [ $FAILED_TEST_SUITES -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Test suite failed${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
fi
