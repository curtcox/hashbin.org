#!/bin/bash
#
# Inject git SHA directly into source code before deployment
#
# This script replaces the placeholder '__DEPLOY_GIT_SHA__' in src/index.js
# with the actual git SHA. This ensures the code changes with each commit,
# forcing wrangler to upload new worker code.
#
# Usage:
#   ./scripts/inject-git-sha-code.sh [GIT_SHA]
#
# If GIT_SHA is not provided, it will be determined from git rev-parse HEAD
#

set -e

# Get git SHA from argument or git command
GIT_SHA="${1:-$(git rev-parse HEAD)}"

if [ -z "$GIT_SHA" ]; then
    echo "ERROR: Could not determine git SHA"
    exit 1
fi

SOURCE_FILE="src/index.js"
PLACEHOLDER="__DEPLOY_GIT_SHA__"

echo "Injecting git SHA into source code..."
echo "  Git SHA: $GIT_SHA"
echo "  File: $SOURCE_FILE"

# Check if the file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo "ERROR: Source file not found: $SOURCE_FILE"
    exit 1
fi

# Check if the placeholder exists (either the original or a previously injected SHA)
if grep -q "BUNDLED_GIT_SHA = " "$SOURCE_FILE"; then
    # Replace the BUNDLED_GIT_SHA line with the new SHA
    sed -i "s/const BUNDLED_GIT_SHA = '[^']*';/const BUNDLED_GIT_SHA = '$GIT_SHA';/" "$SOURCE_FILE"

    # Verify the replacement
    if grep -q "BUNDLED_GIT_SHA = '$GIT_SHA'" "$SOURCE_FILE"; then
        echo "SUCCESS: Git SHA injected into source code"
    else
        echo "ERROR: Failed to inject git SHA"
        exit 1
    fi
else
    echo "ERROR: BUNDLED_GIT_SHA constant not found in $SOURCE_FILE"
    exit 1
fi

# Show the updated line for verification
echo ""
echo "Updated line:"
grep "BUNDLED_GIT_SHA" "$SOURCE_FILE"
