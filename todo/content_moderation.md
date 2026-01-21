# Content Moderation: Dispute and Deletion System

## Overview

This plan describes the implementation of a content moderation system that allows:
1. Anyone to submit removal claims against content
2. Content owners to delete their own content
3. A single admin to delete any content via API
4. Transparent tracking of disputes and deletions

## Architecture Summary

### New Components
- **DisputeRecord** - Durable Object to store disputes (one per CID)
- **AdminConfig** - Durable Object to store admin user ID (singleton)
- **Dispute API** - Routes for creating/viewing disputes
- **Delete API** - Routes for owner and admin content deletion
- **Disputes List Page** - Public page showing all open disputes
- **Dispute Form** - Public form for submitting removal claims

### Modified Components
- **ContentMetadata** - Add `deleted_at`, `deleted_by`, `deletion_reason` fields
- **UserProfile** - Track deleted uploads separately
- **PaymentRecord** - Add `content_deletion` transaction type
- **CID Details Page** - Add dispute link and owner delete button

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
  resolved_by: string | null;  // "admin", "owner", "auto"
}

type DisputeStatus =
  | "open"           // Awaiting review
  | "under_review"   // Being actively reviewed
  | "closed_deleted" // Content was deleted
  | "closed_denied"  // Claim was rejected
  | "closed_expired" // Dispute expired without resolution

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

Maintains an index of all open disputes for efficient listing.

```typescript
interface DisputeIndex {
  open_disputes: {
    cid: string;
    dispute_id: string;
    claim_type: ClaimType;
    created_at: string;
  }[];
}
```

### AdminConfig (New Durable Object)

**Naming Convention**: `admin-config:global` (singleton)

```typescript
interface AdminConfig {
  admin_user_id: string;       // The single admin user ID
  created_at: string;
  updated_at: string;
}
```

### ContentMetadata Updates

Add fields to existing ContentMetadata:

```typescript
// New fields
deleted_at: string | null;     // ISO 8601 timestamp of deletion
deleted_by: string | null;     // User ID who deleted (or "admin")
deletion_reason: string | null; // "owner_request" | "admin_removal" | "dispute:{dispute_id}"
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

**Response (201 Created)**:
```json
{
  "success": true,
  "dispute": {
    "dispute_id": "disp_abc123",
    "cid": "abc123def456",
    "status": "open",
    "created_at": "2026-01-21T10:00:00Z"
  }
}
```

**Errors**:
- `400 BAD_REQUEST`: Invalid input
- `404 CID_NOT_FOUND`: CID does not exist
- `409 DISPUTE_EXISTS`: Open dispute already exists for this CID
- `410 CID_DELETED`: Content already deleted
- `429 RATE_LIMITED`: Too many disputes from this IP

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
      "created_at": "2026-01-21T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/disputes/{dispute_id}
Get details of a specific dispute.

**Authentication**: None required

**Response**:
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
    "contact": {
      "type": "email",
      "value": "rep***@example.com"  // Partially redacted
    }
  }
}
```

**Note**: Contact info is partially redacted in public responses.

#### GET /api/content/{cid}/disputes
Get disputes for a specific CID.

**Authentication**: None required

**Response**:
```json
{
  "disputes": [
    {
      "dispute_id": "disp_abc123",
      "status": "open",
      "claim_type": "copyright",
      "created_at": "2026-01-21T10:00:00Z"
    }
  ],
  "has_open_dispute": true
}
```

### Delete API

#### DELETE /api/content/{cid}
Delete content (owner or admin only).

**Authentication**: Required (owner or admin)

**Request Body (optional)**:
```json
{
  "reason": "No longer needed"
}
```

**Authorization Logic**:
1. If user is admin → allowed
2. If user uploaded this CID (CID in user's uploads list) → allowed
3. Otherwise → 403 Forbidden

**Response (200 OK)**:
```json
{
  "success": true,
  "deleted": {
    "cid": "abc123def456",
    "deleted_at": "2026-01-21T12:00:00Z",
    "deleted_by": "owner"
  }
}
```

**Side Effects**:
- Sets `deleted_at`, `deleted_by`, `deletion_reason` on ContentMetadata
- Deletes actual content from R2 storage
- Creates `content_deletion` transaction in PaymentRecord
- Closes any open disputes with status `closed_deleted`
- Updates DisputeIndex to remove from open disputes list
- Marks upload as deleted in UserProfile uploads list

**Errors**:
- `401 UNAUTHORIZED`: Not authenticated
- `403 FORBIDDEN`: Not owner or admin
- `404 NOT_FOUND`: CID does not exist
- `410 ALREADY_DELETED`: Content already deleted

#### POST /api/admin/content/{cid}/delete
Admin-only deletion with additional options.

**Authentication**: Required (admin only)

**Request Body**:
```json
{
  "reason": "Violation of terms",
  "dispute_id": "disp_abc123",  // Optional: link to dispute
  "notify_owner": true           // Optional: send deletion notice
}
```

**Response**: Same as DELETE /api/content/{cid}

**Errors**:
- `401 UNAUTHORIZED`: Not authenticated
- `403 NOT_ADMIN`: User is not admin

### Admin API

#### GET /api/admin/disputes
Get all disputes with full details (admin only).

**Authentication**: Required (admin only)

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

#### POST /api/admin/config
Set admin user ID (one-time setup or via environment variable).

**Authentication**: Requires `ADMIN_SETUP_KEY` environment variable

**Request Body**:
```json
{
  "admin_user_id": "user_abc123",
  "setup_key": "secret-setup-key"
}
```

---

## UI Components

### Dispute Submission Form (/disputes/submit.html)

**Fields**:
1. CID Input (text, required)
   - Auto-populated if accessed via `/disputes/submit.html?cid=xxx`
   - Validates CID exists and isn't deleted
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
  - "View Details" link

**Pagination**: Load more button, 50 per page

### CID Details Page Updates (/dashboard/uploads/detail.html)

**New Sections**:

1. **Dispute Notice Banner** (if open dispute exists)
   - Warning style (yellow/orange)
   - "This content has an open dispute"
   - Link to dispute details

2. **Dispute History Section** (if any disputes exist)
   - List of all disputes (open and closed)
   - Status badges
   - Links to dispute details

3. **Delete Button** (owner only)
   - Red danger button
   - Confirmation modal:
     - "Are you sure you want to delete this content?"
     - "This action cannot be undone."
     - Optional reason input
     - Cancel / Delete buttons
   - Only visible if current user is the uploader

**Delete Button Visibility Logic**:
```javascript
// Show delete button if:
// 1. User is authenticated
// 2. User's uploads list contains this CID
// 3. Content is not already deleted
const showDeleteButton = isAuthenticated &&
                         userUploads.includes(cid) &&
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
2. Create DisputeIndex Durable Object
3. Create AdminConfig Durable Object
4. Update ContentMetadata with deletion fields
5. Update PaymentRecord with deletion transaction type
6. Update UserProfile to track deleted uploads
7. Add bindings to wrangler.toml

### Phase 2: Dispute API
1. Implement POST /api/disputes
2. Implement GET /api/disputes
3. Implement GET /api/disputes/{dispute_id}
4. Implement GET /api/content/{cid}/disputes
5. Add rate limiting for dispute submission
6. Add validation helpers

### Phase 3: Delete API
1. Implement DELETE /api/content/{cid}
2. Implement ownership check logic
3. Implement admin check logic
4. Implement R2 content deletion
5. Implement dispute closure on deletion
6. Create deletion transaction records

### Phase 4: Admin API
1. Implement AdminConfig initialization
2. Implement admin authentication middleware
3. Implement GET /api/admin/disputes
4. Implement PATCH /api/admin/disputes/{dispute_id}
5. Implement POST /api/admin/content/{cid}/delete

### Phase 5: Frontend - Dispute Form
1. Create /disputes/submit.html
2. Create /frontend/js/dispute-submit.js
3. Add form validation
4. Add success/error handling
5. Add routing in index.js

### Phase 6: Frontend - Disputes List
1. Create /disputes/index.html
2. Create /frontend/js/disputes-list.js
3. Add filtering and pagination
4. Add routing in index.js

### Phase 7: Frontend - CID Details Updates
1. Add dispute banner component
2. Add dispute history section
3. Add delete button (owner only)
4. Add delete confirmation modal
5. Update detail.js

### Phase 8: Frontend - Transaction History Updates
1. Add content_deletion transaction display
2. Add filter option
3. Update transactions.js

### Phase 9: Integration Testing & Polish
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

TEST: Get dispute returns full data
  GIVEN an existing dispute
  WHEN GET /dispute is called
  THEN all dispute fields are returned
  AND contact info is included

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
```

#### DisputeIndex Durable Object

```
TEST: Add dispute to index
  GIVEN an empty index
  WHEN a dispute is added
  THEN open_disputes contains the dispute summary

TEST: Remove dispute from index on closure
  GIVEN an index with one dispute
  WHEN that dispute is closed
  THEN open_disputes is empty

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
```

#### AdminConfig Durable Object

```
TEST: Initialize admin config
  GIVEN no admin configured
  WHEN admin_user_id is set
  THEN admin_user_id is stored
  AND created_at is set

TEST: Get admin user ID
  GIVEN admin is configured
  WHEN admin user ID is requested
  THEN correct user ID returned

TEST: Check if user is admin - positive
  GIVEN admin_user_id is "user_123"
  WHEN checking "user_123"
  THEN returns true

TEST: Check if user is admin - negative
  GIVEN admin_user_id is "user_123"
  WHEN checking "user_456"
  THEN returns false

TEST: Prevent changing admin once set
  GIVEN admin is already configured
  WHEN attempting to change admin_user_id
  THEN 403 error with "ADMIN_ALREADY_SET"
  (OR requires special override mechanism)
```

#### ContentMetadata Updates

```
TEST: Mark content as deleted by owner
  GIVEN existing content owned by user_123
  WHEN deleted by user_123
  THEN deleted_at is set
  AND deleted_by is "user_123"
  AND deletion_reason is "owner_request"

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

TEST: Create dispute after previous closed
  GIVEN content "cid123" had closed dispute
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
```

#### GET /api/disputes/{dispute_id}

```
TEST: Get existing dispute
  GIVEN dispute "disp_123" exists
  WHEN GET /api/disputes/disp_123
  THEN full dispute returned
  AND contact is partially redacted

TEST: Get non-existent dispute
  GIVEN dispute "disp_fake" does not exist
  WHEN GET /api/disputes/disp_fake
  THEN 404 NOT_FOUND

TEST: Contact redaction works
  GIVEN dispute with email "test@example.com"
  WHEN GET /api/disputes/{id}
  THEN contact.value is "tes***@example.com" or similar
```

#### GET /api/content/{cid}/disputes

```
TEST: Get disputes for CID with disputes
  GIVEN "cid123" has 2 disputes (1 open, 1 closed)
  WHEN GET /api/content/cid123/disputes
  THEN both disputes returned
  AND has_open_dispute is true

TEST: Get disputes for CID without disputes
  GIVEN "cid456" has no disputes
  WHEN GET /api/content/cid456/disputes
  THEN disputes is empty array
  AND has_open_dispute is false

TEST: Get disputes for non-existent CID
  GIVEN "fake123" does not exist
  WHEN GET /api/content/fake123/disputes
  THEN 404 CID_NOT_FOUND
```

#### DELETE /api/content/{cid}

```
TEST: Owner can delete own content
  GIVEN user_123 uploaded "cid123"
  AND user_123 is authenticated
  WHEN DELETE /api/content/cid123
  THEN 200 success
  AND content is marked deleted
  AND deletion transaction created

TEST: Non-owner cannot delete content
  GIVEN user_123 uploaded "cid123"
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

TEST: Delete removes content from R2
  GIVEN "cid123" has content in R2
  WHEN DELETE /api/content/cid123
  THEN R2 object is deleted
  AND metadata retained with deleted_at

TEST: Delete creates transaction record
  GIVEN user_123 deletes "cid123"
  WHEN viewing transaction history
  THEN "content_deletion" transaction exists
  AND transaction has cid, reason

TEST: Delete updates user uploads list
  GIVEN user_123 has "cid123" in uploads
  WHEN DELETE /api/content/cid123
  THEN uploads list marks "cid123" as deleted
  (or moves to deleted_uploads)
```

#### Admin API Tests

```
TEST: Admin can list all disputes with full details
  GIVEN admin is authenticated
  WHEN GET /api/admin/disputes
  THEN all disputes returned
  AND contact info not redacted

TEST: Non-admin cannot access admin disputes
  GIVEN regular user is authenticated
  WHEN GET /api/admin/disputes
  THEN 403 NOT_ADMIN

TEST: Admin can update dispute status
  GIVEN admin is authenticated
  AND dispute "disp_123" is open
  WHEN PATCH /api/admin/disputes/disp_123 {status: "closed_denied"}
  THEN dispute status updated

TEST: Admin can delete with dispute linkage
  GIVEN admin is authenticated
  AND dispute "disp_123" exists for "cid123"
  WHEN POST /api/admin/content/cid123/delete {dispute_id: "disp_123"}
  THEN content deleted
  AND dispute closed with deletion reference

TEST: Non-admin cannot use admin delete endpoint
  GIVEN regular user is authenticated
  WHEN POST /api/admin/content/cid123/delete
  THEN 403 NOT_ADMIN
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
```

#### Disputes List Page

```
TEST: Displays open disputes
  GIVEN 5 open disputes exist
  WHEN page loads
  THEN 5 dispute cards displayed

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
```

#### CID Details Page - Delete Button

```
TEST: Delete button shown for owner
  GIVEN user_123 is logged in
  AND user_123 uploaded "cid123"
  WHEN viewing /dashboard/uploads/cid123/
  THEN delete button is visible

TEST: Delete button hidden for non-owner
  GIVEN user_456 is logged in
  AND user_123 uploaded "cid123"
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
  (content expiration should be handled separately)

TEST: Content expires with open dispute
  GIVEN content "cid123" has open dispute
  WHEN content expires
  THEN content becomes inaccessible
  AND dispute remains open
  (dispute resolution needed for record-keeping)

TEST: Multiple users claim same CID
  GIVEN "cid123" uploaded by user_123
  AND user_456 also has "cid123" in uploads (collision)
  WHEN user_456 tries to delete
  THEN ownership determined by original uploader timestamp
  OR both can delete their reference

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
  AND owner deletes content
  THEN dispute is closed with owner deletion note
  AND admin sees updated status

TEST: Admin deletes content then user tries to delete
  GIVEN admin deleted "cid123"
  WHEN owner tries to delete
  THEN 410 ALREADY_DELETED
```

### Security Tests

```
TEST: IP hashing is one-way
  GIVEN dispute with submitter_ip_hash
  WHEN attacker accesses hash
  THEN original IP cannot be derived

TEST: Contact info not leaked in list endpoint
  GIVEN disputes with contact info
  WHEN GET /api/disputes (list)
  THEN no contact info in response

TEST: Rate limiting prevents abuse
  GIVEN attacker submits disputes rapidly
  THEN rate limit kicks in after 10/hour
  AND subsequent requests blocked

TEST: Admin endpoint requires admin role
  GIVEN attacker knows admin endpoint
  AND attacker has valid user auth
  WHEN accessing admin endpoints
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
```

---

## Open Questions

### Business Logic Questions

1. **What happens when content expires with an open dispute?**
   - Option A: Dispute remains open for record-keeping, content becomes inaccessible
   - Option B: Dispute auto-closes with status "closed_expired"
   - Option C: Content expiration is paused while dispute is open

2. **Can a user file a dispute against their own content?**
   - Option A: Yes, no restrictions (they can just delete it anyway)
   - Option B: No, owner disputes blocked (just delete instead)
   - Current assumption: Option B

3. **Should there be a time limit for dispute resolution?**
   - Option A: Disputes auto-expire after X days
   - Option B: Disputes remain open indefinitely until resolved
   - If auto-expire, what's the duration?

4. **Can a new dispute be filed after a previous one was denied?**
   - Option A: Yes, allows new evidence
   - Option B: No, prevents harassment
   - Option C: Yes, but rate-limited (e.g., one per month)
   - Current assumption: Option A (allowed)

5. **Should deleted content metadata be purged after some time?**
   - Option A: Keep indefinitely for audit trail
   - Option B: Purge after X days/months
   - Current assumption: Keep indefinitely

### Admin Questions

6. **How is the admin user initially set?**
   - Option A: Environment variable `ADMIN_USER_ID`
   - Option B: First user to claim admin via setup key
   - Option C: Both (env var takes precedence, fallback to setup)

7. **Can there be multiple admins in the future?**
   - Current spec says single admin. Is this permanent?
   - Should we design for future multi-admin support?

8. **Should admin actions be logged separately?**
   - For audit trail and accountability
   - Separate admin action log vs. regular transaction log?

### Technical Questions

9. **How should R2 content deletion work?**
   - Option A: Immediate hard delete
   - Option B: Soft delete with retention period
   - Option C: Move to "deleted" bucket for potential recovery

10. **Should dispute contact info be stored encrypted?**
    - Privacy consideration for sensitive contact info
    - Adds complexity but improves security

11. **How to handle CID collisions (same CID uploaded by multiple users)?**
    - Unlikely due to content-addressing, but possible
    - Who is the "owner" for deletion rights?

12. **Should the disputes list page be cached?**
    - Could reduce load on DisputeIndex
    - What cache invalidation strategy?

### UX Questions

13. **Should the dispute form require CAPTCHA?**
    - To prevent automated abuse
    - Adds friction for legitimate users

14. **What information should be shown to content owner about disputes?**
    - Full dispute details?
    - Just existence of dispute?
    - Should owner be notified?

15. **Should there be email notifications for disputes?**
    - Notify owner when dispute filed?
    - Notify submitter when resolved?
    - Requires email infrastructure

16. **How should the dispute form be accessed?**
    - Link on every CID page?
    - Dedicated route only?
    - Both?

---

## Dependencies

- Cloudflare Workers Durable Objects (existing)
- Cloudflare R2 for content storage (existing)
- Clerk authentication (existing)
- No new external dependencies required

---

## Success Criteria

1. Users can submit disputes with required evidence and contact info
2. Open disputes are publicly visible in a list
3. CID details pages show related disputes
4. Content owners can delete their own content via UI
5. Admin can delete any content via API
6. Deletions create transaction records visible to owners
7. Deletions close related disputes while preserving records
8. All edge cases have defined behavior with passing tests
9. No security vulnerabilities in dispute/delete flow
