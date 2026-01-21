#!/bin/bash
set -e

echo "Generating complexity report..."

COMPLEXITY_JSON="build-reports/complexity/data.json"
SUMMARY_JSON="build-reports/complexity/summary.json"
TEMPLATE="scripts/reports/templates/complexity-template.html"
OUTPUT="build-reports/complexity/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

if [ ! -f "$COMPLEXITY_JSON" ]; then
  echo "[]" > "$COMPLEXITY_JSON"
fi

COMPLEXITY_COUNT=$(jq '[.[] | .messages[] | select(.ruleId == "complexity")] | length' "$COMPLEXITY_JSON" 2>/dev/null || echo "0")

if [ -f "$SUMMARY_JSON" ]; then
  COMPLEXITY_COUNT=$(jq -r '.complexity_issues // 0' "$SUMMARY_JSON" 2>/dev/null || echo "$COMPLEXITY_COUNT")
fi

TABLE_FILE=$(mktemp)
if [ "$(jq '[.[] | .messages[] | select(.ruleId == "complexity")] | length' "$COMPLEXITY_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  jq -r '.[] | {filePath, messages: [.messages[] | select(.ruleId == "complexity")]} | select(.messages | length > 0) | @base64' "$COMPLEXITY_JSON" | while read -r row; do
    row_json=$(echo "$row" | base64 --decode)
    FILE_PATH=$(echo "$row_json" | jq -r '.filePath')
    FILE_PATH_REL=$(echo "$FILE_PATH" | sed 's|.*/hashbin.org/||')

    echo "$row_json" | jq -r '.messages[] | @base64' | while read -r msg; do
      msg_json=$(echo "$msg" | base64 --decode)
      RULE=$(echo "$msg_json" | jq -r '.ruleId')
      MESSAGE=$(echo "$msg_json" | jq -r '.message' | sed 's/"/\\"/g')
      LINE=$(echo "$msg_json" | jq -r '.line')
      FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${FILE_PATH_REL}#L${LINE}"

      echo "<tr>" >> "$TABLE_FILE"
      echo "<td><a href='${FILE_LINK}' target='_blank'>${FILE_PATH_REL}:${LINE}</a></td>" >> "$TABLE_FILE"
      echo "<td>${RULE}</td>" >> "$TABLE_FILE"
      echo "<td>${MESSAGE}</td>" >> "$TABLE_FILE"
      echo "</tr>" >> "$TABLE_FILE"
    done
  done
else
  echo "<tr><td colspan='3'>No complexity warnings detected</td></tr>" > "$TABLE_FILE"
fi

TABLE_CONTENT=$(cat "$TABLE_FILE")
rm -f "$TABLE_FILE"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s/\{\{COMPLEXITY_COUNT\}\}/${COMPLEXITY_COUNT}/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

awk -v complexity_table="$TABLE_CONTENT" '{gsub(/\{\{COMPLEXITY_TABLE\}\}/, complexity_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Complexity report generated: $OUTPUT"
