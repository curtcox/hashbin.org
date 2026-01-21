#!/bin/bash
set -e

echo "Running security scans..."

# Create output directory
mkdir -p build-reports/security

# Run npm audit and save JSON output
echo "Running npm audit..."
npm audit --json > build-reports/security/npm-audit.json 2>&1 || true
echo "npm audit complete"

# Run ESLint security scan
echo "Running ESLint security scan..."
npx eslint src/ \
  --format json \
  --output-file build-reports/security/eslint-security.json \
  --no-error-on-unmatched-pattern \
  2>&1 || true
echo "ESLint security scan complete"

# Combine results into a single data.json with summary metrics
echo "Combining security scan results..."
NPM_TOTAL=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
ESLINT_ERRORS=$(jq '[.[] | .errorCount] | add' build-reports/security/eslint-security.json 2>/dev/null || echo "0")
ESLINT_WARNINGS=$(jq '[.[] | .warningCount] | add' build-reports/security/eslint-security.json 2>/dev/null || echo "0")

cat > build-reports/security/data.json << EOF
{
  "summary": {
    "npm_vulnerabilities": $NPM_TOTAL,
    "eslint_errors": $ESLINT_ERRORS,
    "eslint_warnings": $ESLINT_WARNINGS
  },
  "npm_audit": "See npm-audit.json for details",
  "eslint": "See eslint-security.json for details"
}
EOF

echo "Security scan complete"
echo "npm audit data: build-reports/security/npm-audit.json"
echo "ESLint data: build-reports/security/eslint-security.json"
echo "Combined data: build-reports/security/data.json"
