#!/bin/bash
set -e

echo "Generating visual regression report..."

VISUAL_JSON="build-reports/visual-regression/data.json"
TEMPLATE="scripts/reports/templates/visual-regression-template.html"
OUTPUT="build-reports/visual-regression/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

if [ ! -f "$VISUAL_JSON" ]; then
  echo '{"summary":{"total_pages":0,"changed_pages":0},"pages":[]}' > "$VISUAL_JSON"
fi

TOTAL_PAGES=$(jq -r '.summary.total_pages' "$VISUAL_JSON" 2>/dev/null || echo "0")
CHANGED_PAGES=$(jq -r '.summary.changed_pages' "$VISUAL_JSON" 2>/dev/null || echo "0")

TABLE_FILE=$(mktemp)
if [ "$(jq '.pages | length' "$VISUAL_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  jq -r '.pages[] | @base64' "$VISUAL_JSON" | while read -r row; do
    row_json=$(echo "$row" | base64 --decode)
    PAGE=$(echo "$row_json" | jq -r '.page')
    STATUS=$(echo "$row_json" | jq -r '.status')
    DIFF=$(echo "$row_json" | jq -r '.diff_pct')
    BASELINE=$(echo "$row_json" | jq -r '.baseline')
    CURRENT=$(echo "$row_json" | jq -r '.current')
    DIFF_IMG=$(echo "$row_json" | jq -r '.diff')

    echo "<tr>" >> "$TABLE_FILE"
    echo "<td>${PAGE}</td>" >> "$TABLE_FILE"
    echo "<td><span class='status-${STATUS}'>${STATUS}</span></td>" >> "$TABLE_FILE"
    echo "<td>${DIFF}%</td>" >> "$TABLE_FILE"
    echo "<td><a href='${BASELINE}' target='_blank'>Baseline</a> | <a href='${CURRENT}' target='_blank'>Current</a> | <a href='${DIFF_IMG}' target='_blank'>Diff</a></td>" >> "$TABLE_FILE"
    echo "</tr>" >> "$TABLE_FILE"
  done
else
  echo "<tr><td colspan='4'>No visual regression data available</td></tr>" > "$TABLE_FILE"
fi

TABLE_CONTENT=$(cat "$TABLE_FILE")
rm -f "$TABLE_FILE"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s/\{\{TOTAL_PAGES\}\}/${TOTAL_PAGES}/g" "$OUTPUT"
perl -i -pe "s/\{\{CHANGED_PAGES\}\}/${CHANGED_PAGES}/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

awk -v visual_table="$TABLE_CONTENT" '{gsub(/\{\{VISUAL_TABLE\}\}/, visual_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Visual regression report generated: $OUTPUT"
