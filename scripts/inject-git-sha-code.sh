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

# Inject SHA into src/index.js
# Replace the gitSha line to use a hardcoded value instead of env.GIT_SHA
if ! grep -q "gitSha:" src/index.js; then
  echo "Error: gitSha field not found in src/index.js"
  exit 1
fi

# Use sed to replace the gitSha line with a hardcoded value
# Pattern matches: gitSha: env.GIT_SHA || 'unknown',
# Replaces with: gitSha: 'ACTUAL_SHA_HERE',
sed -i "s/gitSha: env\.GIT_SHA || 'unknown',/gitSha: '$GIT_SHA',/" src/index.js

echo "Git SHA injected into src/index.js"

# Verify the injection worked
if grep -q "gitSha: '$GIT_SHA'," src/index.js; then
  echo "✓ Verification successful: Git SHA found in src/index.js"
else
  echo "✗ Verification failed: Git SHA not found in src/index.js"
  exit 1
fi
