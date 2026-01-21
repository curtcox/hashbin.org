#!/bin/bash
set -e

echo "Running complexity analysis..."

mkdir -p build-reports/complexity

npx eslint src \
  --config scripts/complexity/eslint-complexity.cjs \
  --format json \
  --output-file build-reports/complexity/eslint-complexity.json \
  --no-error-on-unmatched-pattern \
  2>/dev/null || true

if [ ! -f build-reports/complexity/eslint-complexity.json ]; then
  echo "[]" > build-reports/complexity/eslint-complexity.json
fi

cp build-reports/complexity/eslint-complexity.json build-reports/complexity/data.json

COMPLEXITY_COUNT=$(jq '[.[] | .messages[] | select(.ruleId == "complexity" or .ruleId == "sonarjs/cognitive-complexity")] | length' build-reports/complexity/eslint-complexity.json 2>/dev/null || echo "0")

cat > build-reports/complexity/summary.json << EOF
{
  "complexity_issues": ${COMPLEXITY_COUNT:-0}
}
EOF

echo "Complexity analysis complete: ${COMPLEXITY_COUNT:-0} issues"
