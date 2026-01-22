#!/bin/bash
set -e

echo "Collecting API test results..."

# Create output directory
mkdir -p build-reports/api-tests

# Initialize API test results JSON
cat > build-reports/api-tests/data.json << 'EOF'
{
  "suites": [],
  "summary": {
    "total_suites": 0,
    "passed_suites": 0,
    "failed_suites": 0,
    "total_tests": 0,
    "passed_tests": 0,
    "failed_tests": 0
  }
}
EOF

# Run API tests and capture results
echo "Running API tests and collecting results..."

# Array to store test suite data
SUITES=""
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Run each test suite and capture results
shopt -s nullglob  # Handle empty glob matches gracefully
test_scripts=(scripts/api-tests/test-local-*.sh)

if [ ${#test_scripts[@]} -eq 0 ]; then
  echo "Warning: No test scripts found matching pattern scripts/api-tests/test-local-*.sh"
  # Generate final JSON with empty results
  cat > build-reports/api-tests/data.json << EOF
{
  "suites": [],
  "summary": {
    "total_suites": 0,
    "passed_suites": 0,
    "failed_suites": 0,
    "total_tests": 0,
    "passed_tests": 0,
    "failed_tests": 0
  }
}
EOF
  echo "API test results collection complete (no tests found)"
  exit 0
fi

for test_script in "${test_scripts[@]}"; do
  TEST_NAME=$(basename "$test_script" .sh | sed 's/test-local-//')
  
  echo "Running $TEST_NAME tests..."
  TOTAL_SUITES=$((TOTAL_SUITES + 1))
  
  # Capture test output
  TEST_OUTPUT=$(mktemp)
  
  # Run test and capture results (continue on error to collect all results)
  if bash "$test_script" > "$TEST_OUTPUT" 2>&1; then
    STATUS="pass"
    PASSED_SUITES=$((PASSED_SUITES + 1))
  else
    STATUS="fail"
    FAILED_SUITES=$((FAILED_SUITES + 1))
  fi
  
  # Parse test results from output
  # Count passed tests (lines with "✅ PASS")
  SUITE_PASSED=$(grep -c "✅ PASS" "$TEST_OUTPUT" 2>/dev/null || echo "0")
  # Count failed tests (lines with "❌ FAIL")
  SUITE_FAILED=$(grep -c "❌ FAIL" "$TEST_OUTPUT" 2>/dev/null || echo "0")
  SUITE_TOTAL=$((SUITE_PASSED + SUITE_FAILED))
  
  # Update totals
  TOTAL_TESTS=$((TOTAL_TESTS + SUITE_TOTAL))
  PASSED_TESTS=$((PASSED_TESTS + SUITE_PASSED))
  FAILED_TESTS=$((FAILED_TESTS + SUITE_FAILED))
  
  # Build suite data using jq for proper JSON formatting
  # Use --arg and convert to numbers in jq to safely handle numeric values
  SUITE_JSON=$(jq -n \
    --arg name "$TEST_NAME" \
    --arg status "$STATUS" \
    --arg total "$SUITE_TOTAL" \
    --arg passed "$SUITE_PASSED" \
    --arg failed "$SUITE_FAILED" \
    '{name: $name, status: $status, total: ($total | tonumber), passed: ($passed | tonumber), failed: ($failed | tonumber), tests: []}')
  
  # Add to suites array
  if [ -z "$SUITES" ]; then
    SUITES="$SUITE_JSON"
  else
    SUITES="$SUITES,$SUITE_JSON"
  fi
  
  echo "  $TEST_NAME: $SUITE_PASSED passed, $SUITE_FAILED failed ($STATUS)"
  
  # Clean up temp file
  rm -f "$TEST_OUTPUT"
done

# Handle empty suites case
if [ -z "$SUITES" ]; then
  SUITES=""
fi

# Generate final JSON
cat > build-reports/api-tests/data.json << EOF
{
  "suites": [$SUITES],
  "summary": {
    "total_suites": $TOTAL_SUITES,
    "passed_suites": $PASSED_SUITES,
    "failed_suites": $FAILED_SUITES,
    "total_tests": $TOTAL_TESTS,
    "passed_tests": $PASSED_TESTS,
    "failed_tests": $FAILED_TESTS
  }
}
EOF

echo "API test results collection complete"
echo "Total suites: $TOTAL_SUITES (passed: $PASSED_SUITES, failed: $FAILED_SUITES)"
echo "Total tests: $TOTAL_TESTS (passed: $PASSED_TESTS, failed: $FAILED_TESTS)"
echo "Data saved to: build-reports/api-tests/data.json"
