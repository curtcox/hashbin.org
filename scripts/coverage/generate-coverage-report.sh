#!/bin/bash
set -e

echo "Generating coverage report..."

COVERAGE_JSON="build-reports/coverage/data.json"
TEMPLATE="scripts/reports/templates/coverage-template.html"
OUTPUT="build-reports/coverage/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA:-HEAD}"

# Check if coverage data exists
if [ ! -f "$COVERAGE_JSON" ]; then
  echo "⚠️  Warning: Coverage data not found at $COVERAGE_JSON"
  exit 1
fi

# Check if there's a message (no unit tests)
MESSAGE=$(jq -r '.message // empty' "$COVERAGE_JSON" 2>/dev/null)
if [ -n "$MESSAGE" ]; then
  echo "ℹ️  $MESSAGE"
  
  # Create the no-tests message in a file to avoid escaping issues
  cat > /tmp/files_table.txt << 'TABLE_EOF'
<tr><td colspan='4' style='text-align: center; padding: 40px;'><strong>No unit tests found</strong><br/><br/>The current test suite consists of integration tests that test the deployed service.<br/>Code coverage analysis requires JavaScript unit tests (*.test.js or *.spec.js).</td></tr>
TABLE_EOF
  
  # Create a simple report indicating no tests
  sed -e "s|{{TOTAL_LINES}}|N/A|g" \
      -e "s|{{TOTAL_BRANCHES}}|N/A|g" \
      -e "s|{{TOTAL_FUNCTIONS}}|N/A|g" \
      -e "s|{{TOTAL_STATEMENTS}}|N/A|g" \
      -e "s|{{REPO_URL}}|${REPO_URL}|g" \
      -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
      "$TEMPLATE" > "$OUTPUT.tmp"
  
  # Replace the FILES_TABLE placeholder
  sed -e "/{{FILE_TABLE}}/r /tmp/files_table.txt" -e "/{{FILE_TABLE}}/d" "$OUTPUT.tmp" > "$OUTPUT"
  rm -f "$OUTPUT.tmp" /tmp/files_table.txt
  
  echo "✅ Coverage report generated: $OUTPUT"
  exit 0
fi

# Parse c8 JSON format (coverage-summary.json)
LINES_PCT=$(jq -r '.total.lines.pct // 0' "$COVERAGE_JSON" 2>/dev/null)
STATEMENTS_PCT=$(jq -r '.total.statements.pct // 0' "$COVERAGE_JSON" 2>/dev/null)
FUNCTIONS_PCT=$(jq -r '.total.functions.pct // 0' "$COVERAGE_JSON" 2>/dev/null)
BRANCHES_PCT=$(jq -r '.total.branches.pct // 0' "$COVERAGE_JSON" 2>/dev/null)

# Check if values were extracted
if [ -z "$LINES_PCT" ] || [ "$LINES_PCT" = "null" ]; then
  echo "⚠️  Warning: Could not parse coverage metrics from $COVERAGE_JSON"
  LINES_PCT="0"
  STATEMENTS_PCT="0"
  FUNCTIONS_PCT="0"
  BRANCHES_PCT="0"
fi

# Format percentages
LINES_PCT=$(printf "%.1f" "$LINES_PCT" 2>/dev/null || echo "0.0")
STATEMENTS_PCT=$(printf "%.1f" "$STATEMENTS_PCT" 2>/dev/null || echo "0.0")
FUNCTIONS_PCT=$(printf "%.1f" "$FUNCTIONS_PCT" 2>/dev/null || echo "0.0")
BRANCHES_PCT=$(printf "%.1f" "$BRANCHES_PCT" 2>/dev/null || echo "0.0")

# Check thresholds (warnings only)
echo "Coverage Metrics:"
echo "  Lines: ${LINES_PCT}%"
echo "  Statements: ${STATEMENTS_PCT}%"
echo "  Functions: ${FUNCTIONS_PCT}%"
echo "  Branches: ${BRANCHES_PCT}%"

if (( $(echo "$LINES_PCT < 80" | bc -l 2>/dev/null || echo "0") )); then
  echo "⚠️  Warning: Line coverage (${LINES_PCT}%) below 80% threshold"
fi

if (( $(echo "$BRANCHES_PCT < 70" | bc -l 2>/dev/null || echo "0") )); then
  echo "⚠️  Warning: Branch coverage (${BRANCHES_PCT}%) below 70% threshold"
fi

# Generate file-by-file coverage table with GitHub links
FILES_TABLE=""
for file in $(jq -r 'keys[] | select(. != "total")' "$COVERAGE_JSON" 2>/dev/null); do
  LINE_PCT=$(jq -r ".[\"$file\"].lines.pct // 0" "$COVERAGE_JSON")
  BRANCH_PCT=$(jq -r ".[\"$file\"].branches.pct // 0" "$COVERAGE_JSON")
  FUNC_PCT=$(jq -r ".[\"$file\"].functions.pct // 0" "$COVERAGE_JSON")
  STMT_PCT=$(jq -r ".[\"$file\"].statements.pct // 0" "$COVERAGE_JSON")
  
  # Format percentages
  LINE_PCT=$(printf "%.1f" "$LINE_PCT" 2>/dev/null || echo "0.0")
  BRANCH_PCT=$(printf "%.1f" "$BRANCH_PCT" 2>/dev/null || echo "0.0")
  
  # Create GitHub link
  FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${file}"
  
  FILES_TABLE+="<tr>"
  FILES_TABLE+="<td><a href='${FILE_LINK}' target='_blank'>${file}</a></td>"
  FILES_TABLE+="<td>${LINE_PCT}%</td>"
  FILES_TABLE+="<td>${BRANCH_PCT}%</td>"
  FILES_TABLE+="<td>N/A</td>"  # Uncovered lines would require coverage-final.json
  FILES_TABLE+="</tr>"
done

# If no files, show a message
if [ -z "$FILES_TABLE" ]; then
  FILES_TABLE="<tr><td colspan='4' style='text-align: center; padding: 20px;'>No files analyzed</td></tr>"
fi

# Write FILES_TABLE to a temp file to avoid escaping issues
echo "$FILES_TABLE" > /tmp/files_table.txt

# Substitute values into template
sed -e "s|{{TOTAL_LINES}}|${LINES_PCT}|g" \
    -e "s|{{TOTAL_STATEMENTS}}|${STATEMENTS_PCT}|g" \
    -e "s|{{TOTAL_FUNCTIONS}}|${FUNCTIONS_PCT}|g" \
    -e "s|{{TOTAL_BRANCHES}}|${BRANCHES_PCT}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT.tmp"

# Replace FILES_TABLE placeholder
sed -e "/{{FILE_TABLE}}/r /tmp/files_table.txt" -e "/{{FILE_TABLE}}/d" "$OUTPUT.tmp" > "$OUTPUT"
rm -f "$OUTPUT.tmp" /tmp/files_table.txt

echo "✅ Coverage report generated: $OUTPUT"
