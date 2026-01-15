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

## Open Questions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Maximum single file size | A) 100MB (simple), B) 1GB, C) 5GB (R2 single-part max), D) 5TB (R2 multipart) | **TBD** |
| 2 | Maximum upload per request | A) Single file only, B) Multiple files (batch) | **TBD** |
| 3 | File type restrictions | A) No restrictions, B) Block executables, C) Block specific MIME types | **TBD** |
| 4 | Upload progress feedback | A) Simple spinner, B) Progress bar with percentage, C) Progress + speed/ETA | **TBD** |
| 5 | Drag-and-drop support | A) Yes, B) No (file picker only) | **TBD** |
| 6 | Content preview before upload | A) Yes (for images/text), B) No preview | **TBD** |
| 7 | Hash calculation location | A) Client-side only, B) Server-side only, C) Both (client warns, server enforces) | **TBD** |
| 8 | Zero-byte file handling | A) Allow, B) Reject | **TBD** |
| 9 | Resumable uploads | A) Yes (for large files), B) No | **TBD** |
| 10 | Upload cancellation | A) Yes (cancel in-progress), B) No (wait for completion) | **TBD** |
| 11 | Concurrent upload limit | A) 1 at a time, B) 3 concurrent, C) Unlimited | **TBD** |
| 12 | Retention selection UI | A) Dropdown only, B) Slider, C) Dropdown + custom input | **TBD** |
| 13 | Cost display timing | A) After file selection, B) During upload, C) Both | **TBD** |
| 14 | Upload confirmation step | A) Yes (review before upload), B) No (immediate) | **TBD** |
| 15 | Failed upload retry | A) Automatic (with limit), B) Manual only, C) No retry | **TBD** |
| 16 | API key upload support | A) Yes (for CLI/automation), B) Web only | **TBD** |
| 17 | Upload rate limiting | A) None beyond auth, B) X uploads per minute, C) X bytes per hour | **TBD** |
| 18 | Content type detection | A) Trust client MIME, B) Server-side magic bytes, C) Both | **TBD** |
| 19 | Filename handling | A) Store original, B) Hash only (no filename), C) Optional metadata | **TBD** |
| 20 | Success redirect | A) Stay on upload page, B) Go to CID detail page, C) User preference | **TBD** |

---

## Architecture

### Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UPLOAD FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User selects file(s)                                                   │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                   │
│  │ Client-side      │                                                   │
│  │ - Calculate hash │ ◄─── 256t specification                          │
│  │ - Check size     │                                                   │
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
│           │ option           │  │                  │                   │
│           └────────┬─────────┘  └────────┬─────────┘                   │
│                    │                     │                              │
│                    └──────────┬──────────┘                              │
│                               ▼                                         │
│                    ┌──────────────────┐                                 │
│                    │ User confirms    │                                 │
│                    │ (if confirmation │                                 │
│                    │  step enabled)   │                                 │
│                    └────────┬─────────┘                                 │
│                             │                                           │
│                             ▼                                           │
│                    ┌──────────────────┐                                 │
│                    │ POST /api/content│                                 │
│                    │ - FormData       │                                 │
│                    │ - retention_mnths│                                 │
│                    └────────┬─────────┘                                 │
│                             │                                           │
│              ┌──────────────┴──────────────┐                            │
│              │                             │                            │
│        Success                        Failure                           │
│              │                             │                            │
│              ▼                             ▼                            │
│   ┌──────────────────┐         ┌──────────────────┐                    │
│   │ Show CID, expiry │         │ Show error msg   │                    │
│   │ + share options  │         │ (balance, size,  │                    │
│   │                  │         │  validation)     │                    │
│   └──────────────────┘         └──────────────────┘                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Frontend Components
1. **UploadForm** - Main upload interface
2. **FileSelector** - File input with drag-and-drop
3. **HashCalculator** - Client-side 256t hash computation
4. **RetentionPicker** - Duration selection UI
5. **CostDisplay** - Real-time cost calculation
6. **ProgressIndicator** - Upload progress feedback
7. **UploadResult** - Success/failure display

#### API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/content` | POST | Required | Upload content |
| `/api/content/:cid/exists` | GET | Public | Check if CID exists |
| `/api/content/:cid` | GET | Public | Get content metadata |
| `/api/content/:cid/download` | GET | Public | Download content (TODO) |
| `/api/payments/calculate` | POST | Public | Calculate retention cost |

---

## Implementation Phases

### Phase 1: 256t Hash Implementation
- Implement SHA-512 hash generation per 256t specification
- 8-char length prefix + 86-char Base64URL hash
- Content <= 64 bytes: Direct Base64URL encoding
- Content > 64 bytes: SHA-512 hash

### Phase 2: Client-Side Hashing
- JavaScript library for browser-based 256t calculation
- WebCrypto API for SHA-512
- Progress callback for large files
- Worker thread for non-blocking computation

### Phase 3: Frontend Upload UI
- File selection component
- Retention picker with presets (1 month, 1 year, 1 decade, 1 century)
- Cost calculator display
- Balance display and deposit link
- Upload button with confirmation

### Phase 4: Upload Progress
- XMLHttpRequest or fetch with progress events
- Progress bar UI component
- Cancel button (if cancellation supported)
- Speed and ETA display (optional)

### Phase 5: Duplicate Detection
- Client-side hash calculation before upload
- API check for existing CID
- UI for showing duplicate message
- Option to extend existing content

### Phase 6: Error Handling
- Insufficient balance messaging
- File validation errors
- Network error handling
- Retry mechanism (if enabled)

### Phase 7: Success Flow
- Display CID with copy button
- Expiration date display
- Share options (URL, QR code)
- Upload another button

---

## Test Plan

### Unit Tests - 256t Hash Generation

```
describe('256t Hash Generation', () => {
  // Length prefix calculation
  - should return 8-char prefix for any content size
  - should encode size in 6-byte big-endian format
  - should use Base64URL encoding for prefix

  // Small content (≤ 64 bytes) - direct encoding
  - should directly encode empty content (0 bytes)
  - should directly encode 1-byte content
  - should directly encode 64-byte content exactly
  - should use Base64URL without padding

  // Large content (> 64 bytes) - SHA-512 hash
  - should hash 65-byte content
  - should hash 1KB content
  - should hash 1MB content
  - should hash 1GB content
  - should produce consistent hash for same content
  - should produce different hash for different content

  // Format validation
  - should produce max 94 character identifier
  - should contain only URL-safe characters
  - should match format: 8-char prefix + up to 86-char hash

  // Edge cases
  - should handle binary content
  - should handle Unicode text
  - should handle null bytes in content
  - should handle maximum size content (256TB theoretical)
});
```

### Unit Tests - Client-Side Hash Calculator

```
describe('Client Hash Calculator', () => {
  // Basic functionality
  - should calculate hash for File object
  - should calculate hash for Blob
  - should calculate hash for ArrayBuffer

  // Progress reporting
  - should report progress for large files
  - should report 0% at start
  - should report 100% at completion
  - should report intermediate progress

  // Performance
  - should not block main thread
  - should use Web Worker if available
  - should handle files larger than memory
  - should use streaming for large files

  // Error handling
  - should reject on read error
  - should handle file access denied
  - should handle file deleted during read
});
```

### Unit Tests - File Validation

```
describe('File Validation', () => {
  // Size validation
  - should accept file within size limit
  - should reject file exceeding size limit
  - should handle zero-byte file (per decision)
  - should calculate size correctly for large files

  // Type validation (if enabled)
  - should accept allowed MIME types
  - should reject blocked MIME types
  - should detect MIME type from content (if enabled)
  - should handle missing/unknown MIME type

  // Name validation
  - should accept valid filenames
  - should handle filenames with special characters
  - should handle very long filenames
  - should handle missing filename
});
```

### Unit Tests - Retention Picker

```
describe('Retention Picker', () => {
  // Preset selection
  - should have 1 month preset
  - should have 1 year preset
  - should have 1 decade preset
  - should have 1 century preset

  // Custom input
  - should accept custom month value
  - should enforce minimum 1 month
  - should accept very large values (100+ years)
  - should reject non-integer values
  - should reject zero or negative values

  // Cost calculation
  - should update cost on selection change
  - should display cost in dollars
  - should show breakdown if relevant
});
```

### Unit Tests - Cost Display

```
describe('Cost Display', () => {
  // Display format
  - should format cost as $X.XX
  - should show minimum $1.00 for small costs
  - should update in real-time on file change
  - should update in real-time on retention change

  // Balance comparison
  - should show current balance
  - should indicate if balance sufficient
  - should show shortfall amount if insufficient
  - should provide link to deposit if insufficient

  // Edge cases
  - should handle very large costs
  - should handle fractional cents (rounding)
  - should handle zero cost (empty file if allowed)
});
```

### Unit Tests - Upload Form Submission

```
describe('Upload Form Submission', () => {
  // Form validation
  - should require file selection
  - should require retention selection
  - should validate before submission
  - should disable submit during upload

  // Request format
  - should send FormData
  - should include file as 'content'
  - should include retention_months
  - should include auth token in header

  // Progress tracking
  - should update progress during upload
  - should handle progress events
  - should show upload speed (if enabled)
  - should show ETA (if enabled)
});
```

### Unit Tests - Duplicate Detection

```
describe('Duplicate Detection', () => {
  // Client-side check
  - should calculate hash before upload
  - should call /api/content/:cid/exists
  - should show duplicate message if exists
  - should show current expiration for duplicate

  // User flow
  - should allow proceeding (extends retention)
  - should show extension cost
  - should allow canceling upload

  // Edge cases
  - should handle network error on check
  - should handle race condition (uploaded between check and submit)
});
```

### Unit Tests - Error Handling

```
describe('Upload Error Handling', () => {
  // Insufficient balance
  - should show specific message for insufficient balance
  - should show required amount
  - should show current balance
  - should provide deposit link

  // Validation errors
  - should show file too large message
  - should show invalid file type message
  - should show invalid retention message

  // Network errors
  - should detect network failure
  - should offer retry (if enabled)
  - should preserve form state on error

  // Server errors
  - should handle 500 errors gracefully
  - should show user-friendly error message
  - should not expose internal error details
});
```

### Unit Tests - Success Flow

```
describe('Upload Success', () => {
  // Response handling
  - should display returned CID
  - should display expiration date
  - should display new balance
  - should display cost charged

  // Copy functionality
  - should have copy CID button
  - should copy full CID to clipboard
  - should show copy confirmation

  // Share options
  - should generate shareable URL
  - should generate QR code (if enabled)

  // Next actions
  - should offer "upload another" button
  - should offer "view content" link
});
```

### Integration Tests - Full Upload Flow

```
describe('Full Upload Flow', () => {
  // Happy path - new content
  - should complete: select file → set retention → upload → success
  - should deduct from balance
  - should store content in R2
  - should create metadata record
  - should return valid CID

  // Happy path - duplicate content
  - should detect duplicate
  - should extend retention
  - should not re-upload bytes
  - should charge for extension only

  // Insufficient balance path
  - should reject with clear message
  - should not create content
  - should not deduct balance
  - should succeed after deposit

  // Edge cases
  - should handle exactly-sufficient balance
  - should handle maximum file size
  - should handle minimum retention
});
```

### Integration Tests - API Key Upload

```
describe('API Key Upload', () => {
  // Authentication
  - should accept valid API key in header
  - should reject invalid API key
  - should reject expired API key

  // Functionality
  - should work same as session-based upload
  - should respect rate limits
  - should record in user's upload history

  // Error responses
  - should return JSON errors
  - should include appropriate status codes
});
```

### E2E Tests - User Journey

```
describe('E2E Upload Journey', () => {
  // New user upload
  - should sign in → deposit → upload → view content

  // Returning user upload
  - should sign in → upload (has balance) → view content

  // Multiple uploads
  - should upload multiple files sequentially
  - should track all in upload history
  - should update balance correctly

  // Error recovery
  - should recover from network error
  - should retry failed upload
  - should complete after balance deposit
});
```

### Security Tests

```
describe('Upload Security', () => {
  // Authentication
  - should reject unauthenticated upload
  - should validate session token
  - should validate API key format and validity

  // Authorization
  - should only charge uploader's balance
  - should associate content with correct user

  // Input validation
  - should sanitize filename
  - should validate content type
  - should enforce size limits server-side

  // Attack prevention
  - should prevent path traversal in filename
  - should limit request size
  - should rate limit uploads
  - should prevent content-type spoofing
});
```

### Performance Tests

```
describe('Upload Performance', () => {
  // Response times
  - should complete small file upload in <2s
  - should maintain progress updates during large upload
  - should not timeout for large files

  // Client performance
  - should not freeze UI during hash calculation
  - should use streaming for large file hashing
  - should handle concurrent operations

  // Server performance
  - should handle concurrent uploads from same user
  - should handle concurrent uploads from different users
});
```

### Accessibility Tests

```
describe('Upload Accessibility', () => {
  // Keyboard navigation
  - should allow file selection via keyboard
  - should support tab navigation through form
  - should allow form submission via Enter

  // Screen reader support
  - should have descriptive labels
  - should announce progress updates
  - should announce success/error states

  // Visual accessibility
  - should have sufficient color contrast
  - should not rely solely on color for status
  - should support reduced motion preference
});
```

---

## File Structure

```
frontend/
├── js/
│   ├── upload.js           # Main upload page logic
│   ├── hash256t.js         # 256t hash calculation
│   ├── file-validator.js   # File validation
│   ├── retention-picker.js # Retention UI component
│   ├── cost-calculator.js  # Cost display component
│   └── upload-progress.js  # Progress indicator
├── css/
│   └── upload.css          # Upload page styles
└── upload.html             # Upload page

src/
├── api/
│   └── content.js          # Upload API handler (exists)
└── utils/
    └── hash256t.js         # Server-side hash (TODO)
```

---

## Dependencies

### Frontend
- None (vanilla JavaScript)
- WebCrypto API (built-in)
- Web Workers (built-in)

### Backend
- Existing: Cloudflare Workers, R2, Durable Objects
- No new dependencies required

---

## Success Criteria

- [ ] User can upload files up to configured size limit
- [ ] 256t hash is correctly calculated
- [ ] Duplicate content is detected and handled
- [ ] Cost is displayed before upload
- [ ] Balance is checked and deducted
- [ ] Upload progress is shown
- [ ] Success displays CID with copy button
- [ ] Errors are handled gracefully
- [ ] All tests pass
- [ ] Accessibility requirements met

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file handling | Browser memory/crash | Use streaming, chunked reading |
| Hash calculation time | Poor UX | Web Worker, progress indication |
| Network interruption | Lost upload | Retry mechanism, resumable upload |
| Balance race condition | Double-spend | Server-side atomicity (exists) |
| Content type spoofing | Security | Server-side validation |

---

## References

- [256t Specification](https://256t.org) (assumed)
- [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Master Plan](master_plan.md)
- [Payments Plan](payments.md)

---

**Document Version:** 1.0
**Created:** 2026-01-15
**Status:** Draft - Awaiting decisions on open questions
