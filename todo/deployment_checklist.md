# Production Deployment Checklist for User Authorization

This checklist ensures the user authorization system is properly configured and deployed to production.

Use documented APIs/SDKs and CLI tools before browser configuration. The current
[Clerk plan](clerk_remaining.md), [Cloudflare plan](cost_safety_cloudflare.md) and
[Stripe plan](cost_safety_stripe.md) define access checks and task-specific API
routes. Record the exact missing API/entitlement before using a dashboard
fallback; browser acceptance of real login/payment journeys remains required.
[Deployment setup](deployment_setup.md) provides the CLI release path.

## Prerequisites

- [ ] Cloudflare Workers Paid plan ($5/month) - Required for Durable Objects and R2
- [ ] Clerk account created at https://clerk.com
- [ ] Domain name configured (hashbin.org)
- [ ] GitHub Actions secrets configured (see deployment_setup.md)

---

## Clerk Application Setup

Follow [CL1–CL11](clerk_remaining.md) as the authoritative production checklist:

- [ ] Check Platform API entitlement and identify the application/production instance.
- [ ] Configure instance, social providers, linking and domain using the available
  Platform config schema/APIs; use supported Backend API settings where applicable.
- [ ] Provision the webhook through authorized management APIs where available;
  otherwise record the specific embedded webhook UI exception.
- [ ] Store all three Clerk secrets with `gh secret set` and deploy through CI.
- [ ] Verify API state and signed webhook delivery, then run browser login tests.

Dashboard configuration is limited to CL1–CL6 settings unavailable through the
account's documented APIs. The Clerk plan distinguishes the private-beta
Platform API, instance Backend API and managed Svix access.

---

## Cloudflare Configuration

### 1. Verify Wrangler Installation

```bash
npm ci
npx wrangler --version
```

### 2. Authenticate with Cloudflare

Use a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the
approved secret source. Prefer token APIs for scoped token provisioning when a
bootstrap credential exists. `npx wrangler login` is a browser bootstrap fallback
only when API access cannot yet be established; it is not the default CI path.

### 3. Verify Repository Configuration

Read the current `wrangler.toml` and content Worker configuration; the current
production deployment uses the top-level config. Inspect deployed settings via
Wrangler/Workers API and preserve GitHub as the configuration source of truth.
Do not introduce an obsolete `--env production` target from older recipes.

### 4. Provision Secrets Through GitHub and CI

Use `gh secret set` with secure stdin for `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY` and `CLERK_WEBHOOK_SECRET`. Verify names with
`gh secret list`, deploy via the existing Actions workflow, and verify deployed
names with `npx wrangler secret list`. Do not expose values in output or perform
routine manual Worker-secret writes that drift from GitHub (Decision 21).
See [deployment setup](deployment_setup.md) for release commands.

### 5. Verify Durable Objects Bindings

Read all binding names and namespace targets from the current main/content
Worker configs and compare with deployed Workers API metadata. Verify shared
ContentMetadata, UserProfile and safety namespaces resolve to the intended main
Worker; use the config rather than historical binding-name lists.

### 6. Verify R2 Bucket Bindings

- [ ] Create production R2 buckets (if not already created):
  - `hashbin-content-256t-prod`
  - `hashbin-backups-prod`
- [ ] Verify bindings in `wrangler.toml`

---

## Deployment

### 1. Run Local Tests

```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Run authentication tests
./scripts/test-auth-system.sh
```

Expected result: All tests pass

### 2. Deploy to Production

```bash
# Deploy to production environment
npm run deploy:prod
```

Expected output:
```
✨ Built successfully
✨ Successfully uploaded worker
✨ Deployed hashbin-worker-prod
  https://hashbin.org/*
```

### 3. Verify Deployment

```bash
# Run deployment verification
npm run verify:prod
```

Check:
- [ ] Health endpoint returns `"status": "healthy"`
- [ ] Environment is `"production"`
- [ ] All Durable Objects are `"operational"`
- [ ] R2 buckets are `"operational"`

### 4. Test Authentication Flow

Manual testing steps:

1. **Test OAuth Login**
   - [ ] Visit https://hashbin.org
   - [ ] Click "Sign In"
   - [ ] Test Google OAuth login
   - [ ] Test GitHub OAuth login
   - [ ] Verify user profile created

2. **Test Account Linking**
   - [ ] Log in with Google
   - [ ] Link Microsoft account
   - [ ] Verify both providers listed in profile
   - [ ] Log out and log in with Microsoft
   - [ ] Verify same account accessed

3. **Test API Key Management**
   - [ ] Log in with Clerk session
   - [ ] Create new API key via `/api/auth/apikeys`
   - [ ] Save API key securely
   - [ ] List API keys via `/api/auth/apikeys`
   - [ ] Make authenticated request with API key
   - [ ] Revoke API key
   - [ ] Verify revoked key no longer works

4. **Test Webhook Processing**
   - [ ] Trigger `user.created` by signing up new user
   - [ ] Check Worker logs for webhook processing
   - [ ] Verify UserProfile Durable Object created
   - [ ] Link new OAuth provider
   - [ ] Check logs for `user.updated` webhook
   - [ ] Delete designated test user via Clerk Backend API/SDK
   - [ ] Check logs for `user.deleted` webhook

### 5. Monitor Initial Traffic

- [ ] Monitor Cloudflare Workers analytics
- [ ] Check Worker logs for errors
- [ ] Verify webhook delivery through authorized Svix API; record an embedded-UI fallback only if management API access is unavailable
- [ ] Monitor Durable Objects usage
- [ ] Check R2 storage metrics

---

## Post-Deployment Verification

### Authentication Tests

Run these curl commands to verify endpoints:

```bash
# Test anonymous access
curl https://hashbin.org/
curl https://hashbin.org/health

# Test authenticated endpoint (should return 401)
curl -X GET https://hashbin.org/api/auth/session
# Expected: {"error":"AUTH_MISSING","message":"Authentication required"}

# Test invalid auth format (should return 401)
curl -X GET https://hashbin.org/api/auth/session \
  -H "Authorization: Invalid"
# Expected: {"error":"AUTH_INVALID_FORMAT","message":"Invalid authentication format"}

# Test with valid API key (create via Clerk first)
curl -X GET https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey hb_live_YOUR_KEY_HERE"
# Expected: {"user_id":"...", "auth_method":"apikey", ...}
```

### Webhook Tests

Test webhook endpoint (should reject without valid signature):

```bash
curl -X POST https://hashbin.org/api/webhooks/clerk \
  -H "Content-Type: application/json" \
  -d '{"type":"user.created","data":{"id":"test"}}'
# Expected: {"error":"Invalid webhook signature"} with 401 status
```

### Health Check

```bash
curl https://hashbin.org/health | jq
```

Expected response:
- `"status": "healthy"` or `"degraded"` (acceptable)
- `"environment": "production"`
- All Durable Objects show `"available": true, "accessible": true`
- All R2 buckets show `"available": true, "accessible": true`

---

## Rollback Plan

If deployment fails or critical issues are found:

1. **Immediate Rollback**
   ```bash
   # Revert to previous deployment
   git checkout <previous-commit>
   npm run deploy:prod
   ```

2. **Disable Webhooks**
   - Disable the specific endpoint through authorized webhook management API; use the embedded UI only if that API is unavailable
   - This prevents user creation/update/deletion from affecting Worker

3. **Investigate Issues**
   - Check Cloudflare Worker logs
   - Inspect Clerk API errors and authorized webhook delivery API/logs; use the recorded UI fallback only for unavailable delivery details
   - Check Durable Objects state
   - Review R2 bucket access

4. **Fix and Redeploy**
   - Fix identified issues
   - Test in development environment
   - Run all automated tests
   - Deploy to production again

---

## Security Checklist

- [ ] CLERK_SECRET_KEY stored as Cloudflare secret (not in code)
- [ ] CLERK_WEBHOOK_SECRET stored as Cloudflare secret
- [ ] API keys hashed with SHA-256 before storage
- [ ] Webhook signature verification enabled
- [ ] Rate limiting enabled and configured
- [ ] HTTPS enforced (Cloudflare handles this)
- [ ] CORS headers properly configured
- [ ] Error messages don't leak sensitive information
- [ ] Logs don't contain API keys or secrets

---

## Monitoring Setup

### Cloudflare Alerts

Discover supported alert types/eligibility and configure policies with the Cloudflare Alerting API (CF6), then verify delivery:

- [ ] Worker error rate > 5%
- [ ] Worker CPU time > 80% of limit
- [ ] Durable Objects storage > 80% of limit
- [ ] R2 requests > expected baseline

### Clerk Monitoring

Prefer documented Clerk usage/configuration APIs and authorized webhook delivery APIs. Record a dashboard fallback only for metrics unavailable through those APIs:

- [ ] Daily active users
- [ ] OAuth provider success rates
- [ ] Webhook delivery success rate
- [ ] Account linking frequency

### Custom Monitoring

Consider adding:
- [ ] Uptime monitoring (e.g., UptimeRobot)
- [ ] Error tracking (e.g., Sentry)
- [ ] Analytics (Cloudflare Workers Analytics)

---

## Known Issues and Workarounds

### Issue: Clerk Webhook Delays

**Symptom:** User profile not immediately available after OAuth login

**Workaround:** 
- Middleware creates profile on first authenticated request if webhook hasn't processed yet
- No action needed from users

### Issue: Environment Variable Not Set

**Symptom:** Health check shows `"environment": "unknown"`

**Fix:**
```bash
# Verify production environment variables
wrangler secret list --env production

# Redeploy if needed
npm run deploy:prod
```

### Issue: Durable Objects Not Connected

**Symptom:** Health check shows `"accessible": false` for Durable Objects

**Fix:**
- This is expected in local development
- In production, if this occurs, check Cloudflare Dashboard for migrations
- Ensure all migrations in `wrangler.toml` are complete

---

## Support and Documentation

- **Clerk Documentation:** https://clerk.com/docs
- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **Wrangler CLI Docs:** https://developers.cloudflare.com/workers/wrangler/
- **Project Documentation:** `/docs` directory
- **Test Scripts:** `/scripts` directory

---

## Completion Sign-Off

Once all items are checked and verified:

- [ ] All prerequisites met
- [ ] Clerk configured and tested
- [ ] Cloudflare secrets set
- [ ] Deployment successful
- [ ] Post-deployment tests pass
- [ ] Monitoring configured
- [ ] Security checklist complete

**Deployed by:** _______________  
**Date:** _______________  
**Production URL:** https://hashbin.org  
**Worker Name:** hashbin-worker-prod  

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Copilot | Initial production deployment checklist |
