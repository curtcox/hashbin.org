# Payment System Environment Setup

This guide explains how to configure the HashBin.org payment system for development and production environments.

## Prerequisites

1. Cloudflare Workers account with Paid plan ($5/month minimum)
2. Stripe account (test and live modes)
3. Wrangler CLI installed (`npm install -g wrangler`)

## Stripe Setup

### 1. Create Stripe Account

1. Sign up at https://stripe.com
2. Complete account verification
3. Enable Stripe Tax in your dashboard (Settings → Tax)

### 2. Get API Keys

#### Test Mode (Development)
1. Go to Developers → API keys
2. Copy your **Publishable key** (starts with `pk_test_`)
3. Copy your **Secret key** (starts with `sk_test_`)

#### Live Mode (Production)
1. Activate your account
2. Switch to Live mode in the dashboard
3. Go to Developers → API keys
4. Copy your **Publishable key** (starts with `pk_live_`)
5. Copy your **Secret key** (starts with `sk_live_`)

### 3. Configure Webhooks

#### Development Webhook
1. Go to Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/api/payments/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.dispute.created`
5. Copy the **Signing secret** (starts with `whsec_`)

#### Production Webhook
1. Create another endpoint for production
2. URL: `https://hashbin.org/api/payments/webhook`
3. Select the same events
4. Copy the production **Signing secret**

## Cloudflare Secrets Configuration

### Development Environment

Set secrets using Wrangler CLI:

```bash
# Clerk authentication secrets (existing)
wrangler secret put CLERK_SECRET_KEY --env development
# Paste your Clerk secret key when prompted

wrangler secret put CLERK_PUBLISHABLE_KEY --env development
# Paste your Clerk publishable key when prompted

wrangler secret put CLERK_WEBHOOK_SECRET --env development
# Paste your Clerk webhook secret when prompted

# Stripe payment secrets (new)
wrangler secret put STRIPE_SECRET_KEY --env development
# Paste your Stripe TEST secret key (sk_test_...)

wrangler secret put STRIPE_WEBHOOK_SECRET --env development
# Paste your Stripe webhook signing secret (whsec_...)
```

### Production Environment

Set secrets for production:

```bash
# Clerk authentication secrets (existing)
wrangler secret put CLERK_SECRET_KEY --env production
# Paste your production Clerk secret key

wrangler secret put CLERK_PUBLISHABLE_KEY --env production
# Paste your production Clerk publishable key

wrangler secret put CLERK_WEBHOOK_SECRET --env production
# Paste your production Clerk webhook secret

# Stripe payment secrets (new)
wrangler secret put STRIPE_SECRET_KEY --env production
# Paste your Stripe LIVE secret key (sk_live_...)

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# Paste your production Stripe webhook signing secret
```

## Environment Variables

These are already configured in `wrangler.toml`:

### Development
```toml
[env.development]
vars = { 
  ENVIRONMENT = "development", 
  LOG_LEVEL = "debug" 
}
```

### Production
```toml
[env.production]
vars = { 
  ENVIRONMENT = "production", 
  LOG_LEVEL = "warn" 
}
```

## Testing the Setup

### 1. Deploy to Development

```bash
npm run deploy:dev
```

### 2. Verify Deployment

```bash
# Check health endpoint
curl https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/health

# Test payment calculation (no auth required)
curl -X POST https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/api/payments/calculate \
  -H "Content-Type: application/json" \
  -d '{"size_bytes": 1073741824, "retention_months": 1}'

# Should return: {"size_bytes":1073741824,"retention_months":1,"cost_cents":3,"cost_formatted":"$0.03"}
```

### 3. Test Deposit Flow (Requires Authentication)

```bash
# First, authenticate and get a session token
# Then create a deposit
curl -X POST https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/api/balance/deposit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents": 500}'

# Should return a Stripe checkout URL
```

### 4. Test Webhook

Use Stripe CLI for local webhook testing:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Forward webhooks to local dev
stripe listen --forward-to https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/api/payments/webhook

# Trigger a test webhook
stripe trigger checkout.session.completed
```

## Pricing Configuration

Current pricing is configured in `src/utils/pricing.js`:

```javascript
// Base rate: $0.03 per GB per month
const BASE_RATE_PER_GB_PER_MONTH = 0.03;

// Stripe fees: 2.9% + $0.30
const STRIPE_FEE_PERCENTAGE = 0.029;
const STRIPE_FEE_FIXED_CENTS = 30;

// Minimum deposit: $1.00
const MINIMUM_DEPOSIT_CENTS = 100;

// Minimum retention: 30 days (1 month)
const MINIMUM_RETENTION_MONTHS = 1;
```

To change pricing, edit these constants and redeploy.

## Troubleshooting

### Webhook Signature Verification Failed

- Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from your Stripe dashboard
- Check that you're using the correct secret for development vs production
- Verify the webhook endpoint URL is correct

### Deposits Not Crediting Balance

1. Check Stripe webhook logs in dashboard (Developers → Webhooks)
2. Check Cloudflare Worker logs: `wrangler tail --env development`
3. Verify webhook is receiving `checkout.session.completed` events
4. Ensure `client_reference_id` is set correctly with user ID

### Balance Check Fails on Upload

- Verify user has deposited funds
- Check balance with `GET /api/balance` endpoint
- Review transaction history with `GET /api/balance/history`

### Insufficient Balance Error

This is expected behavior! Users must deposit funds before uploading. The error message includes:
- Required amount
- Current balance
- Link to deposit page

## Security Notes

⚠️ **Important Security Practices:**

1. **Never commit secrets to git**
   - Secrets are stored in Cloudflare Workers, not in code
   - Use `wrangler secret put` to set secrets

2. **Use test keys in development**
   - Always use `sk_test_*` keys for development
   - Never use `sk_live_*` keys except in production

3. **Verify webhook signatures**
   - The code verifies all Stripe webhooks using signature verification
   - Never disable signature verification

4. **PCI Compliance**
   - We use Stripe Checkout (hosted pages)
   - Card data never touches our servers
   - We remain PCI compliant by design

## API Endpoints Summary

### Balance Management
- `GET /api/balance` - Get current balance (auth required)
- `GET /api/balance/history` - Get transaction history (auth required)
- `POST /api/balance/deposit` - Create deposit checkout session (auth required)

### Content Management
- `POST /api/content` - Upload content with payment (auth required)
- `GET /api/content/:cid` - Get content metadata (public)
- `GET /api/content/:cid/exists` - Check if content exists (public)
- `POST /api/content/:cid/extend` - Extend own content retention (auth required)

### Donations
- `POST /api/donate/cid/:cid` - Donate to extend any CID (auth optional)

### Utilities
- `POST /api/payments/calculate` - Calculate retention cost (public)
- `POST /api/payments/webhook` - Stripe webhook handler (Stripe only)

## Next Steps

After completing environment setup:

1. Test deposit flow with Stripe test cards
2. Test content upload with balance deduction
3. Test CID donation flow (anonymous and authenticated)
4. Monitor webhook events in Stripe dashboard
5. Review transaction logs in Cloudflare dashboard

## Support

For issues:
- Check Cloudflare Worker logs: `wrangler tail`
- Check Stripe webhook logs in dashboard
- Review `todo/payments.md` for implementation details
