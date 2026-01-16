# Key Management UI Plan

**Status:** Draft v2.0
**Date:** 2026-01-16
**Changelog:**
- v2.0: Resolved 11 of 15 open questions, added key editing, usage count, expiration sorting/highlighting
**Related:** `todo/user_stories.md` (API Developers section, lines 172-194)

## Overview

Implement the web UI for API key management to allow developers to create, list, edit, revoke, and reveal API keys. This plan includes:

- **Key editing**: Rename keys with fresh authentication (5-minute threshold)
- **Usage tracking**: Display total request count since creation
- **Expiration warnings**: Sort by expiration date, highlight keys expiring within 30 days
- **Security**: Fresh authentication required for reveal and edit operations
- **UX polish**: 3-second copy feedback, desktop-first responsive design

The backend API is mostly complete (✅), with verification needed for `usageCount` field and `PATCH` endpoint for name updates.

## User Stories (from user_stories.md)

The following stories need UI implementation:

1. **Generate API keys** - `POST /api/auth/apikeys`
2. **Create up to 25 API keys** - Enforced by backend
3. **Name API keys** - For identification
4. **See keys only once at creation** - One-time display
5. **List API keys** (without plaintext) - `GET /api/auth/apikeys`
6. **Edit API key names** - `PATCH /api/auth/apikeys/:id` (requires fresh auth)
7. **Revoke API keys** - `DELETE /api/auth/apikeys/:id`
8. **See when keys were last used** - Display `last_used_at` field
9. **See total usage count** - Display `usageCount` field (total requests)
10. **Reveal API key with fresh authentication** - `POST /api/auth/apikeys/:id/reveal`
11. **Warn about expiring keys** - Highlight keys expiring within 30 days

## Pages to Implement

### 1. `/dashboard/api-keys/` - API Keys List Page

**Purpose:** Display all user API keys with management actions

**Components:**
- Header with "Create New Key" button
- Table/list of API keys showing:
  - Key name (clickable to edit)
  - Key prefix (e.g., `hb_live_abc...`)
  - Created date
  - Expiration date
  - Total usage count (requests since creation)
  - Last used date (or "Never")
  - Status (Active/Expired)
  - Actions: View details, Reveal, Revoke
- Empty state message if no keys exist
- Count display: "X of 25 keys"
- **Sorting:** Keys sorted by expiration date (soonest expiring first)
- **Expiration highlighting:** Keys expiring within 30 days highlighted with warning color/icon

**Data Source:** `GET /api/auth/apikeys`

**Edge Cases:**
- 25 keys limit reached - disable "Create New Key" button
- Keys never used - show "Never" for last used
- Expired keys - show visual indicator
- Long key names - truncate with ellipsis
- Keys expiring soon (within 30 days) - show warning indicator
- Keys with zero usage - show "0 requests"
- Keys with high usage - format large numbers (e.g., "1.2K", "3.4M")

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
  - Name (inline editable with pencil icon, requires fresh auth)
  - Key prefix (e.g., `hb_live_abc...`)
  - Environment (Live/Test)
  - Created date
  - Expiration date (with warning if expiring within 30 days)
  - Last used date
  - Status
- Usage statistics:
  - Total requests since creation
  - Last used timestamp
- Actions:
  - Edit name (inline or modal, requires fresh auth)
  - Reveal key (requires fresh auth)
  - Revoke key (with confirmation)
  - Copy prefix
- Breadcrumb: Dashboard → API Keys → [Key Name]

**API Calls:**
- Load details: Part of `GET /api/auth/apikeys` list
- Edit name: `PATCH /api/auth/apikeys/:id` (requires fresh auth)
- Reveal: `POST /api/auth/apikeys/:id/reveal` (requires fresh auth, 5-minute threshold)
- Revoke: `DELETE /api/auth/apikeys/:id`

**Edge Cases:**
- Key doesn't exist (404) - show error, redirect to list
- Key already revoked - hide Revoke button
- Key expired - show warning banner
- Fresh auth required for reveal/edit - trigger re-authentication flow (5-minute threshold)
- Expiring within 30 days - show warning banner
- Name editing with invalid input - show validation errors
- Concurrent edit attempts - handle optimistic updates with rollback

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

### Fresh Authentication for Reveal and Edit

**5-Minute Freshness Threshold:** Session must be < 5 minutes old to reveal keys or edit key names.

When user clicks "Reveal" or "Edit Name":
1. Check if session is fresh (< 5 minutes since last authentication)
2. If not fresh, trigger re-authentication:
   - Show modal: "Please re-enter your password to continue"
   - Use Clerk's re-authentication flow
   - On success, proceed with reveal/edit
   - On failure/cancel, abort action
3. For Reveal: Call `POST /api/auth/apikeys/:id/reveal`
   - Display full key in modal (similar to creation flow)
   - One-time display with copy button
4. For Edit: Enable inline editing or show edit modal
   - Call `PATCH /api/auth/apikeys/:id` with new name
   - Update UI optimistically with rollback on error

**Security Considerations:**
- Reveal and edit require fresh session token (5-minute threshold)
- Backend validates session freshness on both operations
- Rate limit reveal attempts (backend)
- Session freshness is per-session, not per-action (user can perform multiple reveals/edits within 5 minutes)

## UI/UX Design Patterns

### Key Display
- **Full key** (creation/reveal only): `hb_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`
- **Prefix in list**: `hb_live_abc...` (first 12-15 chars + ellipsis)
- **Format**: Monospace font, light background
- **Copy button**: Icon with tooltip "Copy to clipboard"

### Status Indicators
- **Active**: Green dot/badge
- **Expired**: Red dot/badge + "Expired" text
- **Expiring soon** (within 30 days): Yellow/orange warning icon + "Expires in X days"
- **Never used**: Gray text "Never used"
- **Last used**: Relative time (e.g., "2 hours ago", "3 days ago")
- **Usage count**: Display number with formatting (0, 42, 1.2K, 3.4M)

### Copy Feedback
- **Duration:** 3 seconds
- **Behavior:** Auto-dismiss after 3s
- **Visual:** Toast notification or inline "Copied!" message with checkmark
- **Text:** "Copied to clipboard"

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

### Expiration Warnings
Keys expiring within 30 days display a warning indicator:
```
⚠️ Expires in 15 days
```

In list view, these keys are:
- Highlighted with warning color/border
- Sorted to appear at the top (soonest expiring first)
- Show warning icon next to expiration date

In detail view:
```
⚠️ Expiration Warning

This API key will expire in 15 days on January 31, 2026.
Consider creating a replacement key before expiration.
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

**Edit Key Name** (inline editing):
- Click pencil icon next to key name
- If session not fresh (>5 minutes), show re-auth modal
- After re-auth, show inline edit field
- Validate: 1-100 characters, required
- Save button: Updates name via `PATCH /api/auth/apikeys/:id`
- Cancel button: Reverts changes
- On save error: Show error, revert to original name

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
  usageCount: number; // Total requests since creation
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

// PATCH /api/auth/apikeys/:id (requires fresh auth - 5 minutes)
async function updateApiKey(id: string, data: {
  name: string;
}): Promise<ApiKey>

// DELETE /api/auth/apikeys/:id
async function revokeApiKey(id: string): Promise<void>

// POST /api/auth/apikeys/:id/reveal (requires fresh auth - 5 minutes)
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
- Screen reader announcements for key creation/revocation/editing
- Focus management in modals
- High contrast mode support

### Responsive Design Strategy
- **Desktop-first approach**: Design and optimize for desktop workflow first
- **Mobile support**: Functional on mobile, but not primary focus
- **Breakpoints**: Desktop (1024px+), Tablet (768-1023px), Mobile (< 768px)
- **Mobile adaptations**: Simplified table view, stacked layout for forms

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
19. ✅ Sorts keys by expiration date (soonest first)
20. ✅ Copy button copies prefix to clipboard
21. ✅ Displays usage count for each key
22. ✅ Shows "0 requests" for unused keys
23. ✅ Formats large usage counts (1.2K, 3.4M)
24. ✅ Highlights keys expiring within 30 days
25. ✅ Shows warning icon for expiring keys
26. ✅ Displays "Expires in X days" for expiring keys
27. ✅ Expiring keys appear at top of list
28. ✅ Click key name to enter edit mode (list view)
29. ✅ Triggers re-auth if session not fresh before editing
30. ✅ Copy feedback shows for 3 seconds
31. ✅ Copy feedback auto-dismisses after 3s

#### Create Key Page Tests
32. ✅ Renders form with all required fields
33. ✅ Name field is required
34. ✅ Name field validates length (1-100 chars)
35. ✅ Name field shows error for empty input
36. ✅ Name field shows error for >100 char input
37. ✅ Environment selector defaults to "Live"
38. ✅ Environment selector switches between Live/Test
39. ✅ Expiration date picker defaults to 1 year
40. ✅ Expiration date picker validates min date (today)
41. ✅ Expiration date picker validates max date (5 years)
42. ✅ Expiration date picker shows error for past date
43. ✅ Expiration date picker shows error for >5 year date
44. ✅ Cancel button returns to list page
45. ✅ Submit button disabled when form invalid
46. ✅ Submit button shows loading state during API call
47. ✅ Form prevents submission with invalid data
48. ✅ Shows error message on API failure
49. ✅ Shows error when 25 keys already exist
50. ✅ Displays one-time key modal after successful creation
51. ✅ Modal shows full API key in monospace font
52. ✅ Modal has "Copy to clipboard" button
53. ✅ Copy button copies full key to clipboard
54. ✅ Copy button shows success feedback for 3 seconds
55. ✅ Modal shows warning about one-time display
56. ✅ Modal has "I have saved this key" checkbox
57. ✅ Modal close button disabled until checkbox checked
58. ✅ Confirms close if user tries to close without checking
59. ✅ Redirects to list page after modal close
60. ✅ Preserves form data on network error
61. ✅ Shows validation errors inline below fields

#### Key Detail Page Tests
62. ✅ Renders key details correctly
63. ✅ Shows key name in header with edit icon
64. ✅ Displays key prefix
65. ✅ Shows environment badge (Live/Test)
66. ✅ Displays created date
67. ✅ Displays expiration date
68. ✅ Shows last used date or "Never"
69. ✅ Shows status indicator (Active/Expired)
70. ✅ Displays total usage count
71. ✅ Formats usage count correctly (0, 42, 1.2K, 3.4M)
72. ✅ Shows expiration warning banner if expiring within 30 days
73. ✅ Shows breadcrumb navigation
74. ✅ Breadcrumb links work correctly
75. ✅ Displays "Reveal Key" button when active
76. ✅ Displays "Revoke Key" button when active
77. ✅ Hides "Revoke Key" button when expired
78. ✅ Shows warning banner when expired
79. ✅ Handles 404 error (key not found)
80. ✅ Redirects to list on 404 with error message
81. ✅ Copy button copies prefix to clipboard
82. ✅ Copy button shows feedback for 3 seconds

#### Edit Key Name Tests
83. ✅ Shows pencil icon next to key name
84. ✅ Clicking pencil triggers re-auth check
85. ✅ Shows re-auth modal if session not fresh (>5 minutes)
86. ✅ Enables inline edit after successful re-auth
87. ✅ Shows inline edit field with current name
88. ✅ Save button appears in edit mode
89. ✅ Cancel button appears in edit mode
90. ✅ Validates name length (1-100 chars)
91. ✅ Shows error for empty name
92. ✅ Shows error for >100 char name
93. ✅ Save button disabled when name invalid
94. ✅ Calls PATCH /api/auth/apikeys/:id on save
95. ✅ Updates UI optimistically
96. ✅ Shows loading state during save
97. ✅ Reverts to display mode on successful save
98. ✅ Shows success message after save
99. ✅ Reverts to original name on save error
100. ✅ Shows error message on save failure
101. ✅ Cancel button reverts changes
102. ✅ Handles concurrent edit attempts
103. ✅ Prevents edit when key expired

#### Reveal Key Tests
104. ✅ Clicking "Reveal" triggers re-authentication check
105. ✅ Shows re-auth modal if session not fresh (<5 minutes)
106. ✅ Skips re-auth if session is fresh (<5 minutes)
107. ✅ Re-auth modal uses Clerk authentication
108. ✅ Calls reveal API after successful re-auth
109. ✅ Shows error on failed re-authentication
110. ✅ Aborts reveal on cancelled re-authentication
111. ✅ Displays revealed key in modal
112. ✅ Reveal modal shows full key
113. ✅ Reveal modal has copy button
114. ✅ Copy button copies full key to clipboard
115. ✅ Copy button shows feedback for 3 seconds
116. ✅ Reveal modal has close button
117. ✅ Handles API error during reveal
118. ✅ Shows error message on reveal failure
119. ✅ Rate limit error shows appropriate message
120. ✅ Can reveal multiple keys within 5-minute window

#### Revoke Key Tests
121. ✅ Clicking "Revoke" shows confirmation dialog
122. ✅ Confirmation dialog shows key name
123. ✅ Confirmation dialog shows key prefix
124. ✅ Confirmation dialog has Cancel button
125. ✅ Confirmation dialog has Revoke button
126. ✅ Cancel button closes dialog without action
127. ✅ Revoke button calls delete API
128. ✅ Shows loading state during revoke
129. ✅ Redirects to list after successful revoke
130. ✅ Shows success message after revoke
131. ✅ Handles API error during revoke
132. ✅ Shows error message on revoke failure
133. ✅ Optimistic update removes key from list
134. ✅ Rollback on API error restores key to list

### Integration Tests

#### End-to-End Key Lifecycle Tests
135. ✅ User can navigate from dashboard to key list
136. ✅ User can create a new key with all fields
137. ✅ User sees one-time key display after creation
138. ✅ User can copy key to clipboard
139. ✅ User must confirm saving before closing modal
140. ✅ Key appears in list after creation
141. ✅ User can navigate to key detail page
142. ✅ User can edit key name with re-authentication
143. ✅ User can reveal key with re-authentication
144. ✅ User can copy revealed key
145. ✅ User can revoke key with confirmation
146. ✅ Revoked key no longer appears in list

#### Multiple Keys Tests
147. ✅ User can create multiple keys (up to 25)
148. ✅ Key count updates correctly (X/25)
149. ✅ Warning appears at 23 keys
150. ✅ Warning appears at 24 keys
151. ✅ Error appears at 25 keys
152. ✅ Create button disabled at 25 keys
153. ✅ User can revoke a key to free up a slot
154. ✅ Create button re-enabled after revoking when at limit
155. ✅ Key count decrements after revoke

#### Environment Tests
156. ✅ User can create Live key (hb_live_ prefix)
157. ✅ User can create Test key (hb_test_ prefix)
158. ✅ Live keys display with correct prefix
159. ✅ Test keys display with correct prefix
160. ✅ Environment badge shows correctly for each type

#### Expiration Tests
161. ✅ User can set expiration date
162. ✅ Expiration date validates correctly (max 5 years)
163. ✅ Expired keys show expired status
164. ✅ Expired keys show warning banner
165. ✅ Expired keys cannot be revoked (button hidden)
166. ✅ Expired keys cannot be edited (button hidden)
167. ✅ Expired keys can still be viewed
168. ✅ Keys expiring within 30 days show warning
169. ✅ Keys expiring within 30 days highlighted in list
170. ✅ Keys expiring within 30 days sorted to top
171. ✅ Expiration warning shows days remaining

#### Last Used and Usage Count Tests
172. ✅ New keys show "Never" for last used
173. ✅ Used keys show relative time for last used
174. ✅ Last used time updates after key usage
175. ✅ Last used time formats correctly (minutes, hours, days)
176. ✅ New keys show 0 usage count
177. ✅ Usage count increments after API requests
178. ✅ Usage count displays in list view
179. ✅ Usage count displays in detail view
180. ✅ Large usage counts formatted correctly (1.2K, 3.4M)

### API Integration Tests

#### List Keys API Tests
181. ✅ GET /api/auth/apikeys returns array of keys
182. ✅ Response includes all key fields (including usageCount)
183. ✅ Response does NOT include full key value
184. ✅ Handles 401 (unauthorized) correctly
185. ✅ Handles 500 (server error) correctly
186. ✅ Handles network timeout correctly

#### Create Key API Tests
187. ✅ POST /api/auth/apikeys creates key successfully
188. ✅ Response includes full key value (one-time)
189. ✅ Request validates required fields
190. ✅ Request validates name length
191. ✅ Request validates expiration date
192. ✅ Returns 400 for invalid data
193. ✅ Returns 409 when 25 keys already exist
194. ✅ Returns 401 for unauthorized request
195. ✅ Handles network timeout correctly
196. ✅ New key has usageCount of 0

#### Update Key API Tests
197. ✅ PATCH /api/auth/apikeys/:id updates key name successfully
198. ✅ Requires fresh authentication token (<5 minutes)
199. ✅ Returns 403 for stale session (>5 minutes)
200. ✅ Validates name length (1-100 chars)
201. ✅ Returns 400 for invalid name
202. ✅ Returns 404 for non-existent key
203. ✅ Returns 401 for unauthorized request
204. ✅ Handles network timeout correctly
205. ✅ Cannot update expired key

#### Reveal Key API Tests
206. ✅ POST /api/auth/apikeys/:id/reveal returns full key
207. ✅ Requires fresh authentication token (<5 minutes)
208. ✅ Returns 403 for stale session (>5 minutes)
209. ✅ Returns 404 for non-existent key
210. ✅ Returns 429 if rate limited
211. ✅ Returns 401 for unauthorized request
212. ✅ Handles network timeout correctly

#### Revoke Key API Tests
213. ✅ DELETE /api/auth/apikeys/:id revokes key successfully
214. ✅ Returns 204 on successful revoke
215. ✅ Returns 404 for non-existent key
216. ✅ Returns 401 for unauthorized request
217. ✅ Key no longer appears in list after revoke
218. ✅ Revoked key cannot be revealed
219. ✅ Revoked key cannot be edited
220. ✅ Revoked key cannot be used for API calls
221. ✅ Handles network timeout correctly

### Edge Case Tests

#### Network & Error Tests
222. ✅ Handles intermittent network failures
223. ✅ Shows retry option on network error
224. ✅ Preserves user input on network error
225. ✅ Shows appropriate error for different HTTP codes
226. ✅ Handles CORS errors gracefully
227. ✅ Handles timeout errors with message
228. ✅ Shows generic error for unknown failures

#### Browser & Compatibility Tests
229. ✅ Works in Chrome/Edge (Chromium)
230. ✅ Works in Firefox
231. ✅ Works in Safari
232. ✅ Responsive design works on mobile (desktop-first)
233. ✅ Responsive design works on tablet
234. ✅ Copy to clipboard works in all browsers
235. ✅ Copy feedback (3s) works in all browsers
236. ✅ Date picker works in all browsers

#### Accessibility Tests
237. ✅ All buttons keyboard accessible
238. ✅ All forms keyboard accessible
239. ✅ Tab order is logical
240. ✅ Focus indicators visible
241. ✅ Screen reader announces key creation
242. ✅ Screen reader announces key revocation
243. ✅ Screen reader announces key editing
244. ✅ Screen reader announces expiration warnings
245. ✅ ARIA labels present and correct
246. ✅ High contrast mode works
247. ✅ Zoom to 200% maintains usability

#### State & Data Tests
248. ✅ Handles empty key list correctly
249. ✅ Handles single key correctly
250. ✅ Handles maximum keys (25) correctly
251. ✅ Handles keys with very long names
252. ✅ Handles keys with special characters in names
253. ✅ Handles keys with emoji in names
254. ✅ Handles expired keys correctly
255. ✅ Handles keys never used correctly
256. ✅ Handles keys with null last_used_at
257. ✅ Handles keys with 0 usage count
258. ✅ Handles keys with very high usage count (billions)
259. ✅ Handles concurrent key creation
260. ✅ Handles concurrent key revocation
261. ✅ Handles concurrent key editing
262. ✅ Prevents double-submit on create
263. ✅ Prevents double-submit on revoke
264. ✅ Prevents double-submit on edit
265. ✅ Handles keys expiring in exactly 30 days
266. ✅ Handles keys expiring in 29 days (highlighted)
267. ✅ Handles keys expiring in 31 days (not highlighted)

#### Security Tests
268. ✅ API key never exposed in URL
269. ✅ API key never exposed in browser history
270. ✅ API key cleared from memory after modal close
271. ✅ Re-authentication required for reveal (<5 min threshold)
272. ✅ Re-authentication required for edit (<5 min threshold)
273. ✅ Session freshness validated server-side
274. ✅ CSRF protection in place
275. ✅ XSS protection for user inputs (especially names)
276. ✅ Rate limiting enforced for reveal attempts
277. ✅ Rate limiting enforced for edit attempts

## Resolved Decisions

1. **Key Editing:** ✅ YES - Users can edit key names, requires fresh auth (<5 minutes)
2. **Key Rotation:** ✅ NO - Not implementing key rotation feature
3. **Key Usage Statistics:** ✅ Show total usage count (requests since creation)
4. **Session Freshness:** ✅ 5 minutes - Session must be <5 minutes old for reveal/edit
5. **Key Filtering/Search:** ✅ NO - Not implementing in v1
6. **Key Expiration Warnings:** ✅ Sort by expiration, highlight keys expiring within 30 days
7. **Bulk Actions:** ✅ NO - Not implementing bulk revoke
8. **Key Export:** ✅ NO - Not implementing export functionality
9. **Confirmation for 25th Key:** ✅ NO - Keep direct creation flow
10. **Test Environment Keys:** ✅ NO special visual treatment - Just show environment label
11. **Copy Feedback Duration:** ✅ 3 seconds auto-dismiss
12. **Mobile Experience:** ✅ Desktop-first approach, functional on mobile but not primary focus
13. **Key Detail Page vs. Modal:** ✅ Separate page (`/dashboard/api-keys/:id`)

## Open Questions (Awaiting Backend Clarification)

### 1. API Response Format
- **Question:** What's the exact response format from the backend API?
- **Need to verify:**
  - Field names and types for `GET /api/auth/apikeys`
  - Does `usageCount` field exist? If not, needs to be added
  - Error response structure (format, error codes, messages)
  - Session freshness validation mechanism
  - Does `PATCH /api/auth/apikeys/:id` endpoint exist for name updates?
- **Action Required:**
  - Review backend code for API key endpoints
  - Verify API contracts match TypeScript interfaces in this plan
  - Check if backend tracks usage count per key
- **Blocking:** Cannot finalize implementation without this information

### 2. Rate Limiting on Reveal and Edit
- **Question:** What are the rate limits for reveal and edit endpoints?
- **Need to verify:**
  - Reveal endpoint (`POST /api/auth/apikeys/:id/reveal`) rate limits
  - Edit endpoint (`PATCH /api/auth/apikeys/:id`) rate limits
  - Is it per-user, per-key, or per-IP?
  - Time-based (X requests per minute) or count-based (X per day)?
  - What HTTP status and error message for rate limit exceeded?
- **Action Required:**
  - Check backend implementation for rate limiting
  - Document limits for UI error handling
  - Verify if rate limits are different for reveal vs. edit
- **Blocking:** Need to know limits to show appropriate UI errors and messaging

## Implementation Phases

### Phase 1: Core List & Create (MVP)
- Implement key list page with empty state
- Add sorting by expiration date (soonest first)
- Add usage count display
- Implement create key page with form validation
- Implement one-time key display modal (3s copy feedback)
- Add navigation from dashboard
- Basic error handling
- **Goal:** Users can create and see their keys with usage stats

### Phase 2: Expiration Warnings & Visual Polish
- Highlight keys expiring within 30 days
- Add expiration warning banners
- Add warning icons and "Expires in X days" messages
- Implement copy feedback (3s auto-dismiss)
- Format large usage counts (1.2K, 3.4M)
- **Goal:** Users are warned about expiring keys

### Phase 3: Details & Revoke
- Implement key detail page
- Display usage statistics on detail page
- Implement revoke functionality with confirmation
- Add breadcrumb navigation
- Enhanced error handling
- **Goal:** Users can manage individual keys

### Phase 4: Edit Functionality
- Implement inline name editing with pencil icon
- Integrate fresh auth check (5-minute threshold)
- Name validation (1-100 chars)
- Optimistic updates with rollback
- **Goal:** Users can rename keys securely

### Phase 5: Reveal & Security
- Implement reveal functionality
- Implement fresh authentication flow (5-minute threshold)
- Security hardening (XSS, CSRF)
- Rate limit error handling
- Test session freshness across reveal/edit operations
- **Goal:** Secure key reveal and edit with re-auth

### Phase 6: Polish & Edge Cases
- Loading states and skeletons
- All edge case handling (277 tests)
- Desktop-first responsive design
- Accessibility improvements (WCAG 2.1 AA)
- Browser compatibility testing
- **Goal:** Production-ready quality

## Success Criteria

The implementation will be considered complete when:

1. ✅ All core user stories are implemented (create, list, reveal, revoke, edit)
2. ✅ All 277 tests pass
3. ✅ All open questions are resolved (2 remaining - API format, rate limits)
4. ✅ Security review is complete (5-min re-auth for reveal/edit, no key leaks)
5. ✅ Accessibility audit passes (WCAG 2.1 AA)
6. ✅ Cross-browser testing complete (Chrome, Firefox, Safari)
7. ✅ Desktop-first responsive design verified (functional on mobile)
8. ✅ Error handling covers all edge cases
9. ✅ Expiration warnings working (30-day threshold, sorting, highlighting)
10. ✅ Usage count display working (with proper formatting)
11. ✅ Copy feedback working (3-second auto-dismiss)
12. ✅ Documentation updated (user guide, API integration guide)
13. ✅ Code review approved

## Dependencies

### Backend APIs
- ✅ `POST /api/auth/apikeys` - Create key
- ✅ `GET /api/auth/apikeys` - List keys
- ⚠️ `GET /api/auth/apikeys` - **VERIFY:** Does response include `usageCount` field?
- ❓ `PATCH /api/auth/apikeys/:id` - Update key name (needs verification if endpoint exists)
- ✅ `DELETE /api/auth/apikeys/:id` - Revoke key
- ✅ `POST /api/auth/apikeys/:id/reveal` - Reveal key
- ⚠️ **VERIFY:** Fresh auth enforcement (5-minute threshold) on reveal/edit endpoints

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

### 1. Resolve Remaining Open Questions (PRIORITY)

**Backend API verification needed:**

a) **API Response Format Investigation:**
   - Read backend code for `GET /api/auth/apikeys` endpoint
   - Verify if `usageCount` field exists in response
   - Check if backend tracks API key usage per key
   - Document actual field names and types
   - Verify error response format

b) **PATCH Endpoint Verification:**
   - Check if `PATCH /api/auth/apikeys/:id` endpoint exists
   - If not, needs to be implemented in backend first
   - Verify it accepts `{ name: string }` in request body
   - Verify it requires fresh authentication

c) **Rate Limiting Documentation:**
   - Document rate limits for reveal endpoint
   - Document rate limits for edit endpoint (if exists)
   - Specify: per-user, per-key, or per-IP?
   - Specify: time window and request count
   - Specify: error response format (HTTP 429)

**Questions to investigate:**
1. Does the backend track `usageCount` (total requests per API key)?
2. Does the `PATCH /api/auth/apikeys/:id` endpoint exist?
3. How is session freshness validated? Is there a 5-minute mechanism?
4. What are the rate limits for reveal and edit operations?
5. Can you share the actual API response format from `GET /api/auth/apikeys`?

### 2. Design Review
   - Create mockups/wireframes for all three pages
   - Review with stakeholders
   - Confirm UI patterns and components
   - Finalize expiration warning visual treatment

### 3. Technical Spike
   - Investigate fresh authentication flow with Clerk (5-minute threshold)
   - Verify clipboard API compatibility across browsers
   - Test 3-second copy feedback auto-dismiss
   - Test API endpoints directly

### 4. Begin Implementation
   - Start with Phase 1 (Core List & Create with sorting/usage)
   - Use test-driven development approach (277 tests)
   - Iterate based on feedback

---

**Notes:**
- This plan assumes backend APIs are functional as indicated in user_stories.md
- Test plan is comprehensive (277 tests) to drive out all ambiguity
- **BLOCKING:** Need answers to open questions before implementation
- Plan follows existing HashBin.org patterns and architecture
- v2.0 adds: key editing, usage count, expiration warnings, 5-min fresh auth
