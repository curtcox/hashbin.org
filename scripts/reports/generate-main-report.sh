#!/bin/bash
set -e

echo "Generating main build report..."

TEMPLATE="scripts/reports/templates/main-template.html"
OUTPUT="build-reports/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
BUILD_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
mkdir -p build-reports

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

# Generate GitHub Pages upload helper page
cat > build-reports/upload.html << 'UPLOAD_EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload to HashBin.org</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f6f8fa;
      color: #24292f;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 30px;
    }
    p {
      line-height: 1.5;
    }
    form {
      margin-top: 20px;
      display: grid;
      gap: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 600;
    }
    input,
    select,
    button {
      font: inherit;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #d0d7de;
    }
    input:focus,
    select:focus {
      outline: 2px solid #0969da;
      outline-offset: 1px;
    }
    button {
      background: #0969da;
      color: #ffffff;
      border: none;
      font-weight: 600;
      cursor: pointer;
    }
    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .muted {
      color: #57606a;
      font-size: 14px;
    }
    .status {
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #d0d7de;
      background: #f6f8fa;
      white-space: pre-wrap;
    }
    .status.error {
      background: #ffebe9;
      border-color: #ff8182;
    }
    .status.success {
      background: #dafbe1;
      border-color: #4ac26b;
    }
    .links {
      margin-top: 18px;
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .links a {
      color: #0969da;
      text-decoration: none;
      font-weight: 500;
    }
    .links a:hover {
      text-decoration: underline;
    }
    code {
      background: #f6f8fa;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Upload to HashBin.org</h1>
    <p class="muted">
      This helper page runs on GitHub Pages and uploads to <code>https://hashbin.org</code> using your API key.
      Your key is only used in your browser for this request.
    </p>

    <form id="upload-form">
      <label for="api-key">
        API key
        <input id="api-key" name="api-key" type="password" autocomplete="off" required placeholder="hb_live_...">
      </label>

      <label for="retention-months">
        Retention period
        <select id="retention-months" name="retention-months">
          <option value="1">1 month</option>
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
          <option value="60">60 months (5 years)</option>
          <option value="120">120 months (10 years)</option>
        </select>
      </label>

      <label for="content-file">
        File to upload
        <input id="content-file" name="content-file" type="file" required>
      </label>

      <button id="submit-button" type="submit">Upload to HashBin.org</button>
    </form>

    <div id="status" class="status" aria-live="polite">Choose a file and submit an upload.</div>

    <div class="links">
      <a href="index.html">Back to Build Report</a>
      <a href="https://hashbin.org/developers" target="_blank" rel="noopener noreferrer">HashBin Developer Page</a>
      <a href="https://hashbin.org/upload.html" target="_blank" rel="noopener noreferrer">HashBin Native Upload Page</a>
    </div>
  </div>

  <script>
    const API_BASE = 'https://hashbin.org';
    const form = document.getElementById('upload-form');
    const statusEl = document.getElementById('status');
    const submitButton = document.getElementById('submit-button');

    function setStatus(message, type) {
      statusEl.className = `status${type ? ` ${type}` : ''}`;
      statusEl.textContent = message;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const apiKey = document.getElementById('api-key').value.trim();
      const retentionMonths = document.getElementById('retention-months').value;
      const fileInput = document.getElementById('content-file');
      const file = fileInput.files && fileInput.files[0];

      if (!apiKey) {
        setStatus('An API key is required.', 'error');
        return;
      }

      if (!file) {
        setStatus('Choose a file to upload.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('content', file, file.name || 'upload.bin');
      formData.append('retention_months', retentionMonths);

      submitButton.disabled = true;
      setStatus(`Uploading ${file.name}...`, '');

      try {
        const response = await fetch(`${API_BASE}/api/content?retention_months=${encodeURIComponent(retentionMonths)}`, {
          method: 'POST',
          headers: {
            Authorization: `ApiKey ${apiKey}`
          },
          body: formData
        });

        const raw = await response.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          data = { message: raw };
        }

        if (!response.ok) {
          const message = data.message || data.error || `Upload failed (${response.status})`;
          throw new Error(message);
        }

        const cid = data.cid || '(unknown CID)';
        const expires = data.expires_at ? `\nExpires: ${new Date(data.expires_at).toISOString()}` : '';
        const cost = typeof data.cost_cents === 'number' ? `\nCost: $${(data.cost_cents / 100).toFixed(2)}` : '';

        setStatus(
          `Upload complete.\nCID: ${cid}${expires}${cost}\n\nView content: ${API_BASE}/${cid}\nInspect metadata: ${API_BASE}/info/${cid}`,
          'success'
        );
      } catch (error) {
        setStatus(`Upload failed: ${error.message}`, 'error');
      } finally {
        submitButton.disabled = false;
      }
    });
  </script>
</body>
</html>
UPLOAD_EOF

echo "GitHub Pages upload helper generated: build-reports/upload.html"
