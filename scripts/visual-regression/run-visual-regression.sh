#!/bin/bash
set -e

echo "Running visual regression tests..."

mkdir -p build-reports/visual-regression/screenshots/baseline

REPO_SLUG="${GITHUB_REPOSITORY}"
REPO_OWNER=$(echo "$REPO_SLUG" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO_SLUG" | cut -d'/' -f2)
BASE_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/visual-regression"
PREV_DATA=$(mktemp)

if curl -sf "${BASE_URL}/data.json" -o "$PREV_DATA"; then
  echo "Downloading previous baseline screenshots..."
  jq -r '.pages[]?.baseline' "$PREV_DATA" | while read -r baseline_path; do
    if [ -n "$baseline_path" ]; then
      filename=$(basename "$baseline_path")
      curl -sf "${BASE_URL}/${baseline_path}" -o "build-reports/visual-regression/screenshots/baseline/${filename}" || true
    fi
  done
fi

rm -f "$PREV_DATA"

node scripts/visual-regression/compare-screenshots.mjs

echo "Visual regression capture complete"
