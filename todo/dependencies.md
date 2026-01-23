# Task Dependencies Map

**Purpose:** Tracks dependencies between future/remaining tasks to identify critical path and parallelizable work.

**Last Updated:** 2026-01-23

---

## Dependency Graph

### Critical Path (Must Complete First)

These tasks block other work and should be prioritized:

#### 1. Production Deployment (clerk_remaining.md)
**Status:** Phase 3 - Ready to deploy
**Blocks:**
- Performance testing (download_remaining.md #3)
- Integration testing (download_remaining.md #4)
- Add to balance Phase 4 launch (add_to_balance.md)
- Manual testing procedures (manual_testing_guide.md)

**Dependencies:** None (backend complete ✅)

**Priority:** 🔴 HIGH - Blocks multiple tasks

---

#### 2. Content Moderation System (content_moderation.md)
**Status:** Phase 6 - Not started
**Blocks:**
- Contested content handling - 451 status (download_remaining.md #1)
- Content dispute resolution (content_dispute_resolution.md)

**Dependencies:** None

**Priority:** 🟡 MEDIUM - Blocks Phase 6 features only

---

### Independent Tasks (No Dependencies)

These can be started immediately in parallel:

#### 3. Content Lifecycle - Expiration & Deletion (content_lifecycle_remaining.md)
**Status:** Planning complete, implementation pending
**Blocks:** Nothing
**Dependencies:** None
**Priority:** 🟡 MEDIUM - Core feature, no blockers

**Phases:**
- Phase 1: Deletion Record Infrastructure
- Phase 2: Content Deletion Logic
- Phase 3: Scheduled Expiration Job
- Phase 4: Public Records UI (optional)
- Phase 5: Testing & Deployment

---

#### 4. Content Rate Limit Frontend UI (content_rate_limit.md)
**Status:** Backend complete, UI pending
**Blocks:** Nothing
**Dependencies:** None (backend already done ✅)
**Priority:** 🟡 MEDIUM - UX enhancement

**Remaining Work:**
- Rate limit status display
- Purchase interface
- Usage warnings

---

#### 5. Info Page for Content (download_remaining.md #2)
**Status:** Not started - UX improvement
**Blocks:** Nothing
**Dependencies:** None
**Priority:** 🟢 LOW - Nice to have

**Features:**
- `/info/{cid}` route
- Metadata display (size, expiration, downloads)
- QR code for mobile sharing

---

#### 6. Frontend UI Implementation (frontend_ui.md)
**Status:** Phase 8 - Planned
**Blocks:** Nothing
**Dependencies:** None (critical questions resolved)
**Priority:** 🟢 LOW - Future enhancement

**Scope:**
- Vanilla JavaScript approach
- Responsive design
- No framework dependencies

---

### Deployment-Dependent Tasks

These require production deployment before they can be completed:

#### 7. Performance Testing with Large Files (download_remaining.md #3)
**Status:** Needs production deployment
**Blocks:** Nothing
**Dependencies:**
- ⛔ Production deployment (clerk_remaining.md)

**Priority:** 🔴 HIGH - Validates production readiness

**Test Cases:**
- 100MB, 1GB, 5GB files
- TTFB < 500ms
- 100 concurrent downloads
- Range requests
- CDN caching

---

#### 8. Integration Testing with Live Server (download_remaining.md #4)
**Status:** Needs production deployment
**Blocks:** Nothing
**Dependencies:**
- ⛔ Production deployment (clerk_remaining.md)

**Priority:** 🔴 HIGH - Validates production readiness

**Test Scope:**
- Cross-browser testing
- Mobile browsers
- CLI tools (curl, wget)
- All download patterns

---

#### 9. Add to Balance - Phase 4 Launch (add_to_balance.md)
**Status:** Backend & frontend complete, testing pending
**Blocks:** Nothing
**Dependencies:**
- ⛔ Production deployment (clerk_remaining.md)

**Priority:** 🟡 MEDIUM - Revenue feature

**Remaining:**
- Production Stripe integration
- End-to-end testing
- Launch validation

---

### Moderation-Dependent Tasks

These require the content moderation system:

#### 10. Contested Content Handling - 451 Status (download_remaining.md #1)
**Status:** Blocked - Phase 6
**Blocks:** Nothing
**Dependencies:**
- ⛔ Content moderation system (content_moderation.md)

**Priority:** 🟢 LOW - Phase 6 feature

**Implementation:**
- HTTP 451 status for removed content
- Contest status check in download flow
- Legal process messaging

---

#### 11. Content Dispute Resolution (content_dispute_resolution.md)
**Status:** Phase 6 - Not started
**Blocks:** Nothing
**Dependencies:**
- ⛔ Content moderation system (content_moderation.md)

**Priority:** 🟢 LOW - Phase 6 feature

**Features:**
- Automated escalation (No-AI → AI → Owner)
- Dispute submission forms
- DMCA handling

---

### Deferred/TBD Tasks

#### 12. Balance Transfer (balance_transfer.md)
**Status:** TBD - Decision pending
**Blocks:** Nothing
**Dependencies:** None
**Priority:** ⏸️ DEFERRED - Feature under consideration

**Note:** P2P balance transfers - implementation decision pending

---

## Execution Recommendations

### Phase A: Immediate (No Dependencies)
Start these in parallel:
1. ✅ **Content Lifecycle** (content_lifecycle_remaining.md) - Core feature
2. ✅ **Content Rate Limit UI** (content_rate_limit.md) - Backend ready
3. ✅ **Info Page** (download_remaining.md #2) - Simple UX improvement

### Phase B: Production Deployment
Critical blocker for testing:
1. 🔴 **Production Deployment** (clerk_remaining.md)

### Phase C: Post-Deployment Validation
Requires Phase B completion:
1. 🔴 **Performance Testing** (download_remaining.md #3)
2. 🔴 **Integration Testing** (download_remaining.md #4)
3. 🟡 **Add to Balance Launch** (add_to_balance.md)

### Phase D: Content Moderation (Phase 6)
Start when ready for moderation features:
1. 🟡 **Content Moderation System** (content_moderation.md)

### Phase E: Moderation-Dependent
Requires Phase D completion:
1. 🟢 **Contested Content - 451** (download_remaining.md #1)
2. 🟢 **Dispute Resolution** (content_dispute_resolution.md)

### Phase F: Future Enhancements
Low priority, no blockers:
1. 🟢 **Frontend UI** (frontend_ui.md) - Phase 8

---

## Summary Statistics

- **Total Tasks:** 12 (excluding completed work)
- **No Dependencies:** 6 tasks (50%)
- **Blocked on Production:** 3 tasks (25%)
- **Blocked on Moderation:** 2 tasks (17%)
- **Deferred:** 1 task (8%)

### Blocker Impact
- **Production Deployment** blocks 3 tasks (25% of remaining work)
- **Content Moderation** blocks 2 tasks (17% of remaining work)

---

## Tasks With No Dependencies

These can start immediately:

1. ✅ **Content Lifecycle Implementation** (content_lifecycle_remaining.md)
2. ✅ **Content Rate Limit Frontend UI** (content_rate_limit.md)
3. ✅ **Info Page for Content** (download_remaining.md #2)
4. ✅ **Production Deployment** (clerk_remaining.md)
5. ✅ **Content Moderation System** (content_moderation.md)
6. ✅ **Frontend UI Phase 8** (frontend_ui.md)

**Note:** Tasks 1-3 are purely backend/frontend work with no external blockers. Task 4 (Production Deployment) is the critical path item that should be prioritized.

---

## Completed Work (For Context)

These are done and don't appear as dependencies:

- ✅ Login & Authentication (login.md)
- ✅ API Key Management UI (key_management_ui.md)
- ✅ Content Rate Limit Backend (content_rate_limit.md)
- ✅ Content Rate Limit UI (content_rate_limit_ui.md)
- ✅ Navigation & Discoverability (navigation_discoverability.md)
- ✅ Local API Tests (local_API_tests.md)
- ✅ Account Management (account_management.md)

---

**Document Version:** 1.0
**Created:** 2026-01-23
**Next Review:** After production deployment
