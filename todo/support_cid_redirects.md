# Support CID Redirects via Alternate Suppliers

## Overview

This feature allows users to specify alternate CID suppliers that can serve content when the primary hashbin.org storage is unavailable. Alternate suppliers are publicly visible on the details page for any CID they contain.

### Goals

1. Allow users to register up to 20 alternate suppliers
2. Support two supplier types:
   - **Single CID suppliers**: URLs that serve a single piece of content (e.g., `https://256t.org/{CID}`)
   - **Group CID suppliers**: URLs/repositories that contain multiple CIDs (e.g., GitHub folder with CID files)
3. Scan suppliers for valid CIDs on registration
4. Display alternate suppliers on CID details pages
5. Use alternate suppliers as fallback when content is unavailable on hashbin.org

### Initial Target Suppliers

1. **256t.org** - Content addressable storage service
   - URL pattern: `https://256t.org/{CID}`
   - Serves content directly via CID path

2. **GitHub cids folder** - Static file repository
   - URL pattern: `https://raw.githubusercontent.com/curtcox/256t.org/refs/heads/main/cids/{CID}`
   - Files named by their CID

---

## Resolved Design Decisions

| Decision | Resolution |
|----------|------------|
| Supplier ownership transfer | No explicit transfer support. Suppliers deleted when user account deleted. |
| Fallback priority order | Random selection among available alternates |
| Content caching from alternates | Never cache in R2. Proxy and redirect are both allowed. |
| Expired content behavior | Redirect to alternate supplier |
| Rate limiting for alternates | No rate limits applied to alternate-sourced content |
| Supplier verification frequency | Only on manual rescan (no automatic re-verification) |
| Public vs private suppliers | Always public |
| Anonymous registration | Not allowed; authentication required |
| URL pattern flexibility | Only `{base}/{cid}` format supported initially |
| GitHub API authentication | Use hashbin.org service token |
| Scan depth for group suppliers | Scan all CIDs (no limit) |
| Content size mismatch | Strictly reject if size doesn't match CID |
| Circular redirects | Defer handling until it becomes a problem |
| Statistics window size | Last 100 requests |
| Proxy verification frequency | Every 100th request |
| Success rate threshold for redirect | 95%+ success rate to prefer redirect |
| New supplier warmup | Require 95% success over 100 requests before redirecting |
| Statistics reset | Never reset (always accumulate) |
| Range requests when proxying | Forward Range header to alternate if supported; fall back to full fetch |

---

## Architecture Design

### Serving Strategy: Proxy vs Redirect

The system uses **both proxy and redirect** approaches:

- **Redirect (302)**: Efficient, no hashbin.org bandwidth used, but no content verification at serve time
- **Proxy**: hashbin.org fetches and serves content, allowing verification and MIME type control

**Decision Logic**: Proxy requests occasionally to verify content and gather statistics. Use these statistics to inform whether to proxy or redirect for future requests. This provides a balance between efficiency (redirect) and verification (proxy).

**MIME Type Handling**:
- When redirecting: No control over MIME type (alternate supplier determines it)
- When proxying: hashbin.org sets MIME type based on file extension in the request URL

### Supplier Statistics Model

Instead of binary "online/offline" states, track statistics per supplier:

```javascript
SupplierStats {
  supplier_id: string,

  // Request statistics
  total_requests: integer,          // Total redirect/proxy attempts
  successful_requests: integer,     // Requests that succeeded
  failed_requests: integer,         // Requests that failed

  // Recent history (rolling window of last 100 requests)
  recent_results: boolean[],        // Circular buffer: true=success, false=failure
  recent_success_count: integer,    // Successes in last 100 requests
  recent_failure_count: integer,    // Failures in last 100 requests

  // Timing statistics
  avg_response_time_ms: float,      // Average response time when proxying
  last_success_at: ISO8601,         // Most recent successful request
  last_failure_at: ISO8601,         // Most recent failed request

  // Verification statistics
  last_verified_at: ISO8601,        // Last time content hash was verified
  verification_failures: integer,   // Times content didn't match hash

  // Proxy counter for periodic verification
  requests_since_last_proxy: integer, // Counter for every-100th-request proxy
}
```

**Statistics Configuration:**
- **Window size**: 100 requests (rolling)
- **Proxy frequency**: Every 100th request for verification
- **Redirect threshold**: 95%+ success rate over 100 requests
- **Warmup requirement**: 100 requests with 95%+ success before redirecting
- **Reset policy**: Never reset (statistics always accumulate)

### Supplier Types

```
SupplierType:
  - SINGLE_CID    # URL points to a single CID's content
  - CID_GROUP     # URL points to a collection of CIDs
```

### Supplier Configuration

```javascript
AlternateSupplier {
  supplier_id: string,           // Unique identifier (UUID)
  owner_user_id: string,         // User who registered this supplier
  name: string,                  // User-provided display name
  supplier_type: SupplierType,   // SINGLE_CID or CID_GROUP
  base_url: string,              // Base URL for the supplier

  // URL pattern is always "{base}/{cid}" for now

  // For SINGLE_CID suppliers
  single_cid: string | null,     // The CID this supplier serves

  // For CID_GROUP suppliers
  discovered_cids: string[],     // CIDs found during scanning

  created_at: ISO8601,
  last_scanned_at: ISO8601,
  scan_status: 'pending' | 'scanning' | 'completed' | 'failed',
  scan_error: string | null,
  cid_count: integer,            // Number of valid CIDs found
  is_active: boolean,            // User can disable without deleting

  // Statistics (see SupplierStats above)
  stats: SupplierStats,
}
```

### Supplier-CID Mapping

```javascript
SupplierCIDMapping {
  cid: string,
  supplier_id: string,
  verified_at: ISO8601,          // Last time content was verified available
  content_hash_match: boolean,   // Whether content hash was verified
}
```

---

## Database Schema Changes

### New Durable Object: SupplierRegistry

Stores all supplier registrations and their CID mappings.

```javascript
// Keyed by: supplier:{supplier_id}
// Also maintains indexes:
//   - user_suppliers:{user_id} -> list of supplier_ids
//   - cid_suppliers:{cid} -> list of supplier_ids
```

### UserProfile Extensions

```javascript
// Add to existing UserProfile
{
  supplier_ids: string[],        // References to user's suppliers (max 20)
  supplier_count: integer,       // Current count for limit enforcement
}
```

### ContentMetadata Extensions

```javascript
// Add to existing ContentMetadata
{
  alternate_suppliers: [{
    supplier_id: string,
    supplier_name: string,
    supplier_url: string,
    verified_at: ISO8601,
  }],
}
```

---

## API Endpoints

### Supplier Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/suppliers` | Register a new alternate supplier |
| GET | `/api/suppliers` | List user's registered suppliers |
| GET | `/api/suppliers/{id}` | Get supplier details |
| DELETE | `/api/suppliers/{id}` | Remove a supplier |
| POST | `/api/suppliers/{id}/scan` | Request rescan of supplier |
| PATCH | `/api/suppliers/{id}` | Update supplier (name, active status) |

### CID Supplier Lookup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/content/{cid}/suppliers` | Get alternate suppliers for a CID |

### Request/Response Examples

#### Register Single CID Supplier

```http
POST /api/suppliers
{
  "name": "My 256t Mirror",
  "supplier_type": "SINGLE_CID",
  "base_url": "https://256t.org",
  "single_cid": "AAAAA757nKdtrwSEpqwvo5YVhusXd4wN5uOnCv7dwzQj..."
}
```

#### Register CID Group Supplier

```http
POST /api/suppliers
{
  "name": "256t.org GitHub Repository",
  "supplier_type": "CID_GROUP",
  "base_url": "https://raw.githubusercontent.com/curtcox/256t.org/refs/heads/main/cids"
}
```

#### Response

```json
{
  "supplier_id": "sup_abc123",
  "name": "256t.org GitHub Repository",
  "supplier_type": "CID_GROUP",
  "base_url": "https://raw.githubusercontent.com/curtcox/256t.org/refs/heads/main/cids",
  "scan_status": "pending",
  "cid_count": 0,
  "created_at": "2026-01-22T12:00:00Z"
}
```

---

## Scanning Logic

### Single CID Supplier Scanning

1. Construct URL: `{base_url}/{single_cid}`
2. Fetch content with HEAD request first (check availability)
3. Fetch full content
4. Compute 256t hash of content
5. Verify hash matches declared CID
6. Verify content size matches CID's encoded size
7. Mark as verified or failed

### CID Group Supplier Scanning

#### For GitHub-style repositories:
1. Use GitHub API (with hashbin.org service token) to list all files in the directory
2. Filter filenames that match CID pattern (8-94 chars, Base64URL)
3. For each potential CID:
   - Construct raw content URL: `{base_url}/{cid}`
   - Fetch content and verify hash matches filename
   - Verify content size matches CID's encoded size
4. Store list of verified CIDs

#### For web directories:
1. Fetch directory listing page
2. Parse HTML for links matching CID pattern
3. Verify each discovered CID

### Scan Completion

- All CIDs in a group are scanned (no limit)
- Scans processed asynchronously
- 1 hour cooldown between manual rescans of same supplier

---

## Fallback Logic

### When to Use Alternate Suppliers

Content fetch from alternate suppliers occurs when:
1. Content not found in R2 storage (404)
2. Content expired in hashbin.org (redirect to alternate)

### Fallback Selection

1. Try primary R2 storage
2. If unavailable, query SupplierCIDMapping for alternates
3. Select alternate randomly from available options
4. Decide whether to proxy or redirect based on statistics

### Proxy vs Redirect Decision

Use statistics to decide:

**Proxy when** (any of these conditions):
- Supplier has fewer than 100 total requests (warmup period)
- Recent success rate is below 95% (in the last 100 requests)
- It's been 100 requests since last proxy (periodic verification)

**Redirect when** (all conditions met):
- Supplier has at least 100 total requests
- Recent success rate is 95% or higher (in the last 100 requests)
- Not due for periodic verification

**Decision Algorithm:**
```
if (total_requests < 100) → PROXY (warmup)
else if (recent_success_rate < 0.95) → PROXY (low confidence)
else if (requests_since_last_proxy >= 100) → PROXY (periodic check)
else → REDIRECT
```

### Response Headers

When proxying from alternate:
```http
X-HashBin-Source: alternate
X-HashBin-Supplier: {supplier_name}
X-HashBin-Supplier-URL: {supplier_url}
Content-Type: {determined by extension}
```

When redirecting to alternate:
```http
HTTP/1.1 302 Found
Location: {supplier_url}/{cid}
X-HashBin-Source: redirect
X-HashBin-Supplier: {supplier_name}
```

### Range Request Handling (Proxy Mode)

When proxying content and the client sends a Range header:

1. **Forward the Range header** to the alternate supplier
2. If alternate returns `206 Partial Content`:
   - Verify the partial content (cannot verify full hash, but can verify size consistency)
   - Serve the partial response to client with appropriate headers
3. If alternate returns `200 OK` (doesn't support ranges):
   - Accept the full content
   - Extract and serve only the requested range to client
   - Verify full content hash since we have it
4. If alternate returns error:
   - Try next alternate supplier

**Note**: When redirecting (not proxying), the client negotiates Range support directly with the alternate supplier.

**Partial Content Verification Limitations**:
- Cannot verify content hash for partial responses (hash requires full content)
- Can only verify that returned size is consistent with expected range
- Full verification happens on periodic full-content proxy requests

---

## Frontend Changes

### Supplier Management Page

New page: `/dashboard/suppliers/`

- List all registered suppliers
- Add new supplier form
- Supplier status indicators (active, scanning, failed)
- Statistics display (success rate, response times)
- Rescan button
- Delete/disable controls

### CID Details Page Updates

Add "Alternate Suppliers" section showing:
- List of suppliers that have this CID
- Supplier name (links to supplier's public page)
- Owner attribution (registered by: username)
- Last verified timestamp
- Direct link to alternate source

### Public Supplier Page

New page: `/suppliers/{supplier_id}`

- Public view of supplier information
- List of CIDs available (paginated)
- Registration date and owner
- Statistics summary (success rate, availability)

---

## Security Considerations

1. **URL Validation**: Validate supplier URLs against allowlist of protocols (https only)
2. **Content Verification**: Always verify content hash matches CID when proxying
3. **Size Verification**: Reject content if size doesn't match CID's encoded size
4. **Rate Limiting**: Limit scan requests to prevent abuse (1 hour cooldown)
5. **Privacy**: Supplier ownership is public information
6. **SSRF Prevention**: Block internal/private IP ranges in supplier URLs

---

## Test Plan

### Unit Tests

#### CID Validation Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U1 | Valid CID format accepted | Valid 256t CID | true |
| U2 | Invalid CID format rejected | "invalid-cid" | false |
| U3 | CID too short rejected | 7-char string | false |
| U4 | CID too long rejected | 95-char string | false |
| U5 | Non-Base64URL chars rejected | CID with `!@#` | false |

#### Supplier URL Validation Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U6 | HTTPS URL accepted | "https://example.com" | valid |
| U7 | HTTP URL rejected | "http://example.com" | invalid |
| U8 | Private IP rejected | "https://192.168.1.1" | invalid |
| U9 | Localhost rejected | "https://localhost" | invalid |
| U10 | Internal DNS rejected | "https://internal.local" | invalid |
| U11 | Valid domain accepted | "https://256t.org" | valid |
| U12 | URL with path accepted | "https://github.com/user/repo/cids" | valid |
| U13 | URL with port accepted | "https://example.com:8443" | valid |
| U14 | Empty URL rejected | "" | invalid |
| U15 | Malformed URL rejected | "not-a-url" | invalid |

#### Supplier Type Validation Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U16 | SINGLE_CID requires single_cid field | type=SINGLE_CID, no CID | validation error |
| U17 | CID_GROUP doesn't require single_cid | type=CID_GROUP, no CID | valid |
| U18 | SINGLE_CID with invalid CID rejected | type=SINGLE_CID, invalid CID | validation error |
| U19 | Unknown supplier type rejected | type="UNKNOWN" | validation error |

#### User Limit Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U20 | User can add supplier when under limit | 19 existing suppliers | success |
| U21 | User cannot exceed 20 supplier limit | 20 existing suppliers | error |
| U22 | Deleting supplier decrements count | delete supplier | count = count - 1 |
| U23 | Disabled suppliers count toward limit | 20 disabled suppliers | cannot add more |

#### Size Validation Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U24 | Content size matches CID prefix | 100-byte content, CID says 100 | valid |
| U25 | Content size smaller than CID prefix | 50-byte content, CID says 100 | rejected |
| U26 | Content size larger than CID prefix | 150-byte content, CID says 100 | rejected |

#### Statistics Calculation Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U27 | Success rate calculation | 8 success, 2 failure | 80% |
| U28 | Success rate with zero requests | 0 requests | 0% or undefined |
| U29 | Rolling window updates correctly | Add success to full window (100) | Oldest removed, new added |
| U30 | Average response time calculation | [100, 200, 300] ms | 200ms |
| U31 | Window capped at 100 | 150 requests | Only last 100 tracked |
| U32 | Proxy counter increments | Each redirect | requests_since_last_proxy +1 |
| U33 | Proxy counter resets on proxy | After proxy | requests_since_last_proxy = 0 |

#### Proxy vs Redirect Decision Tests
| # | Test Case | Input | Expected Output |
|---|-----------|-------|-----------------|
| U34 | Warmup period forces proxy | 50 total requests, 100% success | PROXY |
| U35 | Low success rate forces proxy | 100 requests, 90% success | PROXY |
| U36 | Periodic check forces proxy | 100+ requests, 95%+ success, 100 since proxy | PROXY |
| U37 | All conditions met, redirect | 100+ requests, 95%+ success, 50 since proxy | REDIRECT |
| U38 | Exactly 95% triggers redirect | 95 success, 5 failure in window | REDIRECT |
| U39 | Just under 95% forces proxy | 94 success, 6 failure in window | PROXY |
| U40 | Exactly 100 requests, 95% success | 100 requests, 95 success | REDIRECT |

### Integration Tests

#### Supplier Registration Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I1 | Register single CID supplier | Authenticated user | POST /api/suppliers (SINGLE_CID) | 201, supplier created |
| I2 | Register group CID supplier | Authenticated user | POST /api/suppliers (CID_GROUP) | 201, supplier created |
| I3 | Unauthenticated registration fails | No auth | POST /api/suppliers | 401 error |
| I4 | Duplicate supplier URL allowed | Existing supplier with same URL | POST /api/suppliers | 201 (allowed) |
| I5 | Register with name > 100 chars | Long name | POST /api/suppliers | 400 validation error |
| I6 | Register with empty name | name="" | POST /api/suppliers | 400 validation error |

#### Supplier Listing Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I7 | List own suppliers | User with 3 suppliers | GET /api/suppliers | Returns 3 suppliers |
| I8 | Empty list for new user | New user | GET /api/suppliers | Returns empty array |
| I9 | Cannot see other user's suppliers in list | User A suppliers exist | GET /api/suppliers as User B | Empty array |
| I10 | Pagination works | User with 25 suppliers | GET /api/suppliers?limit=10 | 10 items, has_more=true |
| I11 | Statistics included in response | Supplier with activity | GET /api/suppliers | Stats fields populated |

#### Supplier Deletion Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I12 | Delete own supplier | User owns supplier | DELETE /api/suppliers/{id} | 200, supplier removed |
| I13 | Cannot delete other's supplier | User A owns supplier | DELETE as User B | 403 forbidden |
| I14 | Delete removes CID mappings | Supplier with 10 CIDs | DELETE supplier | All mappings removed |
| I15 | Delete non-existent supplier | No supplier | DELETE /api/suppliers/{fake_id} | 404 not found |
| I16 | User account deletion removes suppliers | User with 5 suppliers | Delete user account | All 5 suppliers removed |

#### Scan Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I17 | Initial scan triggered on create | New supplier | POST /api/suppliers | scan_status = "pending" |
| I18 | Manual rescan request | Existing supplier | POST /api/suppliers/{id}/scan | 200, scan initiated |
| I19 | Rescan respects cooldown | Scanned 30 min ago | POST /api/suppliers/{id}/scan | 429 too early |
| I20 | Rescan allowed after cooldown | Scanned 2 hours ago | POST /api/suppliers/{id}/scan | 200, scan initiated |
| I21 | Cannot scan other's supplier | User A supplier | POST as User B | 403 forbidden |

#### Content Verification Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I22 | Valid content hash verified | Real 256t.org content | Scan supplier | content_hash_match = true |
| I23 | Invalid content hash detected | Content doesn't match CID | Scan supplier | content_hash_match = false |
| I24 | Unreachable URL marked failed | Offline URL | Scan supplier | scan_status = "failed" |
| I25 | Timeout handled gracefully | Slow server (>30s) | Scan supplier | scan_status = "failed" |
| I26 | Size mismatch rejected | Content size != CID size | Scan supplier | CID marked invalid |

#### CID Supplier Lookup Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I27 | CID with suppliers returns list | CID in 2 suppliers | GET /api/content/{cid}/suppliers | Returns 2 suppliers |
| I28 | CID without suppliers returns empty | CID not in any supplier | GET /api/content/{cid}/suppliers | Empty array |
| I29 | Only verified suppliers returned | 1 verified, 1 failed | GET /api/content/{cid}/suppliers | Returns 1 supplier |

### End-to-End Tests

#### 256t.org Integration Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E1 | Register 256t.org as single CID supplier | Known valid CID on 256t.org | Register supplier | CID verified, supplier active |
| E2 | Content proxied from 256t.org | Content not in R2, good stats | GET /{cid} | Content served via proxy |
| E3 | Content redirected to 256t.org | Content not in R2, verified | GET /{cid} | 302 redirect to 256t.org |
| E4 | Invalid CID on 256t.org | Non-existent CID | Register supplier | scan_status = "failed" |

#### GitHub Repository Integration Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E5 | Scan GitHub cids folder | Real GitHub repo URL | Register supplier | All CIDs discovered |
| E6 | GitHub API uses service token | Many files | Scan large repo | No rate limit errors |
| E7 | Private repo rejected | Private repo URL | Register supplier | scan_status = "failed" |
| E8 | Non-existent repo rejected | Fake repo URL | Register supplier | scan_status = "failed" |

#### Fallback Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E9 | Primary available, no fallback used | Content in R2 + alternate | GET /{cid} | Served from R2, no alternate header |
| E10 | Primary unavailable, fallback used | Content only in alternate | GET /{cid} | Served from alternate |
| E11 | Multiple alternates, random selection | 3 alternates available | 100 requests | ~33% to each |
| E12 | All fallbacks fail | All alternates offline | GET /{cid} | 404 not found |
| E13 | Fallback content hash mismatch | Alternate returns wrong content | GET /{cid} (proxy) | Skip to next alternate or 404 |
| E14 | Expired content redirects to alternate | Expired in R2, alternate exists | GET /{cid} | 302 redirect to alternate |

#### Proxy vs Redirect Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E15 | Warmup period forces proxy | Supplier with 50 requests | GET /{cid} | Proxied (warmup) |
| E16 | Warmup complete, redirect | 100 requests, 95%+ success | GET /{cid} | 302 redirect |
| E17 | Low success rate forces proxy | 100 requests, 90% success | GET /{cid} | Proxied |
| E18 | Periodic verification (every 100) | 100 requests since last proxy | GET /{cid} | Proxied for verification |
| E19 | MIME type set by extension when proxying | File with .json extension | GET /{cid}.json (proxy) | Content-Type: application/json |
| E20 | 95% threshold boundary | 95 success, 5 failure | GET /{cid} | 302 redirect |
| E21 | Just under 95% threshold | 94 success, 6 failure | GET /{cid} | Proxied |

#### Range Request Tests (Proxy Mode)
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E22 | Range forwarded to alternate | Alternate supports ranges | GET /{cid} Range: bytes=0-99 | 206 with partial content |
| E23 | Alternate returns 206 | Alternate supports ranges | GET /{cid} Range: bytes=500-999 | 206, correct byte range |
| E24 | Alternate doesn't support ranges | Alternate returns 200 | GET /{cid} Range: bytes=0-99 | 206 with extracted range |
| E25 | Full content hash verified on fallback | Alternate returns full 200 | GET /{cid} Range: bytes=0-99 | Hash verified, range served |
| E26 | Range request via redirect | Redirecting to alternate | GET /{cid} Range: bytes=0-99 | 302, client negotiates directly |
| E27 | Invalid range handled | Range beyond content size | GET /{cid} Range: bytes=9999-10000 | 416 Range Not Satisfiable |

#### Statistics Update Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E28 | Successful proxy updates stats | Proxy succeeds | Check stats | success count +1, time recorded |
| E29 | Failed proxy updates stats | Proxy fails | Check stats | failure count +1, time recorded |
| E30 | Redirect doesn't update stats | Redirect issued | Check stats | No change (can't verify) |
| E31 | Verification failure recorded | Hash mismatch on proxy | Check stats | verification_failures +1 |
| E32 | Proxy resets periodic counter | After proxy | Check stats | requests_since_last_proxy = 0 |
| E33 | Redirect increments periodic counter | After redirect | Check stats | requests_since_last_proxy +1 |

#### Details Page Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E34 | Suppliers shown on details page | CID with 2 suppliers | View details page | Both suppliers listed |
| E35 | No suppliers section when none exist | CID with no suppliers | View details page | Section hidden or "None" |
| E36 | Supplier link goes to public page | CID with supplier | Click supplier link | Navigates to /suppliers/{id} |
| E37 | Statistics visible on supplier page | Supplier with activity | View supplier page | Success rate, response time shown |

### Edge Case Tests

#### Concurrency Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC1 | Concurrent scan requests | Same supplier | 2 simultaneous scan requests | Only 1 scan runs |
| EC2 | Concurrent supplier creation | Same user at limit (19) | 2 simultaneous POST requests | Only 1 succeeds |
| EC3 | Scan during deletion | Start scan, then delete | Delete during scan | Deletion succeeds, scan cancelled |
| EC4 | Concurrent stats updates | Many requests at once | Update stats | All updates recorded correctly |

#### Data Consistency Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC5 | Supplier count matches actual | Various operations | Check count | count = actual supplier count |
| EC6 | CID mapping cleanup on supplier delete | Supplier with 50 CIDs | Delete supplier | All 50 mappings removed |
| EC7 | Orphaned mappings don't affect lookup | Orphaned data | GET /api/content/{cid}/suppliers | Only valid suppliers returned |

#### Large Scale Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC8 | Supplier with 1000+ CIDs | Large CID group | Scan | All CIDs discovered |
| EC9 | CID in 50 different suppliers | Many suppliers for 1 CID | GET suppliers | All 50 returned (paginated) |
| EC10 | User at exact limit (20) | 20 suppliers | GET /api/suppliers | Returns all 20 |
| EC11 | Large GitHub repo scan | 5000 files | Scan | All valid CIDs found |

#### Error Handling Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC12 | Network timeout during scan | Slow/unresponsive URL | Scan | Timeout after 30s, mark failed |
| EC13 | SSL certificate error | Invalid cert URL | Scan | Mark failed, log error |
| EC14 | DNS resolution failure | Non-existent domain | Scan | Mark failed, specific error |
| EC15 | HTTP 403 from supplier | Access denied | Scan | Mark failed, "access denied" error |
| EC16 | HTTP 429 from supplier | Rate limited | Scan | Retry with backoff, then fail |
| EC17 | Malformed content response | Binary garbage | Scan | Hash mismatch, mark CID unverified |
| EC18 | Network error during proxy | Connection reset | Proxy attempt | Stats updated, try next alternate |

### Security Tests

| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| S1 | SSRF attempt with internal IP | URL = "https://10.0.0.1" | Register | Rejected |
| S2 | SSRF attempt with AWS metadata | URL = "https://169.254.169.254" | Register | Rejected |
| S3 | SSRF attempt with localhost | URL = "https://127.0.0.1" | Register | Rejected |
| S4 | SSRF via DNS rebinding | URL with rebinding domain | Scan | IP checked at fetch time |
| S5 | XSS in supplier name | name = "<script>..." | Register | Sanitized/escaped |
| S6 | SQL injection in supplier name | name = "'; DROP TABLE..." | Register | Properly escaped |
| S7 | Path traversal in URL | base_url with "../" | Register | Rejected or sanitized |

### Performance Tests

| # | Test Case | Target | Expected Result |
|---|-----------|--------|-----------------|
| P1 | Supplier lookup latency | < 100ms | p99 under 100ms |
| P2 | CID fallback (proxy) adds latency | < 500ms additional | p99 under 500ms |
| P3 | CID fallback (redirect) adds latency | < 50ms additional | p99 under 50ms |
| P4 | Full scan completion time | 1000 CIDs | < 10 minutes |
| P5 | Details page load with suppliers | 10 suppliers | < 200ms additional |
| P6 | Statistics update latency | Per-request update | < 10ms |

---

## Open Questions

All design questions have been resolved. See "Resolved Design Decisions" table above.

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [x] Create SupplierRegistry Durable Object
- [x] Add supplier fields to UserProfile
- [x] Implement supplier CRUD API endpoints
- [x] Add URL and CID validation utilities
- [x] Implement statistics storage

### Phase 2: Scanning System
- [x] Implement single CID verification (with size check)
- [x] Implement GitHub repository scanning (with service token)
- [x] Implement generic web directory scanning
- [x] Add async scan job processing
- [x] Implement scan cooldown

### Phase 3: Fallback Logic
- [x] Modify content download handler for fallback
- [x] Implement random supplier selection
- [x] Implement proxy mode with hash verification
- [x] Implement redirect mode
- [x] Add proxy vs redirect decision logic
- [x] Add response headers for alternate sources
- [x] Update statistics on each request

### Phase 4: Frontend
- [ ] Create supplier management page
- [ ] Update CID details page
- [ ] Create public supplier page
- [ ] Add supplier statistics display
- [ ] Add rescan button

### Phase 5: Testing & Documentation
- [x] Unit tests (URL validation, CID validation)
- [x] Integration tests (supplier registration, management)
- [ ] End-to-end tests (256t.org integration, GitHub scanning)
- [ ] API documentation
- [ ] User documentation

---

## Metrics to Track

- Number of suppliers registered
- Number of CIDs discovered via scanning
- Redirect vs proxy ratio
- Fallback usage rate (% of requests using alternates)
- Scan success/failure rates
- Average proxy latency
- Supplier success rates (aggregate)
- Verification failure rates

---

## Dependencies

- Cloudflare Workers fetch API for external requests
- GitHub API for repository scanning (with service token)
- Existing 256t hash verification utilities
- Existing authentication system

---

*Last updated: 2026-01-22*
*Status: Backend implementation complete - Ready for frontend and E2E testing*

## Implementation Notes

### Completed (2026-01-22)

**Core Infrastructure:**
- Created SupplierRegistry Durable Object with full statistics tracking
- Added validation utilities with SSRF protection (blocks private IPs, localhost, .local domains)
- Extended UserProfile to track supplier_ids and supplier_count
- Extended ContentMetadata with alternate_suppliers array
- Added Durable Object migration (v4) for SupplierRegistry

**API Endpoints:**
- POST /api/suppliers - Register new supplier
- GET /api/suppliers - List user's suppliers with pagination
- GET /api/suppliers/{id} - Get supplier details
- DELETE /api/suppliers/{id} - Remove supplier
- POST /api/suppliers/{id}/scan - Request rescan (with 1-hour cooldown)
- PATCH /api/suppliers/{id} - Update supplier name and active status
- GET /api/content/{cid}/suppliers - Get alternate suppliers for a CID

**Scanning System:**
- Single CID verification with hash and size validation
- GitHub repository scanning via GitHub API
- Generic web directory scanning
- Async scan processing triggered on supplier registration
- Automatic ContentMetadata updates for verified CIDs

**Fallback & Redirect Logic:**
- Modified handleDownloadContent to use alternates when R2 returns 404 or content expired
- Random supplier selection for load distribution
- Proxy mode with full hash verification and Range request support
- Redirect mode (302) for efficient serving
- Proxy vs redirect decision logic:
  - Warmup: First 100 requests are proxied
  - 95% success rate threshold over last 100 requests
  - Periodic verification: Every 100th request is proxied
- Statistics tracking per request (success/failure, response time, verification)
- Response headers: X-HashBin-Source, X-HashBin-Supplier, X-HashBin-Supplier-URL

**Testing:**
- Unit tests for URL validation (SSRF protection, format validation)
- Integration tests for supplier registration and management
- Tests added to npm test suite

### Deviations from Plan

None significant. Implementation follows the plan closely.

### Known Limitations

1. Frontend not yet implemented - suppliers can only be managed via API
2. GitHub API token (GITHUB_TOKEN secret) should be configured for rate limit avoidance
3. No automatic re-scanning - scans are only triggered manually or on registration
4. Statistics never reset (as per design) - may accumulate indefinitely

### Next Steps

1. Implement frontend supplier management page
2. Add E2E tests with real 256t.org and GitHub repositories
3. Configure GITHUB_TOKEN secret for production
4. Monitor supplier statistics and adjust thresholds if needed

---

*Last updated: 2026-01-22*
*Status: Backend implementation complete - Ready for frontend and E2E testing*
