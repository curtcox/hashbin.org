# Content Lifecycle Automation Plan

## Overview

This document outlines the plan to automate the content lifecycle for HashBin.org, specifically implementing:
1. **Scheduled expiration jobs** - Automated cron jobs to check for expired content
2. **Content deletion** - Immediate deletion of expired content from R2 and Durable Objects
3. **Public deletion records** - Transparent record of all deleted content

**Status:** Planning Phase
**Target:** Phase 5 Implementation
**Last Updated:** 2026-01-17

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
crons = ["0 */6 * * *"]  # Every 6 hours
```

**Frequency Options:**
- Hourly: `"0 * * * *"` - Most responsive, higher cost
- Every 6 hours: `"0 */6 * * *"` - Balanced (recommended)
- Daily: `"0 2 * * *"` - Lower cost, up to 24hr delay

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
    - Then: Extension fails (content already deleting) OR deletion aborted

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
    - Given: Deletion record with uploader_id
    - When: Public API queried
    - Then: uploader_id redacted or hashed

57. **Test: Rate limit bypass after deletion**
    - Given: Content deleted with active rate limits
    - When: Attempt to download deleted content
    - Then: 404 Not Found (not rate limited)

---

## Open Questions

### Critical Decisions Needed

1. **Cron Job Frequency**
   - How often should expiration checks run?
   - Options: Hourly, every 6 hours, daily
   - Trade-off: Responsiveness vs cost vs worker invocations
   - **Recommendation:** Every 6 hours (balanced approach)
   - **Impact:** Content may exist up to 6 hours past expiration

2. **Hard Delete vs Soft Delete Metadata**
   - Should we permanently remove ContentMetadata or use tombstones?
   - Hard delete: Frees storage, simpler, relies on DeletionRecord for audit
   - Soft delete: Allows resurrection, more complex, uses more storage
   - **Recommendation:** Hard delete with DeletionRecord audit trail
   - **Question:** Do we need ability to "undelete" content?

3. **Deletion Batch Size**
   - If 10,000+ items expire on same day, how to handle?
   - Options:
     - Delete all in single cron run (may timeout)
     - Batch with continuation token (complex)
     - Process fixed batch size per run (simple, predictable)
   - **Recommendation:** Process up to 1,000 per cron run, use continuation
   - **Question:** What's the maximum single-cron processing capacity?

4. **Public Records Data Retention**
   - How long should we keep deletion records?
   - Options: Forever, 1 year, 5 years, same as content retention
   - **Recommendation:** Keep forever (disk is cheap, transparency is valuable)
   - **Question:** Any legal requirements for data retention?

5. **Deletion Order in Index**
   - When querying ExpirationIndex, should we process oldest-first or random?
   - Oldest-first: More fair (content expires ASAP)
   - Random: Better distributed load
   - **Recommendation:** Oldest-first (most fair to users)
   - **Question:** Does order matter for transparency?

6. **Failed Deletion Retry Strategy**
   - If R2 delete fails (network, throttling), when to retry?
   - Options:
     - Retry in same cron run (may compound issues)
     - Leave in index for next cron run (automatic retry)
     - Manual intervention queue
   - **Recommendation:** Leave in index, retry next cron run, alert after 3 failures
   - **Question:** How to handle persistent failures?

7. **ExpirationIndex Sharding**
   - Single global ExpirationIndex or multiple shards?
   - Single: Simple, potential bottleneck for high writes
   - Sharded (by month/year): Complex, better distributed
   - **Recommendation:** Start with single, monitor, shard if needed
   - **Question:** What's expected upload volume per day?

8. **User Notification Before Deletion**
   - Should users receive email warnings before content expires?
   - Per platform principle: "No grace period" suggests no warnings
   - But: User stories mention "30-day warning email system" in index.js comments
   - **Recommendation:** No warnings (users responsible for tracking)
   - **Question:** Clarify platform policy - warnings or no warnings?

9. **Deletion Record Public Fields**
   - What fields should be public in deletion records?
   - Always public: hash, deleted_at, reason, size_bytes
   - Maybe public: uploader_id (privacy concern)
   - Never public: Internal IDs, API keys
   - **Recommendation:** Redact uploader_id or hash it for privacy
   - **Question:** Privacy policy requirements?

10. **Concurrent Extension and Deletion Race**
    - If extension happens during deletion, which wins?
    - Option A: Extension wins (abort deletion if extension detected)
    - Option B: Deletion wins (extension fails with "content expired")
    - **Recommendation:** Deletion wins (simpler, matches expiration timestamp)
    - **Question:** Should we allow last-second extensions?

### Technical Questions

11. **Worker Execution Time Limits**
    - What's the maximum CPU time for scheduled workers?
    - Standard: 30 seconds, Unbound: 30 seconds wall time
    - **Question:** Do we need Unbound Workers for cron jobs?

12. **R2 Delete Rate Limits**
    - What's the maximum delete operations per second for R2?
    - Cloudflare R2: ~1000 deletes/second typical
    - **Question:** Need to verify current R2 account limits

13. **Durable Objects Concurrent Write Limits**
    - How many concurrent writes can ExpirationIndex handle?
    - DO: Single-threaded per instance, but auto-scales
    - **Question:** Benchmark concurrent registration performance

14. **Storage Costs for Deletion Records**
    - How much will DeletionRecord storage cost over time?
    - Assume: 100 deletions/day × 365 days × 1KB/record = ~36MB/year
    - **Question:** Is this negligible or significant?

15. **API Rate Limits for Public Records**
    - Should public deletion records API have rate limits?
    - Yes: Prevents abuse, protects infrastructure
    - **Recommendation:** 100 requests/minute per IP (same as other public APIs)
    - **Question:** Different limit for authenticated vs anonymous?

### Future Considerations

16. **Content Resurrection**
    - If content is deleted by mistake (bug), can it be restored?
    - Currently: No, R2 object is gone
    - Future: R2 object lifecycle policies for soft-delete?
    - **Question:** Worth implementing R2 versioning for safety?

17. **Bulk Deletion API**
    - Should admins have API to bulk delete content (e.g., DMCA)?
    - Useful for: Contest resolution, legal compliance
    - **Recommendation:** Yes, admin-only bulk delete endpoint
    - **Question:** Part of this plan or separate feature?

18. **Deletion Webhooks**
    - Should we send webhooks when content is deleted?
    - Use case: Notify uploader when content expires
    - **Recommendation:** Phase 6 feature (after basic lifecycle works)
    - **Question:** Required for MVP or nice-to-have?

19. **Metrics and Monitoring**
    - What metrics should we track for deletion jobs?
    - Candidates: Deletions/day, failures, latency, R2 costs saved
    - **Recommendation:** Log all metrics, dashboard in Phase 7
    - **Question:** Alerting thresholds for failures?

20. **Content Expiration Grace Period**
    - Platform principle says "No grace period" - confirm this is firm?
    - Alternative: Allow 24-hour grace for last-minute extensions
    - **Recommendation:** Stick to "no grace period" as stated
    - **Question:** Has this been validated with stakeholders?

---

## Edge Cases Summary

### Covered by Tests
- Timezone handling (UTC vs local)
- Month-end boundary cases (Jan 31 → Feb 28)
- Leap year handling
- Inline content (no R2 deletion)
- Already deleted content (idempotency)
- Concurrent operations (uploads, extensions, deletions)
- R2 failures and partial failures
- Large batch deletions (10,000+ items)
- Invalid/corrupted metadata
- Pagination edge cases

### Needs Design Decision
- Simultaneous extension and deletion (which wins?)
- Failed deletion retry strategy
- Worker timeout with large batches
- User notification policy (warnings or not?)
- Deletion record retention period

### Future Enhancements
- Multi-region R2 bucket support
- Content resurrection/undelete
- Bulk admin deletion API
- Deletion webhooks
- Advanced metrics and alerting

---

## Success Criteria

This plan is complete when:

1. ✅ All **Open Questions** are answered and documented
2. ✅ All **Critical Decisions** have clear resolutions
3. ✅ All **Tests** (57 total) are written and pass
4. ✅ Implementation follows test-driven development
5. ✅ Zero edge cases are unhandled
6. ✅ Documentation is complete and up-to-date

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Answer all Open Questions** (prioritize Critical Decisions 1-10)
3. **Write tests first** (TDD approach)
4. **Implement Phase 1** (Deletion Records infrastructure)
5. **Implement Phase 2** (Content deletion logic)
6. **Implement Phase 3** (Scheduled expiration job)
7. **Implement Phase 4** (Public UI)
8. **Iterate** until all tests pass and no open questions remain

---

## References

- User Stories: `todo/user_stories.md` (lines 320-328, Content Lifecycle section)
- Master Plan: `todo/master_plan.md` (Phase 5: Content Lifecycle)
- Current Implementation: `src/durable-objects/content-metadata.js`
- Expiration Validation: `src/api/content.js:686-699`
- Scheduled Handler Stub: `src/index.js:159-179`
- Platform Principles: Documented in user stories (lines 541-548)
