#!/bin/bash
set -e

echo "Generating main build report..."

TEMPLATE="scripts/reports/templates/main-template.html"
OUTPUT="build-reports/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
BUILD_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# Check if all component reports exist
COVERAGE_EXISTS="unavailable"
SECURITY_EXISTS="unavailable"
PERFORMANCE_EXISTS="unavailable"

if [ -f "build-reports/coverage/index.html" ]; then
  COVERAGE_EXISTS="available"
fi

if [ -f "build-reports/security/index.html" ]; then
  SECURITY_EXISTS="available"
fi

if [ -f "build-reports/performance/index.html" ]; then
  PERFORMANCE_EXISTS="available"
fi

# Extract metrics from component data files
if [ "$COVERAGE_EXISTS" == "available" ] && [ -f "build-reports/coverage/data.json" ]; then
  COVERAGE_LINES=$(jq -r '[.[] | .s] | add / length * 100' build-reports/coverage/data.json 2>/dev/null | xargs printf "%.2f" 2>/dev/null || echo "0.00")
else
  COVERAGE_LINES="N/A"
fi

if [ "$SECURITY_EXISTS" == "available" ] && [ -f "build-reports/security/npm-audit.json" ]; then
  SECURITY_VULNS=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
else
  SECURITY_VULNS="N/A"
fi

if [ "$PERFORMANCE_EXISTS" == "available" ] && [ -f "build-reports/performance/data.json" ]; then
  PERF_AVG=$(jq -r '.summary.avg_response_time_ms' build-reports/performance/data.json 2>/dev/null || echo "0")
else
  PERF_AVG="N/A"
fi

# Generate metadata JSON
cat > build-reports/metadata.json << EOF
{
  "generated_at": "$TIMESTAMP",
  "commit_sha": "$COMMIT_SHA",
  "repository": "${GITHUB_REPOSITORY}",
  "build_url": "$BUILD_URL",
  "reports": {
    "coverage": {
      "available": $([ "$COVERAGE_EXISTS" == "available" ] && echo "true" || echo "false"),
      "line_coverage": "$COVERAGE_LINES"
    },
    "security": {
      "available": $([ "$SECURITY_EXISTS" == "available" ] && echo "true" || echo "false"),
      "vulnerabilities": "$SECURITY_VULNS"
    },
    "performance": {
      "available": $([ "$PERFORMANCE_EXISTS" == "available" ] && echo "true" || echo "false"),
      "avg_time_ms": "$PERF_AVG"
    }
  }
}
EOF

# Substitute values into template
sed -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{TIMESTAMP}}|${TIMESTAMP}|g" \
    -e "s|{{BUILD_URL}}|${BUILD_URL}|g" \
    -e "s|{{COVERAGE_EXISTS}}|${COVERAGE_EXISTS}|g" \
    -e "s|{{SECURITY_EXISTS}}|${SECURITY_EXISTS}|g" \
    -e "s|{{PERFORMANCE_EXISTS}}|${PERFORMANCE_EXISTS}|g" \
    -e "s|{{COVERAGE_LINES}}|${COVERAGE_LINES}|g" \
    -e "s|{{SECURITY_VULNS}}|${SECURITY_VULNS}|g" \
    -e "s|{{PERF_AVG}}|${PERF_AVG}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Main build report generated: $OUTPUT"
echo "  Coverage: $COVERAGE_LINES%"
echo "  Security: $SECURITY_VULNS vulnerabilities"
echo "  Performance: ${PERF_AVG}ms average"
