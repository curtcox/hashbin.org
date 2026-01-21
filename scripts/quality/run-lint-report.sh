#!/bin/bash
set -e

echo "Running enhanced linting..."

mkdir -p build-reports/quality

npx eslint src \
  --format json \
  --output-file build-reports/quality/eslint.json \
  --no-error-on-unmatched-pattern \
  2>/dev/null || true

# Default to empty array if eslint output missing
if [ ! -f build-reports/quality/eslint.json ]; then
  echo "[]" > build-reports/quality/eslint.json
fi

# Publish ESLint JSON as data.json (tool-native format)
cp build-reports/quality/eslint.json build-reports/quality/data.json

ERRORS=$(jq '[.[] | .errorCount] | add' build-reports/quality/eslint.json 2>/dev/null || echo "0")
WARNINGS=$(jq '[.[] | .warningCount] | add' build-reports/quality/eslint.json 2>/dev/null || echo "0")

cat > build-reports/quality/summary.json << EOF
{
  "errors": ${ERRORS:-0},
  "warnings": ${WARNINGS:-0}
}
EOF

echo "Linting complete: ${ERRORS:-0} errors, ${WARNINGS:-0} warnings"
