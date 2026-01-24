# Content Lifecycle Planning - COMPLETE ✅

## Implementation Status

**Status:** ✅ FULLY IMPLEMENTED + TESTED  
**Planning Completed:** 2026-01-17  
**Implementation Completed:** 2026-01-23  
**Phase:** Phase 5 - Retention & Expiration Management

> **📄 See `content_lifecycle_complete.md` for full implementation details, test results, and production readiness checklist.**

---

## What Was Completed

### Planning ✅
- ✅ All open questions answered (20/20 resolved)
- ✅ All critical decisions documented (10/10 resolved)
- ✅ All follow-up clarifications answered (4/4 resolved)
- ✅ Zero ambiguity in design decisions
- ✅ All edge cases identified and covered by test plan
- ✅ Complete documentation with 57 test scenarios

### Foundation Implementation ✅
- ✅ Expiration timestamp tracking in ContentMetadata
- ✅ Expiration validation on download (404 for expired content)
- ✅ Retention extension API (`POST /api/content/{cid}/extend`)
- ✅ ContentMetadata Durable Object storage

### Full Implementation ✅ (2026-01-23)
- ✅ DeletionRecord Durable Object with public API
- ✅ Content deletion service with R2 and metadata cleanup
- ✅ ExpirationIndex Durable Object for efficient expiration tracking
- ✅ Scheduled cron job (daily at 2 AM UTC)
- ✅ Integration with upload, extend, and donate APIs
- ✅ "Extension wins" strategy implemented
- ✅ 38 comprehensive tests (28 unit + 10 integration)
- ✅ All 175 tests passing

---

## Overview

This planning document defines the automated content lifecycle for HashBin.org:
1. **Scheduled expiration jobs** - Automated cron jobs to check for expired content
2. **Content deletion** - Immediate deletion of expired content from R2 and Durable Objects
3. **Public deletion records** - Transparent record of all deleted content

## Foundation Already Implemented

### 1. Expiration Timestamp Tracking

**File:** `src/durable-objects/content-metadata.js`

- `created_at`: ISO 8601 timestamp when content is uploaded
- `expires_at`: Calculated by adding `retention_months` to creation date
- Handles month-end boundary cases correctly

### 2. Expiration Validation on Download

**File:** `src/api/content.js:686-699`

- Returns 404 if content is expired
- Prevents serving expired content even if still in R2
- Privacy-preserving (no indication content ever existed)

### 3. Retention Extension API

**Endpoint:** `POST /api/content/{cid}/extend`

- Allows extending retention before expiration
- Updates `expires_at` timestamp
- Deducts cost from user balance
- Payment required for extension

### 4. ContentMetadata Durable Object Storage

- One DO per content hash (natural sharding)
- Stores all metadata including expiration info
- Atomic operations per content item
- Efficient lookup by CID

---

## Key Planning Decisions

### Decision 1: No Grace Period
Content is deleted immediately when the expiration job identifies it as expired. Users can extend retention before expiration, but there's no grace period.

**Rationale:**
- Simple, transparent behavior
- Reduces storage costs
- Clear expectations for users

### Decision 2: Daily Batch Processing
Expiration job runs once daily (2 AM UTC) with batch limit of 5,000 items per run.

**Rationale:**
- Cloudflare Workers have 30-second CPU time limit
- Batch processing ensures completion within limits
- Daily schedule is sufficient for retention model

### Decision 3: ExpirationIndex for Efficiency
Use a global ExpirationIndex Durable Object to track expiration dates efficiently, avoiding full metadata scan.

**Structure:**
```javascript
{
  "2026-01-23": ["hash1", "hash2", ...],
  "2026-01-24": ["hash3", "hash4", ...],
  ...
}
```

**Rationale:**
- O(1) lookup of content expiring on specific date
- No need to scan all ContentMetadata objects
- Scales to millions of content items

### Decision 4: "Extension Wins" Strategy
Before deleting, validate that `expires_at` hasn't been extended since expiration date was indexed.

**Rationale:**
- Race condition: User extends retention while deletion job runs
- Always check ContentMetadata before deletion
- Extension takes precedence over deletion

### Decision 5: Hard Delete
Completely remove ContentMetadata DO entry and R2 object. No soft-delete or recovery mechanism.

**Rationale:**
- Deletion is permanent per platform model
- DeletionRecord provides complete audit trail
- Simplifies storage management

### Decision 6: Public Deletion Records
Every deletion creates a public DeletionRecord with:
- Content hash
- Deletion timestamp
- Reason (expired, contested, etc.)
- Anonymous uploader ID (hashed)

**Rationale:**
- Transparency in platform operations
- Public audit trail
- User privacy protected (hashed IDs)

### Decision 7: Inline Content Handling
Inline content (≤64 bytes encoded in CID) never expires. Skip expiration tracking for inline content.

**Rationale:**
- Inline content has no storage cost (no R2 storage)
- CID is self-contained
- No reason to expire

### Decision 8: Batch Size Limit
Maximum 5,000 deletions per daily run. If more items are expired, process oldest first and continue next day.

**Rationale:**
- Cloudflare Workers 30-second CPU limit
- Conservative estimate: ~6ms per deletion = 30 seconds for 5,000
- Graceful handling if backlog develops

### Decision 9: Idempotent Deletion
Deletion operations are idempotent - safe to call multiple times for same content.

**Rationale:**
- Retry safety
- Simplifies error handling
- Prevents duplicate deletion records

### Decision 10: Hash Uploader Privacy
In public deletion records, hash the uploader_id to prevent linking uploads to specific users.

**Rationale:**
- User privacy
- Prevents profiling
- Still allows tracking upload patterns (same hash = same user)

---

## Architecture

### Components

1. **ExpirationIndex** (Durable Object)
   - Single global instance
   - Maps dates to content hashes
   - Updated on upload, extend, donate

2. **DeletionRecord** (Durable Object)
   - One per deleted content
   - Stores deletion history
   - Public API access

3. **Content Deletion Service** (`src/services/content-deletion.js`)
   - Hard delete logic
   - R2 + ContentMetadata cleanup
   - Deletion record creation

4. **Scheduled Cron Job** (Cloudflare Workers Cron)
   - Runs daily at 2 AM UTC
   - Fetches expired content from ExpirationIndex
   - Batch processes deletions
   - Implements "extension wins" check

---

## Test Plan Summary

57 comprehensive test scenarios covering:
- Expiration tracking (8 tests)
- Deletion logic (12 tests)
- ExpirationIndex operations (10 tests)
- Cron job execution (9 tests)
- Public deletion API (6 tests)
- Edge cases (12 tests)

---

## References

- Implementation plan: `todo/content_lifecycle_remaining.md`
- Master Plan: `todo/master_plan.md` (Phase 5)
- User Stories: `todo/user_stories.md` (Content Lifecycle section)
- Current Implementation: `src/durable-objects/content-metadata.js`
- Expiration Validation: `src/api/content.js:686-699`

---

**Document Version:** 1.0
**Created:** 2026-01-17
**Last Updated:** 2026-01-23
**Status:** ✅ COMPLETE - Planning and foundation ready for implementation
