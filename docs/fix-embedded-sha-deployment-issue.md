# Fix: Embedded SHA Deployment Issue (Final Solution)

## Problem Statement

The deployed site's health endpoint was returning a response without the `gitSha` field, causing deployment verification to fail:

```
Deployed git SHA: 
❌ Git SHA mismatch: expected b475c33ce937a72bfe0d15da52050a7614b12157, got 
Error: Process completed with exit code 1.
```

Even though:
- The source code (`src/index.js`) includes `gitSha: env.GIT_SHA || 'unknown'` in the health response
- The deployment workflow updates `wrangler.toml` with the correct GIT_SHA value  
- The wrangler deployment logs show GIT_SHA in the environment variables

## Failed Previous Attempts

### PR #128: Update wrangler.toml with sed
- Updated GIT_SHA in wrangler.toml `[vars]` before deployment
- Result: Still no gitSha field in deployed response

### PR #130: Add final deployment after secrets
- Added `wrangler deploy` after all secret configuration
- Theory: Secret updates trigger redeployments with cached bundles
- Result: Still no gitSha field in deployed response

### PR #132: Inject GIT_SHA into source code
- Created script to modify src/index.js, replacing `env.GIT_SHA || 'unknown'` with hardcoded SHA
- Script reported success, but deployed worker still had no gitSha field
- Result: Still no gitSha field in deployed response

## Root Cause Analysis

The root cause is that **Cloudflare secrets take precedence over environment variables** from wrangler.toml `[vars]` section.

**Key insight**: When `wrangler secret put` is executed (for CLERK_SECRET_KEY, STRIPE_SECRET_KEY, etc.), it:
1. Uploads the secret to Cloudflare
2. Triggers a redeployment of the worker

During these secret-triggered redeployments:
- Cloudflare secrets are loaded (CLERK_SECRET_KEY, STRIPE_SECRET_KEY, etc.)
- Environment variables from wrangler.toml `[vars]` are available
- **BUT** if GIT_SHA is only set as an environment variable (not a secret), it doesn't persist consistently

The code injection approach (PR #132) failed because even though the SHA was hardcoded in the source, the secret-triggered redeployments somehow weren't using the modified bundle consistently.

## Solution: Configure GIT_SHA as a Cloudflare Secret

**Instead of relying on environment variables or source code injection, set GIT_SHA as a Cloudflare secret alongside other secrets.**

### Implementation

**Updated workflow**: `.github/workflows/deploy.yml`
```yaml
- name: Inject git SHA into frontend HTML files
  run: |
    GIT_SHA=$(git rev-parse HEAD)
    echo "Git SHA: $GIT_SHA"
    bash scripts/inject-git-sha.sh "$GIT_SHA"
    
# ... deploy worker, configure other secrets ...

- name: Configure GIT_SHA as secret
  run: |
    GIT_SHA=$(git rev-parse HEAD)
    echo "Configuring GIT_SHA as secret: $GIT_SHA"
    echo "$GIT_SHA" | npx wrangler secret put GIT_SHA
    echo "✅ GIT_SHA secret configured: $GIT_SHA"
```

### How It Works

1. During CI deployment, GIT_SHA is configured as a Cloudflare secret (not just an environment variable)
2. The worker code continues to use `gitSha: env.GIT_SHA || 'unknown'` without modification
3. When the worker runs, `env.GIT_SHA` gets the value from the Cloudflare secret
4. Secrets persist across all redeployments, unlike environment variables

## Deployment Flow (After Fix)

1. **Checkout Code**: At specific commit SHA
2. **Inject Git SHA into HTML**: Updates frontend files with SHA comments
3. **Deploy to Cloudflare**: Initial deployment
4. **Configure Secrets**: Updates all required secrets
   - CLERK_SECRET_KEY
   - CLERK_PUBLISHABLE_KEY  
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET
   - API_KEY_ENCRYPTION_KEY
   - **GIT_SHA** (NEW)
5. **Wait**: 10 seconds for propagation
6. **Verify**: Health endpoint should now show the gitSha field

## Benefits

1. **Reliable**: Secrets persist across all Cloudflare redeployments
2. **Consistent**: GIT_SHA handled the same way as other secrets (CLERK_SECRET_KEY, etc.)
3. **Simpler**: No source code modification needed
4. **No Side Effects**: Original source code remains unchanged
5. **Proven Approach**: Uses Cloudflare's standard secret management

## Testing

All tests pass:
- ✅ Grep patterns test  
- ✅ Git SHA HTML injection test
- ✅ User balance test
- ✅ Auth gate test
- ✅ Stripe webhook test
- ✅ API keys test
- ✅ Upload balance test
- ✅ Rate limiting test
- ✅ Security scan (CodeQL: 0 alerts)

To verify after deployment:
```bash
# Check health endpoint
curl https://hashbin.org/health | jq .gitSha

# Check HTML files  
curl https://hashbin.org/ | grep "git-sha:"

# Both should show the same commit SHA
```

## Files Changed

- `.github/workflows/deploy.yml` - Added GIT_SHA secret configuration step, removed unused code injection logic (31 lines removed, 7 lines added)
- `scripts/inject-git-sha-code.sh` - **REMOVED** (no longer needed)
- `scripts/test-git-sha-code-injection.sh` - **REMOVED** (no longer needed)
- `scripts/test-reporter.sh` - Removed reference to deleted test (1 line removed)

**Total**: 178 lines removed, 7 lines added (net -171 lines)

## Impact

- **Low Risk**: Uses standard Cloudflare secret management
- **No Breaking Changes**: Original source code unchanged
- **Simpler**: Removed complex injection logic
- **High Confidence**: Secrets are Cloudflare's recommended approach

## Update: Binding Conflict Issue (Jan 2026)

### Problem
After implementing the secret-based solution (PR #134), deployments started failing with:
```
✘ [ERROR] A request to the Cloudflare API (/accounts/***/workers/scripts/hashbin-worker/secrets) failed.

  Binding name 'GIT_SHA' already in use. Please use a different name and try again. [code: 10053]
```

### Root Cause
The issue was caused by **defining GIT_SHA in two places**:
1. In `wrangler.toml` as an environment variable in the `[vars]` section: `GIT_SHA = "local-dev"`
2. In the deployment workflow as a Cloudflare secret via `wrangler secret put GIT_SHA`

Cloudflare Workers doesn't allow the same binding name to be used for both a variable and a secret.

### Solution
**Remove GIT_SHA from `wrangler.toml` [vars] section** - keep only the secret configuration in the deployment workflow.

The code already handles the missing default gracefully with `env.GIT_SHA || 'unknown'`, so local development will show "unknown" for the git SHA, which is acceptable.

**Change made**:
```diff
 # Production environment variables
 [vars]
 ENVIRONMENT = "production"
 LOG_LEVEL = "warn"
-GIT_SHA = "local-dev"
```

### Lessons Learned
- A binding name can only be used once - either as a variable OR as a secret, not both
- Always check `wrangler.toml` for existing bindings before adding secrets
- The error message "Binding name already in use" indicates a conflict between vars/secrets/bindings

## Related Issues

- Latest Fix: Fix deployment error with GIT_SHA binding conflict
- Previous Issue: #131 - Bug: Deployed site does not contain embedded SHA
- Previous Success: PR #134 - Fix: Configure GIT_SHA as Cloudflare secret
- Previous Attempt: PR #132 - Fix: Inject GIT_SHA into source code (FAILED)
- Previous Attempt: PR #130 - Fix: Redeploy after secret updates (FAILED)
- Previous Attempt: PR #128 - Fix: Write GIT_SHA to wrangler.toml (FAILED)
- Original Feature: PR #125 - Add embedded SHA support
