#!/bin/bash
# Script to inject git SHA into HTML files as comments

set -e

# Get git SHA
GIT_SHA="${1:-$(git rev-parse HEAD)}"

if [ -z "$GIT_SHA" ]; then
  echo "Error: Could not determine git SHA"
  exit 1
fi

echo "Injecting git SHA: $GIT_SHA into HTML files..."

# Find all HTML files in the frontend directory
HTML_FILES=$(find frontend -name "*.html" -type f)

if [ -z "$HTML_FILES" ]; then
  echo "No HTML files found in frontend directory"
  exit 0
fi

# Inject SHA comment into each HTML file (after <!DOCTYPE html> or at the beginning)
for file in $HTML_FILES; do
  echo "Processing: $file"
  
  # Check if SHA comment already exists
  if grep -q "<!-- git-sha:" "$file"; then
    # Update existing comment
    sed -i "s/<!-- git-sha:[^>]* -->/<!-- git-sha: $GIT_SHA -->/" "$file"
  else
    # Insert after DOCTYPE if it exists, otherwise at the beginning
    if grep -q "<!DOCTYPE" "$file"; then
      sed -i "/<\!DOCTYPE.*>/a <!-- git-sha: $GIT_SHA -->" "$file"
    else
      sed -i "1i <!-- git-sha: $GIT_SHA -->" "$file"
    fi
  fi
done

echo "Git SHA injection complete: $GIT_SHA"
