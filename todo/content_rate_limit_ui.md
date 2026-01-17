# Content Rate Limit UI Plan

## Overview

This document describes the UI for allowing users to view rate limit status and purchase bandwidth (MTBR rate limiting) for specific content. The backend API is already complete (see `todo/content_rate_limit.md`), and this plan focuses on the frontend implementation.

## User Stories Addressed

From `todo/user_stories.md`:

- [UI: 📋 | API: ✅] **As a content publisher**, I would like to purchase bandwidth (MTBR rate limiting) for my content so that I can control access frequency.
  - _Paths: UI: `/dashboard/uploads/{hash}/rate-limit` (planned) | API: `POST /api/content/rate-limit/purchase`_
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to see rate limit pricing based on file size and request frequency so that I can budget appropriately.
  - _Paths: UI: `/dashboard/uploads/{hash}/rate-limit` (planned) | API: Pricing calculator in rate-limit handler_
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to check content rate limit status so that I know if I can download the content.
  - _Paths: UI: `/info.html` | API: `GET /api/content/{cid}/rate-limit`_

## Design Principles

1. **Consistency**: Follow existing UI patterns from `upload.html`, `deposit.html`, and `dashboard.html`
2. **Clarity**: Make pricing calculations transparent before purchase
3. **Progressive disclosure**: Show rate limit info when relevant, not overwhelming for inline content
4. **No external frameworks**: Use vanilla HTML/CSS/JavaScript matching existing codebase

---

## UI Components

### 1. Rate Limit Status Display (info.html enhancement)

**Location**: Add new `.info-card` section to `/frontend/info.html`

**Purpose**: Show current rate limit status for any CID

**Display Elements**:
- Current status: "Available", "Rate Limited", or "Unlimited" (for inline)
- Effective MTBR (if applicable)
- Time until next available request (if rate limited)
- Active rate limits count
- Default rate limit expiration (if applicable)

**Conditional Rendering**:
- **Inline content (≤64 bytes)**: Show "Unlimited - No Rate Limiting" badge, hide purchase option
- **Available content**: Show "Available" with effective MTBR and next reset time
- **Rate limited content**: Show "Rate Limited" with countdown to next available time
- **Blocked content (Infinity MTBR)**: Show "Blocked - Purchase Required" with call to action

### 2. Rate Limit Purchase Form

**Location**: `/frontend/rate-limit.html` (new page) or modal on `/info.html`

**Purpose**: Allow authenticated users to purchase bandwidth for any CID

**Form Elements**:
- **Content ID (CID)**: Display only (from URL parameter)
- **Content Size**: Display only (fetched from API)
- **MTBR Selector**: Range slider or dropdown with presets
  - Presets: 1 second, 10 seconds, 1 minute, 1 hour, 1 day
  - Custom input option (minimum 100ms)
- **Duration Selector**: Range slider or dropdown with presets
  - Presets: 7 days, 30 days, 90 days, matching remaining retention
  - Custom input option
  - Maximum: remaining content retention period
- **Live Cost Calculator**: Shows price as inputs change
  - Max requests calculation
  - Max bytes calculation
  - Total price in dollars
- **Balance Display**: Current balance with warning if insufficient
- **Purchase Button**: Disabled until authenticated and sufficient balance

### 3. Purchase Confirmation

**Purpose**: Show success after purchase

**Display Elements**:
- Purchase ID
- New effective MTBR
- Rate limit expiration date
- Amount charged
- Remaining balance
- Link to content

### 4. Dashboard Rate Limit Section (optional enhancement)

**Location**: Add to `/frontend/dashboard.html` in upload history

**Purpose**: Quick overview of rate limit status for user's content

**Display Elements**:
- List of user's uploads with rate limit status indicators
- Link to rate limit purchase for each

---

## User Flows

### Flow 1: View Rate Limit Status (Anonymous)

```
1. User visits /info.html?cid=ABC123
2. Page loads content metadata
3. Page fetches rate limit status from GET /api/content/{cid}/rate-limit
4. Display rate limit card with:
   - Current availability status
   - Effective MTBR (humanized, e.g., "1 request per minute")
   - Next available time (if rate limited)
   - "Purchase Bandwidth" button (links to rate-limit.html or prompts login)
```

### Flow 2: Purchase Bandwidth (Authenticated)

```
1. User clicks "Purchase Bandwidth" on info.html (or navigates to rate-limit.html?cid=ABC123)
2. If not authenticated:
   a. Show "Sign in required" message
   b. After sign in, return to purchase page
3. Page loads:
   a. Content metadata (size, retention expiration)
   b. Current rate limit status
   c. User balance
4. User configures purchase:
   a. Select/enter MTBR (minimum 100ms)
   b. Select/enter duration (max = remaining retention)
   c. View live cost calculation
5. User clicks "Purchase"
6. If insufficient balance:
   a. Show error with "Add Funds" link
   b. Return after deposit
7. On success:
   a. Show confirmation with purchase details
   b. Update balance display
   c. Refresh rate limit status
8. On error:
   a. Show appropriate error message
   b. Allow retry
```

### Flow 3: Content Download Rate Limited

```
1. User attempts to download content
2. If rate limited (429 response):
   a. Show rate limit error message
   b. Display next available time
   c. Offer link to purchase faster access
3. If successful:
   a. Content downloads
   b. Response headers include rate limit info
```

---

## MTBR Display Format

| MTBR (ms) | Display Text |
|-----------|--------------|
| 100 | 10 requests/second |
| 1000 | 1 request/second |
| 60000 | 1 request/minute |
| 3600000 | 1 request/hour |
| 86400000 | 1 request/day |
| 2592000000 | 1 request/30 days |
| Infinity | Blocked (purchase required) |

**Formula for display**: When MTBR < 1000ms, show "X requests/second". Otherwise, convert to most readable unit.

---

## Pricing Display

### Example: 1 MB file, 1-second MTBR, 30 days

```
Content Size:           1.00 MB
Request Frequency:      1 request per second
Duration:               30 days

Calculations:
Max Requests:           2,592,000 requests
Max Bandwidth:          2.47 TB
Price:                  $27.18

[Your Balance: $50.00 - Sufficient]
[Purchase Bandwidth]
```

### Example: 1 MB file, 1-minute MTBR, 30 days

```
Content Size:           1.00 MB
Request Frequency:      1 request per minute
Duration:               30 days

Calculations:
Max Requests:           43,200 requests
Max Bandwidth:          41.19 GB
Price:                  $0.42

[Your Balance: $50.00 - Sufficient]
[Purchase Bandwidth]
```

---

## Error States

| Error | User Message | Action |
|-------|--------------|--------|
| Content not found | "This content does not exist or has expired." | Link to upload |
| Inline content | "This content is small enough to be served unlimited. No purchase needed." | None |
| Unauthenticated | "Sign in to purchase bandwidth for this content." | Sign in button |
| Insufficient balance | "Insufficient balance. Required: $X.XX, Available: $Y.YY" | Add funds link |
| Duration exceeds retention | "Content expires in X days. Maximum duration: X days." | Adjust duration slider |
| MTBR too low | "Minimum time between requests is 100 milliseconds." | Adjust MTBR slider |
| Duration too short | "Duration must allow at least 1 request (duration ≥ MTBR)." | Adjust inputs |
| API error | "An error occurred. Please try again." | Retry button |

---

## Test Plan

### Unit Tests - Rate Limit Status Display

```
TEST-UI-STATUS-001: info.html should fetch and display rate limit status on load
TEST-UI-STATUS-002: Inline content should show "Unlimited - No Rate Limiting" badge
TEST-UI-STATUS-003: Inline content should NOT show purchase button
TEST-UI-STATUS-004: Available content should show "Available" status with green indicator
TEST-UI-STATUS-005: Rate limited content should show "Rate Limited" with orange/red indicator
TEST-UI-STATUS-006: Rate limited content should show countdown to next available time
TEST-UI-STATUS-007: Blocked content (Infinity MTBR) should show "Blocked - Purchase Required"
TEST-UI-STATUS-008: Blocked content should prominently display purchase button
TEST-UI-STATUS-009: Should display effective MTBR in human-readable format (e.g., "1 per minute")
TEST-UI-STATUS-010: Should display number of active rate limits
TEST-UI-STATUS-011: Should display default rate limit expiration if active
TEST-UI-STATUS-012: Content not found should show appropriate error
TEST-UI-STATUS-013: API error should show appropriate error message
TEST-UI-STATUS-014: Rate limit status should update on page refresh
TEST-UI-STATUS-015: next_available_at null (blocked) should show "Never (purchase required)"
```

### Unit Tests - MTBR Formatting

```
TEST-UI-FORMAT-001: 100ms should display as "10 requests/second"
TEST-UI-FORMAT-002: 500ms should display as "2 requests/second"
TEST-UI-FORMAT-003: 1000ms should display as "1 request/second"
TEST-UI-FORMAT-004: 60000ms (1 min) should display as "1 request/minute"
TEST-UI-FORMAT-005: 3600000ms (1 hr) should display as "1 request/hour"
TEST-UI-FORMAT-006: 86400000ms (1 day) should display as "1 request/day"
TEST-UI-FORMAT-007: 2592000000ms (30 days) should display as "1 request/30 days"
TEST-UI-FORMAT-008: Infinity should display as "Blocked"
TEST-UI-FORMAT-009: 30000ms should display as "2 requests/minute" (not 0.5 requests/second)
TEST-UI-FORMAT-010: 7200000ms (2 hours) should display as "1 request/2 hours"
```

### Unit Tests - Purchase Form Validation

```
TEST-UI-FORM-001: Form should be disabled until authenticated
TEST-UI-FORM-002: Form should be disabled for inline content
TEST-UI-FORM-003: MTBR input should enforce minimum of 100ms
TEST-UI-FORM-004: MTBR input below 100ms should show error message
TEST-UI-FORM-005: Duration input should enforce minimum of 1 second
TEST-UI-FORM-006: Duration input exceeding retention should show error
TEST-UI-FORM-007: Duration slider max should be set to remaining retention
TEST-UI-FORM-008: Duration exactly at MTBR boundary should be valid (1 request)
TEST-UI-FORM-009: Duration below MTBR should show error (0 requests)
TEST-UI-FORM-010: Purchase button disabled when form invalid
TEST-UI-FORM-011: Purchase button disabled when insufficient balance
TEST-UI-FORM-012: Form should show loading state while fetching content info
TEST-UI-FORM-013: Form should handle missing CID parameter gracefully
```

### Unit Tests - Live Pricing Calculator

```
TEST-UI-PRICE-001: Price should update in real-time as MTBR changes
TEST-UI-PRICE-002: Price should update in real-time as duration changes
TEST-UI-PRICE-003: Max requests should be floor(duration_seconds / (mtbr_ms / 1000))
TEST-UI-PRICE-004: Max bytes should be content_size * max_requests
TEST-UI-PRICE-005: Price calculation should match backend formula
TEST-UI-PRICE-006: Price should be rounded UP to nearest cent
TEST-UI-PRICE-007: Sub-cent prices should display as $0.01
TEST-UI-PRICE-008: Large prices should display with proper formatting ($1,234.56)
TEST-UI-PRICE-009: Max bytes should display in appropriate units (KB, MB, GB, TB)
TEST-UI-PRICE-010: Calculator should show breakdown: size × requests × rate
TEST-UI-PRICE-011: Zero requests (duration < MTBR) should show $0.00 and error
TEST-UI-PRICE-012: Calculator should handle very large content (GB) correctly
TEST-UI-PRICE-013: Calculator should handle very small MTBR (100ms) correctly
TEST-UI-PRICE-014: Calculator should handle very long duration (years) correctly
```

### Unit Tests - Balance Display

```
TEST-UI-BALANCE-001: Current balance should be displayed for authenticated users
TEST-UI-BALANCE-002: Balance should show "Sufficient" when >= required price
TEST-UI-BALANCE-003: Balance should show "Insufficient" when < required price
TEST-UI-BALANCE-004: Insufficient balance should show amount needed
TEST-UI-BALANCE-005: Insufficient balance should show "Add Funds" link
TEST-UI-BALANCE-006: Balance display should be hidden for unauthenticated users
TEST-UI-BALANCE-007: Balance should refresh after successful purchase
TEST-UI-BALANCE-008: Balance should update when returning from deposit page
```

### Unit Tests - Purchase Submission

```
TEST-UI-SUBMIT-001: Submit should send correct parameters to API
TEST-UI-SUBMIT-002: Submit should show loading state during request
TEST-UI-SUBMIT-003: Submit button should be disabled during request (prevent double-submit)
TEST-UI-SUBMIT-004: Successful purchase should show confirmation
TEST-UI-SUBMIT-005: Confirmation should display purchase ID
TEST-UI-SUBMIT-006: Confirmation should display new effective MTBR
TEST-UI-SUBMIT-007: Confirmation should display expiration date
TEST-UI-SUBMIT-008: Confirmation should display amount charged
TEST-UI-SUBMIT-009: Confirmation should display remaining balance
TEST-UI-SUBMIT-010: Confirmation should offer link to content
TEST-UI-SUBMIT-011: Confirmation should offer "Purchase More" option
TEST-UI-SUBMIT-012: Error response should display appropriate message
TEST-UI-SUBMIT-013: Network error should show retry option
TEST-UI-SUBMIT-014: insufficient_balance error should show add funds link
TEST-UI-SUBMIT-015: duration_exceeds_retention error should show max duration
TEST-UI-SUBMIT-016: After error, form should remain editable (not cleared)
```

### Unit Tests - Authentication Flow

```
TEST-UI-AUTH-001: Unauthenticated user should see "Sign in to purchase" message
TEST-UI-AUTH-002: Sign in button should trigger Clerk authentication
TEST-UI-AUTH-003: After sign in, user should be returned to same page with CID preserved
TEST-UI-AUTH-004: After sign in, balance and form should become available
TEST-UI-AUTH-005: Session expiry during form use should show appropriate error
TEST-UI-AUTH-006: API key authentication should work for purchase (if applicable)
```

### Unit Tests - UI Component Styling

```
TEST-UI-STYLE-001: Rate limit card should follow .info-card styling pattern
TEST-UI-STYLE-002: Form inputs should use .form-group and .form-control classes
TEST-UI-STYLE-003: Error messages should use .alert.alert-error pattern
TEST-UI-STYLE-004: Success messages should use .alert.alert-success pattern
TEST-UI-STYLE-005: Loading states should use .spinner component
TEST-UI-STYLE-006: Buttons should use .btn, .btn-primary, .btn-secondary classes
TEST-UI-STYLE-007: Cost display should follow .cost-display pattern from upload.html
TEST-UI-STYLE-008: Page should be responsive at 768px breakpoint
TEST-UI-STYLE-009: Color variables should use CSS custom properties from base.css
TEST-UI-STYLE-010: Typography should match existing font-size scale
```

### Integration Tests - End-to-End Flows

```
TEST-UI-E2E-001: Anonymous user can view rate limit status on info.html
TEST-UI-E2E-002: Authenticated user can view rate limit status with purchase option
TEST-UI-E2E-003: User can complete purchase flow from info.html to confirmation
TEST-UI-E2E-004: After purchase, rate limit status updates to reflect new MTBR
TEST-UI-E2E-005: Multiple purchases for same CID stack correctly in UI
TEST-UI-E2E-006: User with insufficient balance is guided to deposit flow
TEST-UI-E2E-007: After deposit, user can return and complete purchase
TEST-UI-E2E-008: Rate limited download shows appropriate error with purchase link
TEST-UI-E2E-009: Inline content download never shows rate limit errors
TEST-UI-E2E-010: User's uploaded content shows rate limit status in dashboard
```

### Integration Tests - API Integration

```
TEST-UI-API-001: UI correctly parses GET /api/content/{cid}/rate-limit response
TEST-UI-API-002: UI correctly constructs POST /api/content/rate-limit/purchase request
TEST-UI-API-003: UI handles all documented error codes from purchase API
TEST-UI-API-004: UI handles network timeout gracefully
TEST-UI-API-005: UI handles 401 Unauthorized appropriately
TEST-UI-API-006: UI handles 404 Content Not Found appropriately
TEST-UI-API-007: UI handles 429 Rate Limit (API rate limit, not content) appropriately
TEST-UI-API-008: Bearer token is included in authenticated requests
TEST-UI-API-009: Balance API response is parsed correctly
```

### Edge Case Tests

```
TEST-UI-EDGE-001: Very long CID should not break layout
TEST-UI-EDGE-002: Very large content size (TB) should display correctly
TEST-UI-EDGE-003: Very small content size (1 byte, non-inline) should work
TEST-UI-EDGE-004: Content expiring in less than 1 day should show correct max duration
TEST-UI-EDGE-005: Content expiring in less than 1 hour should show appropriate warning
TEST-UI-EDGE-006: Maximum duration slider at retention boundary works correctly
TEST-UI-EDGE-007: MTBR at exact minimum (100ms) works correctly
TEST-UI-EDGE-008: Page reload preserves selected values (URL params or local state)
TEST-UI-EDGE-009: Browser back button works correctly in purchase flow
TEST-UI-EDGE-010: Multiple rapid clicks on purchase button only submits once
TEST-UI-EDGE-011: Form works in Safari, Chrome, Firefox (cross-browser)
TEST-UI-EDGE-012: Form works on mobile devices
TEST-UI-EDGE-013: Copy button for CID works correctly
TEST-UI-EDGE-014: Extremely large price (millions) displays correctly
TEST-UI-EDGE-015: User with exactly sufficient balance can purchase
TEST-UI-EDGE-016: User with balance at exactly $0.01 below required sees correct error
TEST-UI-EDGE-017: Rate limit expiring in seconds shows countdown
TEST-UI-EDGE-018: Default rate limit about to expire shows warning
TEST-UI-EDGE-019: Content with many active rate limits displays reasonably
TEST-UI-EDGE-020: Blocked content with no rate limits shows clear call to action
```

### Accessibility Tests

```
TEST-UI-A11Y-001: All form inputs have associated labels
TEST-UI-A11Y-002: Error messages are announced to screen readers
TEST-UI-A11Y-003: Focus management after form submission is correct
TEST-UI-A11Y-004: Color alone is not used to convey status (icons/text included)
TEST-UI-A11Y-005: Interactive elements are keyboard accessible
TEST-UI-A11Y-006: Loading states are announced to assistive technology
TEST-UI-A11Y-007: Sufficient color contrast on all text
TEST-UI-A11Y-008: Slider inputs have accessible alternatives (number input)
```

---

## Open Questions

### Question 1: Page Structure

**Options**:
a) Add purchase form as a modal/expandable section on `/info.html`
b) Create a separate `/rate-limit.html` page for purchases
c) Add to `/dashboard/uploads/{hash}/` page (requires dashboard content management implementation first)

**Trade-offs**:
- (a) Simpler, keeps everything on one page, but may clutter the info page
- (b) Cleaner separation, follows REST-like URL structure, but requires navigation
- (c) Best UX for content publishers, but depends on unimplemented dashboard features

### Question 2: MTBR Input Method

**Options**:
a) Range slider with predefined presets only
b) Freeform input with validation (minimum 100ms)
c) Hybrid: slider with presets + "Custom" option for freeform

**Trade-offs**:
- (a) Simpler UX, prevents invalid values, but limits flexibility
- (b) Maximum flexibility, but users may enter invalid values or make mistakes
- (c) Best of both, but more complex to implement

### Question 3: Duration Input Method

**Options**:
a) Presets only (7d, 30d, 90d, max)
b) Calendar date picker
c) Freeform days/hours input
d) Slider bound to remaining retention

**Trade-offs**:
- (a) Simple but limiting
- (b) Familiar UX but may confuse with absolute dates
- (c) Flexible but error-prone
- (d) Clear limits, intuitive, but needs clear labeling

### Question 4: When to Show Rate Limit Info

**Options**:
a) Always show rate limit section on info.html
b) Only show when content is rate limited or blocked
c) Show minimal status by default, expandable for details

**Trade-offs**:
- (a) Consistent but may overwhelm for inline content
- (b) Cleaner but users may not discover the feature
- (c) Balance of both but more complex UX

### Question 5: Anonymous vs Authenticated Purchase View

**Options**:
a) Show full pricing calculator to anonymous users, require auth only at purchase
b) Require authentication before showing pricing
c) Show simplified pricing info to anonymous, full details after auth

**Trade-offs**:
- (a) More transparent, users see cost before committing to sign in
- (b) Simpler implementation, but may feel like a bait-and-switch
- (c) Middle ground but duplicates some UI work

### Question 6: Purchase Success Behavior

**Options**:
a) Show inline confirmation, stay on same page
b) Redirect to dedicated confirmation page
c) Redirect to info.html with success message

**Trade-offs**:
- (a) Fewer page loads, but may not feel like a significant action
- (b) Clear completion signal, printable receipt, but more navigation
- (c) Natural flow, shows updated status, simple to implement

### Question 7: Handling Content Near Expiration

**Options**:
a) Allow any duration up to remaining retention, let user take the risk
b) Warn when duration is close to retention expiration
c) Require minimum "buffer" (e.g., 1 day before expiration)

**Trade-offs**:
- (a) Maximum flexibility, consistent with "no refunds" policy
- (b) Helpful UX, prevents accidental waste
- (c) More restrictive, may frustrate users who want short bursts

### Question 8: Default MTBR Presets

**Options**:
a) [100ms, 1s, 10s, 1min, 1hr, 1day]
b) [1s, 1min, 10min, 1hr]
c) [1s, 10s, 30s, 1min]

**Trade-offs**:
- Different use cases have different needs (CDN-like vs. occasional access)
- Wider range gives more flexibility but may overwhelm
- Narrower range is simpler but may not cover edge cases

---

## Implementation Phases

### Phase 1: Rate Limit Status Display (info.html)
- Add rate limit status card to info.html
- Display availability, effective MTBR, countdown
- Show "Purchase Bandwidth" link (non-functional initially)
- Handle inline content display

### Phase 2: Purchase Form UI
- Create rate-limit.html page structure
- Implement MTBR selector UI
- Implement duration selector UI
- Implement live pricing calculator (client-side)

### Phase 3: Purchase Integration
- Integrate Clerk authentication
- Integrate balance API
- Connect purchase form to backend API
- Implement success/error handling

### Phase 4: Polish & Edge Cases
- Cross-browser testing
- Mobile responsiveness
- Accessibility audit
- Error handling improvements

---

## File Changes Required

### New Files
- `/frontend/rate-limit.html` - Purchase page (if Option 1b chosen)
- `/frontend/css/rate-limit.css` - Rate limit specific styles (optional)
- `/frontend/js/rate-limit.js` - Rate limit purchase logic

### Modified Files
- `/frontend/info.html` - Add rate limit status section
- `/frontend/js/hash256t.js` - May need price calculation utilities

---

## Dependencies

- Backend API: ✅ Complete (`POST /api/content/rate-limit/purchase`, `GET /api/content/{cid}/rate-limit`)
- Authentication: ✅ Complete (Clerk integration)
- Balance API: ✅ Complete (`GET /api/balance`)
- Deposit flow: ✅ Complete (`deposit.html`)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-17 | Initial plan with test list and open questions |

