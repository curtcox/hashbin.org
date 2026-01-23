# Content Lifecycle - Implementation Remaining

## Status

**Phase:** Phase 5 - Retention & Expiration Management
**Dependencies:** Planning complete (see `done/content_lifecycle.md`)

---

## Overview

Implement automated content lifecycle management:
1. Scheduled expiration jobs running daily
2. Automated content deletion from R2 and Durable Objects
3. Public deletion records for transparency

**Planning Status:** ✅ Complete - All design decisions made, zero ambiguity
**Foundation:** ✅ Implemented - Expiration tracking, validation, extension API working

---

## Implementation Phases

### Phase 1: Deletion Record Infrastructure 🔴

**Status:** Not started

**What's Needed:**

1. Create `DeletionRecord` Durable Object (`src/durable-objects/deletion-record.js`)
2. Implement deletion history storage
3. Create public API endpoints:
   - `GET /api/public/deletions` - List deletions (paginated)
   - `GET /api/public/deletions/{hash}` - Get specific deletion record
   - `GET /api/public/deletions/stats` - Deletion statistics
4. Add migration to `wrangler.toml`:
   ```toml
   [[durable_objects.bindings]]
   name = "DELETION_RECORD"
   class_name = "DeletionRecord"
   script_name = "hashbin-worker"
   ```
5. Hash uploader_id for privacy in public API

**Files to Create:**
- `src/durable-objects/deletion-record.js`
- `src/api/public-deletions.js` (or add to existing public API)

**Acceptance Criteria:**
- [ ] DeletionRecord DO created and configured
- [ ] Public API returns deletion records
- [ ] Pagination works correctly
- [ ] Statistics endpoint returns accurate counts
- [ ] Uploader IDs are hashed for privacy
- [ ] Tests pass (6 public deletion API tests)

---

### Phase 2: Content Deletion Logic 🔴

**Status:** Not started

**What's Needed:**

1. Create deletion service (`src/services/content-deletion.js`)
2. Implement hard delete logic:
   - Delete from R2 (skip for inline content)
   - Delete ContentMetadata DO entry
   - Create DeletionRecord
3. Handle inline content (no R2 deletion needed)
4. Idempotent deletion (safe to call multiple times)
5. Error handling and logging

**File to Create:**
- `src/services/content-deletion.js`

**Acceptance Criteria:**
- [ ] Hard delete removes R2 object
- [ ] Hard delete removes ContentMetadata
- [ ] Deletion record created for each deletion
- [ ] Inline content handled correctly (no R2 call)
- [ ] Idempotent (multiple calls safe)
- [ ] Errors logged and handled gracefully
- [ ] Tests pass (12 deletion logic tests)

---

### Phase 3: Scheduled Expiration Job 🔴

**Status:** Not started - Most complex phase

**What's Needed:**

#### 3.1 ExpirationIndex Durable Object

Create `ExpirationIndex` DO (`src/durable-objects/expiration-index.js`):
- Single global instance
- Maps dates to content hashes: `{ "2026-01-23": ["hash1", "hash2"] }`
- Methods:
  - `register(hash, expiresAt)` - Add to index
  - `unregister(hash, expiresAt)` - Remove from index (on extension)
  - `getExpired(date)` - Get hashes expiring on date
  - `updateExpiration(hash, oldDate, newDate)` - Move to new date bucket

#### 3.2 Integration with Upload/Extend APIs

Update APIs to register with ExpirationIndex:
- `POST /api/content/upload` - Register new content
- `POST /api/content/{cid}/extend` - Update expiration date
- `POST /api/balance/donate` - Update expiration date for recipient

#### 3.3 Cron Job Configuration

Add to `wrangler.toml`:
```toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 2 AM UTC
```

#### 3.4 Scheduled Handler Implementation

Update `src/index.js` scheduled handler (currently stub at lines 159-179):
```javascript
async function scheduled(event, env) {
  const today = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const index = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName("global"));
  const expiredHashes = await index.getExpired(today);

  let deleted = 0, skipped = 0, failed = 0;
  const BATCH_LIMIT = 5000;

  for (const hash of expiredHashes.slice(0, BATCH_LIMIT)) {
    try {
      // "Extension wins" check
      const metadata = await getContentMetadata(env, hash);
      if (metadata.expires_at > today) {
        skipped++;  // Was extended
        continue;
      }

      await deleteContent(env, hash, metadata, 'expired');
      deleted++;
    } catch (error) {
      failed++;
      console.error(`Failed to delete ${hash}:`, error);
    }
  }

  console.log(`Expiration job: ${deleted} deleted, ${skipped} skipped, ${failed} failed`);
}
```

**Files to Create/Modify:**
- `src/durable-objects/expiration-index.js` (new)
- `src/index.js` (update scheduled handler)
- `src/api/content.js` (add ExpirationIndex registration)
- `wrangler.toml` (add cron trigger, DO binding)

**Acceptance Criteria:**
- [ ] ExpirationIndex DO created and configured
- [ ] Upload/extend/donate APIs register with index
- [ ] Cron job runs daily at 2 AM UTC
- [ ] Batch processing respects 5,000 item limit
- [ ] "Extension wins" check validates before deletion
- [ ] Metrics logged (deleted, skipped, failed counts)
- [ ] Tests pass (19 ExpirationIndex + cron job tests)

---

### Phase 4: Public Records UI 🟡

**Status:** Not started - Optional UX enhancement

**What's Needed:**

1. Create `public/public-records.html` page
2. Display deletion history:
   - Table of deletions (hash, date, reason)
   - Filtering by date range, reason
   - Pagination controls
3. Statistics dashboard:
   - Total deletions
   - Deletions by reason
   - Recent deletion rate
4. Anonymous display (hashed uploader IDs)

**Files to Create:**
- `public/public-records.html`
- `public/js/public-records.js`
- `public/css/public-records.css`

**Acceptance Criteria:**
- [ ] Page displays deletion history
- [ ] Filtering works correctly
- [ ] Pagination works correctly
- [ ] Statistics accurate
- [ ] Mobile-friendly responsive design
- [ ] No private information exposed

**Note:** This is optional - API endpoints from Phase 1 provide transparency even without UI.

---

### Phase 5: Testing & Deployment 🟡

**Status:** Not started - depends on Phases 1-3

**What's Needed:**

1. Write all 57 tests from planning document
2. Validate batch deletion throughput (5,000 items in <30 seconds)
3. Monitor ExpirationIndex write performance during upload
4. Deploy to production
5. Monitor deletion job execution daily
6. Verify no performance impact

**Testing Scenarios:**
- 57 comprehensive tests (see `done/content_lifecycle.md` for full list)
- Performance benchmarks
- Production monitoring

**Acceptance Criteria:**
- [ ] All 57 tests written and passing
- [ ] Batch deletion completes in <30 seconds
- [ ] ExpirationIndex writes don't slow uploads
- [ ] Deployed to production
- [ ] Daily monitoring confirms deletions happening
- [ ] No performance degradation

---

## Priority

1. **Critical:** Phase 3 (Scheduled Expiration Job) - Core functionality
2. **Critical:** Phase 2 (Content Deletion Logic) - Required by Phase 3
3. **Critical:** Phase 1 (Deletion Records) - Required by Phase 2
4. **Medium:** Phase 5 (Testing & Deployment) - Validate everything works
5. **Low:** Phase 4 (Public UI) - Nice to have, API provides transparency

---

## Implementation Order

Must be done in sequence:
1. Phase 1: Deletion Record Infrastructure (enables Phase 2)
2. Phase 2: Content Deletion Logic (enables Phase 3)
3. Phase 3: Scheduled Expiration Job (core functionality)
4. Phase 5: Testing & Deployment (validate)
5. Phase 4: Public Records UI (optional enhancement)

---

## Design Reference

All design decisions, edge cases, and test scenarios are documented in `done/content_lifecycle.md`. This file contains:
- 10 key planning decisions
- 57 test scenarios
- Complete architecture
- Edge case handling
- "Extension wins" strategy details

**Important:** Read the planning document before implementing. Zero ambiguity, all questions answered.

---

## Estimated Effort

- Phase 1: 2-3 days
- Phase 2: 2-3 days
- Phase 3: 4-5 days (most complex)
- Phase 4: 2-3 days (optional)
- Phase 5: 3-4 days

**Total:** 10-15 days of implementation work

---

## References

- Planning document: `done/content_lifecycle.md`
- Master Plan: `todo/master_plan.md` (Phase 5)
- User Stories: `todo/user_stories.md`
- Foundation code: `src/durable-objects/content-metadata.js`, `src/api/content.js`

---

**Document Version:** 1.0
**Created:** 2026-01-23
**Last Updated:** 2026-01-23
**Status:** Ready for implementation - Planning complete
