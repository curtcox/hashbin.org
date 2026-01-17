# Navigation & Discoverability Plan

## Overview

This plan addresses the 7 Navigation & Discoverability user stories from `todo/user_stories.md` (lines 62-76) to ensure all features can be easily navigated and discovered.

## User Stories to Implement

| # | User Story | Status |
|---|------------|--------|
| 1 | Access dashboard from navigation menu | UI: Planned |
| 2 | Navigate to API key management from dashboard | UI: Planned |
| 3 | See all available features in a clear menu structure | UI: Planned |
| 4 | Consistent navigation across all pages | UI: Planned |
| 5 | View a site map showing all available pages and features | UI: Planned |
| 6 | Clear visual indicators of which section I'm currently viewing | UI: Planned |
| 7 | Breadcrumb navigation on nested pages | UI: Planned |

## Current State Analysis

### Existing Navigation Elements
- Header with logo, 3 nav links (Upload, Retrieve, Docs), and auth section
- Footer with Docs and GitHub links
- No active page indicators
- No breadcrumbs
- No dashboard link in header
- No sidebar navigation on dashboard

### Existing Pages (11 total)
| Page | Path | Auth Required |
|------|------|---------------|
| Home | `/` | No |
| Upload | `/upload.html` | Yes |
| Retrieve | `/retrieve.html` | No |
| Content Info | `/info.html` | No |
| Dashboard | `/dashboard.html` | Yes |
| Deposit | `/deposit.html` | Yes |
| API Keys List | `/api-keys.html` | Yes |
| API Key Create | `/api-keys-create.html` | Yes |
| API Key Detail | `/api-keys-detail.html` | Yes |
| Upload Management | `/dashboard/uploads/` | Yes |
| Upload Detail | `/dashboard/uploads/detail.html` | Yes |

### Navigation Pain Points
1. Dashboard not accessible from main nav (requires knowing URL)
2. No indication of current page in navigation
3. API keys page not discoverable from dashboard
4. Upload management not discoverable from dashboard
5. No breadcrumbs on nested pages (api-keys-detail, upload detail)
6. No site map page exists
7. Header duplicated in each HTML file (maintenance burden)

---

## Implementation Plan

### Phase 1: Header Navigation Enhancement

#### 1.1 Add Dashboard Link to Header
Add "Dashboard" to the main navigation, visible only when authenticated.

**Files to modify:**
- All HTML pages with header
- `frontend/js/app.js` - Dynamically show/hide Dashboard link based on auth state

**Implementation approach:**
- Add Dashboard link in nav between Docs and auth section
- Apply `auth-only` class, hidden by default via CSS
- `app.js` shows it when user is authenticated

#### 1.2 Active Page Indicator
Highlight the current page in the navigation.

**Files to modify:**
- `frontend/css/layout.css` - Add `.nav-active` styles
- `frontend/js/app.js` - Add logic to detect current page and apply class

**Implementation approach:**
- Add `.nav-active` CSS class with distinct styling
- On page load, match `window.location.pathname` to nav links
- Apply `.nav-active` class to matching link
- Dashboard sub-pages (api-keys, uploads) highlight "Dashboard"

---

### Phase 2: Dashboard Sidebar Navigation

#### 2.1 Dashboard Layout Restructure
Convert dashboard from single-page to sidebar + content layout.

**Files to modify:**
- `frontend/dashboard.html` - Add sidebar structure
- `frontend/css/layout.css` - Add sidebar styles
- New file: `frontend/css/dashboard.css` - Dashboard-specific styles

**Sidebar navigation items:**
1. Overview (current dashboard content) - `/dashboard.html`
2. API Keys - `/api-keys.html`
3. My Uploads - `/dashboard/uploads/`
4. Transactions - `/dashboard/transactions/` (placeholder)
5. Account Settings - `/dashboard/account/` (placeholder)

#### 2.2 Apply Sidebar to All Dashboard Sub-pages
Ensure consistent sidebar across:
- `/api-keys.html`
- `/api-keys-create.html`
- `/api-keys-detail.html`
- `/dashboard/uploads/index.html`
- `/dashboard/uploads/detail.html`

---

### Phase 3: Breadcrumb Navigation

#### 3.1 Breadcrumb Component
Add breadcrumbs to nested pages showing navigation hierarchy.

**Files to modify:**
- `frontend/css/components.css` - Add breadcrumb styles
- Nested pages: api-keys-create, api-keys-detail, dashboard/uploads/*

**Breadcrumb examples:**
- `/api-keys.html`: Dashboard > API Keys
- `/api-keys-create.html`: Dashboard > API Keys > Create New
- `/api-keys-detail.html`: Dashboard > API Keys > {key name}
- `/dashboard/uploads/`: Dashboard > My Uploads
- `/dashboard/uploads/detail.html`: Dashboard > My Uploads > {hash preview}

---

### Phase 4: Site Map Page

#### 4.1 Create Site Map Page
New page at `/sitemap.html` showing all available pages and features.

**Content sections:**
1. Public Pages (no auth required)
2. User Pages (auth required)
3. Admin Pages (admin role, planned)
4. API Endpoints (link to API docs)

**Implementation:**
- New file: `frontend/sitemap.html`
- Add "Site Map" link to footer

---

### Phase 5: Visual Polish & Consistency

#### 5.1 Responsive Navigation
Ensure all navigation works on mobile devices.

**Files to modify:**
- `frontend/css/layout.css` - Mobile menu styles
- `frontend/js/app.js` - Mobile menu toggle (hamburger)

#### 5.2 Footer Enhancement
Add consistent footer links across all pages.

---

## Test Plan

### Header Navigation Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-H-001 | Header displays on all pages | Header visible with logo, nav links, auth section |
| NAV-H-002 | Logo links to home | Clicking logo navigates to `/` |
| NAV-H-003 | Upload link works | Clicking Upload navigates to `/upload.html` |
| NAV-H-004 | Retrieve link works | Clicking Retrieve navigates to `/retrieve.html` |
| NAV-H-005 | Docs link works | Clicking Docs navigates to `/docs/` |
| NAV-H-006 | Dashboard link hidden when logged out | Dashboard link not visible to anonymous users |
| NAV-H-007 | Dashboard link visible when logged in | Dashboard link appears after authentication |
| NAV-H-008 | Dashboard link works | Clicking Dashboard navigates to `/dashboard.html` |
| NAV-H-009 | Header structure identical across all 11 pages | Same HTML structure and element order |
| NAV-H-010 | Auth section renders correctly when logged out | Shows "Sign In" button |
| NAV-H-011 | Auth section renders correctly when logged in | Shows user info, balance, sign out |

### Active Page Indicator Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-A-001 | Home page shows no active nav link | No nav link highlighted on `/` |
| NAV-A-002 | Upload page shows Upload as active | Upload link has `.nav-active` class on `/upload.html` |
| NAV-A-003 | Retrieve page shows Retrieve as active | Retrieve link has `.nav-active` on `/retrieve.html` |
| NAV-A-004 | Info page shows Retrieve as active | Retrieve link has `.nav-active` on `/info.html` |
| NAV-A-005 | Dashboard page shows Dashboard as active | Dashboard link has `.nav-active` on `/dashboard.html` |
| NAV-A-006 | API Keys list shows Dashboard as active | Dashboard link active on `/api-keys.html` |
| NAV-A-007 | API Key create shows Dashboard as active | Dashboard link active on `/api-keys-create.html` |
| NAV-A-008 | API Key detail shows Dashboard as active | Dashboard link active on `/api-keys-detail.html` |
| NAV-A-009 | Upload list shows Dashboard as active | Dashboard link active on `/dashboard/uploads/` |
| NAV-A-010 | Upload detail shows Dashboard as active | Dashboard link active on `/dashboard/uploads/detail.html` |
| NAV-A-011 | Deposit page shows Dashboard as active | Dashboard link active on `/deposit.html` |
| NAV-A-012 | Active indicator styling is visually distinct | Active link has different color/weight/decoration |
| NAV-A-013 | Only one nav link is active at a time | No multiple active states possible |
| NAV-A-014 | Active state persists after page reload | Refreshing page keeps correct active state |

### Dashboard Sidebar Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-S-001 | Sidebar displays on dashboard | Sidebar visible with all navigation items |
| NAV-S-002 | Sidebar displays on API Keys list | Same sidebar visible on `/api-keys.html` |
| NAV-S-003 | Sidebar displays on API Key create | Same sidebar visible on `/api-keys-create.html` |
| NAV-S-004 | Sidebar displays on API Key detail | Same sidebar visible on `/api-keys-detail.html` |
| NAV-S-005 | Sidebar displays on uploads list | Same sidebar visible on `/dashboard/uploads/` |
| NAV-S-006 | Sidebar displays on upload detail | Same sidebar on `/dashboard/uploads/detail.html` |
| NAV-S-007 | Sidebar displays on deposit page | Same sidebar visible on `/deposit.html` |
| NAV-S-008 | Overview link active on dashboard | "Overview" has active state on `/dashboard.html` |
| NAV-S-009 | API Keys link active on API Keys list | "API Keys" active on `/api-keys.html` |
| NAV-S-010 | API Keys link active on API Key create | "API Keys" active on `/api-keys-create.html` |
| NAV-S-011 | API Keys link active on API Key detail | "API Keys" active on `/api-keys-detail.html` |
| NAV-S-012 | My Uploads link active on uploads list | "My Uploads" active on `/dashboard/uploads/` |
| NAV-S-013 | My Uploads link active on upload detail | "My Uploads" active on upload detail page |
| NAV-S-014 | Balance link active on deposit page | "Balance" or related link active on `/deposit.html` |
| NAV-S-015 | Sidebar links navigate correctly | Each sidebar link goes to correct destination |
| NAV-S-016 | Planned items show indicator | Transactions, Account Settings show "Coming Soon" |
| NAV-S-017 | Sidebar has 5 items | Overview, API Keys, My Uploads, Transactions, Account |
| NAV-S-018 | Sidebar items have icons | Each item has recognizable icon |

### Breadcrumb Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-B-001 | No breadcrumbs on home page | `/` has no breadcrumbs |
| NAV-B-002 | No breadcrumbs on dashboard overview | `/dashboard.html` has no breadcrumbs |
| NAV-B-003 | Breadcrumbs on API Keys list | Shows: Dashboard > API Keys |
| NAV-B-004 | Breadcrumbs on API Key create | Shows: Dashboard > API Keys > Create New |
| NAV-B-005 | Breadcrumbs on API Key detail | Shows: Dashboard > API Keys > {key name} |
| NAV-B-006 | Breadcrumbs on uploads list | Shows: Dashboard > My Uploads |
| NAV-B-007 | Breadcrumbs on upload detail | Shows: Dashboard > My Uploads > {hash preview} |
| NAV-B-008 | Breadcrumbs on deposit page | Shows: Dashboard > Add Funds |
| NAV-B-009 | "Dashboard" breadcrumb link works | Clicking Dashboard navigates to `/dashboard.html` |
| NAV-B-010 | "API Keys" breadcrumb link works | Clicking API Keys navigates to `/api-keys.html` |
| NAV-B-011 | "My Uploads" breadcrumb link works | Clicking navigates to `/dashboard/uploads/` |
| NAV-B-012 | Current page is not a link | Final breadcrumb segment is text, not link |
| NAV-B-013 | Breadcrumb separator visible | ">" or "/" visible between segments |
| NAV-B-014 | Breadcrumbs truncate long hash | Hash shows first 8 chars + "..." |
| NAV-B-015 | Breadcrumbs truncate long key name | Names > 20 chars are truncated |
| NAV-B-016 | Breadcrumbs accessible | Proper ARIA attributes on breadcrumb nav |

### Site Map Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-M-001 | Site map page loads | `/sitemap.html` renders without error |
| NAV-M-002 | Site map has standard header | Same header as other pages |
| NAV-M-003 | Site map has standard footer | Same footer as other pages |
| NAV-M-004 | Public pages section exists | Section listing public pages |
| NAV-M-005 | User pages section exists | Section listing auth-required pages |
| NAV-M-006 | Admin pages section exists | Section listing admin pages (marked planned) |
| NAV-M-007 | API endpoints section exists | Section with link to API docs |
| NAV-M-008 | Home link works | `/` link navigates correctly |
| NAV-M-009 | Retrieve link works | `/retrieve.html` link works |
| NAV-M-010 | Info link works | `/info.html` link works |
| NAV-M-011 | Upload link works | `/upload.html` link works |
| NAV-M-012 | Dashboard link works | `/dashboard.html` link works |
| NAV-M-013 | API Keys link works | `/api-keys.html` link works |
| NAV-M-014 | Uploads list link works | `/dashboard/uploads/` link works |
| NAV-M-015 | Deposit link works | `/deposit.html` link works |
| NAV-M-016 | Planned pages indicated | Visual indicator for pages not yet implemented |
| NAV-M-017 | Site map link in footer | Footer contains link to `/sitemap.html` |
| NAV-M-018 | Page count displayed | Shows "X pages implemented, Y planned" |

### Mobile Navigation Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-R-001 | Header responsive at 768px | Navigation adapts for tablet |
| NAV-R-002 | Header responsive at 480px | Navigation fully collapsed |
| NAV-R-003 | Hamburger menu appears on mobile | Menu icon visible at narrow widths |
| NAV-R-004 | Hamburger click opens menu | Tapping icon shows navigation |
| NAV-R-005 | Menu close on item click | Selecting nav item closes menu |
| NAV-R-006 | Menu close on outside click | Clicking outside menu closes it |
| NAV-R-007 | Mobile menu includes all links | Same links as desktop visible |
| NAV-R-008 | Mobile menu shows auth state | Sign in/user info visible |
| NAV-R-009 | Sidebar collapses on mobile | Sidebar hidden or transformed |
| NAV-R-010 | Sidebar toggle visible on mobile | Way to show sidebar on narrow screens |
| NAV-R-011 | Breadcrumbs wrap on mobile | Long breadcrumbs don't overflow |
| NAV-R-012 | Touch targets >= 44x44px | All clickable elements adequately sized |
| NAV-R-013 | No horizontal scroll | Pages don't require horizontal scrolling |

### Visual Consistency Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-V-001 | Header height identical across pages | Same height everywhere |
| NAV-V-002 | Header styling identical | Same colors, fonts, spacing |
| NAV-V-003 | Footer height identical | Same height everywhere |
| NAV-V-004 | Footer styling identical | Same colors, fonts, content |
| NAV-V-005 | Sidebar width consistent | Same width on all dashboard pages |
| NAV-V-006 | Active states use primary color | Consistent `--primary` color usage |
| NAV-V-007 | Hover states consistent | Same transition timing and effects |
| NAV-V-008 | Font sizes match design system | Using defined CSS variables |
| NAV-V-009 | Spacing uses defined scale | 4px, 8px, 16px, 24px, 32px increments |
| NAV-V-010 | Icons consistent style | Same icon set/style throughout |

### Integration Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-I-001 | Login shows Dashboard link | After sign in, Dashboard appears |
| NAV-I-002 | Logout hides Dashboard link | After sign out, Dashboard disappears |
| NAV-I-003 | Auth state persists on navigation | Moving between pages keeps auth |
| NAV-I-004 | Deep linking shows correct state | Direct URL shows correct active/breadcrumbs |
| NAV-I-005 | Browser back button works | Previous page navigation works |
| NAV-I-006 | Browser forward button works | Forward navigation works |
| NAV-I-007 | Page transitions smooth | No flash of unstyled content |
| NAV-I-008 | Links open in same tab | Internal links don't open new tabs |
| NAV-I-009 | External links open new tab | GitHub etc. open in new tab |

### Accessibility Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-AC-001 | Tab through header nav | All links reachable via Tab key |
| NAV-AC-002 | Tab through sidebar | All sidebar items reachable |
| NAV-AC-003 | Tab through breadcrumbs | All breadcrumb links reachable |
| NAV-AC-004 | Focus indicators visible | Clear outline on focused elements |
| NAV-AC-005 | Skip to content link exists | First focusable element skips nav |
| NAV-AC-006 | Skip link works | Activating jumps to main content |
| NAV-AC-007 | Header has nav landmark | `<nav>` or `role="navigation"` |
| NAV-AC-008 | Sidebar has nav landmark | `<nav>` or `role="navigation"` |
| NAV-AC-009 | Main content has main landmark | `<main>` element present |
| NAV-AC-010 | aria-current on active nav | `aria-current="page"` on active link |
| NAV-AC-011 | Breadcrumb has aria-label | `aria-label="Breadcrumb"` on nav |
| NAV-AC-012 | Mobile menu has aria-expanded | State announced on toggle |
| NAV-AC-013 | Color contrast sufficient | WCAG AA 4.5:1 for text |
| NAV-AC-014 | Focus trap in mobile menu | Tab cycles within open menu |
| NAV-AC-015 | Escape closes mobile menu | Keyboard dismissal works |

### Edge Case Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-E-001 | Very long page title in breadcrumb | Truncated with ellipsis |
| NAV-E-002 | API key name with special chars | Properly escaped in breadcrumb |
| NAV-E-003 | Hash with special chars | Properly displayed in breadcrumb |
| NAV-E-004 | Rapid nav link clicks | No duplicate navigation |
| NAV-E-005 | Navigation during API call | Page change cancels pending request |
| NAV-E-006 | Session expires on nav | Redirects to login appropriately |
| NAV-E-007 | 404 page has navigation | Error pages have standard header/footer |
| NAV-E-008 | JavaScript disabled | Basic links still work |
| NAV-E-009 | CSS fails to load | Page still navigable |
| NAV-E-010 | Very wide viewport (4K) | Layout doesn't break |
| NAV-E-011 | Very narrow viewport (320px) | Layout doesn't break |

---

## Open Questions

### Architecture Questions

1. **Shared components approach**: Should we implement a JavaScript-based component system to inject header/sidebar, or continue with duplicated HTML?
   - Option A: Keep HTML duplication (simpler, but maintenance burden)
   - Option B: Use JavaScript templating/injection (DRY, but JS dependency)
   - Option C: Build step with HTML includes (requires tooling change)

2. **Dashboard URL structure**: Should API Keys remain at `/api-keys.html` or move to `/dashboard/api-keys/`?
   - Current: `/api-keys.html`, `/api-keys-create.html`, `/api-keys-detail.html`
   - Proposed: `/dashboard/api-keys/`, `/dashboard/api-keys/create.html`, `/dashboard/api-keys/detail.html`
   - Affects: Breadcrumb logic, link consistency, redirects needed

3. **Deposit page location**: Should `/deposit.html` be part of dashboard structure?
   - Current: `/deposit.html` at root
   - Option A: Keep at `/deposit.html`
   - Option B: Move to `/dashboard/deposit.html`
   - Option C: Move to `/dashboard/balance/` with deposit as action
   - Affects: Sidebar navigation, breadcrumbs

### Design Questions

4. **Active indicator style**: What visual treatment for active navigation items?
   - Option A: Bold text only
   - Option B: Underline
   - Option C: Background highlight
   - Option D: Left border accent (for sidebar)
   - Option E: Combination (bold + underline)

5. **Sidebar collapse behavior on mobile**: How should sidebar behave on narrow screens?
   - Option A: Hide entirely (rely on header nav only)
   - Option B: Collapse to icon-only rail
   - Option C: Convert to horizontal tabs below header
   - Option D: Off-canvas slide-out drawer

6. **Planned features indication in navigation**: How to show "coming soon" features?
   - Option A: Grayed out with tooltip
   - Option B: Normal styling with "(Coming Soon)" text suffix
   - Option C: Don't show planned features at all in nav
   - Option D: Show with lock/clock icon

### Functional Questions

7. **Deep link to planned page behavior**: What happens when user navigates to a planned page URL?
   - Option A: 404 error page
   - Option B: Redirect to parent with toast message
   - Option C: Placeholder page with "Coming Soon" message and timeline

8. **Breadcrumb hash truncation**: How to display long content hashes?
   - Option A: First 8 characters (e.g., "6G2ksXiT...")
   - Option B: First 4 + last 4 (e.g., "6G2k...XiT8")
   - Option C: Full hash with horizontal scroll
   - Option D: Custom name if available, fallback to truncated hash

9. **Site map primary access point**: Where should the site map be most prominently linked?
   - Option A: Footer only (standard convention)
   - Option B: Footer + help dropdown in header
   - Option C: Footer + dedicated link in dashboard sidebar
   - Option D: Footer + 404 page suggestion

10. **Header navigation order**: What order should nav items appear?
    - Current: Upload, Retrieve, Docs
    - Option A: Keep current + add Dashboard at end
    - Option B: Dashboard, Upload, Retrieve, Docs (dashboard first for logged-in users)
    - Option C: Retrieve, Upload, Dashboard, Docs (read-first flow)

---

## Success Criteria

The navigation implementation is complete when:

1. [ ] All 7 user stories have passing tests
2. [ ] All 101 test cases in the test plan pass
3. [ ] No open questions remain (all decisions documented)
4. [ ] Dashboard link appears in header for authenticated users
5. [ ] Active page indicators work on all pages
6. [ ] Sidebar navigation consistent across dashboard pages
7. [ ] Breadcrumbs appear on all nested pages (6+ pages)
8. [ ] Site map page exists and lists all pages
9. [ ] Mobile navigation works on common devices (320px - 768px)
10. [ ] Accessibility audit passes (keyboard nav, screen reader, contrast)
11. [ ] No regression in existing functionality

---

## Dependencies

### Prerequisites
- None - can begin immediately

### Related Work
- Content Rate Limit UI (complete) - already added `/dashboard/uploads/` pages
- API Keys pages (complete) - need sidebar added

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-17 | Initial plan with 101 tests and 10 open questions |
