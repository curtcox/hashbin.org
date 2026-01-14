# Production Deployment Checklist for User Authorization

This checklist ensures the user authorization system is properly configured and deployed to production.

## Prerequisites

- [ ] Cloudflare Workers Paid plan ($5/month) - Required for Durable Objects and R2
- [ ] Clerk account created at https://clerk.com
- [ ] Domain name configured (hashbin.org)
- [ ] GitHub Actions secrets configured (see deployment_setup.md)

---

## Clerk Application Setup

### 1. Create Clerk Application

- [ ] Log in to Clerk Dashboard (https://dashboard.clerk.com)
- [ ] Create new application named "HashBin.org"
- [ ] Select application type: **Production**
- [ ] Note the Application ID

### 2. Configure OAuth Providers

Enable the following OAuth providers in Clerk Dashboard:

- [ ] **Google** - Configure OAuth 2.0 credentials
- [ ] **Apple** - Configure Sign in with Apple
- [ ] **Microsoft** - Configure Microsoft Identity Platform
- [ ] **GitHub** - Configure GitHub OAuth App

For each provider:
1. Navigate to "Configure" → "Authentication" → "Social connections"
2. Enable the provider
3. Follow provider-specific setup instructions
4. Test the OAuth flow in Clerk's test mode

### 3. Configure Account Linking

- [ ] Enable "Allow users to link multiple accounts" in Clerk Dashboard
- [ ] Configure account linking mode: **Automatic** (link accounts with same email)
- [ ] Set account verification requirements

### 4. Configure User Profile

- [ ] Enable "User profile" feature
- [ ] Configure allowed fields: email, profile image (optional)
- [ ] Disable unnecessary fields to maintain minimal data collection

### 5. Generate API Keys

- [ ] Navigate to "API Keys" in Clerk Dashboard
- [ ] Copy **Publishable Key** (starts with `pk_`)
- [ ] Copy **Secret Key** (starts with `sk_`)
- [ ] Store securely - these will be added as Cloudflare secrets

### 6. Configure Webhooks

- [ ] Navigate to "Webhooks" in Clerk Dashboard
- [ ] Click "Add Endpoint"
- [ ] Enter endpoint URL: `https://hashbin.org/api/webhooks/clerk`
- [ ] Subscribe to events:
  - [x] `user.created`
  - [x] `user.updated`
  - [x] `user.deleted`
- [ ] Copy the **Signing Secret** (starts with `whsec_`)
- [ ] Save webhook configuration

---

## Cloudflare Configuration

### 1. Verify Wrangler Installation

```bash
npm install -g wrangler
wrangler --version
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Configure Environment Variables

Set environment variables in `wrangler.toml` (already configured):

```toml
[env.production]
name = "hashbin-worker-prod"
vars = { ENVIRONMENT = "production", LOG_LEVEL = "warn" }
```

### 4. Set Production Secrets

Add Clerk secrets to Cloudflare Workers:

```bash
# Set Clerk secret key
wrangler secret put CLERK_SECRET_KEY --env production
# Paste your Clerk secret key (sk_live_...)

# Set Clerk publishable key
wrangler secret put CLERK_PUBLISHABLE_KEY --env production
# Paste your Clerk publishable key (pk_live_...)

# Set Clerk webhook secret
wrangler secret put CLERK_WEBHOOK_SECRET --env production
# Paste your Clerk webhook signing secret (whsec_...)
```

Verify secrets are set:

```bash
wrangler secret list --env production
```

Expected output:
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_WEBHOOK_SECRET`

### 5. Verify Durable Objects Bindings

Ensure `wrangler.toml` includes all Durable Objects:

- [x] `CONTENT_METADATA`
- [x] `USER_PROFILES`
- [x] `PAYMENT_RECORDS`
- [x] `CONTEST_RECORDS`
- [x] `MESSAGE_THREADS`
- [x] `KEY_REGISTRY`

### 6. Verify R2 Bucket Bindings

- [ ] Create production R2 buckets (if not already created):
  - `hashbin-content-prod`
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
   - [ ] Delete account via Clerk Dashboard
   - [ ] Check logs for `user.deleted` webhook

### 5. Monitor Initial Traffic

- [ ] Monitor Cloudflare Workers analytics
- [ ] Check Worker logs for errors
- [ ] Verify webhook deliveries in Clerk Dashboard
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
   - Disable webhook endpoint in Clerk Dashboard
   - This prevents user creation/update/deletion from affecting Worker

3. **Investigate Issues**
   - Check Cloudflare Worker logs
   - Review Clerk Dashboard for errors
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

Configure alerts in Cloudflare Dashboard:

- [ ] Worker error rate > 5%
- [ ] Worker CPU time > 80% of limit
- [ ] Durable Objects storage > 80% of limit
- [ ] R2 requests > expected baseline

### Clerk Monitoring

Monitor in Clerk Dashboard:

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
