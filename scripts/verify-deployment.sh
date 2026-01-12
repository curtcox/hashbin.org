#!/bin/bash
# Deployment Verification Script
# Usage: ./scripts/verify-deployment.sh <environment> [account-id]
# Example: ./scripts/verify-deployment.sh development abc123...

set -e

ENVIRONMENT=$1
ACCOUNT_ID=$2

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <environment> [account-id]"
  echo "  environment: development, production, or custom URL"
  echo "  account-id: Cloudflare account ID (required for development/production)"
  echo ""
  echo "Examples:"
  echo "  $0 development abc123def456"
  echo "  $0 production abc123def456"
  echo "  $0 https://hashbin.org"
  exit 1
fi

# Determine the base URL
if [[ "$ENVIRONMENT" == http* ]]; then
  BASE_URL="$ENVIRONMENT"
  ENV_NAME="custom"
elif [ "$ENVIRONMENT" = "development" ]; then
  if [ -z "$ACCOUNT_ID" ]; then
    echo "Error: Account ID required for development environment"
    exit 1
  fi
  BASE_URL="https://hashbin-worker-dev.${ACCOUNT_ID}.workers.dev"
  ENV_NAME="development"
elif [ "$ENVIRONMENT" = "production" ]; then
  if [ -z "$ACCOUNT_ID" ]; then
    echo "Error: Account ID required for production environment"
    exit 1
  fi
  BASE_URL="https://hashbin-worker-prod.${ACCOUNT_ID}.workers.dev"
  ENV_NAME="production"
else
  echo "Error: Invalid environment '$ENVIRONMENT'"
  echo "Must be 'development', 'production', or a full URL"
  exit 1
fi

echo "=========================================="
echo "Verifying deployment: $ENV_NAME"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Test 1: Root endpoint
echo "Test 1: Root endpoint"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200, got $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

if ! echo "$BODY" | grep -q "HashBin.org API"; then
  echo "❌ FAILED: Response does not contain expected service name"
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
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY" | head -c 200
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200, got $HTTP_CODE"
  exit 1
fi

if ! echo "$BODY" | grep -q '"status":"healthy"'; then
  echo "❌ FAILED: Health status is not 'healthy'"
  exit 1
fi

# Verify environment matches (if not custom URL)
if [ "$ENV_NAME" != "custom" ]; then
  if ! echo "$BODY" | grep -q "\"environment\":\"$ENV_NAME\""; then
    echo "⚠️  WARNING: Environment mismatch (expected $ENV_NAME)"
  fi
fi

echo "✅ PASSED"
echo ""

# Test 3: Check services
echo "Test 3: Service status"
echo "--------------------"
WORKER_STATUS=$(echo "$BODY" | grep -o '"worker":"[^"]*"' | cut -d'"' -f4)
DO_STATUS=$(echo "$BODY" | grep -o '"durableObjects":"[^"]*"' | cut -d'"' -f4)
R2_STATUS=$(echo "$BODY" | grep -o '"r2":"[^"]*"' | cut -d'"' -f4)

echo "Worker: $WORKER_STATUS"
echo "Durable Objects: $DO_STATUS"
echo "R2: $R2_STATUS"

if [ "$WORKER_STATUS" != "operational" ]; then
  echo "❌ FAILED: Worker not operational"
  exit 1
fi

if [ "$DO_STATUS" != "operational" ]; then
  echo "❌ FAILED: Durable Objects not operational"
  exit 1
fi

if [ "$R2_STATUS" != "operational" ]; then
  echo "❌ FAILED: R2 not operational"
  exit 1
fi

echo "✅ PASSED"
echo ""

# Test 4: 404 handling
echo "Test 4: 404 handling"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/nonexistent")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" != "404" ]; then
  echo "❌ FAILED: Expected HTTP 404 for nonexistent route, got $HTTP_CODE"
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
echo "Status: All systems operational"
echo ""
echo "Endpoints tested:"
echo "  - GET / (root)"
echo "  - GET /health"
echo "  - GET /nonexistent (404)"
echo ""
echo "Services verified:"
echo "  - Cloudflare Workers"
echo "  - Durable Objects"
echo "  - R2 Storage"
echo "=========================================="
