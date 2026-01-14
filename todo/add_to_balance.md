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
- Email receipts/confirmations

---

## User Flow

1. User navigates to deposit page (authenticated)
2. User enters desired deposit amount
3. System displays amount breakdown (deposit + Stripe fees)
4. User clicks "Add Funds" button
5. System creates Stripe checkout session via `POST /api/balance/deposit`
6. User is redirected to Stripe checkout
7. User completes payment on Stripe
8. Stripe redirects user back to success URL with session ID
9. Stripe sends webhook to backend
10. Backend credits user balance and records transaction
11. User sees updated balance and success confirmation

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
- Ensure idempotency (same session not processed twice)
- Ensure balance is credited with correct amount (net of Stripe fees? or gross?)

#### 3. Add Deposit Status Endpoint
File: `src/api/payments.js` (new endpoint)

- `GET /api/balance/deposit/:sessionId/status` - Check if deposit was processed
- Returns: `{ status: 'pending' | 'completed' | 'failed', amount_cents?, error? }`

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
- Handle success/cancel return URLs
- Poll for webhook completion (optional)

#### 3. Success/Cancel Handling
- Parse URL query parameters on page load
- Display appropriate message based on status
- Fetch and display updated balance on success
- Provide retry option on cancel

---

## Open Questions

### Business Logic

1. **Minimum deposit amount**: Currently set to $1.00 (100 cents). Is this correct?

2. **Maximum deposit amount**: Is there a maximum? Should there be one for fraud prevention?

3. **Fee handling**: Who pays Stripe fees (2.9% + $0.30)?
   - Option A: User pays gross, receives net (e.g., pay $10, receive ~$9.41 credit)
   - Option B: User pays net, we absorb fees (e.g., pay $10, receive $10 credit)
   - Option C: Fees added on top (e.g., want $10 credit, pay ~$10.62)

4. **Currency**: USD only? Or support international currencies?

5. **Receipt emails**: Should Stripe send receipt emails? Should we send our own?

6. **Refund policy**: Can users request refunds of unused balance? Under what conditions?

### Technical

7. **Webhook reliability**: What happens if webhook fails or is delayed?
   - Should frontend poll for completion?
   - What's the timeout before showing "pending" state?

8. **Idempotency**: How do we prevent double-crediting if webhook is received twice?

9. **Session expiration**: How long should Stripe checkout sessions be valid?

10. **Error recovery**: If user completes payment but webhook fails, how do we recover?

### UX

11. **Preset amounts**: Should we offer preset amounts ($5, $10, $25, $50) or free-form input only?

12. **Balance display**: Where should current balance be shown during deposit flow?

13. **Post-deposit redirect**: After successful deposit, redirect to dashboard or stay on deposit page?

14. **Mobile experience**: Any special considerations for mobile Stripe checkout?

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

TEST: Reject amount above maximum (if maximum exists)
  INPUT: amount_cents = 10000000 ($100,000)
  EXPECTED: Error "Maximum deposit is $X"
```

#### Fee Calculation Tests
```
TEST: Calculate Stripe fee correctly for small amount
  INPUT: amount_cents = 100 ($1.00)
  EXPECTED: fee = 33 cents (2.9% + $0.30)

TEST: Calculate Stripe fee correctly for medium amount
  INPUT: amount_cents = 1000 ($10.00)
  EXPECTED: fee = 59 cents (2.9% + $0.30)

TEST: Calculate Stripe fee correctly for large amount
  INPUT: amount_cents = 10000 ($100.00)
  EXPECTED: fee = 320 cents (2.9% + $0.30)

TEST: Calculate net credit correctly (if user pays fees)
  INPUT: amount_cents = 1000
  EXPECTED: net_credit = 941 cents
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

TEST: Correct amount credited
  INPUT: Event with amount_total = 1000
  EXPECTED: User balance increased by correct amount (net or gross per policy)

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
  1. User completes payment
  2. Webhook delayed by 30 seconds
  3. User sees "pending" status
  4. Webhook arrives, balance updated
  5. User sees success on refresh

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
  EXPECTED: Shows "$10.00 + $0.59 fee = $10.59 total" (or similar)
```

#### Success/Cancel Handling

```
TEST: Success URL displays confirmation
  URL: /deposit?status=success&session_id=cs_xxx
  EXPECTED: "Deposit successful!" message displayed

TEST: Success URL shows updated balance
  URL: /deposit?status=success&session_id=cs_xxx
  EXPECTED: New balance displayed

TEST: Cancel URL displays appropriate message
  URL: /deposit?status=cancel
  EXPECTED: "Deposit cancelled" message, retry button shown

TEST: Invalid session_id handled gracefully
  URL: /deposit?status=success&session_id=invalid
  EXPECTED: Error message, prompt to check balance manually
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
TEST: Very small deposit (minimum)
  INPUT: amount_cents = 100
  EXPECTED: Success (fees may exceed deposit value - is this allowed?)

TEST: Very large deposit
  INPUT: amount_cents = 1000000 ($10,000)
  EXPECTED: Success or clear error if maximum exceeded

TEST: Deposit when user has existing balance
  SETUP: User has $5.00 balance
  INPUT: Deposit $10.00
  EXPECTED: Balance = $15.00 (or $14.41 after fees)

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

### Phase 1: Backend Verification
1. Verify Stripe webhook is configured and working
2. Add idempotency check to webhook handler
3. Add deposit status endpoint (optional)
4. Add integration tests for existing endpoints

### Phase 2: Frontend Implementation
1. Create deposit form UI
2. Implement amount validation
3. Implement fee calculation display
4. Implement checkout redirect
5. Implement success/cancel handling

### Phase 3: Polish & Edge Cases
1. Add loading states
2. Add error handling UI
3. Add preset amount buttons (if desired)
4. Mobile optimization
5. Accessibility review

### Phase 4: Testing & Launch
1. Run full test suite
2. Test with Stripe test mode
3. Test webhook reliability
4. Deploy to production
5. Monitor for issues

---

## Dependencies

- Stripe account configured with webhook endpoint
- Environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Clerk authentication working
- Durable Objects deployed (UserProfile, PaymentRecord)

---

## Files to Create/Modify

### Create
- `frontend/js/deposit.js` - Deposit page logic
- `tests/deposit.test.js` - Deposit tests (if test framework exists)

### Modify
- `frontend/deposit.html` - Replace placeholder with actual form
- `src/api/payments.js` - Add idempotency, possibly status endpoint
- `src/index.js` - Add any new routes
- `frontend/css/components.css` - Form styling (if needed)

---

## Success Criteria

1. User can enter amount and see fee breakdown
2. User is redirected to Stripe checkout
3. After successful payment, balance is credited
4. Transaction appears in history
5. All tests pass
6. No double-crediting possible
7. Clear error messages for all failure modes
