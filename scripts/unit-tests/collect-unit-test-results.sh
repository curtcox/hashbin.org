#!/bin/bash
set -e

echo "Collecting unit test results..."

OUTPUT_DIR="build-reports/unit-tests"
mkdir -p "$OUTPUT_DIR"

# Define unit test scripts (tests that don't require a running server)
UNIT_TESTS=(
  "test-grep-patterns.sh"
  "test-git-sha-injection.sh"
)

# Initialize results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS='[]'

# Run each unit test and collect results
for test_script in "${UNIT_TESTS[@]}"; do
  test_path="scripts/$test_script"
  test_name=$(basename "$test_script" .sh)
  
  echo ""
  echo "Running unit test: $test_name"
  echo "===================="
  
  # Initialize test result
  test_status="passed"
  test_output=""
  test_duration=0
  
  # Run test and capture output
  start_time=$(date +%s)
  if output=$(bash "$test_path" 2>&1); then
    test_status="passed"
    test_output="$output"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    test_status="failed"
    test_output="$output"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  end_time=$(date +%s)
  test_duration=$((end_time - start_time))
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  # Escape output for JSON
  test_output_escaped=$(echo "$test_output" | jq -Rs .)
  
  # Add to results
  TEST_RESULTS=$(echo "$TEST_RESULTS" | jq --arg name "$test_name" \
                                           --arg script "$test_script" \
                                           --arg status "$test_status" \
                                           --argjson output "$test_output_escaped" \
                                           --arg duration "${test_duration}s" \
                                           '. += [{
                                             "name": $name,
                                             "script": $script,
                                             "status": $status,
                                             "output": $output,
                                             "duration": $duration
                                           }]')
  
  echo "Status: $test_status"
  echo ""
done

# Calculate pass rate
if [ "$TOTAL_TESTS" -gt 0 ]; then
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
else
  PASS_RATE="0.0"
fi

# Generate summary JSON
cat > "$OUTPUT_DIR/data.json" << EOF
{
  "summary": {
    "total_tests": $TOTAL_TESTS,
    "passed_tests": $PASSED_TESTS,
    "failed_tests": $FAILED_TESTS,
    "pass_rate": $PASS_RATE,
    "generated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "tests": $TEST_RESULTS
}
EOF

echo ""
echo "Unit test results collected:"
echo "  Total: $TOTAL_TESTS"
echo "  Passed: $PASSED_TESTS"
echo "  Failed: $FAILED_TESTS"
echo "  Pass Rate: ${PASS_RATE}%"
echo ""
echo "Results saved to: $OUTPUT_DIR/data.json"
