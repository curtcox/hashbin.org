#!/bin/bash
set -e

echo "Collecting code coverage with c8..."

# Create output directory
mkdir -p build-reports/coverage

# Check if there are JavaScript unit tests
if ! find . -name "*.test.js" -o -name "*.spec.js" | grep -q .; then
  echo "ℹ️  No JavaScript unit tests found (*.test.js or *.spec.js)"
  echo "   Current tests are integration tests that test the deployed service."
  echo "   Code coverage requires unit tests to analyze."
  
  # Create a data file indicating no tests (matching c8 format)
  cat > build-reports/coverage/data.json << 'EOF'
{
  "total": {
    "lines": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "statements": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "functions": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "branches": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 }
  },
  "message": "No unit tests found. Current tests are integration tests."
}
EOF
  
  echo "Coverage data created at: build-reports/coverage/data.json"
  exit 0
fi

# If we have unit tests, run c8
echo "Running tests with c8 coverage..."
npx c8 \
  --reporter=html \
  --reporter=json-summary \
  --reports-dir=build-reports/coverage/raw \
  --exclude='scripts/**' \
  --exclude='docs/**' \
  --exclude='frontend/**' \
  --exclude='**/*.test.js' \
  --exclude='**/*.spec.js' \
  --all \
  npm test

# Copy c8 JSON summary to data.json
if [ -f build-reports/coverage/raw/coverage-summary.json ]; then
  cp build-reports/coverage/raw/coverage-summary.json build-reports/coverage/data.json
  echo "✅ Coverage collection complete"
  echo "   HTML Report: build-reports/coverage/raw/index.html"
  echo "   JSON Data: build-reports/coverage/data.json"
else
  echo "⚠️  Warning: c8 did not generate coverage-summary.json"
  # Create empty coverage data matching c8 format
  cat > build-reports/coverage/data.json << 'EOF'
{
  "total": {
    "lines": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "statements": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "functions": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 },
    "branches": { "total": 0, "covered": 0, "skipped": 0, "pct": 0 }
  }
}
EOF
fi
