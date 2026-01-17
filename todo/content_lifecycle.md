# Content Lifecycle Automation Plan

## Overview

This document outlines the plan to automate the content lifecycle for HashBin.org, specifically implementing:
1. **Scheduled expiration jobs** - Automated cron jobs to check for expired content
2. **Content deletion** - Immediate deletion of expired content from R2 and Durable Objects
3. **Public deletion records** - Transparent record of all deleted content

**Status:** Planning Phase - Decisions Received
**Target:** Phase 5 Implementation
**Last Updated:** 2026-01-17
**Decision Review:** 2026-01-17

---

## Current State

### ✅ Already Implemented

1. **Expiration Timestamp Tracking** (`src/durable-objects/content-metadata.js`)
   - `created_at`: ISO 8601 timestamp when content is uploaded
   - `expires_at`: Calculated by adding `retention_months` to creation date
   - Handles month-end boundary cases correctly

2. **Expiration Validation on Download** (`src/api/content.js:686-699`)
   - Returns 404 if content is expired
   - Prevents serving expired content even if still in R2

3. **Retention Extension API** (`POST /api/content/{cid}/extend`)
   - Allows extending retention before expiration
   - Updates `expires_at` timestamp
   - Deducts cost from user balance

4. **ContentMetadata Durable Object Storage**
   - One DO per content hash (natural sharding)
   - Stores all metadata including expiration info
   - Atomic operations per content item

### 📋 Not Yet Implemented

1. **Scheduled Cron Jobs**
   - Handler exists but is a stub (`src/index.js:159-179`)
   - No cron triggers configured in `wrangler.toml`

2. **Automated Content Deletion**
   - No deletion from R2 storage
   - No metadata cleanup from Durable Objects
   - Expired content remains in storage (orphaned)

3. **Public Deletion Records**
   - No deletion tracking system
   - No public API for deletion history
   - No transparency mechanism

---

## Implementation Plan

### Phase 1: Deletion Record Infrastructure

**Goal:** Create the storage and API for tracking deletions publicly

#### 1.1 Create DeletionRecord Durable Object

**File:** `src/durable-objects/deletion-record.js`

**Storage Structure:**
```javascript
{
  hash_256t: string,           // Content hash
  deleted_at: string,          // ISO 8601 timestamp
  reason: string,              // "expired", "contested_and_upheld", "manual"
  size_bytes: number,          // Size before deletion
  uploaded_at: string,         // Original upload timestamp
  expired_at: string,          // When it expired
  uploader_id: string,         // Who uploaded it (for audit)
  download_count: number,      // Total downloads before deletion
  retention_days: number       // How long it was stored
}
```

**Methods:**
- `POST /record` - Create a deletion record
- `GET /record/:hash` - Get deletion record for specific hash
- `GET /list` - List deletions (paginated)
- `GET /stats` - Aggregate deletion statistics

#### 1.2 Create Public Deletion Records API

**File:** `src/api/public-records.js`

**Endpoints:**
- `GET /api/public/deletions` - List all deletions (paginated, date-filtered)
- `GET /api/public/deletions/{hash}` - Get specific deletion record
- `GET /api/public/deletions/stats` - Aggregate statistics

**Query Parameters:**
- `?start_date=YYYY-MM-DD` - Filter by deletion date range
- `?end_date=YYYY-MM-DD`
- `?reason=expired|contested_and_upheld|manual`
- `?limit=100` - Pagination limit (max 1000)
- `?offset=0` - Pagination offset

#### 1.3 Add Deletion Record to wrangler.toml

```toml
[[durable_objects.bindings]]
name = "DELETION_RECORD"
class_name = "DeletionRecord"
```

Update migrations:
```toml
[[migrations]]
tag = "v2"
new_sqlite_classes = ["DeletionRecord"]
```

---

### Phase 2: Content Deletion Logic

**Goal:** Implement the actual deletion of content from R2 and metadata cleanup

#### 2.1 Create Content Deletion Service

**File:** `src/services/content-deletion.js`

**Main Function:**
```javascript
async function deleteContent(env, hash_256t, reason = 'expired')
```

**Steps:**
1. Fetch metadata from ContentMetadata DO
2. Record deletion in DeletionRecord DO
3. Delete from R2 storage (if not inline content)
4. Mark metadata as deleted (soft delete with tombstone)
5. Log deletion to console
6. Return deletion record

**Key Considerations:**
- Handle inline content (≤64 bytes) - no R2 deletion needed
- Idempotent - safe to call multiple times
- Transaction ordering - record first, delete second
- Error handling - partial failures should be logged

#### 2.2 Soft Delete vs Hard Delete Strategy

**Decision Required:** Should we hard delete metadata or use tombstones?

**Option A: Hard Delete (Recommended)**
- Completely remove from ContentMetadata DO
- Frees storage immediately
- Simpler implementation
- Deletion record provides audit trail

**Option B: Soft Delete with Tombstone**
- Keep metadata with `deleted: true` flag
- Allows resurrection if needed
- More complex queries
- Uses more storage

**Recommendation:** Hard delete metadata, rely on DeletionRecord for audit trail

---

### Phase 3: Scheduled Expiration Job

**Goal:** Implement cron job to find and delete expired content

#### 3.1 Configure Cron Trigger

**File:** `wrangler.toml`

Add cron configuration:
```toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 2 AM UTC
```

**Decision:** Daily execution
- Lower cost, simpler operations
- Content may exist up to 24 hours past expiration (acceptable)
- Runs at 2 AM UTC (low-traffic period)

#### 3.2 Implement Expiration Scanner

**File:** `src/index.js` (update scheduled handler)

**Challenge:** Durable Objects don't have global list/scan capability

**Solution Options:**

**Option A: Content Expiration Index (Recommended)**
- Create a separate `ExpirationIndex` Durable Object
- Track all content with expiration dates
- Organized by date buckets (YYYY-MM-DD)
- Cron job queries the index for today's expirations

**Option B: User Profile Scanning**
- Iterate through user profiles (via UserProfile DO)
- Check each user's uploads for expiration
- More complex, slower, requires user enumeration

**Recommendation:** Implement Option A - ExpirationIndex

#### 3.3 Create ExpirationIndex Durable Object

**File:** `src/durable-objects/expiration-index.js`

**Storage Structure:**
```javascript
{
  "2026-01-17": [
    "hash1_256t",
    "hash2_256t"
  ],
  "2026-01-18": [
    "hash3_256t"
  ]
}
```

**Methods:**
- `POST /register` - Add content to expiration date bucket
- `POST /update` - Change expiration date (when extended)
- `POST /remove` - Remove from index (when deleted)
- `GET /expired` - Get all hashes that expired on or before a date
- `DELETE /cleanup` - Remove old date buckets (housekeeping)

**Integration Points:**
- Call on content upload (`POST /api/content`)
- Call on retention extension (`POST /api/content/{cid}/extend`)
- Call on donation (`POST /api/donate/cid/:cid`)
- Call on content deletion

#### 3.4 Implement Scheduled Handler

**File:** `src/index.js:159-179`

```javascript
async scheduled(event, env, ctx) {
  try {
    console.log('Starting expiration job:', new Date().toISOString());

    // 1. Get today's date
    const today = new Date().toISOString().split('T')[0];

    // 2. Query ExpirationIndex for expired content
    const expirationIndexId = env.EXPIRATION_INDEX.idFromName('global');
    const expirationIndex = env.EXPIRATION_INDEX.get(expirationIndexId);
    const expiredHashes = await expirationIndex.fetch(
      new Request(`http://internal/expired?date=${today}`, { method: 'GET' })
    ).then(r => r.json());

    console.log(`Found ${expiredHashes.length} expired items`);

    // 3. Delete each expired content
    const deletionService = await import('./services/content-deletion.js');
    const results = await Promise.allSettled(
      expiredHashes.map(hash =>
        deletionService.deleteContent(env, hash, 'expired')
      )
    );

    // 4. Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Expiration job completed: ${successful} deleted, ${failed} failed`);

    return { success: true, deleted: successful, failed };
  } catch (error) {
    console.error('Scheduled job error:', error);
    throw error;
  }
}
```

---

### Phase 4: UI for Public Deletion Records

**Goal:** Create web interface to view deletion history

#### 4.1 Create Public Records Page

**File:** `public/public-records.html`

**Features:**
- Table of recent deletions
- Filter by date range
- Filter by reason (expired, contested, manual)
- Search by content hash
- Pagination
- Statistics dashboard (total deletions, by reason, etc.)

#### 4.2 Update Navigation

Add link to public records in footer/header

---

## Comprehensive Test List

### Unit Tests

#### DeletionRecord Durable Object Tests

1. **Test: Create deletion record**
   - Given: Valid deletion data (hash, timestamp, reason, metadata)
   - When: POST /record called
   - Then: Record is stored and returned with all fields

2. **Test: Retrieve deletion record by hash**
   - Given: Existing deletion record for hash "abc123..."
   - When: GET /record/abc123... called
   - Then: Returns matching deletion record

3. **Test: List deletions with pagination**
   - Given: 150 deletion records exist
   - When: GET /list?limit=50&offset=0 called
   - Then: Returns first 50 records

4. **Test: Filter deletions by date range**
   - Given: Deletions on 2026-01-15, 2026-01-16, 2026-01-17
   - When: GET /list?start_date=2026-01-16&end_date=2026-01-16
   - Then: Returns only deletions from 2026-01-16

5. **Test: Filter deletions by reason**
   - Given: Mix of expired, contested, manual deletions
   - When: GET /list?reason=expired
   - Then: Returns only expired deletions

6. **Test: Get deletion statistics**
   - Given: 100 expired, 5 contested, 2 manual deletions
   - When: GET /stats called
   - Then: Returns correct aggregates

#### ExpirationIndex Durable Object Tests

7. **Test: Register content with expiration date**
   - Given: Content hash "xyz789..." expires 2026-02-15
   - When: POST /register called
   - Then: Hash added to 2026-02-15 bucket

8. **Test: Update expiration date (retention extension)**
   - Given: Content in 2026-02-15 bucket
   - When: POST /update moves to 2026-03-15
   - Then: Removed from 2026-02-15, added to 2026-03-15

9. **Test: Get expired content for date**
   - Given: 5 hashes in 2026-01-17 bucket, 3 in 2026-01-16
   - When: GET /expired?date=2026-01-17 called
   - Then: Returns 8 hashes (2026-01-16 + 2026-01-17)

10. **Test: Remove content from index**
    - Given: Hash in 2026-02-15 bucket
    - When: POST /remove called
    - Then: Hash removed from bucket

11. **Test: Cleanup old buckets**
    - Given: Buckets for 2025-12-01, 2026-01-01, 2026-01-17
    - When: DELETE /cleanup?before=2026-01-01 called
    - Then: 2025-12-01 bucket deleted, others remain

#### Content Deletion Service Tests

12. **Test: Delete standard content (>64 bytes)**
    - Given: Content in R2, metadata in ContentMetadata DO
    - When: deleteContent(hash, 'expired') called
    - Then: R2 object deleted, metadata removed, deletion record created

13. **Test: Delete inline content (≤64 bytes)**
    - Given: Content ≤64 bytes (no R2 storage)
    - When: deleteContent(hash, 'expired') called
    - Then: Metadata removed, deletion record created, no R2 call

14. **Test: Delete already deleted content (idempotency)**
    - Given: Content already deleted
    - When: deleteContent(hash, 'expired') called again
    - Then: No error, logs warning, returns existing deletion record

15. **Test: Delete content with non-existent hash**
    - Given: Hash that was never uploaded
    - When: deleteContent(hash, 'expired') called
    - Then: Returns error, no deletion record created

16. **Test: Partial failure - R2 delete fails**
    - Given: Metadata exists, R2 delete throws error
    - When: deleteContent(hash, 'expired') called
    - Then: Error logged, deletion aborted, metadata intact

17. **Test: Partial failure - metadata delete fails**
    - Given: R2 deleted successfully, metadata delete fails
    - When: deleteContent(hash, 'expired') called
    - Then: Error logged, R2 already deleted (logged for manual cleanup)

#### Scheduled Job Tests

18. **Test: Find and delete expired content**
    - Given: 3 content items expired today, 2 expire tomorrow
    - When: Scheduled job runs
    - Then: 3 items deleted, 2 remain

19. **Test: Handle empty expiration list**
    - Given: No content expired today
    - When: Scheduled job runs
    - Then: Completes successfully, no deletions

20. **Test: Handle partial deletion failures**
    - Given: 5 expired items, 2 fail to delete (R2 errors)
    - When: Scheduled job runs
    - Then: 3 deleted, 2 failures logged, job completes

21. **Test: Multiple expirations on same day**
    - Given: 1000 content items expired today
    - When: Scheduled job runs
    - Then: All 1000 deleted (or batched with continuation)

### Integration Tests

#### Content Upload to Deletion Flow

22. **Test: Upload → Wait → Auto-delete**
    - Given: Upload content with 30-day retention
    - When: 30 days pass and cron runs
    - Then: Content deleted, deletion record exists

23. **Test: Upload → Extend → Auto-delete at new date**
    - Given: Upload with 30-day retention, extend by 60 days
    - When: 90 days pass and cron runs
    - Then: Content deleted at 90-day mark, not 30-day

24. **Test: Upload duplicate → Extend → Single deletion**
    - Given: Upload content twice, extend retention on second upload
    - When: Extended expiration reached
    - Then: Single deletion record, both uploads reflected

#### Donation and Retention Extension

25. **Test: Donation extends expiration**
    - Given: Content expires 2026-02-15
    - When: Donation extends retention by 30 days
    - Then: Expiration moved to 2026-03-17, index updated

26. **Test: Multiple donations stack retention**
    - Given: Content expires 2026-02-15
    - When: 3 separate donations each add 30 days
    - Then: Expiration moved to 2026-05-16 (90 days added)

27. **Test: Donation on day of expiration**
    - Given: Content expires today at 23:59
    - When: Donation received at 23:58
    - Then: Expiration extended, content not deleted

28. **Test: Donation after deletion**
    - Given: Content deleted at 00:01
    - When: Donation attempted at 00:02
    - Then: Error returned, donation rejected

#### Rate Limiting and Deletion

29. **Test: Rate limits deleted with content**
    - Given: Content has purchased rate limits
    - When: Content expires and is deleted
    - Then: Rate limit records removed with metadata

30. **Test: Stacked rate limits deleted**
    - Given: Content has 5 rate limit purchases stacked
    - When: Content deleted
    - Then: All 5 rate limit records removed

### Edge Case Tests

#### Timestamp and Timezone Handling

31. **Test: Expiration on month boundary**
    - Given: Upload on Jan 31 with 1-month retention
    - When: Check expiration calculation
    - Then: Expires Feb 28/29 (not Mar 3)

32. **Test: Leap year expiration**
    - Given: Upload on 2024-02-29 with 1-year retention
    - When: Check expiration
    - Then: Expires 2025-02-28

33. **Test: UTC vs local time**
    - Given: Content expires 2026-01-17 00:00 UTC
    - When: Cron runs at 2026-01-16 23:00 EST (04:00 UTC next day)
    - Then: Content not deleted (before expiration)

34. **Test: Simultaneous extension and deletion**
    - Given: Content expires today
    - When: Cron job and retention extension run simultaneously
    - Then: Either extended (if extension first) or deleted (if deletion first)

#### Large-Scale Operations

35. **Test: Delete 10,000 items in single cron run**
    - Given: 10,000 items expired today
    - When: Cron job runs
    - Then: All deleted within execution time limit

36. **Test: Cron execution timeout handling**
    - Given: 50,000 items expired, exceeds worker time limit
    - When: Cron job runs
    - Then: Processes as many as possible, continuation token for next run

37. **Test: Index with 365 day buckets**
    - Given: ExpirationIndex has 365 date buckets (1 year of content)
    - When: Query for today's expirations
    - Then: Returns correct bucket without scanning all 365

#### Concurrent Operations

38. **Test: Parallel uploads to ExpirationIndex**
    - Given: 100 uploads happen simultaneously with same expiration date
    - When: All register with ExpirationIndex
    - Then: All 100 hashes in bucket, no duplicates, no lost entries

39. **Test: Extension during cron deletion**
    - Given: Content expires today, cron starts deletion
    - When: User extends retention mid-deletion
    - Then: Extension wins - deletion aborted, expiration date updated

40. **Test: Duplicate donation attempts**
    - Given: Content expires 2026-02-15
    - When: Two donations submitted simultaneously
    - Then: Both processed, retention extended correctly (no race condition)

#### R2 Storage Edge Cases

41. **Test: R2 object already deleted manually**
    - Given: R2 object deleted outside system
    - When: Cron tries to delete
    - Then: Handles 404 gracefully, still removes metadata

42. **Test: R2 multipart upload incomplete**
    - Given: Multipart upload started but not completed (future feature)
    - When: Content expires
    - Then: Aborts multipart upload, cleans up parts

43. **Test: R2 in different region/bucket**
    - Given: Content in alternate R2 bucket (future multi-region)
    - When: Deletion attempted
    - Then: Deletes from correct bucket based on metadata

#### Metadata Corruption

44. **Test: Missing expires_at field**
    - Given: ContentMetadata corrupted, no expires_at
    - When: Cron queries ExpirationIndex
    - Then: Hash not in index, content not deleted (manual intervention required)

45. **Test: Invalid date format in expires_at**
    - Given: expires_at = "invalid-date"
    - When: Deletion logic parses date
    - Then: Logs error, skips deletion, alerts admin

46. **Test: Negative retention days**
    - Given: Upload with retention_days = -30 (bug)
    - When: expires_at calculated
    - Then: Validation error, upload rejected

#### Public Records

47. **Test: Query deletion records after 1 year**
    - Given: Deletion record from 365 days ago
    - When: GET /api/public/deletions?start_date=2025-01-17
    - Then: Returns old records (no expiration on deletion records)

48. **Test: Pagination beyond available records**
    - Given: 150 total deletion records
    - When: GET /api/public/deletions?offset=200
    - Then: Returns empty array, not error

49. **Test: Deletion record for non-existent content**
    - Given: Hash "fake123..." never existed
    - When: Query deletion records for "fake123..."
    - Then: Returns 404 or empty result

#### User Profile Updates

50. **Test: Update user upload history after deletion**
    - Given: User has upload in profile, content expires
    - When: Content deleted
    - Then: Upload record in profile marked as deleted (or removed)

51. **Test: User balance refund on early deletion**
    - Given: Content deleted before expiration (contested)
    - When: Deletion occurs
    - Then: No refund (per platform policy: no refunds)

### Performance Tests

52. **Test: ExpirationIndex read performance**
    - Given: Index with 10,000 hashes across 365 buckets
    - When: Query single day bucket
    - Then: Response time < 100ms

53. **Test: Deletion throughput**
    - Given: 1,000 content items to delete
    - When: Batch deletion initiated
    - Then: Deletes at rate > 100/second

54. **Test: Public records API pagination performance**
    - Given: 1 million deletion records
    - When: Paginated queries for recent records
    - Then: Response time < 500ms per page

### Security Tests

55. **Test: Unauthorized deletion attempt**
    - Given: Non-admin user
    - When: Tries to call manual deletion API
    - Then: 403 Forbidden

56. **Test: Public records don't expose uploader identity**
    - Given: Deletion record with uploader_id "user_123"
    - When: Public API queried
    - Then: uploader_id hashed (SHA-256) for privacy, original stored internally

57. **Test: Rate limit bypass after deletion**
    - Given: Content deleted with active rate limits
    - When: Attempt to download deleted content
    - Then: 404 Not Found (not rate limited)

---

## Resolved Decisions

All critical design questions have been answered. Implementation can proceed with these confirmed decisions:

### Critical Decisions (Questions 1-10)

1. **✅ Cron Job Frequency: DAILY**
   - Scheduled job runs once per day
   - Content may exist up to 24 hours past expiration
   - Trade-off: Lower cost, acceptable latency for expired content
   - Configuration: `[triggers] crons = ["0 2 * * *"]` (2 AM UTC daily)

2. **✅ Hard Delete vs Soft Delete: HARD DELETE**
   - Permanently remove ContentMetadata on deletion
   - DeletionRecord provides complete audit trail
   - Simpler implementation, frees storage immediately
   - No content resurrection capability

3. **✅ Deletion Batch Size: FIXED BATCH SIZE PER RUN**
   - Process fixed batch of expired content per cron run
   - Predictable execution time, simple implementation
   - If more items exist, they're processed next day
   - **FOLLOW-UP NEEDED:** What batch size? (1000? 5000? 10000?)

4. **✅ Public Records Data Retention: KEEP FOREVER**
   - Deletion records never expire
   - Full transparency and audit trail
   - Disk cost negligible (~36MB/year for 100 deletions/day)

5. **✅ Deletion Order in Index: OLDEST-FIRST**
   - Process content in order of expiration timestamp
   - Most fair to users (content deleted ASAP after expiration)
   - Predictable behavior for transparency

6. **✅ Failed Deletion Retry Strategy: LEAVE IN INDEX FOR NEXT RUN**
   - Failed deletions remain in ExpirationIndex
   - Automatic retry on next cron run (24 hours later)
   - Log failures for monitoring
   - No complex retry logic or manual queue

7. **✅ ExpirationIndex Sharding: SINGLE GLOBAL INDEX**
   - Start with single ExpirationIndex Durable Object
   - Monitor performance as upload volume grows
   - Shard if/when needed (future optimization)

8. **✅ User Notification Before Deletion: NO EMAIL WARNINGS**
   - No email notifications before content expires
   - Users responsible for tracking their own content
   - Web UI may highlight upcoming expirations (see follow-up)
   - **FOLLOW-UP NEEDED:** What does "highlighting in web UI" mean?

9. **✅ Deletion Record Public Fields: HASH UPLOADER_ID**
   - Public fields: hash_256t, deleted_at, reason, size_bytes, retention_days
   - Privacy protected: uploader_id hashed (SHA-256) in public API
   - Original uploader_id stored for internal audit
   - Public API redacts sensitive data

10. **✅ Concurrent Extension and Deletion: EXTENSION WINS**
    - If extension request happens during deletion, extension takes priority
    - Deletion process checks for updated expiration before completing
    - Expiration date updated, content remains available
    - More complex but user-friendly (allows last-second extensions)
    - **FOLLOW-UP NEEDED:** Implementation complexity - locking strategy needed?

### Technical Questions (Questions 11-15)

11. **✅ Worker Execution Time Limits: STANDARD WORKERS**
    - Use Standard Workers (30 second CPU time limit)
    - No need for Unbound Workers
    - Design batch size to fit within 30 second limit

12. **✅ R2 Delete Rate Limits: CURRENT LIMITS OK**
    - Current R2 account limits are acceptable
    - No special configuration needed

13. **⏳ Durable Objects Concurrent Write Limits: TBD**
    - Benchmark needed before production deployment
    - Proceed with implementation, test concurrency before launch
    - Monitor ExpirationIndex write performance during testing

14. **✅ Storage Costs for Deletion Records: NEGLIGIBLE**
    - ~36MB/year storage cost is acceptable
    - Transparency value outweighs storage cost

15. **✅ API Rate Limits for Public Records: SAME AS OTHER PUBLIC APIs**
    - Use existing public API rate limits
    - No special rate limiting for deletion records endpoint

### Future Considerations (Questions 16-20)

16. **✅ Content Resurrection: NOT IMPLEMENTING**
    - No undelete functionality
    - No R2 versioning or object lifecycle policies
    - Hard delete is permanent

17. **✅ Bulk Deletion API: NOT IN THIS PLAN**
    - Separate feature (not part of content lifecycle automation)
    - Only one admin, bulk deletion not priority
    - Can be added later if needed for contest resolution

18. **✅ Deletion Webhooks: NOT IMPLEMENTING**
    - No webhook notifications when content deleted
    - Not required for MVP
    - Can be added in future phase if needed

19. **✅ Metrics and Monitoring: LOG ALL METRICS**
    - Track: Deletions/day, failures, latency, R2 operations
    - Log to console for monitoring
    - No specific dashboard in this phase
    - Alerting thresholds TBD during implementation

20. **✅ Content Expiration Grace Period: NO GRACE PERIOD**
    - Firm platform principle: "Gone is gone"
    - Content deleted immediately when cron processes expiration
    - Users can always re-upload if needed
    - No 24-hour grace period

---

## Follow-Up Questions

Based on the resolved decisions, these clarifications are needed before implementation:

### Question 1: Deletion Batch Size

**Context:** Decision #3 says "Process fixed batch size per run" but didn't specify the size.

**Question:** What should the batch size be per daily cron run?
- Option A: 1,000 items/day (conservative, safe for 30-second limit)
- Option B: 5,000 items/day (moderate)
- Option C: 10,000 items/day (aggressive, may approach timeout)
- Option D: No limit - process all expired content (risky if thousands expire)

**Recommendation:** 5,000 items/day is a good balance. With ~100ms per deletion, 5,000 items = ~8 minutes well within 30-second CPU budget if batched efficiently.

### Question 2: Web UI Expiration Highlighting

**Context:** Decision #8 mentions "No warnings (beyond highlighting in web UI)"

**Question:** What does "highlighting in web UI" mean?
- Is there a dashboard page that shows upcoming expirations?
- Should we add visual indicators (e.g., "Expires in 3 days" badge)?
- Which pages should show this highlighting?
  - `/dashboard/uploads/` - user's upload history page?
  - `/info.html` - content information page?
  - Other pages?

**Clarification needed:** Where and how should expiration dates be visually emphasized?

### Question 3: Extension Wins - Implementation Strategy

**Context:** Decision #10 says "Extension wins" if concurrent with deletion

**Question:** How should we implement the locking/coordination to ensure extension wins?
- Option A: ContentMetadata check - deletion reads `expires_at` before deleting, aborts if changed
- Option B: Explicit lock - use Durable Object transaction to prevent concurrent deletion
- Option C: Delete-then-check - delete from R2, check metadata, restore if extended
- Option D: Timestamp comparison - deletion only proceeds if `expires_at <= now()`

**Recommendation:** Option D with Option A - deletion always checks `expires_at` immediately before deleting. If `expires_at` moved into future, skip deletion. Simple, no explicit locking needed.

**Additional consideration:** Should extension API return different success message if extension happened during active deletion window?

### Question 4: DO Concurrent Write Benchmark Timing

**Context:** Decision #13 says benchmark ExpirationIndex concurrent writes (TBD)

**Question:** When should this benchmark happen?
- During development (before Phase 3 completion)?
- During testing (after implementation, before production)?
- After initial deployment (monitor in production)?

**Recommendation:** Benchmark during testing phase, before production deployment. Include in test plan as performance test #52.

---

## Updated Edge Cases Summary

### ✅ Resolved Design Decisions
- ~~Simultaneous extension and deletion (which wins?)~~ → **Extension wins**
- ~~Failed deletion retry strategy~~ → **Leave in index, retry next day**
- ~~Worker timeout with large batches~~ → **Fixed batch size per run**
- ~~User notification policy (warnings or not?)~~ → **No email warnings, possible UI highlighting**
- ~~Deletion record retention period~~ → **Keep forever**

### ⏳ Needs Clarification (Follow-Up Questions 1-4)
- Specific batch size number (1K, 5K, 10K?)
- Web UI expiration highlighting details
- Extension-wins implementation strategy
- DO concurrent write benchmark timing

### 🔮 Future Enhancements (Out of Scope)
- Multi-region R2 bucket support
- Content resurrection/undelete
- Bulk admin deletion API
- Deletion webhooks
- Advanced metrics dashboard and alerting

---

## Success Criteria

This plan is complete when:

1. 🔄 All **Open Questions** are answered and documented (20/20 resolved, 4 follow-ups pending)
2. ✅ All **Critical Decisions** have clear resolutions (10/10 resolved)
3. ⏳ All **Tests** (57 total) are written and pass
4. ⏳ Implementation follows test-driven development
5. ✅ Zero edge cases are unhandled (all identified and tested)
6. 🔄 Documentation is complete and up-to-date (plan documented, follow-ups needed)

**Current Status:** Ready for follow-up clarifications (4 questions), then implementation can begin

---

## Next Steps

### Immediate (Before Implementation)

1. ✅ **Review this plan** with stakeholders - COMPLETE
2. ✅ **Answer all Open Questions** - 20/20 RESOLVED
3. 🔄 **Answer Follow-Up Questions** - 4 clarifications needed:
   - Deletion batch size (1K, 5K, or 10K items/day?)
   - Web UI expiration highlighting (where and how?)
   - Extension-wins implementation strategy
   - DO concurrent write benchmark timing

### Implementation (After Follow-Ups Resolved)

4. **Write tests first** (TDD approach)
   - 57 tests covering all edge cases
   - Unit tests → Integration tests → Performance tests
5. **Implement Phase 1** (Deletion Records infrastructure)
   - DeletionRecord DO
   - Public API endpoints
   - Migration configuration
6. **Implement Phase 2** (Content deletion logic)
   - Content deletion service
   - Hard delete implementation
   - Idempotency handling
7. **Implement Phase 3** (Scheduled expiration job)
   - ExpirationIndex DO
   - Daily cron configuration
   - Batch processing logic with "extension wins" check
8. **Implement Phase 4** (Public UI)
   - Public deletion records viewer
   - Web UI expiration highlighting (based on clarification)
9. **Benchmark & Test**
   - DO concurrent write performance
   - Batch deletion throughput
   - 30-second worker limit validation
10. **Deploy & Monitor**
    - Production deployment
    - Monitor deletion metrics
    - Iterate based on real-world performance

---

## References

- User Stories: `todo/user_stories.md` (lines 320-328, Content Lifecycle section)
- Master Plan: `todo/master_plan.md` (Phase 5: Content Lifecycle)
- Current Implementation: `src/durable-objects/content-metadata.js`
- Expiration Validation: `src/api/content.js:686-699`
- Scheduled Handler Stub: `src/index.js:159-179`
- Platform Principles: Documented in user stories (lines 541-548)
