# Clerk Production Setup - Remaining Steps

## Implementation Status

**Status:** 🚧 IN PROGRESS - Backend Complete, Production Setup Pending

---

## Overview

This document tracks all remaining steps required to get Clerk authentication working in production at https://hashbin.org. The backend implementation is complete, but production configuration and monitoring need to be finalized.

**What's Done:**
- Backend auth APIs (`/api/auth/*`) - Complete
- Auth middleware with JWT verification - Complete
- Clerk webhook handlers - Complete
- Frontend Clerk SDK integration - Complete
- API key system - Complete
- Clerk health check in `/health` endpoint - ✅ Complete
- Independent smoke-test workflow - ✅ Complete

**What's Remaining:**
- Production secrets configuration
- Clerk dashboard production configuration
- End-to-end production testing

---

## 1. Add Clerk to Health Endpoint

### Current State

The `/health` endpoint at `src/index.js:253-295` currently checks:
- Worker configuration
- Environment variables
- Durable Objects (6 bindings)
- R2 Buckets (2 bindings)

**Missing:** Clerk integration health check

### Implementation Tasks

#### 1.1 Add `checkClerk()` function

Add a new health check function in `src/index.js` after line 452:

```javascript
/**
 * Check Clerk integration health
 */
async function checkClerk(env) {
  const checks = {
    secretKeyConfigured: false,
    publishableKeyConfigured: false,
    webhookSecretConfigured: false,
    apiConnectivity: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.CLERK_SECRET_KEY;
    checks.publishableKeyConfigured = !!env.CLERK_PUBLISHABLE_KEY;
    checks.webhookSecretConfigured = !!env.CLERK_WEBHOOK_SECRET;

    // Test Clerk API connectivity (lightweight call)
    if (checks.secretKeyConfigured) {
      const response = await fetch('https://api.clerk.com/v1/health', {
        headers: {
          'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      checks.apiConnectivity = response.ok;
    }

    const allConfigured = checks.secretKeyConfigured &&
                          checks.publishableKeyConfigured &&
                          checks.webhookSecretConfigured;
    const operational = allConfigured && checks.apiConnectivity;

    return {
      status: operational ? 'operational' : (allConfigured ? 'degraded' : 'down'),
      message: operational ? 'Clerk integration operational' :
               (allConfigured ? 'Clerk configured but API unreachable' : 'Clerk not fully configured'),
      details: checks
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Clerk check failed',
      error: error.message,
      details: checks
    };
  }
}
```

#### 1.2 Update `handleHealth()` function

Modify `handleHealth()` at line 253 to include Clerk check:

```javascript
async function handleHealth(env) {
  const checks = {
    worker: await checkWorker(env),
    environment: await checkEnvironment(env),
    durableObjects: await checkDurableObjects(env),
    r2: await checkR2Buckets(env),
    clerk: await checkClerk(env)  // Add this line
  };
  // ... rest remains the same
}
```

#### 1.3 Expected Health Response

After implementation, `https://hashbin.org/health` should return:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "production",
  "checks": {
    "worker": { "status": "operational", ... },
    "environment": { "status": "operational", ... },
    "durableObjects": { "status": "operational", ... },
    "r2": { "status": "operational", ... },
    "clerk": {
      "status": "operational",
      "message": "Clerk integration operational",
      "details": {
        "secretKeyConfigured": true,
        "publishableKeyConfigured": true,
        "webhookSecretConfigured": true,
        "apiConnectivity": true
      }
    }
  },
  "summary": {
    "total": 5,
    "operational": 5,
    "degraded": 0,
    "down": 0
  }
}
```

---

## 2. Independent Smoke-Test Workflow

### Purpose

Create a separate GitHub Actions workflow that:
1. Runs on-demand via `workflow_dispatch`
2. Runs automatically after deployment completes
3. Tests production integrations including Clerk and R2
4. Can be triggered independently for incident investigation

### Implementation Tasks

#### 2.1 Create `.github/workflows/smoke-test.yml`

```yaml
name: Smoke Test

on:
  # Run on demand
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'production'
        type: choice
        options:
          - production
          - development

  # Run after deployment workflow completes
  workflow_run:
    workflows: ["Deploy to Cloudflare"]
    types:
      - completed
    branches:
      - main
      - develop

  # Run on schedule (optional - every 6 hours)
  schedule:
    - cron: '0 */6 * * *'

env:
  PRODUCTION_URL: https://hashbin.org
  DEVELOPMENT_URL: https://hashbin-worker-dev.${{ secrets.CLOUDFLARE_ACCOUNT_ID }}.workers.dev

jobs:
  smoke-test:
    name: Run Smoke Tests
    runs-on: ubuntu-latest
    # Skip if triggered by failed deployment
    if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Determine target environment
        id: env
        run: |
          if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then
            echo "target=${{ inputs.environment }}" >> $GITHUB_OUTPUT
          elif [ "${{ github.event_name }}" == "workflow_run" ]; then
            if [ "${{ github.event.workflow_run.head_branch }}" == "main" ]; then
              echo "target=production" >> $GITHUB_OUTPUT
            else
              echo "target=development" >> $GITHUB_OUTPUT
            fi
          else
            echo "target=production" >> $GITHUB_OUTPUT
          fi

      - name: Set target URL
        id: url
        run: |
          if [ "${{ steps.env.outputs.target }}" == "production" ]; then
            echo "base_url=${{ env.PRODUCTION_URL }}" >> $GITHUB_OUTPUT
          else
            echo "base_url=${{ env.DEVELOPMENT_URL }}" >> $GITHUB_OUTPUT
          fi

      - name: Wait for deployment propagation
        if: github.event_name == 'workflow_run'
        run: sleep 30

      # ============================================
      # Basic Health Check
      # ============================================
      - name: Test - Basic Health Endpoint
        id: health
        run: |
          echo "Testing ${{ steps.url.outputs.base_url }}/health"
          RESPONSE=$(curl -sf -w "\n%{http_code}" "${{ steps.url.outputs.base_url }}/health" || echo -e "\n000")
          HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
          BODY=$(echo "$RESPONSE" | head -n-1)

          echo "HTTP Status: $HTTP_CODE"
          echo "Response: $BODY"

          if [ "$HTTP_CODE" != "200" ]; then
            echo "::error::Health endpoint returned HTTP $HTTP_CODE"
            exit 1
          fi

          echo "body<<EOF" >> $GITHUB_OUTPUT
          echo "$BODY" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
          echo "::notice::Health endpoint OK"

      # ============================================
      # Clerk Integration Tests
      # ============================================
      - name: Test - Clerk Integration Health
        run: |
          BODY='${{ steps.health.outputs.body }}'

          # Check Clerk is in health response
          if ! echo "$BODY" | jq -e '.checks.clerk' > /dev/null 2>&1; then
            echo "::error::Clerk health check not found in response"
            exit 1
          fi

          CLERK_STATUS=$(echo "$BODY" | jq -r '.checks.clerk.status')
          if [ "$CLERK_STATUS" != "operational" ]; then
            echo "::error::Clerk status is $CLERK_STATUS (expected operational)"
            CLERK_DETAILS=$(echo "$BODY" | jq '.checks.clerk.details')
            echo "Details: $CLERK_DETAILS"
            exit 1
          fi

          echo "::notice::Clerk integration operational"

      - name: Test - Clerk Session Endpoint (Unauthenticated)
        run: |
          # Should return 401 for unauthenticated request
          HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${{ steps.url.outputs.base_url }}/api/auth/session" || echo "401")

          if [ "$HTTP_CODE" != "401" ]; then
            echo "::error::Session endpoint returned $HTTP_CODE (expected 401 for unauthenticated)"
            exit 1
          fi

          echo "::notice::Auth endpoint correctly returns 401 for unauthenticated requests"

      # ============================================
      # R2 Storage Tests
      # ============================================
      - name: Test - R2 Storage Health
        run: |
          BODY='${{ steps.health.outputs.body }}'

          R2_STATUS=$(echo "$BODY" | jq -r '.checks.r2.status')
          if [ "$R2_STATUS" != "operational" ]; then
            echo "::error::R2 status is $R2_STATUS (expected operational)"
            R2_DETAILS=$(echo "$BODY" | jq '.checks.r2.details')
            echo "Details: $R2_DETAILS"
            exit 1
          fi

          echo "::notice::R2 storage operational"

      # ============================================
      # Durable Objects Tests
      # ============================================
      - name: Test - Durable Objects Health
        run: |
          BODY='${{ steps.health.outputs.body }}'

          DO_STATUS=$(echo "$BODY" | jq -r '.checks.durableObjects.status')
          if [ "$DO_STATUS" != "operational" ]; then
            echo "::error::Durable Objects status is $DO_STATUS (expected operational)"
            DO_DETAILS=$(echo "$BODY" | jq '.checks.durableObjects.details')
            echo "Details: $DO_DETAILS"
            exit 1
          fi

          echo "::notice::Durable Objects operational"

      # ============================================
      # API Endpoint Tests
      # ============================================
      - name: Test - Root Endpoint
        run: |
          RESPONSE=$(curl -sf "${{ steps.url.outputs.base_url }}/")

          if ! echo "$RESPONSE" | grep -q "HashBin.org API"; then
            echo "::error::Root endpoint missing expected content"
            exit 1
          fi

          echo "::notice::Root endpoint OK"

      - name: Test - Public Endpoints Accessible
        run: |
          # Test calculate retention endpoint (public)
          HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d '{"sizeBytes": 1024, "retentionDays": 30}' \
            "${{ steps.url.outputs.base_url }}/api/payments/calculate")

          if [ "$HTTP_CODE" != "200" ]; then
            echo "::warning::Calculate endpoint returned $HTTP_CODE"
          else
            echo "::notice::Public calculate endpoint OK"
          fi

      # ============================================
      # Summary
      # ============================================
      - name: Smoke Test Summary
        if: always()
        run: |
          echo "=========================================="
          echo "Smoke Test Results"
          echo "=========================================="
          echo "Environment: ${{ steps.env.outputs.target }}"
          echo "URL: ${{ steps.url.outputs.base_url }}"
          echo "Trigger: ${{ github.event_name }}"
          echo "=========================================="
```

#### 2.2 Update deploy.yml to reference smoke tests

Add at the end of `.github/workflows/deploy.yml`:

```yaml
  # Note: Smoke tests run automatically via workflow_run trigger
  # in .github/workflows/smoke-test.yml after this workflow completes
```

---

## 3. Clerk Production Configuration

### 3.1 Clerk Dashboard Setup

- [ ] Log into [Clerk Dashboard](https://dashboard.clerk.com)
- [ ] Select/create production instance for hashbin.org
- [ ] Configure OAuth providers:
  - [ ] Google OAuth - production credentials
  - [ ] Apple Sign-In - production credentials
  - [ ] Microsoft OAuth - production credentials
  - [ ] GitHub OAuth - production credentials (optional)

### 3.2 Production Domain Configuration

- [ ] Add `hashbin.org` as an allowed domain in Clerk
- [ ] Configure CORS settings for `https://hashbin.org`
- [ ] Set up custom session token claims if needed

### 3.3 Webhook Configuration

- [ ] Configure webhook endpoint: `https://hashbin.org/api/webhooks/clerk`
- [ ] Subscribe to events:
  - `user.created`
  - `user.updated`
  - `user.deleted`
- [ ] Copy webhook signing secret

---

## 4. GitHub Secrets Configuration

Per Architectural Decision #21, all secrets are managed via GitHub and deployed through CI/CD.

### 4.1 Required GitHub Secrets

Add these secrets in GitHub repository settings (Settings > Secrets and variables > Actions):

| Secret Name | Value Source | Description |
|-------------|--------------|-------------|
| `CLERK_SECRET_KEY` | Clerk Dashboard > API Keys | `sk_live_XXXXX` |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | `pk_live_XXXXX` |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard > Webhooks | `whsec_XXXXX` |

### 4.2 CI/CD Deployment

The deployment workflow (`.github/workflows/deploy.yml`) must deploy secrets to Cloudflare:

```yaml
- name: Deploy Clerk secrets
  run: |
    echo "${{ secrets.CLERK_SECRET_KEY }}" | npx wrangler secret put CLERK_SECRET_KEY --env production
    echo "${{ secrets.CLERK_PUBLISHABLE_KEY }}" | npx wrangler secret put CLERK_PUBLISHABLE_KEY --env production
    echo "${{ secrets.CLERK_WEBHOOK_SECRET }}" | npx wrangler secret put CLERK_WEBHOOK_SECRET --env production
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### 4.3 Verify Secrets in Health Endpoint

After deployment, verify via health endpoint:

```bash
curl -s https://hashbin.org/health | jq '.checks.clerk.details'
```

Expected:
```json
{
  "secretKeyConfigured": true,
  "publishableKeyConfigured": true,
  "webhookSecretConfigured": true,
  "apiConnectivity": true
}
```

---

## 5. Frontend Configuration

### 5.1 Publishable Key Injection

The frontend loads the Clerk publishable key. Verify `frontend/index.html` and other pages include:

```html
<script>
  window.CLERK_PUBLISHABLE_KEY = '{{ CLERK_PUBLISHABLE_KEY }}';
</script>
```

**Note:** This needs to be injected at runtime or build time. Options:
- Worker injects it into HTML responses
- Use a `/config.js` endpoint that returns runtime config
- Environment-specific builds

### 5.2 Verify Frontend Auth Flow

- [ ] Login button redirects to Clerk
- [ ] OAuth callback handled correctly
- [ ] Session cookie set after login
- [ ] Dashboard shows authenticated state
- [ ] Logout clears session

---

## 6. Production Testing Checklist

### 6.1 Health Endpoint Verification

```bash
# Test health endpoint includes Clerk
curl -s https://hashbin.org/health | jq '.checks.clerk'
```

Expected:
```json
{
  "status": "operational",
  "message": "Clerk integration operational",
  "details": {
    "secretKeyConfigured": true,
    "publishableKeyConfigured": true,
    "webhookSecretConfigured": true,
    "apiConnectivity": true
  }
}
```

### 6.2 Authentication Flow Tests

| Test | Expected | Status |
|------|----------|--------|
| Visit https://hashbin.org | Landing page loads | |
| Click "Login" | Redirects to Clerk | |
| Complete OAuth (Google) | Returns to hashbin.org | |
| Check session | `/api/auth/session` returns user info | |
| Visit dashboard | Shows authenticated state | |
| Check balance | `/api/balance` returns balance | |
| Logout | Session cleared, returns to landing | |

### 6.3 Webhook Tests

| Test | Expected | Status |
|------|----------|--------|
| Create new user | Webhook creates UserProfile | |
| Update user profile | Webhook updates UserProfile | |
| Delete user | Webhook soft-deletes profile | |

---

## 7. Failure Notification

If Clerk integration fails in production, smoke tests will fail and notify via GitHub Actions.

---

## Completion Criteria

All items below must be completed before marking this task done:

- [x] `checkClerk()` function added to `src/index.js`
- [x] `/health` endpoint includes Clerk status
- [x] `.github/workflows/smoke-test.yml` created and tested
- [ ] Smoke tests pass for both development and production
- [ ] Production secrets configured via `wrangler secret put`
- [ ] Clerk webhook configured and verified
- [ ] End-to-end login flow tested in production
- [ ] Documentation updated with production URLs

---

## References

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Backend SDK](https://clerk.com/docs/references/backend/overview)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- Backend implementation: `src/api/auth.js`
- Auth middleware: `src/auth/middleware.js`
- Webhooks: `src/api/webhooks.js`
- Frontend auth: `frontend/js/auth.js`
