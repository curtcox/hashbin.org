#!/bin/bash
# Script to inject git SHA directly into source code
# This ensures the SHA is baked into the deployed bundle

set -e

# Get git SHA
GIT_SHA="${1:-$(git rev-parse HEAD)}"

if [ -z "$GIT_SHA" ]; then
  echo "Error: Could not determine git SHA"
  exit 1
fi

echo "Injecting git SHA into source code: $GIT_SHA"

# Check if the file exists
if [ ! -f "src/index.js" ]; then
  echo "Error: src/index.js not found"
  exit 1
fi

# Check if gitSha field exists at all
if ! grep -q "gitSha:" src/index.js; then
  echo "Error: gitSha field not found in src/index.js"
  exit 1
fi

# Check if the expected pattern exists (env.GIT_SHA || 'unknown')
# This pattern is what we need to replace
if grep -q "gitSha:[[:space:]]*env\.GIT_SHA[[:space:]]*||[[:space:]]*'unknown'" src/index.js; then
  echo "Found expected pattern (env.GIT_SHA || 'unknown'), replacing..."
  
  # Use sed to replace with flexible whitespace handling
  # Pattern matches: gitSha: env.GIT_SHA || 'unknown',
  # Replaces with: gitSha: 'ACTUAL_SHA_HERE',
  sed -i "s/gitSha:[[:space:]]*env\.GIT_SHA[[:space:]]*||[[:space:]]*'unknown',/gitSha: '$GIT_SHA',/" src/index.js
  
elif grep -q "gitSha:[[:space:]]*'[a-f0-9]\{40\}'," src/index.js; then
  echo "Found existing hardcoded SHA, updating..."
  
  # Replace existing SHA with new one
  sed -i "s/gitSha:[[:space:]]*'[a-f0-9]\{40\}',/gitSha: '$GIT_SHA',/" src/index.js
  
else
  echo "Error: gitSha field doesn't match expected pattern"
  echo "Expected either:"
  echo "  - gitSha: env.GIT_SHA || 'unknown',"
  echo "  - gitSha: 'EXISTING_SHA',"
  echo ""
  echo "Current gitSha line:"
  grep -n "gitSha:" src/index.js || echo "(not found)"
  exit 1
fi

echo "Git SHA injected into src/index.js"

# Verify the injection worked
if grep -q "gitSha: '$GIT_SHA'," src/index.js; then
  echo "✓ Verification successful: Git SHA found in src/index.js"
else
  echo "✗ Verification failed: Git SHA not found in src/index.js"
  echo "Current gitSha line:"
  grep -n "gitSha:" src/index.js || echo "(not found)"
  exit 1
fi
