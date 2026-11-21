# Content Moderation: Dispute and Deletion System

## Implementation Status

**Last Updated:** 2026-01-24

### Backend Implementation: ✅ COMPLETE (Phases 1-5)

**Completed:**
- ✅ Phase 1: Data Layer - All 3 new Durable Objects created (DisputeRecord, DisputeIndex, AdminActionLog)
- ✅ Phase 1: ContentMetadata updated with deletion fields
- ✅ Phase 1: PaymentRecord updated with content_deletion transaction type
- ✅ Phase 2: Dispute API - All endpoints implemented (POST/GET disputes, content disputes endpoint)
- ✅ Phase 3: Delete API - Content deletion with uploader/admin auth, soft delete, dispute closure
- ✅ Phase 4: Admin API - All admin endpoints (list/update disputes, delete content, action log)
- ✅ Phase 5: Scheduled Jobs - Dispute expiration and R2 cleanup logic added to cron handler
- ✅ Tests: 262 unit tests passing, 0 CodeQL security alerts
- ✅ Security: IP hashing, contact visibility controls, admin authorization

**Known Limitations:**
1. R2 Cleanup requires DeletionPendingIndex for efficient batch processing (documented with TODO)
2. Admin disputes listing returns open disputes only (historical requires additional indexing)

### Frontend Implementation: 🚧 MOSTLY DONE (2026-10-07)

- ✅ Phase 6: Dispute Form UI (`/disputes/submit.html`, form validation)
- ✅ Phase 7: Disputes List UI (`/disputes/index.html`, filtering, pagination)
- ✅ Phase 8 (partial): dispute banner + report link on `/info.html`; per-CID dispute page `/disputes/view.html?cid=` (replaces `GET /api/disputes/{id}`, which is not implemented). Uploader delete button not done (STATUS.md S11)
- ❌ Phase 9: Transaction History Updates (STATUS.md S5)
- ❌ Phase 10: Final integration testing and plan archival (STATUS.md L11)

**Fixed 2026-10-07 (STATUS.md L15):** the deletion and admin endpoints were unreachable (`request.user` never set) and crashed once reachable. Admin endpoints take the admin session or a scoped `hba_` admin key (the shared `X-Admin-Token` was retired 2026-10-28).

---

## Overview

This plan describes the implementation of a content moderation system that allows:
1. Anyone to submit removal claims against content
2. Content uploaders to delete their own content
3. A single admin to delete any content via API
4. Transparent tracking of disputes and deletions

## Architecture Summary

### New Components
- **DisputeRecord** - Durable Object to store disputes (one per CID)
- **DisputeIndex** - Durable Object to index open disputes with caching support
- **AdminActionLog** - Durable Object to log all admin actions (singleton)
- **Dispute API** - Routes for creating/viewing disputes
- **Delete API** - Routes for uploader and admin content deletion
- **Disputes List Page** - Public page showing all open disputes
- **Dispute Form** - Public form for submitting removal claims

### Modified Components
- **ContentMetadata** - Add `deleted_at`, `deleted_by`, `deletion_reason`, `pending_r2_deletion` fields
- **UserProfile** - Track deleted uploads separately
- **PaymentRecord** - Add `content_deletion` transaction type
- **CID Details Page** - Add dispute link, dispute form link, and uploader delete button

---

## Resolved Design Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Content expires with open dispute | Dispute remains open, content becomes inaccessible |
| 2 | User can dispute own content | Yes (allowed) |
| 3 | Dispute time limit | Auto-expires after 30 days with status `closed_expired` |
| 4 | New dispute after denial | Yes, rate-limited to once per 30 days per CID |
| 5 | Deleted content metadata | Keep indefinitely for audit trail |
| 6 | Admin user setup | Environment variable `ADMIN_USER_ID` |
| 7 | Multiple admins | No, single admin only |
| 8 | Admin action logging | Separate AdminActionLog Durable Object (kept indefinitely) |
| 9 | R2 content deletion | Soft delete; 24-hour retention; daily cleanup job |
| 10 | Contact info visibility | Not encrypted; only visible to authenticated users (including admin) |
| 11 | CID collisions | Original uploader is the only relevant user for deletion rights |
| 12 | Disputes list caching | 5-minute edge cache with `Last-Modified`/`If-Modified-Since` |
| 13 | CAPTCHA | No |
| 14 | Info shown to uploader | All dispute info is public except contact info; no notifications |
| 15 | Email notifications | No |
| 16 | Dispute form access | Both: link on CID pages AND dedicated route |
| 17 | Dispute expiration job frequency | Daily |
| 18 | R2 cleanup retention period | 24 hours minimum before actual deletion |
| 19 | Admin action log retention | Keep indefinitely |
| 20 | Admin contact info view | Same as any authenticated user |
| 21 | Cache TTL | 5 minutes at edge |

---

## Data Models

### DisputeRecord (New Durable Object)

**Naming Convention**: `dispute:{cid}` (one instance per CID)

```typescript
interface Dispute {
  dispute_id: string;          // Unique ID (e.g., "disp_abc123")
  cid: string;                 // Content ID being disputed
  status: DisputeStatus;       // Current status
  created_at: string;          // ISO 8601 timestamp
  updated_at: string;          // ISO 8601 timestamp
  closed_at: string | null;    // When dispute was resolved
  expires_at: string;          // Auto-expiration date (created_at + 30 days)

  // Submitter info
  submitter_contact: ContactInfo;
  submitter_ip_hash: string;   // Hashed IP for abuse prevention

  // Claim details
  claim_type: ClaimType;
  evidence: string;            // Free-form evidence text (max 10,000 chars)
  evidence_urls: string[];     // Supporting URLs (max 10)

  // Resolution
  resolution: Resolution | null;
  resolution_reason: string | null;
  resolved_by: string | null;  // "admin", "uploader", "auto", "system"
}

// History of all disputes for this CID (for rate limiting re-disputes)
interface DisputeHistory {
  disputes: Dispute[];
  last_dispute_closed_at: string | null;  // For 30-day rate limit
}

type DisputeStatus =
  | "open"           // Awaiting review
  | "under_review"   // Being actively reviewed
  | "closed_deleted" // Content was deleted
  | "closed_denied"  // Claim was rejected
  | "closed_expired" // Dispute expired after 30 days without resolution

type ClaimType =
  | "copyright"      // DMCA or copyright claim
  | "illegal"        // Illegal content
  | "privacy"        // Personal information exposure
  | "harassment"     // Targeted harassment
  | "malware"        // Malicious software
  | "other"          // Other violation

interface ContactInfo {
  type: "email" | "url";
  value: string;               // Email address or callback URL
  verified: boolean;           // Whether contact was verified
}

type Resolution = "deleted" | "denied" | "expired";
```

### DisputeIndex (New Durable Object)

**Naming Convention**: `dispute-index:global` (singleton)

Maintains an index of all open disputes for efficient listing with caching support.

```typescript
interface DisputeIndex {
  open_disputes: {
    cid: string;
    dispute_id: string;
    claim_type: ClaimType;
    created_at: string;
    expires_at: string;
  }[];

  // Cache invalidation
  last_modified: string;       // ISO 8601 timestamp
  cache_dirty: boolean;        // Set true when disputes change
}
```

**Cache Strategy**:
- Cache the disputes list response at the edge for **5 minutes**
- When a dispute is created, closed, or expires, set `cache_dirty = true`
- Include `last_modified` in responses for conditional requests
- Clients can use `If-Modified-Since` header for conditional requests
- Cache-Control: `public, max-age=300` (5 minutes)

### AdminActionLog (New Durable Object)

**Naming Convention**: `admin-action-log:global` (singleton)

```typescript
interface AdminActionLog {
  actions: AdminAction[];
}

interface AdminAction {
  action_id: string;           // Unique ID
  admin_user_id: string;       // Who performed the action
  action_type: AdminActionType;
  timestamp: string;           // ISO 8601
  target_cid: string | null;   // If action relates to content
  target_dispute_id: string | null;  // If action relates to dispute
  details: Record<string, any>;  // Action-specific details
}

type AdminActionType =
  | "content_deleted"          // Admin deleted content
  | "dispute_denied"           // Admin denied dispute
  | "dispute_approved"         // Admin approved dispute (leading to deletion)
  | "dispute_status_changed"   // Admin changed dispute status
```

### ContentMetadata Updates

Add fields to existing ContentMetadata:

```typescript
// New fields
deleted_at: string | null;           // ISO 8601 timestamp of soft deletion
deleted_by: string | null;           // User ID who deleted (or "admin")
deletion_reason: string | null;      // "uploader_request" | "admin_removal" | "dispute:{dispute_id}"
pending_r2_deletion: boolean;        // True = awaiting scheduled R2 cleanup job
```

### PaymentRecord Updates

Add new transaction type:

```typescript
// New transaction type
type: "content_deletion"

// Additional fields for deletion transactions
interface DeletionTransaction {
  type: "content_deletion";
  cid: string;
  content_size: number;
  deletion_reason: string;
  dispute_id: string | null;   // If deleted due to dispute
  // No balance change - informational only
  amount_cents: 0;
}
```

---

## API Specification

### Dispute API

#### POST /api/disputes
Create a new dispute against a CID.

**Authentication**: None required (public endpoint)

**Rate Limit**: 10 disputes per IP per hour

**Request Body**:
```json
{
  "cid": "abc123def456",
  "claim_type": "copyright",
  "evidence": "This content infringes on my copyrighted work...",
  "evidence_urls": ["https://example.com/original-work"],
  "contact": {
    "type": "email",
    "value": "reporter@example.com"
  }
}
```

**Validation**:
- `cid`: Required, must exist, must not be deleted, must not have open dispute
- `claim_type`: Required, must be valid ClaimType
- `evidence`: Required, 50-10,000 characters
- `evidence_urls`: Optional, max 10 URLs, each must be valid HTTPS URL
- `contact.type`: Required, "email" or "url"
- `contact.value`: Required, valid email or HTTPS URL
- **Re-dispute rate limit**: If a previous dispute was closed, must be ≥30 days since closure

**Response (201 Created)**:
```json
{
  "success": true,
  "dispute": {
    "dispute_id": "disp_abc123",
    "cid": "abc123def456",
    "status": "open",
    "created_at": "2026-01-21T10:00:00Z",
    "expires_at": "2026-02-20T10:00:00Z"
  }
}
```

**Errors**:
- `400 BAD_REQUEST`: Invalid input
- `404 CID_NOT_FOUND`: CID does not exist
- `409 DISPUTE_EXISTS`: Open dispute already exists for this CID
- `410 CID_DELETED`: Content already deleted
- `429 RATE_LIMITED`: Too many disputes from this IP
- `429 REDISPUTE_TOO_SOON`: Must wait 30 days after previous dispute closure

#### GET /api/disputes
List all open disputes (public).

**Authentication**: None required

**Query Parameters**:
- `status`: Filter by status (default: "open")
- `claim_type`: Filter by claim type
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset

**Response**:
```json
{
  "disputes": [
    {
      "dispute_id": "disp_abc123",
      "cid": "abc123def456",
      "claim_type": "copyright",
      "status": "open",
      "created_at": "2026-01-21T10:00:00Z",
      "expires_at": "2026-02-20T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0,
  "cache_info": {
    "last_modified": "2026-01-21T09:00:00Z"
  }
}
```

**Caching**: Response includes `Last-Modified` header. Clients can use `If-Modified-Since`.

#### GET /api/disputes/{dispute_id}
Get details of a specific dispute.

**Authentication**: Optional (affects contact info visibility)

**Response (unauthenticated)**:
```json
{
  "dispute": {
    "dispute_id": "disp_abc123",
    "cid": "abc123def456",
    "status": "open",
    "claim_type": "copyright",
    "evidence": "This content infringes...",
    "evidence_urls": ["https://example.com/proof"],
    "created_at": "2026-01-21T10:00:00Z",
    "updated_at": "2026-01-21T10:00:00Z",
    "expires_at": "2026-02-20T10:00:00Z"
  }
}
```

**Response (authenticated)**:
```json
{
  "dispute": {
    "dispute_id": "disp_abc123",
    "cid": "abc123def456",
    "status": "open",
    "claim_type": "copyright",
    "evidence": "This content infringes...",
    "evidence_urls": ["https://example.com/proof"],
    "created_at": "2026-01-21T10:00:00Z",
    "updated_at": "2026-01-21T10:00:00Z",
    "expires_at": "2026-02-20T10:00:00Z",
    "contact": {
      "type": "email",
      "value": "reporter@example.com"
    }
  }
}
```

**Note**: Contact info only included for authenticated users.

#### GET /api/content/{cid}/disputes
Get disputes for a specific CID.

**Authentication**: Optional (affects contact info visibility)

**Response**:
```json
{
  "disputes": [
    {
      "dispute_id": "disp_abc123",
      "status": "open",
      "claim_type": "copyright",
      "created_at": "2026-01-21T10:00:00Z",
      "expires_at": "2026-02-20T10:00:00Z"
    }
  ],
  "has_open_dispute": true,
  "can_file_new_dispute": false,
  "next_dispute_allowed_at": null
}
```

### Delete API

#### DELETE /api/content/{cid}
Delete content (uploader or admin only).

**Authentication**: Required (uploader or admin)

**Request Body (optional)**:
```json
{
  "reason": "No longer needed"
}
```

**Authorization Logic**:
1. If user is admin (matches `ADMIN_USER_ID` env var) → allowed
2. If user is the original uploader of this CID → allowed
3. Otherwise → 403 Forbidden

**Response (200 OK)**:
```json
{
  "success": true,
  "deleted": {
    "cid": "abc123def456",
    "deleted_at": "2026-01-21T12:00:00Z",
    "deleted_by": "uploader"
  }
}
```

**Side Effects**:
- Sets `deleted_at`, `deleted_by`, `deletion_reason` on ContentMetadata
- Sets `pending_r2_deletion = true` (R2 content NOT immediately deleted)
- Creates `content_deletion` transaction in PaymentRecord
- Closes any open disputes with status `closed_deleted`
- Updates DisputeIndex to remove from open disputes list
- Sets `cache_dirty = true` on DisputeIndex
- Marks upload as deleted in UserProfile uploads list

**Errors**:
- `401 UNAUTHORIZED`: Not authenticated
- `403 FORBIDDEN`: Not uploader or admin
- `404 NOT_FOUND`: CID does not exist
- `410 ALREADY_DELETED`: Content already deleted

#### POST /api/admin/content/{cid}/delete
Admin-only deletion with additional options.

**Authentication**: Required (admin only)

**Request Body**:
```json
{
  "reason": "Violation of terms",
  "dispute_id": "disp_abc123"
}
```

**Side Effects** (in addition to standard delete):
- Creates entry in AdminActionLog with `action_type: "content_deleted"`

**Response**: Same as DELETE /api/content/{cid}

**Errors**:
- `401 UNAUTHORIZED`: Not authenticated
- `403 NOT_ADMIN`: User is not admin

### Admin API

#### GET /api/admin/disputes
Get all disputes with full details including contact info (admin only).

**Authentication**: Required (admin only)

**Query Parameters**: Same as GET /api/disputes

**Response**: Full dispute objects with unredacted contact info.

#### PATCH /api/admin/disputes/{dispute_id}
Update dispute status (admin only).

**Authentication**: Required (admin only)

**Request Body**:
```json
{
  "status": "closed_denied",
  "resolution_reason": "Insufficient evidence provided"
}
```

**Side Effects**:
- Creates entry in AdminActionLog
- If status becomes closed, updates DisputeIndex and sets `cache_dirty = true`

#### GET /api/admin/actions
Get admin action log (admin only).

**Authentication**: Required (admin only)

**Query Parameters**:
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset
- `action_type`: Filter by action type

**Response**:
```json
{
  "actions": [
    {
      "action_id": "act_abc123",
      "admin_user_id": "user_admin",
      "action_type": "content_deleted",
      "timestamp": "2026-01-21T12:00:00Z",
      "target_cid": "abc123def456",
      "target_dispute_id": "disp_abc123",
      "details": {
        "reason": "Violation of terms"
      }
    }
  ],
  "total": 15
}
```

---

## Scheduled Jobs

### Dispute Expiration Job

**Frequency**: Daily (via Cloudflare Cron Trigger)

**Schedule**: `0 0 * * *` (midnight UTC daily)

**Logic**:
1. Query DisputeIndex for disputes where `expires_at < now()`
2. For each expired dispute:
   - Update status to `closed_expired`
   - Set `resolution = "expired"`, `resolved_by = "system"`
   - Set `closed_at = now()`
   - Remove from DisputeIndex open list
3. Set `cache_dirty = true` on DisputeIndex

**Note**: Disputes may remain open up to ~24 hours past their `expires_at` due to daily frequency. This is acceptable.

### R2 Cleanup Job

**Frequency**: Daily (via Cloudflare Cron Trigger)

**Schedule**: `0 1 * * *` (1:00 AM UTC daily, after expiration job)

**Retention Period**: 24 hours minimum

**Logic**:
1. Query ContentMetadata for records where:
   - `pending_r2_deletion = true`
   - `deleted_at < now() - 24 hours` (24-hour retention)
2. For each eligible record:
   - Delete the actual object from R2 storage
   - Set `pending_r2_deletion = false`
3. Log number of objects deleted for monitoring

**Rationale**: 24-hour retention allows for potential admin recovery of accidentally deleted content before permanent removal.

---

## UI Components

### Dispute Submission Form (/disputes/submit.html)

**Access Methods**:
1. Direct URL: `/disputes/submit.html`
2. With CID pre-filled: `/disputes/submit.html?cid=abc123`
3. Link from CID details page: "Report this content" link

**Fields**:
1. CID Input (text, required)
   - Auto-populated if accessed via `?cid=xxx`
   - Validates CID exists and isn't deleted
   - Shows error if CID has open dispute
   - Shows error if re-dispute too soon (< 30 days)
2. Claim Type (dropdown, required)
   - Copyright, Illegal Content, Privacy Violation, Harassment, Malware, Other
3. Evidence (textarea, required)
   - Min 50, max 10,000 characters
   - Character counter shown
4. Supporting URLs (repeatable input, optional)
   - Max 10 URLs
   - Add/remove buttons
5. Contact Method (radio, required)
   - Email or Callback URL
6. Contact Value (text, required)
   - Email validation or URL validation based on method
7. Acknowledgment Checkbox (required)
   - "I confirm this claim is made in good faith"

**Submission Flow**:
1. Validate all fields client-side
2. POST to /api/disputes
3. Show success message with dispute ID
4. Provide link to view dispute status

### Open Disputes List (/disputes/index.html)

**Layout**:
- Header: "Open Content Disputes"
- Description: Explains the dispute process
- Filter controls:
  - Claim type dropdown
  - Sort: Newest/Oldest
- Dispute cards:
  - CID (linked to details page)
  - Claim type badge
  - Created date
  - Expires date
  - "View Details" link

**Pagination**: Load more button, 50 per page

**Caching**: Client-side caching respecting `Last-Modified` header

### CID Details Page Updates (/dashboard/uploads/detail.html)

**New Sections**:

1. **Dispute Notice Banner** (if open dispute exists)
   - Warning style (yellow/orange)
   - "This content has an open dispute"
   - Link to dispute details
   - Shows expiration date

2. **Dispute History Section** (if any disputes exist)
   - List of all disputes (open and closed)
   - Status badges
   - Links to dispute details

3. **Report Content Link** (always visible for non-deleted content)
   - "Report this content" link
   - Links to `/disputes/submit.html?cid={cid}`
   - Disabled with tooltip if open dispute exists or re-dispute too soon

4. **Delete Button** (uploader only)
   - Red danger button
   - Confirmation modal:
     - "Are you sure you want to delete this content?"
     - "This action cannot be undone."
     - Optional reason input
     - Cancel / Delete buttons
   - Only visible if current user is the original uploader

**Delete Button Visibility Logic**:
```javascript
// Show delete button if:
// 1. User is authenticated
// 2. User is the original uploader of this CID
// 3. Content is not already deleted
const showDeleteButton = isAuthenticated &&
                         content.uploader_id === currentUser.id &&
                         !content.deleted_at;
```

### Transaction History Updates (/transactions.html)

**New Transaction Type Display**:
- Type: "Content Deletion"
- Icon: Trash icon
- Details: CID, deletion reason
- No balance change shown (informational)

**Filter**: Add "Content Deletion" to transaction type filter

---

## Implementation Phases

### Phase 1: Data Layer
1. Create DisputeRecord Durable Object
2. Create DisputeIndex Durable Object with cache support
3. Create AdminActionLog Durable Object
4. Update ContentMetadata with deletion and soft-delete fields
5. Update PaymentRecord with deletion transaction type
6. Update UserProfile to track deleted uploads
7. Add `ADMIN_USER_ID` environment variable
8. Add bindings to wrangler.toml

### Phase 2: Dispute API
1. Implement POST /api/disputes with re-dispute rate limiting
2. Implement GET /api/disputes with caching headers
3. Implement GET /api/disputes/{dispute_id} with auth-aware contact visibility
4. Implement GET /api/content/{cid}/disputes
5. Add rate limiting for dispute submission
6. Add validation helpers

### Phase 3: Delete API
1. Implement DELETE /api/content/{cid}
2. Implement uploader check logic (original uploader only)
3. Implement admin check logic (env var comparison)
4. Implement soft delete (set pending_r2_deletion, don't delete R2)
5. Implement dispute closure on deletion
6. Create deletion transaction records

### Phase 4: Admin API
1. Implement admin authentication middleware
2. Implement GET /api/admin/disputes
3. Implement PATCH /api/admin/disputes/{dispute_id}
4. Implement POST /api/admin/content/{cid}/delete
5. Implement GET /api/admin/actions
6. Add AdminActionLog entries for all admin actions

### Phase 5: Scheduled Jobs
1. Implement dispute expiration job
2. Implement R2 cleanup job
3. Add job scheduling (Cloudflare Cron Triggers)

### Phase 6: Frontend - Dispute Form
1. Create /disputes/submit.html
2. Create /frontend/js/dispute-submit.js
3. Add form validation including re-dispute rate limit check
4. Add success/error handling
5. Add routing in index.js

### Phase 7: Frontend - Disputes List
1. Create /disputes/index.html
2. Create /frontend/js/disputes-list.js
3. Add filtering and pagination
4. Add client-side caching
5. Add routing in index.js

### Phase 8: Frontend - CID Details Updates
1. Add dispute banner component
2. Add dispute history section
3. Add "Report this content" link
4. Add delete button (uploader only)
5. Add delete confirmation modal
6. Update detail.js

### Phase 9: Frontend - Transaction History Updates
1. Add content_deletion transaction display
2. Add filter option
3. Update transactions.js

### Phase 10: Integration Testing & Polish
1. End-to-end testing
2. Error handling review
3. UI/UX polish
4. Documentation

---

## Test Plan

The test cases are in [content_moderation_test_plan.md](content_moderation_test_plan.md).

## Open Questions

All questions have been resolved. See "Resolved Design Decisions" table above.

---

## Dependencies

- Cloudflare Workers Durable Objects (existing)
- Cloudflare R2 for content storage (existing)
- Cloudflare Cron Triggers for scheduled jobs (new)
- Clerk authentication (existing)
- Environment variable `ADMIN_USER_ID` (new)
- No new external dependencies required

---

## Success Criteria

1. Users can submit disputes with required evidence and contact info
2. Disputes auto-expire after 30 days
3. Re-disputes are rate-limited to once per 30 days per CID
4. Open disputes are publicly visible in a list with caching
5. CID details pages show related disputes and "Report this content" link
6. Content uploaders can delete their own content via UI
7. Admin (single, env var configured) can delete any content via API
8. All admin actions are logged in AdminActionLog
9. Deletions are soft deletes; R2 cleanup happens via scheduled job
10. Deletions create transaction records visible to uploaders
11. Deletions close related disputes while preserving records
12. Contact info only visible to authenticated users
13. All edge cases have defined behavior with passing tests
14. No security vulnerabilities in dispute/delete flow
