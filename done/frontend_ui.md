# Frontend UI Implementation Plan

## Implementation Status

**Status:** ✅ COMPLETED - Phase 8 (January 2026)

---

## Overview

This document outlines the plan for implementing the HashBin.org frontend user interface. Per Architectural Decision #11, the frontend will be built using **plain HTML/CSS/JavaScript** (vanilla, no frameworks) and hosted on **Cloudflare Pages**.

## Goals

1. Provide intuitive content upload interface with drag-and-drop support
2. Enable content retrieval via 256t hash input
3. Integrate Clerk OAuth for user authentication
4. Integrate Stripe for payment flows (wallet deposits, retention extensions)
5. Create user dashboard for managing uploads, payments, and API keys
6. Display public records for transparency
7. Provide documentation and help resources
8. Ensure accessibility (WCAG 2.1 AA compliance)
9. Support responsive design for mobile and desktop

## Non-Goals (Per Architectural Decisions)

- **No search/discovery features** (Decision #12) - Access is hash-only
- **No user behavior analytics** (Decision #14) - Financial tracking only
- **No user tracking cookies** - Session management via Clerk only

---

## Architecture

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Markup | HTML5 | Semantic, accessible |
| Styling | CSS3 (Grid/Flexbox) | No preprocessor needed |
| Scripting | Vanilla ES6+ JavaScript | Zero build step |
| Components | Web Components (optional) | Native reusability |
| Auth | Clerk JavaScript SDK | OAuth integration |
| Payments | Stripe.js | Payment form handling |
| Hosting | Cloudflare Pages | Edge deployment |
| Icons | SVG inline or sprite | No external dependencies |

### Project Structure

```
frontend/
├── index.html              # Landing page
├── upload.html             # Content upload page
├── retrieve.html           # Content retrieval page
├── dashboard.html          # User dashboard
├── deposit.html            # Wallet deposit page
├── public-records.html     # Transparency records
├── docs/
│   ├── index.html          # Documentation home
│   ├── api.html            # API reference
│   ├── faq.html            # FAQ
│   └── pricing.html        # Pricing calculator
├── css/
│   ├── base.css            # Reset, typography, variables
│   ├── layout.css          # Grid, responsive
│   └── components.css      # Buttons, forms, cards
├── js/
│   ├── app.js              # Main initialization
│   ├── auth.js             # Clerk integration
│   ├── upload.js           # Upload functionality
│   ├── retrieve.js         # Retrieval functionality
│   ├── dashboard.js        # Dashboard logic
│   ├── payments.js         # Stripe integration
│   └── utils.js            # Shared utilities
└── assets/
    ├── logo.svg
    └── icons.svg           # SVG sprite
```

### Page Flow

```
                    ┌──────────────┐
                    │   Landing    │
                    │   (index)    │
                    └──────┬───────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │   Upload   │  │  Retrieve  │  │   Docs     │
    │            │  │            │  │            │
    └─────┬──────┘  └────────────┘  └────────────┘
          │
          │ (requires auth)
          ▼
    ┌────────────┐     ┌────────────┐
    │  Dashboard │────▶│  Deposit   │
    │            │     │  (Stripe)  │
    └────────────┘     └────────────┘
```

---

## Pages and Components

### 1. Landing Page (`index.html`)

**Purpose:** Explain service, direct users to upload/retrieve, show current status

**Sections:**
- Hero: Tagline + primary CTA buttons (Upload, Retrieve)
- How It Works: 3-step explanation
- Pricing: Cost calculator preview
- Public Records: Link to transparency data
- Footer: Links to docs, terms, privacy

**Components:**
- `<nav-header>` - Navigation bar with auth state
- `<hero-section>` - Main call to action
- `<pricing-preview>` - Quick cost estimate
- `<page-footer>` - Links and legal

---

### 2. Upload Page (`upload.html`)

**Purpose:** Allow authenticated users to upload content and pay for retention

**Requirements:**
- Clerk authentication required (redirect to sign-in if not authenticated)
- Drag-and-drop zone OR file picker button
- Display file info after selection: name, size, type
- **Client-side 256t hash computation** before upload
- Check if content already exists (`GET /api/content/:cid/exists`)
- If duplicate: show message, extend retention by 30 days minimum
- If new: show retention duration selector (presets + custom)
- Display cost calculation in real-time
- Show current wallet balance
- Reject if balance insufficient for 30-day minimum
- Progress indicator during upload
- Success state with hash display and share options

**Retention Presets (per Decision #35):**
- 1 month
- 1 year
- 1 decade (10 years)
- 1 century (100 years)
- Custom: any multiple of 30 days

**User Flow:**
1. User selects file
2. Client computes 256t hash
3. Client checks if CID exists
4. If exists: show "Content already exists" message + extend option
5. If new: show retention selector
6. User selects duration
7. Cost displayed (Size × Duration × $0.03)
8. If balance sufficient: "Upload" button enabled
9. If balance insufficient: show error message with deposit link
10. On upload success: show hash + copy button + share options

---

### 3. Retrieve Page (`retrieve.html`)

**Purpose:** Allow anyone to download content by hash

**Requirements:**
- No authentication required
- Single input field for 256t hash
- Validate hash format client-side before request
- "Retrieve" button
- Display content metadata on successful lookup
- Display error message for invalid or non-existent hash
- Direct download link/button
- Display expiration date and contest status

**Metadata Display:**
- File size
- Upload date
- Expiration date
- Content status (active, contested, scheduled for deletion)

---

### 4. Dashboard Page (`dashboard.html`)

**Purpose:** Show authenticated user's account overview

**Requires:** Clerk authentication

**Sections:**

#### 4.1 Account Summary
- Current wallet balance
- Deposit button (links to Stripe checkout)
- Quick stats: total uploads, total storage used

#### 4.2 My Uploads
- Table/list of user's uploaded content
- Columns: Hash (truncated), Size, Uploaded, Expires, Status, Actions
- Actions: View details, Extend retention, Copy hash
- Pagination for many uploads
- Sort by date, size, expiration

#### 4.3 API Keys
- List of API keys with: name, created, expires, last used, status
- Create new key button (opens modal)
- Revoke key button (with confirmation)
- Show key once on creation (with copy button)

#### 4.4 Payment History
- List of deposits and charges
- Shows: date, type (deposit/upload/extension), amount, reference

#### 4.5 Account Settings
- Linked OAuth providers (view only - linking via Clerk SDK)
- Delete account button (with confirmation + 2FA)

---

### 5. Deposit Page (`deposit.html`)

**Purpose:** Add funds to user's wallet via Stripe

**Requirements:**
- Clerk authentication required
- Display current balance
- Amount input with $1.00 minimum
- Display Stripe fees (2.9% + $0.30)
- Display total charge amount
- Stripe payment form (embedded via Stripe.js)
- Success/failure handling with redirect back to dashboard

---

### 6. Public Records Page (`public-records.html`)

**Purpose:** Display transparent records of all content and contests

**Requirements:**
- No authentication required
- Searchable/filterable table of content records
- Columns: Hash, Size, Upload Date, Expiration, Status
- Contest records: Hash, Claim Type, Filed, Resolution
- Aggregate statistics display
- Export/download option (bulk JSON/CSV)

**Aggregate Stats:**
- Total content items
- Total storage used
- Total contests filed
- Average resolution time
- Content by status (active, expired, contested)

---

### 7. Documentation Pages (`docs/`)

#### 7.1 Documentation Home (`docs/index.html`)
- Getting started guide
- Links to all documentation sections

#### 7.2 API Reference (`docs/api.html`)
- Interactive API documentation
- Authentication guide
- Endpoint reference with examples
- Error codes reference

#### 7.3 FAQ (`docs/faq.html`)
- Common questions and answers
- Categories: General, Uploads, Payments, Contests, Technical

#### 7.4 Pricing Calculator (`docs/pricing.html`)
- Interactive calculator
- Input: file size, duration
- Output: storage cost, fees, total

---

## Component Library

### Shared Components

| Component | Description |
|-----------|-------------|
| `nav-header` | Top navigation with logo, links, auth state |
| `page-footer` | Bottom links, legal, copyright |
| `auth-gate` | Redirects to sign-in if not authenticated |
| `file-drop-zone` | Drag-and-drop area with file picker fallback |
| `hash-input` | 256t hash input with validation |
| `cost-calculator` | Real-time price calculation display |
| `balance-display` | Current wallet balance with refresh |
| `data-table` | Sortable, paginated table |
| `modal-dialog` | Accessible modal for confirmations |
| `toast-notification` | Temporary status messages |
| `loading-spinner` | Loading indicator |
| `progress-bar` | Upload/processing progress |

---

## Decisions Required

### UI/UX Decisions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Hash display format | Full hash, truncated with copy button, both | **TBD** |
| 2 | Error message display | Inline, toast, modal, combination | **TBD** |
| 3 | Dark mode support | Yes, no, system preference only | **TBD** |
| 4 | Mobile navigation | Hamburger menu, bottom nav, simplified | **TBD** |
| 5 | Upload progress granularity | File-level only, chunk-level, detailed | **TBD** |
| 6 | Session timeout behavior | Silent refresh, warning modal, redirect | **TBD** |
| 7 | Large file warning threshold | 1GB, 5GB, 10GB, no warning | **TBD** |
| 8 | Retention date input | Presets only, presets + calendar, presets + custom days | **TBD** |
| 9 | Cost display precision | Whole cents, 2 decimals, 4 decimals | **TBD** |
| 10 | Empty state illustrations | Yes (custom), yes (generic), text only | **TBD** |

### Technical Decisions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 11 | Hash computation library | js-256t (custom), existing library, Web Crypto API | **Web Crypto API** (native SHA-512 + custom Base64URL) |
| 12 | State management | Global object, URL params, sessionStorage | **TBD** |
| 13 | API error handling | Retry with backoff, immediate fail, user choice | **Immediate fail** (manual retry only) |
| 14 | Offline support | None, basic caching, full PWA | **TBD** |
| 15 | Browser support baseline | ES6+ only, with polyfills, IE11 support | **TBD** |
| 16 | Form validation timing | On blur, on submit, real-time | **TBD** |
| 17 | File chunking for large uploads | None, 5MB chunks, adaptive | **None** |
| 18 | Client-side hash verification | On upload only, on download too, optional | **TBD** |

### Content/Copy Decisions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 19 | Legal pages location | In-app, external link, modal | **TBD** |
| 20 | Help/support mechanism | FAQ only, email link, chat widget | **TBD** |
| 21 | Onboarding flow | None, first-use tooltips, guided tour | **TBD** |
| 22 | Language/i18n | English only, multi-language from start | **TBD** |

---

## Resolved Questions

### Critical Questions (Resolved)

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | **256t Hash Library** | Custom implementation required | No existing library. 256t spec uses SHA-512 + Base64URL. Must be created as part of Phase 2 or as frontend dependency. See `todo/256t_integration.md` (to be created). |
| 2 | **Clerk SDK Version** | `@clerk/clerk-js` v5.x (Core 2) | Latest major version with improved UX. ~6 month release cycle. LTS support for 1 year after new major. |
| 3 | **Stripe Integration Mode** | Stripe Checkout (redirect) | Easiest integration - hosted page, minimal code, handles compliance automatically. |
| 4 | **File Size Limits** | No maximum, no chunking | Frontend accepts any file size. R2 handles up to 5TB. No client-side chunking. |
| 5 | **Upload Interruption Handling** | Detailed error + manual retry | Display specific error message. User must manually click retry. No automatic retry. |
| 6 | **Content-Type Handling** | No preview | Always display as generic file. No image/text/PDF previews. |
| 7 | **Clerk Session Storage** | Cookies only (not configurable) | Clerk exclusively uses `__session` cookie with `SameSite=Lax`. 4KB limit. No CORS issues for same-domain. |

### Important Questions (Resolved)

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 8 | **Error Recovery** | Show error to user | Display error information directly. No queuing, no maintenance page. |
| 9 | **Balance Sync Frequency** | On-demand only | Balance refreshes when user explicitly requests or on page load. No polling/WebSocket. |
| 10 | **Public Records Pagination** | Single page (no pagination) | Load all records on one page for now. Can add pagination later if needed. |
| 11 | **API Key Display** | No hiding/timeout | Key remains visible until user navigates away. No automatic timeout. |
| 12 | **Upload Queue** | No queue (one at a time) | User must wait for current upload to complete before starting another. |
| 13 | **Browser Tab Behavior** | Tabs are independent | No cross-tab sync. Each tab manages its own auth state via Clerk cookies. |
| 14 | **Duplicate Content UX** | No prominent display | Simple message only. Don't prominently show existing file details. |

### 256t Hash Implementation Details

Per the project specification, 256t hashes are computed as:
- **Hash algorithm:** SHA-512
- **Encoding:** Base64URL (RFC 4648)
- **Content ≤ 64 bytes:** Direct Base64URL encoding (no hash)
- **Content > 64 bytes:** SHA-512 hash encoded in Base64URL
- **Format:** 8-char length prefix + 86-char hash/content
- **Max length:** 94 characters (URL-safe)

**Implementation approach:**
```javascript
// Using Web Crypto API (native, no library needed)
async function compute256t(content) {
  const bytes = new Uint8Array(content);
  if (bytes.length <= 64) {
    // Direct encoding for small content
    return lengthPrefix(bytes.length) + base64url(bytes);
  }
  // SHA-512 hash for larger content
  const hash = await crypto.subtle.digest('SHA-512', bytes);
  return lengthPrefix(bytes.length) + base64url(new Uint8Array(hash));
}
```

---

## Open Questions

### Deferred Questions (Nice-to-Have)

| # | Question | Status |
|---|----------|--------|
| 15 | Keyboard Shortcuts | Deferred |
| 16 | Accessibility Preferences Persistence | Deferred |
| 17 | Web Share API Integration | Deferred |
| 18 | Browser Notification Permissions | Deferred |

**All critical and important questions have been resolved.** The deferred items can be addressed post-launch based on user feedback.

---

## Test Plan

### Functional Tests - Landing Page

| ID | Test | Expected Result |
|----|------|-----------------|
| LP-01 | Load landing page | Page loads within 2 seconds, all sections visible |
| LP-02 | Click "Upload" CTA when not authenticated | Redirect to Clerk sign-in |
| LP-03 | Click "Upload" CTA when authenticated | Navigate to upload page |
| LP-04 | Click "Retrieve" CTA | Navigate to retrieve page |
| LP-05 | Navigation links work | Each nav link loads correct page |
| LP-06 | Pricing preview displays | Shows example calculation |
| LP-07 | Footer links work | All footer links navigate correctly |
| LP-08 | Responsive layout at 320px width | Content readable, no horizontal scroll |
| LP-09 | Responsive layout at 1920px width | Content properly spaced, not stretched |

### Functional Tests - Authentication

| ID | Test | Expected Result |
|----|------|-----------------|
| AU-01 | Sign in with Google | Successfully authenticated, redirect to intended page |
| AU-02 | Sign in with Apple | Successfully authenticated, redirect to intended page |
| AU-03 | Sign in with Microsoft | Successfully authenticated, redirect to intended page |
| AU-04 | Sign in with GitHub | Successfully authenticated, redirect to intended page |
| AU-05 | Sign out | Session cleared, redirect to landing page |
| AU-06 | Access protected page when not authenticated | Redirect to sign-in with return URL |
| AU-07 | Session expires during use | Show re-authentication prompt |
| AU-08 | Authentication error from Clerk | Display user-friendly error message |
| AU-09 | Cancel OAuth flow | Return to previous page without error |
| AU-10 | Auth state persists on page refresh | User remains authenticated |

### Functional Tests - Upload Page

| ID | Test | Expected Result |
|----|------|-----------------|
| UP-01 | Access upload page when not authenticated | Redirect to sign-in |
| UP-02 | Drag file onto drop zone | File info displayed, hash computation starts |
| UP-03 | Click to select file | File picker opens |
| UP-04 | Select file via picker | File info displayed, hash computation starts |
| UP-05 | Drop multiple files | Error: only single file supported (no queue) |
| UP-05a | Attempt upload while another in progress | Blocked until current upload completes |
| UP-06 | Hash computation completes | Hash displayed, existence check initiated |
| UP-07 | Upload new content (not duplicate) | Retention selector shown |
| UP-08 | Upload duplicate content | "Already exists" message, extend option shown |
| UP-09 | Select 1 month retention | Cost calculated correctly |
| UP-10 | Select 1 year retention | Cost calculated correctly |
| UP-11 | Select 1 decade retention | Cost calculated correctly |
| UP-12 | Select 1 century retention | Cost calculated correctly |
| UP-13 | Enter custom retention (90 days) | Cost calculated correctly |
| UP-14 | Enter invalid custom retention (45 days) | Error: must be multiple of 30 |
| UP-15 | Balance sufficient for selection | Upload button enabled |
| UP-16 | Balance insufficient for selection | Error message with deposit link |
| UP-17 | Balance insufficient for 30-day minimum | Show specific rejection message (Decision #26) |
| UP-18 | Click Upload with sufficient balance | Upload starts, progress shown |
| UP-19 | Upload completes successfully | Success message, hash displayed with copy |
| UP-20 | Upload fails (network error) | Error message, retry option |
| UP-21 | Upload fails (server error) | Error message with details |
| UP-22 | Cancel upload in progress | Upload cancelled, no charge |
| UP-23 | Close browser during upload | No charge (failed upload not billed) |
| UP-24 | Upload 0-byte file | Error: empty files not allowed |
| UP-25 | Upload file > 5TB (R2 limit) | Error: file exceeds storage limit |
| UP-26 | Copy hash after successful upload | Hash copied to clipboard |
| UP-27 | Drag file outside drop zone | No action taken |
| UP-28 | Hash computation for large file | Progress indicator shown |

### Functional Tests - 256t Hash Computation

| ID | Test | Expected Result |
|----|------|-----------------|
| HC-01 | Hash file < 64 bytes | Direct Base64URL encoding (no SHA-512) |
| HC-02 | Hash file = 64 bytes | Direct Base64URL encoding |
| HC-03 | Hash file = 65 bytes | SHA-512 hash computed |
| HC-04 | Hash file > 64 bytes | SHA-512 hash in Base64URL format |
| HC-05 | Hash output length ≤ 94 chars | All hashes within spec limit |
| HC-06 | Hash is URL-safe | No special characters requiring encoding |
| HC-07 | Hash 1MB file | Completes in < 100ms |
| HC-08 | Hash 100MB file | Completes in < 1 second |
| HC-09 | Hash 1GB file | Completes in < 10 seconds with progress |
| HC-10 | Hash 5GB file | Completes successfully (no memory issues) |
| HC-11 | Same content produces same hash | Deterministic output |
| HC-12 | Different content produces different hash | No collisions in test set |
| HC-13 | Empty file (0 bytes) | Rejected before hashing |
| HC-14 | Binary file hashing | Works correctly |
| HC-15 | Text file hashing | Works correctly |
| HC-16 | Unicode filename with binary content | Hash computed on content only |
| HC-17 | Length prefix format correct | 8-char prefix as per spec |
| HC-18 | Web Crypto API availability check | Graceful error if unsupported |

### Functional Tests - Large File Upload (No Chunking)

| ID | Test | Expected Result |
|----|------|-----------------|
| LF-01 | Upload 100MB file | Single request, progress shown |
| LF-02 | Upload 1GB file | Single request, progress shown |
| LF-03 | Upload 5GB file | Single request succeeds (R2 limit) |
| LF-04 | Upload progress accuracy | Percentage reflects actual upload |
| LF-05 | Network interruption mid-upload | Detailed error message displayed |
| LF-06 | Network timeout on large upload | Error with timeout details |
| LF-07 | Manual retry after failure | New upload starts from beginning |
| LF-08 | Browser memory during large upload | No excessive memory usage |
| LF-09 | Cancel large upload in progress | Upload cancelled, connection closed |
| LF-10 | Upload while on slow connection | Eventually completes or times out with clear error |

### Functional Tests - Retrieve Page

| ID | Test | Expected Result |
|----|------|-----------------|
| RT-01 | Load retrieve page | Hash input field displayed |
| RT-02 | Enter valid hash format | Input accepted, no error |
| RT-03 | Enter invalid hash format | Error: invalid hash format |
| RT-04 | Submit existing hash | Metadata displayed, download available |
| RT-05 | Submit non-existent hash | Error: content not found |
| RT-06 | Submit expired content hash | Error: content expired and deleted |
| RT-07 | Click download button | File downloads correctly |
| RT-08 | Download contested content (active) | Download available with warning |
| RT-09 | Download content pending deletion | Download available with warning |
| RT-10 | Paste hash from clipboard | Hash input populated correctly |
| RT-11 | Hash with spaces/formatting | Spaces trimmed, hash processed |
| RT-12 | Empty hash submission | Error: hash required |
| RT-13 | Very long invalid input | Input rejected or truncated |

### Functional Tests - Dashboard

| ID | Test | Expected Result |
|----|------|-----------------|
| DB-01 | Load dashboard when authenticated | All sections load correctly |
| DB-02 | Wallet balance displayed | Current balance shown on page load |
| DB-03 | Click deposit button | Navigate to deposit page |
| DB-03a | Click refresh balance button | Balance fetched from server on demand |
| DB-03b | Balance not auto-updating | No polling or WebSocket updates |
| DB-04 | Upload list shows user's content | Correct items displayed |
| DB-05 | Sort uploads by date | Sorted correctly |
| DB-06 | Sort uploads by size | Sorted correctly |
| DB-07 | Sort uploads by expiration | Sorted correctly |
| DB-08 | Paginate through uploads | Pagination works correctly |
| DB-09 | Click upload hash | Hash copied or details shown |
| DB-10 | Click extend retention | Retention extension flow starts |
| DB-11 | API keys list displayed | All user's keys shown |
| DB-12 | Create new API key | Key created and displayed |
| DB-13 | Copy newly created API key | Key copied to clipboard |
| DB-14 | API key visible until navigation | Key remains visible; hidden after leaving page |
| DB-15 | Revoke API key | Confirmation shown, key revoked |
| DB-16 | Cancel revoke API key | Key not revoked |
| DB-17 | Create key at limit (25) | Error: maximum keys reached |
| DB-18 | Payment history displayed | All transactions shown |
| DB-19 | Payment history pagination | Pagination works |
| DB-20 | Linked providers displayed | OAuth providers shown |
| DB-21 | Click delete account | Confirmation dialog shown |
| DB-22 | Confirm delete without 2FA | Error: 2FA required |
| DB-23 | Confirm delete with valid 2FA | Account deleted, logged out |
| DB-24 | Cancel delete account | Account not deleted |
| DB-25 | Empty upload list | Appropriate empty state shown |
| DB-26 | Empty API keys list | Appropriate empty state shown |

### Functional Tests - Deposit Page (Stripe Checkout Redirect)

| ID | Test | Expected Result |
|----|------|-----------------|
| DP-01 | Load deposit page | Current balance and amount input displayed |
| DP-02 | Enter $1.00 amount | Accepted, fees calculated |
| DP-03 | Enter $0.50 amount | Error: minimum is $1.00 |
| DP-04 | Enter $100.00 amount | Accepted, fees calculated |
| DP-05 | Stripe fees displayed | 2.9% + $0.30 shown correctly |
| DP-06 | Total charge calculated | Sum of amount + fees correct |
| DP-07 | Click "Pay" button | Redirect to Stripe Checkout hosted page |
| DP-08 | Complete payment on Stripe | Redirect back to dashboard with success |
| DP-09 | Cancel on Stripe Checkout page | Redirect back to deposit page, no charge |
| DP-10 | Card declined on Stripe | Stripe shows error, user can retry on Stripe |
| DP-11 | Payment succeeds | Balance updated on dashboard |
| DP-12 | Stripe session expires (24hr) | User must start new checkout session |
| DP-13 | Network error before redirect | Error message shown on deposit page |
| DP-14 | Return URL tampering | Server validates payment via webhook |
| DP-15 | Stripe 3D Secure challenge | Handled by Stripe Checkout automatically |
| DP-16 | Browser back button from Stripe | Return to deposit page, session may still be valid |
| DP-17 | Multiple tabs with same session | Only one payment processed |

### Functional Tests - Public Records (Single Page)

| ID | Test | Expected Result |
|----|------|-----------------|
| PR-01 | Load public records page | All records loaded on single page |
| PR-02 | Aggregate statistics shown | All stats displayed correctly |
| PR-03 | Filter by status | Filtered results shown (client-side) |
| PR-04 | Sort by upload date | Sorted correctly (client-side) |
| PR-05 | Sort by size | Sorted correctly (client-side) |
| PR-06 | All records visible | No pagination, all records in single scrollable list |
| PR-07 | Search by hash | Matching record highlighted/filtered |
| PR-08 | Search non-existent hash | No results message |
| PR-09 | View contest records | Contests displayed correctly |
| PR-10 | Export as JSON | Valid JSON file downloaded |
| PR-11 | Export as CSV | Valid CSV file downloaded |
| PR-12 | Large dataset performance | Page loads all records without crashing |
| PR-13 | Browser scroll performance | Smooth scrolling with many records |

### Functional Tests - Documentation

| ID | Test | Expected Result |
|----|------|-----------------|
| DC-01 | Load documentation home | All sections linked |
| DC-02 | Navigate to API reference | API docs displayed |
| DC-03 | API examples display correctly | Code formatted, copyable |
| DC-04 | Navigate to FAQ | FAQ displayed |
| DC-05 | FAQ search/filter works | Matching questions shown |
| DC-06 | Pricing calculator works | Correct calculations |
| DC-07 | All internal doc links work | Navigate correctly |

### Edge Case Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| EC-01 | Upload exactly 30 days of retention with exact balance | Succeeds with $0.00 remaining |
| EC-02 | Extend content that expires in < 30 days | Extension applied correctly |
| EC-03 | Upload during Clerk service outage | Graceful error message |
| EC-04 | Payment during Stripe service outage | Graceful error message |
| EC-05 | Rapid repeated upload clicks | Single upload processed |
| EC-06 | Very long file name | Name truncated appropriately |
| EC-07 | File with special characters in name | Handled correctly |
| EC-08 | Unicode in file name | Displayed correctly |
| EC-09 | Session expires mid-upload | Re-auth prompt, resume if possible |
| EC-10 | Browser crashes during upload | No charge, can retry |
| EC-11 | Duplicate API key names | Both keys created successfully |
| EC-12 | Create API key with 5+ year expiry | Rejected, max 5 years enforced |
| EC-13 | Concurrent uploads in multiple tabs | Each handled independently |
| EC-14 | Balance changes during upload | Use balance at submission time |
| EC-15 | Content deleted during download | Error or partial content handling |
| EC-16 | Hash input with invisible characters | Characters stripped, processed |
| EC-17 | Retrieve page with hash in URL param | Hash pre-populated |
| EC-18 | Deep link to dashboard section | Correct section displayed |
| EC-19 | Negative amount input attempt | Rejected |
| EC-20 | Scientific notation in amount | Handled or rejected appropriately |

### Security Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| SC-01 | XSS in hash input | Input sanitized, no execution |
| SC-02 | XSS in file name display | Name escaped, no execution |
| SC-03 | CSRF on form submissions | Protected via Clerk/Stripe tokens |
| SC-04 | API key not logged to console | No sensitive data in dev tools |
| SC-05 | API key not in URL params | Keys passed via headers only |
| SC-06 | Expired session token use | Rejected, re-auth required |
| SC-07 | Manipulated cost calculation | Server validates cost |
| SC-08 | Fake balance displayed | Server validates balance |
| SC-09 | Direct API access without auth | Rejected appropriately |
| SC-10 | Brute force hash guessing | Rate limited (backend) |
| SC-11 | Clickjacking protection | X-Frame-Options or CSP set |
| SC-12 | HTTPS enforced | HTTP redirects to HTTPS |
| SC-13 | Secure cookie flags | HttpOnly, Secure, SameSite |
| SC-14 | Content Security Policy | Appropriate CSP headers |
| SC-15 | Subresource Integrity | External scripts have SRI |

### Accessibility Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| AC-01 | Keyboard navigation through all pages | All elements reachable |
| AC-02 | Tab order is logical | Focus moves logically |
| AC-03 | Focus indicators visible | Clear focus states |
| AC-04 | Screen reader announces page title | Correct title announced |
| AC-05 | Form labels associated | Labels linked to inputs |
| AC-06 | Error messages announced | Errors read by screen reader |
| AC-07 | Images have alt text | All images described |
| AC-08 | Color contrast meets AA | 4.5:1 minimum ratio |
| AC-09 | Text resizable to 200% | Layout remains usable |
| AC-10 | No content relies on color alone | Patterns/icons supplement |
| AC-11 | Skip to main content link | Works correctly |
| AC-12 | Modal dialogs trap focus | Focus contained in modal |
| AC-13 | Modal can be dismissed with Escape | Keyboard accessible |
| AC-14 | Loading states announced | Screen reader notified |
| AC-15 | File drop zone keyboard accessible | Can activate with Enter/Space |
| AC-16 | Progress bars have aria attributes | Progress announced |
| AC-17 | Data tables have proper markup | Headers associated with cells |
| AC-18 | Reduced motion respected | Animations disabled per preference |

### Performance Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| PF-01 | Initial page load time | < 2 seconds on 3G |
| PF-02 | Time to Interactive | < 3 seconds |
| PF-03 | First Contentful Paint | < 1.5 seconds |
| PF-04 | Largest Contentful Paint | < 2.5 seconds |
| PF-05 | Total page weight | < 500KB uncompressed |
| PF-06 | JavaScript bundle size | < 100KB uncompressed |
| PF-07 | CSS file size | < 50KB uncompressed |
| PF-08 | No render-blocking resources | Defer/async used appropriately |
| PF-09 | Gzip/Brotli compression | Assets compressed |
| PF-10 | Cache headers set | Static assets cached |
| PF-11 | 100 concurrent users | Site remains responsive |
| PF-12 | Large file hash computation | < 1 second per 100MB |

### Browser Compatibility Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| BR-01 | Chrome (latest) | Full functionality |
| BR-02 | Firefox (latest) | Full functionality |
| BR-03 | Safari (latest) | Full functionality |
| BR-04 | Edge (latest) | Full functionality |
| BR-05 | Chrome mobile (Android) | Full functionality |
| BR-06 | Safari mobile (iOS) | Full functionality |
| BR-07 | Chrome (2 versions back) | Core functionality |
| BR-08 | Firefox (2 versions back) | Core functionality |
| BR-09 | Safari (2 versions back) | Core functionality |

### Integration Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| IT-01 | End-to-end: Sign up → Deposit → Upload → Retrieve | Complete flow works |
| IT-02 | End-to-end: Sign in → Create API key → Use key | Complete flow works |
| IT-03 | End-to-end: Upload duplicate → Extend retention | Complete flow works |
| IT-04 | End-to-end: Upload → Contest filed → Status update | Status reflected in dashboard |
| IT-05 | Clerk webhook → Frontend state update | User state synchronized |
| IT-06 | Stripe webhook → Balance update | Balance reflects payment |
| IT-07 | Backend rate limit → Frontend handling | Appropriate error shown |
| IT-08 | Backend maintenance → Frontend handling | Maintenance page or message |

---

## Implementation Phases

### Phase 8.1: Core Infrastructure
- Project setup and folder structure
- Base CSS (reset, variables, typography)
- Layout components (header, footer, responsive grid)
- Clerk SDK integration and auth flow
- Basic routing/navigation

### Phase 8.2: Content Operations
- Retrieve page (hash input → download)
- Upload page (file selection, hash computation)
- Cost calculator component
- Balance display component
- Integration with content APIs

### Phase 8.3: Dashboard & Payments
- Dashboard layout and sections
- Upload history display
- API key management UI
- Stripe integration for deposits
- Payment history display

### Phase 8.4: Public Records & Docs
- Public records page with filtering
- Documentation pages
- API reference
- FAQ
- Pricing calculator

### Phase 8.5: Polish & Testing
- Accessibility audit and fixes
- Performance optimization
- Cross-browser testing
- Security review
- Final UI polish

---

## Dependencies

### External Services
- **Clerk** - OAuth authentication (already integrated in backend)
- **Stripe** - Payment processing (planned Phase 4)
- **Cloudflare Pages** - Static site hosting

### Backend APIs Required
- `GET /api/auth/session` - Current user info ✅
- `POST /api/auth/logout` - End session ✅
- `GET /api/auth/apikeys` - List API keys ✅
- `POST /api/auth/apikeys` - Create API key ✅
- `DELETE /api/auth/apikeys/{id}` - Revoke key ✅
- `DELETE /api/auth/account` - Delete account ✅
- `GET /api/content/{hash}` - Download content (Phase 2)
- `GET /api/content/{hash}/metadata` - Content info (Phase 2)
- `GET /api/content/{hash}/exists` - Check duplicate (Phase 2)
- `POST /api/content` - Upload content (Phase 2)
- `POST /api/payments/deposit` - Create checkout (Phase 4)
- `GET /api/balance` - Get wallet balance (Phase 4)
- `GET /api/records` - Public records (Phase 7)

---

## Success Criteria

1. All functional tests pass
2. All accessibility tests pass (WCAG 2.1 AA)
3. Performance metrics meet targets
4. No critical or high security vulnerabilities
5. Works in all target browsers
6. User can complete all core flows without assistance:
   - Sign up/sign in
   - Deposit funds
   - Upload content
   - Retrieve content
   - Manage API keys
   - View public records

---

## Changelog

### Version 1.0.0 (2026-01-24) - ✅ COMPLETED
- **Implementation complete** - All planned features implemented
- Added documentation pages (index, API reference, FAQ, pricing calculator)
- Added public records page with filtering and export
- Created E2E test suite with Playwright
- Tests cover: page loading, responsive design, accessibility
- Test configuration added to package.json
- Frontend fully functional with all core pages and features

### Version 0.3.0 (2026-01-14)
- **All questions resolved** - Ready for implementation
- Resolved 7 additional important questions (#8-14)
- Decided: Show error info directly (no queuing/maintenance page)
- Decided: On-demand balance refresh only
- Decided: Single page for public records (no pagination initially)
- Decided: API key visible until navigation (no timeout)
- Decided: No upload queue (one file at a time)
- Decided: Browser tabs are independent
- Decided: Simple duplicate message (no prominent existing file display)
- Deferred 4 nice-to-have questions (#15-18)

### Version 0.2.0 (2026-01-14)
- Resolved 7 critical questions
- Decided: Web Crypto API for 256t hash computation (SHA-512 + Base64URL)
- Decided: @clerk/clerk-js v5.x (Core 2)
- Decided: Stripe Checkout (redirect) for payments
- Decided: No file size limits, no chunking
- Decided: Manual retry only on upload failure
- Decided: No content previews (generic file display)
- Confirmed: Clerk uses cookies only (`__session` with SameSite=Lax)
- Added 256t implementation details with code example

### Version 0.1.0 (2026-01-14)
- Initial plan created
- Defined pages and components
- Listed open questions
- Created comprehensive test suite

