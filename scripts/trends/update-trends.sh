#!/bin/bash
set -e

echo "Updating trends data..."

mkdir -p build-reports/trends

REPO_SLUG="${GITHUB_REPOSITORY}"
REPO_OWNER=$(echo "$REPO_SLUG" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO_SLUG" | cut -d'/' -f2)
PAGES_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/trends/data.json"

TEMP_TRENDS=$(mktemp)
if curl -sf "$PAGES_URL" -o "$TEMP_TRENDS"; then
  echo "Loaded existing trends data from ${PAGES_URL}"
else
  echo "[]" > "$TEMP_TRENDS"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_SHA="${GITHUB_SHA:-unknown}"

COVERAGE_LINES=$(jq -r '.total.lines.pct // empty' build-reports/coverage/data.json 2>/dev/null || echo "")
SECURITY_VULNS=$(jq -r '.metadata.vulnerabilities | add' build-reports/security/npm-audit.json 2>/dev/null || echo "0")
PERF_AVG=$(jq -r '.summary.avg_response_time_ms' build-reports/performance/data.json 2>/dev/null || echo "0")
LINT_ERRORS=$(jq -r '.errors // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
LINT_WARNINGS=$(jq -r '.warnings // 0' build-reports/quality/summary.json 2>/dev/null || echo "0")
COMPLEXITY_ISSUES=$(jq -r '.complexity_issues // 0' build-reports/complexity/summary.json 2>/dev/null || echo "0")
CIRCULAR_COUNT=$(jq -r '.circular_dependencies // 0' build-reports/structure/summary.json 2>/dev/null || echo "0")
DOC_COVERAGE=$(jq -r '.summary.coverage_pct // 0' build-reports/documentation/data.json 2>/dev/null || echo "0")
VISUAL_CHANGES=$(jq -r '.summary.changed_pages // 0' build-reports/visual-regression/data.json 2>/dev/null || echo "0")

NEW_ENTRY=$(jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg commit "$COMMIT_SHA" \
  --arg coverage "$COVERAGE_LINES" \
  --argjson security "$SECURITY_VULNS" \
  --argjson perf "$PERF_AVG" \
  --argjson lint_errors "$LINT_ERRORS" \
  --argjson lint_warnings "$LINT_WARNINGS" \
  --argjson complexity "$COMPLEXITY_ISSUES" \
  --argjson circular "$CIRCULAR_COUNT" \
  --argjson doc_coverage "$DOC_COVERAGE" \
  --argjson visual_changes "$VISUAL_CHANGES" \
  '{timestamp: $timestamp, commit: $commit, coverage_lines: $coverage, security_vulnerabilities: $security, perf_avg_ms: $perf, lint_errors: $lint_errors, lint_warnings: $lint_warnings, complexity_issues: $complexity, circular_dependencies: $circular, doc_coverage_pct: $doc_coverage, visual_changes: $visual_changes}')

UPDATED=$(jq --argjson entry "$NEW_ENTRY" '. + [$entry] | if length > 30 then .[-30:] else . end' "$TEMP_TRENDS")

echo "$UPDATED" > build-reports/trends/data.json
rm -f "$TEMP_TRENDS"

echo "Trends data updated"
