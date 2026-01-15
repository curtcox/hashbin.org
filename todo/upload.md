# Content Upload Implementation Plan

## Overview

This plan covers allowing logged-in users to upload content to HashBin.org. The system uses 256t hash-based content addressing with a pay-per-retention model.

## Current State

### Already Implemented
- **Authentication**: Clerk OAuth (Google, Apple, Microsoft, GitHub) + API keys
- **API endpoint**: `POST /api/content` exists with balance checking and payment
- **Storage**: Cloudflare R2 integration for content storage
- **Balance system**: User wallet with deposit/debit operations
- **Pricing**: $0.03/GB/month with 30-day minimum retention

### Not Yet Implemented
- Proper 256t hash generation (currently uses placeholder)
- Frontend upload UI (shows "coming soon")
- File validation and size limits
- Upload progress indication
- Client-side duplicate detection
- Content download endpoint

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Maximum single file size | **5GB** (R2 single-part upload limit) |
| 2 | Maximum upload per request | **Single file only** |
| 3 | File type restrictions | **No restrictions** - any content accepted |
| 4 | Upload progress feedback | **Simple spinner** |
| 5 | Drag-and-drop support | **Yes** |
| 6 | Content preview before upload | **No preview** |
| 7 | Hash calculation location | **Both** - client warns, server enforces |
| 8 | Zero-byte file handling | **Allow** - Note: CIDs ≤64 bytes contain content directly in the CID; no actual storage needed |
| 9 | Resumable uploads | **No** |
| 10 | Upload cancellation | **Yes** - user can cancel in-progress uploads |
| 11 | Concurrent upload limit | **Unlimited** - all must be prepaid |
| 12 | Retention selection UI | **Dropdown + custom input** |
| 13 | Cost display timing | **Both** - after file selection and during upload |
| 14 | Upload confirmation step | **No** - immediate upload on submit |
| 15 | Failed upload retry | **Manual only** - user decides to retry |
| 16 | API key upload support | **Yes** - for CLI/automation |
| 17 | Upload rate limiting | **None beyond auth** - prepaid model prevents abuse |
| 18 | Content type handling | **None** - content stored as raw bytes with no associated type |
| 19 | Filename handling | **Hash only** - no filename stored, content-addressed only |
| 20 | Success redirect | **Go to CID detail page** |

---

## Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 21 | Inline content pricing | A) Free (no R2 storage used), B) Charge same rate, C) Minimum fee | Content ≤64 bytes is encoded directly in CID - no R2 storage. Should this be free? |
| 22 | CID detail page scope | A) Minimal (CID, expiry, size), B) Full (+ download, extend, share), C) Requires separate plan | What should the CID detail page display? Does it exist yet? |
| 23 | Download content-type header | A) application/octet-stream always, B) Browser sniffs, C) User specifies on upload | How should downloads be served since we don't store content type? |
| 24 | Maximum CID age display | A) Show "expires in X days/months", B) Show exact date only, C) Both | How should expiration be communicated to users? |

---

## Architecture

### Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UPLOAD FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User selects file (click or drag-and-drop)                             │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                   │
│  │ Client-side      │                                                   │
│  │ - Calculate hash │ ◄─── 256t specification                          │
│  │ - Check size     │      (≤5GB limit)                                 │
│  │ - Estimate cost  │                                                   │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────┐     ┌──────────────────┐                         │
│  │ Check CID exists │────►│ CID exists?      │                         │
│  │ GET /api/content │     │                  │                         │
│  │     /:cid/exists │     └────────┬─────────┘                         │
│  └──────────────────┘              │                                    │
│                          ┌─────────┴─────────┐                          │
│                          │                   │                          │
│                    Yes   ▼             No    ▼                          │
│           ┌──────────────────┐  ┌──────────────────┐                   │
│           │ Show "Duplicate" │  │ Show cost,       │                   │
│           │ message + extend │  │ retention picker │                   │
│           │ option           │  │ (dropdown+custom)│                   │
│           └────────┬─────────┘  └────────┬─────────┘                   │
│                    │                     │                              │
│                    └──────────┬──────────┘                              │
│                               │                                         │
│                               ▼                                         │
│                    ┌──────────────────┐                                 │
│                    │ POST /api/content│ ◄─── Immediate, no confirmation │
│                    │ - FormData       │                                 │
│                    │ - retention_mnths│                                 │
│                    └────────┬─────────┘                                 │
│                             │                                           │
│           ┌─────────────────┼─────────────────┐                         │
│           │                 │                 │                         │
│      Success           In Progress        Failure                       │
│           │                 │                 │                         │
│           ▼                 ▼                 ▼                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│   │ Redirect to  │  │ Show spinner │  │ Show error   │                 │
│   │ CID detail   │  │ + cancel btn │  │ + manual     │                 │
│   │ page         │  │              │  │ retry option │                 │
│   └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Inline Content Flow (≤64 bytes)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INLINE CONTENT (≤64 bytes)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Content ≤ 64 bytes                                                     │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                   │
│  │ Calculate 256t   │                                                   │
│  │ CID = prefix +   │ ◄─── Content is Base64URL encoded directly       │
│  │ Base64URL(content)│      NO hash, NO R2 storage needed               │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────┐                                                   │
│  │ CID IS the       │                                                   │
│  │ content itself   │ ◄─── Download = decode CID, no R2 fetch          │
│  └──────────────────┘                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Frontend Components
1. **UploadForm** - Main upload interface
2. **FileSelector** - File input with drag-and-drop support
3. **HashCalculator** - Client-side 256t hash computation (Web Worker)
4. **RetentionPicker** - Dropdown presets + custom month input
5. **CostDisplay** - Real-time cost calculation with balance check
6. **SpinnerIndicator** - Simple upload progress spinner with cancel
7. **UploadResult** - Redirect to CID detail page on success

#### API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/content` | POST | Required (Session or API Key) | Upload content |
| `/api/content/:cid/exists` | GET | Public | Check if CID exists |
| `/api/content/:cid` | GET | Public | Get content metadata |
| `/api/content/:cid/download` | GET | Public | Download content (TODO) |
| `/api/payments/calculate` | POST | Public | Calculate retention cost |

---

## Implementation Phases

### Phase 1: 256t Hash Implementation
- Implement SHA-512 hash generation per 256t specification
- 8-char length prefix + up to 86-char Base64URL hash
- Content ≤ 64 bytes: Direct Base64URL encoding (inline content)
- Content > 64 bytes: SHA-512 hash
- Both client-side (JavaScript) and server-side (Worker) implementations

### Phase 2: Frontend Upload UI
- File selection with drag-and-drop
- Retention picker (dropdown: 1 month, 1 year, 1 decade, 1 century + custom input)
- Cost display (updates on file selection and retention change)
- Balance display with deposit link if insufficient
- Upload button (immediate submission, no confirmation)

### Phase 3: Client-Side Hashing & Duplicate Detection
- Web Worker for non-blocking hash calculation
- Progress indication during hash (for large files)
- Check `/api/content/:cid/exists` before upload
- Show duplicate message with extension option

### Phase 4: Upload Progress & Cancellation
- Simple spinner during upload
- Cancel button to abort in-progress upload
- XHR abort or AbortController for fetch

### Phase 5: Error Handling & Retry
- Insufficient balance: show amount needed, link to deposit
- File too large: show 5GB limit message
- Network error: preserve form state, show manual retry button
- Server error: user-friendly message

### Phase 6: Success Flow
- Redirect to CID detail page
- CID detail page shows: CID, expiration, size, copy button, share URL

### Phase 7: API Key Support
- Accept `Authorization: Bearer hb_live_...` or `hb_test_...` header
- Same functionality as session-based upload
- JSON error responses for programmatic consumption

---

## Test Plan

### Unit Tests - 256t Hash Generation

```
describe('256t Hash Generation', () => {
  // Length prefix calculation
  - should return 8-char prefix for any content size
  - should encode size in 6-byte big-endian format
  - should use Base64URL encoding for prefix

  // Inline content (≤ 64 bytes) - direct encoding, no hash
  - should directly encode empty content (0 bytes)
  - should directly encode 1-byte content
  - should directly encode 64-byte content exactly
  - should use Base64URL without padding
  - should allow content recovery from CID (decode Base64URL)

  // Large content (> 64 bytes) - SHA-512 hash
  - should hash 65-byte content
  - should hash 1KB content
  - should hash 1MB content
  - should hash 1GB content
  - should hash 5GB content (max size)
  - should produce consistent hash for same content
  - should produce different hash for different content

  // Format validation
  - should produce max 94 character identifier
  - should contain only URL-safe characters (A-Za-z0-9_-)
  - should match format: 8-char prefix + up to 86-char hash/content

  // Edge cases
  - should handle binary content (null bytes, high bytes)
  - should handle Unicode text (UTF-8 encoded)
  - should handle content with only null bytes
  - should reject content > 5GB with clear error
});
```

### Unit Tests - Client-Side Hash Calculator

```
describe('Client Hash Calculator', () => {
  // Basic functionality
  - should calculate hash for File object
  - should calculate hash for Blob
  - should calculate hash for ArrayBuffer
  - should use Web Worker for computation

  // Progress reporting (for large files)
  - should report progress for files > 1MB
  - should report 0% at start
  - should report 100% at completion
  - should report intermediate progress proportional to bytes read

  // Performance
  - should not block main thread
  - should use streaming for large files (not load entire file in memory)
  - should complete 5GB file hash in reasonable time

  // Cancellation
  - should support cancellation mid-computation
  - should clean up resources on cancel

  // Error handling
  - should reject on file read error
  - should handle file access denied
  - should handle file deleted during read
});
```

### Unit Tests - File Validation

```
describe('File Validation', () => {
  // Size validation
  - should accept file of 0 bytes (empty file)
  - should accept file of 1 byte
  - should accept file of exactly 5GB
  - should reject file of 5GB + 1 byte
  - should show clear error message for oversized file

  // No type restrictions (per decision)
  - should accept any MIME type
  - should accept files with no MIME type
  - should accept executable files
  - should accept files with unusual extensions

  // Filename handling (not stored, per decision)
  - should not require filename
  - should ignore filename for processing
  - should not store filename in metadata
});
```

### Unit Tests - Retention Picker

```
describe('Retention Picker', () => {
  // Preset selection (dropdown)
  - should have 1 month preset (default)
  - should have 1 year (12 months) preset
  - should have 1 decade (120 months) preset
  - should have 1 century (1200 months) preset
  - should have "Custom" option to enable input

  // Custom input
  - should show input field when "Custom" selected
  - should accept integer month values
  - should enforce minimum 1 month
  - should accept very large values (1200+ months)
  - should reject non-integer values (show validation error)
  - should reject zero
  - should reject negative values

  // Cost calculation integration
  - should trigger cost recalculation on selection change
  - should trigger cost recalculation on custom input change
});
```

### Unit Tests - Cost Display

```
describe('Cost Display', () => {
  // Display format
  - should format cost as $X.XX
  - should show $0.00 for inline content (if free, per decision #21)
  - should update after file selection
  - should update during retention change

  // Balance comparison
  - should show current balance
  - should show green/positive indicator if balance >= cost
  - should show red/warning indicator if balance < cost
  - should show shortfall amount: "Need $X.XX more"
  - should show deposit link when insufficient

  // Edge cases
  - should handle very large costs (century retention of 5GB)
  - should round fractional cents appropriately
  - should handle $0.00 cost display (inline content)
});
```

### Unit Tests - Drag and Drop

```
describe('Drag and Drop', () => {
  // Basic functionality
  - should highlight drop zone on drag enter
  - should remove highlight on drag leave
  - should accept dropped file
  - should trigger hash calculation on drop

  // Validation
  - should reject multiple files (show "single file only" message)
  - should reject directories
  - should reject files > 5GB

  // Visual feedback
  - should show drag-over state
  - should show accepted state on valid file
  - should show rejected state on invalid file
});
```

### Unit Tests - Upload Spinner & Cancellation

```
describe('Upload Spinner', () => {
  // Display
  - should show spinner when upload starts
  - should hide spinner when upload completes
  - should hide spinner when upload fails
  - should hide spinner when upload cancelled

  // Cancel button
  - should show cancel button during upload
  - should abort upload on cancel click
  - should restore form state on cancel
  - should not charge balance on cancelled upload
});
```

### Unit Tests - Duplicate Detection

```
describe('Duplicate Detection', () => {
  // Client-side check
  - should calculate hash before upload
  - should call GET /api/content/:cid/exists
  - should proceed normally if CID does not exist

  // Duplicate found
  - should show "Content already exists" message
  - should show current expiration date
  - should show current size
  - should offer "Extend retention" option
  - should allow user to cancel (not pay)

  // Edge cases
  - should handle network error on exists check (proceed with upload)
  - should handle race condition (CID uploaded between check and submit)
  - should handle inline content (always "exists" conceptually)
});
```

### Unit Tests - Error Handling

```
describe('Upload Error Handling', () => {
  // Insufficient balance
  - should show "Insufficient balance" message
  - should show required amount
  - should show current balance
  - should show shortfall
  - should provide deposit link
  - should preserve file selection for retry after deposit

  // File too large
  - should show "File too large" message
  - should show 5GB limit
  - should show actual file size

  // Network errors
  - should detect network failure
  - should show "Upload failed - network error" message
  - should show "Retry" button
  - should preserve form state on error
  - should preserve file selection

  // Server errors (5xx)
  - should show "Upload failed - please try again"
  - should not expose internal error details
  - should show "Retry" button
});
```

### Unit Tests - Success Flow

```
describe('Upload Success', () => {
  // Response handling
  - should receive CID from server
  - should receive expiration date
  - should receive new balance
  - should receive cost charged

  // Redirect
  - should redirect to /content/:cid page
  - should pass success state to detail page

  // No additional UI (redirect handles display)
});
```

### Unit Tests - CID Detail Page

```
describe('CID Detail Page', () => {
  // Display elements
  - should display full CID
  - should display expiration date
  - should display file size
  - should have copy CID button
  - should have download link

  // Copy functionality
  - should copy CID to clipboard on button click
  - should show "Copied!" confirmation
  - should reset confirmation after 2 seconds

  // Actions
  - should have "Extend retention" link
  - should have "Upload another" link
  - should have shareable URL display
});
```

### Integration Tests - Full Upload Flow

```
describe('Full Upload Flow', () => {
  // Happy path - new content (large file)
  - should complete: select file → hash → check exists → set retention → upload → redirect
  - should deduct correct amount from balance
  - should store content in R2
  - should create metadata record
  - should return valid CID matching client hash

  // Happy path - inline content (≤64 bytes)
  - should complete upload without R2 storage
  - should return CID containing content
  - should charge appropriately (per decision #21)

  // Happy path - duplicate content
  - should detect duplicate via exists check
  - should show extension UI
  - should extend retention without re-uploading bytes
  - should charge for extension only

  // Insufficient balance path
  - should reject with clear message
  - should not create content
  - should not deduct balance
  - should allow retry after deposit (without re-selecting file)

  // Cancelled upload path
  - should abort XHR/fetch
  - should not charge balance
  - should not create content
  - should return to ready state

  // Edge cases
  - should handle exactly-sufficient balance (balance == cost)
  - should handle maximum file size (5GB)
  - should handle minimum retention (1 month)
});
```

### Integration Tests - API Key Upload

```
describe('API Key Upload', () => {
  // Authentication
  - should accept valid API key: Authorization: Bearer hb_live_xxx
  - should accept valid test key: Authorization: Bearer hb_test_xxx
  - should reject invalid API key (401)
  - should reject expired API key (401)
  - should reject revoked API key (401)

  // Functionality
  - should upload content same as session-based
  - should deduct from key owner's balance
  - should record in key owner's upload history
  - should return JSON response

  // Error responses (JSON format)
  - should return JSON for insufficient balance
  - should return JSON for file too large
  - should return JSON for server errors
  - should include appropriate HTTP status codes
});
```

### Integration Tests - Inline Content

```
describe('Inline Content Upload', () => {
  // Small content handling
  - should handle 0-byte content
  - should handle 1-byte content
  - should handle 64-byte content (boundary)
  - should hash 65-byte content (just over boundary)

  // Storage behavior
  - should NOT store ≤64 byte content in R2
  - should STORE >64 byte content in R2

  // CID verification
  - should produce CID that decodes back to original content (≤64 bytes)
  - should produce CID that cannot decode to content (>64 bytes, is hash)
});
```

### E2E Tests - User Journey

```
describe('E2E Upload Journey', () => {
  // New user first upload
  - should: sign in → see upload page → deposit (if needed) → select file → upload → view CID page

  // Returning user with balance
  - should: sign in → select file → see cost → upload → view CID page

  // Drag and drop journey
  - should: drag file → drop → see cost → upload → view CID page

  // Multiple sequential uploads
  - should upload file 1 → view CID → click "upload another" → upload file 2
  - should correctly deduct balance for each
  - should track all in upload history

  // Error recovery journey
  - should: upload → network error → retry → success
  - should: upload → insufficient balance → deposit → retry → success
});
```

### E2E Tests - CLI/API Upload

```
describe('E2E CLI Upload', () => {
  // curl-style upload
  - should upload via: curl -X POST -H "Authorization: Bearer hb_live_xxx" -F "content=@file" -F "retention_months=1" /api/content
  - should return JSON with CID

  // Scripted upload
  - should support programmatic upload via fetch/axios
  - should support streaming upload for large files
});
```

### Security Tests

```
describe('Upload Security', () => {
  // Authentication
  - should reject unauthenticated upload (401)
  - should validate session token
  - should validate API key format
  - should validate API key not expired/revoked

  // Authorization
  - should only charge uploader's balance
  - should associate content with correct user
  - should not allow access to other users' balance

  // Input validation (server-side enforcement)
  - should enforce 5GB size limit server-side
  - should reject retention_months < 1
  - should reject non-integer retention_months
  - should validate CID format matches content

  // No filename/type vulnerabilities (not stored)
  - should ignore filename in request
  - should ignore content-type in request
  - should not allow path traversal (no paths stored)
});
```

### Performance Tests

```
describe('Upload Performance', () => {
  // Client-side hashing
  - should hash 100MB file in <5s
  - should hash 1GB file in <30s
  - should not freeze UI during hashing

  // Upload times (network dependent)
  - should complete small file upload (<1MB) in <2s
  - should maintain responsive UI during large upload
  - should support 5GB upload without timeout

  // Concurrent uploads (per decision: unlimited)
  - should handle 3 concurrent uploads from same user
  - should correctly track balance across concurrent uploads
  - should prevent race conditions on balance
});
```

### Accessibility Tests

```
describe('Upload Accessibility', () => {
  // Keyboard navigation
  - should allow file selection via keyboard (Enter/Space on input)
  - should support Tab navigation through form
  - should allow form submission via Enter
  - should allow cancel via Escape

  // Screen reader support
  - should have aria-label on file input
  - should announce "File selected: [name], [size]"
  - should announce "Uploading..." when upload starts
  - should announce "Upload complete" or "Upload failed"
  - should announce cost and balance information

  // Focus management
  - should focus file input on page load
  - should move focus to error message on error
  - should move focus appropriately after redirect

  // Visual accessibility
  - should have sufficient color contrast on all elements
  - should not rely solely on color for insufficient balance warning
  - should respect prefers-reduced-motion for spinner
});
```

---

## File Structure

```
frontend/
├── js/
│   ├── upload.js           # Main upload page logic
│   ├── hash256t.js         # 256t hash calculation
│   ├── hash-worker.js      # Web Worker for async hashing
│   └── upload-components.js # UI components (retention picker, cost display)
├── css/
│   └── upload.css          # Upload page styles (drag-drop, spinner)
└── upload.html             # Upload page

src/
├── api/
│   └── content.js          # Upload API handler (exists, needs 256t update)
└── utils/
    └── hash256t.js         # Server-side 256t hash validation
```

---

## Dependencies

### Frontend
- None (vanilla JavaScript)
- WebCrypto API (built-in) - for SHA-512
- Web Workers (built-in) - for async hashing

### Backend
- Existing: Cloudflare Workers, R2, Durable Objects
- No new dependencies required

---

## Success Criteria

- [ ] User can upload files up to 5GB
- [ ] User can drag-and-drop files
- [ ] 256t hash is correctly calculated (client and server match)
- [ ] Inline content (≤64 bytes) handled correctly
- [ ] Duplicate content is detected and user can extend
- [ ] Cost is displayed after file selection and during upload
- [ ] Balance is checked and deducted correctly
- [ ] Simple spinner shown during upload with cancel option
- [ ] Success redirects to CID detail page
- [ ] Errors show clear messages with manual retry option
- [ ] API key uploads work for CLI/automation
- [ ] All tests pass
- [ ] Accessibility requirements met

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 5GB file browser memory | Browser crash | Use streaming/chunked reading in Web Worker |
| Hash calculation time | Poor UX | Web Worker + progress indication |
| Network interruption | Lost upload, wasted time | Manual retry preserves form state |
| Balance race condition | Double-spend | Server-side atomic balance check (exists) |
| CID mismatch client/server | Data integrity | Server validates hash matches content |

---

## References

- [256t Specification](https://256t.org) (assumed)
- [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Master Plan](master_plan.md)
- [Payments Plan](payments.md)

---

**Document Version:** 1.1
**Created:** 2026-01-15
**Updated:** 2026-01-15
**Status:** Draft - 4 open questions remaining (#21-24)
