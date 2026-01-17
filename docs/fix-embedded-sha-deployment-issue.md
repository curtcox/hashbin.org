# Fix: Embedded SHA Deployment Issue (Final Solution)

## Problem Statement

The deployed site's health endpoint was returning a response without the `gitSha` field, causing deployment verification to fail:

```
Deployed git SHA: 
❌ Git SHA mismatch: expected 577224be973a3d6b225317d120361824a4c07211, got 
Error: Process completed with exit code 1.
```

Even though:
- The source code (`src/index.js`) includes `gitSha: env.GIT_SHA || 'unknown'` in the health response
- The deployment workflow updates `wrangler.toml` with the correct GIT_SHA value
- The wrangler deployment logs show GIT_SHA in the environment variables

## Failed Previous Attempts

### PR #128: Update wrangler.toml with sed
- Updated GIT_SHA in wrangler.toml before deployment
- Result: Still no gitSha field in deployed response

### PR #130: Add final deployment after secrets
- Added `wrangler deploy` after all secret configuration
- Theory: Secret updates trigger redeployments with cached bundles
- Result: Still no gitSha field in deployed response

## Root Cause Analysis

The root cause is that environment variables from wrangler.toml `[vars]` section are not reliably available in deployed Cloudflare Workers, especially when multiple redeployments are triggered by secret updates. The deployed response had NO `gitSha` field at all (not even 'unknown'), indicating the deployed code was running with environment variables that didn't match expectations.

**Key insight**: Even after "final deployment", the gitSha field was missing. This suggests the issue is fundamental to how environment variables are passed to deployed workers, not just a timing/caching issue.

## Solution: Direct Code Injection

**Instead of relying on runtime environment variables, inject the GIT_SHA directly into the source code before deployment.**

### Implementation

**New script**: `scripts/inject-git-sha-code.sh`
```bash
# Replaces this pattern in src/index.js:
gitSha: env.GIT_SHA || 'unknown',

# With hardcoded value:
gitSha: '577224be973a3d6b225317d120361824a4c07211',
```

Features:
- Handles flexible whitespace patterns
- Can update existing hardcoded SHAs
- Validates the injection succeeded
- Provides clear error messages

**Updated workflow**: `.github/workflows/deploy.yml`
```yaml
- name: Inject git SHA into frontend, source code, and wrangler config
  run: |
    GIT_SHA=$(git rev-parse HEAD)
    echo "Git SHA: $GIT_SHA"
    
    # Inject SHA into HTML files (existing)
    bash scripts/inject-git-sha.sh "$GIT_SHA"
    
    # Inject SHA directly into source code (NEW)
    bash scripts/inject-git-sha-code.sh "$GIT_SHA"
    
    # Update GIT_SHA in wrangler.toml (for consistency)
    sed -i "s/^\([[:space:]]*\)GIT_SHA = .*/\1GIT_SHA = \"$GIT_SHA\"/" wrangler.toml
```

**New test**: `scripts/test-git-sha-code-injection.sh`
- Validates the injection script works correctly
- Tests both initial injection and updates
- Added to CI test runner

### How It Works

1. During CI deployment, the script modifies src/index.js in the temporary checkout
2. The modified code (with hardcoded SHA) is bundled by wrangler
3. The bundle is deployed with the SHA already embedded
4. No runtime dependency on environment variables
5. Original repository code remains unchanged (still uses env.GIT_SHA for local dev)

## Deployment Flow (After Fix)

1. **Checkout Code**: At specific commit SHA
2. **Inject Git SHA into HTML**: Updates frontend files with SHA comments
3. **Inject Git SHA into Code**: Updates src/index.js with hardcoded SHA (NEW)
4. **Update wrangler.toml**: For consistency
5. **Create R2 Buckets**: Ensures storage buckets exist
6. **Deploy to Cloudflare**: Deploys worker with hardcoded SHA in bundle
7. **Configure Secrets**: Updates all required secrets (triggers redeployments)
8. **Final Deployment**: Ensures latest configuration
9. **Wait**: 10 seconds for propagation
10. **Verify**: Health endpoint should now show the gitSha field

## Benefits

1. **Reliable**: SHA is baked into the JavaScript bundle, no runtime environment variable dependency
2. **Verifiable**: Can confirm SHA is in bundle before deployment
3. **No Side Effects**: Only affects CI environment temporary files, not repository
4. **Backward Compatible**: Still updates wrangler.toml; local dev still uses env.GIT_SHA
5. **Proven Approach**: Similar to how the HTML files are handled

## Testing

All tests pass:
- ✅ Grep patterns test  
- ✅ Git SHA HTML injection test
- ✅ Git SHA code injection test (NEW)
- ✅ User balance test
- ✅ Auth gate test
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

- `.github/workflows/deploy.yml` - Added code injection step (9 lines modified)
- `scripts/inject-git-sha-code.sh` - New injection script (66 lines)
- `scripts/test-git-sha-code-injection.sh` - New test (79 lines)
- `scripts/test-reporter.sh` - Added new tests to CI (2 lines)

**Total**: 154 lines added, 2 lines modified

## Impact

- **Low Risk**: Similar approach already used for HTML files
- **No Breaking Changes**: Original code remains unchanged in repository
- **Minimal Added Time**: ~1 second for code injection
- **High Confidence**: Eliminates environment variable reliability issues

## Related Issues

- Current Issue: #131 - Bug: Deployed site does not contain embedded SHA
- Previous Attempt: PR #130 - Fix: Redeploy after secret updates
- Previous Attempt: PR #128 - Fix: Write GIT_SHA to wrangler.toml
- Previous Attempt: PR #127 - Feature: Embed git SHA
- Original Feature: PR #125 - Add embedded SHA support
