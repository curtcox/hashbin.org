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

# Combine results into a single data.json
echo "Combining security scan results..."
cat > build-reports/security/data.json << 'EOF'
{
  "npm_audit": "See npm-audit.json for details",
  "eslint": "See eslint-security.json for details"
}
EOF

echo "Security scan complete"
echo "npm audit data: build-reports/security/npm-audit.json"
echo "ESLint data: build-reports/security/eslint-security.json"
echo "Combined data: build-reports/security/data.json"
