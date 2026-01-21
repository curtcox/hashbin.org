#!/bin/bash
set -e

echo "Generating structural analysis report..."

STRUCTURE_JSON="build-reports/structure/data.json"
SUMMARY_JSON="build-reports/structure/summary.json"
TEMPLATE="scripts/reports/templates/structure-template.html"
OUTPUT="build-reports/structure/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

if [ ! -f "$STRUCTURE_JSON" ]; then
  echo '{"dependencies":{},"circular":[],"orphans":[]}' > "$STRUCTURE_JSON"
fi

CIRCULAR_COUNT=$(jq '.circular | length' "$STRUCTURE_JSON" 2>/dev/null || echo "0")
ORPHAN_COUNT=$(jq '.orphans | length' "$STRUCTURE_JSON" 2>/dev/null || echo "0")
NODE_COUNT=$(jq '.dependencies | keys | length' "$STRUCTURE_JSON" 2>/dev/null || echo "0")

if [ -f "$SUMMARY_JSON" ]; then
  CIRCULAR_COUNT=$(jq -r '.circular_dependencies // 0' "$SUMMARY_JSON" 2>/dev/null || echo "$CIRCULAR_COUNT")
  ORPHAN_COUNT=$(jq -r '.orphan_files // 0' "$SUMMARY_JSON" 2>/dev/null || echo "$ORPHAN_COUNT")
fi

CIRCULAR_TABLE=$(mktemp)
if [ "$(jq '.circular | length' "$STRUCTURE_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  jq -r '.circular[] | join(" -> ")' "$STRUCTURE_JSON" | while read -r chain; do
    echo "<tr><td>${chain}</td></tr>" >> "$CIRCULAR_TABLE"
  done
else
  echo "<tr><td>No circular dependencies detected</td></tr>" > "$CIRCULAR_TABLE"
fi

ORPHAN_TABLE=$(mktemp)
if [ "$(jq '.orphans | length' "$STRUCTURE_JSON" 2>/dev/null || echo 0)" -gt 0 ]; then
  jq -r '.orphans[]' "$STRUCTURE_JSON" | while read -r file; do
    FILE_LINK="${REPO_URL}/blob/${COMMIT_SHA}/${file}"
    echo "<tr><td><a href='${FILE_LINK}' target='_blank'>${file}</a></td></tr>" >> "$ORPHAN_TABLE"
  done
else
  echo "<tr><td>No orphan files detected</td></tr>" > "$ORPHAN_TABLE"
fi

CIRCULAR_TABLE_CONTENT=$(cat "$CIRCULAR_TABLE")
ORPHAN_TABLE_CONTENT=$(cat "$ORPHAN_TABLE")
rm -f "$CIRCULAR_TABLE" "$ORPHAN_TABLE"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s/\{\{CIRCULAR_COUNT\}\}/${CIRCULAR_COUNT}/g" "$OUTPUT"
perl -i -pe "s/\{\{ORPHAN_COUNT\}\}/${ORPHAN_COUNT}/g" "$OUTPUT"
perl -i -pe "s/\{\{NODE_COUNT\}\}/${NODE_COUNT}/g" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

awk -v circular_table="$CIRCULAR_TABLE_CONTENT" '{gsub(/\{\{CIRCULAR_TABLE\}\}/, circular_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"
awk -v orphan_table="$ORPHAN_TABLE_CONTENT" '{gsub(/\{\{ORPHAN_TABLE\}\}/, orphan_table)}1' "$OUTPUT" > "$OUTPUT.tmp" && mv "$OUTPUT.tmp" "$OUTPUT"

echo "Structural report generated: $OUTPUT"
