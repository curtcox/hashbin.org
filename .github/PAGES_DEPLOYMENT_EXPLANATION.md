# GitHub Pages Deployment Fix

## Problem

The build report was being generated and pushed to a `gh-pages` branch successfully, but it wasn't visible on GitHub Pages at `https://curtcox.github.io/hashbin.org/`.

## Root Cause

The workflow was using an older method of deploying to GitHub Pages:
- Using `peaceiris/actions-gh-pages@v3` to push to a separate `gh-pages` branch
- Requiring manual configuration in repository settings to use the `gh-pages` branch
- Required `contents: write` permission

This approach required the repository owner to manually configure GitHub Pages in the repository settings to deploy from the `gh-pages` branch, which apparently wasn't done or wasn't working correctly.

## Solution

Updated to use the modern GitHub Actions native deployment method:

### Changes Made

1. **Workflow Structure** (`.github/workflows/build-report.yml`):
   - Split the report generation and deployment into two separate jobs
   - `generate-report`: Generates the HTML report and uploads it as a Pages artifact
   - `deploy-pages`: Deploys the artifact to GitHub Pages using the official action

2. **New Actions Used**:
   - `actions/upload-pages-artifact@v3`: Uploads the report directory as a Pages artifact
   - `actions/deploy-pages@v4`: Official GitHub action to deploy to Pages

3. **Permissions**:
   - Reduced global `contents` permission from `write` to `read` (more secure)
   - Added job-level permissions for the deploy job: `pages: write` and `id-token: write`
   - Added `environment` configuration pointing to `github-pages`

4. **Documentation Updates**:
   - Updated setup instructions to use "GitHub Actions" as the source
   - Updated troubleshooting guide
   - Added notes about the modern deployment method

## Benefits

1. **Automatic Configuration**: GitHub automatically enables Pages when using `actions/deploy-pages`
2. **No Manual Setup Required**: No need to manually configure the Pages source branch
3. **Better Security**: More restrictive permissions, uses OIDC tokens
4. **Cleaner**: No need for a separate `gh-pages` branch
5. **Official Support**: Uses GitHub's official deployment actions

## How It Works

1. Test jobs run in parallel (linting, unit-tests, integration-tests, api-tests, e2e-tests)
2. Results are saved as artifacts
3. `generate-report` job downloads all artifacts and generates HTML report
4. Report is uploaded as a GitHub Pages artifact
5. `deploy-pages` job deploys the artifact to GitHub Pages
6. GitHub Pages site is automatically updated

## Verification

After merging this PR:
1. The workflow will run automatically on push to `main`
2. Check the Actions tab for successful completion
3. The "Deploy to GitHub Pages" job will show the deployment URL
4. Visit `https://curtcox.github.io/hashbin.org/` to see the build report

## References

- [GitHub Pages Action](https://github.com/actions/deploy-pages)
- [Upload Pages Artifact](https://github.com/actions/upload-pages-artifact)
- [GitHub Pages Documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
