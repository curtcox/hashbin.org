#!/bin/bash
set -e

echo "Generating documentation report..."

DOC_JSON="build-reports/documentation/data.json"
TEMPLATE="scripts/reports/templates/documentation-template.html"
OUTPUT="build-reports/documentation/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

if [ ! -f "$DOC_JSON" ]; then
  echo '{"summary":{"total_functions":0,"documented_functions":0,"coverage_pct":0},"undocumented":[]}' > "$DOC_JSON"
fi

TOTAL_FUNCTIONS=$(jq -r '.summary.total_functions' "$DOC_JSON" 2>/dev/null || echo "0")
DOCUMENTED=$(jq -r '.summary.documented_functions' "$DOC_JSON" 2>/dev/null || echo "0")
COVERAGE=$(jq -r '.summary.coverage_pct' "$DOC_JSON" 2>/dev/null || echo "0")

TABLE_FILE=$(mktemp)
if [ "$(jq '.undocumented | length' "$DOC_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  jq -r '.undocumented[] | @base64' "$DOC_JSON" | while read -r row; do
    row_json=$(echo "$row" | base64 --decode)
    FILE=$(echo "$row_json" | jq -r '.file')
    LINE=$(echo "$row_json" | jq -r '.line')
    NAME=$(echo "$row_json" | jq -r '.name')
    FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${FILE}#L${LINE}"
    echo "<tr>" >> "$TABLE_FILE"
    echo "<td><a href='${FILE_LINK}' target='_blank'>${FILE}:${LINE}</a></td>" >> "$TABLE_FILE"
    echo "<td>${NAME}</td>" >> "$TABLE_FILE"
    echo "</tr>" >> "$TABLE_FILE"
  done
else
  echo "<tr><td colspan='2'>All functions documented</td></tr>" > "$TABLE_FILE"
fi

TABLE_CONTENT=$(cat "$TABLE_FILE")
rm -f "$TABLE_FILE"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s/\{\{TOTAL_FUNCTIONS\}\}/${TOTAL_FUNCTIONS}/g" "$OUTPUT"
perl -i -pe "s/\{\{DOCUMENTED_FUNCTIONS\}\}/${DOCUMENTED}/g" "$OUTPUT"
perl -i -pe "s/\{\{COVERAGE_PCT\}\}/${COVERAGE}/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

awk -v doc_table="$TABLE_CONTENT" '{gsub(/\{\{DOC_TABLE\}\}/, doc_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Documentation report generated: $OUTPUT"
