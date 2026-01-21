#!/bin/bash
set -e

echo "Generating security report..."

NPM_AUDIT_JSON="build-reports/security/npm-audit.json"
ESLINT_JSON="build-reports/security/eslint-security.json"
TEMPLATE="scripts/reports/templates/security-template.html"
OUTPUT="build-reports/security/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

# Check if security data exists
if [ ! -f "$NPM_AUDIT_JSON" ]; then
  echo "Error: npm audit data not found at $NPM_AUDIT_JSON"
  exit 1
fi

# Parse npm audit results
NPM_VULNERABILITIES=$(jq -r '.metadata.vulnerabilities | to_entries | map("\(.key): \(.value)") | join(", ")' "$NPM_AUDIT_JSON" 2>/dev/null || echo "Unknown")
NPM_TOTAL=$(jq -r '.metadata.vulnerabilities | add' "$NPM_AUDIT_JSON" 2>/dev/null || echo "0")

# Parse ESLint results
if [ -f "$ESLINT_JSON" ]; then
  ESLINT_ERRORS=$(jq '[.[] | .errorCount] | add' "$ESLINT_JSON" 2>/dev/null || echo "0")
  ESLINT_WARNINGS=$(jq '[.[] | .warningCount] | add' "$ESLINT_JSON" 2>/dev/null || echo "0")
else
  ESLINT_ERRORS="0"
  ESLINT_WARNINGS="0"
fi

# Generate npm audit table (write to temp file to avoid sed issues)
NPM_TABLE_FILE=$(mktemp)
if [ -f "$NPM_AUDIT_JSON" ] && [ "$(jq '.vulnerabilities | length' "$NPM_AUDIT_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  for vuln_key in $(jq -r '.vulnerabilities | keys[]' "$NPM_AUDIT_JSON" 2>/dev/null | head -20); do
    NAME=$(jq -r ".vulnerabilities[\"$vuln_key\"].name" "$NPM_AUDIT_JSON" 2>/dev/null || echo "Unknown")
    SEVERITY=$(jq -r ".vulnerabilities[\"$vuln_key\"].severity" "$NPM_AUDIT_JSON" 2>/dev/null || echo "Unknown")
    VIA=$(jq -r ".vulnerabilities[\"$vuln_key\"].via | if type == \"array\" then .[0] else . end" "$NPM_AUDIT_JSON" 2>/dev/null || echo "Unknown")
    
    echo "<tr>" >> "$NPM_TABLE_FILE"
    echo "<td>${NAME}</td>" >> "$NPM_TABLE_FILE"
    echo "<td><span class='severity-${SEVERITY}'>${SEVERITY}</span></td>" >> "$NPM_TABLE_FILE"
    echo "<td>${VIA}</td>" >> "$NPM_TABLE_FILE"
    echo "</tr>" >> "$NPM_TABLE_FILE"
  done
else
  echo "<tr><td colspan='3'>No npm vulnerabilities detected</td></tr>" > "$NPM_TABLE_FILE"
fi

# Generate ESLint table (write to temp file to avoid sed issues)
ESLINT_TABLE_FILE=$(mktemp)
if [ -f "$ESLINT_JSON" ] && [ "$(jq '[.[] | select(.messages | length > 0)] | length' "$ESLINT_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  for file_idx in $(jq -r 'to_entries | .[] | select(.value.messages | length > 0) | .key' "$ESLINT_JSON" 2>/dev/null | head -50); do
    FILE_PATH=$(jq -r ".[$file_idx].filePath" "$ESLINT_JSON" 2>/dev/null || echo "Unknown")
    # Remove leading path to make it relative
    FILE_PATH_REL=$(echo "$FILE_PATH" | sed 's|.*/hashbin.org/||' || echo "$FILE_PATH")
    
    for msg_idx in $(jq -r ".[$file_idx].messages | to_entries | .[] | .key" "$ESLINT_JSON" 2>/dev/null | head -5); do
      RULE=$(jq -r ".[$file_idx].messages[$msg_idx].ruleId" "$ESLINT_JSON" 2>/dev/null || echo "Unknown")
      MESSAGE=$(jq -r ".[$file_idx].messages[$msg_idx].message" "$ESLINT_JSON" 2>/dev/null | sed 's/"/\\"/g' || echo "Unknown")
      LINE=$(jq -r ".[$file_idx].messages[$msg_idx].line" "$ESLINT_JSON" 2>/dev/null || echo "0")
      SEVERITY_NUM=$(jq -r ".[$file_idx].messages[$msg_idx].severity" "$ESLINT_JSON" 2>/dev/null || echo "1")
      
      if [ "$SEVERITY_NUM" == "2" ]; then
        SEVERITY="error"
      else
        SEVERITY="warning"
      fi
      
      FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${FILE_PATH_REL}#L${LINE}"
      
      echo "<tr>" >> "$ESLINT_TABLE_FILE"
      echo "<td><a href='${FILE_LINK}' target='_blank'>${FILE_PATH_REL}:${LINE}</a></td>" >> "$ESLINT_TABLE_FILE"
      echo "<td><span class='severity-${SEVERITY}'>${SEVERITY}</span></td>" >> "$ESLINT_TABLE_FILE"
      echo "<td>${RULE}</td>" >> "$ESLINT_TABLE_FILE"
      echo "<td>${MESSAGE}</td>" >> "$ESLINT_TABLE_FILE"
      echo "</tr>" >> "$ESLINT_TABLE_FILE"
    done
  done
else
  echo "<tr><td colspan='4'>No ESLint security issues detected</td></tr>" > "$ESLINT_TABLE_FILE"
fi

# Check thresholds (warnings only)
if [ "$NPM_TOTAL" -gt 0 ]; then
  echo "⚠️  Warning: $NPM_TOTAL npm vulnerabilities detected"
fi

if [ "$ESLINT_ERRORS" -gt 0 ]; then
  echo "⚠️  Warning: $ESLINT_ERRORS ESLint security errors detected"
fi

# Read table content from files
NPM_TABLE=$(cat "$NPM_TABLE_FILE")
ESLINT_TABLE=$(cat "$ESLINT_TABLE_FILE")

# Clean up temp files
rm -f "$NPM_TABLE_FILE" "$ESLINT_TABLE_FILE"

# Copy template and replace values using a more robust approach
cp "$TEMPLATE" "$OUTPUT"
# Use perl for more robust replacement
perl -i -pe "s/\{\{NPM_VULNERABILITIES\}\}/$NPM_VULNERABILITIES/g" "$OUTPUT"
perl -i -pe "s/\{\{NPM_TOTAL\}\}/$NPM_TOTAL/g" "$OUTPUT"
perl -i -pe "s/\{\{ESLINT_ERRORS\}\}/$ESLINT_ERRORS/g" "$OUTPUT"
perl -i -pe "s/\{\{ESLINT_WARNINGS\}\}/$ESLINT_WARNINGS/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

# Replace table placeholders with file content using awk (more reliable than sed for large content)
awk -v npm_table="$NPM_TABLE" '{gsub(/\{\{NPM_TABLE\}\}/, npm_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"
awk -v eslint_table="$ESLINT_TABLE" '{gsub(/\{\{ESLINT_TABLE\}\}/, eslint_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Security report generated: $OUTPUT"
echo "Vulnerabilities - npm: $NPM_TOTAL, ESLint errors: $ESLINT_ERRORS, ESLint warnings: $ESLINT_WARNINGS"
