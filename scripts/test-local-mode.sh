#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${1:-http://localhost:8787}

function check_endpoint() {
  local url=$1
  local label=$2

  echo "Checking ${label}: ${url}"
  local response
  response=$(curl -s --fail "$url" || true)

  if [[ -z "$response" ]]; then
    echo "❌ ${label} failed (no response). Is the local server running?"
    exit 1
  fi

  echo "$response" | head -n 5
}

check_endpoint "${BASE_URL}/health" "health"
check_endpoint "${BASE_URL}/api/config" "config"

if curl -s --fail -X POST "${BASE_URL}/api/balance/dev-deposit" \
  -H "Authorization: LocalDev local_test_user" \
  -H "Content-Type: application/json" \
  --data '{"amount_cents": 100}' >/dev/null; then
  echo "✅ Local dev deposit endpoint reachable"
else
  echo "⚠️  Local dev deposit endpoint did not respond (auth may be required)"
fi
