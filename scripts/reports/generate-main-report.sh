#!/bin/bash
set -e

echo "Generating main build report..."

TEMPLATE="scripts/reports/templates/main-template.html"
OUTPUT="build-reports/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
BUILD_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# Report availability
COVERAGE_EXISTS="unavailable"
SECURITY_EXISTS="unavailable"
PERFORMANCE_EXISTS="unavailable"
UNIT_TESTS_EXISTS="unavailable"
API_TESTS_EXISTS="unavailable"
QUALITY_EXISTS="unavailable"
COMPLEXITY_EXISTS="unavailable"
STRUCTURE_EXISTS="unavailable"
DOCUMENTATION_EXISTS="unavailable"
VISUAL_EXISTS="unavailable"
TRENDS_EXISTS="unavailable"

[ -f "build-reports/coverage/index.html" ] && COVERAGE_EXISTS="available"
[ -f "build-reports/security/index.html" ] && SECURITY_EXISTS="available"
[ -f "build-reports/performance/index.html" ] && PERFORMANCE_EXISTS="available"
[ -f "build-reports/unit-tests/index.html" ] && UNIT_TESTS_EXISTS="available"
[ -f "build-reports/api-tests/index.html" ] && API_TESTS_EXISTS="available"
[ -f "build-reports/quality/index.html" ] && QUALITY_EXISTS="available"
[ -f "build-reports/complexity/index.html" ] && COMPLEXITY_EXISTS="available"
[ -f "build-reports/structure/index.html" ] && STRUCTURE_EXISTS="available"
[ -f "build-reports/documentation/index.html" ] && DOCUMENTATION_EXISTS="available"
[ -f "build-reports/visual-regression/index.html" ] && VISUAL_EXISTS="available"
[ -f "build-reports/trends/index.html" ] && TRENDS_EXISTS="available"

# Metrics
COVERAGE_LINES="N/A"
if [ "$COVERAGE_EXISTS" == "available" ] && [ -f "build-reports/coverage/data.json" ]; then
  COVERAGE_LINES=$(jq -r '.total.lines.pct // empty' build-reports/coverage/data.json 2>/dev/null || echo "")
  if [ -z "$COVERAGE_LINES" ] || [ "$COVERAGE_LINES" == "null" ]; then
    COVERAGE_LINES="N/A"
  fi
fi

SECURITY_VULNS="N/A"
if [ "$SECURITY_EXISTS" == "available" ] && [ -f "build-reports/security/npm-audit.json" ]; then
  SECURITY_VULNS=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
fi

PERF_AVG="N/A"
if [ "$PERFORMANCE_EXISTS" == "available" ] && [ -f "build-reports/performance/data.json" ]; then
  PERF_AVG=$(jq -r '.summary.avg_response_time_ms' build-reports/performance/data.json 2>/dev/null || echo "0")
fi

UNIT_TESTS_PASSED="N/A"
UNIT_TESTS_TOTAL="N/A"
UNIT_TESTS_PASS_RATE="N/A"
if [ "$UNIT_TESTS_EXISTS" == "available" ] && [ -f "build-reports/unit-tests/data.json" ]; then
  UNIT_TESTS_PASSED=$(jq -r '.summary.passed_tests // 0' build-reports/unit-tests/data.json 2>/dev/null || echo "0")
  UNIT_TESTS_TOTAL=$(jq -r '.summary.total_tests // 0' build-reports/unit-tests/data.json 2>/dev/null || echo "0")
  
  # Validate that values are numeric before calculation
  if [[ "$UNIT_TESTS_PASSED" =~ ^[0-9]+$ ]] && [[ "$UNIT_TESTS_TOTAL" =~ ^[0-9]+$ ]]; then
    if [ "$UNIT_TESTS_TOTAL" != "0" ]; then
      UNIT_TESTS_PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($UNIT_TESTS_PASSED / $UNIT_TESTS_TOTAL) * 100}" 2>/dev/null || echo "0.0")
    else
      UNIT_TESTS_PASS_RATE="0.0"
    fi
  else
    UNIT_TESTS_PASSED="N/A"
    UNIT_TESTS_TOTAL="N/A"
    UNIT_TESTS_PASS_RATE="N/A"
  fi
fi

API_TESTS_PASSED="N/A"
API_TESTS_TOTAL="N/A"
API_TESTS_PASS_RATE="N/A"
if [ "$API_TESTS_EXISTS" == "available" ] && [ -f "build-reports/api-tests/data.json" ]; then
  API_TESTS_PASSED=$(jq -r '.summary.passed_suites // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
  API_TESTS_TOTAL=$(jq -r '.summary.total_suites // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
  
  # Validate that values are numeric before calculation
  if [[ "$API_TESTS_PASSED" =~ ^[0-9]+$ ]] && [[ "$API_TESTS_TOTAL" =~ ^[0-9]+$ ]]; then
    if [ "$API_TESTS_TOTAL" != "0" ]; then
      API_TESTS_PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($API_TESTS_PASSED / $API_TESTS_TOTAL) * 100}" 2>/dev/null || echo "0.0")
    else
      API_TESTS_PASS_RATE="0.0"
    fi
  else
    API_TESTS_PASSED="N/A"
    API_TESTS_TOTAL="N/A"
    API_TESTS_PASS_RATE="N/A"
  fi
fi

LINT_ERRORS="N/A"
LINT_WARNINGS="N/A"
if [ "$QUALITY_EXISTS" == "available" ] && [ -f "build-reports/quality/summary.json" ]; then
  LINT_ERRORS=$(jq -r '.errors // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
  LINT_WARNINGS=$(jq -r '.warnings // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
fi

# Determine status for each report (has-error, has-warning, or ok)
# Treat unavailable reports as having errors

# Coverage status
COVERAGE_STATUS="ok"
[ "$COVERAGE_EXISTS" == "unavailable" ] && COVERAGE_STATUS="has-error"

# Security status
SECURITY_STATUS="ok"
if [ "$SECURITY_EXISTS" == "unavailable" ]; then
  SECURITY_STATUS="has-error"
elif [ "$SECURITY_EXISTS" == "available" ] && [ -f "build-reports/security/npm-audit.json" ]; then
  VULN_TOTAL=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
  if [ "$VULN_TOTAL" != "0" ] && [ "$VULN_TOTAL" != "null" ]; then
    SECURITY_STATUS="has-warning"
  fi
fi

# Performance status
PERFORMANCE_STATUS="ok"
[ "$PERFORMANCE_EXISTS" == "unavailable" ] && PERFORMANCE_STATUS="has-error"

# Unit tests status
UNIT_TESTS_STATUS="ok"
if [ "$UNIT_TESTS_EXISTS" == "unavailable" ]; then
  UNIT_TESTS_STATUS="has-error"
elif [ "$UNIT_TESTS_EXISTS" == "available" ] && [ -f "build-reports/unit-tests/data.json" ]; then
  FAILED_TESTS=$(jq -r '.summary.failed_tests // 0' build-reports/unit-tests/data.json 2>/dev/null || echo "0")
  if [ "$FAILED_TESTS" != "0" ] && [ "$FAILED_TESTS" != "null" ] && [ "$FAILED_TESTS" != "N/A" ]; then
    UNIT_TESTS_STATUS="has-error"
  fi
fi

# API tests status
API_TESTS_STATUS="ok"
if [ "$API_TESTS_EXISTS" == "unavailable" ]; then
  API_TESTS_STATUS="has-error"
elif [ "$API_TESTS_EXISTS" == "available" ] && [ -f "build-reports/api-tests/data.json" ]; then
  FAILED_SUITES=$(jq -r '.summary.failed_suites // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
  if [ "$FAILED_SUITES" != "0" ] && [ "$FAILED_SUITES" != "null" ] && [ "$FAILED_SUITES" != "N/A" ]; then
    API_TESTS_STATUS="has-error"
  fi
fi

# Quality/Lint status
QUALITY_STATUS="ok"
if [ "$QUALITY_EXISTS" == "unavailable" ]; then
  QUALITY_STATUS="has-error"
elif [ "$QUALITY_EXISTS" == "available" ]; then
  if [ "$LINT_ERRORS" != "N/A" ] && [ "$LINT_ERRORS" != "0" ] && [ "$LINT_ERRORS" != "null" ]; then
    QUALITY_STATUS="has-error"
  elif [ "$LINT_WARNINGS" != "N/A" ] && [ "$LINT_WARNINGS" != "0" ] && [ "$LINT_WARNINGS" != "null" ]; then
    QUALITY_STATUS="has-warning"
  fi
fi

# Complexity status
COMPLEXITY_STATUS="ok"
if [ "$COMPLEXITY_EXISTS" == "unavailable" ]; then
  COMPLEXITY_STATUS="has-error"
elif [ "$COMPLEXITY_EXISTS" == "available" ] && [ "$COMPLEXITY_COUNT" != "N/A" ] && [ "$COMPLEXITY_COUNT" != "0" ] && [ "$COMPLEXITY_COUNT" != "null" ]; then
  COMPLEXITY_STATUS="has-warning"
fi

# Structure status
STRUCTURE_STATUS="ok"
if [ "$STRUCTURE_EXISTS" == "unavailable" ]; then
  STRUCTURE_STATUS="has-error"
elif [ "$STRUCTURE_EXISTS" == "available" ] && [ "$CIRCULAR_COUNT" != "N/A" ] && [ "$CIRCULAR_COUNT" != "0" ] && [ "$CIRCULAR_COUNT" != "null" ]; then
  STRUCTURE_STATUS="has-warning"
fi

# Documentation status
DOCUMENTATION_STATUS="ok"
[ "$DOCUMENTATION_EXISTS" == "unavailable" ] && DOCUMENTATION_STATUS="has-error"

# Visual regression status
VISUAL_STATUS="ok"
if [ "$VISUAL_EXISTS" == "unavailable" ]; then
  VISUAL_STATUS="has-error"
elif [ "$VISUAL_EXISTS" == "available" ] && [ "$VISUAL_CHANGED" != "N/A" ] && [ "$VISUAL_CHANGED" != "0" ] && [ "$VISUAL_CHANGED" != "null" ]; then
  VISUAL_STATUS="has-warning"
fi

# Trends status
TRENDS_STATUS="ok"
[ "$TRENDS_EXISTS" == "unavailable" ] && TRENDS_STATUS="has-error"

# Determine overall page status
PAGE_STATUS="ok"
if [[ "$COVERAGE_STATUS" == "has-error" || "$SECURITY_STATUS" == "has-error" || "$PERFORMANCE_STATUS" == "has-error" || \
      "$UNIT_TESTS_STATUS" == "has-error" || "$API_TESTS_STATUS" == "has-error" || "$QUALITY_STATUS" == "has-error" || \
      "$COMPLEXITY_STATUS" == "has-error" || "$STRUCTURE_STATUS" == "has-error" || "$DOCUMENTATION_STATUS" == "has-error" || \
      "$VISUAL_STATUS" == "has-error" || "$TRENDS_STATUS" == "has-error" ]]; then
  PAGE_STATUS="has-error"
elif [[ "$COVERAGE_STATUS" == "has-warning" || "$SECURITY_STATUS" == "has-warning" || "$PERFORMANCE_STATUS" == "has-warning" || \
        "$UNIT_TESTS_STATUS" == "has-warning" || "$API_TESTS_STATUS" == "has-warning" || "$QUALITY_STATUS" == "has-warning" || \
        "$COMPLEXITY_STATUS" == "has-warning" || "$STRUCTURE_STATUS" == "has-warning" || "$DOCUMENTATION_STATUS" == "has-warning" || \
        "$VISUAL_STATUS" == "has-warning" || "$TRENDS_STATUS" == "has-warning" ]]; then
  PAGE_STATUS="has-warning"
fi

COMPLEXITY_COUNT="N/A"
if [ "$COMPLEXITY_EXISTS" == "available" ] && [ -f "build-reports/complexity/summary.json" ]; then
  COMPLEXITY_COUNT=$(jq -r '.complexity_issues // 0' build-reports/complexity/summary.json 2>/dev/null || echo "0")
fi

CIRCULAR_COUNT="N/A"
if [ "$STRUCTURE_EXISTS" == "available" ] && [ -f "build-reports/structure/summary.json" ]; then
  CIRCULAR_COUNT=$(jq -r '.circular_dependencies // 0' build-reports/structure/summary.json 2>/dev/null || echo "0")
fi

DOC_COVERAGE="N/A"
if [ "$DOCUMENTATION_EXISTS" == "available" ] && [ -f "build-reports/documentation/data.json" ]; then
  DOC_COVERAGE=$(jq -r '.summary.coverage_pct // 0' build-reports/documentation/data.json 2>/dev/null || echo "0")
fi

VISUAL_CHANGED="N/A"
if [ "$VISUAL_EXISTS" == "available" ] && [ -f "build-reports/visual-regression/data.json" ]; then
  VISUAL_CHANGED=$(jq -r '.summary.changed_pages // 0' build-reports/visual-regression/data.json 2>/dev/null || echo "0")
fi

TRENDS_COUNT="N/A"
if [ "$TRENDS_EXISTS" == "available" ] && [ -f "build-reports/trends/data.json" ]; then
  TRENDS_COUNT=$(jq -r 'length' build-reports/trends/data.json 2>/dev/null || echo "0")
fi

# Metadata JSON
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
    },
    "unit_tests": {
      "available": $([ "$UNIT_TESTS_EXISTS" == "available" ] && echo "true" || echo "false"),
      "passed_tests": "$UNIT_TESTS_PASSED",
      "total_tests": "$UNIT_TESTS_TOTAL",
      "pass_rate": "$UNIT_TESTS_PASS_RATE"
    },
    "api_tests": {
      "available": $([ "$API_TESTS_EXISTS" == "available" ] && echo "true" || echo "false"),
      "passed_suites": "$API_TESTS_PASSED",
      "total_suites": "$API_TESTS_TOTAL",
      "pass_rate": "$API_TESTS_PASS_RATE"
    },
    "quality": {
      "available": $([ "$QUALITY_EXISTS" == "available" ] && echo "true" || echo "false"),
      "lint_errors": "$LINT_ERRORS",
      "lint_warnings": "$LINT_WARNINGS"
    },
    "complexity": {
      "available": $([ "$COMPLEXITY_EXISTS" == "available" ] && echo "true" || echo "false"),
      "issues": "$COMPLEXITY_COUNT"
    },
    "structure": {
      "available": $([ "$STRUCTURE_EXISTS" == "available" ] && echo "true" || echo "false"),
      "circular_dependencies": "$CIRCULAR_COUNT"
    },
    "documentation": {
      "available": $([ "$DOCUMENTATION_EXISTS" == "available" ] && echo "true" || echo "false"),
      "coverage_pct": "$DOC_COVERAGE"
    },
    "visual_regression": {
      "available": $([ "$VISUAL_EXISTS" == "available" ] && echo "true" || echo "false"),
      "changed_pages": "$VISUAL_CHANGED"
    },
    "trends": {
      "available": $([ "$TRENDS_EXISTS" == "available" ] && echo "true" || echo "false"),
      "data_points": "$TRENDS_COUNT"
    }
  }
}
EOF

sed -e "s|{{REPO_URL}}|${REPO_URL}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{TIMESTAMP}}|${TIMESTAMP}|g" \
    -e "s|{{BUILD_URL}}|${BUILD_URL}|g" \
    -e "s|{{COVERAGE_EXISTS}}|${COVERAGE_EXISTS}|g" \
    -e "s|{{SECURITY_EXISTS}}|${SECURITY_EXISTS}|g" \
    -e "s|{{PERFORMANCE_EXISTS}}|${PERFORMANCE_EXISTS}|g" \
    -e "s|{{UNIT_TESTS_EXISTS}}|${UNIT_TESTS_EXISTS}|g" \
    -e "s|{{API_TESTS_EXISTS}}|${API_TESTS_EXISTS}|g" \
    -e "s|{{QUALITY_EXISTS}}|${QUALITY_EXISTS}|g" \
    -e "s|{{COMPLEXITY_EXISTS}}|${COMPLEXITY_EXISTS}|g" \
    -e "s|{{STRUCTURE_EXISTS}}|${STRUCTURE_EXISTS}|g" \
    -e "s|{{DOCUMENTATION_EXISTS}}|${DOCUMENTATION_EXISTS}|g" \
    -e "s|{{VISUAL_EXISTS}}|${VISUAL_EXISTS}|g" \
    -e "s|{{TRENDS_EXISTS}}|${TRENDS_EXISTS}|g" \
    -e "s|{{COVERAGE_STATUS}}|${COVERAGE_STATUS}|g" \
    -e "s|{{SECURITY_STATUS}}|${SECURITY_STATUS}|g" \
    -e "s|{{PERFORMANCE_STATUS}}|${PERFORMANCE_STATUS}|g" \
    -e "s|{{UNIT_TESTS_STATUS}}|${UNIT_TESTS_STATUS}|g" \
    -e "s|{{API_TESTS_STATUS}}|${API_TESTS_STATUS}|g" \
    -e "s|{{QUALITY_STATUS}}|${QUALITY_STATUS}|g" \
    -e "s|{{COMPLEXITY_STATUS}}|${COMPLEXITY_STATUS}|g" \
    -e "s|{{STRUCTURE_STATUS}}|${STRUCTURE_STATUS}|g" \
    -e "s|{{DOCUMENTATION_STATUS}}|${DOCUMENTATION_STATUS}|g" \
    -e "s|{{VISUAL_STATUS}}|${VISUAL_STATUS}|g" \
    -e "s|{{TRENDS_STATUS}}|${TRENDS_STATUS}|g" \
    -e "s|{{PAGE_STATUS}}|${PAGE_STATUS}|g" \
    -e "s|{{COVERAGE_LINES}}|${COVERAGE_LINES}|g" \
    -e "s|{{SECURITY_VULNS}}|${SECURITY_VULNS}|g" \
    -e "s|{{PERF_AVG}}|${PERF_AVG}|g" \
    -e "s|{{UNIT_TESTS_PASSED}}|${UNIT_TESTS_PASSED}|g" \
    -e "s|{{UNIT_TESTS_TOTAL}}|${UNIT_TESTS_TOTAL}|g" \
    -e "s|{{UNIT_TESTS_PASS_RATE}}|${UNIT_TESTS_PASS_RATE}|g" \
    -e "s|{{API_TESTS_PASSED}}|${API_TESTS_PASSED}|g" \
    -e "s|{{API_TESTS_TOTAL}}|${API_TESTS_TOTAL}|g" \
    -e "s|{{API_TESTS_PASS_RATE}}|${API_TESTS_PASS_RATE}|g" \
    -e "s|{{LINT_ERRORS}}|${LINT_ERRORS}|g" \
    -e "s|{{LINT_WARNINGS}}|${LINT_WARNINGS}|g" \
    -e "s|{{COMPLEXITY_COUNT}}|${COMPLEXITY_COUNT}|g" \
    -e "s|{{CIRCULAR_COUNT}}|${CIRCULAR_COUNT}|g" \
    -e "s|{{DOC_COVERAGE}}|${DOC_COVERAGE}|g" \
    -e "s|{{VISUAL_CHANGED}}|${VISUAL_CHANGED}|g" \
    -e "s|{{TRENDS_COUNT}}|${TRENDS_COUNT}|g" \
    "$TEMPLATE" > "$OUTPUT"

echo "Main build report generated: $OUTPUT"
