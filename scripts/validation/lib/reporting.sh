#!/bin/bash
# Test result formatting and reporting functions
# This library provides consistent test output and reporting

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Test results storage
declare -a TEST_IDS
declare -a TEST_DESCRIPTIONS
declare -a TEST_STATUSES
declare -a TEST_DETAILS

# Verbose mode flag
VERBOSE=${VERBOSE:-false}

# Initialize test suite
# Usage: init_test_suite <suite_name>
init_test_suite() {
  local suite_name="$1"
  
  echo ""
  echo "=========================================="
  echo "$suite_name"
  echo "=========================================="
  echo ""
  
  TOTAL_TESTS=0
  PASSED_TESTS=0
  FAILED_TESTS=0
  SKIPPED_TESTS=0
  
  TEST_IDS=()
  TEST_DESCRIPTIONS=()
  TEST_STATUSES=()
  TEST_DETAILS=()
}

# Log test pass
# Usage: log_pass <test_id> <description> [details]
log_pass() {
  local test_id="$1"
  local description="$2"
  local details="${3:-}"
  
  PASSED_TESTS=$((PASSED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  TEST_IDS+=("$test_id")
  TEST_DESCRIPTIONS+=("$description")
  TEST_STATUSES+=("PASS")
  TEST_DETAILS+=("$details")
  
  if [ "$VERBOSE" = "true" ] || [ -n "$details" ]; then
    echo -e "${GREEN}✅ PASS${NC}: [$test_id] $description"
    if [ -n "$details" ]; then
      echo "   ℹ️  $details"
    fi
  else
    echo -e "${GREEN}✅ PASS${NC}: [$test_id] $description"
  fi
}

# Log test failure
# Usage: log_fail <test_id> <description> <details>
log_fail() {
  local test_id="$1"
  local description="$2"
  local details="$3"
  
  FAILED_TESTS=$((FAILED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  TEST_IDS+=("$test_id")
  TEST_DESCRIPTIONS+=("$description")
  TEST_STATUSES+=("FAIL")
  TEST_DETAILS+=("$details")
  
  echo -e "${RED}❌ FAIL${NC}: [$test_id] $description"
  echo "   ❗ $details"
  
  # Add GitHub Actions annotation if running in CI
  if [ -n "$GITHUB_ACTIONS" ]; then
    echo "::error title=Test Failed ($test_id)::$description - $details"
  fi
}

# Log test skip
# Usage: log_skip <test_id> <description> <reason>
log_skip() {
  local test_id="$1"
  local description="$2"
  local reason="$3"
  
  SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  TEST_IDS+=("$test_id")
  TEST_DESCRIPTIONS+=("$description")
  TEST_STATUSES+=("SKIP")
  TEST_DETAILS+=("$reason")
  
  echo -e "${YELLOW}⊘ SKIP${NC}: [$test_id] $description"
  if [ -n "$reason" ]; then
    echo "   ℹ️  $reason"
  fi
}

# Log informational message
# Usage: log_info <message>
log_info() {
  local message="$1"
  echo -e "${BLUE}ℹ️${NC}  $message"
}

# Log warning message
# Usage: log_warn <message>
log_warn() {
  local message="$1"
  echo -e "${YELLOW}⚠️${NC}  $message"
}

# Log section header
# Usage: log_section <section_name>
log_section() {
  local section_name="$1"
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$section_name${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# Print test summary
# Usage: print_test_summary
print_test_summary() {
  echo ""
  echo "=========================================="
  echo "Test Summary"
  echo "=========================================="
  echo "Total Tests:  $TOTAL_TESTS"
  echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
  echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
  echo -e "Skipped:      ${YELLOW}$SKIPPED_TESTS${NC}"
  echo ""
  
  if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "Failed tests:"
    for i in "${!TEST_IDS[@]}"; do
      if [ "${TEST_STATUSES[$i]}" = "FAIL" ]; then
        echo "  - [${TEST_IDS[$i]}] ${TEST_DESCRIPTIONS[$i]}"
        echo "    ${TEST_DETAILS[$i]}"
      fi
    done
    return 1
  fi
}

# Generate JSON test report
# Usage: generate_json_report [output_file]
generate_json_report() {
  local output_file="${1:-/dev/stdout}"
  
  cat > "$output_file" <<EOF
{
  "summary": {
    "total": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "skipped": $SKIPPED_TESTS
  },
  "tests": [
EOF

  for i in "${!TEST_IDS[@]}"; do
    local comma=","
    if [ $i -eq $((${#TEST_IDS[@]} - 1)) ]; then
      comma=""
    fi
    
    cat >> "$output_file" <<EOF
    {
      "id": "${TEST_IDS[$i]}",
      "description": "${TEST_DESCRIPTIONS[$i]}",
      "status": "${TEST_STATUSES[$i]}",
      "details": "${TEST_DETAILS[$i]}"
    }$comma
EOF
  done

  cat >> "$output_file" <<EOF
  ]
}
EOF
}

# Exit with appropriate code based on test results
# Usage: exit_with_results
exit_with_results() {
  if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
}

# Create GitHub Actions annotations for failed tests
# Usage: create_github_annotations
create_github_annotations() {
  if [ -z "$GITHUB_ACTIONS" ]; then
    return 0
  fi
  
  for i in "${!TEST_IDS[@]}"; do
    local status="${TEST_STATUSES[$i]}"
    local test_id="${TEST_IDS[$i]}"
    local description="${TEST_DESCRIPTIONS[$i]}"
    local details="${TEST_DETAILS[$i]}"
    
    case "$status" in
      FAIL)
        echo "::error title=Test Failed ($test_id)::$description - $details"
        ;;
      SKIP)
        echo "::warning title=Test Skipped ($test_id)::$description - $details"
        ;;
      PASS)
        # Only log pass in verbose mode
        if [ "$VERBOSE" = "true" ]; then
          echo "::notice title=Test Passed ($test_id)::$description"
        fi
        ;;
    esac
  done
}
