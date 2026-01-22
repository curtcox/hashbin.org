#!/bin/bash
set -e

echo "Generating API tests report..."

API_JSON="build-reports/api-tests/data.json"
TEMPLATE="scripts/reports/templates/api-tests-template.html"
OUTPUT="build-reports/api-tests/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Check if API test data exists
if [ ! -f "$API_JSON" ]; then
  echo "Error: API test data not found at $API_JSON"
  exit 1
fi

# Extract summary metrics
TOTAL_SUITES=$(jq -r '.summary.total_suites' "$API_JSON")
PASSED_SUITES=$(jq -r '.summary.passed_suites' "$API_JSON")
FAILED_SUITES=$(jq -r '.summary.failed_suites' "$API_JSON")
TOTAL_TESTS=$(jq -r '.summary.total_tests' "$API_JSON")
PASSED_TESTS=$(jq -r '.summary.passed_tests' "$API_JSON")
FAILED_TESTS=$(jq -r '.summary.failed_tests' "$API_JSON")

# Calculate pass rate
if [ "$TOTAL_SUITES" -gt 0 ]; then
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_SUITES / $TOTAL_SUITES) * 100}")
else
  PASS_RATE="0.0"
fi

# Determine overall status
if [ "$FAILED_SUITES" -eq 0 ]; then
  OVERALL_STATUS="✅ All Passing"
  STATUS_CLASS="success"
elif [ "$PASSED_SUITES" -gt 0 ]; then
  OVERALL_STATUS="⚠️ Partially Passing"
  STATUS_CLASS="warning"
else
  OVERALL_STATUS="❌ All Failing"
  STATUS_CLASS="error"
fi

# Generate test suite table
SUITE_TABLE=""
for suite_idx in $(jq -r '.suites | to_entries | .[] | .key' "$API_JSON" 2>/dev/null); do
  NAME=$(jq -r ".suites[$suite_idx].name" "$API_JSON")
  STATUS=$(jq -r ".suites[$suite_idx].status" "$API_JSON")
  TOTAL=$(jq -r ".suites[$suite_idx].total" "$API_JSON")
  PASSED=$(jq -r ".suites[$suite_idx].passed" "$API_JSON")
  FAILED=$(jq -r ".suites[$suite_idx].failed" "$API_JSON")
  
  if [ "$STATUS" == "pass" ]; then
    STATUS_ICON="✅"
    ROW_CLASS="pass"
  else
    STATUS_ICON="❌"
    ROW_CLASS="fail"
  fi
  
  SUITE_TABLE+="<tr class='${ROW_CLASS}'>"
  SUITE_TABLE+="<td>${NAME}</td>"
  SUITE_TABLE+="<td>${STATUS_ICON}</td>"
  SUITE_TABLE+="<td>${PASSED}/${TOTAL}</td>"
  SUITE_TABLE+="<td>${FAILED}</td>"
  SUITE_TABLE+="</tr>"
done

# If no suites found, add a message
if [ -z "$SUITE_TABLE" ]; then
  SUITE_TABLE="<tr><td colspan='4'>No API test data available</td></tr>"
fi

# Substitute values into template
sed -e "s|{{TOTAL_SUITES}}|${TOTAL_SUITES}|g" \
    -e "s|{{PASSED_SUITES}}|${PASSED_SUITES}|g" \
    -e "s|{{FAILED_SUITES}}|${FAILED_SUITES}|g" \
    -e "s|{{TOTAL_TESTS}}|${TOTAL_TESTS}|g" \
    -e "s|{{PASSED_TESTS}}|${PASSED_TESTS}|g" \
    -e "s|{{FAILED_TESTS}}|${FAILED_TESTS}|g" \
    -e "s|{{PASS_RATE}}|${PASS_RATE}|g" \
    -e "s|{{OVERALL_STATUS}}|${OVERALL_STATUS}|g" \
    -e "s|{{STATUS_CLASS}}|${STATUS_CLASS}|g" \
    -e "s|{{SUITE_TABLE}}|${SUITE_TABLE}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "API tests report generated: $OUTPUT"
echo "Results: $PASSED_SUITES/$TOTAL_SUITES suites passed (${PASS_RATE}%), $PASSED_TESTS/$TOTAL_TESTS tests passed"
