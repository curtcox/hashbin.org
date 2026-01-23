# Clerk Production Setup - Remaining Work

## Status

**Phase:** Phase 3 - Production Deployment
**Dependencies:** Backend complete (see `done/clerk.md`)

---

## Remaining Tasks

All remaining work is related to **production deployment and configuration**, not implementation.

### 1. Clerk Production Dashboard Configuration 🔴

**Status:** Not started

**What's Needed:**
1. Log into [Clerk Dashboard](https://dashboard.clerk.com)
2. Select/create production instance for hashbin.org
3. Configure OAuth providers with production credentials:
   - Google OAuth credentials
   - Apple Sign-In credentials
   - Microsoft OAuth credentials
   - GitHub OAuth credentials (optional)
4. Add `hashbin.org` as allowed domain
5. Configure CORS settings for `https://hashbin.org`
6. Set up webhook endpoint: `https://hashbin.org/api/webhooks/clerk`
7. Subscribe to webhook events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
8. Copy production keys and secrets

**Deliverables:**
- [ ] Production Clerk instance configured
- [ ] OAuth providers configured with production credentials
- [ ] Domain `hashbin.org` whitelisted
- [ ] Webhook endpoint configured
- [ ] Production keys documented:
  - `CLERK_SECRET_KEY` (`sk_live_XXXXX`)
  - `CLERK_PUBLISHABLE_KEY` (`pk_live_XXXXX`)
  - `CLERK_WEBHOOK_SECRET` (`whsec_XXXXX`)

---

### 2. GitHub Secrets Configuration 🔴

**Status:** Not started

**What's Needed:**

Per Architectural Decision #21, all secrets must be stored in GitHub and deployed via CI/CD.

1. Add secrets in GitHub repository settings:
   - Go to Settings > Secrets and variables > Actions
   - Add repository secrets:

| Secret Name | Value Source | Example Format |
|-------------|--------------|----------------|
| `CLERK_SECRET_KEY` | Clerk Dashboard > API Keys | `sk_live_...` |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard > API Keys | `pk_live_...` |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard > Webhooks | `whsec_...` |

2. Verify deployment workflow deploys these secrets

**Current deployment workflow** (`.github/workflows/deploy.yml`) must include secret deployment step.

**Acceptance Criteria:**
- [ ] All three Clerk secrets added to GitHub
- [ ] Deployment workflow deploys secrets to Cloudflare
- [ ] Health endpoint confirms secrets configured: `curl -s https://hashbin.org/health | jq '.checks.clerk.details'`

---

### 3. End-to-End Production Testing 🟡

**Status:** Not started - depends on #1 and #2

**What's Needed:**

### 3.1 Health Endpoint Verification

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
    "webhookSecretConfigured": true
  }
}
```

### 3.2 Authentication Flow Tests

| Test | Expected | Status |
|------|----------|--------|
| Visit https://hashbin.org | Landing page loads | [ ] |
| Click "Login" | Redirects to Clerk | [ ] |
| Complete OAuth (Google) | Returns to hashbin.org | [ ] |
| Check session | `/api/auth/session` returns user info | [ ] |
| Visit dashboard | Shows authenticated state | [ ] |
| Check balance | `/api/balance` returns balance | [ ] |
| Logout | Session cleared, returns to landing | [ ] |

### 3.3 Webhook Tests

| Test | Expected | Status |
|------|----------|--------|
| Create new user | Webhook creates UserProfile | [ ] |
| Update user profile | Webhook updates UserProfile | [ ] |
| Delete user | Webhook soft-deletes profile | [ ] |

### 3.4 Smoke Test Verification

```bash
# Manually trigger smoke test workflow
gh workflow run smoke-test.yml --field environment=production
```

Expected: All tests pass

**Acceptance Criteria:**
- [ ] Health endpoint shows Clerk operational
- [ ] Login flow works end-to-end in production
- [ ] Session management works correctly
- [ ] Webhooks create/update/delete UserProfiles
- [ ] Smoke tests pass for production environment
- [ ] All OAuth providers work (Google, Apple, Microsoft, GitHub)

---

### 4. Frontend Configuration Verification 🟡

**Status:** Not verified

**What's Needed:**

Verify publishable key is correctly injected into frontend. Current options:
1. Worker injects it into HTML responses
2. Use a `/config.js` endpoint that returns runtime config
3. Environment-specific builds

**Verification:**
```bash
# Check if key is available in frontend
curl -s https://hashbin.org/index.html | grep CLERK_PUBLISHABLE_KEY
```

**Acceptance Criteria:**
- [ ] `CLERK_PUBLISHABLE_KEY` is available to frontend JavaScript
- [ ] Clerk SDK initializes correctly
- [ ] Login/logout flows work in browser

---

## Priority

1. **Critical:** Clerk dashboard configuration (#1) - Required for production auth
2. **Critical:** GitHub secrets configuration (#2) - Required for deployment
3. **High:** End-to-end testing (#3) - Verify production readiness
4. **Medium:** Frontend verification (#4) - Ensure user experience works

---

## Completion Criteria

All items below must be completed before marking Clerk implementation fully done:

- [ ] Clerk production instance configured in dashboard
- [ ] OAuth providers configured with production credentials
- [ ] Webhook endpoint configured and tested
- [ ] GitHub secrets added (CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, CLERK_WEBHOOK_SECRET)
- [ ] Deployment workflow deploys secrets to Cloudflare
- [ ] Health endpoint shows Clerk operational in production
- [ ] End-to-end login flow tested and working
- [ ] Smoke tests pass in production
- [ ] All OAuth providers verified (Google, Apple, Microsoft, GitHub)

---

## Notes

- Backend implementation is 100% complete (see `done/clerk.md`)
- All remaining work is deployment and configuration
- No code changes required
- Smoke test workflow already in place for ongoing monitoring

---

## References

- Backend implementation: `done/clerk.md`
- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Dashboard](https://dashboard.clerk.com)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

---

**Document Version:** 1.0
**Created:** 2026-01-23
**Last Updated:** 2026-01-23
