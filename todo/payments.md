# User Payments Implementation Plan

## Overview

HashBin.org operates on a **prepaid wallet, pay-per-upload** model:
- Users deposit funds into their account balance
- When uploading, users pay upfront for a specific retention duration
- Each CID has its own expiration time (time-to-deletion), independent of account balance
- Reading/downloading is always free
- Anyone can donate to extend a CID's retention

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | Maximum retention duration | **Unlimited** |
| 2 | Volume discounts | **No** - flat rate for all users |
| 3 | Prepaid wallet support | **Yes** - required for uploads; must cover 30+ days retention |
| 4 | Currencies supported | **USD only** |
| 5 | Refunds | **No refunds**; failed uploads are never charged |
| 6 | Contested content removal | **No payment impact** - no refund or credit |
| 7 | Payment-to-upload flow | **Pay from balance at upload time**; rejected if balance < 30 days cost |
| 8 | Size estimates | **None** - real-time feedback on upload attempt |
| 9 | Checkout session timeout | **Stripe default** (24 hours) |
| 10 | Stripe fee handling | **Pass through to user**, clearly labeled |
| 11 | Account deletion | **No impact on content**; content retained until its TTL expires |
| 12 | Multi-region Stripe | **Single account** |
| 13 | Guest checkout | **Anonymous donations to CIDs allowed**; anonymous uploads NOT allowed |
| 14 | Email notifications | Payment confirmation, receipt, 30-day expiration warning |
| 15 | Expiration warning | **30 days** before CID expiration |
| 16 | Payment data logged | Beginning balance, ending balance, external transaction number |
| 17 | Fraud prevention | **Deferred** to later phase |
| 18 | Tax handling | **Stripe Tax** |
| 19 | Balance deduction model | **No recurring deductions** - balance only changes on deposits/uploads |
| 20 | Balance vs content retention | **Independent** - balance is wallet money; CIDs have their own TTL |
| 21 | Minimum/maximum deposit | **$1.00 minimum**, no maximum |
| 22 | Balance display | **Current balance only** (no burn rate) |
| 23 | Negative balance | **Not allowed** - hard floor at $0.00 |
| 24 | CID donations | **Extend that CID's TTL** (not uploader's balance) |
| 25 | Peer-to-peer balance transfer | **TBD** - see [balance_transfer.md](balance_transfer.md) |
| 26 | Upload rejection message | "Your account balance is too low for the minimum retention of 30 days. That would cost {X} and you only have {Y} in your account. {Link}" |
| 27 | Retention duration selection | **Both** - presets + custom input |
| 28 | Minimum retention duration | **30 days**; no maximum for single payment |
| 29 | Self-extension of content | **Yes** - same as self-donation, available via both endpoints |
| 30 | CID expiration behavior | **Immediate deletion**; user can re-upload |
| 31 | Duplicate upload handling | **No owners, only uploaders**; second uploader's account debited to extend CID retention by 30 days |
| 32 | Self-donation allowed | **Yes** |
| 33 | Minimum donation amount | **$1.00** |
| 34 | CID donation notifications | **None** - no email notifications for donations |
| 35 | Retention presets | **1 month, 1 year, 1 decade, 1 century**; custom allows any multiple of 30 days |
| 36 | Duplicate upload notification | **Yes** - user sees message that CID already exists |
| 37 | Duplicate upload charging | **Yes** - always charged for 30 days minimum; can choose to pay for longer |
| 38 | Duplicate upload message | "Retention extended for 30 days. You can add more {link}." |
| 39 | Duplicate upload UX | Shows same presets + current expiration; must buy 30-day multiples/months/years (no target date picker) |
| 40 | Long retention pricing | **Flat rate** - no discounts for century-scale retention |
| 41 | Duplicate detection | **Both** - client-side warns before upload, server-side enforces |
| 42 | "Add more" link destination | **CID detail page** with extend option |
| 43 | Duplicate upload confirmation | **Automatic** - 30-day extension charged without confirmation prompt |
| 44 | CID existence check API | **Yes** - public endpoint `GET /api/content/:cid/exists` returns exists + expiration |
| 45 | Duplicate with insufficient balance | **Reject** - show insufficient balance message; don't extend |
| 46 | Duplicate upload behavior | **Extend retention + display message**; skip actual upload (content already exists) |

---

## Business Model

### Pricing Formula
```
Retention Cost = Size (GB) × Duration (months) × $0.03
```

### Pricing Parameters
- **Base Rate**: $0.03 per GB per month (100% markup over R2 costs)
- **Minimum Deposit**: $1.00
- **Minimum Retention**: 30 days
- **Maximum Retention**: Unlimited
- **Stripe Fees**: 2.9% + $0.30 per deposit (passed through to user)

### Key Concepts

#### Account Balance (Wallet)
- Money available to spend on uploads or retention extensions
- Increases when user deposits via Stripe
- Decreases when user uploads content (pays for retention)
- No recurring deductions - balance only changes on explicit transactions

#### CID Retention (Time-to-Deletion)
- Each CID has its own expiration timestamp
- Set at upload time based on paid duration
- Can be extended by anyone via donation
- Independent of uploader's account balance

### Example Scenarios

**Scenario 1: New Upload**
```
User balance: $5.00
Upload size: 10 GB
Requested retention: 3 months
─────────────────────────
Retention cost: 10 GB × 3 months × $0.03 = $0.90
─────────────────────────
New balance: $4.10
CID expires: 3 months from now
```

**Scenario 2: Insufficient Balance**
```
User balance: $0.50
Upload size: 100 GB
Minimum retention: 30 days (1 month)
─────────────────────────
Minimum cost: 100 GB × 1 month × $0.03 = $3.00
─────────────────────────
Result: REJECTED
Message: "Your account balance is too low for the minimum
retention of 30 days. That would cost $3.00 and you only
have $0.50 in your account. [Deposit more]"
```

**Scenario 3: Donation to CID**
```
CID size: 5 GB
Current expiration: 2025-03-01
Donation amount: $1.50
─────────────────────────
Extension: $1.50 ÷ (5 GB × $0.03/month) = 10 months
─────────────────────────
New expiration: 2026-01-01
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

### Data Flow

#### Deposit Flow
```
User → Deposit Request → Create Stripe Session → Redirect to Stripe
Stripe → Webhook → Credit UserProfile Balance → Send Receipt
```

#### Upload Flow
```
User → Upload Request (size, retention_months)
     → Calculate cost: size × months × $0.03
     → Check balance ≥ cost (minimum 30 days)
     → If sufficient: Deduct from balance → Store content → Set CID TTL
     → If insufficient: Return rejection message with details
```

#### CID Donation Flow
```
Anyone → Donate to CID → Create Stripe Session
Stripe → Webhook → Calculate extension → Update CID expiration
```

---

## Implementation Components

### 1. UserProfile Durable Object (Updated)

Add wallet tracking:
```javascript
{
  // ... existing fields
  balance_cents: number,           // Current USD balance in cents
  total_deposited_cents: number,   // Lifetime deposits
  total_spent_cents: number,       // Lifetime spend on uploads/extensions
}
```

### 2. ContentMetadata Durable Object (Updated)

Add retention tracking:
```javascript
{
  // ... existing fields
  hash_256t: string,              // Content hash
  size_bytes: number,             // Content size
  uploader_id: string,            // Clerk user ID who uploaded
  created_at: string,             // Upload timestamp
  expires_at: string,             // When content will be deleted
  retention_payments: [{          // History of payments for this CID
    payment_id: string,
    amount_cents: number,
    months_added: number,
    payer_id: string | null,      // null for anonymous
    created_at: string,
  }],
}
```

### 3. TransactionRecord Durable Object

Stores all financial transactions:
```javascript
{
  transaction_id: string,         // UUID, primary key
  type: string,                   // deposit | upload_payment | cid_extension | donation_received
  user_id: string,                // User whose balance changed
  amount_cents: number,           // Amount (positive for credits, negative for debits)
  balance_before_cents: number,   // Balance before transaction
  balance_after_cents: number,    // Balance after transaction
  stripe_session_id: string | null,  // For deposits
  stripe_payment_intent: string | null,
  cid: string | null,             // For upload/extension payments
  retention_months: number | null, // For upload/extension payments
  created_at: string,
}
```

### 4. API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/balance` | GET | Yes | Get current balance |
| `/api/balance/deposit` | POST | Yes | Create deposit checkout session |
| `/api/balance/history` | GET | Yes | Get transaction history |
| `/api/content/:cid` | GET | No | Get content metadata including expiration |
| `/api/content/:cid/extend` | POST | Yes | Extend own content's retention |
| `/api/donate/cid/:cid` | POST | No* | Donate to extend any CID's retention |
| `/api/payments/webhook` | POST | Stripe | Handle Stripe webhooks |
| `/api/payments/calculate` | POST | No | Calculate retention cost for size/duration |

*Anonymous donations require Stripe payment but not HashBin account

### 5. Upload Endpoint (Updated)

Existing upload endpoint gains payment logic:
```javascript
// POST /api/content
{
  content: File,
  retention_months: number,  // Minimum 1 (30 days)
}

// Response on success
{
  cid: string,
  size_bytes: number,
  expires_at: string,
  cost_cents: number,
  new_balance_cents: number,
}

// Response on insufficient balance
{
  error: "insufficient_balance",
  message: "Your account balance is too low for the minimum retention of 30 days. That would cost $3.00 and you only have $0.50 in your account.",
  required_cents: 300,
  balance_cents: 50,
  deposit_url: "/balance/deposit",
}
```

---

## Open Questions

*All payment questions resolved. See Decisions #1-46 above.*

*Peer-to-peer balance transfer is tracked separately in [balance_transfer.md](balance_transfer.md).*

---

## Test Plan

### Unit Tests - Pricing Calculator

```
describe('PricingCalculator', () => {
  // Basic retention cost calculations
  - should calculate cost for 1 GB for 1 month ($0.03)
  - should calculate cost for 10 GB for 1 month ($0.30)
  - should calculate cost for 1 GB for 12 months ($0.36)
  - should calculate cost for 100 GB for 6 months ($18.00)
  - should calculate cost for 500 MB for 1 month ($0.015 → $0.02 rounded)

  // Stripe fee calculations (deposits only)
  - should calculate Stripe fee as 2.9% + $0.30
  - should calculate net deposit after fees
  - should handle fee on $1.00 deposit ($0.33 fee, $0.67 net)
  - should handle fee on $100 deposit ($3.20 fee, $96.80 net)

  // Edge cases - size
  - should handle 0 bytes (error - cannot upload empty content)
  - should handle negative size (error)
  - should handle extremely large size (1 PB)
  - should handle fractional bytes (use exact bytes)

  // Edge cases - duration
  - should handle 0 months (error)
  - should handle negative months (error)
  - should handle fractional months (round up to nearest day?)
  - should handle very long durations (100 years)

  // Precision handling
  - should round final price to nearest cent
  - should avoid floating point errors
  - should use integer cents internally

  // 30-day minimum calculations
  - should calculate minimum cost for given file size
  - should determine if balance covers minimum retention
  - should calculate shortfall amount for rejection message
});
```

### Unit Tests - Balance Operations

```
describe('BalanceOperations', () => {
  // Deposits
  - should credit balance on successful deposit
  - should record transaction with before/after balance
  - should update total_deposited_cents
  - should handle multiple deposits correctly

  // Debits (upload payments)
  - should debit balance on successful upload
  - should record transaction with before/after balance
  - should update total_spent_cents
  - should reject if balance insufficient

  // Balance queries
  - should return current balance
  - should return 0 for new users
  - should never return negative balance

  // Concurrency
  - should handle concurrent deposits correctly
  - should handle concurrent upload attempts
  - should prevent race conditions (double-spend)
  - should serialize balance modifications
});
```

### Unit Tests - Upload Payment Validation

```
describe('UploadPaymentValidation', () => {
  // Sufficient balance
  - should allow upload when balance ≥ cost for requested retention
  - should allow upload when balance exactly equals cost
  - should allow upload with balance > 30-day minimum

  // Insufficient balance
  - should reject when balance < 30-day minimum cost
  - should reject when balance < requested retention cost
  - should return detailed rejection message
  - should include required_cents in response
  - should include balance_cents in response
  - should include deposit_url in response

  // Rejection message format
  - should format message: "Your account balance is too low..."
  - should include cost formatted as dollars ($X.XX)
  - should include balance formatted as dollars
  - should include link to deposit

  // Edge cases
  - should reject zero-byte uploads (or allow?)
  - should reject zero-month retention
  - should handle very large files correctly
  - should handle very long retention correctly
});
```

### Unit Tests - CID Retention

```
describe('CIDRetention', () => {
  // Setting expiration
  - should set expires_at based on retention_months
  - should calculate expiration from upload timestamp
  - should handle month boundary correctly (e.g., Jan 31 + 1 month)

  // Extending retention
  - should add months to existing expires_at
  - should record extension payment in retention_payments
  - should handle extension of near-expired content
  - should handle extension of already-expired content (if allowed)

  // Donation extensions
  - should calculate months from donation amount
  - should handle fractional months (round to days)
  - should record anonymous donor as null payer_id
  - should record authenticated donor's user ID

  // Expiration
  - should mark content as expired when expires_at passes
  - should delete content after expiration (or grace period)
  - should not allow access to expired content
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
  - should require amount_cents field
  - should reject amount below $1.00 (100 cents)
  - should reject non-numeric amount
  - should reject negative amount

  // Success response
  - should return Stripe checkout URL
  - should return transaction_id
  - should return amount breakdown (gross, fee, net)

  // Stripe integration
  - should create Stripe Checkout session
  - should set correct amount
  - should set success_url
  - should set cancel_url
  - should enable Stripe Tax

  // Error handling
  - should handle Stripe API errors
  - should return 503 if Stripe unavailable
});
```

### Unit Tests - CID Donation API

```
describe('POST /api/donate/cid/:cid', () => {
  // No auth required
  - should work without authentication
  - should work with authentication

  // Request validation
  - should require amount_cents field
  - should reject amount below minimum (if any)
  - should validate CID exists
  - should validate CID format
  - should reject donation to non-existent CID

  // Success response
  - should return Stripe checkout URL
  - should return estimated extension (months/days)
  - should return new expiration date (estimated)

  // After completion (webhook)
  - should extend CID expiration
  - should record donation in retention_payments
  - should notify uploader (if configured)

  // Edge cases
  - should handle donation to expired CID
  - should handle donation to contested CID
  - should handle very small donations (< 1 day extension)
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
  - should credit user balance
  - should record transaction with before/after balance
  - should update total_deposited_cents
  - should send receipt email
  - should be idempotent (handle duplicate webhooks)

  // checkout.session.completed - CID Donation
  - should extend CID expiration
  - should record donation in CID's retention_payments
  - should notify uploader (if enabled)
  - should handle anonymous donations

  // checkout.session.expired
  - should not affect any balances
  - should log for debugging

  // charge.dispute.created
  - should flag account for review
  - should log dispute details
  - should notify admin

  // Error handling
  - should return 400 for malformed JSON
  - should return 200 for unknown event types
  - should log errors securely
});
```

### Unit Tests - Balance & History APIs

```
describe('GET /api/balance', () => {
  // Authentication
  - should require authentication
  - should return own balance only

  // Response format
  - should return balance_cents
  - should return total_deposited_cents
  - should return total_spent_cents
});

describe('GET /api/balance/history', () => {
  // Authentication
  - should require authentication
  - should only return own transactions

  // Response format
  - should return array of transactions
  - should include type, amount, before/after balance
  - should order by timestamp descending

  // Pagination
  - should support limit parameter
  - should support offset parameter
  - should default to 20 items

  // Filtering
  - should filter by transaction type
  - should filter by date range
});
```

### Integration Tests - Deposit Flow

```
describe('Deposit Flow', () => {
  // Happy path
  - should complete: request → Stripe → webhook → balance updated
  - should reflect new balance in GET /api/balance
  - should appear in GET /api/balance/history
  - should enable previously-rejected upload

  // Multiple deposits
  - should accumulate balance correctly
  - should record each transaction separately

  // Failed deposit
  - should handle card declined
  - should not affect balance on failure

  // Abandoned checkout
  - should not affect balance if checkout abandoned
});
```

### Integration Tests - Upload with Payment

```
describe('Upload with Payment', () => {
  // Happy path
  - should accept upload when balance sufficient
  - should deduct cost from balance
  - should set CID expiration correctly
  - should record transaction
  - should return new balance in response

  // Insufficient balance
  - should reject with detailed message
  - should not create content
  - should not deduct from balance
  - should allow retry after deposit

  // Exactly sufficient balance
  - should accept upload when balance exactly equals cost
  - should result in zero balance after

  // Multiple uploads
  - should handle sequential uploads correctly
  - should prevent concurrent double-spend
});
```

### Integration Tests - CID Donation

```
describe('CID Donation', () => {
  // Happy path
  - should create Stripe checkout
  - should extend CID expiration after payment
  - should record donation in CID metadata

  // Anonymous donor
  - should work without authentication
  - should record payer_id as null

  // Authenticated donor
  - should record payer_id
  - should not affect donor's HashBin balance (only Stripe charge)

  // Self-donation (extend own content)
  - should work the same as any donation
  - should extend expiration correctly
});
```

### Integration Tests - Content Lifecycle

```
describe('Content Lifecycle', () => {
  // Upload to expiration
  - should create content with correct expiration
  - should be accessible before expiration
  - should become inaccessible after expiration
  - should be deleted after expiration (or grace period)

  // Extension before expiration
  - should extend expiration correctly
  - should remain accessible after original expiration

  // Warning emails
  - should send warning 30 days before expiration
  - should include CID and expiration date
  - should include link to extend
});
```

### E2E Tests

```
describe('E2E Payment Scenarios', () => {
  // New user journey
  - should sign up → deposit → upload → verify content accessible
  - should show correct balance after upload
  - should show content in user's content list with expiration

  // Donation journey
  - should allow anonymous donation to any CID
  - should extend that CID's expiration
  - should notify uploader

  // Low balance journey
  - should reject upload with clear message
  - should allow deposit
  - should allow upload after deposit

  // Content expiration journey
  - should send warning email at 30 days
  - should allow extension via self-donation
  - should remain accessible after extension
});
```

### Security Tests

```
describe('Payment Security', () => {
  // Access control
  - should not expose other users' balances
  - should not allow direct balance manipulation
  - should validate all inputs

  // Webhook security
  - should reject invalid signatures
  - should prevent replay attacks
  - should be idempotent

  // Double-spend prevention
  - should prevent concurrent uploads exceeding balance
  - should serialize balance modifications
  - should use transactions for atomicity

  // Data protection
  - should only log allowed fields
  - should not log card details
  - should use HTTPS everywhere
});
```

### Performance Tests

```
describe('Payment Performance', () => {
  // Response times
  - should return balance in <100ms
  - should create deposit checkout in <2s
  - should process upload payment in <500ms
  - should process webhook in <500ms

  // Concurrency
  - should handle concurrent balance reads
  - should handle concurrent deposits
  - should maintain consistency under load

  // Scale
  - should handle user with many transactions
  - should paginate history efficiently
});
```

---

## Implementation Phases

### Phase 4.1: Balance Infrastructure
1. Add balance fields to UserProfile DO
2. Create TransactionRecord DO
3. Implement deposit/debit operations with atomicity
4. Create `/api/balance` endpoint
5. Add unit tests for balance operations

### Phase 4.2: Deposit Flow
1. Add Stripe SDK dependency
2. Implement `/api/balance/deposit` endpoint
3. Implement Stripe webhook handler for deposits
4. Create `/api/balance/history` endpoint
5. Add integration tests

### Phase 4.3: Upload Payment Integration
1. Add retention_months parameter to upload endpoint
2. Implement balance check and deduction
3. Update ContentMetadata DO with expiration
4. Implement rejection messages
5. Add upload payment tests

### Phase 4.4: CID Donations
1. Implement `/api/donate/cid/:cid` endpoint
2. Add Stripe webhook handling for donations
3. Implement expiration extension logic
4. Add donation notification emails
5. Add donation tests

### Phase 4.5: Expiration & Notifications
1. Implement 30-day warning emails
2. Implement content expiration/deletion job
3. Add receipt generation
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
| Double-spend on uploads | High | Serialize balance operations, use transactions |
| Balance calculation errors | High | Comprehensive unit tests, audit logging |
| Stripe outage | Medium | Graceful degradation, clear error messages |
| Content deleted unexpectedly | Medium | 30-day warning emails, clear expiration display |

---

## Success Metrics

- Deposit success rate > 95%
- Upload payment processing time p99 < 500ms
- Webhook processing time p99 < 1s
- Zero PCI compliance violations
- Zero double-spend incidents
- Chargeback rate < 0.5%

---

## References

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Tax](https://stripe.com/docs/tax)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
