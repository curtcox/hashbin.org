#!/bin/bash
# Script to generate HTML build report
# Usage: generate-build-report.sh <results-dir> <output-dir> <git-sha> <run-id> <repo>

set -e

RESULTS_DIR="$1"
OUTPUT_DIR="$2"
GIT_SHA="$3"
RUN_ID="$4"
REPO="$5"

if [ -z "$RESULTS_DIR" ] || [ -z "$OUTPUT_DIR" ] || [ -z "$GIT_SHA" ] || [ -z "$RUN_ID" ] || [ -z "$REPO" ]; then
  echo "Usage: $0 <results-dir> <output-dir> <git-sha> <run-id> <repo>"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Collect results
declare -A RESULTS
declare -A DETAILS

for test in linting unit-tests integration-tests api-tests e2e-tests; do
  result_file="$RESULTS_DIR/${test}-result/${test}.txt"
  details_file="$RESULTS_DIR/${test}-result/${test}-details.txt"
  
  if [ -f "$result_file" ]; then
    RESULTS[$test]=$(cat "$result_file")
    if [ -f "$details_file" ]; then
      DETAILS[$test]=$(cat "$details_file")
    else
      DETAILS[$test]="No details available"
    fi
  else
    RESULTS[$test]="UNKNOWN"
    DETAILS[$test]="Result file not found"
  fi
done

# Count failures
FAIL_COUNT=0
for test in linting unit-tests integration-tests api-tests e2e-tests; do
  if [ "${RESULTS[$test]}" == "FAIL" ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

# Determine background color
if [ $FAIL_COUNT -eq 0 ]; then
  BG_COLOR="#ffffff"
elif [ $FAIL_COUNT -eq 1 ]; then
  BG_COLOR="#fff3cd"  # Yellow
else
  BG_COLOR="#f8d7da"  # Red
fi

# Generate main report page
cat > "$OUTPUT_DIR/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Build Report - HashBin.org</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        .metadata {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-size: 14px;
        }
        .metadata p {
            margin: 5px 0;
        }
        .job-list {
            list-style: none;
            padding: 0;
        }
        .job-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 10px 0;
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 5px;
            transition: box-shadow 0.2s;
        }
        .job-item:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .job-status {
            font-size: 24px;
            margin-right: 15px;
            min-width: 30px;
        }
        .job-name {
            flex: 1;
            font-weight: 500;
            color: #333;
        }
        .job-link {
            color: #007bff;
            text-decoration: none;
            font-size: 14px;
        }
        .job-link:hover {
            text-decoration: underline;
        }
        .summary {
            margin: 30px 0;
            padding: 20px;
            background: #e7f3ff;
            border-left: 4px solid #007bff;
            border-radius: 5px;
        }
        .pass { color: #28a745; }
        .fail { color: #dc3545; }
        code {
            background: #f8f9fa;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
        }
    </style>
</head>
<body style="background-color: BG_COLOR_PLACEHOLDER;">
    <h1>🔨 Build Report</h1>
    
    <div class="metadata">
        <p><strong>Repository:</strong> REPO_PLACEHOLDER</p>
        <p><strong>Commit SHA:</strong> <code>GIT_SHA_PLACEHOLDER</code></p>
        <p><strong>Generated:</strong> TIMESTAMP_PLACEHOLDER</p>
        <p><strong>Run ID:</strong> <a href="https://github.com/REPO_PLACEHOLDER/actions/runs/RUN_ID_PLACEHOLDER" target="_blank">RUN_ID_PLACEHOLDER</a></p>
    </div>
    
    <h2>📊 Test Results</h2>
    <ul class="job-list">
        <li class="job-item">
            <span class="job-status">LINTING_STATUS_PLACEHOLDER</span>
            <span class="job-name">Linting</span>
            <a href="linting.html" class="job-link">View Details →</a>
        </li>
        <li class="job-item">
            <span class="job-status">UNIT_TESTS_STATUS_PLACEHOLDER</span>
            <span class="job-name">Unit Tests</span>
            <a href="unit-tests.html" class="job-link">View Details →</a>
        </li>
        <li class="job-item">
            <span class="job-status">INTEGRATION_TESTS_STATUS_PLACEHOLDER</span>
            <span class="job-name">Integration Tests</span>
            <a href="integration-tests.html" class="job-link">View Details →</a>
        </li>
        <li class="job-item">
            <span class="job-status">API_TESTS_STATUS_PLACEHOLDER</span>
            <span class="job-name">API Tests</span>
            <a href="api-tests.html" class="job-link">View Details →</a>
        </li>
        <li class="job-item">
            <span class="job-status">E2E_TESTS_STATUS_PLACEHOLDER</span>
            <span class="job-name">E2E Tests</span>
            <a href="e2e-tests.html" class="job-link">View Details →</a>
        </li>
    </ul>
    
    <div class="summary">
        <h3>Summary</h3>
        <p>Total Jobs: <strong>5</strong></p>
        <p class="pass">Passed: <strong>PASSED_COUNT_PLACEHOLDER</strong></p>
        <p class="fail">Failed: <strong>FAILED_COUNT_PLACEHOLDER</strong></p>
    </div>
</body>
</html>
EOF

# Replace placeholders
sed -i "s|BG_COLOR_PLACEHOLDER|$BG_COLOR|g" "$OUTPUT_DIR/index.html"
sed -i "s|REPO_PLACEHOLDER|$REPO|g" "$OUTPUT_DIR/index.html"
sed -i "s|GIT_SHA_PLACEHOLDER|$GIT_SHA|g" "$OUTPUT_DIR/index.html"
sed -i "s|TIMESTAMP_PLACEHOLDER|$TIMESTAMP|g" "$OUTPUT_DIR/index.html"
sed -i "s|RUN_ID_PLACEHOLDER|$RUN_ID|g" "$OUTPUT_DIR/index.html"

# Replace status icons
for test in linting unit-tests integration-tests api-tests e2e-tests; do
  TEST_UPPER=$(echo "$test" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
  if [ "${RESULTS[$test]}" == "PASS" ]; then
    sed -i "s|${TEST_UPPER}_STATUS_PLACEHOLDER|✅|g" "$OUTPUT_DIR/index.html"
  else
    sed -i "s|${TEST_UPPER}_STATUS_PLACEHOLDER|❌|g" "$OUTPUT_DIR/index.html"
  fi
done

# Replace counts
PASSED_COUNT=$((5 - FAIL_COUNT))
sed -i "s|PASSED_COUNT_PLACEHOLDER|$PASSED_COUNT|g" "$OUTPUT_DIR/index.html"
sed -i "s|FAILED_COUNT_PLACEHOLDER|$FAIL_COUNT|g" "$OUTPUT_DIR/index.html"

# Generate detail pages for each job
for test in linting unit-tests integration-tests api-tests e2e-tests; do
  TEST_NAME=$(echo "$test" | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
  STATUS="${RESULTS[$test]}"
  DETAIL="${DETAILS[$test]}"
  
  if [ "$STATUS" == "PASS" ]; then
    STATUS_ICON="✅"
    STATUS_TEXT="PASSED"
    STATUS_CLASS="pass"
  else
    STATUS_ICON="❌"
    STATUS_TEXT="FAILED"
    STATUS_CLASS="fail"
  fi
  
  cat > "$OUTPUT_DIR/${test}.html" << DETAIL_EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${TEST_NAME} - Build Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            background-color: ${BG_COLOR};
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        .status {
            font-size: 24px;
            margin: 20px 0;
        }
        .status.pass { color: #28a745; }
        .status.fail { color: #dc3545; }
        .details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            border-left: 4px solid #007bff;
            margin: 20px 0;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #007bff;
            text-decoration: none;
            font-weight: 500;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .metadata {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-size: 14px;
        }
        .metadata p {
            margin: 5px 0;
        }
        code {
            background: #f8f9fa;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <h1>${TEST_NAME}</h1>
    
    <div class="metadata">
        <p><strong>Repository:</strong> ${REPO}</p>
        <p><strong>Commit SHA:</strong> <code>${GIT_SHA}</code></p>
        <p><strong>Generated:</strong> ${TIMESTAMP}</p>
        <p><strong>Run ID:</strong> <a href="https://github.com/${REPO}/actions/runs/${RUN_ID}" target="_blank">${RUN_ID}</a></p>
    </div>
    
    <div class="status ${STATUS_CLASS}">
        <strong>Status:</strong> ${STATUS_ICON} ${STATUS_TEXT}
    </div>
    
    <h2>Details</h2>
    <div class="details">${DETAIL}</div>
    
    <a href="index.html" class="back-link">← Back to Build Report</a>
</body>
</html>
DETAIL_EOF
done

echo "✅ Build report generated in $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
