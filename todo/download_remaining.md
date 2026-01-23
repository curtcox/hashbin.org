# Content Download - Remaining Work

## Status

**Phase:** Phase 5/6 - Remaining download features
**Dependencies:**
- Contested content handling requires Phase 6 (Contest System)
- Performance testing requires production deployment

---

## Remaining Tasks

### 1. Contested Content Handling (451 Status) 🔴

**Status:** Blocked - depends on contest system implementation

**What's Needed:**
- Implement 451 HTTP status code for contested/removed content
- Add contest status check in download flow
- Return appropriate error message referencing legal process
- Update download handler to check `contested` field in ContentMetadata
- Add test cases for contested content scenarios

**Acceptance Criteria:**
- [ ] Contested content returns HTTP 451 instead of 200
- [ ] Response includes clear message about legal removal
- [ ] Download flow checks contest status before serving
- [ ] Tests cover contested content scenarios

**Dependency:** Requires `todo/content_moderation.md` implementation (Phase 6)

---

### 2. Info Page (`/info/{cid}`) 🟡

**Status:** Not started - deferred for UX improvements

**What's Needed:**
- Create `/info/{cid}` route serving HTML
- Display content metadata:
  - CID (with copy button)
  - File size (human-readable)
  - Expiration date (relative and absolute)
  - Upload date
  - Download count
  - Contested status (if applicable)
- Provide download links to `/{cid}` and `/{cid}.{ext}`
- Handle special cases:
  - Inline content (show "self-contained, never expires")
  - Expired/missing content (404)
  - Contested content (451)
- Optional: QR code for mobile sharing

**Files to Create:**
- `frontend/info.html` - Info page template
- `frontend/js/info.js` - Info page logic
- Update `src/index.js` - Add `/info/{cid}` route

**Acceptance Criteria:**
- [ ] Info page shows all relevant metadata
- [ ] Download links work correctly
- [ ] Page handles inline content gracefully
- [ ] Page handles missing/expired content (404)
- [ ] Page handles contested content (451)
- [ ] Mobile-friendly responsive design

---

### 3. Performance Testing with Large Files 🟡

**Status:** Not started - needs production deployment

**What's Needed:**
- Test with files of various sizes:
  - 100MB file
  - 1GB file
  - 5GB file (R2 limit)
- Measure performance metrics:
  - Time to first byte (TTFB) < 500ms
  - Streaming throughput (should match network speed)
  - Memory usage (should stay constant, not grow with file size)
  - Concurrent download capacity
- Test resumable downloads with Range requests
- Test CDN caching effectiveness
- Load testing with multiple concurrent users

**Testing Scenarios:**
```
describe('Large File Performance', () => {
  - Download 100MB file: TTFB < 500ms, completes successfully
  - Download 1GB file: streaming works, no memory issues
  - Download 5GB file: maximum size handling
  - 100 concurrent downloads: no degradation
  - Resume download after interruption: Range requests work
  - CDN caching: second request faster than first
  - Streaming: memory usage stays constant
});
```

**Acceptance Criteria:**
- [ ] TTFB < 500ms for all file sizes
- [ ] Memory usage constant regardless of file size
- [ ] 100 concurrent downloads supported
- [ ] Range requests work for resumable downloads
- [ ] CDN caching reduces latency on repeat requests

**Dependency:** Requires production deployment with real traffic

---

### 4. Integration Testing with Live Server 🟡

**Status:** Not started - needs deployment

**What's Needed:**
- End-to-end tests against live production API
- Test all download scenarios:
  - Standard download (`/{cid}`)
  - With extension (`/{cid}.ext`)
  - With force download (`/{cid}?download=true`)
  - HEAD requests
  - Range requests
  - 304 Not Modified responses
  - Error cases (404, 400, 451)
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Mobile browser testing
- CLI tool testing (curl, wget)

**Acceptance Criteria:**
- [ ] All download patterns work in production
- [ ] Cross-browser compatibility verified
- [ ] Mobile browsers work correctly
- [ ] CLI tools (curl/wget) work correctly
- [ ] Error handling works as expected

**Dependency:** Requires production deployment

---

## Priority

1. **High Priority:** Performance testing (blocks production launch confidence)
2. **Medium Priority:** Info page (UX enhancement, not critical)
3. **Low Priority:** Contested content handling (blocks Phase 6, but Phase 6 not started yet)

---

## Notes

- Core download functionality is complete and operational
- These remaining items are enhancements and testing
- No blocking issues for current usage
- See `done/download.md` for completed implementation details

---

**Document Version:** 1.0
**Created:** 2026-01-23
**Last Updated:** 2026-01-23
