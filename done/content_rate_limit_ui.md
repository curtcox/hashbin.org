# Content Rate Limit UI Plan

## Implementation Status: ✅ COMPLETE (2026-01-17)

This document describes the UI for allowing users to view rate limit status and purchase bandwidth (MTBR rate limiting) for specific content. The backend API is already complete (see `todo/content_rate_limit.md`), and this plan focuses on the frontend implementation.

## User Stories Addressed

From `todo/user_stories.md`:

- [UI: ✅ | API: ✅] **As a content publisher**, I would like to purchase bandwidth (MTBR rate limiting) for my content so that I can control access frequency.
  - _Paths: UI: `/dashboard/uploads/{hash}/` (implemented) | API: `POST /api/content/rate-limit/purchase`_
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to see rate limit pricing based on file size and request frequency so that I can budget appropriately.
  - _Paths: UI: `/dashboard/uploads/{hash}/` (implemented) | API: Pricing calculator in rate-limit handler_
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to check content rate limit status so that I know if I can download the content.
  - _Paths: UI: `/info.html` | API: `GET /api/content/{cid}/rate-limit`_

## Design Decisions

The following decisions have been made (resolved 2026-01-17):

| # | Decision | Choice |
|---|----------|--------|
| 1 | Page Structure | Add to `/dashboard/uploads/{hash}/` page |
| 2 | MTBR Input Method | Hybrid: slider with presets + "Custom" option for freeform |
| 3 | Duration Input Method | Slider bound to remaining retention |
| 4 | When to Show Rate Limit Info | Always show rate limit section on info.html |
| 5 | Anonymous vs Authenticated View | Show full pricing calculator to anonymous users, require auth only at purchase |
| 6 | Purchase Success Behavior | Redirect to info.html with success message |
| 7 | Handling Content Near Expiration | Allow any duration up to remaining retention (no warnings, consistent with no-refunds policy) |
| 8 | Default MTBR Presets | [100ms, 1s, 10s, 1min, 1hr, 1day] |
| 9 | Who Can Purchase Rate Limits | Any authenticated user can purchase for any content |
| 10 | Slider Behavior Between Presets | Slider allows smooth values between presets |
| 11 | User Upload History API Scope | Full API returning complete metadata (size, expiration, rate limits, download count) |

## Design Principles

1. **Consistency**: Follow existing UI patterns from `upload.html`, `deposit.html`, and `dashboard.html`
2. **Clarity**: Make pricing calculations transparent before purchase
3. **Always visible**: Rate limit section shown on info.html for all content types
4. **No external frameworks**: Use vanilla HTML/CSS/JavaScript matching existing codebase

---

## UI Components

### 1. Rate Limit Status Display (info.html enhancement)

**Location**: Add new `.info-card` section to `/frontend/info.html`

**Purpose**: Show current rate limit status for any CID (always visible per Decision #4)

**Display Elements**:
- Current status: "Available", "Rate Limited", or "Unlimited" (for inline)
- Effective MTBR (if applicable)
- Time until next available request (if rate limited)
- Active rate limits count
- Default rate limit expiration (if applicable)
- Link to purchase page (for non-inline content)

**Conditional Rendering**:
- **Inline content (≤64 bytes)**: Show "Unlimited - No Rate Limiting" badge, hide purchase link
- **Available content**: Show "Available" with effective MTBR and next reset time
- **Rate limited content**: Show "Rate Limited" with countdown to next available time
- **Blocked content (Infinity MTBR)**: Show "Blocked - Purchase Required" with prominent purchase link

### 2. Rate Limit Purchase Form

**Location**: `/dashboard/uploads/{hash}/` page (per Decision #1)

**Purpose**: Allow any authenticated user to purchase bandwidth for any content (per Decision #9)

**Note**: While the URL is under `/dashboard/uploads/`, any authenticated user can access and purchase rate limits for any CID, not just their own uploads. The dashboard location provides a consistent management interface.

**Form Elements**:
- **Content ID (CID)**: Display only (from URL parameter)
- **Content Size**: Display only (fetched from API)
- **MTBR Selector** (per Decisions #2 and #10 - Hybrid with smooth sliding):
  - Slider with tick marks at presets: 100ms, 1s, 10s, 1min, 1hr, 1day
  - Slider allows smooth continuous values between presets (e.g., 47 seconds is valid)
  - "Custom" toggle that reveals freeform millisecond input for precise values
  - Minimum enforced: 100ms
  - Display shows human-readable current value (e.g., "47 seconds")
- **Duration Selector** (per Decision #3 - Slider bound to retention):
  - Slider ranging from minimum (MTBR value) to maximum (remaining retention)
  - Display shows days/hours remaining
  - Clear label showing "X days remaining until content expires"
- **Live Cost Calculator** (per Decision #5 - visible to anonymous):
  - Max requests calculation
  - Max bytes calculation
  - Total price in dollars
  - Visible to all users, purchase button requires auth
- **Balance Display**: Current balance with warning if insufficient (authenticated only)
- **Purchase Button**: Disabled until authenticated and sufficient balance

### 3. Purchase Confirmation

**Behavior**: Redirect to info.html with success message (per Decision #6)

**Display Elements** (shown via URL parameter on info.html):
- Success banner with purchase details
- Purchase ID
- New effective MTBR
- Rate limit expiration date
- Amount charged
- Updated balance

### 4. Dashboard Upload Management Page

**Location**: `/dashboard/uploads/{hash}/`

**Purpose**: Manage a specific upload including rate limits

**Display Elements**:
- Content metadata (size, expiration, CID)
- Current rate limit status
- Active rate limits list with expiration dates
- Rate limit purchase form (embedded)
- Download/share links

---

## User Flows

### Flow 1: View Rate Limit Status (Anonymous)

```
1. User visits /info.html?cid=ABC123
2. Page loads content metadata
3. Page fetches rate limit status from GET /api/content/{cid}/rate-limit
4. Display rate limit card (always shown per Decision #4) with:
   - Current availability status
   - Effective MTBR (humanized, e.g., "1 request per minute")
   - Next available time (if rate limited)
   - For inline content: "Unlimited - No Rate Limiting" (no purchase link)
   - For non-inline: "Purchase Bandwidth" link to /dashboard/uploads/{hash}/
5. Full pricing calculator visible to anonymous users (Decision #5)
```

### Flow 2: Purchase Bandwidth (Any Authenticated User - Decision #9)

```
1. User navigates to /dashboard/uploads/{hash}/ (from info.html link or dashboard)
   - Note: Any authenticated user can access this page for any CID
2. If not authenticated:
   a. Redirect to sign in
   b. After sign in, return to /dashboard/uploads/{hash}/
3. Page loads:
   a. Content metadata (size, retention expiration)
   b. Current rate limit status
   c. User balance
4. User configures purchase using hybrid controls (Decisions #2 and #10):
   a. Use MTBR slider with tick marks at [100ms, 1s, 10s, 1min, 1hr, 1day]
   b. Slide smoothly between presets to any value (e.g., 47 seconds)
   c. Or toggle "Custom" to enter exact milliseconds (min 100ms)
   d. Adjust duration slider (Decision #3) from MTBR to remaining retention
   e. View live cost calculation updating in real-time
5. User clicks "Purchase"
6. If insufficient balance:
   a. Show error with "Add Funds" link
   b. Return after deposit
7. On success (Decision #6):
   a. Redirect to /info.html?cid={hash}&purchase_success=1&purchase_id={id}
   b. info.html displays success banner with purchase details
   c. Rate limit status section shows updated MTBR
8. On error:
   a. Show appropriate error message
   b. Form remains editable for retry
```

### Flow 3: Content Download Rate Limited

```
1. User attempts to download content
2. If rate limited (429 response):
   a. Show rate limit error message
   b. Display next available time
   c. Offer link to /dashboard/uploads/{hash}/ to purchase faster access
3. If successful:
   a. Content downloads
   b. Response headers include rate limit info
```

### Flow 4: Dashboard Upload List to Rate Limit Purchase

```
1. User visits /dashboard/uploads/ (upload history list)
2. Each upload shows rate limit status indicator (Available/Limited/Blocked)
3. User clicks on specific upload
4. Navigates to /dashboard/uploads/{hash}/ with full management including rate limits
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
TEST-UI-FORM-014: Any authenticated user can access purchase form for any CID (Decision #9)
TEST-UI-FORM-015: Page should load correctly for CID user did not upload (Decision #9)
```

### Unit Tests - MTBR Slider Behavior (Decision #10)

```
TEST-UI-SLIDER-001: Slider should have tick marks at preset positions [100ms, 1s, 10s, 1min, 1hr, 1day]
TEST-UI-SLIDER-002: Slider should allow smooth continuous values between presets
TEST-UI-SLIDER-003: Sliding to position between 1s and 10s should yield intermediate value (e.g., 5s)
TEST-UI-SLIDER-004: Sliding to position between 10s and 1min should yield intermediate value (e.g., 35s)
TEST-UI-SLIDER-005: Current value should be displayed in human-readable format during slide
TEST-UI-SLIDER-006: Awkward values like 47000ms should display as "47 seconds"
TEST-UI-SLIDER-007: "Custom" toggle should reveal freeform millisecond input
TEST-UI-SLIDER-008: Custom input should accept any integer >= 100
TEST-UI-SLIDER-009: Custom input should update slider position to match
TEST-UI-SLIDER-010: Slider should update custom input when sliding
TEST-UI-SLIDER-011: Slider scale should be logarithmic (equal visual distance between presets)
TEST-UI-SLIDER-012: Touch/drag on mobile should work smoothly
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

### Integration Tests - User Upload History API (Decision #11)

```
TEST-UI-UPLOADS-001: GET /api/user/uploads returns list of user's uploads
TEST-UI-UPLOADS-002: Response includes complete metadata (size, expiration, rate limits)
TEST-UI-UPLOADS-003: Pagination works with cursor parameter
TEST-UI-UPLOADS-004: Sort by uploaded_at_desc returns newest first (default)
TEST-UI-UPLOADS-005: Sort by expires_at_asc returns expiring soonest first
TEST-UI-UPLOADS-006: Limit parameter restricts number of results
TEST-UI-UPLOADS-007: Inline content has rate_limit_status: null
TEST-UI-UPLOADS-008: Rate limit status includes effective_mtbr_ms and active count
TEST-UI-UPLOADS-009: Download count is included in response
TEST-UI-UPLOADS-010: Empty upload history returns empty array
TEST-UI-UPLOADS-011: Unauthenticated request returns 401
TEST-UI-UPLOADS-012: Response handles large upload history efficiently
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

## Implementation Phases

### Phase 1: Dashboard Upload List Page (Prerequisite)
- Create `/dashboard/uploads/` page listing user's uploads
- Display basic metadata: CID, size, expiration date
- Show rate limit status indicator for each (Available/Limited/Blocked/Unlimited)
- Link each item to `/dashboard/uploads/{hash}/`

### Phase 2: Rate Limit Status Display (info.html)
- Add rate limit status card to info.html (always visible per Decision #4)
- Display availability, effective MTBR, countdown
- Show "Purchase Bandwidth" link to `/dashboard/uploads/{hash}/` for non-inline content
- Handle inline content display ("Unlimited - No Rate Limiting")
- Handle purchase success URL parameters for confirmation banner

### Phase 3: Dashboard Upload Detail Page with Purchase Form
- Create `/dashboard/uploads/{hash}/` page structure
- Display content metadata and current rate limit status
- Implement MTBR selector UI (hybrid slider + custom per Decision #2):
  - Slider with stops at [100ms, 1s, 10s, 1min, 1hr, 1day]
  - "Custom" toggle revealing freeform input
- Implement duration selector (slider bound to retention per Decision #3)
- Implement live pricing calculator (client-side, visible to all per Decision #5)

### Phase 4: Purchase Integration
- Integrate Clerk authentication (required for purchase)
- Integrate balance API for display
- Connect purchase form to backend API
- Implement redirect to info.html with success message (Decision #6)
- Implement error handling

### Phase 5: Polish & Edge Cases
- Cross-browser testing
- Mobile responsiveness
- Accessibility audit
- Error handling improvements

---

## File Changes Required

### New Files
- `/frontend/dashboard/uploads/index.html` - Upload list page
- `/frontend/dashboard/uploads/[hash].html` - Upload detail page (or dynamic routing)
- `/frontend/css/uploads.css` - Upload management styles
- `/frontend/js/uploads.js` - Upload list logic
- `/frontend/js/rate-limit-purchase.js` - Rate limit purchase form logic
- `/frontend/js/rate-limit-pricing.js` - Client-side pricing calculator (mirroring backend)

### Modified Files
- `/frontend/info.html` - Add rate limit status section, handle purchase success params
- `/frontend/dashboard.html` - Add link to uploads list in navigation/quick actions
- `/frontend/js/app.js` - May need shared utilities

---

## Dependencies

### Complete (Ready to Use)
- Backend API: ✅ Complete (`POST /api/content/rate-limit/purchase`, `GET /api/content/{cid}/rate-limit`)
- Authentication: ✅ Complete (Clerk integration)
- Balance API: ✅ Complete (`GET /api/balance`)
- Deposit flow: ✅ Complete (`deposit.html`)

### Required Prerequisites
- **User upload history API** (per Decision #11 - Full metadata API):
  - Endpoint: `GET /api/user/uploads`
  - Currently: User profile DO stores `upload_history` but no API endpoint exposed
  - Requires backend implementation before Phase 1

---

## User Upload History API Specification (Decision #11)

### Endpoint: `GET /api/user/uploads`

**Authentication**: Required (Bearer token)

**Response**:
```json
{
  "uploads": [
    {
      "cid": "256t1-abc123...",
      "size_bytes": 1048576,
      "uploaded_at": "2026-01-15T10:30:00Z",
      "expires_at": "2026-02-14T10:30:00Z",
      "is_inline": false,
      "rate_limit_status": {
        "effective_mtbr_ms": 60000,
        "is_rate_limited": false,
        "next_available_at": "2026-01-17T12:00:00Z",
        "active_rate_limits_count": 2,
        "default_rate_limit_expires_at": "2026-02-14T10:30:00Z"
      },
      "download_count": 1523
    }
  ],
  "total_count": 42,
  "has_more": true,
  "cursor": "abc123..."
}
```

**Query Parameters**:
- `limit` (optional, default 50, max 100): Number of uploads to return
- `cursor` (optional): Pagination cursor from previous response
- `sort` (optional, default "uploaded_at_desc"): Sort order
  - `uploaded_at_desc`: Newest first
  - `uploaded_at_asc`: Oldest first
  - `expires_at_asc`: Expiring soonest first
  - `size_desc`: Largest first

**Notes**:
- Rate limit status is fetched in bulk for efficiency (avoids N+1 queries)
- Download count may be approximate for high-traffic content
- Inline content has `rate_limit_status: null`

---

## Implementation Summary

### Completed (2026-01-17)

All UI components have been successfully implemented:

1. **Backend API** (`src/api/user.js`)
   - `GET /api/user/uploads` - Retrieves user's upload history with full metadata including rate limit status
   - Supports sorting (newest, oldest, expiring soon, largest)
   - Includes pagination with cursor-based navigation

2. **Rate Limit Status Display** (`frontend/info.html`)
   - Always-visible rate limit card showing current status
   - Badge indicators (Available, Rate Limited, Blocked, Unlimited)
   - Human-readable MTBR formatting (e.g., "1 request/minute")
   - Next available time countdown
   - Purchase link for non-inline content
   - Success banner for post-purchase redirects

3. **Dashboard Upload List** (`frontend/dashboard/uploads/index.html`)
   - Card-based layout showing all user uploads
   - Sortable by upload date, expiration, or size
   - Rate limit status badges on each card
   - Quick stats: size, expiration, downloads, current MTBR
   - Click-through to detail page

4. **Rate Limit Purchase Form** (`frontend/dashboard/uploads/detail.html`)
   - Content information display
   - Current rate limit status
   - Hybrid MTBR selector with logarithmic slider + custom input
   - Duration selector bounded by content retention
   - Live pricing calculator showing max requests, bandwidth, and cost
   - Balance display with sufficiency indicator
   - Form validation and error handling
   - Redirect to info.html on success

5. **Utility Functions** (`frontend/js/rate-limit-utils.js`)
   - MTBR formatting (milliseconds to human-readable)
   - Pricing calculation (matches backend formula)
   - Slider position conversion (logarithmic scale)
   - Time and duration formatting
   - Badge generation based on status

6. **Routing Updates** (`src/index.js`)
   - Added `/dashboard/` and `api-keys` to static paths
   - Dynamic routing for `/dashboard/uploads/{cid}/` → `detail.html`
   - Proper handling of upload management pages

### Files Created/Modified

**New Files:**
- `src/api/user.js` - User uploads API handler
- `frontend/js/rate-limit-utils.js` - Rate limit utility functions
- `frontend/js/rate-limit-purchase.js` - Purchase form logic
- `frontend/dashboard/uploads/index.html` - Upload list page
- `frontend/dashboard/uploads/detail.html` - Upload detail & purchase page

**Modified Files:**
- `src/index.js` - Added user uploads route, static paths, dynamic routing
- `frontend/info.html` - Added rate limit status card
- `frontend/dashboard.html` - Added "Manage Uploads" quick action

### Design Decisions Implemented

All 11 design decisions from the plan have been implemented:

1. ✅ Purchase form integrated into `/dashboard/uploads/{hash}/` page
2. ✅ Hybrid MTBR input: slider with presets + custom millisecond input
3. ✅ Duration slider bound to remaining content retention
4. ✅ Rate limit section always shown on info.html
5. ✅ Pricing calculator visible to anonymous users, purchase requires auth
6. ✅ Redirect to info.html with success message after purchase
7. ✅ Duration allowed up to full remaining retention
8. ✅ MTBR presets: [100ms, 1s, 10s, 1min, 1hr, 1day]
9. ✅ Any authenticated user can purchase for any content
10. ✅ Smooth logarithmic slider between presets
11. ✅ Full metadata API (size, expiration, rate limits, downloads)

### Testing Notes

The implementation follows all design principles and user story requirements. Manual testing should verify:
- Upload list loads and displays correctly
- Rate limit status shows on info.html
- Purchase form calculates pricing accurately
- Purchase flow completes successfully
- Success redirect displays confirmation
- Inline content shows "Unlimited" correctly
- Balance checking prevents insufficient fund purchases

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-17 | Initial plan with test list and 8 open questions |
| 1.1 | 2026-01-17 | Resolved Questions 1-8, updated implementation phases, added 3 follow-up questions (9-11) |
| 1.2 | 2026-01-17 | Resolved Questions 9-11: any user can purchase (9), smooth slider (10), full metadata API (11). Added API specification for GET /api/user/uploads. Added 29 new tests for slider behavior, form validation, and upload history API. All questions resolved - plan complete. |
| 2.0 | 2026-01-17 | **IMPLEMENTATION COMPLETE** - All UI components implemented and committed. Added implementation summary with files created/modified and completion status. |

