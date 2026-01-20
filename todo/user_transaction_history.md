# Plan: User Transaction History

## Overview

Allow users to see a complete, sortable transaction history of everything they have paid for. Each transaction displays dates, amounts, and type-specific details: CID transactions show the content hash, retention transactions show the time paid for, and bandwidth transactions show the frequency (MTBR) and duration.

## Current State

### Already Implemented (Backend)
- `PaymentRecord` Durable Object stores transactions per user
- `GET /api/balance/history` endpoint with pagination and type filtering
- Five transaction types defined:
  - `deposit` - User adds funds via Stripe
  - `upload_payment` - User pays for content storage
  - `cid_extension` - User extends existing CID retention
  - `donation_received` - User donates to extend someone else's CID
  - `rate_limit_purchase` - User purchases bandwidth rate limiting

### Data Model Gap Identified
The `PaymentRecord.createTransaction()` method only persists a fixed set of fields:
- `transaction_id`, `type`, `user_id`, `amount_cents`
- `balance_before_cents`, `balance_after_cents`
- `stripe_session_id`, `stripe_payment_intent`
- `cid`, `retention_months`, `created_at`

**Missing fields for `rate_limit_purchase`:**
- `min_time_between_requests_ms` (MTBR frequency)
- `duration_seconds` (how long the rate limit is active)
- `max_requests` (calculated max requests)
- `max_bytes` (calculated max bandwidth)

These fields ARE passed to `createTransaction()` from `rate-limit.js:249-265` but are NOT being saved.

### Not Yet Implemented
- Frontend transaction history UI
- Persisting rate limit purchase details in transactions
- Human-readable formatting of transaction details
- Transaction export functionality
- Filtering by date range

---

## User Flow

1. User navigates to transaction history page (authenticated)
2. System displays list of all transactions, newest first
3. Each transaction shows:
   - Date/time of transaction
   - Amount (positive for deposits, negative for purchases)
   - Transaction type with descriptive label
   - Type-specific details (CID, retention period, bandwidth specs)
4. User can filter by transaction type
5. User can paginate through history
6. User can optionally export transaction history (future enhancement)

---

## Technical Implementation

### Phase 1: Backend - Fix Data Model Gap

#### File: `src/durable-objects/payment-record.js`

Update `createTransaction()` to persist all passed fields:

```javascript
async createTransaction(data) {
  const transaction = {
    id: data.transaction_id,
    transaction_id: data.transaction_id,
    type: data.type,
    user_id: data.user_id,
    amount_cents: data.amount_cents,
    balance_before_cents: data.balance_before_cents,
    balance_after_cents: data.balance_after_cents,
    stripe_session_id: data.stripe_session_id || null,
    stripe_payment_intent: data.stripe_payment_intent || null,
    cid: data.cid || null,
    retention_months: data.retention_months || null,
    // NEW: Rate limit purchase fields
    min_time_between_requests_ms: data.min_time_between_requests_ms || null,
    duration_seconds: data.duration_seconds || null,
    max_requests: data.max_requests || null,
    max_bytes: data.max_bytes || null,
    created_at: new Date().toISOString()
  };
  // ... rest unchanged
}
```

### Phase 2: Frontend - Transaction History UI

#### File: `frontend/transactions.html` (NEW)

Create a new page for viewing transaction history with:
- Transaction list table/cards
- Type filter dropdown
- Pagination controls
- Date formatting utilities

#### File: `frontend/js/transactions.js` (NEW)

JavaScript module to:
- Fetch transactions from API
- Format transaction data for display
- Handle pagination
- Handle type filtering
- Format type-specific details

#### Transaction Display Format by Type

| Type | Display Label | Details Shown |
|------|--------------|---------------|
| `deposit` | "Deposit" | Stripe reference if available |
| `upload_payment` | "Content Upload" | CID, Retention period |
| `cid_extension` | "Retention Extension" | CID, Months added |
| `donation_received` | "Donation to Content" | CID, Months added |
| `rate_limit_purchase` | "Bandwidth Purchase" | CID, MTBR, Duration |

### Phase 3: Navigation Integration

#### File: `frontend/dashboard.html`

Add link to transaction history page

#### File: Navigation components

Add "Transaction History" to authenticated user navigation

---

## Requirements (Resolved vs Open)

### Resolved Business Rules
- Transactions are displayed newest first (already implemented in backend)
- All amounts are in cents, displayed as dollars to user
- Pagination uses limit/offset pattern (already implemented)
- Transaction type filtering supported (already implemented)

### Resolved Technical Requirements
- Backend API exists: `GET /api/balance/history`
- Durable Objects handle storage
- Authentication required for access

### Resolved UX Requirements
- Consistent with existing dashboard styling
- Mobile-responsive design
- Clear transaction type labels

---

## Open Questions

### Q1: Transaction History Retention
**Question:** Should transaction history be retained indefinitely, or should there be a retention period?
**Options:**
- A) Indefinite retention (current implementation)
- B) Configurable retention (e.g., 7 years for compliance)
- C) Allow users to delete old transactions

**Impact:** Affects storage costs and legal compliance (financial records)

### Q2: Date Display Format
**Question:** How should dates be displayed?
**Options:**
- A) Relative time (e.g., "2 hours ago", "3 days ago")
- B) Absolute date (e.g., "Jan 20, 2026 3:45 PM")
- C) Both - relative for recent, absolute for older
- D) User-configurable

**Impact:** Affects frontend implementation complexity

### Q3: Amount Sign Convention
**Question:** How should amounts be displayed for debits vs credits?
**Options:**
- A) Signed amounts: +$10.00 for deposits, -$0.30 for purchases
- B) Unsigned with direction indicator: $10.00 IN, $0.30 OUT
- C) Color-coded: green for deposits, red for purchases

**Impact:** Affects UI design and accessibility

### Q4: CID Display Format
**Question:** How should CIDs be displayed in transaction history?
**Options:**
- A) Full CID (may be long)
- B) Truncated CID with "..." (e.g., "abc123...xyz789")
- C) Truncated with hover/click to see full
- D) Link to content (if still exists)

**Impact:** Affects UI density and usability

### Q5: Bandwidth Transaction Display
**Question:** How should MTBR be displayed to users?
**Options:**
- A) Raw milliseconds: "100ms"
- B) Requests per second: "10 req/s"
- C) Human-readable: "10 times per second"
- D) Both technical and human-readable

**Impact:** Affects user understanding, especially non-technical users

### Q6: Duration Display Format
**Question:** How should duration be displayed for bandwidth purchases?
**Options:**
- A) Raw seconds: "86400 seconds"
- B) Human-readable: "1 day"
- C) As date range: "Jan 20 - Jan 21, 2026"
- D) Remaining time if still active: "23 hours remaining"

**Impact:** Affects user clarity about active rate limits

### Q7: Transaction Export
**Question:** Should users be able to export transaction history?
**Options:**
- A) No export functionality (v1)
- B) CSV export
- C) PDF export (formatted receipt-style)
- D) Both CSV and PDF

**Impact:** Affects development scope and user needs for record-keeping

### Q8: Inline Content Transactions
**Question:** Inline content (<=64 bytes) is free. Should these still appear in transaction history?
**Options:**
- A) Yes, show as $0.00 transactions
- B) No, don't create transaction records for free content
- C) User preference to show/hide

**Impact:** Affects transaction volume and user clarity

### Q9: Balance Running Total
**Question:** Should each transaction show the running balance?
**Options:**
- A) Yes, show balance_after_cents for each row
- B) No, only show transaction amounts
- C) Show on hover/expand only

**Impact:** Already captured in data, just display decision

### Q10: Failed Transaction Visibility
**Question:** Should failed/declined transactions be visible?
**Options:**
- A) Only show successful transactions (current behavior)
- B) Show failed transactions with status indicator
- C) Separate section for failed attempts

**Impact:** Affects whether we need to track failed transactions (not currently stored)

---

## Test Plan

### Unit Tests

#### Date Sorting Tests
```
TEST: Transactions sorted by date descending
  INPUT: Multiple transactions created at different times
  EXPECTED: Most recent transaction appears first

TEST: Transactions with same timestamp maintain stable order
  INPUT: Two transactions with identical created_at
  EXPECTED: Consistent ordering based on insertion order (newer first)
```

#### Amount Display Tests
```
TEST: Display deposit amount correctly
  INPUT: amount_cents = 1000, type = "deposit"
  EXPECTED: Displayed as "$10.00" with positive indicator

TEST: Display purchase amount correctly
  INPUT: amount_cents = -30, type = "upload_payment"
  EXPECTED: Displayed as "$0.30" with negative indicator

TEST: Display zero amount correctly
  INPUT: amount_cents = 0, type = "upload_payment" (inline content)
  EXPECTED: Displayed as "$0.00"

TEST: Display large amount correctly
  INPUT: amount_cents = 100000, type = "deposit"
  EXPECTED: Displayed as "$1,000.00" with thousands separator

TEST: Handle fractional cents (edge case)
  INPUT: amount_cents = 1 (one cent)
  EXPECTED: Displayed as "$0.01"
```

#### CID Transaction Tests
```
TEST: upload_payment includes CID
  INPUT: Transaction with type "upload_payment", cid = "abc123"
  EXPECTED: CID "abc123" displayed in transaction details

TEST: upload_payment includes retention period
  INPUT: Transaction with type "upload_payment", retention_months = 3
  EXPECTED: "3 months" displayed in retention column

TEST: cid_extension includes CID
  INPUT: Transaction with type "cid_extension", cid = "xyz789"
  EXPECTED: CID "xyz789" displayed in transaction details

TEST: cid_extension includes added months
  INPUT: Transaction with type "cid_extension", retention_months = 6
  EXPECTED: "6 months" displayed

TEST: donation_received includes CID
  INPUT: Transaction with type "donation_received", cid = "def456"
  EXPECTED: CID "def456" displayed
```

#### Retention Time Display Tests
```
TEST: Display 1 month correctly
  INPUT: retention_months = 1
  EXPECTED: "1 month"

TEST: Display multiple months correctly
  INPUT: retention_months = 6
  EXPECTED: "6 months"

TEST: Display 12 months as 1 year
  INPUT: retention_months = 12
  EXPECTED: "1 year" or "12 months" (depends on Q answer)

TEST: Display partial year correctly
  INPUT: retention_months = 18
  EXPECTED: "1 year 6 months" or "18 months"

TEST: Handle null retention_months
  INPUT: retention_months = null (deposit type)
  EXPECTED: Field not displayed or shows "-"
```

#### Bandwidth Transaction Tests
```
TEST: rate_limit_purchase includes CID
  INPUT: Transaction with type "rate_limit_purchase", cid = "bw123"
  EXPECTED: CID "bw123" displayed

TEST: rate_limit_purchase includes MTBR (frequency)
  INPUT: Transaction with min_time_between_requests_ms = 100
  EXPECTED: Frequency displayed (format depends on Q5 answer)

TEST: rate_limit_purchase includes duration
  INPUT: Transaction with duration_seconds = 86400
  EXPECTED: Duration displayed (format depends on Q6 answer)

TEST: Handle MTBR minimum value
  INPUT: min_time_between_requests_ms = 100 (minimum allowed)
  EXPECTED: "10 requests/second" or "100ms" displayed correctly

TEST: Handle large MTBR value
  INPUT: min_time_between_requests_ms = 60000 (1 minute)
  EXPECTED: "1 request/minute" or "60000ms" or "60 seconds"

TEST: Handle short duration
  INPUT: duration_seconds = 3600 (1 hour)
  EXPECTED: "1 hour" displayed

TEST: Handle long duration
  INPUT: duration_seconds = 2592000 (30 days)
  EXPECTED: "30 days" or "1 month" displayed

TEST: Handle max_bytes display
  INPUT: max_bytes = 1073741824 (1 GB)
  EXPECTED: "1 GB" displayed

TEST: Handle max_requests display
  INPUT: max_requests = 10000
  EXPECTED: "10,000 requests" displayed
```

### API Tests

#### GET /api/balance/history
```
TEST: Return empty array for new user with no transactions
  INPUT: New user
  EXPECTED: { transactions: [], total: 0, limit: 20, offset: 0 }

TEST: Return transactions sorted by date descending
  SETUP: User has 5 transactions
  INPUT: GET /api/balance/history
  EXPECTED: Transactions ordered newest to oldest

TEST: Pagination - first page
  SETUP: User has 50 transactions
  INPUT: GET /api/balance/history?limit=20&offset=0
  EXPECTED: First 20 transactions returned, total = 50

TEST: Pagination - second page
  SETUP: User has 50 transactions
  INPUT: GET /api/balance/history?limit=20&offset=20
  EXPECTED: Transactions 21-40 returned

TEST: Pagination - last partial page
  SETUP: User has 50 transactions
  INPUT: GET /api/balance/history?limit=20&offset=40
  EXPECTED: Transactions 41-50 returned (10 items)

TEST: Pagination - offset beyond total
  SETUP: User has 50 transactions
  INPUT: GET /api/balance/history?limit=20&offset=100
  EXPECTED: { transactions: [], total: 50, limit: 20, offset: 100 }

TEST: Filter by type - deposits only
  SETUP: User has deposits and purchases
  INPUT: GET /api/balance/history?type=deposit
  EXPECTED: Only deposit transactions returned

TEST: Filter by type - upload_payment only
  SETUP: User has deposits and purchases
  INPUT: GET /api/balance/history?type=upload_payment
  EXPECTED: Only upload_payment transactions returned

TEST: Filter by type - rate_limit_purchase only
  SETUP: User has various transaction types
  INPUT: GET /api/balance/history?type=rate_limit_purchase
  EXPECTED: Only rate_limit_purchase transactions returned

TEST: Filter by type - invalid type
  INPUT: GET /api/balance/history?type=invalid_type
  EXPECTED: Empty array (no matches) or 400 error

TEST: Combined pagination and filter
  SETUP: User has 30 deposits and 20 purchases
  INPUT: GET /api/balance/history?type=deposit&limit=10&offset=0
  EXPECTED: First 10 deposits, filtered total

TEST: Reject unauthenticated request
  INPUT: No auth header
  EXPECTED: 401 Unauthorized

TEST: Reject invalid token
  INPUT: Bearer invalid_token
  EXPECTED: 401 Unauthorized

TEST: Transaction includes all required fields
  SETUP: User has an upload_payment transaction
  INPUT: GET /api/balance/history
  EXPECTED: Transaction has: id, type, amount_cents, cid, retention_months, created_at

TEST: Rate limit transaction includes all fields
  SETUP: User has a rate_limit_purchase
  INPUT: GET /api/balance/history
  EXPECTED: Transaction has: cid, min_time_between_requests_ms, duration_seconds, max_bytes, max_requests
```

### Integration Tests

#### Complete Transaction Flow Tests
```
TEST: Deposit appears in history
  1. User deposits $10.00
  2. Webhook processed
  3. GET /api/balance/history
  EXPECTED: Deposit transaction with amount_cents = 1000

TEST: Upload payment appears in history with CID
  1. User uploads content with hash "test_cid"
  2. Pays for 3 months retention
  3. GET /api/balance/history
  EXPECTED: Transaction with type "upload_payment", cid = "test_cid", retention_months = 3

TEST: CID extension appears in history
  1. User extends existing CID by 6 months
  2. GET /api/balance/history
  EXPECTED: Transaction with type "cid_extension", retention_months = 6

TEST: Rate limit purchase appears in history with all details
  1. User purchases rate limit: MTBR=100ms, duration=1 day
  2. GET /api/balance/history
  EXPECTED: Transaction with min_time_between_requests_ms = 100, duration_seconds = 86400

TEST: Multiple transaction types in correct order
  1. User deposits $10
  2. User uploads content (pays $0.30)
  3. User purchases rate limit (pays $0.10)
  4. GET /api/balance/history
  EXPECTED: Transactions in order: rate_limit, upload, deposit (newest first)

TEST: Donation appears in donor's history
  1. User A owns CID
  2. User B donates to extend CID
  3. GET /api/balance/history for User B
  EXPECTED: Transaction with type "donation_received", cid present
```

#### Running Balance Tests
```
TEST: Balance progression is accurate
  1. User deposits $10 (balance: $10)
  2. User uploads content for $0.30 (balance: $9.70)
  3. User purchases rate limit for $0.10 (balance: $9.60)
  4. GET /api/balance/history
  EXPECTED: Each transaction shows correct balance_before_cents and balance_after_cents

TEST: Balance never goes negative
  SETUP: User has $1.00 balance
  INPUT: Attempt to purchase $2.00 item
  EXPECTED: Purchase rejected, no transaction created, balance unchanged
```

### Frontend Tests

#### Display Tests
```
TEST: Transaction list renders correctly
  SETUP: API returns 5 transactions
  EXPECTED: 5 transaction rows displayed

TEST: Empty state shows appropriate message
  SETUP: API returns 0 transactions
  EXPECTED: "No transactions yet" message displayed

TEST: Loading state shown while fetching
  ACTION: Load transactions page
  EXPECTED: Loading spinner shown until data received

TEST: Error state shown on API failure
  SETUP: API returns 500 error
  EXPECTED: Error message displayed, retry option available
```

#### Date Display Tests
```
TEST: Recent transaction shows relative time
  INPUT: Transaction from 2 hours ago
  EXPECTED: "2 hours ago" displayed (if using relative time)

TEST: Old transaction shows absolute date
  INPUT: Transaction from 3 months ago
  EXPECTED: "Oct 20, 2025" displayed

TEST: Date formatted for user's locale
  SETUP: User's browser locale = "en-GB"
  EXPECTED: Date formatted as "20 Jan 2026" (DD MMM YYYY)
```

#### Filtering Tests
```
TEST: Type filter dropdown shows all types
  ACTION: Open type filter dropdown
  EXPECTED: Options for: All, Deposits, Content Upload, Extensions, Donations, Bandwidth

TEST: Selecting filter updates transaction list
  ACTION: Select "Deposits" filter
  EXPECTED: Only deposit transactions shown

TEST: Filter persists on pagination
  ACTION: Filter by "Deposits", go to page 2
  EXPECTED: Page 2 shows only deposits

TEST: Clear filter shows all transactions
  ACTION: Select "All" filter
  EXPECTED: All transaction types shown
```

#### Pagination Tests
```
TEST: Pagination controls shown when needed
  SETUP: 50 transactions, 20 per page
  EXPECTED: Pagination controls visible (Previous, Next, page numbers)

TEST: Previous disabled on first page
  SETUP: On page 1
  EXPECTED: Previous button disabled

TEST: Next disabled on last page
  SETUP: On last page
  EXPECTED: Next button disabled

TEST: Page number updates on navigation
  ACTION: Click "Next"
  EXPECTED: Page number updates, new transactions shown

TEST: Pagination controls hidden when not needed
  SETUP: Only 10 transactions (fits on one page)
  EXPECTED: No pagination controls shown
```

#### Responsive Design Tests
```
TEST: Mobile view shows condensed transaction info
  SETUP: Viewport width < 768px
  EXPECTED: Transaction cards stack vertically, essential info visible

TEST: Desktop view shows full transaction table
  SETUP: Viewport width >= 1024px
  EXPECTED: Full table with all columns visible

TEST: CID truncation works correctly on mobile
  SETUP: Mobile viewport
  EXPECTED: CID truncated with ellipsis, tap to expand
```

### Security Tests
```
TEST: Cannot view another user's transactions
  INPUT: Authenticated as User A, attempt to access User B's history
  EXPECTED: Only User A's transactions returned

TEST: Rate limiting on history endpoint
  INPUT: 1000 requests in 1 minute
  EXPECTED: Rate limited after threshold

TEST: XSS prevention in transaction display
  SETUP: Transaction with cid = "<script>alert('xss')</script>"
  EXPECTED: Properly escaped, no script execution

TEST: SQL/NoSQL injection prevention
  INPUT: type=deposit'; DROP TABLE transactions;--
  EXPECTED: Treated as literal string, no injection
```

### Edge Cases
```
TEST: User with exactly 1 transaction
  SETUP: User has 1 deposit transaction
  INPUT: GET /api/balance/history
  EXPECTED: Single transaction returned correctly

TEST: User with thousands of transactions
  SETUP: User has 10,000 transactions
  INPUT: GET /api/balance/history?limit=100
  EXPECTED: First 100 returned efficiently, total = 10000

TEST: Transaction with null CID (deposit)
  INPUT: Deposit transaction (no CID)
  EXPECTED: CID column empty or shows "-"

TEST: Transaction with null retention_months (rate limit purchase)
  INPUT: rate_limit_purchase (no retention_months)
  EXPECTED: Retention column empty or shows "-"

TEST: Transaction created at midnight UTC
  INPUT: created_at = "2026-01-20T00:00:00.000Z"
  EXPECTED: Date displayed correctly (handles timezone)

TEST: Transaction from year boundary
  INPUT: created_at = "2025-12-31T23:59:59.999Z"
  EXPECTED: Shows correct year (2025, not 2026)

TEST: Very long CID
  INPUT: CID = 64 character hash
  EXPECTED: Truncated appropriately or shown in full based on screen size

TEST: Minimum MTBR value (100ms)
  INPUT: min_time_between_requests_ms = 100
  EXPECTED: Displayed without overflow or formatting issues

TEST: Maximum practical duration (1 year)
  INPUT: duration_seconds = 31536000
  EXPECTED: "1 year" or "365 days" displayed

TEST: Concurrent transaction viewing while new transactions occur
  1. User viewing transaction history
  2. New transaction created
  3. User refreshes
  EXPECTED: New transaction appears at top

TEST: Deleted account handling (if accounts can be deleted)
  SETUP: Account scheduled for deletion
  INPUT: View transaction history
  EXPECTED: Either full access or graceful restriction message
```

### Data Migration Tests
```
TEST: Existing rate_limit_purchase transactions without new fields
  SETUP: Old transaction missing min_time_between_requests_ms
  INPUT: GET /api/balance/history
  EXPECTED: Field shown as null or "N/A" (graceful degradation)

TEST: Mix of old and new format transactions
  SETUP: Some transactions with new fields, some without
  INPUT: GET /api/balance/history
  EXPECTED: All transactions displayed, missing fields handled gracefully
```

---

## Implementation Phases

### Phase 1: Backend Data Model Fix
1. Update `PaymentRecord.createTransaction()` to persist all passed fields
2. Add unit tests for new field persistence
3. Verify existing rate_limit.js passes fields correctly

**Estimated scope:** Small backend change

### Phase 2: Frontend Transaction History UI
1. Create `frontend/transactions.html` page
2. Create `frontend/js/transactions.js` module
3. Implement basic transaction list display
4. Implement type-specific detail formatting
5. Add pagination
6. Add type filtering

**Estimated scope:** Medium frontend implementation

### Phase 3: Navigation & Polish
1. Add link from dashboard to transaction history
2. Add to main navigation
3. Style consistency with existing pages
4. Mobile responsiveness

**Estimated scope:** Small integration work

### Phase 4: Testing & Launch
1. API tests for all transaction types
2. Frontend tests
3. Edge case testing
4. Cross-browser testing
5. Performance testing with large histories

**Estimated scope:** Comprehensive testing

---

## Impacted Documents to Update

| Document | Updates Needed |
|----------|---------------|
| `todo/master_plan.md` | Add transaction history feature to roadmap |
| `todo/add_to_balance.md` | Reference transaction history for deposits |
| `todo/content_rate_limit.md` | Reference transaction history for bandwidth purchases |
| `todo/account_management.md` | Reference transaction history for account activity |
| `todo/user_stories.md` | Add user stories for viewing transaction history |
| `todo/frontend_ui.md` | Add transaction history page to frontend scope |
| `todo/navigation_discoverability.md` | Add transaction history to navigation plan |

---

## Files to Create/Modify

### To Modify
- `src/durable-objects/payment-record.js` - Persist additional fields
- `frontend/dashboard.html` - Add link to transaction history

### To Create
- `frontend/transactions.html` - Transaction history page
- `frontend/js/transactions.js` - Transaction history logic
- `frontend/css/transactions.css` - Transaction history styles (if separate)

### Tests to Create
- `tests/api/balance-history.test.js` - API endpoint tests
- `tests/unit/transaction-display.test.js` - Formatting tests

---

## Success Criteria

1. All transaction types display with correct type-specific details
2. Transactions sorted by date descending (newest first)
3. CID transactions show the content hash
4. Retention transactions show the time period paid for
5. Bandwidth transactions show MTBR frequency and duration
6. Pagination works correctly for users with many transactions
7. Type filtering works correctly
8. Mobile-responsive design
9. All tests pass
10. No regression in existing transaction creation
11. Graceful handling of old transactions missing new fields

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-20 | 1.0 | Initial plan created |
