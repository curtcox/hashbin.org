# HashBin.org Deployment Guide

This guide provides complete instructions for deploying a fork of HashBin.org to a new domain using Cloudflare Workers, Durable Objects, and R2 Storage.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step 1: Fork the Repository](#step-1-fork-the-repository)
- [Step 2: Configure for Your Domain](#step-2-configure-for-your-domain)
- [Step 3: Set Up Cloudflare Account](#step-3-set-up-cloudflare-account)
- [Step 4: Configure GitHub Secrets](#step-4-configure-github-secrets)
- [Step 5: Deploy to Development](#step-5-deploy-to-development)
- [Step 6: Deploy to Production](#step-6-deploy-to-production)
- [Step 7: Configure Custom Domain](#step-7-configure-custom-domain)
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

### Environments

The platform supports two environments:

1. **Development** (`develop` branch)
   - Worker: `hashbin-worker-dev`
   - URL: `https://hashbin-worker-dev.<account-id>.workers.dev`
   - R2 Buckets: `hashbin-content-dev`, `hashbin-backups-dev`

2. **Production** (`main` branch)
   - Worker: `hashbin-worker-prod`
   - URL: `https://hashbin-worker-prod.<account-id>.workers.dev`
   - Custom Domain: `https://yourdomain.com`
   - R2 Buckets: `hashbin-content-prod`, `hashbin-backups-prod`

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

- Node.js 18+ (for local testing)
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

### Update wrangler.toml

Edit `wrangler.toml` and change the production route and zone:

```toml
# Production environment
[env.production]
name = "hashbin-worker-prod"
route = { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" }
vars = { ENVIRONMENT = "production", LOG_LEVEL = "warn" }
```

**Important**: Replace `yourdomain.com` with your actual domain in both `pattern` and `zone_name`.

### Update Worker Names (Optional)

If you want custom worker names, update the `name` fields:

```toml
# Development environment
[env.development]
name = "yourproject-worker-dev"

# Production environment
[env.production]
name = "yourproject-worker-prod"
```

### Update R2 Bucket Names (Optional)

You can customize bucket names in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "CONTENT_BUCKET"
bucket_name = "yourproject-content-prod"
preview_bucket_name = "yourproject-content-dev"

[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "yourproject-backups-prod"
preview_bucket_name = "yourproject-backups-dev"
```

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

## Step 4: Configure GitHub Secrets

GitHub Secrets store sensitive credentials securely.

1. Go to your forked repository on GitHub
2. Click **Settings** tab
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

Add these two secrets:

### Secret 1: CLOUDFLARE_ACCOUNT_ID

- **Name**: `CLOUDFLARE_ACCOUNT_ID`
- **Secret**: Paste your Account ID from Step 3.4
- Click **Add secret**

### Secret 2: CLOUDFLARE_API_TOKEN

- **Name**: `CLOUDFLARE_API_TOKEN`
- **Secret**: Paste your API Token from Step 3.5
- Click **Add secret**

**Security Note**: Never commit these values to your repository or share them publicly.

## Step 5: Deploy to Development

The development environment is automatically deployed when you push to the `develop` branch.

### Create and Push to Develop Branch

```bash
# Create develop branch from main
git checkout -b develop
git push origin develop
```

### Monitor Deployment

1. Go to your GitHub repository
2. Click **Actions** tab
3. You'll see "Deploy to Cloudflare" workflow running
4. Click on the workflow to see detailed logs

The workflow will:
1. Run tests
2. Install dependencies
3. Create R2 buckets (`hashbin-content-dev`, `hashbin-backups-dev`)
4. Deploy Worker to development environment
5. Verify deployment with automated tests

### Test Development Deployment

Once deployment succeeds, test your development environment:

```bash
# Replace <account-id> with your actual Account ID
curl https://hashbin-worker-dev.<account-id>.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-12T...",
  "environment": "development",
  "services": {
    "worker": "operational",
    "durableObjects": "operational",
    "r2": "operational"
  }
}
```

## Step 6: Deploy to Production

The production environment is automatically deployed when you push to the `main` branch.

### Merge Develop to Main

```bash
git checkout main
git merge develop
git push origin main
```

### Monitor Production Deployment

1. Go to **Actions** tab in GitHub
2. Watch the production deployment workflow
3. Review the deployment verification results

The workflow will:
1. Run tests
2. Install dependencies
3. Create R2 buckets (`hashbin-content-prod`, `hashbin-backups-prod`)
4. Deploy Worker to production environment
5. Verify deployment on workers.dev URL
6. Attempt to verify custom domain (may fail initially)

### Test Production Deployment (Workers URL)

```bash
curl https://hashbin-worker-prod.<account-id>.workers.dev/health
```

At this point, your production worker is running on Cloudflare's workers.dev subdomain.

## Step 7: Configure Custom Domain

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

The GitHub Actions workflow automatically verifies deployments by testing:
- Root endpoint (`/`)
- Health check endpoint (`/health`)
- 404 error handling
- Service operational status

### Manual Verification Script

Run the included verification script:

```bash
# Verify development
./scripts/verify-deployment.sh development <account-id>

# Verify production (workers.dev)
./scripts/verify-deployment.sh production <account-id>

# Verify custom domain
./scripts/verify-deployment.sh https://yourdomain.com
```

Or using npm:

```bash
npm run verify:dev -- <account-id>
npm run verify:prod -- <account-id>
npm run verify:custom
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
3. Ensure you're pushing to `main` or `develop` branch
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

### Deploy to Development

```bash
npm run deploy:dev
```

### Deploy to Production

```bash
npm run deploy:prod
```

### Local Development

Run Worker locally:

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`

**Note**: Durable Objects and R2 in local mode use simulated storage that doesn't persist between restarts.

## Architecture Details

### Project Structure

```
hashbin.org/
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD pipeline
├── docs/
│   └── deployment.md            # This file
├── scripts/
│   ├── verify-deployment.sh     # Deployment verification
│   └── README.md                # Scripts documentation
├── src/
│   ├── index.js                 # Main Worker entry point
│   └── durable-objects/         # Durable Object classes
│       ├── content-metadata.js  # Content metadata storage
│       ├── user-profile.js      # User profiles
│       ├── payment-record.js    # Payment tracking
│       ├── contest-record.js    # Contest management
│       └── message-thread.js    # Message threads
├── todo/
│   ├── master_plan.md           # Project roadmap
│   └── site_creation.md         # Detailed setup steps
├── package.json                 # Node.js dependencies
├── wrangler.toml                # Cloudflare Workers config
├── DEPLOYMENT_SETUP.md          # Quick setup guide
└── README.md                    # Project overview
```

### Cloudflare Resources

Your deployment creates these resources:

#### Workers
- **hashbin-worker-dev**: Development environment worker
- **hashbin-worker-prod**: Production environment worker

#### Durable Objects (5 classes)
- **ContentMetadata**: Stores content metadata and access tracking
- **UserProfile**: Manages user accounts and preferences
- **PaymentRecord**: Tracks payments and subscriptions
- **ContestRecord**: Manages contest data and winners
- **MessageThread**: Handles user messages and notifications

#### R2 Buckets
- **hashbin-content-dev**: Development content storage
- **hashbin-backups-dev**: Development backup storage
- **hashbin-content-prod**: Production content storage
- **hashbin-backups-prod**: Production backup storage

### API Endpoints

Currently implemented:

- `GET /` - Service information and status
- `GET /health` - Health check with service status

Future endpoints (Phase 2+):
- `/api/content` - Content upload/download
- `/api/auth` - Authentication
- `/api/payments` - Payment processing
- `/api/contests` - Contest management
- `/api/messages` - Messaging system

### Environment Variables

Set in `wrangler.toml` for each environment:

- `ENVIRONMENT`: `"development"` or `"production"`
- `LOG_LEVEL`: `"debug"` (dev) or `"warn"` (prod)

### Cost Estimation

**Cloudflare Workers Paid Plan**: $5/month includes:
- Unlimited Worker requests
- Durable Objects: 1M reads/writes free, then $0.15/M reads, $1.00/M writes
- R2 Storage: 10GB free, then $0.015/GB/month
- R2 Operations: Class A (writes): $4.50/M, Class B (reads): $0.36/M

**Typical usage for small site**:
- Workers: $5/month (base plan)
- R2 Storage: $0 (under 10GB)
- R2 Operations: < $1/month
- **Total: ~$6/month**

### Security Considerations

1. **API Token Permissions**: Use minimum required permissions
2. **GitHub Secrets**: Never commit secrets to repository
3. **CORS Headers**: Configured with `access-control-allow-origin: *` (adjust for production)
4. **HTTPS Only**: All traffic uses HTTPS (enforced by Cloudflare)
5. **Rate Limiting**: Consider adding rate limiting for production (TODO)

### Scaling

Cloudflare Workers automatically scale to handle traffic:
- No servers to manage
- Deployed to 200+ datacenters worldwide
- Requests routed to nearest datacenter
- Durable Objects provide strong consistency when needed
- R2 provides global object storage

## Next Steps

After successful deployment:

1. **Test thoroughly**: Run verification scripts and manual tests
2. **Monitor logs**: Check Cloudflare Dashboard for errors
3. **Set up monitoring**: Consider Cloudflare Analytics or external monitoring
4. **Review roadmap**: See `todo/master_plan.md` for next phases
5. **Implement Phase 2**: Add content operations (upload/download)
6. **Add authentication**: Implement user authentication system
7. **Add tests**: Expand test coverage (currently minimal)

## Getting Help

- **GitHub Issues**: [github.com/curtcox/hashbin.org/issues](https://github.com/curtcox/hashbin.org/issues)
- **Cloudflare Docs**: [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/)
- **Cloudflare Community**: [community.cloudflare.com](https://community.cloudflare.com/)
- **Wrangler Docs**: [developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler/)

## Additional Documentation

- `todo/deployment_setup.md` - Quick setup guide for hashbin.org
- `scripts/README.md` - Deployment verification scripts
- `todo/master_plan.md` - Project roadmap and phases
- `done/site_creation.md` - Detailed implementation plan (Phase 1 complete)

---

**Last Updated**: January 2026
**Version**: 0.1.0 (Phase 1 - Infrastructure Setup)
