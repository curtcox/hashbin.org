# Fix: Embedded SHA Deployment Issue

## Problem Statement

The deployed site's health endpoint was returning a response without the `gitSha` field, even though:
- The source code (`src/index.js`) includes `gitSha: env.GIT_SHA || 'unknown'` in the health response
- The deployment workflow updates `wrangler.toml` with the correct GIT_SHA value
- The wrangler deployment logs show GIT_SHA in the environment variables

## Root Cause Analysis

### Issue
When `wrangler secret put` commands are executed after the initial `wrangler deploy`, each secret update triggers a redeployment of the worker. These triggered redeployments may:
1. Use cached or previous versions of the code
2. Not include the modifications made to `wrangler.toml` before the initial deployment
3. Result in the deployed worker running code that differs from the git repository

### Evidence from CI Logs (Run 21097526577)
```
1. Git SHA successfully injected into HTML files ✓
2. wrangler.toml successfully updated with GIT_SHA ✓
3. npx wrangler deploy completed ✓
4. env.GIT_SHA shown in deployment bindings ✓
5. npx wrangler secret put CLERK_SECRET_KEY (triggers redeploy)
6. npx wrangler secret put CLERK_PUBLISHABLE_KEY (triggers redeploy)
7. npx wrangler secret put STRIPE_SECRET_KEY (triggers redeploy)
8. npx wrangler secret put STRIPE_WEBHOOK_SECRET (triggers redeploy)
9. npx wrangler secret put API_KEY_ENCRYPTION_KEY (triggers redeploy)
10. Health check shows NO gitSha field ✗
```

After 5 secret updates (each triggering a redeployment), the final deployed code was not the version from step 3.

## Solution

Add a final `wrangler deploy` step after all secret configuration is complete. This ensures:
- All secrets are configured in the worker
- The final deployed code matches the git repository exactly
- The `wrangler.toml` modifications (including GIT_SHA) are preserved

### Implementation

In `.github/workflows/deploy.yml`, added after the "Configure API key encryption secret" step:

```yaml
- name: Final deployment to restore correct code and configuration
  run: |
    echo "Re-deploying to ensure correct code and GIT_SHA after secret updates..."
    npx wrangler deploy
    echo "✅ Final deployment complete"
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## Deployment Flow (After Fix)

1. **Inject Git SHA**: Updates HTML files and `wrangler.toml` with current commit SHA
2. **Create R2 Buckets**: Ensures storage buckets exist
3. **Initial Deployment**: Deploys worker with correct code and GIT_SHA ✓
4. **Configure Secrets**: Updates all required secrets (5 separate operations, each triggers redeploy)
5. **Final Deployment**: Re-deploys worker with correct code and GIT_SHA ✓ (NEW STEP)
6. **Wait**: 10 seconds for propagation
7. **Verify**: Check health endpoint has correct gitSha field

## Verification

After the fix is deployed, the verification step will confirm:
- ✅ Health endpoint returns HTTP 200
- ✅ Health response includes `gitSha` field  
- ✅ gitSha value matches the deployed commit SHA (from `git rev-parse HEAD`)
- ✅ HTML files contain correct `<!-- git-sha: <SHA> -->` comment

## Alternative Solutions Considered

### Option 1: Configure Secrets Before Initial Deployment
**Rejected**: Cannot configure secrets for a worker that doesn't exist yet.

### Option 2: Use Environment Variables Instead of Vars
**Rejected**: Would require secrets for a build-time value (git SHA), which is not appropriate.

### Option 3: Pass GIT_SHA as --var Flag
**Previously Attempted**: This was tried in PR #127 but didn't persist through secret updates.

### Option 4: Don't Use Secret Put, Use Wrangler.toml Secrets
**Rejected**: Wrangler.toml cannot contain secret values (they must be configured separately).

## Impact

- **Low Risk**: The final deployment step is identical to the initial deployment
- **No Breaking Changes**: Secrets remain configured throughout the process
- **Minimal Added Time**: ~5-10 seconds for the additional deployment
- **High Confidence**: Ensures deployed code always matches the git repository

## Related Issues

- Original Issue: #129 - Bug: Deployed site does not contain embedded SHA
- Previous Fix Attempt: PR #128 - Fix: Write GIT_SHA to wrangler.toml instead of using --var flag
- Earlier Attempt: PR #127 - Feature: Embed git SHA in health check and HTML pages
- Related: PR #125 - Feature: Add embedded SHA support to health endpoint

## Testing

To test this fix:
1. Trigger a deployment to main branch
2. Monitor CI logs for "Final deployment to restore correct code and configuration"
3. Check health endpoint: `curl https://hashbin.org/health | jq .gitSha`
4. Verify HTML files: `curl https://hashbin.org/ | grep "git-sha:"`

Both should show the commit SHA from the deployment.
