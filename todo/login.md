# Login and Balance Check Implementation Plan

## Implementation Status

**Status:** 📋 PLANNED

---

## Overview

This document outlines the implementation plan for user login functionality and balance checking. The backend APIs are already implemented (Clerk OAuth, session management, balance endpoints). This plan focuses on the frontend integration.

**Scope:**
- User login via Clerk OAuth (Google, Apple, Microsoft, GitHub)
- Session management on the frontend
- Balance display after authentication
- Logout functionality

**Out of Scope (see `todo/add_to_balance.md`):**
- Depositing funds via Stripe
- Payment processing
- Transaction history display

---

## Prerequisites

### Backend APIs (Already Implemented)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/auth/session` | GET | Get current session info | ✅ Complete |
| `/api/auth/logout` | POST | Invalidate Clerk session | ✅ Complete |
| `/api/balance` | GET | Get current account balance | ✅ Complete |
| `/api/webhooks/clerk` | POST | Handle Clerk user lifecycle events | ✅ Complete |

### External Dependencies

| Service | Purpose | Status |
|---------|---------|--------|
| Clerk | OAuth authentication | ✅ Backend integrated |
| Clerk JavaScript SDK | Frontend auth UI | 🚧 To be integrated |

---

## Architecture

### Technology Stack

Per Architectural Decision #11 from `frontend_ui.md`:
- **Markup:** HTML5
- **Styling:** CSS3
- **Scripting:** Vanilla ES6+ JavaScript
- **Auth:** Clerk JavaScript SDK (`@clerk/clerk-js` v5.x)
- **Hosting:** Cloudflare Pages

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Landing   │     │    Clerk    │     │   HashBin   │
│    Page     │     │   (OAuth)   │     │   Backend   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. Click Login   │                   │
       │──────────────────▶│                   │
       │                   │                   │
       │  2. OAuth Flow    │                   │
       │◀─────────────────▶│                   │
       │                   │                   │
       │  3. JWT Token     │                   │
       │◀──────────────────│                   │
       │                   │                   │
       │  4. Verify Token + Get Session        │
       │──────────────────────────────────────▶│
       │                   │                   │
       │  5. Session Info + Create Profile     │
       │◀──────────────────────────────────────│
       │                   │                   │
       │  6. Get Balance                       │
       │──────────────────────────────────────▶│
       │                   │                   │
       │  7. Balance Response                  │
       │◀──────────────────────────────────────│
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐
│  Dashboard  │
│  (Balance)  │
└─────────────┘
```

### Session Storage

Per resolved question from `frontend_ui.md`:
- Clerk exclusively uses `__session` cookie with `SameSite=Lax`
- Cookie has 4KB limit
- No CORS issues for same-domain API calls
- Session stored server-side by Clerk, token passed to backend

---

## Implementation Components

### 1. Clerk SDK Integration (`js/auth.js`)

**Purpose:** Initialize Clerk SDK and manage authentication state

**Functions:**
- `initializeClerk()` - Load and configure Clerk SDK
- `getAuthState()` - Check if user is authenticated
- `signIn()` - Trigger OAuth sign-in flow
- `signOut()` - Log out user and clear session
- `onAuthStateChange(callback)` - Subscribe to auth state changes
- `getSessionToken()` - Get JWT token for API calls

**Configuration Required:**
- `CLERK_PUBLISHABLE_KEY` - Clerk frontend key (different from secret key)

### 2. Navigation Header Component

**Purpose:** Display auth state and login/logout buttons

**States:**
- **Unauthenticated:** Show "Sign In" button
- **Loading:** Show loading indicator
- **Authenticated:** Show user info + "Sign Out" button + balance

**Markup:**
```html
<header class="nav-header">
  <a href="/" class="logo">HashBin</a>
  <nav>
    <a href="/upload.html">Upload</a>
    <a href="/retrieve.html">Retrieve</a>
    <a href="/docs/">Docs</a>
  </nav>
  <div id="auth-section">
    <!-- Dynamically populated based on auth state -->
  </div>
</header>
```

### 3. Balance Display Component

**Purpose:** Show current account balance

**Location:** Navigation header (when authenticated) and Dashboard

**Format:** Display in dollars with 2 decimal places (e.g., "$12.50")

**Behavior:**
- Fetch balance on page load when authenticated
- On-demand refresh (no polling per resolved question #9)
- Show loading state while fetching
- Handle error state gracefully

### 4. Auth Gate Component

**Purpose:** Protect pages that require authentication

**Behavior:**
- Check auth state on page load
- If not authenticated, redirect to landing page with return URL
- Show loading state while checking auth

**Protected Pages:**
- `/upload.html`
- `/dashboard.html`
- `/deposit.html`

---

## Open Questions

### Critical Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | **Where should the Clerk Publishable Key be stored?** | A) Hardcoded in JS, B) Environment variable injected at build, C) Fetched from backend endpoint | Security and deployment complexity |
| 2 | **Should we show the balance in the navigation header on every page?** | A) Yes (always visible when logged in), B) Only on dashboard, C) Optional via user preference | UX and API call frequency |
| 3 | **What OAuth providers should be enabled initially?** | A) All 4 (Google, Apple, Microsoft, GitHub), B) Start with Google only, C) Google + GitHub | Clerk configuration and testing scope |
| 4 | **What happens when a user has $0.00 balance?** | A) Show $0.00 normally, B) Show "$0.00" with a prompt to deposit, C) Show "No funds" message | UX for new users |
| 5 | **How should we handle Clerk service unavailability?** | A) Show error page, B) Allow limited functionality, C) Retry with backoff | Reliability |
| 6 | **Should login persist across browser sessions?** | A) Yes (remember me by default), B) No (session only), C) User choice | Security vs convenience |

### Important Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 7 | **What should the login button text say?** | A) "Sign In", B) "Log In", C) "Get Started", D) Provider-specific buttons | UX consistency |
| 8 | **Should we show which OAuth provider a user logged in with?** | A) Yes (show provider icon), B) No (just show user info), C) Only in settings | User awareness |
| 9 | **What user info should we display when logged in?** | A) Email only, B) Name + avatar, C) Just a generic "Account" icon, D) Provider avatar | Privacy and UX |
| 10 | **How should we handle users who clear cookies mid-session?** | A) Silent re-auth if possible, B) Redirect to login immediately, C) Show "session expired" message | UX when session lost |
| 11 | **Should balance be displayed in cents for small amounts?** | A) Always dollars ($0.03), B) Switch to cents below $1 (3¢), C) Always dollars with more precision ($0.0300) | Readability |

### Deferred Questions (for add_to_balance.md)

| # | Question | Status |
|---|----------|--------|
| D1 | How to display insufficient balance warnings | Deferred |
| D2 | Deposit amount presets | Deferred |
| D3 | Auto-deposit triggers | Deferred |

---

## Test Plan

### Unit Tests - Clerk Integration

| ID | Test | Expected Result |
|----|------|-----------------|
| CL-01 | Initialize Clerk SDK with valid key | SDK loads successfully |
| CL-02 | Initialize Clerk SDK with invalid key | Graceful error handling |
| CL-03 | Initialize Clerk SDK when service unavailable | Timeout with error message |
| CL-04 | Check auth state when not logged in | Returns `{ authenticated: false }` |
| CL-05 | Check auth state when logged in | Returns `{ authenticated: true, user: {...} }` |
| CL-06 | Get session token when authenticated | Returns valid JWT string |
| CL-07 | Get session token when not authenticated | Returns null or throws appropriate error |

### Unit Tests - Balance Fetching

| ID | Test | Expected Result |
|----|------|-----------------|
| BL-01 | Fetch balance with valid auth | Returns `{ balance_cents: <number> }` |
| BL-02 | Fetch balance without auth | Returns 401 error |
| BL-03 | Fetch balance with expired token | Returns 401, triggers re-auth |
| BL-04 | Fetch balance when backend unavailable | Graceful error with retry option |
| BL-05 | Format balance of 0 cents | Displays "$0.00" |
| BL-06 | Format balance of 1 cent | Displays "$0.01" |
| BL-07 | Format balance of 100 cents | Displays "$1.00" |
| BL-08 | Format balance of 12345 cents | Displays "$123.45" |
| BL-09 | Format balance of 1 cent (if cents display chosen) | Displays "1¢" or "$0.01" based on decision |
| BL-10 | Refresh balance on demand | Fetches fresh balance from server |

### Integration Tests - Login Flow

| ID | Test | Expected Result |
|----|------|-----------------|
| LG-01 | Click "Sign In" button | Clerk OAuth modal/redirect opens |
| LG-02 | Complete Google OAuth flow | User authenticated, redirected to intended page |
| LG-03 | Complete Apple OAuth flow | User authenticated, redirected to intended page |
| LG-04 | Complete Microsoft OAuth flow | User authenticated, redirected to intended page |
| LG-05 | Complete GitHub OAuth flow | User authenticated, redirected to intended page |
| LG-06 | Cancel OAuth flow | Return to previous page, no error shown |
| LG-07 | OAuth provider returns error | User-friendly error message displayed |
| LG-08 | First-time user login | Profile created via webhook, balance starts at $0.00 |
| LG-09 | Returning user login | Profile retrieved, balance displayed correctly |
| LG-10 | Login from landing page | Redirect to dashboard after login |
| LG-11 | Login from protected page | Return to original page after login |
| LG-12 | Login attempt with Clerk down | Error message, suggestion to try later |

### Integration Tests - Logout Flow

| ID | Test | Expected Result |
|----|------|-----------------|
| LO-01 | Click "Sign Out" button | Confirmation shown or immediate logout |
| LO-02 | Confirm logout | Session cleared, redirect to landing page |
| LO-03 | Cancel logout (if confirmation shown) | Remain logged in |
| LO-04 | Logout with failed backend call | Local session cleared anyway |
| LO-05 | Access protected page after logout | Redirect to login |
| LO-06 | Logout in one tab, navigate in another tab | Session expired detected, redirect to login |

### Integration Tests - Session Management

| ID | Test | Expected Result |
|----|------|-----------------|
| SM-01 | Page refresh while authenticated | Session persists, user still logged in |
| SM-02 | Close browser and reopen | Session persists (if "remember me") or expires |
| SM-03 | Session expires naturally | Re-authentication prompt shown |
| SM-04 | Session revoked by backend | User logged out, redirect to login |
| SM-05 | Multiple tabs open | All tabs share auth state via cookies |
| SM-06 | Navigate between pages | Auth state consistent across navigation |
| SM-07 | Clerk JWT token refresh | Happens automatically, transparent to user |
| SM-08 | Backend rejects stale token | Frontend refreshes token and retries |

### Integration Tests - Balance Display

| ID | Test | Expected Result |
|----|------|-----------------|
| BD-01 | Load page while authenticated | Balance fetched and displayed |
| BD-02 | Load page while not authenticated | No balance shown, login prompt visible |
| BD-03 | Click refresh balance button | Balance updates from server |
| BD-04 | Balance display during loading | Loading indicator shown |
| BD-05 | Balance display on error | Error message with retry option |
| BD-06 | Balance updates after deposit (external) | Manual refresh shows new balance |
| BD-07 | Balance in header and dashboard match | Same value displayed in both locations |
| BD-08 | Very large balance display | Formatted correctly (e.g., "$10,000.00") |

### Edge Case Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| EC-01 | Login with same email from different OAuth providers | Clerk handles account linking or creates separate accounts (per Clerk config) |
| EC-02 | User deletes account, then tries to log in again | New account created, balance is $0.00 |
| EC-03 | Clerk webhook delayed - user logs in before profile created | Profile created via GET /api/auth/session call |
| EC-04 | Rapid login/logout cycles | No race conditions, consistent state |
| EC-05 | Login while already logged in | No duplicate sessions created |
| EC-06 | Network disconnects during OAuth flow | Appropriate error, can retry |
| EC-07 | OAuth popup blocked by browser | Fallback to redirect flow or user instruction |
| EC-08 | User has multiple browser profiles | Each profile has independent session |
| EC-09 | JavaScript disabled | Graceful degradation message shown |
| EC-10 | Very slow network connection | Loading states shown, no timeouts under 30s |
| EC-11 | User ID contains special characters | Handled correctly in all displays and API calls |
| EC-12 | Balance response malformed from backend | Error handling, show "Unable to load balance" |

### Security Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| SC-01 | JWT token not exposed in URL | Token only in Authorization header |
| SC-02 | JWT token not logged to console | No sensitive data in browser dev tools |
| SC-03 | XSS in user display name | Name properly escaped |
| SC-04 | CSRF protection on logout | Clerk handles CSRF automatically |
| SC-05 | Session cookie has Secure flag | Cookie only sent over HTTPS |
| SC-06 | Session cookie has HttpOnly flag | Cookie not accessible via JavaScript |
| SC-07 | Session cookie has SameSite=Lax | CSRF protection |
| SC-08 | Clerk Publishable Key is not secret | Verify this is safe to expose in frontend |
| SC-09 | Backend validates all Clerk tokens | Token verification on every protected request |
| SC-10 | Token expiration enforced | Expired tokens rejected by backend |

### Accessibility Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| AC-01 | Sign In button keyboard accessible | Can activate with Enter/Space |
| AC-02 | Sign Out button keyboard accessible | Can activate with Enter/Space |
| AC-03 | OAuth modal keyboard navigable | All options reachable via Tab |
| AC-04 | Auth state announced to screen readers | "Signed in as [name]" or "Not signed in" |
| AC-05 | Balance announced correctly | Screen reader reads "$12.50" as "twelve dollars and fifty cents" |
| AC-06 | Loading states announced | "Loading..." announced |
| AC-07 | Error messages announced | Errors read automatically by screen reader |
| AC-08 | Focus management after login | Focus moves to appropriate element |
| AC-09 | Focus management after logout | Focus moves to login button |
| AC-10 | Color contrast of auth UI | Meets WCAG AA (4.5:1) |

### Browser Compatibility Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| BR-01 | Chrome (latest) - Login flow | Full functionality |
| BR-02 | Firefox (latest) - Login flow | Full functionality |
| BR-03 | Safari (latest) - Login flow | Full functionality |
| BR-04 | Edge (latest) - Login flow | Full functionality |
| BR-05 | Chrome mobile (Android) - Login flow | Full functionality |
| BR-06 | Safari mobile (iOS) - Login flow | Full functionality |
| BR-07 | Private/Incognito mode - Login | Works correctly |
| BR-08 | Browser with strict cookie settings | Clerk cookie works correctly |
| BR-09 | Browser with ad blocker | Clerk not blocked (verify) |

### Performance Tests

| ID | Test | Expected Result |
|----|------|-----------------|
| PF-01 | Clerk SDK load time | < 500ms |
| PF-02 | Auth state check time | < 100ms (after SDK loaded) |
| PF-03 | Balance fetch time | < 500ms |
| PF-04 | OAuth flow total time | < 10s (user interaction dependent) |
| PF-05 | Clerk SDK bundle size | Document size (currently ~50KB gzipped) |

---

## Implementation Phases

### Phase L.1: Clerk SDK Integration
1. Add Clerk JavaScript SDK to project
2. Configure Clerk Publishable Key
3. Implement `initializeClerk()` function
4. Implement `getAuthState()` function
5. Test SDK initialization

### Phase L.2: Login UI
1. Create navigation header component
2. Add Sign In button (unauthenticated state)
3. Integrate Clerk sign-in modal/flow
4. Handle OAuth callbacks
5. Update header to show authenticated state

### Phase L.3: Logout & Session Management
1. Implement `signOut()` function
2. Add Sign Out button to header
3. Implement auth state change listener
4. Handle session expiration
5. Test multi-tab behavior

### Phase L.4: Balance Display
1. Implement balance fetch function
2. Add balance display to header
3. Implement balance formatting
4. Add loading and error states
5. Test balance display scenarios

### Phase L.5: Auth Gate
1. Implement auth gate component
2. Apply to protected pages
3. Implement return URL handling
4. Test redirect flows

### Phase L.6: Testing & Polish
1. Run all test cases
2. Fix any issues found
3. Accessibility audit
4. Performance optimization
5. Cross-browser testing

---

## File Changes Required

### New Files

| File | Purpose |
|------|---------|
| `frontend/js/auth.js` | Clerk integration and auth functions |
| `frontend/css/auth.css` | Styles for auth-related components |

### Modified Files

| File | Changes |
|------|---------|
| `frontend/index.html` | Add Clerk SDK script, auth section in header |
| `frontend/js/app.js` | Initialize auth on page load |
| `frontend/css/components.css` | Add balance display styles |
| All protected pages | Add auth gate script |

---

## API Contract Details

### GET /api/auth/session

**Request:**
```http
GET /api/auth/session
Authorization: Bearer <clerk_jwt_token>
```

**Response (authenticated):**
```json
{
  "user_id": "user_abc123",
  "auth_method": "clerk",
  "session_id": "sess_xyz789",
  "profile": {
    "created_at": "2026-01-14T10:30:00Z",
    "providers": ["google"]
  }
}
```

**Response (not authenticated):**
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

### GET /api/balance

**Request:**
```http
GET /api/balance
Authorization: Bearer <clerk_jwt_token>
```

**Response:**
```json
{
  "balance_cents": 1250,
  "currency": "USD",
  "updated_at": "2026-01-14T10:30:00Z"
}
```

### POST /api/auth/logout

**Request:**
```http
POST /api/auth/logout
Authorization: Bearer <clerk_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Session logged out successfully"
}
```

---

## Error Handling

### Error States

| Error | User Message | Recovery Action |
|-------|--------------|-----------------|
| Clerk SDK failed to load | "Unable to load authentication. Please refresh the page." | Refresh button |
| OAuth provider error | "Sign in failed. Please try again." | Try again button |
| Session expired | "Your session has expired. Please sign in again." | Redirect to login |
| Balance fetch failed | "Unable to load balance. Click to retry." | Retry button |
| Network error | "Network error. Please check your connection." | Retry button |
| Backend unavailable | "Service temporarily unavailable. Please try again later." | Retry button |

---

## Success Criteria

1. User can sign in via any enabled OAuth provider
2. User sees their balance after signing in
3. User can sign out successfully
4. Session persists across page refreshes
5. Protected pages redirect unauthenticated users
6. All tests pass
7. Accessibility requirements met
8. Works in all target browsers

---

## Dependencies on Other Plans

| Dependency | Plan | Status |
|------------|------|--------|
| Deposit funds | `todo/add_to_balance.md` | Planned (next phase) |
| Upload content | `todo/master_plan.md` Phase 2 | Planned |
| Dashboard UI | `todo/frontend_ui.md` | Planned |

---

## Changelog

### Version 0.1.0 (2026-01-14)
- Initial plan created
- Documented existing backend APIs
- Defined authentication flow
- Listed open questions (6 critical, 5 important)
- Created comprehensive test plan (80+ test cases)
- Defined implementation phases
