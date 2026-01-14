# User Payments Implementation Plan

## Overview

HashBin.org operates on a **prepaid wallet, pay-to-publish, free-to-download** model. Users deposit funds into their account balance, then use that balance to pay for content storage. Uploads require sufficient balance to cover at least 30 days of storage.

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | Maximum retention duration | **Unlimited** |
| 2 | Volume discounts | **No** - flat rate for all users |
| 3 | Prepaid wallet support | **Yes** - required for uploads; must have 30+ days balance |
| 4 | Currencies supported | **USD only** |
| 5 | Refunds | **No refunds**; failed uploads are never charged |
| 6 | Contested content removal | **No payment impact** - no refund or credit |
| 7 | Payment-to-upload flow | **Pay first, then upload**; rejected if balance < 30 days |
| 8 | Size estimates | **None** - real-time feedback on upload attempt |
| 9 | Checkout session timeout | **Stripe default** (24 hours) |
| 10 | Stripe fee handling | **Pass through to user**, clearly labeled |
| 11 | Account deletion | **No impact on content**; users can pay for others' content |
| 12 | Multi-region Stripe | **Single account** |
| 13 | Guest checkout | **Anonymous donations allowed**; anonymous uploads NOT allowed |
| 14 | Email notifications | Payment confirmation, receipt, 30-day expiration warning |
| 15 | Expiration warning | **30 days** before expiration |
| 16 | Payment data logged | Beginning balance, ending balance, external transaction number |
| 17 | Fraud prevention | **Deferred** to later phase |
| 18 | Tax handling | **Stripe Tax** |

---

## Business Model

### Pricing Formula
```
Storage Cost = Size (GB) × Duration (months) × $0.03
Total Cost = Storage Cost + Stripe Fees
```

### Pricing Parameters
- **Base Rate**: $0.03 per GB per month (100% markup over R2 costs)
- **Minimum Deposit**: $1.00
- **Stripe Fees**: 2.9% + $0.30 per transaction (passed through to user)
- **Maximum Retention**: Unlimited
- **Minimum Balance for Upload**: 30 days of storage for the content size

### Fee Display Example
```
Content size: 10 GB
Retention: 6 months
─────────────────────────
Storage cost:     $1.80
Stripe fee:       $0.35  (2.9% + $0.30)
─────────────────────────
Total deposit:    $2.15
```

---

## Architecture

### Payment Provider
**Stripe** - Handles payment processing, PCI compliance, and tax calculation.

### Supported Payment Methods
- Credit/debit cards (Visa, Mastercard, Amex)
- Apple Pay
- Google Pay
- ACH bank transfers (US only)

### Core Concepts

#### Account Balance (Wallet)
Each user has a USD balance that:
- Increases when they deposit funds via Stripe
- Decreases as storage costs accrue over time
- Must maintain 30+ days of projected storage to upload

#### Balance Depletion
Storage costs are continuously deducted from the user's balance based on:
- Total size of all stored content
- Time elapsed since last calculation

#### Anonymous Donations
Users can:
- Donate to another user's account (by user ID)
- Pay for storage of any existing CID (extends retention)
- Cannot upload anonymously

### Data Flow

#### Deposit Flow
```
User → Deposit Request → Create Stripe Session → Redirect to Stripe
Stripe → Webhook → Credit UserProfile Balance → Send Receipt
```

#### Upload Flow
```
User → Upload Request → Check Balance ≥ 30 days storage
If sufficient → Accept Upload → Associate CID → Start Deducting
If insufficient → Reject with detailed message (current balance, required, shortfall)
```

#### Donation Flow
```
Anonymous User → Donate to CID/User → Create Stripe Session
Stripe → Webhook → Credit Target Account/Extend CID Retention
```

---

## Implementation Components

### 1. UserProfile Durable Object (Updated)

Add wallet/balance tracking:
```javascript
{
  // ... existing fields
  balance_cents: number,           // Current USD balance in cents
  balance_updated_at: string,      // Last balance calculation timestamp
  total_deposited_cents: number,   // Lifetime deposits
  total_storage_used_bytes: number, // Current total stored content size
  deposit_ids: string[],           // List of deposit transaction IDs
}
```

### 2. DepositRecord Durable Object

Stores deposit transactions (replacing PaymentRecord concept):
```javascript
{
  deposit_id: string,              // UUID, primary key
  depositor_id: string | null,     // Clerk user ID (null for anonymous)
  recipient_id: string | null,     // Target user ID (for donations)
  target_cid: string | null,       // Target CID (for CID-specific payments)
  amount_cents: number,            // Deposit amount in cents
  stripe_fee_cents: number,        // Stripe fee passed through
  net_amount_cents: number,        // Amount credited to balance
  status: string,                  // pending | completed | failed
  stripe_session_id: string,       // Stripe Checkout session ID
  stripe_payment_intent: string,   // Stripe PaymentIntent ID
  beginning_balance_cents: number, // Balance before deposit
  ending_balance_cents: number,    // Balance after deposit
  created_at: string,              // ISO 8601 timestamp
  completed_at: string | null,     // When deposit completed
}
```

### 3. API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/balance` | GET | Yes | Get current balance and storage costs |
| `/api/balance/deposit` | POST | Yes | Create deposit checkout session |
| `/api/balance/history` | GET | Yes | Get deposit/deduction history |
| `/api/donate/user/:userId` | POST | No* | Donate to another user's balance |
| `/api/donate/cid/:cid` | POST | No* | Pay for specific CID storage |
| `/api/payments/webhook` | POST | Stripe | Handle Stripe webhooks |
| `/api/payments/calculate` | POST | No | Calculate storage cost for size/duration |

*Anonymous donations require Stripe payment but not HashBin account

### 4. Stripe Webhook Events

Events to handle:
- `checkout.session.completed` - Deposit successful, credit balance
- `checkout.session.expired` - Session expired, no action needed
- `payment_intent.payment_failed` - Payment failed, log for debugging
- `charge.dispute.created` - Chargeback, flag account

### 5. Balance Calculation Engine

Runs on every balance-affecting operation:
```javascript
function calculateCurrentBalance(user) {
  const timeSinceLastUpdate = now() - user.balance_updated_at;
  const dailyCost = (user.total_storage_used_bytes / GB) * 0.03 / 30;
  const costSinceLastUpdate = dailyCost * timeSinceLastUpdate.days;
  return user.balance_cents - costSinceLastUpdate;
}
```

---

## Open Questions

### Balance & Wallet Mechanics

1. **What is the balance deduction frequency?**
   - Options: Real-time (on every check), hourly, daily, monthly
   - Affects: Computational overhead, balance accuracy, user experience
   - Recommendation: Real-time calculation on read, daily snapshot for records

2. **What happens when balance reaches zero?**
   - Content immediately deleted?
   - Grace period before deletion? How long?
   - Content frozen (no new uploads) but existing content preserved temporarily?

3. **Is there a minimum deposit amount?**
   - $1.00 minimum makes sense given Stripe's $0.30 fixed fee
   - Should there be a maximum single deposit?

4. **How is balance displayed to the user?**
   - Current balance only?
   - Projected days remaining at current storage level?
   - Burn rate ($/day)?

5. **Can balance go negative?**
   - If timing allows deductions to exceed balance slightly
   - Or enforce hard floor at $0.00?

6. **How are donations to a CID handled?**
   - Credit the CID owner's account?
   - Create separate retention fund for that specific CID?
   - What if CID has no owner (anonymous upload - but wait, anonymous uploads aren't allowed)?

7. **Can users transfer balance to each other?**
   - Peer-to-peer balance transfer vs. only via Stripe donation?

8. **What is the upload rejection message format?**
   - Example: "Insufficient balance. You have $0.50 (15 days). This upload requires $1.00 (30 days). Please deposit at least $0.50."
   - Should we suggest the exact deposit amount needed?

---

## Test Plan

### Unit Tests - Pricing Calculator

```
describe('PricingCalculator', () => {
  // Basic calculations
  - should calculate storage cost for 1 GB for 1 month ($0.03)
  - should calculate storage cost for 10 GB for 1 month ($0.30)
  - should calculate storage cost for 1 GB for 12 months ($0.36)
  - should calculate storage cost for 100 GB for 6 months ($18.00)

  // Stripe fee calculations
  - should calculate Stripe fee as 2.9% + $0.30
  - should calculate total (storage + fee) correctly
  - should display fee separately from storage cost
  - should handle fee on $1.00 deposit ($0.33 fee, $0.67 net)
  - should handle fee on $100 deposit ($3.20 fee, $96.80 net)

  // Minimum deposit enforcement
  - should enforce $1.00 minimum deposit
  - should reject deposit below $1.00

  // Edge cases - size
  - should handle 0 bytes (no storage cost)
  - should handle negative size (error)
  - should handle extremely large size (1 PB)
  - should handle fractional bytes (round up to nearest byte)

  // Edge cases - duration
  - should calculate for fractional months correctly
  - should handle very long durations (10 years)

  // Precision handling
  - should round final price to nearest cent
  - should avoid floating point errors
  - should use integer cents internally

  // 30-day minimum calculations
  - should calculate 30-day cost for given file size
  - should determine if balance covers 30 days
  - should calculate shortfall amount
});
```

### Unit Tests - Balance Engine

```
describe('BalanceEngine', () => {
  // Balance calculation
  - should return full balance when no storage used
  - should deduct proportional amount for storage over time
  - should calculate correctly for 1 GB stored for 1 day
  - should calculate correctly for 100 GB stored for 30 days
  - should handle multiple content items summed together
  - should update balance_updated_at after calculation

  // Time-based deductions
  - should deduct nothing for 0 seconds elapsed
  - should deduct proportionally for partial days
  - should handle timezone correctly (use UTC)
  - should handle leap seconds/days gracefully

  // Edge cases
  - should never return negative balance
  - should handle balance exactly reaching zero
  - should handle very small balances (fractions of a cent)
  - should handle very large storage (petabytes)

  // Concurrency
  - should handle concurrent balance reads
  - should serialize balance writes
  - should prevent race conditions in deposit + deduction
});
```

### Unit Tests - Upload Validation

```
describe('UploadValidation', () => {
  // Balance checks
  - should allow upload when balance covers 30+ days
  - should reject upload when balance covers < 30 days
  - should reject upload when balance is zero
  - should calculate required balance based on file size

  // Rejection messages
  - should include current balance in rejection
  - should include required balance in rejection
  - should include shortfall amount in rejection
  - should include days of coverage in rejection
  - should suggest deposit amount

  // Edge cases
  - should handle exact 30-day balance (allow)
  - should handle 29.9-day balance (reject)
  - should handle zero-byte file (allow? or error?)
  - should handle user with no prior deposits

  // After successful upload
  - should associate CID with user
  - should add file size to total_storage_used_bytes
  - should recalculate balance immediately
  - should start deduction clock
});
```

### Unit Tests - Deposit API

```
describe('POST /api/balance/deposit', () => {
  // Authentication
  - should require authentication
  - should reject anonymous requests with 401
  - should accept valid JWT
  - should accept valid API key

  // Request validation
  - should require amount field
  - should reject amount below $1.00
  - should reject non-numeric amount
  - should reject negative amount

  // Success response
  - should return Stripe checkout URL
  - should return deposit_id
  - should return amount breakdown (deposit, fee, net credit)
  - should create pending DepositRecord

  // Stripe integration
  - should create Stripe Checkout session
  - should set correct amount (including fees)
  - should set success_url with deposit_id
  - should set cancel_url
  - should enable Stripe Tax

  // Error handling
  - should handle Stripe API errors
  - should return 503 if Stripe unavailable
  - should not create deposit record if Stripe fails
});
```

### Unit Tests - Anonymous Donation API

```
describe('POST /api/donate/user/:userId', () => {
  // No auth required
  - should work without authentication
  - should work with authentication (for receipt)

  // Request validation
  - should require amount field
  - should reject amount below $1.00
  - should validate userId exists
  - should reject donation to non-existent user

  // Success response
  - should return Stripe checkout URL
  - should return donation_id
  - should indicate recipient

  // After completion
  - should credit recipient's balance
  - should record donor info if authenticated
  - should record as anonymous if not authenticated
});

describe('POST /api/donate/cid/:cid', () => {
  // Validation
  - should validate CID exists
  - should validate CID format
  - should reject donation to non-existent CID

  // Success flow
  - should calculate current storage cost for CID
  - should extend retention based on donation amount
  - should credit owner's balance (if CID has owner)

  // Edge cases
  - should handle CID with no owner
  - should handle contested CID
  - should handle expired CID
});
```

### Unit Tests - Balance History API

```
describe('GET /api/balance/history', () => {
  // Authentication
  - should require authentication
  - should reject anonymous requests
  - should only return own history

  // Response format
  - should include deposits with beginning/ending balance
  - should include storage deductions
  - should order by timestamp descending
  - should include transaction type (deposit, deduction, donation_received)

  // Pagination
  - should support limit parameter
  - should support offset parameter
  - should default to 20 items

  // Filtering
  - should filter by transaction type
  - should filter by date range
});
```

### Unit Tests - Stripe Webhook Handler

```
describe('Stripe Webhook Handler', () => {
  // Signature verification
  - should accept valid Stripe signature
  - should reject missing signature header
  - should reject invalid signature
  - should reject expired signature
  - should reject replayed webhook (duplicate event ID)

  // checkout.session.completed - Deposit
  - should update deposit status to completed
  - should credit user balance
  - should record beginning_balance and ending_balance
  - should update total_deposited_cents
  - should send receipt email
  - should be idempotent

  // checkout.session.completed - Donation
  - should credit recipient's balance
  - should record donor info
  - should notify recipient (if they have email notifications)

  // checkout.session.expired
  - should update deposit status to expired
  - should not affect any balance

  // charge.dispute.created
  - should flag account for review
  - should log dispute details
  - should notify admin

  // Error handling
  - should return 400 for malformed JSON
  - should return 200 for unknown event types (Stripe best practice)
  - should log errors securely
});
```

### Unit Tests - Current Balance API

```
describe('GET /api/balance', () => {
  // Authentication
  - should require authentication
  - should return own balance only

  // Response format
  - should return current_balance_cents
  - should return total_storage_bytes
  - should return daily_burn_rate_cents
  - should return days_remaining (at current rate)
  - should return last_updated timestamp

  // Calculations
  - should calculate real-time balance (deduct since last update)
  - should return 0 for users with no deposits
  - should handle users with balance but no storage
  - should return Infinity days_remaining if no storage
});
```

### Integration Tests - Deposit Flow

```
describe('Deposit Flow', () => {
  // Happy path
  - should complete: request → Stripe → webhook → balance updated
  - should reflect new balance in /api/balance
  - should appear in /api/balance/history
  - should enable previously-blocked upload

  // Failed deposit
  - should handle card declined
  - should not affect balance on failure
  - should allow retry

  // Abandoned checkout
  - should timeout after 24 hours
  - should not affect balance
  - should allow new deposit attempt
});
```

### Integration Tests - Upload with Balance

```
describe('Upload with Balance Check', () => {
  // Happy path
  - should accept upload when balance sufficient
  - should associate CID with user
  - should start deducting from balance
  - should reflect in total_storage_used_bytes

  // Insufficient balance
  - should reject upload with detailed message
  - should not create any content record
  - should not affect balance
  - should allow retry after deposit

  // Balance edge cases
  - should handle exact 30-day threshold
  - should handle rapid successive uploads
  - should handle upload during deposit processing
});
```

### Integration Tests - Donation Flow

```
describe('Donation Flow', () => {
  // Donate to user
  - should credit recipient balance
  - should not affect donor's HashBin balance (just Stripe charge)
  - should appear in recipient's history
  - should send notification to recipient

  // Donate to CID
  - should extend CID retention
  - should credit owner's balance
  - should calculate extension correctly

  // Anonymous donation
  - should work without HashBin account
  - should still process through Stripe
  - should record as anonymous in history
});
```

### Integration Tests - Balance Depletion

```
describe('Balance Depletion', () => {
  // Normal depletion
  - should reduce balance over time proportionally
  - should match expected daily burn rate
  - should handle multiple content items

  // Low balance warnings
  - should send warning at 30 days remaining
  - should include balance details in warning
  - should include deposit link

  // Zero balance
  - should stop at zero (not go negative)
  - should trigger content expiration flow
  - should prevent new uploads
});
```

### E2E Tests

```
describe('E2E Payment Scenarios', () => {
  // New user journey
  - should sign up → deposit → upload → verify content accessible
  - should show balance decrease over time
  - should receive 30-day warning email

  // Returning user
  - should show existing balance
  - should allow additional deposits
  - should aggregate total correctly

  // Donation scenario
  - should allow anonymous donation to popular CID
  - should extend retention for that content
  - should notify content owner

  // Edge cases
  - should handle network failure during checkout
  - should handle webhook delivery delay
  - should maintain consistency during failures
});
```

### Security Tests

```
describe('Payment Security', () => {
  // Access control
  - should not expose other users' balances
  - should not allow modifying balance via API
  - should validate all inputs

  // Webhook security
  - should reject invalid signatures
  - should prevent replay attacks
  - should rate limit webhook endpoint

  // Data protection
  - should only log allowed fields (beginning/ending balance, txn number)
  - should not log card details
  - should use HTTPS everywhere

  // Balance integrity
  - should prevent double-crediting from same webhook
  - should prevent balance manipulation
  - should audit all balance changes
});
```

### Performance Tests

```
describe('Payment Performance', () => {
  // Response times
  - should return balance in <100ms
  - should create deposit checkout in <2s
  - should process webhook in <500ms

  // Concurrency
  - should handle concurrent balance reads
  - should handle concurrent deposits
  - should maintain balance consistency under load

  // Scale
  - should handle user with 10,000 content items
  - should calculate balance efficiently
});
```

---

## Implementation Phases

### Phase 4.1: Balance Infrastructure
1. Add balance fields to UserProfile DO
2. Implement balance calculation engine
3. Create `/api/balance` endpoint
4. Add unit tests for balance logic

### Phase 4.2: Deposit Flow
1. Create DepositRecord DO
2. Add Stripe SDK dependency
3. Implement `/api/balance/deposit` endpoint
4. Implement Stripe webhook handler
5. Add deposit integration tests

### Phase 4.3: Upload Integration
1. Add balance check to upload endpoint
2. Implement rejection messages with details
3. Update storage tracking on upload
4. Add upload validation tests

### Phase 4.4: Donations
1. Implement `/api/donate/user/:userId` endpoint
2. Implement `/api/donate/cid/:cid` endpoint
3. Add donation notification emails
4. Add donation integration tests

### Phase 4.5: Notifications & Polish
1. Implement 30-day warning emails
2. Add receipt generation
3. Implement balance history endpoint
4. Add E2E tests
5. Security review

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
| Success URL | `dev.hashbin.org/balance?deposit=success` | `hashbin.org/balance?deposit=success` |
| Cancel URL | `dev.hashbin.org/balance?deposit=cancel` | `hashbin.org/balance?deposit=cancel` |

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
| Webhook delivery failure | Medium | Idempotent handlers, Stripe auto-retry |
| Double-crediting balance | High | Check deposit status before crediting, idempotent webhooks |
| Balance calculation errors | High | Comprehensive unit tests, audit logging |
| Stripe outage | Medium | Graceful degradation, clear error messages |
| Content deleted while payment pending | Medium | Clearly document 30-day minimum requirement |

---

## Success Metrics

- Deposit success rate > 95%
- Balance calculation accuracy: 100%
- Webhook processing time p99 < 1s
- Zero PCI compliance violations
- Chargeback rate < 0.5%

---

## References

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Tax](https://stripe.com/docs/tax)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
