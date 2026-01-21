#!/bin/bash
set -e

echo "Generating coverage report..."

COVERAGE_JSON="build-reports/coverage/data.json"
TEMPLATE="scripts/reports/templates/coverage-template.html"
OUTPUT="build-reports/coverage/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Check if coverage data exists
if [ ! -f "$COVERAGE_JSON" ]; then
  echo "Warning: Coverage data not found at $COVERAGE_JSON"
  echo "Creating placeholder coverage data..."
  mkdir -p build-reports/coverage
  cat > "$COVERAGE_JSON" << 'EOF'
{
  "files": [],
  "summary": {
    "lines": 0,
    "statements": 0,
    "functions": 0,
    "branches": 0
  }
}
EOF
fi

# Extract summary metrics
LINES_PCT=$(jq -r '[.[] | .s] | if length > 0 then (add / length * 100) else 0 end' "$COVERAGE_JSON" 2>/dev/null | xargs printf "%.2f" 2>/dev/null || echo "0.00")
STATEMENTS_PCT="0.00"
FUNCTIONS_PCT="0.00"
BRANCHES_PCT="0.00"

# Substitute values into template
sed -e "s|{{LINES_PCT}}|${LINES_PCT}|g" \
    -e "s|{{STATEMENTS_PCT}}|${STATEMENTS_PCT}|g" \
    -e "s|{{FUNCTIONS_PCT}}|${FUNCTIONS_PCT}|g" \
    -e "s|{{BRANCHES_PCT}}|${BRANCHES_PCT}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{FILES_TABLE}}|<tr><td colspan='5'>Coverage collection not yet implemented</td></tr>|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Coverage report generated: $OUTPUT"
echo "Note: Coverage collection is not yet implemented - showing placeholder data"
