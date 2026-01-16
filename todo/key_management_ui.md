# Key Management UI Plan

**Status:** Draft v1.0
**Date:** 2026-01-16
**Related:** `todo/user_stories.md` (API Developers section, lines 172-194)

## Overview

Implement the web UI for API key management to allow developers to create, list, revoke, and reveal API keys. The backend API is already complete (✅), so this focuses solely on the frontend implementation.

## User Stories (from user_stories.md)

The following stories need UI implementation:

1. **Generate API keys** - `POST /api/auth/apikeys`
2. **Create up to 25 API keys** - Enforced by backend
3. **Name API keys** - For identification
4. **See keys only once at creation** - One-time display
5. **List API keys** (without plaintext) - `GET /api/auth/apikeys`
6. **Revoke API keys** - `DELETE /api/auth/apikeys/:id`
7. **See when keys were last used** - Display `last_used_at` field
8. **Reveal API key with fresh authentication** - `POST /api/auth/apikeys/:id/reveal`

## Pages to Implement

### 1. `/dashboard/api-keys/` - API Keys List Page

**Purpose:** Display all user API keys with management actions

**Components:**
- Header with "Create New Key" button
- Table/list of API keys showing:
  - Key name
  - Key prefix (e.g., `hb_live_abc...`)
  - Created date
  - Expiration date
  - Last used date (or "Never")
  - Status (Active/Expired)
  - Actions: View details, Reveal, Revoke
- Empty state message if no keys exist
- Count display: "X of 25 keys"

**Data Source:** `GET /api/auth/apikeys`

**Edge Cases:**
- 25 keys limit reached - disable "Create New Key" button
- Keys never used - show "Never" for last used
- Expired keys - show visual indicator
- Long key names - truncate with ellipsis

### 2. `/dashboard/api-keys/create` - Create API Key Page

**Purpose:** Form to create a new API key

**Components:**
- Form with fields:
  - Key name (required, 1-100 characters)
  - Environment selector (Live/Test)
    - Live → `hb_live_*` prefix
    - Test → `hb_test_*` prefix
  - Expiration date picker (max 5 years from now)
    - Default: 1 year
    - Min: Today
    - Max: 5 years from creation
- One-time key display modal after creation:
  - Full API key shown once
  - Copy to clipboard button
  - Warning: "Save this key now. You won't be able to see it again."
  - Checkbox: "I have saved this key"
  - Close button (only enabled after checkbox)
- Cancel button (returns to list)

**API Call:** `POST /api/auth/apikeys`

**Request Body:**
```json
{
  "name": "string",
  "environment": "live" | "test",
  "expiresAt": "ISO8601 timestamp"
}
```

**Response:**
```json
{
  "id": "key-id",
  "key": "hb_live_abcdef123456...", // Only in creation response
  "name": "My API Key",
  "prefix": "hb_live_abc",
  "environment": "live",
  "createdAt": "2026-01-16T12:00:00Z",
  "expiresAt": "2027-01-16T12:00:00Z",
  "lastUsedAt": null
}
```

**Edge Cases:**
- 25 keys already exist - redirect to list with error
- Invalid expiration date (>5 years) - show validation error
- Empty name - show validation error
- Network error during creation - show error, don't lose form data
- User closes modal without saving key - confirm action

### 3. `/dashboard/api-keys/:id` - API Key Detail Page

**Purpose:** View and manage a specific API key

**Components:**
- Key details:
  - Name (editable?)
  - Key prefix (e.g., `hb_live_abc...`)
  - Environment (Live/Test)
  - Created date
  - Expiration date
  - Last used date
  - Status
- Actions:
  - Reveal key (requires fresh auth)
  - Revoke key (with confirmation)
  - Copy prefix
- Usage section (if available):
  - Last used timestamp
  - Request count (if tracked)
- Breadcrumb: Dashboard → API Keys → [Key Name]

**API Calls:**
- Load details: Part of `GET /api/auth/apikeys` list
- Reveal: `POST /api/auth/apikeys/:id/reveal`
- Revoke: `DELETE /api/auth/apikeys/:id`

**Edge Cases:**
- Key doesn't exist (404) - show error, redirect to list
- Key already revoked - hide Revoke button
- Key expired - show warning banner
- Fresh auth required for reveal - trigger re-authentication flow

## Navigation Integration

### Dashboard Main Page (`/dashboard.html`)

Add "API Keys" card/link to dashboard:
- Icon: Key or code symbol
- Text: "API Keys"
- Subtitle: "Manage your API credentials"
- Badge showing key count: "X/25"

### Header/Sidebar Navigation

If implementing sidebar navigation:
- Section: "Developer"
- Item: "API Keys" → `/dashboard/api-keys/`

## Authentication Flow

### Fresh Authentication for Reveal

When user clicks "Reveal" on a key:
1. Check if session is fresh (< 5 minutes old?)
2. If not fresh, trigger re-authentication:
   - Show modal: "Please re-enter your password to continue"
   - Use Clerk's re-authentication flow
   - On success, proceed with reveal
   - On failure/cancel, abort reveal
3. Call `POST /api/auth/apikeys/:id/reveal`
4. Display full key in modal (similar to creation flow)
5. One-time display with copy button

**Security Considerations:**
- Reveal should require fresh session token
- Backend validates session freshness
- Rate limit reveal attempts (backend)

## UI/UX Design Patterns

### Key Display
- **Full key** (creation/reveal only): `hb_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`
- **Prefix in list**: `hb_live_abc...` (first 12-15 chars + ellipsis)
- **Format**: Monospace font, light background
- **Copy button**: Icon with tooltip "Copy to clipboard"

### Status Indicators
- **Active**: Green dot/badge
- **Expired**: Red dot/badge + "Expired" text
- **Never used**: Gray text "Never used"
- **Last used**: Relative time (e.g., "2 hours ago", "3 days ago")

### Empty State
```
🔑 No API Keys Yet

Create your first API key to start using the HashBin API programmatically.

[Create API Key Button]
```

### 25 Keys Limit Warning
When 23-25 keys exist:
```
⚠️ You're approaching the 25 key limit (X/25 keys).
Consider revoking unused keys before creating new ones.
```

When 25 keys exist:
```
🚫 API Key Limit Reached (25/25)
You must revoke an existing key before creating a new one.
```

### Confirmation Dialogs

**Revoke Key:**
```
Revoke API Key?

Are you sure you want to revoke "My API Key" (hb_live_abc...)?

This action cannot be undone. Any applications using this key will immediately lose access.

[Cancel] [Revoke Key]
```

**Close Creation Modal Without Saving:**
```
Are you sure?

You haven't confirmed saving your API key. If you close this window,
you won't be able to see this key again.

[Go Back] [Close Anyway]
```

## Technical Implementation Notes

### State Management
- Use React Context or similar for key list state
- Optimistic updates for revoke (with rollback on error)
- Cache key list data (with revalidation)

### API Integration
```typescript
// Example API client methods
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  environment: 'live' | 'test';
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  status: 'active' | 'expired';
}

interface ApiKeyWithSecret extends ApiKey {
  key: string; // Only present on creation/reveal
}

// GET /api/auth/apikeys
async function listApiKeys(): Promise<ApiKey[]>

// POST /api/auth/apikeys
async function createApiKey(data: {
  name: string;
  environment: 'live' | 'test';
  expiresAt: string;
}): Promise<ApiKeyWithSecret>

// DELETE /api/auth/apikeys/:id
async function revokeApiKey(id: string): Promise<void>

// POST /api/auth/apikeys/:id/reveal
async function revealApiKey(id: string): Promise<{ key: string }>
```

### Error Handling
- Network errors: Show toast notification, retry option
- Validation errors: Inline form errors
- 404 errors: Redirect to list with message
- 403 errors: Trigger re-authentication
- 429 (rate limit): Show "Too many requests" message

### Loading States
- Skeleton loaders for key list
- Spinner in buttons during API calls
- Disabled form during submission

### Accessibility
- Keyboard navigation support
- ARIA labels for all interactive elements
- Screen reader announcements for key creation/revocation
- Focus management in modals
- High contrast mode support

## Test Plan

### Unit Tests

#### Key List Page Tests
1. ✅ Renders empty state when no keys exist
2. ✅ Displays "Create New Key" button in empty state
3. ✅ Renders key list with correct data
4. ✅ Shows key prefix (first 12 chars + ellipsis)
5. ✅ Displays key name, dates, and status
6. ✅ Shows "Never" for keys never used
7. ✅ Shows relative time for last used date
8. ✅ Renders active status with green indicator
9. ✅ Renders expired status with red indicator
10. ✅ Disables "Create New Key" button when 25 keys exist
11. ✅ Shows key count "X/25" in header
12. ✅ Shows warning when 23-24 keys exist
13. ✅ Shows error message when 25 keys exist
14. ✅ Truncates long key names with ellipsis
15. ✅ Navigates to create page when clicking "Create New Key"
16. ✅ Navigates to detail page when clicking key row
17. ✅ Handles API error gracefully with error message
18. ✅ Shows loading skeleton while fetching keys
19. ✅ Sorts keys by creation date (newest first)
20. ✅ Copy button copies prefix to clipboard

#### Create Key Page Tests
21. ✅ Renders form with all required fields
22. ✅ Name field is required
23. ✅ Name field validates length (1-100 chars)
24. ✅ Name field shows error for empty input
25. ✅ Name field shows error for >100 char input
26. ✅ Environment selector defaults to "Live"
27. ✅ Environment selector switches between Live/Test
28. ✅ Expiration date picker defaults to 1 year
29. ✅ Expiration date picker validates min date (today)
30. ✅ Expiration date picker validates max date (5 years)
31. ✅ Expiration date picker shows error for past date
32. ✅ Expiration date picker shows error for >5 year date
33. ✅ Cancel button returns to list page
34. ✅ Submit button disabled when form invalid
35. ✅ Submit button shows loading state during API call
36. ✅ Form prevents submission with invalid data
37. ✅ Shows error message on API failure
38. ✅ Shows error when 25 keys already exist
39. ✅ Displays one-time key modal after successful creation
40. ✅ Modal shows full API key in monospace font
41. ✅ Modal has "Copy to clipboard" button
42. ✅ Copy button copies full key to clipboard
43. ✅ Copy button shows success feedback
44. ✅ Modal shows warning about one-time display
45. ✅ Modal has "I have saved this key" checkbox
46. ✅ Modal close button disabled until checkbox checked
47. ✅ Confirms close if user tries to close without checking
48. ✅ Redirects to list page after modal close
49. ✅ Preserves form data on network error
50. ✅ Shows validation errors inline below fields

#### Key Detail Page Tests
51. ✅ Renders key details correctly
52. ✅ Shows key name in header
53. ✅ Displays key prefix
54. ✅ Shows environment badge (Live/Test)
55. ✅ Displays created date
56. ✅ Displays expiration date
57. ✅ Shows last used date or "Never"
58. ✅ Shows status indicator (Active/Expired)
59. ✅ Shows breadcrumb navigation
60. ✅ Breadcrumb links work correctly
61. ✅ Displays "Reveal Key" button when active
62. ✅ Displays "Revoke Key" button when active
63. ✅ Hides "Revoke Key" button when expired
64. ✅ Shows warning banner when expired
65. ✅ Handles 404 error (key not found)
66. ✅ Redirects to list on 404 with error message
67. ✅ Copy button copies prefix to clipboard

#### Reveal Key Tests
68. ✅ Clicking "Reveal" triggers re-authentication check
69. ✅ Shows re-auth modal if session not fresh
70. ✅ Re-auth modal uses Clerk authentication
71. ✅ Calls reveal API after successful re-auth
72. ✅ Shows error on failed re-authentication
73. ✅ Aborts reveal on cancelled re-authentication
74. ✅ Displays revealed key in modal
75. ✅ Reveal modal shows full key
76. ✅ Reveal modal has copy button
77. ✅ Copy button copies full key to clipboard
78. ✅ Reveal modal has close button
79. ✅ Handles API error during reveal
80. ✅ Shows error message on reveal failure
81. ✅ Rate limit error shows appropriate message

#### Revoke Key Tests
82. ✅ Clicking "Revoke" shows confirmation dialog
83. ✅ Confirmation dialog shows key name
84. ✅ Confirmation dialog shows key prefix
85. ✅ Confirmation dialog has Cancel button
86. ✅ Confirmation dialog has Revoke button
87. ✅ Cancel button closes dialog without action
88. ✅ Revoke button calls delete API
89. ✅ Shows loading state during revoke
90. ✅ Redirects to list after successful revoke
91. ✅ Shows success message after revoke
92. ✅ Handles API error during revoke
93. ✅ Shows error message on revoke failure
94. ✅ Optimistic update removes key from list
95. ✅ Rollback on API error restores key to list

### Integration Tests

#### End-to-End Key Lifecycle Tests
96. ✅ User can navigate from dashboard to key list
97. ✅ User can create a new key with all fields
98. ✅ User sees one-time key display after creation
99. ✅ User can copy key to clipboard
100. ✅ User must confirm saving before closing modal
101. ✅ Key appears in list after creation
102. ✅ User can navigate to key detail page
103. ✅ User can reveal key with re-authentication
104. ✅ User can copy revealed key
105. ✅ User can revoke key with confirmation
106. ✅ Revoked key no longer appears in list

#### Multiple Keys Tests
107. ✅ User can create multiple keys (up to 25)
108. ✅ Key count updates correctly (X/25)
109. ✅ Warning appears at 23 keys
110. ✅ Warning appears at 24 keys
111. ✅ Error appears at 25 keys
112. ✅ Create button disabled at 25 keys
113. ✅ User can revoke a key to free up a slot
114. ✅ Create button re-enabled after revoking when at limit
115. ✅ Key count decrements after revoke

#### Environment Tests
116. ✅ User can create Live key (hb_live_ prefix)
117. ✅ User can create Test key (hb_test_ prefix)
118. ✅ Live keys display with correct prefix
119. ✅ Test keys display with correct prefix
120. ✅ Environment badge shows correctly for each type

#### Expiration Tests
121. ✅ User can set expiration date
122. ✅ Expiration date validates correctly (max 5 years)
123. ✅ Expired keys show expired status
124. ✅ Expired keys show warning banner
125. ✅ Expired keys cannot be revoked (button hidden)
126. ✅ Expired keys can still be viewed

#### Last Used Tests
127. ✅ New keys show "Never" for last used
128. ✅ Used keys show relative time for last used
129. ✅ Last used time updates after key usage
130. ✅ Last used time formats correctly (minutes, hours, days)

### API Integration Tests

#### List Keys API Tests
131. ✅ GET /api/auth/apikeys returns array of keys
132. ✅ Response includes all key fields
133. ✅ Response does NOT include full key value
134. ✅ Handles 401 (unauthorized) correctly
135. ✅ Handles 500 (server error) correctly
136. ✅ Handles network timeout correctly

#### Create Key API Tests
137. ✅ POST /api/auth/apikeys creates key successfully
138. ✅ Response includes full key value (one-time)
139. ✅ Request validates required fields
140. ✅ Request validates name length
141. ✅ Request validates expiration date
142. ✅ Returns 400 for invalid data
143. ✅ Returns 409 when 25 keys already exist
144. ✅ Returns 401 for unauthorized request
145. ✅ Handles network timeout correctly

#### Reveal Key API Tests
146. ✅ POST /api/auth/apikeys/:id/reveal returns full key
147. ✅ Requires fresh authentication token
148. ✅ Returns 403 for stale session
149. ✅ Returns 404 for non-existent key
150. ✅ Returns 429 if rate limited
151. ✅ Returns 401 for unauthorized request
152. ✅ Handles network timeout correctly

#### Revoke Key API Tests
153. ✅ DELETE /api/auth/apikeys/:id revokes key successfully
154. ✅ Returns 204 on successful revoke
155. ✅ Returns 404 for non-existent key
156. ✅ Returns 401 for unauthorized request
157. ✅ Key no longer appears in list after revoke
158. ✅ Revoked key cannot be revealed
159. ✅ Revoked key cannot be used for API calls
160. ✅ Handles network timeout correctly

### Edge Case Tests

#### Network & Error Tests
161. ✅ Handles intermittent network failures
162. ✅ Shows retry option on network error
163. ✅ Preserves user input on network error
164. ✅ Shows appropriate error for different HTTP codes
165. ✅ Handles CORS errors gracefully
166. ✅ Handles timeout errors with message
167. ✅ Shows generic error for unknown failures

#### Browser & Compatibility Tests
168. ✅ Works in Chrome/Edge (Chromium)
169. ✅ Works in Firefox
170. ✅ Works in Safari
171. ✅ Responsive design works on mobile
172. ✅ Responsive design works on tablet
173. ✅ Copy to clipboard works in all browsers
174. ✅ Date picker works in all browsers

#### Accessibility Tests
175. ✅ All buttons keyboard accessible
176. ✅ All forms keyboard accessible
177. ✅ Tab order is logical
178. ✅ Focus indicators visible
179. ✅ Screen reader announces key creation
180. ✅ Screen reader announces key revocation
181. ✅ ARIA labels present and correct
182. ✅ High contrast mode works
183. ✅ Zoom to 200% maintains usability

#### State & Data Tests
184. ✅ Handles empty key list correctly
185. ✅ Handles single key correctly
186. ✅ Handles maximum keys (25) correctly
187. ✅ Handles keys with very long names
188. ✅ Handles keys with special characters in names
189. ✅ Handles keys with emoji in names
190. ✅ Handles expired keys correctly
191. ✅ Handles keys never used correctly
192. ✅ Handles keys with null last_used_at
193. ✅ Handles concurrent key creation
194. ✅ Handles concurrent key revocation
195. ✅ Prevents double-submit on create
196. ✅ Prevents double-submit on revoke

#### Security Tests
197. ✅ API key never exposed in URL
198. ✅ API key never exposed in browser history
199. ✅ API key cleared from memory after modal close
200. ✅ Re-authentication required for reveal
201. ✅ Session freshness validated server-side
202. ✅ CSRF protection in place
203. ✅ XSS protection for user inputs
204. ✅ Rate limiting enforced for reveal attempts

## Open Questions

### 1. Key Editing
- **Question:** Should users be able to edit key names after creation?
- **Considerations:**
  - Pro: Users can rename keys to keep them organized
  - Con: Adds complexity, requires additional API endpoint
  - Current: Not in user stories
- **Decision Needed:** Yes/No, and if yes, should it require fresh auth?

### 2. Key Rotation
- **Question:** Should we provide a "rotate key" feature?
- **Considerations:**
  - Pro: Easier to rotate credentials securely
  - Con: Complex to implement, needs careful UX
  - Current: Not in user stories
- **Decision Needed:** Future enhancement or include now?

### 3. Key Usage Statistics
- **Question:** Should we show more detailed usage statistics?
- **Considerations:**
  - Currently only show last_used_at
  - Could show: request count, last 10 requests, usage over time
  - Pro: Helps users understand API usage patterns
  - Con: Requires backend tracking that may not exist
- **Decision Needed:** What level of detail? What's available from backend?

### 4. Session Freshness Definition
- **Question:** What defines a "fresh" session for reveal?
- **Considerations:**
  - Options: 5 minutes, 15 minutes, 30 minutes
  - Trade-off between security and UX friction
  - Should user be able to reveal multiple keys without re-auth?
- **Decision Needed:** Time threshold and whether it's per-reveal or per-session
- **Backend Status:** Need to verify if backend enforces this

### 5. Key Filtering/Search
- **Question:** Should users be able to filter/search keys?
- **Considerations:**
  - Relevant when users have many keys (10+)
  - Could filter by: environment, status, name
  - Could search by: name
- **Decision Needed:** Include in v1 or defer to v2?

### 6. Key Expiration Warnings
- **Question:** Should we warn users when keys are about to expire?
- **Considerations:**
  - Options: 30 days before, 7 days before, both
  - Could show banner in list or send email
  - Helps prevent unexpected API failures
- **Decision Needed:** Warning thresholds and notification method
- **Related:** Is email notification system available?

### 7. Bulk Actions
- **Question:** Should users be able to revoke multiple keys at once?
- **Considerations:**
  - Useful for cleanup when rotating all keys
  - Adds UI complexity (checkboxes, bulk action bar)
  - Risk: accidental mass revocation
- **Decision Needed:** Include in v1 or defer?

### 8. Key Export
- **Question:** Should users be able to export key list?
- **Considerations:**
  - Format: CSV, JSON
  - Would NOT include actual key values (security)
  - Could include metadata for inventory purposes
- **Decision Needed:** Include or defer?

### 9. Confirmation for Key Creation
- **Question:** Should we confirm intention before creating 25th key?
- **Considerations:**
  - Users might not realize they're at limit
  - Creates friction in key creation flow
  - Current: Direct creation flow
- **Decision Needed:** Add warning step or keep current flow?

### 10. Test Environment Keys
- **Question:** Should test keys have different visual treatment?
- **Considerations:**
  - Could use different color/badge to distinguish
  - Helps prevent mixing up environments
  - Adds visual complexity
- **Decision Needed:** Visual distinction or just show environment label?

### 11. Copy Feedback Duration
- **Question:** How long should "Copied!" feedback persist?
- **Considerations:**
  - Options: 2s, 3s, 5s
  - Should it auto-dismiss or require click?
- **Decision Needed:** Duration and dismiss behavior

### 12. Mobile Experience
- **Question:** What's the priority for mobile optimization?
- **Considerations:**
  - API key management likely desktop-heavy workflow
  - Mobile could have simplified view
  - Responsive design vs. mobile-first vs. desktop-first
- **Decision Needed:** Mobile requirements and priorities

### 13. Key Detail Page vs. Modal
- **Question:** Should key details be a separate page or a modal?
- **Considerations:**
  - Separate page: Better for deep links, browser history
  - Modal: Faster, less context switching
  - Current plan: Separate page (`/dashboard/api-keys/:id`)
- **Decision Needed:** Confirm approach or switch to modal?

### 14. API Response Format
- **Question:** What's the exact response format from backend?
- **Considerations:**
  - Need to verify field names, types, formats
  - Need to verify error response structure
  - Need to verify session freshness validation
- **Decision Needed:** Review actual API contracts
- **Action Required:** Review backend code or API documentation

### 15. Rate Limiting on Reveal
- **Question:** What are the rate limits for reveal endpoint?
- **Considerations:**
  - Need to know limits to show appropriate errors
  - Need to know if it's per-user or per-key
  - Need to know if it's time-based or count-based
- **Decision Needed:** Document rate limits
- **Action Required:** Check backend implementation

## Implementation Phases

### Phase 1: Core List & Create (MVP)
- Implement key list page with empty state
- Implement create key page with form validation
- Implement one-time key display modal
- Add navigation from dashboard
- Basic error handling
- **Goal:** Users can create and see their keys

### Phase 2: Details & Revoke
- Implement key detail page
- Implement revoke functionality with confirmation
- Add breadcrumb navigation
- Enhanced error handling
- **Goal:** Users can manage individual keys

### Phase 3: Reveal & Security
- Implement reveal functionality
- Implement fresh authentication flow
- Security hardening (XSS, CSRF)
- Rate limit error handling
- **Goal:** Secure key reveal with re-auth

### Phase 4: Polish & Edge Cases
- Loading states and skeletons
- All edge case handling
- Mobile responsive design
- Accessibility improvements
- Browser compatibility testing
- **Goal:** Production-ready quality

### Phase 5: Enhancements (Optional)
- Key filtering/search (if decided)
- Advanced usage statistics (if available)
- Export functionality (if decided)
- Bulk actions (if decided)
- **Goal:** Enhanced user experience

## Success Criteria

The implementation will be considered complete when:

1. ✅ All core user stories are implemented (create, list, reveal, revoke)
2. ✅ All 200+ tests pass
3. ✅ All open questions are resolved
4. ✅ Security review is complete (re-auth, no key leaks)
5. ✅ Accessibility audit passes (WCAG 2.1 AA)
6. ✅ Cross-browser testing complete (Chrome, Firefox, Safari)
7. ✅ Mobile responsive design verified
8. ✅ Error handling covers all edge cases
9. ✅ Documentation updated (user guide, API integration guide)
10. ✅ Code review approved

## Dependencies

### Backend APIs (Already Complete ✅)
- `POST /api/auth/apikeys` - Create key
- `GET /api/auth/apikeys` - List keys
- `DELETE /api/auth/apikeys/:id` - Revoke key
- `POST /api/auth/apikeys/:id/reveal` - Reveal key

### Authentication System (Already Complete ✅)
- Clerk OAuth integration
- Session management
- Fresh authentication flow

### UI Components (Status Unknown)
- Need to verify: Do we have a component library?
- Need to verify: Existing form components, buttons, modals?
- Need to verify: Design system or custom styling?

### Navigation Structure (Partially Complete)
- Dashboard main page exists
- Need to add: API Keys link/card
- Need to add: Sidebar navigation (if applicable)

## Next Steps

1. **Review and Iterate on Plan**
   - Resolve all open questions
   - Add any missing edge cases to test plan
   - Confirm API contracts with backend

2. **Design Review**
   - Create mockups/wireframes for all three pages
   - Review with stakeholders
   - Confirm UI patterns and components

3. **Technical Spike** (if needed)
   - Investigate fresh authentication flow with Clerk
   - Verify clipboard API compatibility
   - Test API endpoints directly

4. **Begin Implementation**
   - Start with Phase 1 (Core List & Create)
   - Use test-driven development approach
   - Iterate based on feedback

---

**Notes:**
- This plan assumes backend APIs are fully functional as indicated in user_stories.md
- Test plan is comprehensive to drive out ambiguity in requirements
- Open questions need resolution before starting implementation
- Plan follows existing HashBin.org patterns and architecture
