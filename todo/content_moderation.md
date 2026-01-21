# Content Moderation: Dispute and Deletion System

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
| 8 | Admin action logging | Separate AdminActionLog Durable Object |
| 9 | R2 content deletion | Soft delete; scheduled job performs actual R2 deletion |
| 10 | Contact info visibility | Not encrypted; only visible to authenticated users |
| 11 | CID collisions | Original uploader is the only relevant user for deletion rights |
| 12 | Disputes list caching | Yes, with dirty flag invalidation |
| 13 | CAPTCHA | No |
| 14 | Info shown to uploader | All dispute info is public except contact info; no notifications |
| 15 | Email notifications | No |
| 16 | Dispute form access | Both: link on CID pages AND dedicated route |

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
- Cache the disputes list response at the edge (e.g., 5 minutes)
- When a dispute is created, closed, or expires, set `cache_dirty = true`
- Include `last_modified` in responses for conditional requests
- Clients can use `If-Modified-Since` header

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

**Frequency**: Daily (or hourly for more precision)

**Logic**:
1. Query DisputeIndex for disputes where `expires_at < now()`
2. For each expired dispute:
   - Update status to `closed_expired`
   - Set `resolution = "expired"`, `resolved_by = "system"`
   - Remove from DisputeIndex open list
3. Set `cache_dirty = true` on DisputeIndex

### R2 Cleanup Job

**Frequency**: Daily

**Logic**:
1. Query ContentMetadata for records where `pending_r2_deletion = true`
2. For each record:
   - Delete the actual object from R2 storage
   - Set `pending_r2_deletion = false`
3. Optionally: Add minimum retention period (e.g., 24 hours) before R2 deletion

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

### Unit Tests

#### DisputeRecord Durable Object

```
TEST: Create dispute with valid data
  GIVEN a valid CID exists
  WHEN POST /dispute is called with valid dispute data
  THEN dispute is created with status "open"
  AND dispute_id is generated
  AND created_at is set
  AND expires_at is set to created_at + 30 days
  AND submitter_ip_hash is stored

TEST: Create dispute with missing CID
  GIVEN dispute data without cid field
  WHEN POST /dispute is called
  THEN 400 error with "CID_REQUIRED"

TEST: Create dispute with invalid claim_type
  GIVEN dispute data with claim_type "invalid"
  WHEN POST /dispute is called
  THEN 400 error with "INVALID_CLAIM_TYPE"

TEST: Create dispute with evidence too short
  GIVEN dispute data with evidence < 50 chars
  WHEN POST /dispute is called
  THEN 400 error with "EVIDENCE_TOO_SHORT"

TEST: Create dispute with evidence too long
  GIVEN dispute data with evidence > 10,000 chars
  WHEN POST /dispute is called
  THEN 400 error with "EVIDENCE_TOO_LONG"

TEST: Create dispute with invalid email contact
  GIVEN dispute data with contact.type "email" and invalid email
  WHEN POST /dispute is called
  THEN 400 error with "INVALID_EMAIL"

TEST: Create dispute with invalid URL contact
  GIVEN dispute data with contact.type "url" and non-HTTPS URL
  WHEN POST /dispute is called
  THEN 400 error with "INVALID_CONTACT_URL"

TEST: Create dispute with too many evidence URLs
  GIVEN dispute data with > 10 evidence_urls
  WHEN POST /dispute is called
  THEN 400 error with "TOO_MANY_EVIDENCE_URLS"

TEST: Create dispute with invalid evidence URL
  GIVEN dispute data with non-HTTPS evidence URL
  WHEN POST /dispute is called
  THEN 400 error with "INVALID_EVIDENCE_URL"

TEST: Get dispute returns data without contact (unauthenticated)
  GIVEN an existing dispute
  WHEN GET /dispute is called without auth
  THEN dispute fields are returned
  AND contact info is NOT included

TEST: Get dispute returns data with contact (authenticated)
  GIVEN an existing dispute
  WHEN GET /dispute is called with auth
  THEN all dispute fields are returned
  AND contact info IS included

TEST: Update dispute status to under_review
  GIVEN an open dispute
  WHEN status is updated to "under_review"
  THEN status changes
  AND updated_at is updated

TEST: Close dispute as denied
  GIVEN an open dispute
  WHEN status is updated to "closed_denied" with reason
  THEN status changes to "closed_denied"
  AND resolution is "denied"
  AND resolution_reason is set
  AND closed_at is set

TEST: Close dispute as deleted
  GIVEN an open dispute
  WHEN status is updated to "closed_deleted"
  THEN status changes to "closed_deleted"
  AND resolution is "deleted"
  AND closed_at is set

TEST: Dispute auto-expires after 30 days
  GIVEN an open dispute created 30 days ago
  WHEN expiration job runs
  THEN status changes to "closed_expired"
  AND resolution is "expired"
  AND resolved_by is "system"

TEST: Re-dispute blocked within 30 days
  GIVEN a dispute was closed 15 days ago for CID "cid123"
  WHEN attempting to create new dispute for "cid123"
  THEN 429 error with "REDISPUTE_TOO_SOON"

TEST: Re-dispute allowed after 30 days
  GIVEN a dispute was closed 31 days ago for CID "cid123"
  WHEN attempting to create new dispute for "cid123"
  THEN 201 success
  AND new dispute is created

TEST: User can dispute own content
  GIVEN user_123 uploaded "cid123"
  WHEN user_123 submits dispute for "cid123"
  THEN 201 success
  AND dispute is created
```

#### DisputeIndex Durable Object

```
TEST: Add dispute to index
  GIVEN an empty index
  WHEN a dispute is added
  THEN open_disputes contains the dispute summary
  AND cache_dirty is set to true

TEST: Remove dispute from index on closure
  GIVEN an index with one dispute
  WHEN that dispute is closed
  THEN open_disputes is empty
  AND cache_dirty is set to true

TEST: List disputes with pagination
  GIVEN 60 open disputes
  WHEN listing with limit=50, offset=0
  THEN 50 disputes returned
  AND total is 60
  WHEN listing with limit=50, offset=50
  THEN 10 disputes returned

TEST: Filter disputes by claim_type
  GIVEN disputes with different claim types
  WHEN listing with claim_type="copyright"
  THEN only copyright disputes returned

TEST: Sort disputes by created_at
  GIVEN disputes created at different times
  WHEN listing with default sort
  THEN disputes ordered newest first

TEST: Cache dirty flag resets on read
  GIVEN cache_dirty is true
  WHEN disputes list is fetched
  THEN response includes last_modified
  AND cache_dirty can be reset

TEST: Last-modified header included
  GIVEN disputes exist
  WHEN GET /api/disputes is called
  THEN response includes Last-Modified header
```

#### AdminActionLog Durable Object

```
TEST: Log admin content deletion
  GIVEN admin deletes content "cid123"
  WHEN deletion completes
  THEN AdminActionLog contains entry with action_type "content_deleted"
  AND entry includes admin_user_id, timestamp, target_cid

TEST: Log admin dispute denial
  GIVEN admin denies dispute "disp_123"
  WHEN denial completes
  THEN AdminActionLog contains entry with action_type "dispute_denied"
  AND entry includes resolution_reason

TEST: Query action log with pagination
  GIVEN 60 admin actions
  WHEN listing with limit=50, offset=0
  THEN 50 actions returned

TEST: Filter action log by type
  GIVEN mixed action types
  WHEN listing with action_type="content_deleted"
  THEN only content_deleted actions returned
```

#### ContentMetadata Updates

```
TEST: Soft delete sets pending_r2_deletion
  GIVEN existing content "cid123"
  WHEN deleted
  THEN deleted_at is set
  AND pending_r2_deletion is true
  AND R2 object still exists

TEST: Mark content as deleted by uploader
  GIVEN existing content uploaded by user_123
  WHEN deleted by user_123
  THEN deleted_at is set
  AND deleted_by is "user_123"
  AND deletion_reason is "uploader_request"

TEST: Mark content as deleted by admin
  GIVEN existing content
  WHEN deleted by admin
  THEN deleted_at is set
  AND deleted_by is "admin"
  AND deletion_reason contains admin's reason

TEST: Mark content as deleted due to dispute
  GIVEN existing content with open dispute disp_123
  WHEN deleted due to dispute
  THEN deleted_at is set
  AND deletion_reason is "dispute:disp_123"

TEST: Get deleted content metadata
  GIVEN deleted content
  WHEN metadata is requested
  THEN returns metadata with deleted_at set
  AND download is not allowed

TEST: Prevent actions on deleted content
  GIVEN deleted content
  WHEN extend/download/rate-limit-purchase attempted
  THEN 410 GONE error

TEST: R2 cleanup job deletes actual content
  GIVEN content with pending_r2_deletion = true
  WHEN R2 cleanup job runs
  THEN R2 object is deleted
  AND pending_r2_deletion is set to false
```

### API Integration Tests

#### POST /api/disputes

```
TEST: Create dispute successfully
  GIVEN content "cid123" exists and is not deleted
  WHEN POST /api/disputes with valid data
  THEN 201 response
  AND dispute is created
  AND dispute appears in GET /api/disputes
  AND expires_at is 30 days from now

TEST: Create dispute for non-existent CID
  GIVEN CID "fake123" does not exist
  WHEN POST /api/disputes for "fake123"
  THEN 404 CID_NOT_FOUND

TEST: Create dispute for deleted content
  GIVEN content "cid123" is deleted
  WHEN POST /api/disputes for "cid123"
  THEN 410 CID_DELETED

TEST: Create duplicate dispute
  GIVEN content "cid123" has open dispute
  WHEN POST /api/disputes for "cid123"
  THEN 409 DISPUTE_EXISTS

TEST: Create dispute after previous closed (within 30 days)
  GIVEN content "cid123" had dispute closed 15 days ago
  WHEN POST /api/disputes for "cid123"
  THEN 429 REDISPUTE_TOO_SOON

TEST: Create dispute after previous closed (after 30 days)
  GIVEN content "cid123" had dispute closed 31 days ago
  WHEN POST /api/disputes for "cid123"
  THEN 201 success (new dispute allowed)

TEST: Rate limit dispute creation by IP
  GIVEN IP has submitted 10 disputes in past hour
  WHEN POST /api/disputes from same IP
  THEN 429 RATE_LIMITED

TEST: Dispute rate limit resets after hour
  GIVEN IP was rate limited
  WHEN 1 hour passes
  THEN POST /api/disputes succeeds

TEST: User disputes own content successfully
  GIVEN user_123 uploaded "cid123"
  AND user_123 is authenticated
  WHEN POST /api/disputes for "cid123"
  THEN 201 success
```

#### GET /api/disputes

```
TEST: List open disputes
  GIVEN 3 open disputes and 2 closed disputes
  WHEN GET /api/disputes
  THEN only 3 open disputes returned

TEST: List all disputes with status filter
  GIVEN 3 open and 2 closed disputes
  WHEN GET /api/disputes?status=closed_denied
  THEN only closed_denied disputes returned

TEST: List disputes with claim_type filter
  GIVEN disputes of various types
  WHEN GET /api/disputes?claim_type=copyright
  THEN only copyright disputes returned

TEST: Pagination works correctly
  GIVEN 75 open disputes
  WHEN GET /api/disputes?limit=50&offset=50
  THEN 25 disputes returned
  AND total is 75

TEST: Empty list returns empty array
  GIVEN no disputes
  WHEN GET /api/disputes
  THEN disputes is empty array
  AND total is 0

TEST: Response includes caching headers
  GIVEN disputes exist
  WHEN GET /api/disputes
  THEN response includes Last-Modified header
  AND response includes cache_info
```

#### GET /api/disputes/{dispute_id}

```
TEST: Get existing dispute (unauthenticated)
  GIVEN dispute "disp_123" exists
  WHEN GET /api/disputes/disp_123 without auth
  THEN dispute returned
  AND contact is NOT included

TEST: Get existing dispute (authenticated)
  GIVEN dispute "disp_123" exists
  WHEN GET /api/disputes/disp_123 with auth
  THEN dispute returned
  AND contact IS included

TEST: Get non-existent dispute
  GIVEN dispute "disp_fake" does not exist
  WHEN GET /api/disputes/disp_fake
  THEN 404 NOT_FOUND
```

#### GET /api/content/{cid}/disputes

```
TEST: Get disputes for CID with disputes
  GIVEN "cid123" has 2 disputes (1 open, 1 closed)
  WHEN GET /api/content/cid123/disputes
  THEN both disputes returned
  AND has_open_dispute is true
  AND can_file_new_dispute is false

TEST: Get disputes for CID without disputes
  GIVEN "cid456" has no disputes
  WHEN GET /api/content/cid456/disputes
  THEN disputes is empty array
  AND has_open_dispute is false
  AND can_file_new_dispute is true

TEST: Get disputes shows re-dispute availability
  GIVEN "cid123" had dispute closed 15 days ago
  WHEN GET /api/content/cid123/disputes
  THEN can_file_new_dispute is false
  AND next_dispute_allowed_at is set to 30 days after closure

TEST: Get disputes for non-existent CID
  GIVEN "fake123" does not exist
  WHEN GET /api/content/fake123/disputes
  THEN 404 CID_NOT_FOUND
```

#### DELETE /api/content/{cid}

```
TEST: Original uploader can delete own content
  GIVEN user_123 originally uploaded "cid123"
  AND user_123 is authenticated
  WHEN DELETE /api/content/cid123
  THEN 200 success
  AND content is marked deleted (soft delete)
  AND pending_r2_deletion is true
  AND deletion transaction created

TEST: Non-uploader cannot delete content
  GIVEN user_123 originally uploaded "cid123"
  AND user_456 is authenticated
  WHEN DELETE /api/content/cid123
  THEN 403 FORBIDDEN

TEST: Admin can delete any content
  GIVEN user_123 uploaded "cid123"
  AND admin is authenticated
  WHEN DELETE /api/content/cid123
  THEN 200 success
  AND content is marked deleted

TEST: Unauthenticated cannot delete
  GIVEN no authentication
  WHEN DELETE /api/content/cid123
  THEN 401 UNAUTHORIZED

TEST: Delete non-existent content
  GIVEN "fake123" does not exist
  WHEN DELETE /api/content/fake123
  THEN 404 NOT_FOUND

TEST: Delete already deleted content
  GIVEN "cid123" is already deleted
  WHEN DELETE /api/content/cid123
  THEN 410 ALREADY_DELETED

TEST: Delete closes open dispute
  GIVEN "cid123" has open dispute "disp_123"
  WHEN DELETE /api/content/cid123
  THEN dispute status is "closed_deleted"
  AND dispute resolution is "deleted"
  AND DisputeIndex cache_dirty is true

TEST: Soft delete does NOT immediately remove R2 content
  GIVEN "cid123" has content in R2
  WHEN DELETE /api/content/cid123
  THEN R2 object still exists
  AND pending_r2_deletion is true

TEST: Delete creates transaction record
  GIVEN user_123 deletes "cid123"
  WHEN viewing transaction history
  THEN "content_deletion" transaction exists
  AND transaction has cid, reason

TEST: Delete updates user uploads list
  GIVEN user_123 has "cid123" in uploads
  WHEN DELETE /api/content/cid123
  THEN uploads list marks "cid123" as deleted
```

#### Admin API Tests

```
TEST: Admin can list all disputes with full details
  GIVEN admin is authenticated
  WHEN GET /api/admin/disputes
  THEN all disputes returned
  AND contact info included

TEST: Non-admin cannot access admin disputes
  GIVEN regular user is authenticated
  WHEN GET /api/admin/disputes
  THEN 403 NOT_ADMIN

TEST: Admin can update dispute status
  GIVEN admin is authenticated
  AND dispute "disp_123" is open
  WHEN PATCH /api/admin/disputes/disp_123 {status: "closed_denied"}
  THEN dispute status updated
  AND AdminActionLog entry created

TEST: Admin can delete with dispute linkage
  GIVEN admin is authenticated
  AND dispute "disp_123" exists for "cid123"
  WHEN POST /api/admin/content/cid123/delete {dispute_id: "disp_123"}
  THEN content deleted
  AND dispute closed with deletion reference
  AND AdminActionLog entry created

TEST: Non-admin cannot use admin delete endpoint
  GIVEN regular user is authenticated
  WHEN POST /api/admin/content/cid123/delete
  THEN 403 NOT_ADMIN

TEST: Admin can view action log
  GIVEN admin is authenticated
  AND 10 admin actions exist
  WHEN GET /api/admin/actions
  THEN 10 actions returned

TEST: Non-admin cannot view action log
  GIVEN regular user is authenticated
  WHEN GET /api/admin/actions
  THEN 403 NOT_ADMIN
```

### Scheduled Job Tests

```
TEST: Expiration job closes expired disputes
  GIVEN dispute "disp_123" has expires_at 1 day ago
  WHEN expiration job runs
  THEN dispute status is "closed_expired"
  AND resolved_by is "system"
  AND DisputeIndex updated

TEST: Expiration job ignores non-expired disputes
  GIVEN dispute "disp_123" has expires_at 15 days from now
  WHEN expiration job runs
  THEN dispute status is still "open"

TEST: R2 cleanup job deletes pending content
  GIVEN content "cid123" has pending_r2_deletion = true
  WHEN R2 cleanup job runs
  THEN R2 object is deleted
  AND pending_r2_deletion is set to false

TEST: R2 cleanup job ignores non-pending content
  GIVEN content "cid456" has pending_r2_deletion = false
  WHEN R2 cleanup job runs
  THEN R2 object still exists
```

### Frontend Tests

#### Dispute Submission Form

```
TEST: Form validates CID exists
  GIVEN user enters non-existent CID
  WHEN form is submitted
  THEN error "Content not found" displayed

TEST: Form validates evidence length minimum
  GIVEN user enters < 50 char evidence
  WHEN form is submitted
  THEN error "Evidence must be at least 50 characters" displayed

TEST: Form validates evidence length maximum
  GIVEN user enters > 10,000 char evidence
  WHEN form is submitted
  THEN error "Evidence must be less than 10,000 characters" displayed

TEST: Form validates email format
  GIVEN user selects email contact
  AND enters invalid email
  WHEN form is submitted
  THEN error "Invalid email address" displayed

TEST: Form validates URL format
  GIVEN user selects URL contact
  AND enters non-HTTPS URL
  WHEN form is submitted
  THEN error "URL must use HTTPS" displayed

TEST: Form prevents > 10 evidence URLs
  GIVEN user has added 10 evidence URLs
  WHEN user tries to add another
  THEN "Add URL" button is disabled

TEST: Form requires acknowledgment checkbox
  GIVEN all fields valid
  AND acknowledgment not checked
  WHEN form is submitted
  THEN error "You must acknowledge..." displayed

TEST: Successful submission shows confirmation
  GIVEN all fields valid
  WHEN form is submitted successfully
  THEN success message with dispute ID shown
  AND link to view dispute status provided

TEST: CID pre-populated from URL parameter
  GIVEN URL is /disputes/submit.html?cid=abc123
  WHEN page loads
  THEN CID field contains "abc123"

TEST: Form shows error for open dispute
  GIVEN "cid123" has open dispute
  WHEN user enters "cid123"
  THEN error "This content already has an open dispute" displayed

TEST: Form shows error for re-dispute too soon
  GIVEN "cid123" had dispute closed 15 days ago
  WHEN user enters "cid123"
  THEN error "You must wait X days before filing another dispute" displayed
```

#### Disputes List Page

```
TEST: Displays open disputes
  GIVEN 5 open disputes exist
  WHEN page loads
  THEN 5 dispute cards displayed
  AND each shows expiration date

TEST: Filter by claim type works
  GIVEN disputes of various types
  WHEN user selects "Copyright" filter
  THEN only copyright disputes shown

TEST: Pagination loads more
  GIVEN 75 disputes exist
  WHEN page loads
  THEN 50 disputes shown
  WHEN "Load More" clicked
  THEN 75 disputes shown (all)

TEST: Empty state displayed
  GIVEN no open disputes
  WHEN page loads
  THEN "No open disputes" message shown

TEST: Dispute card links to CID details
  GIVEN dispute for "cid123" displayed
  WHEN CID link clicked
  THEN navigates to /dashboard/uploads/cid123/
```

#### CID Details Page - Dispute Section

```
TEST: Shows dispute banner for open dispute
  GIVEN "cid123" has open dispute
  WHEN viewing /dashboard/uploads/cid123/
  THEN warning banner displayed
  AND banner shows expiration date
  AND banner links to dispute details

TEST: Shows dispute history section
  GIVEN "cid123" has 2 disputes (1 open, 1 closed)
  WHEN viewing details page
  THEN dispute history shows both
  AND status badges indicate open/closed

TEST: No dispute section when no disputes
  GIVEN "cid456" has no disputes
  WHEN viewing details page
  THEN no dispute-related UI shown
  AND "Report this content" link is visible

TEST: Report content link present
  GIVEN "cid456" has no disputes
  WHEN viewing details page
  THEN "Report this content" link visible
  AND links to /disputes/submit.html?cid=cid456

TEST: Report content link disabled during open dispute
  GIVEN "cid123" has open dispute
  WHEN viewing details page
  THEN "Report this content" link disabled
  AND tooltip explains why

TEST: Report content link disabled during re-dispute cooldown
  GIVEN "cid123" had dispute closed 15 days ago
  WHEN viewing details page
  THEN "Report this content" link disabled
  AND tooltip shows days remaining
```

#### CID Details Page - Delete Button

```
TEST: Delete button shown for original uploader
  GIVEN user_123 is logged in
  AND user_123 originally uploaded "cid123"
  WHEN viewing /dashboard/uploads/cid123/
  THEN delete button is visible

TEST: Delete button hidden for non-uploader
  GIVEN user_456 is logged in
  AND user_123 originally uploaded "cid123"
  WHEN viewing /dashboard/uploads/cid123/
  THEN delete button is NOT visible

TEST: Delete button hidden for unauthenticated
  GIVEN user is not logged in
  WHEN viewing /dashboard/uploads/cid123/
  THEN delete button is NOT visible

TEST: Delete button hidden for already deleted
  GIVEN user_123 is logged in
  AND "cid123" is already deleted
  WHEN viewing /dashboard/uploads/cid123/
  THEN delete button is NOT visible
  AND "Content Deleted" notice shown

TEST: Delete confirmation modal appears
  GIVEN delete button is visible
  WHEN delete button clicked
  THEN confirmation modal appears
  AND modal has cancel and delete buttons

TEST: Delete cancel closes modal
  GIVEN confirmation modal is open
  WHEN cancel clicked
  THEN modal closes
  AND content NOT deleted

TEST: Delete confirm deletes content
  GIVEN confirmation modal is open
  WHEN delete confirmed
  THEN API called
  AND success message shown
  AND page shows deleted state

TEST: Delete error shows message
  GIVEN delete fails (e.g., network error)
  WHEN delete confirmed
  THEN error message displayed
  AND modal remains open or closes appropriately
```

#### Dispute Details Page - Contact Visibility

```
TEST: Contact info hidden when unauthenticated
  GIVEN user is not logged in
  WHEN viewing dispute details
  THEN contact info section not shown

TEST: Contact info shown when authenticated
  GIVEN user is logged in
  WHEN viewing dispute details
  THEN contact info section shown with full details
```

#### Transaction History - Deletion Records

```
TEST: Deletion transaction displayed
  GIVEN user has content_deletion transaction
  WHEN viewing /transactions.html
  THEN deletion transaction shown
  AND displays CID, reason
  AND no balance change shown

TEST: Filter includes deletion type
  GIVEN transaction type filter exists
  WHEN viewing filter options
  THEN "Content Deletion" is an option

TEST: Deletion filter works
  GIVEN mix of transaction types
  WHEN filtering by "Content Deletion"
  THEN only deletion transactions shown
```

### Edge Case Tests

```
TEST: Dispute for content expiring soon
  GIVEN content expires in 1 hour
  WHEN dispute is filed
  THEN dispute is created
  AND dispute expires_at is 30 days from now (independent of content expiration)

TEST: Content expires with open dispute
  GIVEN content "cid123" has open dispute
  WHEN content expires
  THEN content becomes inaccessible
  AND dispute remains open
  AND dispute still visible in disputes list

TEST: Dispute expires same day as content expires
  GIVEN content expires in 30 days
  AND dispute filed today
  WHEN both expire
  THEN content is inaccessible
  AND dispute status is "closed_expired"

TEST: Dispute submitted with script injection
  GIVEN evidence contains <script>alert('xss')</script>
  WHEN dispute displayed
  THEN script is escaped/sanitized

TEST: Very long CID in dispute
  GIVEN CID is max length (94 chars)
  WHEN dispute created and displayed
  THEN UI handles gracefully (truncation/wrapping)

TEST: Unicode in evidence
  GIVEN evidence contains emoji and non-Latin text
  WHEN dispute created and displayed
  THEN text preserved correctly

TEST: Rapid dispute submission attempts
  GIVEN user submits dispute
  AND immediately submits again
  THEN second submission returns 409 DISPUTE_EXISTS
  AND no race condition creates duplicates

TEST: Delete during active dispute resolution
  GIVEN admin is reviewing dispute
  AND uploader deletes content
  THEN dispute is closed with uploader deletion note
  AND admin sees updated status

TEST: Admin deletes content then user tries to delete
  GIVEN admin deleted "cid123"
  WHEN uploader tries to delete
  THEN 410 ALREADY_DELETED

TEST: Uploader disputes then deletes own content
  GIVEN user_123 uploaded "cid123"
  AND user_123 filed dispute against "cid123"
  WHEN user_123 deletes "cid123"
  THEN content is deleted
  AND dispute is closed with "closed_deleted"
```

### Security Tests

```
TEST: IP hashing is one-way
  GIVEN dispute with submitter_ip_hash
  WHEN attacker accesses hash
  THEN original IP cannot be derived

TEST: Contact info not in unauthenticated list response
  GIVEN disputes with contact info
  WHEN GET /api/disputes without auth
  THEN no contact info in response

TEST: Contact info not in unauthenticated detail response
  GIVEN dispute with contact info
  WHEN GET /api/disputes/{id} without auth
  THEN no contact info in response

TEST: Contact info visible to authenticated users
  GIVEN dispute with contact info
  WHEN GET /api/disputes/{id} with auth
  THEN contact info included

TEST: Rate limiting prevents abuse
  GIVEN attacker submits disputes rapidly
  THEN rate limit kicks in after 10/hour
  AND subsequent requests blocked

TEST: Admin endpoint requires admin role
  GIVEN attacker knows admin endpoint
  AND attacker has valid user auth
  WHEN accessing admin endpoints
  THEN 403 NOT_ADMIN

TEST: Admin determined by env var only
  GIVEN ADMIN_USER_ID env var is "user_admin"
  WHEN "user_other" tries admin endpoints
  THEN 403 NOT_ADMIN

TEST: Cannot delete via GET request
  GIVEN valid delete URL
  WHEN accessed via GET
  THEN method not allowed or no action

TEST: CSRF protection on delete
  GIVEN delete request from different origin
  THEN CORS blocks or CSRF token required

TEST: Evidence URLs validated
  GIVEN evidence_url with javascript: protocol
  WHEN dispute submitted
  THEN 400 INVALID_EVIDENCE_URL

TEST: No SQL/NoSQL injection in evidence
  GIVEN evidence with injection attempt
  WHEN stored and retrieved
  THEN stored as literal string, no execution

TEST: Admin action log is append-only
  GIVEN existing admin actions
  WHEN attempting to modify past entries
  THEN modification fails
```

---

## Open Questions

All questions have been resolved. See "Resolved Design Decisions" table above.

---

## Follow-up Questions

1. **R2 cleanup job retention period**: Should there be a minimum time between soft delete and actual R2 deletion? (e.g., 24 hours for potential admin recovery, or immediate eligibility for next job run)

2. **Admin action log retention**: Should admin action logs be kept indefinitely, or is there a retention period?

3. **Dispute expiration job frequency**: Should the expiration job run daily (simpler, disputes may stay open up to ~24 hours past expiration) or hourly (more precise, higher cost)?

4. **Contact info for admin**: You mentioned contact info visible to logged-in users. Should admin see full contact info even when others see it? (Seems yes, but confirming admin has same view as regular authenticated users)

5. **Cache TTL for disputes list**: What should the cache duration be? Suggested: 5 minutes at edge, with `Last-Modified` / `If-Modified-Since` for conditional requests.

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
