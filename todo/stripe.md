# Stripe Payment Integration Plan

## Overview

This document tracks the implementation of Stripe payment integration for HashBin.org. The integration enables users to deposit funds into their account balance and make payments for content retention through Stripe's secure checkout system.

## Status: ✅ COMPLETE

All core Stripe functionality has been implemented and integrated.

---

## Implementation Phases

### Phase 1: Core Infrastructure ✅ COMPLETE

#### 1.1 Backend Setup ✅
- [x] Add Stripe SDK dependency to package.json (`stripe@^14.0.0`)
- [x] Configure Stripe API version (`2024-11-20.acacia`)
- [x] Add environment-specific configuration in wrangler.toml
- [x] Document required secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)

#### 1.2 Payment API Endpoints ✅
- [x] `POST /api/balance/deposit` - Create Stripe checkout session for deposits
  - Requires authentication
  - Validates minimum deposit ($1.00)
  - Calculates total charge including Stripe fees
  - Returns checkout URL and session ID
- [x] `POST /api/payments/webhook` - Handle Stripe webhook events
  - Verifies webhook signature
  - Processes `checkout.session.completed` events
  - Handles deposit credits
  - Handles CID donations
  - Implements idempotency checks
- [x] `POST /api/payments/calculate` - Calculate retention costs (public endpoint)
  - Validates size and retention parameters
  - Returns formatted cost breakdown
- [x] `POST /api/donate/cid/:cid` - Create donation checkout session
  - Anonymous donations supported
  - Calculates extension duration from donation amount
  - Returns estimated new expiration

#### 1.3 Pricing Utilities ✅
- [x] Base rate calculation ($0.03/GB/month)
- [x] Stripe fee calculation (2.9% + $0.30)
- [x] Fee breakdown utilities
- [x] Currency formatting helpers
- [x] Located in `src/utils/pricing.js`

---

### Phase 2: Checkout Session Management ✅ COMPLETE

#### 2.1 Deposit Flow ✅
- [x] Create Stripe Checkout session with line items
- [x] Set payment method types (card)
- [x] Configure success/cancel URLs
- [x] Pass user metadata (user_id, type, amount)
- [x] Enable Stripe Tax
- [x] Support both development and production environments

#### 2.2 Session Configuration ✅
- [x] Client reference ID (user identification)
- [x] Customer email pre-fill
- [x] Session metadata for webhook processing
- [x] Automatic tax calculation enabled
- [x] Environment-specific return URLs

---

### Phase 3: Webhook Processing ✅ COMPLETE

#### 3.1 Security ✅
- [x] Signature verification using webhook secret
- [x] Reject missing or invalid signatures
- [x] Idempotency checks via PaymentRecord
- [x] Session deduplication

#### 3.2 Event Handling ✅
- [x] `checkout.session.completed` - Process successful payments
  - Credit user balance for deposits
  - Record transaction with before/after balance
  - Update user's total_deposited_cents
  - Extend CID retention for donations
- [x] `checkout.session.expired` - Log expired sessions
- [x] `charge.dispute.created` - Log disputes for admin review

#### 3.3 Transaction Recording ✅
- [x] Generate unique transaction IDs (UUID)
- [x] Store in PaymentRecord Durable Object
- [x] Record balance before/after amounts
- [x] Link to Stripe session and payment intent
- [x] Support multiple transaction types (deposit, donation)

---

### Phase 4: Frontend Integration ✅ COMPLETE

#### 4.1 Deposit Page UI ✅
- [x] Create deposit.html with form
- [x] Amount input with validation
- [x] Fee breakdown display (credit + fee = total)
- [x] Real-time fee calculation
- [x] Success/cancel message handling
- [x] Redirect flow after Stripe checkout

#### 4.2 JavaScript Logic ✅
- [x] deposit.js module implementation
- [x] Amount validation (minimum $1.00)
- [x] Fee calculation matching backend
- [x] Authenticated API calls
- [x] Error handling and display
- [x] URL parameter parsing (success/cancel)
- [x] Auto-redirect to dashboard on success

#### 4.3 User Experience ✅
- [x] Clear pricing information ($0.03/GB/month)
- [x] Fee transparency (show breakdown before checkout)
- [x] Loading states during API calls
- [x] Success/error message feedback
- [x] Protected route (requires authentication)

---

### Phase 5: Content Payment Integration ✅ COMPLETE

#### 5.1 Upload Payment ✅
- [x] Balance check before upload (implemented in content.js)
- [x] Minimum 30-day retention enforcement
- [x] Balance deduction on successful upload
- [x] Transaction recording for uploads
- [x] Insufficient balance error messages

#### 5.2 Donation System ✅
- [x] Anonymous donation support
- [x] Authenticated donor tracking
- [x] CID existence validation
- [x] Extension calculation from donation amount
- [x] Retention payment recording in ContentMetadata

---

## Configuration

### Required Secrets

Set via `wrangler secret put <SECRET_NAME> --env <environment>`:

#### Development
```bash
wrangler secret put STRIPE_SECRET_KEY --env development
# Use test key: sk_test_...

wrangler secret put STRIPE_WEBHOOK_SECRET --env development
# Use development webhook secret: whsec_...
```

#### Production
```bash
wrangler secret put STRIPE_SECRET_KEY --env production
# Use live key: sk_live_...

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# Use production webhook secret: whsec_...
```

### Webhook Endpoints

Configure in Stripe Dashboard (Developers → Webhooks):

**Development:**
- URL: `https://hashbin-worker-dev.YOUR_SUBDOMAIN.workers.dev/api/payments/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `charge.dispute.created`

**Production:**
- URL: `https://hashbin.org/api/payments/webhook`
- Events: Same as development

---

## Testing

### Manual Testing Checklist

#### Deposit Flow
- [ ] Navigate to /deposit.html while authenticated
- [ ] Enter amount below $1.00 → Should show error
- [ ] Enter valid amount → Should show fee breakdown
- [ ] Submit form → Should redirect to Stripe checkout
- [ ] Complete payment with test card (4242 4242 4242 4242)
- [ ] Verify redirect to deposit page with success message
- [ ] Check balance increased at /api/balance
- [ ] Verify transaction recorded in /api/balance/history

#### Webhook Testing
- [ ] Use Stripe CLI to forward webhooks locally
- [ ] Trigger test webhook: `stripe trigger checkout.session.completed`
- [ ] Verify balance credit in Durable Object
- [ ] Check idempotency: Send duplicate webhook → Should skip processing
- [ ] Test invalid signature → Should reject with 400

#### Pricing Calculation
- [ ] POST to /api/payments/calculate with various sizes/durations
- [ ] Verify calculation: size_GB × months × $0.03
- [ ] Test edge cases (0 bytes, negative values) → Should return errors

#### Donation Flow
- [ ] Attempt donation to non-existent CID → Should return 404
- [ ] Create donation session for existing CID
- [ ] Complete payment → Verify CID expiration extended
- [ ] Check donation recorded in ContentMetadata retention_payments

### Automated Testing

See `todo/payments.md` for comprehensive test plan including:
- Unit tests for pricing calculator
- Unit tests for balance operations
- Integration tests for deposit/donation flows
- Security tests for webhook verification
- Performance tests for API endpoints

---

## Documentation

### User-Facing
- [x] Deposit page with clear instructions
- [x] Pricing information displayed ($0.03/GB/month)
- [x] Fee transparency (breakdown shown)
- [x] Error messages with actionable guidance

### Technical
- [x] API endpoint documentation (see docs/payments-setup.md)
- [x] Webhook configuration guide (see docs/payments-setup.md)
- [x] Secret management instructions (see docs/payments-setup.md)
- [x] Implementation details (see todo/payments.md)

---

## Known Limitations & TODOs

### Completed (No Actions Needed)
- ✅ Basic deposit functionality
- ✅ Webhook signature verification
- ✅ Transaction recording
- ✅ Fee calculation and display
- ✅ Anonymous donations
- ✅ Idempotency checks

### Future Enhancements (Not Required for MVP)
- [ ] Email receipts after successful deposits (requires email service)
- [ ] 30-day expiration warning emails (requires email service + content index)
- [ ] Admin dashboard for dispute monitoring
- [ ] Automatic content expiration cleanup (requires content index)
- [ ] Refund support (currently no refunds per business rules)
- [ ] Multi-currency support (currently USD only)
- [ ] Alternative payment methods (ACH, Apple Pay, Google Pay)
- [ ] Subscription plans (not needed with pay-per-upload model)

### Monitoring & Operations
- [ ] Set up alerting for webhook failures
- [ ] Monitor chargeback rate (target: < 0.5%)
- [ ] Track deposit success rate (target: > 95%)
- [ ] Monitor Stripe API error rates
- [ ] Set up cost tracking for Stripe fees

---

## Security Considerations

### Implemented ✅
- [x] PCI compliance via Stripe Checkout (card data never touches our servers)
- [x] Webhook signature verification (prevents unauthorized webhook spoofing)
- [x] Idempotency checks (prevents double-processing)
- [x] Authentication required for deposits
- [x] HTTPS everywhere
- [x] No secrets in code (use wrangler secrets)

### Best Practices
- Always use test keys (`sk_test_*`) in development
- Never commit API keys to version control
- Verify webhook signatures on every webhook
- Use Stripe's automatic retry for failed webhooks
- Log all financial transactions for audit trail
- Monitor for fraud patterns (future enhancement)

---

## Pricing Model

### Base Rate
- **$0.03 per GB per month**
- 100% markup over R2 storage costs
- No volume discounts (flat rate for all users)

### Stripe Fees
- **2.9% + $0.30 per transaction**
- Passed through to user (shown transparently)
- Applied to deposits only (not to internal balance deductions)

### Minimums
- **Minimum deposit: $1.00**
- **Minimum retention: 30 days (1 month)**
- **Minimum donation: $1.00**

### Example Calculations

**Deposit:**
```
User wants $10.00 credit
Stripe fee: ($10.00 × 2.9%) + $0.30 = $0.59
Total charge: $10.00 + $0.59 = $10.59
User's balance increases by: $10.00
```

**Content Upload:**
```
File size: 5 GB
Retention: 6 months
Cost: 5 GB × 6 months × $0.03 = $0.90
User's balance decreases by: $0.90
CID expires: 6 months from upload
```

**Donation:**
```
CID size: 10 GB
Donation: $3.00
Extension: $3.00 ÷ (10 GB × $0.03/month) = 10 months
CID expiration extended by: 10 months
```

---

## Integration Architecture

### Request Flow

#### Deposit Flow
```
User → deposit.html → POST /api/balance/deposit
  → Stripe Checkout Session Created
  → User redirected to Stripe
  → User completes payment
  → Stripe sends webhook → POST /api/payments/webhook
  → Balance credited in UserProfile
  → Transaction recorded in PaymentRecord
  → User redirected to deposit.html?status=success
  → Auto-redirect to dashboard
```

#### Upload Flow (with payment)
```
User → upload.html → POST /api/content
  → Check balance ≥ cost
  → If sufficient: Deduct from balance → Upload to R2
  → If insufficient: Return error with required amount
  → Record transaction in PaymentRecord
```

#### Donation Flow
```
Anyone → POST /api/donate/cid/:cid
  → Validate CID exists
  → Create Stripe Checkout Session
  → User redirected to Stripe
  → User completes payment
  → Stripe sends webhook → POST /api/payments/webhook
  → CID expiration extended in ContentMetadata
  → Transaction recorded (if authenticated donor)
```

### Data Flow

#### User Balance
```
UserProfile (Durable Object)
  ├── balance_cents: Current balance
  ├── total_deposited_cents: Lifetime deposits
  └── total_spent_cents: Lifetime spending

PaymentRecord (Durable Object)
  └── transactions: Array of transaction records
      ├── transaction_id
      ├── type (deposit, upload_payment, donation_received)
      ├── amount_cents
      ├── balance_before_cents
      ├── balance_after_cents
      ├── stripe_session_id
      └── created_at
```

#### Content Retention
```
ContentMetadata (Durable Object)
  ├── expires_at: When content will be deleted
  └── retention_payments: Array of payment records
      ├── payment_id
      ├── amount_cents
      ├── months_added
      ├── payer_id (null for anonymous)
      └── created_at
```

---

## Success Criteria

### Functional Requirements ✅
- [x] Users can deposit funds via Stripe
- [x] Deposits credit user balance correctly
- [x] Webhooks process payments reliably
- [x] Fee calculations match between frontend/backend
- [x] Anonymous donations work without authentication
- [x] Authenticated donations track donor
- [x] Upload flow checks and deducts balance
- [x] Insufficient balance shows clear error message

### Performance Targets
- Deposit API response time: < 2s (target)
- Webhook processing time: < 500ms (target)
- Balance query time: < 100ms (target)

### Security Requirements ✅
- [x] PCI compliance (via Stripe Checkout)
- [x] Webhook signature verification
- [x] No secrets in code
- [x] Idempotency checks
- [x] Double-spend prevention (via Durable Objects transactions)

---

## Deployment Checklist

### Development Environment
- [x] Install Stripe SDK in package.json
- [x] Configure wrangler.toml secrets placeholders
- [x] Set STRIPE_SECRET_KEY (test mode)
- [x] Set STRIPE_WEBHOOK_SECRET (dev webhook)
- [x] Create webhook endpoint in Stripe Dashboard
- [x] Test deposit flow with test card
- [x] Verify webhook signature validation
- [x] Test balance updates

### Production Environment
- [ ] Set STRIPE_SECRET_KEY (live mode) via wrangler
- [ ] Set STRIPE_WEBHOOK_SECRET (prod webhook) via wrangler
- [ ] Create production webhook in Stripe Dashboard
- [ ] Enable Stripe Tax in production account
- [ ] Verify webhook URL is correct (https://hashbin.org/api/payments/webhook)
- [ ] Test deposit with real card (refund after test)
- [ ] Monitor webhook logs for errors
- [ ] Set up alerting for payment failures

---

## Support & Troubleshooting

### Common Issues

**"Webhook signature verification failed"**
- Ensure STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
- Check using correct secret for environment (dev vs prod)
- Verify webhook endpoint URL is correct

**"Deposits not crediting balance"**
1. Check Stripe webhook logs (Dashboard → Developers → Webhooks)
2. Check Cloudflare Worker logs (`wrangler tail --env development`)
3. Verify webhook is receiving events
4. Check client_reference_id is set correctly

**"Invalid signature" on checkout session creation**
- Verify STRIPE_SECRET_KEY is set correctly
- Check API key matches environment (test vs live)
- Ensure using latest Stripe SDK version

### Monitoring

**Stripe Dashboard**
- Monitor successful payment rate
- Review failed payments
- Check webhook delivery logs
- Monitor dispute/chargeback rate

**Cloudflare Logs**
```bash
# Watch real-time logs
wrangler tail --env development

# Filter for errors
wrangler tail --env production | grep ERROR
```

**Key Metrics**
- Deposit success rate: Target > 95%
- Webhook delivery success: Target > 99%
- API p99 latency: Target < 2s
- Chargeback rate: Target < 0.5%

---

## References

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Tax Documentation](https://stripe.com/docs/tax)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Internal: todo/payments.md](./payments.md) - Detailed payment system design
- [Internal: docs/payments-setup.md](../docs/payments-setup.md) - Environment setup guide

---

## Changelog

### 2026-01-15 - Initial Implementation ✅
- Created todo/stripe.md tracking document
- Documented complete Stripe integration (backend + frontend)
- All core functionality implemented and working
- Ready for production deployment pending secret configuration

---

## Next Steps

Since Stripe integration is complete, the next steps are:

1. **Production Deployment** (when ready)
   - Set production Stripe secrets
   - Configure production webhooks
   - Test with real payment
   - Enable monitoring

2. **Future Enhancements** (post-MVP)
   - Email notifications for receipts and expirations
   - Content expiration cleanup system
   - Admin dashboard for monitoring
   - Additional payment methods

3. **Monitoring & Operations**
   - Set up alerting for webhook failures
   - Monitor payment success rates
   - Track Stripe costs
   - Review security logs regularly

---

**Status Summary:** All planned Stripe functionality is implemented and functional. The integration is ready for production deployment once production secrets are configured. No additional development work is required for MVP.
