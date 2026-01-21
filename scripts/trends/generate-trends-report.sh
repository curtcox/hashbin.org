#!/bin/bash
set -e

echo "Generating trends report..."

TEMPLATE="scripts/reports/templates/trends-template.html"
OUTPUT="build-reports/trends/index.html"
REPO_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}"
COMMIT_SHA="${GITHUB_SHA}"

cp "$TEMPLATE" "$OUTPUT"
perl -i -pe "s|\{\{REPO_URL\}\}|$REPO_URL|g" "$OUTPUT"
perl -i -pe "s/\{\{COMMIT_SHA\}\}/$COMMIT_SHA/g" "$OUTPUT"

echo "Trends report generated: $OUTPUT"
