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

## Design Decisions

The following questions have been resolved:

| # | Question | Decision |
|---|----------|----------|
| 1 | Shared components approach | **Option B**: JavaScript templating/injection |
| 2 | Dashboard URL structure | **Keep current**: `/api-keys.html`, `/api-keys-create.html`, `/api-keys-detail.html` |
| 3 | Deposit page location | **Option A**: Keep at `/deposit.html` |
| 4 | Active indicator style | **PENDING** - see analysis below |
| 5 | Sidebar collapse on mobile | **Option C**: Convert to horizontal tabs below header |
| 6 | Planned features indication | **Option B**: Normal styling with "(Coming Soon)" text suffix |
| 7 | Deep link to planned page | **Option C**: Placeholder page with link to GitHub issue |
| 8 | Breadcrumb hash truncation | **Option B**: First 4 + last 4 (e.g., "6G2k...XiT8") |
| 9 | Site map access point | **Option D**: Footer + 404 page suggestion |
| 10 | Header navigation order | **Option B**: Dashboard, Upload, Retrieve, Docs (when logged in) |

---

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
| NAV-B-014 | Breadcrumbs truncate long hash | Hash shows first 4 + "..." + last 4 (e.g., "6G2k...XiT8") |
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
| NAV-R-009 | Sidebar converts to horizontal tabs on mobile | Sidebar items appear as tab bar below header |
| NAV-R-010 | Horizontal tabs scrollable if needed | Tab bar scrolls horizontally on narrow screens |
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

### JavaScript Component Injection Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-J-001 | Header injected on page load | Header appears via JS, not in static HTML |
| NAV-J-002 | Sidebar injected on dashboard pages | Sidebar appears via JS injection |
| NAV-J-003 | Navigation works without page reload | Injected nav responds to clicks |
| NAV-J-004 | Auth state reflected in injected header | Dashboard link visibility matches auth |
| NAV-J-005 | Active state correct after injection | Current page highlighted correctly |
| NAV-J-006 | Breadcrumbs injected with correct data | Page-specific breadcrumbs render |
| NAV-J-007 | Footer injected consistently | Same footer on all pages |
| NAV-J-008 | No duplicate injection on SPA navigation | Components not duplicated |

### Placeholder Page Tests (Planned Features)

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-P-001 | Transactions page shows placeholder | "Coming Soon" message displayed |
| NAV-P-002 | Account Settings page shows placeholder | "Coming Soon" message displayed |
| NAV-P-003 | Placeholder includes GitHub issue link | Link to relevant issue present |
| NAV-P-004 | Placeholder has standard navigation | Header/sidebar/footer present |
| NAV-P-005 | Placeholder sidebar shows current item | "Transactions (Coming Soon)" active |
| NAV-P-006 | Placeholder breadcrumbs correct | Shows full path to planned page |

### 404 Page Navigation Tests

| Test ID | Test Description | Expected Result |
|---------|------------------|-----------------|
| NAV-404-001 | 404 page has standard header | Same header as other pages |
| NAV-404-002 | 404 page has standard footer | Same footer as other pages |
| NAV-404-003 | 404 page suggests site map | "View our site map" link present |
| NAV-404-004 | Site map link on 404 works | Navigates to `/sitemap.html` |
| NAV-404-005 | 404 suggests home page | Link to `/` present |
| NAV-404-006 | 404 shows searched URL | Displays what user tried to access |

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

### Question 4: Active Indicator Style (PENDING)

**Definition of "Active Navigation Items":**

An "active navigation item" is a link in the navigation UI that represents the user's current location within the site hierarchy. There are two distinct contexts:

1. **Header Navigation (horizontal)**: The top-level nav links (Dashboard, Upload, Retrieve, Docs). The active item indicates which major section the user is in.

2. **Sidebar Navigation (vertical)**: The dashboard sub-navigation (Overview, API Keys, My Uploads, etc.). The active item indicates which dashboard feature the user is viewing.

**Analysis of Each Option:**

#### Option A: Bold Text Only
```css
.nav-active { font-weight: 700; }
```

| Pros | Cons |
|------|------|
| Minimal visual change | Subtle - may be missed by users |
| Works in any color scheme | Causes text reflow (width changes) |
| Accessible (doesn't rely on color) | Less effective for single-word items |
| Simple to implement | No clear "you are here" signal |

**Best for**: Text-heavy navigation where subtlety is preferred.

#### Option B: Underline
```css
.nav-active { text-decoration: underline; text-underline-offset: 4px; }
```

| Pros | Cons |
|------|------|
| Strong visual affordance | May conflict with link styling |
| Familiar pattern (web convention) | Can look dated |
| No width change | Doesn't work well in sidebar |
| Accessible | Limited styling options |

**Best for**: Horizontal header navigation; mimics traditional web link states.

#### Option C: Background Highlight
```css
.nav-active { background-color: var(--primary-light); border-radius: 4px; }
```

| Pros | Cons |
|------|------|
| High visibility | Requires careful color selection |
| Clear "selected" state | May clash with hover states |
| Works for both header and sidebar | Adds visual weight |
| Familiar (tab/pill pattern) | Color-dependent (accessibility concern) |

**Best for**: Tab-style navigation, pill buttons, where items are clearly separate.

#### Option D: Left Border Accent (Sidebar Only)
```css
.sidebar .nav-active { border-left: 3px solid var(--primary); background: var(--bg-subtle); }
```

| Pros | Cons |
|------|------|
| Strong visual hierarchy | Only works for vertical nav |
| Indicates position clearly | Requires sidebar-specific CSS |
| Industry standard (VS Code, Slack, etc.) | Doesn't apply to header |
| Works with any text styling | Need different solution for header |

**Best for**: Vertical sidebar navigation; professional/developer tools.

#### Option E: Combination (Bold + Underline or Bold + Border)
```css
/* Header */
.nav-header .nav-active { font-weight: 600; border-bottom: 2px solid var(--primary); }
/* Sidebar */
.sidebar .nav-active { font-weight: 600; border-left: 3px solid var(--primary); background: var(--bg-subtle); }
```

| Pros | Cons |
|------|------|
| Maximum clarity | More complex CSS |
| Redundant signals (accessibility) | Risk of over-styling |
| Can differentiate header vs sidebar | Requires coordination |
| Robust across contexts | More visual noise |

**Best for**: Applications needing high discoverability and accessibility compliance.

---

**Recommendation for HashBin:**

Given that HashBin has:
- A horizontal header nav (4 items when logged in)
- A vertical sidebar nav (5 items)
- A developer/technical audience
- Existing primary color (#4f46e5 indigo)

**Suggested approach**: Different treatments for header vs sidebar:

| Context | Recommended Style |
|---------|-------------------|
| Header | **Bottom border** (2-3px solid primary color) - clear tab indicator |
| Sidebar | **Left border + subtle background** - industry standard for vertical nav |

This would be a **hybrid of Options B, C, and D**:
```css
/* Header active state */
.nav-header .nav-active {
  color: var(--primary);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 2px;
}

/* Sidebar active state */
.sidebar .nav-active {
  font-weight: 500;
  color: var(--primary);
  background-color: var(--primary-bg);
  border-left: 3px solid var(--primary);
}
```

**Follow-up Question**: Which approach do you prefer?
- **Option A**: Bold only (both contexts)
- **Option B**: Underline only (both contexts)
- **Option C**: Background highlight (both contexts)
- **Option D**: Left border for sidebar, underline for header
- **Option E**: Left border for sidebar, bottom border for header (recommended)
- **Option F**: Other (please specify)

---

## Success Criteria

The navigation implementation is complete when:

1. [ ] All 7 user stories have passing tests
2. [ ] All 121 test cases in the test plan pass
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
| 1.1 | 2026-01-17 | Resolved 9 of 10 questions. Added detailed analysis for Question 4 (active indicator style) with CSS examples and recommendation. |
