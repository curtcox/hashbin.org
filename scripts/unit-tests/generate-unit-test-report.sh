#!/bin/bash
set -e

echo "Generating unit tests report..."

TEMPLATE="scripts/unit-tests/template.html"
OUTPUT_DIR="build-reports/unit-tests"
OUTPUT="$OUTPUT_DIR/index.html"
DATA_FILE="$OUTPUT_DIR/data.json"

# Check if data file exists
if [ ! -f "$DATA_FILE" ]; then
  echo "Error: Data file not found at $DATA_FILE"
  exit 1
fi

# Extract summary data
TOTAL_TESTS=$(jq -r '.summary.total_tests' "$DATA_FILE")
PASSED_TESTS=$(jq -r '.summary.passed_tests' "$DATA_FILE")
FAILED_TESTS=$(jq -r '.summary.failed_tests' "$DATA_FILE")
PASS_RATE=$(jq -r '.summary.pass_rate' "$DATA_FILE")
GENERATED_AT=$(jq -r '.summary.generated_at' "$DATA_FILE")

# Format timestamp
TIMESTAMP=$(date -d "$GENERATED_AT" -u +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$GENERATED_AT")

# Repository info
REPOSITORY="${GITHUB_REPOSITORY:-N/A}"
COMMIT_SHA="${GITHUB_SHA:-unknown}"

# Generate test items HTML
TEST_ITEMS=""
test_count=$(jq -r '.tests | length' "$DATA_FILE")

for ((i=0; i<test_count; i++)); do
  test_name=$(jq -r ".tests[$i].name" "$DATA_FILE")
  test_script=$(jq -r ".tests[$i].script" "$DATA_FILE")
  test_status=$(jq -r ".tests[$i].status" "$DATA_FILE")
  test_duration=$(jq -r ".tests[$i].duration" "$DATA_FILE")
  test_output=$(jq -r ".tests[$i].output" "$DATA_FILE")
  
  # Escape HTML in output
  test_output_html=$(echo "$test_output" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
  
  TEST_ITEMS+="
      <div class=\"test-item $test_status\">
        <div class=\"test-header\">
          <div>
            <div class=\"test-title\">$test_name</div>
            <div style=\"color: #57606a; font-size: 14px; margin-top: 4px;\">$test_script</div>
          </div>
          <div class=\"test-meta\">
            <span>⏱️ $test_duration</span>
            <span class=\"test-status $test_status\">$(echo $test_status | tr '[:lower:]' '[:upper:]')</span>
          </div>
        </div>
        <div class=\"test-details\">
          <h3 style=\"margin: 0 0 12px 0; color: #24292f;\">Test Output</h3>
          <div class=\"test-output\">$test_output_html</div>
        </div>
      </div>"
done

# If no tests, show a message
if [ "$test_count" -eq 0 ]; then
  TEST_ITEMS="<div style=\"padding: 40px; text-align: center; color: #57606a;\">No unit tests were run.</div>"
fi

# Generate the report
sed -e "s|{{TIMESTAMP}}|${TIMESTAMP}|g" \
    -e "s|{{REPOSITORY}}|${REPOSITORY}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{TOTAL_TESTS}}|${TOTAL_TESTS}|g" \
    -e "s|{{PASSED_TESTS}}|${PASSED_TESTS}|g" \
    -e "s|{{FAILED_TESTS}}|${FAILED_TESTS}|g" \
    -e "s|{{PASS_RATE}}|${PASS_RATE}|g" \
    "$TEMPLATE" > "$OUTPUT.tmp"

# Replace the test items placeholder (using a different approach to handle multiline)
awk -v items="$TEST_ITEMS" '{
  if ($0 ~ /{{TEST_ITEMS}}/) {
    print items
  } else {
    print $0
  }
}' "$OUTPUT.tmp" > "$OUTPUT"

rm "$OUTPUT.tmp"

echo "Unit tests report generated: $OUTPUT"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $PASSED_TESTS"
echo "  Failed: $FAILED_TESTS"
echo "  Pass Rate: ${PASS_RATE}%"
