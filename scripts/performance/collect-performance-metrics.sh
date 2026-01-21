#!/bin/bash
set -e

echo "Collecting performance metrics..."

# Create output directory
mkdir -p build-reports/performance

# Initialize performance data JSON
cat > build-reports/performance/data.json << 'EOF'
{
  "suites": [],
  "summary": {
    "total_tests": 0,
    "total_time_ms": 0,
    "avg_response_time_ms": 0,
    "min_response_time_ms": 0,
    "max_response_time_ms": 0
  }
}
EOF

# Run API tests and capture timing
echo "Running API tests with performance timing..."

# Array to store test suite data
SUITES=""
TOTAL_TIME=0
TOTAL_TESTS=0
MIN_TIME=999999
MAX_TIME=0

# Run each test suite and capture timing
for test_script in scripts/api-tests/test-local-*.sh; do
  TEST_NAME=$(basename "$test_script" .sh | sed 's/test-local-//')
  
  echo "Running $TEST_NAME tests..."
  START_TIME=$(date +%s%3N)
  
  # Run test (continue on error to collect all metrics)
  if bash "$test_script" > /dev/null 2>&1; then
    STATUS="pass"
  else
    STATUS="fail"
  fi
  
  END_TIME=$(date +%s%3N)
  DURATION=$((END_TIME - START_TIME))
  
  # Update statistics
  TOTAL_TIME=$((TOTAL_TIME + DURATION))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  if [ "$DURATION" -lt "$MIN_TIME" ]; then
    MIN_TIME=$DURATION
  fi
  
  if [ "$DURATION" -gt "$MAX_TIME" ]; then
    MAX_TIME=$DURATION
  fi
  
  # Add to suites data
  if [ -z "$SUITES" ]; then
    SUITES="{\"name\":\"$TEST_NAME\",\"duration_ms\":$DURATION,\"status\":\"$STATUS\"}"
  else
    SUITES="$SUITES,{\"name\":\"$TEST_NAME\",\"duration_ms\":$DURATION,\"status\":\"$STATUS\"}"
  fi
  
  echo "  $TEST_NAME: ${DURATION}ms ($STATUS)"
done

# Calculate average
if [ "$TOTAL_TESTS" -gt 0 ]; then
  AVG_TIME=$((TOTAL_TIME / TOTAL_TESTS))
else
  AVG_TIME=0
fi

# Generate final JSON
cat > build-reports/performance/data.json << EOF
{
  "suites": [$SUITES],
  "summary": {
    "total_tests": $TOTAL_TESTS,
    "total_time_ms": $TOTAL_TIME,
    "avg_response_time_ms": $AVG_TIME,
    "min_response_time_ms": $MIN_TIME,
    "max_response_time_ms": $MAX_TIME
  }
}
EOF

echo "Performance metrics collection complete"
echo "Total tests: $TOTAL_TESTS"
echo "Total time: ${TOTAL_TIME}ms"
echo "Average time: ${AVG_TIME}ms"
echo "Min time: ${MIN_TIME}ms"
echo "Max time: ${MAX_TIME}ms"
echo "Data saved to: build-reports/performance/data.json"
