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
for test_script in scripts/api-tests/test-local-*.sh; do
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
  # Count passed tests (lines with "✅ PASSED")
  SUITE_PASSED=$(grep -c "✅ PASSED" "$TEST_OUTPUT" 2>/dev/null || echo "0")
  # Count failed tests (lines with "❌ FAILED")
  SUITE_FAILED=$(grep -c "❌ FAILED" "$TEST_OUTPUT" 2>/dev/null || echo "0")
  SUITE_TOTAL=$((SUITE_PASSED + SUITE_FAILED))
  
  # Update totals
  TOTAL_TESTS=$((TOTAL_TESTS + SUITE_TOTAL))
  PASSED_TESTS=$((PASSED_TESTS + SUITE_PASSED))
  FAILED_TESTS=$((FAILED_TESTS + SUITE_FAILED))
  
  # Extract test details
  TEST_DETAILS="[]"
  
  # Add to suites data
  if [ -z "$SUITES" ]; then
    SUITES="{\"name\":\"$TEST_NAME\",\"status\":\"$STATUS\",\"total\":$SUITE_TOTAL,\"passed\":$SUITE_PASSED,\"failed\":$SUITE_FAILED,\"tests\":$TEST_DETAILS}"
  else
    SUITES="$SUITES,{\"name\":\"$TEST_NAME\",\"status\":\"$STATUS\",\"total\":$SUITE_TOTAL,\"passed\":$SUITE_PASSED,\"failed\":$SUITE_FAILED,\"tests\":$TEST_DETAILS}"
  fi
  
  echo "  $TEST_NAME: $SUITE_PASSED passed, $SUITE_FAILED failed ($STATUS)"
  
  # Clean up temp file
  rm -f "$TEST_OUTPUT"
done

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
