#!/bin/bash
set -e

echo "Generating performance report..."

PERF_JSON="build-reports/performance/data.json"
TEMPLATE="scripts/reports/templates/performance-template.html"
OUTPUT="build-reports/performance/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Check if performance data exists
if [ ! -f "$PERF_JSON" ]; then
  echo "Error: Performance data not found at $PERF_JSON"
  exit 1
fi

# Extract summary metrics
TOTAL_TESTS=$(jq -r '.summary.total_tests' "$PERF_JSON")
TOTAL_TIME=$(jq -r '.summary.total_time_ms' "$PERF_JSON")
AVG_TIME=$(jq -r '.summary.avg_response_time_ms' "$PERF_JSON")
MIN_TIME=$(jq -r '.summary.min_response_time_ms' "$PERF_JSON")
MAX_TIME=$(jq -r '.summary.max_response_time_ms' "$PERF_JSON")

# Check thresholds (warnings only)
if [ "$AVG_TIME" -gt 1000 ]; then
  echo "⚠️  Warning: Average test time (${AVG_TIME}ms) exceeds 1000ms threshold"
fi

if [ "$MAX_TIME" -gt 5000 ]; then
  echo "⚠️  Warning: Maximum test time (${MAX_TIME}ms) exceeds 5000ms threshold"
fi

# Generate test suite table
SUITE_TABLE=""
for suite_idx in $(jq -r '.suites | to_entries | .[] | .key' "$PERF_JSON" 2>/dev/null); do
  NAME=$(jq -r ".suites[$suite_idx].name" "$PERF_JSON")
  DURATION=$(jq -r ".suites[$suite_idx].duration_ms" "$PERF_JSON")
  STATUS=$(jq -r ".suites[$suite_idx].status" "$PERF_JSON")
  
  if [ "$STATUS" == "pass" ]; then
    STATUS_ICON="✅"
  else
    STATUS_ICON="❌"
  fi
  
  # Determine color based on duration
  if [ "$DURATION" -lt 500 ]; then
    DURATION_CLASS="fast"
  elif [ "$DURATION" -lt 2000 ]; then
    DURATION_CLASS="medium"
  else
    DURATION_CLASS="slow"
  fi
  
  SUITE_TABLE+="<tr>"
  SUITE_TABLE+="<td>${NAME}</td>"
  SUITE_TABLE+="<td class='${DURATION_CLASS}'>${DURATION}ms</td>"
  SUITE_TABLE+="<td>${STATUS_ICON}</td>"
  SUITE_TABLE+="</tr>"
done

# If no suites found, add a message
if [ -z "$SUITE_TABLE" ]; then
  SUITE_TABLE="<tr><td colspan='3'>No performance data available</td></tr>"
fi

# Substitute values into template
sed -e "s|{{TOTAL_TESTS}}|${TOTAL_TESTS}|g" \
    -e "s|{{TOTAL_TIME}}|${TOTAL_TIME}|g" \
    -e "s|{{AVG_TIME}}|${AVG_TIME}|g" \
    -e "s|{{MIN_TIME}}|${MIN_TIME}|g" \
    -e "s|{{MAX_TIME}}|${MAX_TIME}|g" \
    -e "s|{{SUITE_TABLE}}|${SUITE_TABLE}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Performance report generated: $OUTPUT"
echo "Metrics: Total: ${TOTAL_TESTS} tests, ${TOTAL_TIME}ms total, Avg: ${AVG_TIME}ms, Min: ${MIN_TIME}ms, Max: ${MAX_TIME}ms"
