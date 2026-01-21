#!/bin/bash
set -e

echo "Generating lint report..."

ESLINT_JSON="build-reports/quality/data.json"
SUMMARY_JSON="build-reports/quality/summary.json"
TEMPLATE="scripts/reports/templates/quality-template.html"
OUTPUT="build-reports/quality/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

if [ ! -f "$ESLINT_JSON" ]; then
  echo "[]" > "$ESLINT_JSON"
fi

ERRORS=$(jq -r '[.[] | .errorCount] | add' "$ESLINT_JSON" 2>/dev/null || echo "0")
WARNINGS=$(jq -r '[.[] | .warningCount] | add' "$ESLINT_JSON" 2>/dev/null || echo "0")

if [ -f "$SUMMARY_JSON" ]; then
  ERRORS=$(jq -r '.errors // 0' "$SUMMARY_JSON" 2>/dev/null || echo "$ERRORS")
  WARNINGS=$(jq -r '.warnings // 0' "$SUMMARY_JSON" 2>/dev/null || echo "$WARNINGS")
fi

TABLE_FILE=$(mktemp)
if [ "$(jq '[.[] | select(.messages | length > 0)] | length' "$ESLINT_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  for file_idx in $(jq -r 'to_entries | .[] | select(.value.messages | length > 0) | .key' "$ESLINT_JSON" 2>/dev/null | head -50); do
    FILE_PATH=$(jq -r ".[${file_idx}].filePath" "$ESLINT_JSON" 2>/dev/null || echo "Unknown")
    FILE_PATH_REL=$(echo "$FILE_PATH" | sed 's|.*/hashbin.org/||' || echo "$FILE_PATH")

    for msg_idx in $(jq -r ".[${file_idx}].messages | to_entries | .[] | .key" "$ESLINT_JSON" 2>/dev/null | head -10); do
      RULE=$(jq -r ".[${file_idx}].messages[${msg_idx}].ruleId" "$ESLINT_JSON" 2>/dev/null || echo "Unknown")
      MESSAGE=$(jq -r ".[${file_idx}].messages[${msg_idx}].message" "$ESLINT_JSON" 2>/dev/null | sed 's/"/\\"/g' || echo "Unknown")
      LINE=$(jq -r ".[${file_idx}].messages[${msg_idx}].line" "$ESLINT_JSON" 2>/dev/null || echo "0")
      SEVERITY_NUM=$(jq -r ".[${file_idx}].messages[${msg_idx}].severity" "$ESLINT_JSON" 2>/dev/null || echo "1")

      if [ "$SEVERITY_NUM" == "2" ]; then
        SEVERITY="error"
      else
        SEVERITY="warning"
      fi

      FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${FILE_PATH_REL}#L${LINE}"

      echo "<tr>" >> "$TABLE_FILE"
      echo "<td><a href='${FILE_LINK}' target='_blank'>${FILE_PATH_REL}:${LINE}</a></td>" >> "$TABLE_FILE"
      echo "<td><span class='severity-${SEVERITY}'>${SEVERITY}</span></td>" >> "$TABLE_FILE"
      echo "<td>${RULE}</td>" >> "$TABLE_FILE"
      echo "<td>${MESSAGE}</td>" >> "$TABLE_FILE"
      echo "</tr>" >> "$TABLE_FILE"
    done
  done
else
  echo "<tr><td colspan='4'>No lint issues detected</td></tr>" > "$TABLE_FILE"
fi

TABLE_CONTENT=$(cat "$TABLE_FILE")
rm -f "$TABLE_FILE"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s/\{\{LINT_ERRORS\}\}/${ERRORS}/g" "$OUTPUT"
perl -i -pe "s/\{\{LINT_WARNINGS\}\}/${WARNINGS}/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

awk -v lint_table="$TABLE_CONTENT" '{gsub(/\{\{LINT_TABLE\}\}/, lint_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Lint report generated: $OUTPUT"
