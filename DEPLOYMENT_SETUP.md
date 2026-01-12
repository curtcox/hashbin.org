# Deployment Setup Instructions

This document describes how to configure GitHub secrets and Cloudflare for automated deployment.

## Prerequisites

1. **Cloudflare Account** with Workers Paid plan ($5/month minimum)
   - Durable Objects enabled
   - R2 storage enabled

2. **Domain Control** of hashbin.org
   - Domain added to Cloudflare
   - Nameservers pointed to Cloudflare

## Step 1: Get Your Cloudflare Account ID

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click on "Workers & Pages" in the left sidebar
3. Copy your **Account ID** from the right sidebar
   - It looks like: `1234567890abcdef1234567890abcdef`

## Step 2: Create Cloudflare API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Click "Create Custom Token"
4. Configure the token:
   - **Token name:** `GitHub Actions - HashBin Deploy`
   - **Permissions:**
     - Account → Workers Scripts → Edit
     - Account → Workers KV Storage → Edit
     - Account → Workers R2 Storage → Edit
     - Account → Account Settings → Read
   - **Account Resources:**
     - Include → Your Account
   - **Zone Resources:** (if deploying with custom domain)
     - Include → hashbin.org
5. Click "Continue to summary"
6. Click "Create Token"
7. **Copy the token** - you won't be able to see it again!
   - Looks like: `abc123def456ghi789...`

## Step 3: Add Secrets to GitHub Repository

1. Go to your GitHub repository: `https://github.com/curtcox/hashbin.org`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

### Required Secrets

| Secret Name | Value | Where to Find |
|-------------|-------|---------------|
| `CLOUDFLARE_API_TOKEN` | Your API token from Step 2 | Cloudflare Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from Step 1 | Cloudflare Dashboard → Workers |

### Adding Each Secret

For each secret:
1. Click "New repository secret"
2. Enter the **Name** (exactly as shown above)
3. Paste the **Value**
4. Click "Add secret"

## Step 4: Verify Setup

Once secrets are added, the GitHub Actions workflow will automatically run when you push to:
- `develop` branch → Deploys to **development** environment
- `main` branch → Deploys to **production** environment

### Test the Deployment

1. Push any change to the `develop` branch
2. Go to **Actions** tab in GitHub
3. Watch the "Deploy to Cloudflare" workflow run
4. If successful, your Worker will be deployed!

## Step 5: Configure Custom Domain (Production Only)

For the production environment to work on `hashbin.org`:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your **hashbin.org** domain
3. Go to **DNS** → **Records**
4. The Worker route is already configured in `wrangler.toml`
5. Once deployed to `main`, your site will be live at `https://hashbin.org`

## Testing URLs

After deployment, your Workers will be available at:

- **Development:** `https://hashbin-worker-dev.<account-id>.workers.dev`
- **Production (Workers URL):** `https://hashbin-worker-prod.<account-id>.workers.dev`
- **Production (Custom Domain):** `https://hashbin.org` (once DNS is configured)

## Testing the Deployment

Test your deployment with curl:

```bash
# Test development
curl https://hashbin-worker-dev.<your-account-id>.workers.dev/health

# Test production (workers.dev URL)
curl https://hashbin-worker-prod.<your-account-id>.workers.dev/health

# Test production (custom domain, once DNS configured)
curl https://hashbin.org/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-12T...",
  "environment": "production",
  "services": {
    "worker": "operational",
    "durableObjects": "operational",
    "r2": "operational"
  }
}
```

## Troubleshooting

### "Unauthorized" Error
- Check that `CLOUDFLARE_API_TOKEN` is correct
- Verify token has the required permissions
- Token may have expired - create a new one

### "Account ID not found"
- Check that `CLOUDFLARE_ACCOUNT_ID` is correct
- Verify it matches your Cloudflare account

### R2 Bucket Creation Fails
- Ensure R2 is enabled on your account
- Check you're on Workers Paid plan
- Buckets may already exist (this is okay)

### Deployment Succeeds but Site Not Accessible
- Check DNS records in Cloudflare
- Verify nameservers are pointed to Cloudflare
- DNS propagation can take up to 24 hours (usually <1 hour)
- Try the workers.dev URL first

### Need Help?
- Check GitHub Actions logs for detailed error messages
- Review Cloudflare Workers logs in dashboard
- Consult `todo/site_creation.md` for detailed setup steps

## Next Steps

Once deployment is working:
1. Verify both development and production environments
2. Test the health endpoint
3. Proceed with Phase 2: Content Operations
4. Implement 256t hash generation library

---

**Note:** Never commit secrets to the repository. Always use GitHub Secrets for sensitive data.
