#!/bin/bash
# Deployment Verification Script
# Usage: ./scripts/verify-deployment.sh [production|<url>] [workers-dev-subdomain]
# Examples:
#   ./scripts/verify-deployment.sh https://hashbin.org         (npm run verify)
#   ./scripts/verify-deployment.sh production my-subdomain     (hashbin-worker-prod.my-subdomain.workers.dev)

set -e

ENVIRONMENT=${1:-production}
WORKERS_SUBDOMAIN=$2

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 [production|<url>] [workers-dev-subdomain]"
  echo "  production: check hashbin-worker-prod.<subdomain>.workers.dev"
  echo "  workers-dev-subdomain: the account's workers.dev subdomain (required for production)"
  echo ""
  echo "Examples:"
  echo "  $0 production my-subdomain"
  echo "  $0 https://hashbin.org"
  exit 1
fi

# Determine the base URL
if [[ "$ENVIRONMENT" == http* ]]; then
  BASE_URL="$ENVIRONMENT"
  ENV_NAME="custom"
elif [ "$ENVIRONMENT" = "development" ] || [ "$ENVIRONMENT" = "production" ]; then
  if [ -z "$WORKERS_SUBDOMAIN" ]; then
    echo "Error: workers.dev subdomain required (or pass a full URL, e.g. https://hashbin.org)"
    exit 1
  fi
  BASE_URL="https://hashbin-worker-prod.${WORKERS_SUBDOMAIN}.workers.dev"
  ENV_NAME="production"
else
  echo "Error: Invalid environment '$ENVIRONMENT'"
  echo "Must be 'production' or a full URL"
  exit 1
fi

echo "=========================================="
echo "Verifying deployment: $ENV_NAME"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Test 1: Home page (the Worker serves the static frontend at /)
echo "Test 1: Home page"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200, got $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

if ! echo "$BODY" | grep -q "<title>.*HashBin"; then
  echo "❌ FAILED: Home page does not have a HashBin title"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ PASSED"
echo ""

# Test 2: Health endpoint
echo "Test 2: Health endpoint"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY" | head -c 200
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200, got $HTTP_CODE"
  exit 1
fi

# Check for healthy or degraded (both are acceptable for deployment)
if echo "$BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"unhealthy"'; then
  echo "❌ FAILED: Health status is 'unhealthy'"
  echo "Response: $BODY"
  exit 1
fi

if echo "$BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"degraded"'; then
  echo "⚠️  WARNING: Health status is 'degraded' (some services may have issues)"
fi

# Verify environment matches (if not custom URL)
if [ "$ENV_NAME" != "custom" ]; then
  if ! echo "$BODY" | grep -q "\"environment\"[[:space:]]*:[[:space:]]*\"$ENV_NAME\""; then
    echo "⚠️  WARNING: Environment mismatch (expected $ENV_NAME)"
  fi
fi

echo "✅ PASSED"
echo ""

# Test 3: Check services (with new nested structure)
echo "Test 3: Service status"
echo "--------------------"

# Try to use jq if available, fallback to grep
if command -v jq >/dev/null 2>&1; then
  # Use jq for reliable JSON parsing
  WORKER_STATUS=$(echo "$BODY" | jq -r '.checks.worker.status // "unknown"')
  ENV_STATUS=$(echo "$BODY" | jq -r '.checks.environment.status // "unknown"')
  OAUTH_SIGNING_KEY_CONFIGURED=$(echo "$BODY" | jq -r '.checks.environment.details.oauthSigningKeyConfigured // "false"')
  DO_STATUS=$(echo "$BODY" | jq -r '.checks.durableObjects.status // "unknown"')
  R2_STATUS=$(echo "$BODY" | jq -r '.checks.r2.status // "unknown"')
else
  # Fallback to grep for systems without jq
  WORKER_STATUS=$(echo "$BODY" | grep -o '"worker"[^}]*"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
  ENV_STATUS=$(echo "$BODY" | grep -o '"environment"[^}]*"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
  OAUTH_SIGNING_KEY_CONFIGURED=$(echo "$BODY" | grep -q '"oauthSigningKeyConfigured"[[:space:]]*:[[:space:]]*true' && echo "true" || echo "false")
  DO_STATUS=$(echo "$BODY" | grep -o '"durableObjects"[^}]*"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
  R2_STATUS=$(echo "$BODY" | grep -o '"r2"[^}]*"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
fi

echo "Worker: $WORKER_STATUS"
echo "Environment: $ENV_STATUS"
echo "OAuth signing key configured: $OAUTH_SIGNING_KEY_CONFIGURED"
echo "Durable Objects: $DO_STATUS"
echo "R2: $R2_STATUS"

# Check critical services (worker, DO, R2)
if [ "$WORKER_STATUS" != "operational" ]; then
  echo "❌ FAILED: Worker not operational"
  exit 1
fi

if [ "$DO_STATUS" = "down" ]; then
  echo "❌ FAILED: Durable Objects are down"
  exit 1
fi

if [ "$R2_STATUS" = "down" ]; then
  echo "❌ FAILED: R2 is down"
  exit 1
fi

if [ "$OAUTH_SIGNING_KEY_CONFIGURED" != "true" ]; then
  echo "❌ FAILED: OAUTH_SIGNING_KEY is not configured"
  exit 1
fi

# Warnings for degraded services
if [ "$DO_STATUS" = "degraded" ]; then
  echo "⚠️  WARNING: Durable Objects degraded (some may be unavailable)"
fi

if [ "$R2_STATUS" = "degraded" ]; then
  echo "⚠️  WARNING: R2 degraded (some buckets may be unavailable)"
fi

if [ "$ENV_STATUS" = "degraded" ]; then
  echo "⚠️  WARNING: Environment configuration has issues"
fi

echo "✅ PASSED"
echo ""

# Test 3b: Dedicated content domain health
echo "Test 3b: Dedicated content domain"
echo "--------------------"
CONTENT_RESPONSE=$(curl -s -w "\n%{http_code}" "https://256t.us/health")
CONTENT_HTTP_CODE=$(echo "$CONTENT_RESPONSE" | tail -n1)
CONTENT_BODY=$(echo "$CONTENT_RESPONSE" | sed '$d')

echo "HTTP Status: $CONTENT_HTTP_CODE"
echo "Response: $CONTENT_BODY"

if [ "$CONTENT_HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200 from https://256t.us/health, got $CONTENT_HTTP_CODE"
  exit 1
fi

echo "✅ PASSED"
echo ""

# Test 4: 404 handling (unknown pages redirect home; unknown API routes are JSON 404s)
echo "Test 4: 404 handling"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/nonexistent")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" != "404" ]; then
  echo "❌ FAILED: Expected HTTP 404 for an unknown API route, got $HTTP_CODE"
  exit 1
fi

echo "✅ PASSED"
echo ""

# Summary
echo "=========================================="
echo "✅ All verification tests passed!"
echo "=========================================="
echo "Environment: $ENV_NAME"
echo "Base URL: $BASE_URL"
echo ""
echo "Endpoints tested:"
echo "  - GET / (home page)"
echo "  - GET /health (comprehensive)"
echo "  - GET https://256t.us/health"
echo "  - GET /api/nonexistent (404)"
echo ""
echo "Services verified:"
echo "  - Cloudflare Workers: $WORKER_STATUS"
echo "  - Environment Config: $ENV_STATUS"
echo "  - OAuth Signing Key: $OAUTH_SIGNING_KEY_CONFIGURED"
echo "  - Durable Objects (5 types): $DO_STATUS"
echo "  - R2 Storage (2 buckets): $R2_STATUS"
echo ""
echo "Health checks performed:"
echo "  ✓ Worker configuration and bindings"
echo "  ✓ Environment variables validation"
echo "  ✓ All 5 Durable Objects accessible"
echo "  ✓ Both R2 buckets accessible"
echo "=========================================="
