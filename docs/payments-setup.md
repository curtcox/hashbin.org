# Payment System Environment Setup

This guide explains how to configure the HashBin.org payment system.

Prefer the API/CLI procedures in the [Stripe plan](../todo/cost_safety_stripe.md)
and [deployment setup](../todo/deployment_setup.md). Configure webhook endpoints
with the Stripe API, test/replay with Stripe CLI, and provision secrets through
GitHub CLI/Actions. Dashboard steps below are fallbacks only for specific
settings or credential bootstrap unavailable through supported APIs. Record the
limitation and verification; hosted Checkout acceptance still uses a browser.

## Prerequisites

1. Cloudflare Workers account with Paid plan ($5/month minimum)
2. Stripe account (test and live modes)
3. `npm install` (Wrangler is a dev dependency)

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

### 3. Configure the Webhook

Production is the only deployed environment. Create one live endpoint:

1. URL: `https://hashbin.org/api/payments/webhook`
2. Events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.dispute.created`
3. Copy the **Signing secret** (starts with `whsec_`)

For test-mode development, run `npm run dev` and forward events with the Stripe CLI (below).
`npm run dev:local` needs no Stripe at all; see [local-development.md](local-development.md).

## Secrets

Set these as **GitHub Actions secrets**; the deploy workflow pushes them to the Worker with
`wrangler secret put` on every deploy (`.github/workflows/deploy.yml`, "Configure Stripe secrets"):

| Secret | Value |
|--------|-------|
| `STRIPE_SECRET_KEY` | Live secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Live webhook signing secret (`whsec_…`) |

```bash
gh secret set STRIPE_SECRET_KEY --repo curtcox/hashbin.org
gh secret set STRIPE_WEBHOOK_SECRET --repo curtcox/hashbin.org
```

For `npm run dev`, add test-mode `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `.dev.vars` (gitignored).

`/health` reports `checks.stripe.details.usingTestKeysInProduction` when production holds a test key.

## Testing the Setup

### 1. Verify Pricing

```bash
# Payment calculation (no auth required)
curl -X POST https://hashbin.org/api/payments/calculate \
  -H "Content-Type: application/json" \
  -d '{"size_bytes": 1073741824, "retention_months": 1}'

# Should return: {"size_bytes":1073741824,"retention_months":1,"cost_cents":3,"cost_formatted":"$0.03"}
```

### 2. Test the Webhook Locally

```bash
# https://stripe.com/docs/stripe-cli
npm run dev
stripe listen --forward-to http://localhost:8787/api/payments/webhook
stripe trigger checkout.session.completed
```

## Pricing Configuration

Storage pricing is in `src/utils/pricing.js` ($0.03 per GB per month, a one-month minimum,
a $1.00 minimum deposit). Stripe's fee rate (2.9% + $0.30), which deposits are grossed up by,
is in `src/utils/cost-policy.js`. Change them there and redeploy; don't copy the values
elsewhere.

## Troubleshooting

### Webhook Signature Verification Failed

- Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from your Stripe dashboard
- Check that you're using the correct secret for development vs production
- Verify the webhook endpoint URL is correct

### Deposits Not Crediting Balance

1. Check Stripe webhook logs in dashboard (Developers → Webhooks)
2. Check Cloudflare Worker logs: `npx wrangler tail`
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
   - Secrets live in GitHub secrets and are pushed to the Worker by the deploy workflow

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

## More

- Stripe cost-safety checklist: [`todo/cost_safety_stripe.md`](../todo/cost_safety_stripe.md)
- Logs: `npx wrangler tail` and the Stripe dashboard's webhook log
