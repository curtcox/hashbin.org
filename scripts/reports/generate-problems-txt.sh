#!/bin/bash
set -e

echo "Generating problems.txt..."

OUTPUT="build-reports/problems.txt"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Initialize problems.txt with header
cat > "$OUTPUT" << EOF
================================================================================
                    BUILD REPORT - PROBLEMS AND WARNINGS
================================================================================

Repository: ${GITHUB_REPOSITORY}
Commit SHA: ${COMMIT_SHA}
Generated:  ${TIMESTAMP}
Report URL: ${REPO_URL}/actions/runs/${GITHUB_RUN_ID}

This file contains all errors and warnings from the build report analysis.

================================================================================

EOF

# Track if we found any problems
HAS_PROBLEMS=0

# ==============================================================================
# QUALITY (Lint Errors and Warnings)
# ==============================================================================

if [ -f "build-reports/quality/summary.json" ]; then
  LINT_ERRORS=$(jq -r '.errors // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
  LINT_WARNINGS=$(jq -r '.warnings // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
  
  if [ "$LINT_ERRORS" != "0" ] || [ "$LINT_WARNINGS" != "0" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
CODE QUALITY ISSUES
===============================================================================

Summary: ${LINT_ERRORS} error(s), ${LINT_WARNINGS} warning(s)
Report:  See build-reports/quality/index.html for details

EOF
    HAS_PROBLEMS=1
    
    # Extract detailed lint issues if available
    if [ -f "build-reports/quality/data.json" ]; then
      echo "Details:" >> "$OUTPUT"
      echo "" >> "$OUTPUT"
      
      # Process each file with issues (limit to first 100 issues)
      jq -r '.[] | select(.messages | length > 0) | .filePath as $file | .messages[] | 
        "\($file):\(.line):\(.column) [\(.severity | if . == 2 then "error" else "warning" end)] \(.ruleId // "unknown"): \(.message)"' \
        build-reports/quality/data.json 2>/dev/null | head -100 >> "$OUTPUT" || true
      
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# SECURITY VULNERABILITIES
# ==============================================================================

if [ -f "build-reports/security/npm-audit.json" ]; then
  VULN_TOTAL=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
  
  if [ "$VULN_TOTAL" != "0" ] && [ "$VULN_TOTAL" != "null" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
SECURITY VULNERABILITIES
===============================================================================

Summary: ${VULN_TOTAL} total vulnerabilities found
Report:  See build-reports/security/index.html for details

EOF
    HAS_PROBLEMS=1
    
    # Get vulnerability breakdown
    CRITICAL=$(jq -r '.metadata.vulnerabilities.critical // 0' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
    HIGH=$(jq -r '.metadata.vulnerabilities.high // 0' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
    MODERATE=$(jq -r '.metadata.vulnerabilities.moderate // 0' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
    LOW=$(jq -r '.metadata.vulnerabilities.low // 0' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
    
    cat >> "$OUTPUT" << EOF
Breakdown:
  Critical: ${CRITICAL}
  High:     ${HIGH}
  Moderate: ${MODERATE}
  Low:      ${LOW}

EOF
    
    # List affected packages (limit to first 20)
    if [ "$(jq -r '.vulnerabilities | length' build-reports/security/npm-audit.json 2>/dev/null || echo "0")" -gt 0 ]; then
      echo "Affected packages:" >> "$OUTPUT"
      jq -r '.vulnerabilities | to_entries | .[] | 
        "  - \(.key) (\(.value.severity)): \(.value.via[0].title // .value.via[0] // "No description")"' \
        build-reports/security/npm-audit.json 2>/dev/null | head -20 >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# UNIT TEST FAILURES
# ==============================================================================

if [ -f "build-reports/unit-tests/data.json" ]; then
  FAILED_TESTS=$(jq -r '.summary.failed_tests // 0' build-reports/unit-tests/data.json 2>/dev/null || echo "0")
  
  if [ "$FAILED_TESTS" != "0" ] && [ "$FAILED_TESTS" != "null" ]; then
    TOTAL_TESTS=$(jq -r '.summary.total_tests // 0' build-reports/unit-tests/data.json 2>/dev/null || echo "0")
    
    cat >> "$OUTPUT" << EOF
===============================================================================
UNIT TEST FAILURES
===============================================================================

Summary: ${FAILED_TESTS} failed out of ${TOTAL_TESTS} tests
Report:  See build-reports/unit-tests/index.html for details

EOF
    HAS_PROBLEMS=1
    
    # List failed tests with details
    echo "Failed tests:" >> "$OUTPUT"
    jq -r '.tests[] | select(.status == "failed") | 
      "\n  Test: \(.name)\n  Script: \(.script)\n  Duration: \(.duration)\n  Output (first 500 chars):\n\(.output | .[0:500])\n"' \
      build-reports/unit-tests/data.json 2>/dev/null >> "$OUTPUT" || true
    echo "" >> "$OUTPUT"
  fi
fi

# ==============================================================================
# API TEST FAILURES
# ==============================================================================

if [ -f "build-reports/api-tests/data.json" ]; then
  FAILED_SUITES=$(jq -r '.summary.failed_suites // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
  FAILED_TESTS=$(jq -r '.summary.failed_tests // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
  
  if [ "$FAILED_SUITES" != "0" ] && [ "$FAILED_SUITES" != "null" ] || [ "$FAILED_TESTS" != "0" ] && [ "$FAILED_TESTS" != "null" ]; then
    TOTAL_SUITES=$(jq -r '.summary.total_suites // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
    TOTAL_TESTS=$(jq -r '.summary.total_tests // 0' build-reports/api-tests/data.json 2>/dev/null || echo "0")
    
    cat >> "$OUTPUT" << EOF
===============================================================================
API TEST FAILURES
===============================================================================

Summary: ${FAILED_SUITES} failed suite(s) out of ${TOTAL_SUITES}, ${FAILED_TESTS} failed test(s) out of ${TOTAL_TESTS}
Report:  See build-reports/api-tests/index.html for details

EOF
    HAS_PROBLEMS=1
    
    # List failed suites
    echo "Failed test suites:" >> "$OUTPUT"
    jq -r '.suites[] | select(.status == "fail") | 
      "  - \(.name): \(.failed) failed out of \(.total) tests"' \
      build-reports/api-tests/data.json 2>/dev/null >> "$OUTPUT" || true
    echo "" >> "$OUTPUT"
  fi
fi

# ==============================================================================
# COMPLEXITY WARNINGS
# ==============================================================================

if [ -f "build-reports/complexity/summary.json" ]; then
  COMPLEXITY_COUNT=$(jq -r '.complexity_issues // 0' build-reports/complexity/summary.json 2>/dev/null || echo "0")
  
  if [ "$COMPLEXITY_COUNT" != "0" ] && [ "$COMPLEXITY_COUNT" != "null" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
COMPLEXITY WARNINGS
===============================================================================

Summary: ${COMPLEXITY_COUNT} complexity issue(s) found
Report:  See build-reports/complexity/index.html for details

EOF
    HAS_PROBLEMS=1
    
    # List complexity issues (limit to first 50)
    if [ -f "build-reports/complexity/data.json" ]; then
      echo "High complexity functions:" >> "$OUTPUT"
      jq -r '.[] | .filePath as $file | .messages[] | 
        select(.ruleId == "complexity" or .ruleId == "sonarjs/cognitive-complexity") |
        "  \($file):\(.line) - \(.message)"' \
        build-reports/complexity/data.json 2>/dev/null | head -50 >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# STRUCTURAL ISSUES
# ==============================================================================

if [ -f "build-reports/structure/summary.json" ]; then
  CIRCULAR_COUNT=$(jq -r '.circular_dependencies // 0' build-reports/structure/summary.json 2>/dev/null || echo "0")
  ORPHAN_COUNT=$(jq -r '.orphan_files // 0' build-reports/structure/summary.json 2>/dev/null || echo "0")
  
  if [ "$CIRCULAR_COUNT" != "0" ] && [ "$CIRCULAR_COUNT" != "null" ] || [ "$ORPHAN_COUNT" != "0" ] && [ "$ORPHAN_COUNT" != "null" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
STRUCTURAL ISSUES
===============================================================================

Summary: ${CIRCULAR_COUNT} circular dependencies, ${ORPHAN_COUNT} orphan file(s)
Report:  See build-reports/structure/index.html for details

EOF
    HAS_PROBLEMS=1
    
    if [ "$CIRCULAR_COUNT" != "0" ] && [ "$CIRCULAR_COUNT" != "null" ] && [ -f "build-reports/structure/data.json" ]; then
      echo "Circular dependencies:" >> "$OUTPUT"
      jq -r '.circular[] | "  - " + (. | join(" -> "))' \
        build-reports/structure/data.json 2>/dev/null >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
    
    if [ "$ORPHAN_COUNT" != "0" ] && [ "$ORPHAN_COUNT" != "null" ] && [ -f "build-reports/structure/data.json" ]; then
      echo "Orphan files:" >> "$OUTPUT"
      jq -r '.orphans[] | "  - \(.)"' \
        build-reports/structure/data.json 2>/dev/null >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# DOCUMENTATION WARNINGS
# ==============================================================================

if [ -f "build-reports/documentation/data.json" ]; then
  DOC_COVERAGE=$(jq -r '.summary.coverage_pct // 100' build-reports/documentation/data.json 2>/dev/null || echo "100")
  UNDOCUMENTED=$(jq -r '.summary.undocumented // 0' build-reports/documentation/data.json 2>/dev/null || echo "0")
  
  # Warn if coverage is below 80% or there are undocumented items
  if [ "$(echo "$DOC_COVERAGE 80" | awk '$1 < $2 {print 1}')" == "1" ] || [ "$UNDOCUMENTED" != "0" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
DOCUMENTATION WARNINGS
===============================================================================

Summary: ${DOC_COVERAGE}% documentation coverage, ${UNDOCUMENTED} undocumented item(s)
Report:  See build-reports/documentation/index.html for details

EOF
    HAS_PROBLEMS=1
    
    if [ "$UNDOCUMENTED" != "0" ] && [ -f "build-reports/documentation/data.json" ]; then
      echo "Undocumented items (first 20):" >> "$OUTPUT"
      jq -r '.undocumented[] | "  - \(.file):\(.line) - \(.name) (\(.type))"' \
        build-reports/documentation/data.json 2>/dev/null | head -20 >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# VISUAL REGRESSION WARNINGS
# ==============================================================================

if [ -f "build-reports/visual-regression/data.json" ]; then
  VISUAL_CHANGED=$(jq -r '.summary.changed_pages // 0' build-reports/visual-regression/data.json 2>/dev/null || echo "0")
  
  if [ "$VISUAL_CHANGED" != "0" ] && [ "$VISUAL_CHANGED" != "null" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
VISUAL REGRESSION WARNINGS
===============================================================================

Summary: ${VISUAL_CHANGED} page(s) with visual changes detected
Report:  See build-reports/visual-regression/index.html for details

EOF
    HAS_PROBLEMS=1
    
    if [ -f "build-reports/visual-regression/data.json" ]; then
      echo "Changed pages:" >> "$OUTPUT"
      jq -r '.changes[] | "  - \(.page): \(.diff_percentage)% difference"' \
        build-reports/visual-regression/data.json 2>/dev/null >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# PERFORMANCE WARNINGS
# ==============================================================================

if [ -f "build-reports/performance/data.json" ]; then
  PERF_AVG=$(jq -r '.summary.avg_response_time_ms // 0' build-reports/performance/data.json 2>/dev/null || echo "0")
  
  # Warn if average response time is above 1000ms
  if [ "$(echo "$PERF_AVG 1000" | awk '$1 > $2 {print 1}')" == "1" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
PERFORMANCE WARNINGS
===============================================================================

Summary: Average response time ${PERF_AVG}ms exceeds target of 1000ms
Report:  See build-reports/performance/index.html for details

EOF
    HAS_PROBLEMS=1
    
    if [ -f "build-reports/performance/data.json" ]; then
      echo "Slow endpoints:" >> "$OUTPUT"
      jq -r '.endpoints[] | select(.avg_time_ms > 1000) | 
        "  - \(.name): \(.avg_time_ms)ms average"' \
        build-reports/performance/data.json 2>/dev/null >> "$OUTPUT" || true
      echo "" >> "$OUTPUT"
    fi
  fi
fi

# ==============================================================================
# COVERAGE WARNINGS
# ==============================================================================

if [ -f "build-reports/coverage/data.json" ]; then
  COVERAGE_LINES=$(jq -r '.total.lines.pct // 100' build-reports/coverage/data.json 2>/dev/null || echo "100")
  
  # Warn if line coverage is below 80%
  if [ "$(echo "$COVERAGE_LINES 80" | awk '$1 < $2 {print 1}')" == "1" ]; then
    cat >> "$OUTPUT" << EOF
===============================================================================
COVERAGE WARNINGS
===============================================================================

Summary: Line coverage ${COVERAGE_LINES}% is below target of 80%
Report:  See build-reports/coverage/index.html for details

EOF
    HAS_PROBLEMS=1
  fi
fi

# ==============================================================================
# SUMMARY
# ==============================================================================

if [ "$HAS_PROBLEMS" == "0" ]; then
  cat >> "$OUTPUT" << EOF
===============================================================================
NO PROBLEMS FOUND
===============================================================================

All checks passed successfully! ✅

EOF
fi

cat >> "$OUTPUT" << EOF
===============================================================================
                              END OF REPORT
===============================================================================

For detailed information about any issue, please refer to the respective
HTML report in the build-reports directory.

Main report: ${REPO_URL}/blob/gh-pages/index.html
EOF

echo "problems.txt generated: $OUTPUT"
