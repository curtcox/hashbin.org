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

**Missing fields for failed transaction tracking (Q10):**
- `status` ("success" | "failed") - defaults to "success" for backward compatibility
- `failure_reason` (string, null for successful transactions)

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
    // NEW: Failed transaction tracking (Q10)
    status: data.status || 'success',  // "success" | "failed"
    failure_reason: data.failure_reason || null,
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

## Resolved Questions

### Q1: Transaction History Retention ✅
**Question:** Should transaction history be retained indefinitely, or should there be a retention period?
**Decision:** A) Indefinite retention
**Rationale:** Can always delete later if needed. Simpler implementation.

### Q2: Date Display Format ✅
**Question:** How should dates be displayed?
**Decision:** B) Absolute UTC date (e.g., "2026-01-20 15:45:00 UTC")
**Rationale:** Unambiguous, consistent across users, good for record-keeping.

### Q3: Amount Sign Convention ✅
**Question:** How should amounts be displayed for debits vs credits?
**Decision:** B + C) Unsigned with direction indicator AND color-coded
- Display: "$10.00 IN" (green) for deposits
- Display: "$0.30 OUT" (red) for purchases
**Rationale:** Combines clarity of direction with visual scanning via color.

### Q4: CID Display Format ✅
**Question:** How should CIDs be displayed in transaction history?
**Decision:** A + D) Full CID displayed as a link to content
**Rationale:** Full hash for record-keeping, link for easy access to content.

### Q5: Bandwidth Transaction Display ✅
**Question:** How should MTBR be displayed to users?
**Decision:** D) Both technical and human-readable
- Display: "100ms (10 req/s)" or "60000ms (1 req/min)"
**Rationale:** Technical users see exact value, others understand the rate.

### Q6: Duration Display Format ✅
**Question:** How should duration be displayed for bandwidth purchases?
**Decision:** C) As date range (e.g., "Jan 20 - Jan 21, 2026 UTC")
**Rationale:** Clear start/end times for the purchased period.
**Implementation Note:** Need to store `rate_limit_started_at` timestamp to calculate end date.

### Q7: Transaction Export ✅
**Question:** Should users be able to export transaction history?
**Decision:** Provide link to API endpoint with transaction data
- Display clickable link: `GET /api/balance/history?limit=1000`
- User can open in browser or use programmatically
**Rationale:** No additional development needed, API already returns JSON, power users can process as needed.

### Q8: Inline Content Transactions ✅
**Question:** Inline content (<=64 bytes) is free. Should these still appear in transaction history?
**Decision:** B) No record for free inline content
**Rationale:** Reduces noise, transaction history is for financial records.

### Q9: Balance Running Total ✅
**Question:** Should each transaction show the running balance?
**Decision:** A) Yes, show balance_after_cents for each row
**Rationale:** Already captured in data, provides audit trail.

### Q10: Failed Transaction Visibility ✅
**Question:** Should failed/declined transactions be visible?
**Decision:** B) Show failed transactions with status indicator
**Rationale:** Users should see failed attempts for troubleshooting.
**Implementation Note:** Currently failed transactions are NOT stored. Need to add:
- `status` field: "success" | "failed"
- `failure_reason` field for failed transactions

---

## Open Questions (Follow-up)

### Q11: CID Link for Expired/Deleted Content ✅
**Question:** When displaying CID as a link, what happens if the content has expired or been deleted?
**Decision:** A) Dead link (404 when clicked)
**Rationale:** Simple implementation. Users understand 404 errors. No need to check content existence on every page load.

### Q12: Failed Transaction Scenarios ✅
**Question:** Which failure scenarios should create transaction records?
**Decision:** A + B only:
- A) Insufficient balance (attempted purchase with not enough funds)
- B) Stripe payment declined (deposit attempt failed)
**Rationale:** These are the only scenarios involving the user and money changing hands. Other failures (duplicate content, invalid CID, etc.) are operational errors, not financial transactions.

### Q13: Rate Limit Start Time Storage ✅
**Question:** For bandwidth purchases, we need to calculate the date range. How should we store the start time?
**Decision:** A) Use `created_at` as start time (purchase time = activation time)
**Rationale:** Simpler data model. Rate limits activate immediately upon purchase.

### Q14: Transaction Status Field Location ✅
**Question:** Where should the transaction `status` field be stored?
**Decision:** A) In PaymentRecord only
**Rationale:** Single source of truth. Simpler architecture. No cross-reference needed.

### Q15: Export API Link Display ✅
**Question:** How should the export API link be displayed?
**Decision:** A) Static link: `/api/balance/history?limit=1000`
**Rationale:** Simple implementation. Users who want filtered exports can modify the URL manually.

---

## All Questions Resolved

All 15 questions have been answered. The plan is ready for implementation.

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
  EXPECTED: "$10.00 IN" displayed in green

TEST: Display purchase amount correctly
  INPUT: amount_cents = 30, type = "upload_payment"
  EXPECTED: "$0.30 OUT" displayed in red

TEST: Display large amount correctly
  INPUT: amount_cents = 100000, type = "deposit"
  EXPECTED: "$1,000.00 IN" with thousands separator, green

TEST: Handle fractional cents (edge case)
  INPUT: amount_cents = 1 (one cent)
  EXPECTED: "$0.01 OUT" displayed in red

TEST: Color contrast meets accessibility standards
  INPUT: Green and red color values
  EXPECTED: WCAG AA compliant contrast ratios
```

#### CID Transaction Tests
```
TEST: upload_payment displays CID as clickable link
  INPUT: Transaction with type "upload_payment", cid = "abc123def456"
  EXPECTED: Full CID "abc123def456" displayed as link to /content/abc123def456

TEST: upload_payment includes retention period
  INPUT: Transaction with type "upload_payment", retention_months = 3
  EXPECTED: "3 months" displayed in retention column

TEST: cid_extension displays CID as clickable link
  INPUT: Transaction with type "cid_extension", cid = "xyz789abc123"
  EXPECTED: Full CID "xyz789abc123" as link to /content/xyz789abc123

TEST: cid_extension includes added months
  INPUT: Transaction with type "cid_extension", retention_months = 6
  EXPECTED: "6 months" displayed

TEST: donation_received displays CID as clickable link
  INPUT: Transaction with type "donation_received", cid = "def456ghi789"
  EXPECTED: Full CID "def456ghi789" as link

TEST: CID link opens in same tab
  ACTION: Click CID link
  EXPECTED: Navigates to content page (not new tab)

TEST: Long CID (64 chars) displays fully without breaking layout
  INPUT: CID = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
  EXPECTED: Full CID displayed, may wrap but no horizontal overflow
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
TEST: rate_limit_purchase displays CID as link
  INPUT: Transaction with type "rate_limit_purchase", cid = "bw123abc"
  EXPECTED: Full CID "bw123abc" as clickable link

TEST: MTBR displays both technical and human-readable (100ms)
  INPUT: min_time_between_requests_ms = 100
  EXPECTED: "100ms (10 req/s)"

TEST: MTBR displays both technical and human-readable (1 second)
  INPUT: min_time_between_requests_ms = 1000
  EXPECTED: "1000ms (1 req/s)"

TEST: MTBR displays both technical and human-readable (1 minute)
  INPUT: min_time_between_requests_ms = 60000
  EXPECTED: "60000ms (1 req/min)"

TEST: MTBR displays both technical and human-readable (500ms)
  INPUT: min_time_between_requests_ms = 500
  EXPECTED: "500ms (2 req/s)"

TEST: Duration displays as date range (1 day)
  INPUT: created_at = "2026-01-20T10:00:00Z", duration_seconds = 86400
  EXPECTED: "2026-01-20 10:00:00 UTC - 2026-01-21 10:00:00 UTC"

TEST: Duration displays as date range (1 hour)
  INPUT: created_at = "2026-01-20T10:00:00Z", duration_seconds = 3600
  EXPECTED: "2026-01-20 10:00:00 UTC - 2026-01-20 11:00:00 UTC"

TEST: Duration displays as date range (30 days)
  INPUT: created_at = "2026-01-20T10:00:00Z", duration_seconds = 2592000
  EXPECTED: "2026-01-20 10:00:00 UTC - 2026-02-19 10:00:00 UTC"

TEST: Duration date range handles month boundary
  INPUT: created_at = "2026-01-31T10:00:00Z", duration_seconds = 86400
  EXPECTED: "2026-01-31 10:00:00 UTC - 2026-02-01 10:00:00 UTC"

TEST: Duration date range handles year boundary
  INPUT: created_at = "2025-12-31T10:00:00Z", duration_seconds = 86400
  EXPECTED: "2025-12-31 10:00:00 UTC - 2026-01-01 10:00:00 UTC"

TEST: Handle max_bytes display
  INPUT: max_bytes = 1073741824 (1 GB)
  EXPECTED: "1 GB" displayed

TEST: Handle max_bytes display (fractional GB)
  INPUT: max_bytes = 536870912 (0.5 GB)
  EXPECTED: "512 MB" or "0.5 GB" displayed

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
TEST: Transaction date shows absolute UTC format
  INPUT: created_at = "2026-01-20T15:45:30.000Z"
  EXPECTED: "2026-01-20 15:45:30 UTC" displayed

TEST: Date format is consistent regardless of user locale
  SETUP: User's browser locale = "en-GB" or "en-US"
  EXPECTED: Always "YYYY-MM-DD HH:MM:SS UTC" format

TEST: Midnight UTC displays correctly
  INPUT: created_at = "2026-01-20T00:00:00.000Z"
  EXPECTED: "2026-01-20 00:00:00 UTC"

TEST: Year boundary displays correctly
  INPUT: created_at = "2025-12-31T23:59:59.000Z"
  EXPECTED: "2025-12-31 23:59:59 UTC" (correct year shown)
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
  EXPECTED: Field shown as "N/A" (graceful degradation)

TEST: Mix of old and new format transactions
  SETUP: Some transactions with new fields, some without
  INPUT: GET /api/balance/history
  EXPECTED: All transactions displayed, missing fields handled gracefully

TEST: Old transactions without status field
  SETUP: Transaction created before status field added
  INPUT: GET /api/balance/history
  EXPECTED: Treated as status = "success" (backward compatible)
```

### Failed Transaction Tests
```
TEST: Failed transaction displays with failure indicator
  INPUT: Transaction with status = "failed"
  EXPECTED: Red "FAILED" badge displayed, row styled differently

TEST: Failed transaction shows failure reason
  INPUT: Transaction with status = "failed", failure_reason = "Insufficient balance"
  EXPECTED: "Insufficient balance" displayed in details

TEST: Failed deposit (Stripe declined) appears in history
  SETUP: Stripe webhook reports payment_intent.payment_failed
  INPUT: GET /api/balance/history
  EXPECTED: Transaction with type "deposit", status "failed", failure_reason "Payment declined"

TEST: Failed purchase (insufficient balance) appears in history
  SETUP: User attempts purchase with $0.50 balance for $1.00 item
  INPUT: GET /api/balance/history
  EXPECTED: Transaction with status "failed", failure_reason "Insufficient balance"

TEST: Failed transactions do not affect balance
  SETUP: User has $10 balance, failed purchase attempt for $5
  INPUT: Check balance_after_cents on failed transaction
  EXPECTED: balance_after_cents equals balance_before_cents

TEST: Filter by failed transactions only
  SETUP: User has mix of successful and failed transactions
  INPUT: GET /api/balance/history?status=failed
  EXPECTED: Only failed transactions returned

TEST: Filter excludes failed by default (optional)
  INPUT: GET /api/balance/history (no status filter)
  EXPECTED: All transactions shown (both success and failed)

TEST: Failed transaction count displayed
  SETUP: User has 5 failed transactions
  INPUT: View transaction history
  EXPECTED: Failed transaction count shown somewhere (header or filter badge)

TEST: Only insufficient balance and Stripe declined create failed records
  SETUP: Various failure scenarios occur
  INPUT: GET /api/balance/history?status=failed
  EXPECTED: Only "Insufficient balance" and "Payment declined" failures appear
           (no duplicate content, invalid CID, or other operational errors)

TEST: Stripe declined includes Stripe error code
  SETUP: Stripe webhook with decline_code = "insufficient_funds"
  INPUT: GET /api/balance/history
  EXPECTED: failure_reason includes Stripe decline code for debugging
```

### Running Balance Tests
```
TEST: Each transaction shows balance after
  INPUT: Transaction list
  EXPECTED: Each row shows balance_after_cents formatted as currency

TEST: Balance column header is clear
  INPUT: View transaction history
  EXPECTED: Column header "Balance After" or similar

TEST: First transaction shows initial balance context
  SETUP: User's first transaction is a deposit
  INPUT: View transaction history
  EXPECTED: balance_before_cents = 0, balance_after_cents = deposit amount

TEST: Running balance decreases for purchases
  SETUP: Deposit $10, then purchase $3
  INPUT: View both transactions
  EXPECTED: Deposit shows $10.00 balance, purchase shows $7.00 balance
```

### Export Link Tests
```
TEST: Export link displayed on transaction history page
  INPUT: View transaction history
  EXPECTED: Link/button "Export via API" visible

TEST: Export link includes correct static endpoint
  INPUT: Click export link
  EXPECTED: Links to /api/balance/history?limit=1000 (always static, ignores current filters)

TEST: Export link opens in new tab
  ACTION: Click export link
  EXPECTED: API response opens in new browser tab

TEST: Export link remains static regardless of filters
  SETUP: Filter by type = "deposit" on UI
  INPUT: Click export link
  EXPECTED: Still links to /api/balance/history?limit=1000 (not filtered)

TEST: API endpoint returns valid JSON for export
  INPUT: GET /api/balance/history?limit=1000
  EXPECTED: Valid JSON response, Content-Type: application/json

TEST: Export link is clearly labeled
  INPUT: View transaction history
  EXPECTED: Link text indicates it exports all transactions (e.g., "Export All (API)")
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
3. Dates displayed in absolute UTC format (YYYY-MM-DD HH:MM:SS UTC)
4. Amounts displayed as unsigned with IN/OUT direction, color-coded (green/red)
5. CID transactions show full content hash as clickable link
6. Retention transactions show the time period paid for
7. Bandwidth transactions show MTBR as "Xms (Y req/s)" and duration as date range
8. Running balance (balance_after_cents) shown for each transaction
9. Failed transactions (insufficient balance, Stripe declined) displayed with status indicator
10. Static export link to `/api/balance/history?limit=1000` available
11. Pagination works correctly for users with many transactions
12. Type filtering works correctly
13. Mobile-responsive design
14. All tests pass
15. No regression in existing transaction creation
16. Graceful handling of old transactions missing new fields
17. No records created for free inline content

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-20 | 1.0 | Initial plan created |
| 2026-01-20 | 1.1 | Resolved Q1-Q10, added follow-up Q11-Q15, updated tests for resolved decisions |
| 2026-01-20 | 1.2 | Resolved Q11-Q15, all questions answered, plan ready for implementation |
