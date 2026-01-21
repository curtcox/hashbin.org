# Phase 1 Technical Specification: Build Report MVP

**Version**: 1.0
**Status**: Ready for Implementation
**Phase**: 1 of 4 (MVP - Coverage, Security & Performance)

## Overview

Phase 1 implements the minimum viable product (MVP) for the enhanced build report system. This includes code coverage analysis, security scanning, and performance metrics with HTML reports and JSON data export.

## Goals

1. Collect code coverage metrics using c8
2. Scan for security vulnerabilities using npm audit and ESLint security plugins
3. Measure API performance by modifying existing tests
4. Generate HTML reports with links to GitHub source files
5. Publish JSON data in native tool formats
6. Deploy reports to GitHub Pages in subdirectory structure
7. All findings are warnings only (non-blocking)

## System Architecture

### High-Level Flow

```
GitHub Actions Workflow (build-report.yml)
├── 1. Run Tests with Coverage (c8)
├── 2. Run Security Scans (npm audit + ESLint)
├── 3. Run API Tests with Performance Timing
├── 4. Generate Reports
│   ├── Coverage Report (HTML + JSON)
│   ├── Security Report (HTML + JSON)
│   └── Performance Report (HTML + JSON)
├── 5. Generate Main TOC Page
└── 6. Deploy to GitHub Pages (gh-pages branch)
```

### Directory Structure

```
.github/workflows/
└── build-report.yml (modified)

scripts/
├── coverage/
│   ├── collect-coverage.sh (new)
│   └── generate-coverage-report.sh (new)
├── security/
│   ├── run-security-scan.sh (new)
│   └── generate-security-report.sh (new)
├── performance/
│   ├── collect-performance-metrics.sh (new)
│   └── generate-performance-report.sh (new)
├── reports/
│   ├── generate-main-report.sh (new)
│   └── templates/ (new)
│       ├── main-template.html
│       ├── coverage-template.html
│       ├── security-template.html
│       └── performance-template.html
└── deploy/
    └── deploy-to-pages.sh (modified from existing)

build-reports/ (generated, gitignored)
├── coverage/
│   ├── index.html
│   └── data.json
├── security/
│   ├── index.html
│   └── data.json
├── performance/
│   ├── index.html
│   └── data.json
├── index.html
└── metadata.json
```

## Dependencies

### New npm Packages to Add

```json
{
  "devDependencies": {
    "c8": "^9.1.0",
    "eslint": "^8.57.0",
    "eslint-plugin-security": "^2.1.1",
    "eslint-plugin-no-unsanitized": "^4.0.2",
    "eslint-plugin-node": "^11.1.0"
  }
}
```

### System Requirements

- Node.js 20.x (already in use)
- Bash 4.0+
- jq (for JSON processing)
- GitHub Actions environment

## Component 1: Code Coverage

### Implementation Steps

#### 1.1: Install c8

```bash
npm install --save-dev c8
```

#### 1.2: Create Coverage Collection Script

**File**: `scripts/coverage/collect-coverage.sh`

```bash
#!/bin/bash
set -e

echo "Collecting code coverage with c8..."

# Create output directory
mkdir -p build-reports/coverage

# Run tests with coverage
# Note: Adjust test command based on what tests to run
c8 \
  --reporter=html \
  --reporter=json \
  --reporter=lcov \
  --reports-dir=build-reports/coverage/raw \
  --exclude='test/**' \
  --exclude='scripts/**' \
  --exclude='docs/**' \
  npm test

# Copy c8 JSON output to data.json
cp build-reports/coverage/raw/coverage-final.json build-reports/coverage/data.json

echo "Coverage collection complete"
echo "HTML Report: build-reports/coverage/raw/index.html"
echo "JSON Data: build-reports/coverage/data.json"
```

#### 1.3: Create Coverage Report Generator

**File**: `scripts/coverage/generate-coverage-report.sh`

```bash
#!/bin/bash
set -e

echo "Generating coverage report..."

COVERAGE_JSON="build-reports/coverage/data.json"
TEMPLATE="scripts/reports/templates/coverage-template.html"
OUTPUT="build-reports/coverage/index.html"
REPO_URL="https://github.com/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Extract coverage summary from c8 JSON
TOTAL_LINES=$(jq '.total.lines.pct' "$COVERAGE_JSON")
TOTAL_BRANCHES=$(jq '.total.branches.pct' "$COVERAGE_JSON")
TOTAL_FUNCTIONS=$(jq '.total.functions.pct' "$COVERAGE_JSON")
TOTAL_STATEMENTS=$(jq '.total.statements.pct' "$COVERAGE_JSON")

# Check thresholds (warnings only)
if (( $(echo "$TOTAL_LINES < 80" | bc -l) )); then
  echo "⚠️  Warning: Line coverage ($TOTAL_LINES%) below 80% threshold"
fi

if (( $(echo "$TOTAL_BRANCHES < 70" | bc -l) )); then
  echo "⚠️  Warning: Branch coverage ($TOTAL_BRANCHES%) below 70% threshold"
fi

# Generate file-by-file coverage table with GitHub links
FILE_TABLE=""
for file in $(jq -r 'keys[]' "$COVERAGE_JSON" | grep -v "total"); do
  LINE_PCT=$(jq -r ".[\"$file\"].lines.pct" "$COVERAGE_JSON")
  BRANCH_PCT=$(jq -r ".[\"$file\"].branches.pct" "$COVERAGE_JSON")

  # Get uncovered line ranges
  UNCOVERED_LINES=$(jq -r ".[\"$file\"].lines.uncovered | join(\", \")" "$COVERAGE_JSON")

  # Create GitHub link
  FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${file}"

  FILE_TABLE+="<tr>"
  FILE_TABLE+="<td><a href='${FILE_LINK}' target='_blank'>${file}</a></td>"
  FILE_TABLE+="<td>${LINE_PCT}%</td>"
  FILE_TABLE+="<td>${BRANCH_PCT}%</td>"
  FILE_TABLE+="<td>${UNCOVERED_LINES}</td>"
  FILE_TABLE+="</tr>"
done

# Substitute values into template
sed -e "s|{{TOTAL_LINES}}|${TOTAL_LINES}|g" \
    -e "s|{{TOTAL_BRANCHES}}|${TOTAL_BRANCHES}|g" \
    -e "s|{{TOTAL_FUNCTIONS}}|${TOTAL_FUNCTIONS}|g" \
    -e "s|{{TOTAL_STATEMENTS}}|${TOTAL_STATEMENTS}|g" \
    -e "s|{{FILE_TABLE}}|${FILE_TABLE}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Coverage report generated: $OUTPUT"
```

#### 1.4: Coverage HTML Template

**File**: `scripts/reports/templates/coverage-template.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Coverage Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    .header { margin-bottom: 30px; }
    .back-link { color: #0969da; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .metric-card { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 20px; }
    .metric-value { font-size: 36px; font-weight: bold; color: #24292f; }
    .metric-label { color: #57606a; font-size: 14px; margin-top: 8px; }
    .warning { color: #bf8700; }
    .good { color: #1a7f37; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #d0d7de; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:hover { background: #f6f8fa; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .download-link { display: inline-block; margin-top: 20px; padding: 8px 16px; background: #0969da; color: white; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <a href="../" class="back-link">← Back to Build Report</a>
    <h1>Code Coverage Report</h1>
    <p>Commit: <a href="{{REPO_URL}}/commit/{{COMMIT_SHA}}" target="_blank">{{COMMIT_SHA}}</a></p>
  </div>

  <div class="summary">
    <div class="metric-card">
      <div class="metric-value">{{TOTAL_LINES}}%</div>
      <div class="metric-label">Line Coverage</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{TOTAL_BRANCHES}}%</div>
      <div class="metric-label">Branch Coverage</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{TOTAL_FUNCTIONS}}%</div>
      <div class="metric-label">Function Coverage</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{TOTAL_STATEMENTS}}%</div>
      <div class="metric-label">Statement Coverage</div>
    </div>
  </div>

  <h2>File Coverage</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Line %</th>
        <th>Branch %</th>
        <th>Uncovered Lines</th>
      </tr>
    </thead>
    <tbody>
      {{FILE_TABLE}}
    </tbody>
  </table>

  <a href="data.json" class="download-link" download>Download JSON Data</a>
</body>
</html>
```

## Component 2: Security Scanning

### Implementation Steps

#### 2.1: Install ESLint and Security Plugins

```bash
npm install --save-dev eslint eslint-plugin-security eslint-plugin-no-unsanitized eslint-plugin-node
```

#### 2.2: Create ESLint Configuration

**File**: `.eslintrc.json` (new or modify existing)

```json
{
  "env": {
    "node": true,
    "es2021": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "plugins": [
    "security",
    "no-unsanitized",
    "node"
  ],
  "rules": {
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "warn",
    "security/detect-buffer-noassert": "warn",
    "security/detect-child-process": "warn",
    "security/detect-disable-mustache-escape": "warn",
    "security/detect-eval-with-expression": "warn",
    "security/detect-no-csrf-before-method-override": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-non-literal-require": "warn",
    "security/detect-possible-timing-attacks": "warn",
    "security/detect-pseudoRandomBytes": "warn",
    "no-unsanitized/method": "warn",
    "no-unsanitized/property": "warn"
  }
}
```

#### 2.3: Create Security Scan Script

**File**: `scripts/security/run-security-scan.sh`

```bash
#!/bin/bash
set -e

echo "Running security scans..."

mkdir -p build-reports/security

# Run npm audit
echo "Running npm audit..."
npm audit --json > build-reports/security/npm-audit.json || true

# Run ESLint with security rules
echo "Running ESLint security scan..."
npx eslint \
  --format json \
  --output-file build-reports/security/eslint-security.json \
  'src/**/*.js' || true

# Combine results into data.json
jq -s '{npmAudit: .[0], eslint: .[1]}' \
  build-reports/security/npm-audit.json \
  build-reports/security/eslint-security.json \
  > build-reports/security/data.json

echo "Security scan complete"
echo "JSON Data: build-reports/security/data.json"
```

#### 2.4: Create Security Report Generator

**File**: `scripts/security/generate-security-report.sh`

```bash
#!/bin/bash
set -e

echo "Generating security report..."

SECURITY_JSON="build-reports/security/data.json"
TEMPLATE="scripts/reports/templates/security-template.html"
OUTPUT="build-reports/security/index.html"
REPO_URL="https://github.com/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Count npm audit vulnerabilities by severity
CRITICAL=$(jq '.npmAudit.metadata.vulnerabilities.critical // 0' "$SECURITY_JSON")
HIGH=$(jq '.npmAudit.metadata.vulnerabilities.high // 0' "$SECURITY_JSON")
MODERATE=$(jq '.npmAudit.metadata.vulnerabilities.moderate // 0' "$SECURITY_JSON")
LOW=$(jq '.npmAudit.metadata.vulnerabilities.low // 0' "$SECURITY_JSON")
TOTAL_NPM=$((CRITICAL + HIGH + MODERATE + LOW))

# Count ESLint security findings
ESLINT_COUNT=$(jq '[.eslint[].messages[]] | length' "$SECURITY_JSON")

# Generate npm audit table
NPM_TABLE=""
if [ "$TOTAL_NPM" -gt 0 ]; then
  for vuln in $(jq -c '.npmAudit.vulnerabilities | to_entries[]' "$SECURITY_JSON"); do
    NAME=$(echo "$vuln" | jq -r '.value.name')
    SEVERITY=$(echo "$vuln" | jq -r '.value.severity')
    TITLE=$(echo "$vuln" | jq -r '.value.via[0].title // "Unknown"')

    NPM_TABLE+="<tr>"
    NPM_TABLE+="<td>${NAME}</td>"
    NPM_TABLE+="<td class='severity-${SEVERITY}'>${SEVERITY}</td>"
    NPM_TABLE+="<td>${TITLE}</td>"
    NPM_TABLE+="</tr>"
  done
else
  NPM_TABLE="<tr><td colspan='3'>No vulnerabilities found</td></tr>"
fi

# Generate ESLint findings table
ESLINT_TABLE=""
if [ "$ESLINT_COUNT" -gt 0 ]; then
  for finding in $(jq -c '.eslint[] | .filePath as $file | .messages[] | . + {file: $file}' "$SECURITY_JSON"); do
    FILE=$(echo "$finding" | jq -r '.file' | sed "s|$(pwd)/||")
    LINE=$(echo "$finding" | jq -r '.line')
    MESSAGE=$(echo "$finding" | jq -r '.message')
    RULE=$(echo "$finding" | jq -r '.ruleId')

    FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${FILE}#L${LINE}"

    ESLINT_TABLE+="<tr>"
    ESLINT_TABLE+="<td><a href='${FILE_LINK}' target='_blank'>${FILE}:${LINE}</a></td>"
    ESLINT_TABLE+="<td>${RULE}</td>"
    ESLINT_TABLE+="<td>${MESSAGE}</td>"
    ESLINT_TABLE+="</tr>"
  done
else
  ESLINT_TABLE="<tr><td colspan='3'>No security issues found</td></tr>"
fi

# Warnings
if [ "$CRITICAL" -gt 0 ]; then
  echo "⚠️  Warning: $CRITICAL critical vulnerabilities found"
fi
if [ "$HIGH" -gt 0 ]; then
  echo "⚠️  Warning: $HIGH high severity vulnerabilities found"
fi

# Substitute into template
sed -e "s|{{CRITICAL}}|${CRITICAL}|g" \
    -e "s|{{HIGH}}|${HIGH}|g" \
    -e "s|{{MODERATE}}|${MODERATE}|g" \
    -e "s|{{LOW}}|${LOW}|g" \
    -e "s|{{ESLINT_COUNT}}|${ESLINT_COUNT}|g" \
    -e "s|{{NPM_TABLE}}|${NPM_TABLE}|g" \
    -e "s|{{ESLINT_TABLE}}|${ESLINT_TABLE}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Security report generated: $OUTPUT"
```

#### 2.5: Security HTML Template

**File**: `scripts/reports/templates/security-template.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    .header { margin-bottom: 30px; }
    .back-link { color: #0969da; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin: 30px 0; }
    .metric-card { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 20px; }
    .metric-value { font-size: 36px; font-weight: bold; color: #24292f; }
    .metric-label { color: #57606a; font-size: 14px; margin-top: 8px; }
    .severity-critical { color: #d1242f; font-weight: bold; }
    .severity-high { color: #cf222e; font-weight: bold; }
    .severity-moderate { color: #bf8700; }
    .severity-low { color: #57606a; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #d0d7de; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:hover { background: #f6f8fa; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .section { margin-top: 50px; }
    .download-link { display: inline-block; margin-top: 20px; padding: 8px 16px; background: #0969da; color: white; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <a href="../" class="back-link">← Back to Build Report</a>
    <h1>Security Analysis Report</h1>
    <p>Commit: <a href="{{REPO_URL}}/commit/{{COMMIT_SHA}}" target="_blank">{{COMMIT_SHA}}</a></p>
  </div>

  <div class="summary">
    <div class="metric-card">
      <div class="metric-value severity-critical">{{CRITICAL}}</div>
      <div class="metric-label">Critical</div>
    </div>
    <div class="metric-card">
      <div class="metric-value severity-high">{{HIGH}}</div>
      <div class="metric-label">High</div>
    </div>
    <div class="metric-card">
      <div class="metric-value severity-moderate">{{MODERATE}}</div>
      <div class="metric-label">Moderate</div>
    </div>
    <div class="metric-card">
      <div class="metric-value severity-low">{{LOW}}</div>
      <div class="metric-label">Low</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{ESLINT_COUNT}}</div>
      <div class="metric-label">Code Issues</div>
    </div>
  </div>

  <div class="section">
    <h2>Dependency Vulnerabilities</h2>
    <table>
      <thead>
        <tr>
          <th>Package</th>
          <th>Severity</th>
          <th>Issue</th>
        </tr>
      </thead>
      <tbody>
        {{NPM_TABLE}}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Code Security Issues (ESLint)</h2>
    <table>
      <thead>
        <tr>
          <th>Location</th>
          <th>Rule</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {{ESLINT_TABLE}}
      </tbody>
    </table>
  </div>

  <a href="data.json" class="download-link" download>Download JSON Data</a>
</body>
</html>
```

## Component 3: Performance Metrics

### Implementation Steps

#### 3.1: Modify API Test Scripts

We need to wrap the existing API tests with timing instrumentation. The existing tests are in `scripts/api-tests/`.

**File**: `scripts/performance/collect-performance-metrics.sh`

```bash
#!/bin/bash
set -e

echo "Collecting performance metrics..."

mkdir -p build-reports/performance

# Start timing
START_TIME=$(date +%s%N)

# Run API tests with timing wrapper
# This will modify each test script to record timing
PERF_OUTPUT="build-reports/performance/timing-data.txt"
> "$PERF_OUTPUT"

# Run each API test suite and capture timing
for test_script in scripts/api-tests/*-tests.sh; do
  TEST_NAME=$(basename "$test_script" .sh)
  echo "Running $TEST_NAME..."

  TEST_START=$(date +%s%N)
  bash "$test_script" || true
  TEST_END=$(date +%s%N)

  DURATION=$(( (TEST_END - TEST_START) / 1000000 ))  # Convert to milliseconds
  echo "$TEST_NAME:$DURATION" >> "$PERF_OUTPUT"
done

END_TIME=$(date +%s%N)
TOTAL_DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "total:$TOTAL_DURATION" >> "$PERF_OUTPUT"

# Convert to JSON format
python3 scripts/performance/convert-to-json.py \
  "$PERF_OUTPUT" \
  build-reports/performance/data.json

echo "Performance metrics collected"
echo "JSON Data: build-reports/performance/data.json"
```

#### 3.2: Create JSON Converter

**File**: `scripts/performance/convert-to-json.py`

```python
#!/usr/bin/env python3
import json
import sys

def main():
    if len(sys.argv) != 3:
        print("Usage: convert-to-json.py <input_file> <output_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    results = {}

    with open(input_file, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            name, duration = line.split(':')
            results[name] = {
                'duration_ms': int(duration),
                'duration_formatted': f"{int(duration)/1000:.2f}s"
            }

    # Calculate statistics
    durations = [v['duration_ms'] for k, v in results.items() if k != 'total']
    if durations:
        results['statistics'] = {
            'min_ms': min(durations),
            'max_ms': max(durations),
            'avg_ms': sum(durations) // len(durations),
            'test_count': len(durations)
        }

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"Converted {input_file} to {output_file}")

if __name__ == '__main__':
    main()
```

#### 3.3: Create Performance Report Generator

**File**: `scripts/performance/generate-performance-report.sh`

```bash
#!/bin/bash
set -e

echo "Generating performance report..."

PERF_JSON="build-reports/performance/data.json"
TEMPLATE="scripts/reports/templates/performance-template.html"
OUTPUT="build-reports/performance/index.html"
REPO_URL="https://github.com/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Extract statistics
TOTAL_DURATION=$(jq -r '.total.duration_formatted' "$PERF_JSON")
TEST_COUNT=$(jq -r '.statistics.test_count' "$PERF_JSON")
AVG_DURATION=$(jq -r '.statistics.avg_ms' "$PERF_JSON")
MAX_DURATION=$(jq -r '.statistics.max_ms' "$PERF_JSON")

# Generate test results table
TEST_TABLE=""
for test in $(jq -r 'keys[]' "$PERF_JSON" | grep -v -E '(total|statistics)'); do
  DURATION=$(jq -r ".[\"$test\"].duration_formatted" "$PERF_JSON")
  DURATION_MS=$(jq -r ".[\"$test\"].duration_ms" "$PERF_JSON")

  # Determine if slow (>5 seconds as example threshold)
  WARNING=""
  if [ "$DURATION_MS" -gt 5000 ]; then
    WARNING="⚠️ "
  fi

  TEST_TABLE+="<tr>"
  TEST_TABLE+="<td>${WARNING}${test}</td>"
  TEST_TABLE+="<td>${DURATION}</td>"
  TEST_TABLE+="</tr>"
done

# Substitute into template
sed -e "s|{{TOTAL_DURATION}}|${TOTAL_DURATION}|g" \
    -e "s|{{TEST_COUNT}}|${TEST_COUNT}|g" \
    -e "s|{{AVG_DURATION}}|${AVG_DURATION}|g" \
    -e "s|{{MAX_DURATION}}|${MAX_DURATION}|g" \
    -e "s|{{TEST_TABLE}}|${TEST_TABLE}|g" \
    -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Performance report generated: $OUTPUT"
```

#### 3.4: Performance HTML Template

**File**: `scripts/reports/templates/performance-template.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Metrics Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    .header { margin-bottom: 30px; }
    .back-link { color: #0969da; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .metric-card { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 20px; }
    .metric-value { font-size: 36px; font-weight: bold; color: #24292f; }
    .metric-label { color: #57606a; font-size: 14px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #d0d7de; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:hover { background: #f6f8fa; }
    .download-link { display: inline-block; margin-top: 20px; padding: 8px 16px; background: #0969da; color: white; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <a href="../" class="back-link">← Back to Build Report</a>
    <h1>Performance Metrics Report</h1>
    <p>Commit: <a href="{{REPO_URL}}/commit/{{COMMIT_SHA}}" target="_blank">{{COMMIT_SHA}}</a></p>
  </div>

  <div class="summary">
    <div class="metric-card">
      <div class="metric-value">{{TOTAL_DURATION}}</div>
      <div class="metric-label">Total Duration</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{TEST_COUNT}}</div>
      <div class="metric-label">Tests Run</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{AVG_DURATION}}ms</div>
      <div class="metric-label">Average Duration</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">{{MAX_DURATION}}ms</div>
      <div class="metric-label">Slowest Test</div>
    </div>
  </div>

  <h2>Test Suite Performance</h2>
  <table>
    <thead>
      <tr>
        <th>Test Suite</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      {{TEST_TABLE}}
    </tbody>
  </table>

  <p><strong>Note:</strong> ⚠️ indicates tests taking longer than 5 seconds</p>

  <a href="data.json" class="download-link" download>Download JSON Data</a>
</body>
</html>
```

## Component 4: Main Report Page

### Implementation Steps

#### 4.1: Create Main Report Generator

**File**: `scripts/reports/generate-main-report.sh`

```bash
#!/bin/bash
set -e

echo "Generating main report page..."

TEMPLATE="scripts/reports/templates/main-template.html"
OUTPUT="build-reports/index.html"
REPO_URL="https://github.com/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Extract key metrics
COVERAGE_LINES=$(jq -r '.total.lines.pct // "N/A"' build-reports/coverage/data.json)
SECURITY_CRITICAL=$(jq -r '.npmAudit.metadata.vulnerabilities.critical // 0' build-reports/security/data.json)
SECURITY_HIGH=$(jq -r '.npmAudit.metadata.vulnerabilities.high // 0' build-reports/security/data.json)
PERF_TOTAL=$(jq -r '.total.duration_formatted // "N/A"' build-reports/performance/data.json)

# Determine overall status
OVERALL_STATUS="pass"
if [ "$SECURITY_CRITICAL" -gt 0 ] || [ "$SECURITY_HIGH" -gt 0 ]; then
  OVERALL_STATUS="warning"
fi

# Create metadata.json
cat > build-reports/metadata.json <<EOF
{
  "commit": "$COMMIT_SHA",
  "timestamp": "$TIMESTAMP",
  "repository": "$GITHUB_REPOSITORY",
  "status": "$OVERALL_STATUS",
  "summary": {
    "coverage_pct": $COVERAGE_LINES,
    "security_critical": $SECURITY_CRITICAL,
    "security_high": $SECURITY_HIGH,
    "total_duration": "$PERF_TOTAL"
  }
}
EOF

# Substitute into template
sed -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{TIMESTAMP}}|${TIMESTAMP}|g" \
    -e "s|{{OVERALL_STATUS}}|${OVERALL_STATUS}|g" \
    -e "s|{{COVERAGE_LINES}}|${COVERAGE_LINES}|g" \
    -e "s|{{SECURITY_CRITICAL}}|${SECURITY_CRITICAL}|g" \
    -e "s|{{SECURITY_HIGH}}|${SECURITY_HIGH}|g" \
    -e "s|{{PERF_TOTAL}}|${PERF_TOTAL}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Main report generated: $OUTPUT"
```

#### 4.2: Main HTML Template

**File**: `scripts/reports/templates/main-template.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Build Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f6f8fa; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; border: 1px solid #d0d7de; border-radius: 6px; padding: 30px; margin-bottom: 30px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: 500; }
    .status-pass { background: #dafbe1; color: #1a7f37; }
    .status-warning { background: #fff8c5; color: #bf8700; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
    .metric-card { background: white; border: 1px solid #d0d7de; border-radius: 6px; padding: 20px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #24292f; }
    .metric-label { color: #57606a; font-size: 14px; margin-top: 8px; }
    .reports { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .report-card { background: white; border: 1px solid #d0d7de; border-radius: 6px; padding: 20px; text-decoration: none; color: inherit; display: block; transition: all 0.2s; }
    .report-card:hover { border-color: #0969da; box-shadow: 0 3px 12px rgba(0,0,0,0.1); }
    .report-title { font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #0969da; }
    .report-desc { color: #57606a; font-size: 14px; }
    .footer { margin-top: 50px; text-align: center; color: #57606a; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔨 Build Report</h1>
      <div style="margin: 20px 0;">
        <span class="status-badge status-{{OVERALL_STATUS}}">{{OVERALL_STATUS}}</span>
      </div>
      <p><strong>Repository:</strong> <a href="{{REPO_URL}}" target="_blank">{{REPO_URL}}</a></p>
      <p><strong>Commit:</strong> <a href="{{REPO_URL}}/commit/{{COMMIT_SHA}}" target="_blank">{{COMMIT_SHA}}</a></p>
      <p><strong>Generated:</strong> {{TIMESTAMP}}</p>
    </div>

    <div class="summary">
      <div class="metric-card">
        <div class="metric-value">{{COVERAGE_LINES}}%</div>
        <div class="metric-label">Line Coverage</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{SECURITY_CRITICAL}}</div>
        <div class="metric-label">Critical Vulnerabilities</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{SECURITY_HIGH}}</div>
        <div class="metric-label">High Vulnerabilities</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{PERF_TOTAL}}</div>
        <div class="metric-label">Total Test Duration</div>
      </div>
    </div>

    <h2>Reports</h2>
    <div class="reports">
      <a href="coverage/" class="report-card">
        <div class="report-title">📊 Code Coverage</div>
        <div class="report-desc">Line, branch, function, and statement coverage metrics with source links</div>
      </a>

      <a href="security/" class="report-card">
        <div class="report-title">🔒 Security Analysis</div>
        <div class="report-desc">Dependency vulnerabilities and code security findings</div>
      </a>

      <a href="performance/" class="report-card">
        <div class="report-title">⚡ Performance Metrics</div>
        <div class="report-desc">Test execution times and performance baselines</div>
      </a>
    </div>

    <div class="footer">
      <p>Build report generated by GitHub Actions</p>
      <p><a href="metadata.json">View metadata.json</a></p>
    </div>
  </div>
</body>
</html>
```

## Component 5: GitHub Actions Workflow

### Implementation Steps

#### 5.1: Update build-report.yml

**File**: `.github/workflows/build-report.yml` (modify existing)

```yaml
name: Build Report

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build-report:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run coverage collection
        run: bash scripts/coverage/collect-coverage.sh
        continue-on-error: true

      - name: Generate coverage report
        run: bash scripts/coverage/generate-coverage-report.sh
        continue-on-error: true

      - name: Run security scan
        run: bash scripts/security/run-security-scan.sh
        continue-on-error: true

      - name: Generate security report
        run: bash scripts/security/generate-security-report.sh
        continue-on-error: true

      - name: Collect performance metrics
        run: bash scripts/performance/collect-performance-metrics.sh
        continue-on-error: true

      - name: Generate performance report
        run: bash scripts/performance/generate-performance-report.sh
        continue-on-error: true

      - name: Generate main report
        run: bash scripts/reports/generate-main-report.sh

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build-reports
          publish_branch: gh-pages
          force_orphan: true

      - name: Output report URL
        run: |
          echo "📊 Build report published to: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/"
```

## Testing Strategy

### Unit Testing

For each script component:

1. **Coverage Collection**: Verify c8 generates correct output format
2. **Security Scanning**: Verify npm audit and ESLint produce expected JSON
3. **Performance Metrics**: Verify timing data is captured correctly
4. **Report Generation**: Verify HTML templates render with test data
5. **Link Generation**: Verify GitHub URLs are correctly formatted

### Integration Testing

1. Run full workflow locally using `act` or similar tool
2. Verify all scripts execute in sequence
3. Verify reports are generated in correct subdirectory structure
4. Verify JSON files contain valid data
5. Verify HTML reports display correctly

### Deployment Testing

1. Deploy to test repository first
2. Verify GitHub Pages serves reports correctly
3. Verify all links to GitHub source files work
4. Verify JSON files are accessible
5. Verify report navigation works

## Implementation Checklist

- [x] Install dependencies (c8, ESLint, plugins)
- [x] Create directory structure (scripts/coverage, scripts/security, etc.)
- [x] Implement coverage collection script
- [x] Implement coverage report generator
- [x] Create coverage HTML template
- [x] Implement security scanning script
- [x] Implement security report generator
- [x] Create security HTML template
- [x] Implement performance collection script
- [x] Implement performance report generator
- [x] Create performance HTML template
- [x] Implement main report generator
- [x] Create main HTML template
- [x] Update build-report.yml workflow
- [ ] Test locally (partially done - security and main report tested)
- [ ] Test deployment to gh-pages
- [ ] Verify all GitHub source links work
- [ ] Verify JSON data is correct format
- [ ] Document usage

## Success Criteria

Phase 1 is complete when:

1. ✅ Coverage metrics collected using c8
2. ✅ Security vulnerabilities identified using npm audit and ESLint
3. ✅ Performance metrics captured for all test suites
4. ✅ HTML reports generated with GitHub source links
5. ✅ JSON data published in native tool formats
6. ✅ Reports deployed to GitHub Pages in subdirectory structure
7. ✅ Main TOC page links to all report pages
8. ✅ All findings are warnings only (non-blocking)
9. ✅ Workflow runs on main branch only
10. ✅ All links functional and point to correct locations

## Rollback Plan

If Phase 1 implementation fails:

1. Revert changes to `.github/workflows/build-report.yml`
2. Remove new script files
3. Uninstall new dependencies
4. Keep existing build report functionality unchanged

## Next Steps After Phase 1

Once Phase 1 is complete and tested:

1. Gather feedback on report usability
2. Identify any performance issues with build time
3. Plan Phase 2 implementation (Code Quality & Complexity)
4. Document lessons learned
