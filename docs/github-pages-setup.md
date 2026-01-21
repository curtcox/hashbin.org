# GitHub Pages Build Report Setup

This document explains how to enable and access the automated build reports published to GitHub Pages.

## Overview

The Build Report workflow (`.github/workflows/build-report.yml`) automatically generates and publishes HTML build reports to GitHub Pages whenever the `main` branch is updated. The report includes:

- Status of all test jobs (linting, unit tests, integration tests, API tests, E2E tests)
- Visual indicators: ✅ for passing tests, ❌ for failing tests
- Color-coded backgrounds:
  - **White** - All tests passing
  - **Yellow** - 1 test failing
  - **Red** - 2+ tests failing
- Detailed pages for each test job with full output
- Git SHA and timestamp of the build
- Links back to the GitHub Actions run

## Enable GitHub Pages

To enable GitHub Pages for this repository:

1. Go to your repository on GitHub
2. Click **Settings** in the top navigation
3. Scroll down to the **Pages** section in the left sidebar
4. Under **Source**, select:
   - **Source**: GitHub Actions
5. Click **Save** (if available)

After a few minutes, your GitHub Pages site will be live at:
```
https://[username].github.io/[repository-name]/
```

For this repository:
```
https://curtcox.github.io/hashbin.org/
```

**Note**: The workflow now uses the modern GitHub Actions deployment method with `actions/upload-pages-artifact` and `actions/deploy-pages`. This is the recommended approach as of 2024 and does not require a separate `gh-pages` branch.

## Workflow Trigger

The build report workflow is triggered:
- Automatically on every push to the `main` branch
- Manually via workflow dispatch in the GitHub Actions UI

## Accessing the Report

Once GitHub Pages is enabled and the workflow has run at least once:

1. **Via GitHub Pages URL**: Navigate to `https://[username].github.io/[repository-name]/`
2. **Via GitHub Actions**: 
   - Go to the **Actions** tab in your repository
   - Click on a completed "Build Report" workflow run
   - The workflow summary will include a link to the published report

## Report Structure

The generated report includes:

### Main Page (`index.html`)
- Summary of all test jobs with pass/fail status
- Links to detailed pages for each job
- Metadata: repository, commit SHA, generation time, run ID
- Background color indicates overall health

### Detail Pages (e.g., `linting.html`, `unit-tests.html`)
- Full output and logs for each test job
- Status indicator
- Link back to main report
- Same metadata as main page

## Workflow Jobs

The build report includes the following jobs:

1. **Linting** - JavaScript syntax validation
2. **Unit Tests** - Grep pattern tests
3. **Integration Tests** - Git SHA injection tests
4. **API Tests** - Full API test suite (runs against local server)
5. **E2E Tests** - Auth gate and user balance tests

## Troubleshooting

### Pages Not Showing Up
- Ensure GitHub Pages is enabled and set to "GitHub Actions" as the source
- Check that the workflow completed successfully in the Actions tab
- Look for the "Deploy to GitHub Pages" job and verify it succeeded
- Check the environment URL in the deployment job for the actual Pages URL

### 404 Error
- Wait a few minutes after the first deployment
- Verify the Build Report workflow has run at least once after enabling Pages
- Check that the "deploy-pages" job completed successfully
- Ensure the Pages source is set to "GitHub Actions" not "Deploy from a branch"

### Old Reports
- Each workflow run overwrites the previous report
- Only the latest build report is available
- Check the timestamp on the report to verify it's current

### Deployment Fails
- Check that the repository has GitHub Pages enabled
- Verify that the workflow has `pages: write` and `id-token: write` permissions
- Ensure the `github-pages` environment is configured (GitHub creates this automatically)

## Customization

To modify the report:

1. Edit the "Generate HTML report" step in `.github/workflows/build-report.yml`
2. Adjust the HTML templates, styling, or logic as needed
3. Test locally by running the report generation script manually
4. Commit and push to trigger a new build

## Security

The workflow uses:
- `GITHUB_TOKEN` (automatically provided by GitHub Actions)
- No additional secrets required for basic operation
- The deployment uses the official GitHub Pages deployment actions
- Permissions are scoped to only what's needed: `pages: write` and `id-token: write`

## Limitations

- Only the latest build report is retained
- Historical reports are not stored
- The report is static HTML (no server-side processing)
- Links to GitHub Actions runs require repository access
