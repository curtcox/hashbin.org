# Plan: Add Money to Balance

## Overview

Allow logged-in users to add money to their account balance via Stripe checkout. The balance can then be used to pay for content storage and retention.

## Current State

### Already Implemented (Backend)
- `UserProfile` Durable Object stores `balance_cents`, `total_deposited_cents`, `total_spent_cents`
- `PaymentRecord` Durable Object tracks all transactions
- `POST /api/balance/deposit` - Creates Stripe checkout session
- `POST /api/payments/webhook` - Handles Stripe webhook events
- `GET /api/balance` - Returns current balance
- `GET /api/balance/history` - Returns transaction history
- Pricing utilities in `src/utils/pricing.js`

### Not Yet Implemented
- Frontend deposit form UI (`/deposit.html` is placeholder)
- Deposit success/cancel page handlers
- Error handling UI

---

## User Flow

1. User navigates to deposit page (authenticated)
2. User enters desired credit amount (e.g., $10.00)
3. System displays: "Credit: $10.00 + Fee: $0.59 = Total: $10.59"
4. User clicks "Add Funds" button
5. System creates Stripe checkout session via `POST /api/balance/deposit`
6. User is redirected to Stripe checkout (charged $10.59)
7. User completes payment on Stripe
8. Stripe redirects user to success URL with session ID
9. Success page shows confirmation, redirects to dashboard
10. Stripe sends webhook to backend (may happen before or after redirect)
11. Backend credits user $10.00 and records transaction
12. Dashboard displays updated balance

---

## Technical Implementation

### Backend Changes

#### 1. Verify/Update Stripe Checkout Session Creation
File: `src/api/payments.js`

- Ensure success_url includes session_id: `/deposit?status=success&session_id={CHECKOUT_SESSION_ID}`
- Ensure cancel_url: `/deposit?status=cancel`
- Include user metadata in session for webhook processing
- Set appropriate Stripe customer email from Clerk user

#### 2. Webhook Handler Verification
File: `src/api/payments.js`

- Verify `checkout.session.completed` handler works correctly
- Ensure idempotency using transaction IDs (same session not processed twice)
- Credit the requested amount (user pays fees on top, receives full credit)

### Frontend Changes

#### 1. Deposit Form Page
File: `frontend/deposit.html`

- Amount input field with validation
- Real-time fee calculation display
- "Add Funds" submit button
- Loading state during checkout creation
- Error display area

#### 2. Deposit JavaScript Module
File: `frontend/js/deposit.js`

- Initialize page with auth check
- Handle amount input with validation
- Calculate and display fees
- Submit to API and handle response
- Redirect to Stripe checkout
- Handle success/cancel return URLs (success redirects to dashboard)

#### 3. Success/Cancel Handling
- Parse URL query parameters on page load
- Display appropriate message based on status
- On success: show brief confirmation, redirect to dashboard
- On cancel: show message with retry button

---

## Requirements (Resolved)

### Business Rules
- **Minimum deposit**: $1.00 (100 cents)
- **Maximum deposit**: No maximum
- **Fee handling**: User pays Stripe fees (2.9% + $0.30), always displayed during payment
- **Currency**: USD only
- **Receipts**: Stripe sends receipt emails (no custom emails needed)
- **Refunds**: No refunds of balance

### Technical
- **Webhook handling**: Trust Stripe webhooks, but show errors to user if issues occur
- **Idempotency**: Record and check transaction IDs to prevent double-crediting
- **Session expiration**: Use Stripe default (24 hours)
- **Error recovery**: Rely on Stripe's webhook retry mechanism

### UX
- **Amount input**: Free-form input only (no preset buttons)
- **Balance display**: Show in header (standard location)
- **Post-deposit redirect**: Redirect to dashboard after successful deposit
- **Mobile**: No special considerations (Stripe handles mobile checkout)

---

## Test Plan

### Unit Tests

#### Amount Validation Tests
```
TEST: Reject amount below minimum ($1.00)
  INPUT: amount_cents = 50
  EXPECTED: Error "Minimum deposit is $1.00"

TEST: Reject amount of zero
  INPUT: amount_cents = 0
  EXPECTED: Error "Amount must be greater than zero"

TEST: Reject negative amount
  INPUT: amount_cents = -100
  EXPECTED: Error "Amount must be greater than zero"

TEST: Reject non-integer amount
  INPUT: amount_cents = 10.5
  EXPECTED: Error "Amount must be a whole number of cents"

TEST: Accept valid minimum amount
  INPUT: amount_cents = 100
  EXPECTED: Success, checkout session created

TEST: Accept valid large amount
  INPUT: amount_cents = 100000 ($1000)
  EXPECTED: Success, checkout session created
```

#### Fee Calculation Tests
```
TEST: Calculate Stripe fee correctly for small amount
  INPUT: credit_amount_cents = 100 ($1.00 credit requested)
  EXPECTED: fee = 33 cents (2.9% + $0.30), total charged = $1.33

TEST: Calculate Stripe fee correctly for medium amount
  INPUT: credit_amount_cents = 1000 ($10.00 credit requested)
  EXPECTED: fee = 59 cents (2.9% + $0.30), total charged = $10.59

TEST: Calculate Stripe fee correctly for large amount
  INPUT: credit_amount_cents = 10000 ($100.00 credit requested)
  EXPECTED: fee = 320 cents (2.9% + $0.30), total charged = $103.20

TEST: User receives full credit amount (fees added on top)
  INPUT: credit_amount_cents = 1000
  EXPECTED: User pays $10.59, receives $10.00 credit
```

### API Tests

#### POST /api/balance/deposit

```
TEST: Reject unauthenticated request
  INPUT: No auth header
  EXPECTED: 401 Unauthorized

TEST: Reject request with invalid token
  INPUT: Bearer invalid_token
  EXPECTED: 401 Unauthorized

TEST: Reject request with missing amount
  INPUT: {}
  EXPECTED: 400 Bad Request "amount_cents is required"

TEST: Reject request with invalid amount type
  INPUT: { amount_cents: "one hundred" }
  EXPECTED: 400 Bad Request "amount_cents must be a number"

TEST: Create checkout session for valid request
  INPUT: { amount_cents: 1000 }, valid auth
  EXPECTED: 200 OK { checkout_url, session_id }

TEST: Checkout URL is valid Stripe URL
  INPUT: Valid request
  EXPECTED: checkout_url starts with "https://checkout.stripe.com/"

TEST: Session ID is returned and valid format
  INPUT: Valid request
  EXPECTED: session_id matches Stripe session ID pattern
```

#### POST /api/payments/webhook

```
TEST: Reject request without Stripe signature
  INPUT: No stripe-signature header
  EXPECTED: 400 Bad Request

TEST: Reject request with invalid Stripe signature
  INPUT: Invalid stripe-signature header
  EXPECTED: 400 Bad Request

TEST: Ignore non-checkout events
  INPUT: Valid signature, event type = "payment_intent.created"
  EXPECTED: 200 OK (no balance change)

TEST: Process checkout.session.completed event
  INPUT: Valid signature, checkout.session.completed event
  EXPECTED: 200 OK, user balance credited

TEST: Idempotency - same session not processed twice
  INPUT: Same checkout.session.completed event sent twice
  EXPECTED: Balance credited only once

TEST: Correct user credited (from session metadata)
  INPUT: Event with user_id in metadata
  EXPECTED: Correct user's balance updated

TEST: Correct amount credited (full requested credit, not charge amount)
  INPUT: Event for $10.00 credit request (amount_total includes fees)
  EXPECTED: User balance increased by 1000 cents ($10.00 credit)

TEST: Transaction recorded in PaymentRecord
  INPUT: Valid checkout.session.completed
  EXPECTED: New transaction in user's payment history
```

#### GET /api/balance

```
TEST: Return current balance for authenticated user
  INPUT: Valid auth
  EXPECTED: { balance_cents, total_deposited_cents, total_spent_cents }

TEST: Balance reflects recent deposit
  SETUP: User deposits $10
  INPUT: GET /api/balance after webhook processed
  EXPECTED: balance_cents increased by deposit amount
```

#### GET /api/balance/history

```
TEST: Return empty array for new user
  INPUT: New user with no transactions
  EXPECTED: { transactions: [] }

TEST: Return deposit transaction after deposit
  SETUP: User completes $10 deposit
  INPUT: GET /api/balance/history
  EXPECTED: Transaction with type "deposit", amount 1000

TEST: Transactions ordered by date descending
  SETUP: User has multiple transactions
  INPUT: GET /api/balance/history
  EXPECTED: Most recent transaction first
```

### Integration Tests

#### Complete Deposit Flow

```
TEST: End-to-end deposit flow (happy path)
  1. User authenticated
  2. POST /api/balance/deposit { amount_cents: 1000 }
  3. Receive checkout_url
  4. Simulate Stripe checkout completion
  5. Send webhook event
  6. Verify balance increased
  7. Verify transaction in history

TEST: Deposit with Stripe test card 4242424242424242
  1. Create real checkout session
  2. Complete with test card
  3. Verify webhook received
  4. Verify balance updated

TEST: Deposit with declined card 4000000000000002
  1. Create checkout session
  2. Attempt payment with declined card
  3. Verify no balance change
  4. Verify user can retry
```

#### Concurrent Deposits

```
TEST: Multiple deposits from same user processed correctly
  1. User initiates deposit A ($10)
  2. User initiates deposit B ($20) before A completes
  3. Both webhooks received
  4. Balance reflects both deposits ($30)
  5. Two transactions in history

TEST: Deposits from different users don't interfere
  1. User A deposits $10
  2. User B deposits $20
  3. User A balance = $10
  4. User B balance = $20
```

#### Error Recovery

```
TEST: Abandoned checkout session
  1. User creates checkout session
  2. User closes browser without completing
  3. No balance change
  4. User can create new session

TEST: Webhook delay handling
  1. User completes payment on Stripe
  2. Redirect to success page happens immediately
  3. Brief success message shown, redirect to dashboard
  4. If balance not yet updated, user sees old balance (webhook pending)
  5. On page refresh after webhook processed, balance is correct

TEST: Duplicate webhook handling
  1. Webhook received for session X
  2. Balance credited
  3. Duplicate webhook for session X
  4. Balance NOT credited again
```

### Frontend Tests

#### Form Validation

```
TEST: Empty amount shows validation error
  ACTION: Submit with empty amount field
  EXPECTED: "Please enter an amount" error displayed

TEST: Amount below minimum shows error
  ACTION: Enter "0.50" and submit
  EXPECTED: "Minimum deposit is $1.00" error displayed

TEST: Invalid characters rejected
  ACTION: Type "abc" in amount field
  EXPECTED: Input rejected or error shown

TEST: Valid amount enables submit button
  ACTION: Enter "10.00"
  EXPECTED: Submit button enabled, no errors

TEST: Fee breakdown updates as amount changes
  ACTION: Type "10" in amount field
  EXPECTED: Shows "Credit: $10.00 + Fee: $0.59 = Total: $10.59"
```

#### Success/Cancel Handling

```
TEST: Success URL displays confirmation then redirects
  URL: /deposit?status=success&session_id=cs_xxx
  EXPECTED: "Deposit successful!" message displayed, then redirect to dashboard

TEST: Dashboard shows updated balance after redirect
  SETUP: Complete deposit flow
  EXPECTED: Dashboard displays new balance in header

TEST: Cancel URL displays appropriate message
  URL: /deposit?status=cancel
  EXPECTED: "Deposit cancelled" message, retry button shown

TEST: Success with any session_id redirects to dashboard
  URL: /deposit?status=success&session_id=cs_xxx
  EXPECTED: Show success message, redirect to dashboard (webhook handles actual credit)
```

#### Loading States

```
TEST: Loading spinner shown during checkout creation
  ACTION: Click submit with valid amount
  EXPECTED: Button disabled, spinner shown

TEST: Page shows loading while fetching balance
  ACTION: Load success page
  EXPECTED: Spinner shown until balance loaded

TEST: Error state after API failure
  SETUP: API returns 500
  ACTION: Submit form
  EXPECTED: Error message displayed, can retry
```

### Security Tests

```
TEST: Cannot create deposit for another user
  INPUT: Attempt to specify different user_id
  EXPECTED: Ignored, session created for authenticated user

TEST: Webhook signature validation
  INPUT: Forged webhook without valid signature
  EXPECTED: 400 Bad Request, no balance change

TEST: Rate limiting on deposit creation
  INPUT: 100 deposit requests in 1 minute
  EXPECTED: Rate limited after threshold

TEST: XSS prevention in amount display
  INPUT: amount_cents = "<script>alert('xss')</script>"
  EXPECTED: Properly escaped, no script execution

TEST: CSRF protection on deposit endpoint
  INPUT: Cross-origin request without proper headers
  EXPECTED: Request rejected
```

### Edge Cases

```
TEST: Very small deposit (minimum $1.00)
  INPUT: amount_cents = 100
  EXPECTED: Success (user pays $1.00 + $0.33 fee = $1.33 total, receives $1.00 credit)

TEST: Very large deposit (no maximum)
  INPUT: amount_cents = 1000000 ($10,000)
  EXPECTED: Success, checkout session created

TEST: Deposit when user has existing balance
  SETUP: User has $5.00 balance
  INPUT: Deposit $10.00 credit
  EXPECTED: Balance = $15.00

TEST: Deposit immediately after account creation
  SETUP: New user, just signed up
  INPUT: Attempt deposit
  EXPECTED: Success

TEST: Deposit with special characters in user email
  SETUP: User email = "test+special@example.com"
  INPUT: Deposit $10
  EXPECTED: Success, email passed correctly to Stripe

TEST: Browser back button during checkout
  ACTION: Go to Stripe checkout, press back
  EXPECTED: Can re-submit or shows appropriate message

TEST: Network error during checkout creation
  SETUP: Network fails during POST /api/balance/deposit
  EXPECTED: Error message, can retry

TEST: Stripe checkout page timeout
  ACTION: Leave checkout page open for 30+ minutes
  EXPECTED: Session expired message from Stripe
```

---

## Implementation Phases

### Phase 1: Backend Verification ✅ COMPLETED
1. ✅ Verify Stripe webhook is configured and working
2. ✅ Add idempotency check to webhook handler
3. ✅ Fix fee calculation (user pays credit + fees, receives full credit)
4. ⏭️ Add deposit status endpoint (optional - skipped)
5. ⏭️ Add integration tests for existing endpoints (to be done in testing phase)

### Phase 2: Frontend Implementation ✅ COMPLETED
1. ✅ Create deposit form UI
2. ✅ Implement amount validation
3. ✅ Implement fee calculation display
4. ✅ Implement checkout redirect
5. ✅ Implement success/cancel handling

### Phase 3: Polish & Edge Cases ✅ COMPLETED
1. ✅ Add loading states
2. ✅ Add error handling UI
3. ⏭️ Accessibility review (deferred - basic accessibility in place)

### Phase 4: Testing & Launch 🚧 IN PROGRESS
1. 🚧 Run full test suite
2. 🚧 Test with Stripe test mode
3. 🚧 Test webhook reliability
4. ⏭️ Deploy to production (awaiting testing)
5. ⏭️ Monitor for issues (post-deployment)

---

## Recent Implementation Notes

### Completed Changes (2026-01-15)

#### Backend
1. **Idempotency Check**: Added session tracking to prevent duplicate webhook processing
   - PaymentRecord now stores `session:{session_id}` -> `transaction_id` mapping
   - Webhook handler checks for existing session before processing
   
2. **Fee Calculation Fix**: Updated to charge `credit + fees`
   - Added `calculateTotalWithFees()` function in pricing.js
   - User specifies credit amount (e.g., $10), pays $10 + fees, receives $10 credit
   - Previous implementation charged only credit amount (incorrect)

3. **Enhanced Validation**: Added stricter validation in deposit endpoint
   - Check for integer cents
   - Check for positive amounts
   - Check for minimum amount ($1.00)

4. **Redirect URLs**: Updated success/cancel URLs to point to `/deposit` page
   - Success: Shows confirmation, redirects to dashboard after 2 seconds
   - Cancel: Shows cancel message, allows retry

#### Frontend
1. **Deposit Form**: Created complete deposit form with:
   - Dollar amount input with $ prefix
   - Real-time fee calculation and display
   - Submit button that creates Stripe checkout session
   
2. **Fee Breakdown Display**: Shows:
   - Credit Amount: What user will receive
   - Processing Fee: Stripe fees (2.9% + $0.30)
   - Total Charge: What user pays
   
3. **Success/Cancel Handling**:
   - Detects URL parameters after Stripe redirect
   - Shows appropriate messages
   - Auto-redirects to dashboard on success
   
4. **Loading States**: Button shows loading spinner during checkout creation

5. **Error Handling**: Displays validation and API errors inline

#### CSS
- Added deposit form specific styles
- Input group with $ prefix
- Fee breakdown table styling
- Loading button animation

---

## Dependencies

- Stripe account configured with webhook endpoint
- Environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Clerk authentication working
- Durable Objects deployed (UserProfile, PaymentRecord)

---

## Files to Create/Modify

### Created ✅
- ✅ `frontend/js/deposit.js` - Deposit page logic (COMPLETED)

### Modified ✅
- ✅ `frontend/deposit.html` - Replaced placeholder with actual form (COMPLETED)
- ✅ `src/api/payments.js` - Added idempotency, fixed fee calculation (COMPLETED)
- ✅ `src/durable-objects/payment-record.js` - Added session existence check (COMPLETED)
- ✅ `src/utils/pricing.js` - Added calculateTotalWithFees function (COMPLETED)
- ✅ `frontend/css/components.css` - Added form styling (COMPLETED)
- ⏭️ `src/index.js` - No new routes needed (SKIPPED)

### Not Needed
- `tests/deposit.test.js` - No test framework exists yet; bash-based tests available

---

## Success Criteria

1. User can enter amount and see fee breakdown
2. User is redirected to Stripe checkout
3. After successful payment, balance is credited
4. Transaction appears in history
5. All tests pass
6. No double-crediting possible
7. Clear error messages for all failure modes
