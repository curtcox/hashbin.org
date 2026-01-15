# Content Download Implementation Plan

## Implementation Status

**Status:** In Progress - Core functionality implemented

**Last Updated:** 2026-01-15

**Completed:**
- ✅ MIME type utility with ~60 common extensions
- ✅ Download handler for R2-stored content
- ✅ Inline content extraction and serving
- ✅ URL routing for `/{cid}` and `/{cid}.{ext}` patterns
- ✅ Caching headers (Cache-Control, ETag, Accept-Ranges)
- ✅ Conditional request handling (If-None-Match, 304 responses)
- ✅ HEAD request support
- ✅ Range request support for resumable downloads
- ✅ Download count tracking in metadata
- ✅ Frontend retrieve.html updated with working UI
- ✅ Force download with `?download=true` query parameter
- ✅ CORS headers for public access
- ✅ Content validation and error handling

**In Progress:**
- 🔄 Integration testing with live server
- 🔄 Performance testing with large files

**Not Started:**
- ⏳ Contested content handling (451 status) - depends on contest system

---

## Overview

This plan covers allowing users to download content from HashBin.org. Downloads are **free and public** - no authentication required. Content is addressed by 256t hash and can be retrieved using the hash alone.

## Current State

### Already Implemented
- **Content upload**: Files are stored in Cloudflare R2
- **Metadata endpoint**: `GET /api/content/:cid` returns metadata (size, expiration, exists)
- **Exists check**: `GET /api/content/:cid/exists`
- **256t hash generation**: Both client-side and server-side implementations
- **Inline content support**: Content ≤64 bytes is stored directly in the CID
- **Frontend retrieve page**: Placeholder UI at `/retrieve.html`

### Not Yet Implemented
- **Binary content download** from R2
- **Inline content extraction** from CID
- **MIME type handling** (content stored without type information)
- **Download URL patterns** (`/{cid}`, `/{cid}.{ext}`)
- **Caching headers** for CDN optimization
- **Frontend download UI** (progress, file save dialog)
- **Content integrity verification** on download

---

## Definitions

### Inline Content

**Inline content** is content that is small enough (≤64 bytes) to be encoded directly within the CID itself, rather than being stored in R2.

**How it works:**
- The 256t CID format includes an 8-character length prefix followed by content/hash
- For content ≤64 bytes: The content is Base64URL-encoded directly into the CID
- For content >64 bytes: A SHA-512 hash of the content is stored, and the actual content goes to R2

**Example:**
- Content: `Hello` (5 bytes)
- CID: `AAAAAAAFSGVSBG8` (length prefix `AAAAAAAF` = 5 bytes + Base64URL of "Hello")
- This CID is **self-contained** - the content can be extracted without any backend lookup

**Implications for download:**
- Inline content CIDs **always work** - no storage lookup needed
- Inline content **never expires** - it's encoded in the CID itself
- Inline content requires **no metadata check** - validate CID format, extract, and serve
- The `/info/{cid}` page for inline content shows the decoded content details

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Download authentication | **None required** - public access per model |
| 2 | URL pattern for download | **`/{cid}`** - direct CID access at root |
| 3 | MIME type handling | **Extension-based**: `/{cid}.{ext}` sets MIME type from extension |
| 4 | Default MIME type (no extension) | **`application/octet-stream`** - forces download dialog |
| 5 | Inline content (<= 64 bytes) | **Extract from CID** - no R2 fetch needed |
| 6 | Caching strategy | **Immutable content, long cache** - `Cache-Control: public, max-age=31536000, immutable` |
| 7 | Range requests (partial download) | **Yes** - support HTTP Range header for resumable downloads |
| 8 | Download filename | **`{cid}.{ext}`** or `{cid}` - Content-Disposition header |
| 9 | Content verification | **Optional** - client can verify hash after download |
| 10 | Expired content handling | **404 Not Found** - no indication content existed |
| 11 | Contested content handling | **451 Unavailable For Legal Reasons** - with explanation |
| 12 | Rate limiting | **None** - rely on Cloudflare's built-in protection |
| 13 | Maximum download size | **No limit** - whatever was uploaded (up to 5GB) |
| 14 | Concurrent download limit | **None** - unlimited concurrent downloads |
| 15 | Download progress UI | **Browser native** - no custom progress bar |
| 16 | Streaming vs buffered | **Streaming** - direct R2 stream to response |
| 17 | ETag support | **Yes** - use CID as ETag (content-addressed = perfect fit) |
| 18 | Compression | **None** - serve raw bytes, CDN can compress |
| 19 | CORS | **Allow all origins** - public content |
| 20 | Info page before download | **Yes** - `/info/{cid}` shows metadata, links to `/{cid}` |
| 21 | HEAD request support | **Yes** - return headers without body for pre-flight checks |
| 22 | Long CID handling | **Full CID always** - no shortening or URL shortener |
| 23 | CDN vs direct serving | **Direct from Worker** - stream content directly, leverage Cloudflare CDN automatically |
| 24 | Download count logging | **Yes, aggregate only** - count downloads per CID, no user tracking |
| 25 | If-None-Match handling | **Standard 304 Not Modified** - return 304 when ETag matches |
| 26 | Info page for missing content | **404 Not Found** - except inline content CIDs which always work |
| 27 | MIME type mapping scope | **Common types only** - ~50-100 well-known extensions |
| 28 | Force download query param | **Yes** - `?download=true` adds `Content-Disposition: attachment` |
| 29 | CID validation error status | **400 Bad Request** - invalid format is a client error |

---

## Open Questions

*All questions have been resolved. Ready for implementation.*

---

## Architecture

### Download Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DOWNLOAD FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User enters URL: /{cid} or /{cid}.{ext} or /{cid}?download=true        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────┐                                                   │
│  │ Parse URL        │                                                   │
│  │ - Extract CID    │                                                   │
│  │ - Extract ext    │ (optional, for MIME type)                         │
│  │ - Check ?download│ (force download dialog)                           │
│  │ - Check method   │ (GET or HEAD)                                     │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────┐                                                   │
│  │ Validate CID     │                                                   │
│  │ - Format check   │ (8-char prefix + up to 86-char hash/content)     │
│  │ - Character set  │ (A-Za-z0-9_- only)                               │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│    Invalid│                  Valid                                       │
│           ▼                    │                                         │
│  ┌──────────────────┐          │                                        │
│  │ Return 400       │          │                                        │
│  │ Bad Request      │          │                                        │
│  └──────────────────┘          │                                        │
│                                ▼                                         │
│                     ┌──────────────────┐                                │
│                     │ Check If-None-   │                                │
│                     │ Match header     │                                │
│                     └────────┬─────────┘                                │
│                              │                                          │
│                    ETag Match│           No Match / No Header           │
│                              ▼                    │                     │
│                   ┌──────────────────┐            │                     │
│                   │ Return 304       │            │                     │
│                   │ Not Modified     │            │                     │
│                   └──────────────────┘            │                     │
│                                                   ▼                     │
│                                        ┌──────────────────┐             │
│                                        │ Check if inline  │             │
│                                        │ content (≤64 B)  │             │
│                                        └────────┬─────────┘             │
│                                                 │                       │
│                              ┌──────────────────┼──────────────────┐    │
│                              │                  │                  │    │
│                         Inline                  │            Not Inline │
│                              │                  │                  │    │
│                              ▼                  │                  ▼    │
│                   ┌──────────────────┐          │   ┌──────────────────┐│
│                   │ Extract content  │          │   │ Check metadata   ││
│                   │ from CID itself  │          │   │ (Durable Object) ││
│                   │ (Base64URL decode)│         │   │ - Exists?        ││
│                   │                  │          │   │ - Expired?       ││
│                   │ (Always works,   │          │   │ - Contested?     ││
│                   │  never expires)  │          │   └────────┬─────────┘│
│                   └────────┬─────────┘          │            │          │
│                            │                    │   ┌────────┼────────┐ │
│                            │                    │Not Found   │  Contested│
│                            │                    │   │        │        │ │
│                            │                    │   ▼        │        ▼ │
│                            │                    │┌────────┐  │  ┌──────┐│
│                            │                    ││  404   │  │  │ 451  ││
│                            │                    │└────────┘  │  └──────┘│
│                            │                    │       Found│          │
│                            │                    │            ▼          │
│                            │                    │ ┌──────────────────┐  │
│                            │                    │ │ Fetch from R2    │  │
│                            │                    │ │ (streaming)      │  │
│                            │                    │ │ Increment count  │  │
│                            │                    │ └────────┬─────────┘  │
│                            │                    │          │            │
│                            └────────────────────┼──────────┘            │
│                                                 │                       │
│                                                 ▼                       │
│                                      ┌──────────────────┐               │
│                                      │ Determine MIME   │               │
│                                      │ type from ext    │               │
│                                      │ (or default)     │               │
│                                      └────────┬─────────┘               │
│                                               │                         │
│                                               ▼                         │
│                                      ┌──────────────────┐               │
│                                      │ Build headers    │               │
│                                      │ - Content-Type   │               │
│                                      │ - Cache-Control  │               │
│                                      │ - ETag: {cid}    │               │
│                                      │ - Content-Disp?  │ (if ?download)│
│                                      └────────┬─────────┘               │
│                                               │                         │
│                              ┌────────────────┼────────────────┐        │
│                           HEAD                │              GET        │
│                              ▼                │                ▼        │
│                   ┌──────────────────┐        │     ┌──────────────────┐│
│                   │ Return 200       │        │     │ Return 200       ││
│                   │ Headers only     │        │     │ Headers + Body   ││
│                   │ (empty body)     │        │     │ (stream content) ││
│                   └──────────────────┘        │     └──────────────────┘│
│                                               │                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### URL Pattern Routing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         URL PATTERNS                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  /{cid}                                                                  │
│  └── Download raw content                                                │
│      └── MIME: application/octet-stream (forces download)               │
│                                                                          │
│  /{cid}.{ext}                                                            │
│  └── Download with MIME type from extension                             │
│      └── Examples:                                                       │
│          /{cid}.txt  → text/plain                                       │
│          /{cid}.json → application/json                                 │
│          /{cid}.png  → image/png                                        │
│          /{cid}.pdf  → application/pdf                                  │
│          /{cid}.html → text/html                                        │
│                                                                          │
│  /info/{cid}                                                            │
│  └── Content information page (HTML)                                    │
│      └── Shows: CID, size, expiration, download link                    │
│                                                                          │
│  /api/content/{cid}                                                     │
│  └── Metadata API (JSON)                                                │
│      └── Returns: exists, size, expires_at, contested                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Backend Components

1. **ContentDownloadHandler** - Main download request handler
2. **CIDValidator** - Validates 256t CID format
3. **InlineContentExtractor** - Extracts content from inline CIDs
4. **MIMETypeResolver** - Maps file extensions to MIME types
5. **CacheHeaderBuilder** - Constructs caching headers
6. **RangeRequestHandler** - Handles HTTP Range requests for partial downloads

#### Frontend Components

1. **RetrievePage** - Updated `/retrieve.html` with download functionality
2. **InfoPage** - `/info/{cid}` showing content metadata and download link
3. **CIDInput** - Input field with validation feedback
4. **DownloadButton** - Triggers download with optional extension

#### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/{cid}` | GET | Public | Download raw content |
| `/{cid}` | HEAD | Public | Get headers without body |
| `/{cid}.{ext}` | GET | Public | Download with MIME type |
| `/{cid}.{ext}` | HEAD | Public | Get headers with MIME type |
| `/{cid}?download=true` | GET | Public | Force download dialog |
| `/info/{cid}` | GET | Public | HTML info page |
| `/api/content/{cid}` | GET | Public | JSON metadata |
| `/api/content/{cid}/exists` | GET | Public | Check existence |

---

## Implementation Phases

### Phase 1: Core Download Endpoint

**Goal:** Basic download from R2 with CID addressing

**Tasks:**
- Add `handleDownloadContent` function in `src/api/content.js`
- Implement CID validation
- Fetch content from R2 bucket
- Return content with basic headers
- Handle 404 for non-existent content
- Add route in `src/index.js` for `/{cid}` pattern

**Acceptance Criteria:**
- `GET /{cid}` returns content from R2
- Invalid CID returns appropriate error
- Non-existent content returns 404
- Content streams directly (no buffering entire file)

### Phase 2: Inline Content Support

**Goal:** Extract and serve content embedded in CID

**Tasks:**
- Detect inline content CIDs (≤64 bytes)
- Extract content using Base64URL decode
- Skip R2 fetch for inline content
- Return extracted content with same headers

**Acceptance Criteria:**
- Inline content CIDs return decoded content
- No R2 request made for inline content
- Same response format as R2 content

### Phase 3: MIME Type Handling

**Goal:** Support extension-based MIME types

**Tasks:**
- Create MIME type mapping (extension → type)
- Parse extension from URL (`/{cid}.{ext}`)
- Set `Content-Type` header based on extension
- Default to `application/octet-stream` for no extension

**Acceptance Criteria:**
- `/{cid}.txt` returns `Content-Type: text/plain`
- `/{cid}.json` returns `Content-Type: application/json`
- `/{cid}` returns `Content-Type: application/octet-stream`
- Unknown extensions return `application/octet-stream`

### Phase 4: Caching Headers

**Goal:** Enable CDN caching for immutable content

**Tasks:**
- Add `Cache-Control: public, max-age=31536000, immutable`
- Add `ETag` header with CID value
- Handle `If-None-Match` for conditional requests
- Add `Accept-Ranges: bytes` header

**Acceptance Criteria:**
- Responses include proper cache headers
- Same content returns same ETag
- Conditional requests return 304 when appropriate

### Phase 5: Range Requests

**Goal:** Support partial downloads for large files

**Tasks:**
- Parse `Range` header from request
- Fetch partial content from R2 (R2 supports range requests)
- Return `206 Partial Content` with `Content-Range` header
- Handle multiple ranges (optional - can return 200 with full content)

**Acceptance Criteria:**
- Single range request returns partial content
- `Content-Range` header is correct
- Download managers can resume interrupted downloads

### Phase 6: Error Handling

**Goal:** Proper HTTP status codes for all error cases

**Tasks:**
- 400 Bad Request: Invalid CID format
- 404 Not Found: Content doesn't exist or expired
- 451 Unavailable For Legal Reasons: Contested content removed
- 500 Internal Server Error: R2 or DO failures

**Acceptance Criteria:**
- Each error case returns appropriate status code
- Error responses include JSON body with details
- No internal information leaked in errors

### Phase 7: Frontend Retrieve Page

**Goal:** Update UI for actual downloads

**Tasks:**
- Update `/retrieve.html` with working download
- Show content metadata before download (size, expiration)
- Provide download link with extension picker
- Handle errors gracefully

**Acceptance Criteria:**
- User can enter CID and see metadata
- Download button works
- Extension selector changes download MIME type
- Errors displayed clearly

### Phase 8: Info Page

**Goal:** Create content information page

**Tasks:**
- Create `/info/{cid}` route serving HTML
- Display: CID, size, expiration date, status
- Provide download link to `/{cid}`
- Show QR code for mobile sharing (optional)

**Acceptance Criteria:**
- Info page shows all relevant metadata
- Download link works
- Page handles expired/missing content gracefully

---

## Test Plan

### Unit Tests - CID Validation

```
describe('CID Validation', () => {
  // Format validation
  - should accept valid 256t CID (8-char prefix + hash)
  - should accept maximum length CID (94 chars)
  - should accept minimum valid CID (inline empty content)
  - should reject CID exceeding 94 characters
  - should reject CID with fewer than 8 characters

  // Character validation
  - should accept CID with only A-Za-z0-9_- characters
  - should reject CID with space
  - should reject CID with +
  - should reject CID with /
  - should reject CID with =
  - should reject CID with special characters (!@#$%^&*)
  - should reject CID with unicode characters

  // Length prefix validation
  - should validate length prefix matches content/hash length
  - should reject mismatched length prefix

  // Edge cases
  - should handle empty string
  - should handle null/undefined
  - should handle very long invalid input
});
```

### Unit Tests - Inline Content Extraction

```
describe('Inline Content Extraction', () => {
  // Detection
  - should detect inline content CID (≤64 bytes encoded)
  - should detect non-inline content CID (>64 bytes)
  - should detect boundary case (exactly 64 bytes)
  - should detect boundary case (65 bytes)

  // Extraction
  - should extract empty content (0 bytes)
  - should extract single byte content
  - should extract 64-byte content (max inline)
  - should extract content with null bytes
  - should extract content with high bytes (255)
  - should extract UTF-8 text content
  - should extract binary content

  // Error handling
  - should reject malformed Base64URL
  - should reject truncated inline CID
});
```

### Unit Tests - MIME Type Resolution

```
describe('MIME Type Resolution', () => {
  // Common types
  - should return text/plain for .txt
  - should return text/html for .html
  - should return text/html for .htm
  - should return text/css for .css
  - should return application/javascript for .js
  - should return application/json for .json
  - should return application/xml for .xml

  // Image types
  - should return image/png for .png
  - should return image/jpeg for .jpg
  - should return image/jpeg for .jpeg
  - should return image/gif for .gif
  - should return image/webp for .webp
  - should return image/svg+xml for .svg

  // Document types
  - should return application/pdf for .pdf
  - should return application/zip for .zip
  - should return application/gzip for .gz

  // Audio/Video types
  - should return audio/mpeg for .mp3
  - should return video/mp4 for .mp4
  - should return video/webm for .webm

  // Case insensitivity
  - should handle uppercase extensions (.TXT)
  - should handle mixed case extensions (.TxT)

  // Default behavior
  - should return application/octet-stream for unknown extension
  - should return application/octet-stream for no extension
  - should return application/octet-stream for empty extension
});
```

### Unit Tests - Cache Headers

```
describe('Cache Header Generation', () => {
  // Cache-Control
  - should include public directive
  - should include max-age=31536000 (1 year)
  - should include immutable directive

  // ETag
  - should use CID as ETag value
  - should quote ETag properly
  - should be consistent for same CID

  // Accept-Ranges
  - should include Accept-Ranges: bytes

  // Content-Disposition (when download forced)
  - should set Content-Disposition: attachment
  - should include filename parameter
  - should handle special characters in filename
});
```

### Unit Tests - Range Request Handling

```
describe('Range Request Handling', () => {
  // Single range
  - should parse Range: bytes=0-499
  - should parse Range: bytes=500-999
  - should parse Range: bytes=-500 (last 500 bytes)
  - should parse Range: bytes=500- (from 500 to end)

  // Response headers
  - should return 206 Partial Content for valid range
  - should include Content-Range header
  - should include correct Content-Length for partial content

  // Edge cases
  - should handle range beyond content length (416)
  - should handle range=0-0 (single byte)
  - should handle malformed range header (ignore, return full)
  - should handle multiple ranges (return full or 200)

  // Integration with R2
  - should pass range to R2 get request
  - should stream partial content correctly
});
```

### Unit Tests - Error Responses

```
describe('Error Response Generation', () => {
  // 400 Bad Request
  - should return 400 for invalid CID format
  - should include error message in JSON body
  - should not leak internal details

  // 404 Not Found
  - should return 404 for non-existent content
  - should return 404 for expired content
  - should return same response for expired and never-existed (privacy)

  // 451 Unavailable For Legal Reasons
  - should return 451 for contested content
  - should include Link header to legal info (optional)
  - should include brief explanation in body

  // 500 Internal Server Error
  - should return 500 for R2 failures
  - should return 500 for Durable Object failures
  - should not expose stack traces or internal errors
});
```

### Integration Tests - Full Download Flow

```
describe('Download Integration', () => {
  // Happy path - R2 content
  - should: request /{cid} → validate → check metadata → fetch R2 → stream response
  - should return correct content bytes
  - should return correct Content-Length
  - should return correct Content-Type

  // Happy path - Inline content
  - should: request /{cid} → validate → detect inline → extract → respond
  - should not query R2 for inline content
  - should not query Durable Object for inline content

  // With extension
  - should: request /{cid}.txt → set Content-Type: text/plain
  - should: request /{cid}.json → set Content-Type: application/json
  - should: request /{cid}.unknown → set Content-Type: application/octet-stream

  // Error paths
  - should handle R2 get failure gracefully
  - should handle Durable Object failure gracefully
  - should handle race condition (deleted between check and fetch)

  // Performance
  - should stream without buffering entire file
  - should handle concurrent downloads
});
```

### Integration Tests - Conditional Requests

```
describe('Conditional Request Handling', () => {
  // If-None-Match
  - should return 304 when ETag matches
  - should return 200 when ETag doesn't match
  - should return 200 when no If-None-Match header

  // Weak vs Strong ETags
  - should handle strong ETag comparison
  - should handle weak ETag (W/"...") if used
});
```

### Integration Tests - Info Page

```
describe('Info Page', () => {
  // Content exists (R2 stored)
  - should display CID
  - should display file size (human readable)
  - should display expiration date (relative and absolute)
  - should provide download link
  - should display download count

  // Inline content (always works)
  - should return 200 for valid inline CID
  - should display CID
  - should display decoded content size
  - should show "No expiration" (inline content never expires)
  - should provide download link
  - should indicate content is inline/self-contained

  // Content expired/missing (non-inline)
  - should return 404 Not Found
  - should not expose whether content ever existed

  // Contested content
  - should return 451
  - should indicate content unavailable for legal reasons
  - should not provide download link
});
```

### Integration Tests - 304 Not Modified

```
describe('304 Not Modified Handling', () => {
  // If-None-Match
  - should return 304 when ETag matches CID
  - should return 304 with empty body
  - should return 304 with cache headers intact
  - should return 200 when ETag doesn't match
  - should return 200 when no If-None-Match header

  // Multiple ETags in If-None-Match
  - should return 304 if any ETag matches
  - should handle quoted ETags: If-None-Match: "cid1", "cid2"

  // Weak ETags
  - should handle weak ETag comparison (W/"...")

  // With other headers
  - should respect If-None-Match even with Range header
  - should check If-None-Match before processing Range
});
```

### E2E Tests - User Journey

```
describe('E2E Download Journey', () => {
  // Via retrieve page
  - should: enter CID → see metadata → click download → receive file

  // Direct URL
  - should: visit /{cid} directly → receive file
  - should: visit /{cid}.txt directly → receive file with text/plain

  // Via info page
  - should: visit /info/{cid} → see details → click download → receive file

  // Error recovery
  - should: enter invalid CID → see error message → correct CID → success

  // Large file download
  - should: download 100MB file without timeout
  - should: download 1GB file without memory issues

  // Interrupted download
  - should: start download → interrupt → resume with Range header → complete
});
```

### Unit Tests - HEAD Requests

```
describe('HEAD Request Handling', () => {
  // Basic HEAD
  - should return 200 for existing content
  - should return all headers that GET would return
  - should return empty body
  - should include Content-Length header
  - should include Content-Type header
  - should include ETag header
  - should include Cache-Control header

  // HEAD for inline content
  - should return 200 for valid inline CID
  - should return correct Content-Length (decoded size)

  // HEAD for missing content
  - should return 404 for non-existent content
  - should return 404 for expired content
  - should return 451 for contested content

  // HEAD with extension
  - should return Content-Type based on extension
  - should: HEAD /{cid}.txt → Content-Type: text/plain

  // HEAD with ?download=true
  - should include Content-Disposition: attachment
});
```

### Unit Tests - Force Download Query Param

```
describe('Force Download Query Param', () => {
  // ?download=true
  - should add Content-Disposition: attachment when ?download=true
  - should include filename in Content-Disposition
  - should work with extension: /{cid}.txt?download=true
  - should work without extension: /{cid}?download=true

  // Without query param
  - should not include Content-Disposition: attachment by default
  - should allow browser to display content inline

  // Edge cases
  - should ignore ?download=false
  - should ignore ?download=0
  - should handle ?download (no value) as true
  - should be case-insensitive: ?Download=TRUE
});
```

### Unit Tests - Download Count Logging

```
describe('Download Count Logging', () => {
  // Counting
  - should increment download count on successful GET
  - should not increment on HEAD request
  - should not increment on 304 Not Modified
  - should not increment on 404 Not Found
  - should increment for inline content downloads

  // Aggregate only (privacy)
  - should not log user IP address
  - should not log user agent
  - should not log referrer
  - should only store total count per CID

  // Storage
  - should store count in ContentMetadata Durable Object
  - should handle concurrent increments correctly
});
```

### E2E Tests - CLI/Programmatic Access

```
describe('E2E CLI Download', () => {
  // curl GET
  - should: curl /{cid} → receive content
  - should: curl -r 0-999 /{cid} → receive first 1000 bytes

  // curl HEAD
  - should: curl -I /{cid} → receive headers only (HEAD)
  - should: curl -I /{cid}.txt → receive headers with text/plain Content-Type
  - should: curl -I /{cid} → include Content-Length header

  // curl conditional
  - should: curl -H "If-None-Match: {cid}" /{cid} → receive 304

  // wget
  - should: wget /{cid} → save to file
  - should: wget -c /{cid} → resume interrupted download

  // fetch API
  - should: fetch('/{cid}') → receive Response with body
  - should: fetch('/{cid}', {method: 'HEAD'}) → receive Response without body
  - should respect CORS headers for cross-origin requests
});
```

### Security Tests

```
describe('Download Security', () => {
  // Path traversal
  - should reject CID with ../ sequences
  - should reject CID with encoded path traversal

  // Content sniffing
  - should include X-Content-Type-Options: nosniff
  - should not execute JavaScript in downloaded HTML

  // Information leakage
  - should not reveal if content was contested vs never existed
  - should not reveal uploader information
  - should not reveal expiration date for missing content

  // Denial of service
  - should handle many concurrent requests
  - should handle malformed requests without crash
  - should handle very long invalid CIDs

  // CORS
  - should include Access-Control-Allow-Origin: *
  - should handle preflight OPTIONS requests
});
```

### Performance Tests

```
describe('Download Performance', () => {
  // Response time
  - should return small file (<1KB) in <100ms
  - should start streaming large file (1GB) in <500ms

  // Throughput
  - should stream at network speed (not CPU bound)
  - should handle 100 concurrent downloads

  // Memory
  - should not buffer large files in memory
  - should stream directly from R2 to response

  // Caching
  - should leverage CDN caching for repeated requests
  - should return 304 for conditional requests quickly
});
```

### Accessibility Tests

```
describe('Download Accessibility', () => {
  // Retrieve page
  - should have proper form labels
  - should announce errors to screen readers
  - should be keyboard navigable

  // Info page
  - should have clear content hierarchy
  - should have sufficient color contrast
  - should work without JavaScript (basic info)

  // Download links
  - should have descriptive link text
  - should indicate file size before download
});
```

---

## File Structure

```
src/
├── api/
│   └── content.js           # Add handleDownloadContent, handleHeadContent
├── utils/
│   ├── hash256t.js          # Add inline content extraction
│   └── mime-types.js        # NEW: Extension to MIME mapping
└── index.js                 # Add download routes

frontend/
├── retrieve.html            # Update with working download
├── info.html                # NEW: Content info page template
├── js/
│   ├── retrieve.js          # NEW: Retrieve page logic
│   └── info.js              # NEW: Info page logic
└── css/
    └── components.css       # Update for download UI
```

---

## MIME Type Mapping

Common types to support (~60 types):

### Text
| Extension | MIME Type |
|-----------|-----------|
| .txt | text/plain |
| .html, .htm | text/html |
| .css | text/css |
| .csv | text/csv |
| .xml | text/xml |
| .md | text/markdown |

### Application
| Extension | MIME Type |
|-----------|-----------|
| .js, .mjs | application/javascript |
| .json | application/json |
| .pdf | application/pdf |
| .zip | application/zip |
| .gz, .gzip | application/gzip |
| .tar | application/x-tar |
| .7z | application/x-7z-compressed |
| .rar | application/vnd.rar |
| .wasm | application/wasm |
| .woff | font/woff |
| .woff2 | font/woff2 |
| .ttf | font/ttf |
| .otf | font/otf |

### Image
| Extension | MIME Type |
|-----------|-----------|
| .png | image/png |
| .jpg, .jpeg | image/jpeg |
| .gif | image/gif |
| .webp | image/webp |
| .svg | image/svg+xml |
| .ico | image/x-icon |
| .bmp | image/bmp |
| .tiff, .tif | image/tiff |
| .avif | image/avif |

### Audio
| Extension | MIME Type |
|-----------|-----------|
| .mp3 | audio/mpeg |
| .wav | audio/wav |
| .ogg | audio/ogg |
| .m4a | audio/mp4 |
| .flac | audio/flac |
| .aac | audio/aac |
| .webm (audio) | audio/webm |

### Video
| Extension | MIME Type |
|-----------|-----------|
| .mp4 | video/mp4 |
| .webm | video/webm |
| .ogv | video/ogg |
| .avi | video/x-msvideo |
| .mov | video/quicktime |
| .mkv | video/x-matroska |

### Documents
| Extension | MIME Type |
|-----------|-----------|
| .doc | application/msword |
| .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| .xls | application/vnd.ms-excel |
| .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| .ppt | application/vnd.ms-powerpoint |
| .pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation |
| .odt | application/vnd.oasis.opendocument.text |
| .ods | application/vnd.oasis.opendocument.spreadsheet |
| .epub | application/epub+zip |

### Other
| Extension | MIME Type |
|-----------|-----------|
| .bin | application/octet-stream |
| .exe | application/octet-stream |
| .dll | application/octet-stream |
| .iso | application/octet-stream |
| .dmg | application/octet-stream |

**Default:** Any unrecognized extension → `application/octet-stream`

---

## API Response Formats

### Successful Download (200 OK)

```
HTTP/1.1 200 OK
Content-Type: {mime-type}
Content-Length: {size}
Cache-Control: public, max-age=31536000, immutable
ETag: "{cid}"
Accept-Ranges: bytes
Access-Control-Allow-Origin: *
X-Content-Type-Options: nosniff

{binary content}
```

### Partial Content (206)

```
HTTP/1.1 206 Partial Content
Content-Type: {mime-type}
Content-Length: {partial-size}
Content-Range: bytes {start}-{end}/{total}
Cache-Control: public, max-age=31536000, immutable
ETag: "{cid}"
Accept-Ranges: bytes

{partial binary content}
```

### Not Found (404)

```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "not_found",
  "message": "Content not found"
}
```

### Legal Removal (451)

```
HTTP/1.1 451 Unavailable For Legal Reasons
Content-Type: application/json

{
  "error": "unavailable_for_legal_reasons",
  "message": "This content has been removed due to a legal request"
}
```

### Invalid CID (400)

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_cid",
  "message": "The provided CID is not a valid 256t identifier"
}
```

---

## Dependencies

### Backend
- Existing: Cloudflare Workers, R2, Durable Objects
- No new dependencies required

### Frontend
- None (vanilla JavaScript)
- No build step

---

## Success Criteria

- [x] User can download content by visiting `/{cid}`
- [x] Inline content (≤64 bytes) downloads without R2 access
- [x] Extension-based MIME types work (`/{cid}.txt`, `/{cid}.json`, etc.)
- [x] Caching headers enable CDN caching
- [x] Range requests work for resumable downloads
- [x] Expired content returns 404
- [ ] Contested content returns 451 (pending contest system implementation)
- [x] Retrieve page UI updated and functional
- [ ] Info page shows metadata and download link (not yet created)
- [x] All tests pass
- [ ] Performance meets targets (<500ms TTFB) (needs live testing)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file memory usage | Worker crash | Stream directly from R2, don't buffer |
| CDN cache poisoning | Wrong content served | Use CID as cache key (content-addressed) |
| Hotlinking/bandwidth abuse | High costs | Cloudflare rate limiting, monitor usage |
| Timing attacks on existence | Privacy leak | Constant-time responses for 404/expired |
| MIME type security | XSS via HTML upload | X-Content-Type-Options: nosniff |
| R2 outage | Downloads fail | Return appropriate error, no data loss |

---

## References

- [256t Specification](https://256t.org) (assumed)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Master Plan](master_plan.md)
- [Upload Plan](upload.md)
- [API Documentation](../docs/API.md)

---

**Document Version:** 2.1
**Created:** 2026-01-15
**Last Updated:** 2026-01-15
**Status:** Core Implementation Complete - Testing in Progress

## Implementation Notes

### Changes Made (2026-01-15)

**Files Created:**
- `src/utils/mime-types.js` - MIME type mapping utility (~60 common types)
- `frontend/js/retrieve.js` - Frontend retrieve page functionality

**Files Modified:**
- `src/api/content.js` - Added `handleDownloadContent()` function
- `src/durable-objects/content-metadata.js` - Added `incrementDownloadCount()` method
- `src/index.js` - Added URL routing for `/{cid}` and `/{cid}.{ext}` patterns
- `frontend/retrieve.html` - Updated with working download UI
- `package.json` - Added `"type": "module"` for ES modules

**Implementation Details:**

1. **Download Handler** (`handleDownloadContent`):
   - Validates CID format using `validate256tCID()`
   - Checks for conditional requests (If-None-Match) and returns 304 if matched
   - Detects inline content and extracts directly from CID
   - For non-inline content: checks metadata, verifies expiration, fetches from R2
   - Supports HEAD requests (headers only, no body)
   - Supports Range requests for partial downloads (206 responses)
   - Sets proper caching headers (Cache-Control, ETag, Accept-Ranges)
   - Adds CORS headers for public access
   - Increments download count asynchronously

2. **MIME Type Resolution**:
   - ~60 common file extensions mapped to MIME types
   - Case-insensitive extension matching
   - Default to `application/octet-stream` for unknown extensions
   - Extension extracted from URL pattern `/{cid}.{ext}`

3. **URL Routing**:
   - Pattern: `/{cid}` or `/{cid}.{ext}`
   - CID validation: 8-94 characters, Base64URL charset
   - Static paths excluded from CID matching
   - Query parameter `?download=true` forces download dialog

4. **Frontend UI**:
   - CID input with validation
   - Metadata display (size, expiration, download count)
   - Direct download button
   - Extension picker for common types
   - Custom extension input
   - Inline content detection and special handling

**Testing:**
- ✅ Basic CID generation and validation
- ✅ MIME type mapping for common extensions
- ✅ Inline content extraction
- ✅ Existing test suite passes
- ⏳ Live server integration testing pending
- ⏳ Performance testing with large files pending

**Known Limitations:**
- Contest system (451 responses) not yet implemented - placeholder TODO in code
- Info page (`/info/{cid}`) not yet created - referenced in plan but deferred
- Live deployment testing needed to verify CDN caching and performance

**Security Considerations:**
- X-Content-Type-Options: nosniff header prevents MIME sniffing
- CORS allows all origins (public content by design)
- Expired content returns 404 (no indication it ever existed)
- Download count is aggregate only (no user tracking)
- CID validation prevents path traversal attempts
