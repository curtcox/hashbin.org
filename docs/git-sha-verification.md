# Git SHA Verification Feature

## Overview

This feature embeds the git commit SHA in both the `/health` API endpoint and as HTML comments in all frontend HTML files. This enables verification that the deployed version matches the expected commit.

## Components

### 1. Git SHA Injection Script

**Location**: `scripts/inject-git-sha.sh`

This script:
- Takes a git SHA as an argument (or uses `git rev-parse HEAD` if none provided)
- Finds all `.html` files in the `frontend/` directory
- Injects or updates a comment in the format: `<!-- git-sha: <SHA> -->`
- Places the comment after the `<!DOCTYPE>` declaration if present, otherwise at the beginning of the file

**Usage**:
```bash
bash scripts/inject-git-sha.sh [SHA]
```

**Example**:
```bash
# Use current HEAD SHA
bash scripts/inject-git-sha.sh

# Use specific SHA
bash scripts/inject-git-sha.sh abc123def456...
```

### 2. Health Endpoint Enhancement

**Location**: `src/index.js` - `handleHealth()` function

The health endpoint now includes a `gitSha` field in its response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-17T15:30:00.000Z",
  "environment": "production",
  "gitSha": "7fb28c1efd569fd715c040eeb16bcb007d999dd8",
  "checks": { ... },
  "summary": { ... }
}
```

The SHA is read from the `env.GIT_SHA` environment variable.

### 3. Deployment Workflow Integration

**Location**: `.github/workflows/deploy.yml`

The deployment workflow has been enhanced with:

1. **Git SHA Injection Step** (before deployment):
   ```yaml
   - name: Inject git SHA into frontend and wrangler config
     run: |
       GIT_SHA=$(git rev-parse HEAD)
       echo "Git SHA: $GIT_SHA"
       bash scripts/inject-git-sha.sh "$GIT_SHA"
       
       # Update GIT_SHA in wrangler.toml
       echo "Updating wrangler.toml with GIT_SHA..."
       sed -i "s/^GIT_SHA = .*/GIT_SHA = \"$GIT_SHA\"/" wrangler.toml
       
       # Verify the update
       echo "Updated wrangler.toml [vars] section:"
       grep -A 3 "\[vars\]" wrangler.toml
   ```

2. **Deployment with SHA Variable**:
   ```yaml
   - name: Deploy to Cloudflare Workers
     run: |
       GIT_SHA=$(git rev-parse HEAD)
       echo "Deploying with git SHA: $GIT_SHA"
       npx wrangler deploy
   ```
   
   Note: The GIT_SHA is set in wrangler.toml before deployment rather than passed as a command-line argument. This ensures the variable is properly persisted in the Worker configuration.

3. **Health Endpoint Verification**:
   - Verifies the deployed SHA in the `/health` endpoint matches the expected SHA
   - Fails the deployment if there's a mismatch

4. **HTML SHA Verification**:
   - Fetches the index page and checks for the SHA in HTML comments
   - Ensures frontend files were properly deployed with the SHA

### 4. Smoke Test Integration

**Location**: `.github/workflows/smoke-test.yml`

Two new smoke test steps:

1. **Test - Git SHA in Health Endpoint**:
   - Verifies `gitSha` field is present in the health response
   - Ensures it's not "unknown" or empty

2. **Test - Git SHA in HTML Comments**:
   - Fetches the index page
   - Verifies the SHA comment matches the deployed SHA from health endpoint

### 5. Configuration

**Location**: `wrangler.toml`

Added a default `GIT_SHA` variable for local development:

```toml
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "warn"
GIT_SHA = "local-dev"
```

This is overridden during deployment with the actual commit SHA.

## Testing

### Automated Tests

**Location**: `scripts/test-git-sha-injection.sh`

Tests cover:
1. SHA injection into files with DOCTYPE declarations
2. SHA injection into files without DOCTYPE declarations
3. Updating existing SHA comments (no duplicates)
4. Ensuring only one SHA comment per file

Run tests:
```bash
npm run test:gitsha
# or
npm test  # Includes all tests
```

### Manual Verification

After deployment, you can verify the feature:

```bash
# Check health endpoint
curl https://hashbin.org/health | jq '.gitSha'

# Check HTML files
curl https://hashbin.org/ | head -3
```

Expected output:
```html
<!DOCTYPE html>
<!-- git-sha: 7fb28c1efd569fd715c040eeb16bcb007d999dd8 -->
<html lang="en">
```

## How It Works

### Deployment Flow

1. **Pre-deployment**:
   - CI captures the current git SHA using `git rev-parse HEAD`
   - The `inject-git-sha.sh` script runs and adds SHA comments to all HTML files
   - The git SHA is written to the `GIT_SHA` variable in `wrangler.toml`
   - Modified HTML files and wrangler.toml are included in the deployment bundle

2. **Deployment**:
   - Wrangler deploys the Worker with the updated `wrangler.toml` configuration
   - This sets the `GIT_SHA` environment variable in the Worker runtime via the [vars] section
   - HTML files with SHA comments are deployed to the ASSETS binding

3. **Verification**:
   - CI calls `/health` endpoint and extracts the `gitSha` field
   - CI compares the deployed SHA with the expected SHA (from git)
   - CI fetches the index page and verifies the SHA comment is present
   - Deployment fails if any SHA mismatch is detected

### Why Both Health Endpoint and HTML Comments?

- **Health Endpoint**: Provides programmatic verification of the Worker code version
- **HTML Comments**: Provides verification of the frontend assets version
- **Together**: Ensures both the backend Worker and frontend assets are from the same commit

This is important because:
1. Workers and Assets are deployed together but could theoretically get out of sync
2. Cloudflare's edge network caches assets separately from Worker code
3. Having both allows detection of partial deployment issues

## Benefits

1. **Deployment Verification**: Automatically verify the correct version was deployed
2. **Debugging**: Quickly identify which version is running in production
3. **Audit Trail**: Git SHA provides an immutable reference to exact code state
4. **Confidence**: Catch deployment issues before they affect users
5. **Troubleshooting**: When issues arise, immediately know which commit to investigate

## Maintenance

### Adding New HTML Files

New HTML files will automatically get the SHA comment on the next deployment. No manual action required.

### Updating the Injection Script

If you need to modify how the SHA is injected:
1. Update `scripts/inject-git-sha.sh`
2. Run the tests: `npm run test:gitsha`
3. Verify existing HTML files still work correctly

### Local Development

During local development with `wrangler dev`, the health endpoint will show:
```json
{
  "gitSha": "local-dev",
  ...
}
```

This is expected and defined in `wrangler.toml`.

## Troubleshooting

### SHA shows as "unknown"

**Cause**: The `GIT_SHA` environment variable wasn't set during deployment.

**Solution**: Ensure the pre-deployment step successfully updated `wrangler.toml` with the git SHA. Check the deployment logs for "Updating wrangler.toml with GIT_SHA..." output.

### SHA shows as "local-dev"

**Cause**: The deployment is using the default value from `wrangler.toml` without updating it.

**Solution**: Verify that the "Inject git SHA into frontend and wrangler config" step ran successfully and updated the `GIT_SHA` value in `wrangler.toml` before deployment.

### SHA mismatch after deployment

**Cause**: Multiple commits happened between injection and deployment, or git state changed.

**Solution**: This is a sign of an inconsistent deployment. The CI will fail and prevent this from reaching production. Retry the deployment.

### HTML files don't show SHA

**Cause**: The injection script didn't run, or HTML files are cached.

**Solution**: 
1. Verify the "Inject git SHA into frontend and wrangler config" step ran in CI
2. Check browser cache - do a hard refresh
3. Check the deployment logs for any errors

## Future Enhancements

Potential improvements:
- Add deployment timestamp alongside SHA
- Include branch name in the comment
- Expose SHA via a dedicated `/version` endpoint
- Add SHA to JavaScript bundle (if a build step is added in the future)
