# HashBin.org Deployment Guide

This guide provides complete instructions for deploying a fork of HashBin.org to a new domain using Cloudflare Workers, Durable Objects, and R2 Storage.

For the current repository, use the [API/CLI deployment checklist](../todo/deployment_setup.md)
and the current [Cloudflare](../todo/cost_safety_cloudflare.md),
[Stripe](../todo/cost_safety_stripe.md) and [Clerk](../todo/clerk_remaining.md)
plans first. Prefer documented APIs/SDKs, Wrangler and GitHub CLI/Actions for
configuration and verification. Dashboard recipes below are fallbacks for
specific operations unavailable through supported APIs; record the missing
capability/entitlement before using them. Older environment examples must be
checked against the current workflow/config. Browser login/payment acceptance
still tests the real customer journey.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step 1: Fork the Repository](#step-1-fork-the-repository)
- [Step 2: Configure for Your Domain](#step-2-configure-for-your-domain)
- [Step 3: Set Up Cloudflare Account](#step-3-set-up-cloudflare-account)
- [Step 4: Configure GitHub Secrets](#step-4-configure-github-secrets)
- [Step 5: Deploy](#step-5-deploy)
- [Step 6: Configure Custom Domain](#step-6-configure-custom-domain)
- [Verification and Testing](#verification-and-testing)
- [Troubleshooting](#troubleshooting)
- [Manual Deployment](#manual-deployment)
- [Architecture Details](#architecture-details)

## Architecture Overview

HashBin.org is deployed on Cloudflare's edge computing platform:

- **Cloudflare Workers**: Serverless compute for handling HTTP requests
- **Durable Objects**: Stateful coordination for metadata, users, payments, contests, and messages
- **R2 Storage**: Object storage for content and backups
- **GitHub Actions**: Automated CI/CD pipeline

### Environment and Workers

There is a single environment: production. Every push to `main` runs the tests and then
deploys three Workers (`.github/workflows/deploy.yml`):

| Worker | Config | Serves | R2 bucket |
|--------|--------|--------|-----------|
| `hashbin-worker-prod` | `wrangler.toml` | `hashbin.org` (API, frontend assets, cron) | `hashbin-content-256t-prod`, `hashbin-backups-prod` |
| `256t-content-prod` | `workers/256t-content/wrangler.toml` | `256t.us` (content downloads) | `hashbin-content-256t-prod` |
| `hashbin-run-prod` | `workers/run-origin/wrangler.toml` | `hashbin.app` (hosted sandbox origins) | `hashbin-content-256t-prod` |

Each has a matching `wrangler.local.toml` for `npm run dev:local`. The authoritative list of
Durable Object classes and bindings is `wrangler.toml`.

## Prerequisites

Before deploying, ensure you have:

### 1. Cloudflare Account

- **Workers Paid Plan** ($5/month minimum)
- **Durable Objects** enabled (included with Workers Paid)
- **R2 Storage** enabled (included with Workers Paid)

Sign up at [cloudflare.com](https://www.cloudflare.com/)

### 2. Domain Name

- A domain you own (e.g., `yourdomain.com`)
- Ability to change DNS nameservers

### 3. GitHub Account

- Access to fork repositories
- Ability to configure repository secrets

### 4. Local Development Tools (optional)

- Node.js 22+ (for local testing)
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)

## Step 1: Fork the Repository

1. Go to [github.com/curtcox/hashbin.org](https://github.com/curtcox/hashbin.org)
2. Click the **Fork** button in the top-right corner
3. Choose your GitHub account or organization
4. The repository will be copied to your account

Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/hashbin.org.git
cd hashbin.org
```

## Step 2: Configure for Your Domain

Update the configuration files to use your domain instead of `hashbin.org`.

### Update the Wrangler configs

Edit the top-level `routes`, `CONTENT_DOMAIN` and `RUN_DOMAIN` in `wrangler.toml`, and the
`routes` in `workers/256t-content/wrangler.toml` and `workers/run-origin/wrangler.toml`:

```toml
routes = [
  { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

Optionally rename the Workers (`name`) and R2 buckets (`bucket_name`) in all three files;
keep the bucket names consistent, since the Workers share the content bucket.

### Commit Your Changes

```bash
git add wrangler.toml
git commit -m "Configure deployment for yourdomain.com"
git push origin main
```

## Step 3: Set Up Cloudflare Account

### 3.1: Add Your Domain to Cloudflare

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Add a Site**
3. Enter your domain name (e.g., `yourdomain.com`)
4. Select the **Free** plan (or paid plan if desired)
5. Click **Add Site**

Cloudflare will scan your existing DNS records.

### 3.2: Update Nameservers

Cloudflare will provide you with two nameservers like:
- `ravi.ns.cloudflare.com`
- `tani.ns.cloudflare.com`

Update your domain's nameservers at your domain registrar:
1. Log into your domain registrar (GoDaddy, Namecheap, etc.)
2. Find DNS or Nameserver settings
3. Replace existing nameservers with Cloudflare's nameservers
4. Save changes

**Note**: DNS propagation can take 24-48 hours but usually completes within 1-2 hours.

### 3.3: Upgrade to Workers Paid Plan

1. In Cloudflare Dashboard, click **Workers & Pages**
2. Click **Purchase Workers Paid**
3. Complete payment setup ($5/month)
4. This enables:
   - Unlimited Workers requests
   - Durable Objects
   - R2 Storage (10GB free, $0.015/GB after)

### 3.4: Get Your Account ID

1. Still in **Workers & Pages** section
2. Look at the right sidebar
3. Copy your **Account ID**
   - Format: `1234567890abcdef1234567890abcdef` (32 characters)
   - Save this for later

### 3.5: Create API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Click **Create Custom Token**
4. Configure the token:

**Token Name**: `GitHub Actions - HashBin Deploy`

**Permissions** (click Add More to add each):
- Account → Workers Scripts → Edit
- Account → Workers KV Storage → Edit
- Account → Workers R2 Storage → Edit
- Account → Account Settings → Read
- Zone → Workers Routes → Edit *(if using custom domain)*
- Zone → Cache Purge → Purge *(required for cache invalidation on deploy)*

**Account Resources**:
- Include → *Your Account*

**Zone Resources** *(if using custom domain)*:
- Include → Specific Zone → `yourdomain.com`

**IP Address Filtering**: Leave blank

**TTL**: Leave blank (token never expires)

5. Click **Continue to Summary**
6. Click **Create Token**
7. **IMPORTANT**: Copy the token immediately - you cannot view it again!
   - Format: `abc123def456ghi789...` (variable length)
   - Save this securely

### 3.6: Configure Worker Secrets

The deploy workflow's "Verify required secrets" step fails unless these GitHub secrets exist,
before any Cloudflare writes (only runtime secrets are pushed to the Worker):

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (production live keys)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: payments (Stripe Tax must be activated;
  checkouts use automatic tax)
- `OAUTH_SIGNING_KEY`, `DOWNLOAD_TOKEN_SECRET`: also pushed to the 256t.us Worker, which must
  share both values. `DOWNLOAD_TOKEN_SECRET` signs API keys, admin keys and download tokens, so
  changing it invalidates all of them.

The preflight also requires `ADMIN_USER_ID`, `CLERK_WEBHOOK_SECRET` and
`CLOUDFLARE_ANALYTICS_TOKEN`. Set them as GitHub secrets; the workflow publishes them to the
main Worker. `ALERT_WEBHOOK_URL` remains optional, but live alert delivery is a launch
acceptance item. Details:

- `ADMIN_USER_ID`: the admin's Clerk user ID; that sign-in holds every admin scope and issues
  scoped admin keys (`/admin/keys.html`)
- `API_KEY_ENCRYPTION_KEY` is no longer used (keys are stored as hashes only); delete it with
  `wrangler secret delete API_KEY_ENCRYPTION_KEY`
- `CLERK_WEBHOOK_SECRET`: Clerk webhook signing secret. Use authorized webhook management APIs
  where available; the [Clerk plan](../todo/clerk_remaining.md#2-webhook-and-secret-provisioning)
  documents the managed Svix access check and specific UI fallback. Configure the endpoint
  `https://hashbin.org/api/webhooks/clerk` with events `user.created`, `user.updated`, `user.deleted`.
  Deleting a user in Clerk then deletes their HashBin profile and disables their API keys.
- `ALERT_WEBHOOK_URL`: where operator alerts are pushed (a Slack or Discord incoming webhook works
  directly). Test with `POST /api/admin/alerts/test`.
- `CLOUDFLARE_ANALYTICS_TOKEN`: a read-only Account Analytics token for cost monitoring
  ([cost safety](cost-safety.md))

Generate the OAuth signing key value:

```bash
./scripts/generate-oauth-signing-key.sh
```

Copy the generated value and store it as a GitHub repository secret named `OAUTH_SIGNING_KEY`.
Generate a different random value for `DOWNLOAD_TOKEN_SECRET` (for example `openssl rand -base64 48`).
The deployment pipeline will automatically publish it to Cloudflare Worker secrets.

If you need to set secrets manually with Wrangler:

```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_PUBLISHABLE_KEY
wrangler secret put OAUTH_SIGNING_KEY
wrangler secret put DOWNLOAD_TOKEN_SECRET
wrangler secret put OAUTH_SIGNING_KEY --config workers/256t-content/wrangler.toml
wrangler secret put DOWNLOAD_TOKEN_SECRET --config workers/256t-content/wrangler.toml
```

For `OAUTH_SIGNING_KEY` and `DOWNLOAD_TOKEN_SECRET`, use a high-entropy random value (for example, 32+ bytes).
Do not commit this value to source control.

## Step 4: Configure GitHub Secrets

GitHub Secrets store sensitive credentials securely.

1. Go to your forked repository on GitHub
2. Click **Settings** tab
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

Add the Cloudflare secrets below, plus the ones listed in Step 3.6:

### Secret 1: CLOUDFLARE_ACCOUNT_ID

- **Name**: `CLOUDFLARE_ACCOUNT_ID`
- **Secret**: Paste your Account ID from Step 3.4
- Click **Add secret**

### Secret 2: CLOUDFLARE_API_TOKEN

- **Name**: `CLOUDFLARE_API_TOKEN`
- **Secret**: Paste your API Token from Step 3.5
- Click **Add secret**

### Secret 3: CLOUDFLARE_ZONE_ID

The Zone ID is required for cache purging after deployments.

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain (e.g., `yourdomain.com`)
3. On the domain overview page, look at the **right sidebar**
4. Under the **API** section, copy the **Zone ID**
   - Format: `1234567890abcdef1234567890abcdef` (32 characters)

Add the secret:
- **Name**: `CLOUDFLARE_ZONE_ID`
- **Secret**: Paste your Zone ID
- Click **Add secret**

**Security Note**: Never commit these values to your repository or share them publicly.

## Step 5: Deploy

Push to `main`; GitHub Actions deploys production:

```bash
git push origin main
```

In the **Actions** tab, the "Deploy to Cloudflare" workflow:
1. Runs the runtime audit, unit/lint, local API, browser, hosted-sandbox and funded-download tests
2. Creates the R2 buckets if needed and pushes Worker secrets from GitHub secrets
3. Deploys the three Workers listed above
4. Verifies the workers.dev URL, the custom domain, and the git SHA embedded in the health
   endpoint and HTML pages

Check the Worker on workers.dev (your account's workers.dev subdomain, not the account ID):

```bash
curl https://hashbin-worker-prod.<workers-subdomain>.workers.dev/health
```

## Step 6: Configure Custom Domain

Connect your custom domain to the production Worker.

### Option A: Automatic Route (Recommended)

If you configured `wrangler.toml` correctly in Step 2, the custom domain route is automatically created during deployment.

Verify the route was created:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click **hashbin-worker-prod** (or your custom name)
4. Click **Settings** → **Triggers**
5. Under **Routes**, you should see:
   - Route: `yourdomain.com/*`
   - Zone: `yourdomain.com`

### Option B: Manual Configuration

If the automatic route didn't work, add it manually:

1. Go to **Workers & Pages** → Your Worker
2. Click **Settings** → **Triggers**
3. Scroll to **Routes** section
4. Click **Add Route**
5. Configure:
   - **Route**: `yourdomain.com/*`
   - **Zone**: Select your domain
6. Click **Add Route**

### Test Custom Domain

Wait 1-2 minutes for DNS propagation, then test:

```bash
curl https://yourdomain.com/health
```

If it works, you should see the health check response with `"environment": "production"`.

### Troubleshooting Custom Domain

If custom domain doesn't work:

1. **Check DNS**: Ensure nameservers point to Cloudflare
   ```bash
   nslookup -type=NS yourdomain.com
   ```

2. **Check Route**: Verify route is configured in Cloudflare Dashboard

3. **Check SSL**: Ensure SSL/TLS is set to "Full" or "Flexible"
   - Dashboard → SSL/TLS → Overview → Full

4. **Wait for DNS**: DNS can take up to 24 hours (usually < 1 hour)

5. **Test Workers URL First**: If workers.dev URL works but custom domain doesn't, it's a routing/DNS issue, not a code issue

## Verification and Testing

### Automated Verification

`npm run verify:production` enforces the strict [production checklist](../todo/deployment_checklist.md)
against all three origins. Set `EXPECTED_GIT_SHA` to the full deployed commit for an exact
match. Deploy CI runs it after deploying; scheduled smoke tests run it every six hours.

The GitHub Actions workflow automatically verifies deployments by testing:
- Root endpoint (`/`)
- Health check endpoint (`/health`)
- 404 error handling
- Service operational status

### Manual Verification Script

Run the included verification script:

```bash
# Verify production on workers.dev
./scripts/verify-deployment.sh production <workers-subdomain>

# Verify custom domain
./scripts/verify-deployment.sh https://yourdomain.com
```

Or using npm:

```bash
npm run verify                                  # https://hashbin.org
npm run verify:workers-dev -- <workers-subdomain>   # hashbin-worker-prod.<subdomain>.workers.dev
```

### Manual Testing with curl

Test all endpoints:

```bash
# Root endpoint
curl https://yourdomain.com/

# Health check
curl https://yourdomain.com/health

# 404 handling
curl https://yourdomain.com/nonexistent
```

### View Logs

Check real-time logs in Cloudflare Dashboard:
1. Go to **Workers & Pages**
2. Click your Worker name
3. Click **Logs** tab
4. Click **Begin log stream**

## Troubleshooting

### "Unauthorized" Error in GitHub Actions

**Cause**: Invalid or expired API token

**Solution**:
1. Create a new API token (Step 3.5)
2. Update `CLOUDFLARE_API_TOKEN` secret in GitHub
3. Re-run the failed workflow

### "Account ID not found"

**Cause**: Incorrect Account ID

**Solution**:
1. Verify Account ID in Cloudflare Dashboard
2. Update `CLOUDFLARE_ACCOUNT_ID` secret in GitHub
3. Ensure no extra spaces or characters

### R2 Bucket Creation Fails

**Cause**: R2 not enabled or not on Workers Paid plan

**Solution**:
1. Verify you're on Workers Paid plan ($5/month)
2. Check R2 is enabled: Dashboard → R2
3. If buckets already exist, deployment will continue (safe to ignore)

### Worker Deploys but Custom Domain Doesn't Work

**Cause**: DNS not configured or route not set up

**Solution**:
1. Check nameservers point to Cloudflare: `nslookup -type=NS yourdomain.com`
2. Verify route exists in Worker settings → Triggers → Routes
3. Ensure SSL/TLS mode is set to "Full" in SSL/TLS settings
4. Wait for DNS propagation (can take up to 24 hours)
5. Test workers.dev URL to verify Worker is functioning

### "Zone not found" Error

**Cause**: Domain not added to Cloudflare account

**Solution**:
1. Add domain to Cloudflare (Step 3.1)
2. Verify domain is active (not pending)
3. Update nameservers at domain registrar
4. Wait for domain to become active in Cloudflare

### GitHub Actions Workflow Not Triggering

**Cause**: Workflow file not in correct location or branch protection rules

**Solution**:
1. Verify `.github/workflows/deploy.yml` exists
2. Check workflow file syntax is valid (YAML)
3. Ensure you're pushing to `main`
4. Check repository settings for branch protection rules

### Durable Objects Not Working

**Cause**: Durable Objects not enabled or migrations not applied

**Solution**:
1. Verify Workers Paid plan is active
2. Check `wrangler.toml` has `[[migrations]]` section
3. Redeploy to apply migrations
4. Check Cloudflare Dashboard → Workers → Your Worker → Durable Objects

## Manual Deployment

For local development or manual deployment:

### Install Dependencies

```bash
npm install
```

### Configure Wrangler Locally

Login to Cloudflare:

```bash
npx wrangler login
```

This opens a browser window to authorize Wrangler.

### Deploy

There is one environment (production). Push to `main` only when authorized by the owner,
or rerun the workflow on its current commit:

```bash
gh workflow run deploy.yml --repo curtcox/hashbin.org --ref main
```

Do not use `npm run deploy` for production: it deploys only the main Worker and skips
secret provisioning, SHA injection, the other two Workers and verification.

### Local Development

Run Worker locally:

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`

For development without Clerk, Stripe or Cloudflare, use `npm run dev:local` instead; see
[local-development.md](local-development.md).

## Architecture Details

The sources of truth, rather than copies that go stale:

- **Repository layout and conventions:** [`AGENTS.md`](../AGENTS.md)
- **Durable Objects, R2 buckets, cron and variables:** `wrangler.toml` (and the two
  `workers/*/wrangler.toml` files)
- **Required secrets:** the comment block in `wrangler.toml` and the "Verify required secrets"
  step in `.github/workflows/deploy.yml`
- **API endpoints:** [API.md](API.md); the route table (`API_ROUTES`) in `src/index.js`
- **Costs:** [cost-safety.md](cost-safety.md) and `src/utils/cost-policy.js`

## Getting Help

- **GitHub Issues**: [github.com/curtcox/hashbin.org/issues](https://github.com/curtcox/hashbin.org/issues)
- **Cloudflare Docs**: [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/)
- **Cloudflare Community**: [community.cloudflare.com](https://community.cloudflare.com/)
- **Wrangler Docs**: [developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler/)

## Additional Documentation

- `todo/deployment_setup.md` - Setup checklist for hashbin.org itself
- `scripts/README.md` - Deployment verification scripts
- `STATUS.md` - Launch blockers and current work
