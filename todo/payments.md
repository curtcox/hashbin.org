# User Payments Implementation Plan

## Overview

HashBin.org operates on a **pay-to-publish, free-to-download** model. Users pay for content storage based on size and retention duration. This document outlines the implementation plan for the payment system.

## Business Model

### Pricing Formula
```
Cost = Size (GB) × Duration (months) × Base Rate
```

### Pricing Parameters
- **Base Rate**: $0.03 per GB per month (100% markup over R2 costs)
- **Minimum Payment**: $1.00
- **Maximum Retention**: TBD (see Open Questions)

---

## Architecture

### Payment Provider
**Stripe** - Handles payment processing, PCI compliance, and multi-currency support.

### Supported Payment Methods
- Credit/debit cards (Visa, Mastercard, Amex)
- Apple Pay
- Google Pay
- ACH bank transfers (US only)
- Cryptocurrency (via Stripe partners - future consideration)

### Data Flow
```
User → Checkout Request → Create Stripe Session → Redirect to Stripe
Stripe → Webhook → Update PaymentRecord DO → Update UserProfile DO
PaymentRecord DO → Store Transaction → Associate with Content Hash
```

---

## Implementation Components

### 1. PaymentRecord Durable Object

Stores individual payment transactions.

**Schema:**
```javascript
{
  payment_id: string,        // UUID, primary key
  payer_id: string,          // Clerk user ID
  hash_256t: string | null,  // Content hash (null until upload completes)
  amount_cents: number,      // Payment amount in cents
  currency: string,          // ISO 4217 currency code (e.g., "usd")
  status: string,            // pending | completed | failed | refunded
  stripe_session_id: string, // Stripe Checkout session ID
  stripe_payment_intent: string, // Stripe PaymentIntent ID
  content_size_bytes: number,  // Size being paid for
  retention_months: number,    // Duration purchased
  created_at: string,        // ISO 8601 timestamp
  completed_at: string | null, // When payment completed
  metadata: object           // Additional data (IP, user agent, etc.)
}
```

### 2. API Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/payments/calculate` | POST | No | Calculate price for given size/duration |
| `/api/payments/checkout` | POST | Yes | Create Stripe Checkout session |
| `/api/payments/webhook` | POST | Stripe Signature | Handle Stripe webhooks |
| `/api/payments/history` | GET | Yes | Get user's payment history |
| `/api/payments/:id` | GET | Yes | Get specific payment details |
| `/api/payments/:id/receipt` | GET | Yes | Download payment receipt |

### 3. Stripe Webhook Events

Events to handle:
- `checkout.session.completed` - Payment successful
- `checkout.session.expired` - Session expired without payment
- `payment_intent.payment_failed` - Payment failed
- `charge.refunded` - Refund processed (if refunds are supported)
- `charge.dispute.created` - Chargeback initiated

### 4. UserProfile Integration

Add payment tracking to UserProfile DO:
```javascript
{
  // ... existing fields
  payment_ids: string[],      // List of payment IDs
  total_spent_cents: number,  // Lifetime spend
  active_subscriptions: [],   // Future: recurring payments
}
```

---

## Open Questions

### Pricing & Business

1. **What is the maximum retention duration?**
   - Options: 1 year, 5 years, 10 years, unlimited?
   - Affects: Pricing tiers, storage planning

2. **Should there be volume discounts?**
   - Example: 10% off for >100GB, 20% off for >1TB
   - Affects: Pricing calculation logic

3. **Is prepaid credit/wallet supported?**
   - User deposits funds, then uses balance for uploads
   - Simplifies small transactions, reduces Stripe fees

4. **What currencies are supported?**
   - USD only vs. multi-currency
   - Stripe handles conversion but we need to decide display currency

5. **Are refunds supported?**
   - Master plan says "no refunds" - confirm this
   - What about failed uploads after payment?

6. **What happens if content is contested and removed?**
   - User paid for storage but content was taken down
   - Refund? Credit? Nothing?

### Technical

7. **How is payment linked to content upload?**
   - Option A: Pay first, get upload token, then upload
   - Option B: Upload to temp storage, pay, then make permanent
   - Option C: Estimate size, pay, upload, reconcile difference

8. **How are content size estimates handled?**
   - User estimates size before upload - what if actual size differs?
   - Tolerance threshold? Automatic adjustment?

9. **What is the payment timeout window?**
   - How long does a checkout session remain valid?
   - Stripe default is 24 hours, do we want shorter?

10. **How are Stripe fees handled?**
    - Absorb into margin vs. pass through to user
    - Stripe fees: 2.9% + $0.30 per transaction

11. **What happens to payments if user deletes account?**
    - Content remains until expiration? Immediate deletion?
    - Retain payment records for compliance

12. **Multi-region Stripe accounts?**
    - Single global Stripe account vs. regional accounts
    - Tax implications vary by region

### User Experience

13. **Is guest checkout supported?**
    - Pay without creating an account?
    - How to associate content with anonymous payer?

14. **What email notifications are sent?**
    - Payment confirmation
    - Receipt
    - Upcoming expiration warning
    - Failed payment retry

15. **What is the expiration warning timeline?**
    - 30 days? 7 days? 1 day before expiration?
    - Allow one-click retention extension?

### Compliance & Security

16. **What payment data is logged?**
    - PCI compliance requires careful handling
    - Never log full card numbers, CVV, etc.

17. **What fraud prevention measures are needed?**
    - Stripe Radar? Additional checks?
    - Rate limiting on checkout creation?

18. **What tax handling is required?**
    - US sales tax varies by state
    - EU VAT requirements
    - Use Stripe Tax or external provider?

---

## Test Plan

### Unit Tests - Pricing Calculator

```
describe('PricingCalculator', () => {
  // Basic calculations
  - should calculate price for 1 GB for 1 month ($0.03)
  - should calculate price for 10 GB for 1 month ($0.30)
  - should calculate price for 1 GB for 12 months ($0.36)
  - should calculate price for 100 GB for 6 months ($18.00)

  // Minimum payment enforcement
  - should enforce $1.00 minimum for small files
  - should return $1.00 for 1 MB for 1 month (calculated: $0.00003)
  - should return $1.00 for 100 MB for 1 month (calculated: $0.003)
  - should return exactly calculated price when above minimum

  // Edge cases - size
  - should handle 0 bytes (error or minimum?)
  - should handle negative size (error)
  - should handle extremely large size (1 PB)
  - should handle fractional bytes (round up to nearest byte)
  - should handle size as string input (parse or error?)

  // Edge cases - duration
  - should handle 0 months (error)
  - should handle negative months (error)
  - should handle fractional months (round up?)
  - should handle maximum duration limit
  - should handle duration exceeding maximum (error)

  // Precision handling
  - should round final price to 2 decimal places
  - should avoid floating point errors (0.1 + 0.2 !== 0.3)
  - should use integer cents internally for calculations

  // Currency
  - should return amount in cents for API consistency
  - should format display amount correctly (e.g., "$1.50")
  - should handle different currency codes (if multi-currency)

  // Volume discounts (if implemented)
  - should apply 10% discount for >100GB
  - should apply 20% discount for >1TB
  - should apply maximum discount cap
  - should calculate discount before minimum check
});
```

### Unit Tests - PaymentRecord Durable Object

```
describe('PaymentRecord DO', () => {
  // Creation
  - should create payment record with valid data
  - should generate UUID for payment_id
  - should set status to 'pending' on creation
  - should store stripe_session_id
  - should record created_at timestamp
  - should associate with payer_id

  // Validation
  - should reject payment without payer_id
  - should reject payment without stripe_session_id
  - should reject negative amount
  - should reject zero amount
  - should reject invalid currency code
  - should reject negative content_size_bytes
  - should reject negative retention_months

  // Status transitions
  - should transition from pending to completed
  - should transition from pending to failed
  - should transition from completed to refunded (if supported)
  - should reject invalid status transitions (completed → pending)
  - should reject transition from failed to completed
  - should record completed_at when transitioning to completed

  // Content association
  - should allow null hash_256t initially
  - should update hash_256t after upload completes
  - should reject updating hash_256t on non-pending payment
  - should validate hash_256t format when set

  // Queries
  - should retrieve payment by payment_id
  - should return 404 for non-existent payment_id
  - should list payments by payer_id
  - should filter payments by status
  - should filter payments by date range
  - should paginate payment list results

  // Concurrency
  - should handle concurrent status updates safely
  - should use optimistic locking or transactions
  - should prevent double-completion of same payment
});
```

### Unit Tests - Stripe Webhook Handler

```
describe('Stripe Webhook Handler', () => {
  // Signature verification
  - should accept valid Stripe signature
  - should reject missing signature header
  - should reject invalid signature
  - should reject expired signature (timestamp tolerance)
  - should reject replayed webhook (duplicate event ID)

  // checkout.session.completed
  - should update payment status to completed
  - should record stripe_payment_intent
  - should update UserProfile total_spent
  - should return 200 OK on success
  - should handle missing payment record gracefully
  - should be idempotent (handle duplicate events)

  // checkout.session.expired
  - should update payment status to failed
  - should not affect UserProfile balance
  - should clean up any reserved resources

  // payment_intent.payment_failed
  - should update payment status to failed
  - should record failure reason in metadata
  - should trigger retry notification (if applicable)

  // charge.refunded (if supported)
  - should update payment status to refunded
  - should update UserProfile total_spent
  - should handle partial refunds

  // charge.dispute.created
  - should flag payment as disputed
  - should notify admin/support
  - should potentially pause content access

  // Error handling
  - should return 400 for malformed JSON
  - should return 400 for unknown event types
  - should return 500 and retry for transient errors
  - should log errors without exposing internal details
});
```

### Unit Tests - Checkout API

```
describe('POST /api/payments/checkout', () => {
  // Authentication
  - should require authentication
  - should reject anonymous requests with 401
  - should reject invalid JWT with 401
  - should reject expired JWT with 401
  - should accept valid API key authentication

  // Request validation
  - should require content_size_bytes field
  - should require retention_months field
  - should reject non-numeric content_size_bytes
  - should reject non-numeric retention_months
  - should reject size below minimum (if any)
  - should reject size above maximum (if any)
  - should reject duration below minimum (1 month?)
  - should reject duration above maximum

  // Success response
  - should return checkout session URL
  - should return payment_id
  - should return calculated price
  - should create pending PaymentRecord
  - should associate payment with authenticated user

  // Stripe integration
  - should create Stripe Checkout session
  - should set correct line item amount
  - should set success_url correctly
  - should set cancel_url correctly
  - should pass payment_id in metadata

  // Rate limiting
  - should enforce rate limit on checkout creation
  - should return 429 when rate limit exceeded
  - should include Retry-After header

  // Error handling
  - should handle Stripe API errors gracefully
  - should return 503 if Stripe is unavailable
  - should not create PaymentRecord if Stripe fails
});
```

### Unit Tests - Payment History API

```
describe('GET /api/payments/history', () => {
  // Authentication
  - should require authentication
  - should reject anonymous requests
  - should only return payments for authenticated user
  - should not allow accessing other users' payments

  // Response format
  - should return array of payment objects
  - should include payment_id, amount, status, created_at
  - should not include sensitive Stripe details
  - should order by created_at descending

  // Pagination
  - should support limit parameter
  - should support offset parameter
  - should default to reasonable limit (e.g., 20)
  - should cap maximum limit (e.g., 100)
  - should return total count for pagination

  // Filtering
  - should filter by status (completed, pending, failed)
  - should filter by date range (from, to)
  - should filter by hash_256t (find payment for specific content)

  // Empty state
  - should return empty array for users with no payments
  - should return 200 (not 404) for empty results
});
```

### Unit Tests - Price Calculation API

```
describe('POST /api/payments/calculate', () => {
  // No auth required
  - should work without authentication
  - should work with authentication

  // Request validation
  - should require content_size_bytes
  - should require retention_months
  - should reject invalid inputs

  // Response format
  - should return calculated price in cents
  - should return formatted display price
  - should return breakdown (base cost, fees, total)
  - should indicate if minimum was applied

  // Consistency
  - should match actual checkout price exactly
  - should be deterministic (same inputs → same output)
});
```

### Integration Tests - Payment Flow

```
describe('Complete Payment Flow', () => {
  // Happy path
  - should complete full flow: calculate → checkout → webhook → verify
  - should update user payment history after completion
  - should enable content upload after payment

  // Failed payment
  - should handle card declined gracefully
  - should allow retry after failure
  - should not enable upload for failed payment

  // Abandoned checkout
  - should mark payment as failed after session expires
  - should clean up any reserved resources
  - should allow new checkout for same content

  // Multiple payments
  - should handle multiple concurrent checkouts
  - should isolate payments between users
  - should aggregate total_spent correctly
});
```

### Integration Tests - Content Upload After Payment

```
describe('Content Upload with Payment', () => {
  // Upload flow (depends on chosen option)
  - should require valid payment before upload
  - should validate content size matches payment
  - should associate hash_256t with payment after upload
  - should reject upload if payment not completed
  - should reject upload if content exceeds paid size

  // Size reconciliation
  - should handle exact size match
  - should handle upload smaller than paid
  - should handle upload larger than paid (error or charge diff?)
  - should handle multiple uploads under same payment (if allowed)
});
```

### Integration Tests - Retention Extension

```
describe('Retention Extension', () => {
  // Extension flow
  - should allow extending retention for existing content
  - should calculate price based on current size
  - should add time to existing expiration
  - should create new PaymentRecord for extension
  - should link extension payment to original content

  // Validation
  - should only allow owner to extend retention
  - should reject extension for non-existent content
  - should reject extension for contested content (?)
  - should handle concurrent extension attempts
});
```

### E2E Tests

```
describe('E2E Payment Scenarios', () => {
  // New user journey
  - should allow new user to sign up and make first payment
  - should display payment in history after completion
  - should enable upload after payment clears

  // Returning user
  - should show payment history for existing user
  - should allow additional payments
  - should maintain running total

  // Extension scenario
  - should allow extending expiring content
  - should reflect extended expiration after payment

  // Edge cases
  - should handle network failure during checkout redirect
  - should handle browser close during payment
  - should handle webhook delivery delay
  - should recover from partial failures
});
```

### Security Tests

```
describe('Payment Security', () => {
  // Access control
  - should not expose payment details of other users
  - should not allow modifying payment records via API
  - should validate all inputs to prevent injection

  // Webhook security
  - should reject webhooks without valid signature
  - should not process duplicate webhook events
  - should rate limit webhook endpoint

  // Data protection
  - should not log full card numbers
  - should not log CVV codes
  - should encrypt sensitive data at rest
  - should use HTTPS for all payment endpoints

  // Fraud prevention
  - should detect rapid successive checkout attempts
  - should flag unusual payment patterns
  - should integrate with Stripe Radar (if enabled)
});
```

### Performance Tests

```
describe('Payment Performance', () => {
  // Response times
  - should calculate price in <100ms
  - should create checkout in <2s
  - should process webhook in <500ms
  - should return history in <200ms

  // Concurrency
  - should handle 100 concurrent checkout requests
  - should handle 1000 concurrent price calculations
  - should not deadlock under high load

  // Reliability
  - should recover from Stripe timeout
  - should retry failed webhook deliveries
  - should maintain consistency during failures
});
```

---

## Implementation Phases

### Phase 4.1: Core Payment Infrastructure
1. Implement PaymentRecord Durable Object schema
2. Add Stripe SDK dependency
3. Create price calculation utility
4. Implement `/api/payments/calculate` endpoint
5. Add unit tests for pricing logic

### Phase 4.2: Checkout Flow
1. Implement `/api/payments/checkout` endpoint
2. Create Stripe Checkout session integration
3. Implement checkout success/cancel pages
4. Add unit tests for checkout flow

### Phase 4.3: Webhook Processing
1. Implement `/api/payments/webhook` endpoint
2. Add Stripe signature verification
3. Handle checkout.session.completed event
4. Handle checkout.session.expired event
5. Add unit tests for webhook handling

### Phase 4.4: User Integration
1. Update UserProfile DO with payment tracking
2. Implement `/api/payments/history` endpoint
3. Implement `/api/payments/:id` endpoint
4. Link payments to content uploads
5. Add integration tests

### Phase 4.5: Polish & Hardening
1. Add receipt generation
2. Implement email notifications
3. Add fraud prevention measures
4. Performance optimization
5. Add E2E tests
6. Security audit

---

## Environment Configuration

### Required Secrets (wrangler.toml)
```toml
[vars]
STRIPE_PUBLISHABLE_KEY = "pk_test_..." # or pk_live_...

# Secrets (via wrangler secret put)
# STRIPE_SECRET_KEY = "sk_test_..." or "sk_live_..."
# STRIPE_WEBHOOK_SECRET = "whsec_..."
```

### Development vs Production
| Config | Development | Production |
|--------|-------------|------------|
| Stripe Keys | `sk_test_*` | `sk_live_*` |
| Webhook URL | `dev.hashbin.org/api/payments/webhook` | `hashbin.org/api/payments/webhook` |
| Success URL | `dev.hashbin.org/payments/success` | `hashbin.org/payments/success` |
| Cancel URL | `dev.hashbin.org/payments/cancel` | `hashbin.org/payments/cancel` |

---

## Dependencies

### New npm packages
```json
{
  "stripe": "^14.0.0"
}
```

### Existing dependencies leveraged
- `@clerk/backend` - User authentication context
- Cloudflare Durable Objects - Transaction storage

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PCI compliance violation | High | Use Stripe Checkout (hosted), never touch card data |
| Webhook delivery failure | Medium | Idempotent handlers, Stripe auto-retry, manual reconciliation |
| Double-charging user | High | Idempotent checkout creation, payment record checks |
| Exchange rate fluctuation | Low | Single currency (USD) initially |
| Stripe outage | Medium | Graceful degradation, clear error messages |
| Fraud/chargebacks | Medium | Stripe Radar, rate limiting, monitoring |

---

## Success Metrics

- Payment success rate > 95%
- Checkout abandonment rate < 40%
- Webhook processing time p99 < 1s
- Zero PCI compliance violations
- Chargeback rate < 0.5%

---

## References

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Master Plan - Phase 4](./master_plan.md)
