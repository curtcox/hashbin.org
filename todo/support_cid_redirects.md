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

## Architecture Design

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
  url_pattern: string,           // Pattern for constructing CID URLs (e.g., "{base}/{cid}")

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
  "base_url": "https://raw.githubusercontent.com/curtcox/256t.org/refs/heads/main/cids",
  "url_pattern": "{base}/{cid}"
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

1. Construct URL from base_url and single_cid
2. Fetch content with HEAD request first (check availability)
3. Fetch full content
4. Compute 256t hash of content
5. Verify hash matches declared CID
6. Mark as verified or failed

### CID Group Supplier Scanning

#### For GitHub-style repositories:
1. Use GitHub API to list files in the directory
2. Filter filenames that match CID pattern (8-94 chars, Base64URL)
3. For each potential CID:
   - Construct raw content URL
   - Verify content hash matches filename
4. Store list of verified CIDs

#### For web directories:
1. Fetch directory listing page
2. Parse HTML for links matching CID pattern
3. Verify each discovered CID

### Scan Rate Limiting

- Maximum 100 CIDs verified per scan operation
- Scans queued and processed asynchronously
- 1 hour cooldown between rescans of same supplier

---

## Fallback Logic

### When to Use Alternate Suppliers

Content fetch from alternate suppliers occurs when:
1. Content not found in R2 storage (404)
2. Content expired but alternate supplier available
3. User explicitly requests alternate source (future)

### Fallback Order

1. Try primary R2 storage
2. If unavailable, query SupplierCIDMapping for alternates
3. Try each alternate in order of:
   - Most recently verified
   - Closest geographically (future)
4. Verify content hash before serving
5. Cache fetched content (configurable TTL)

### Response Headers

When serving from alternate:
```http
X-HashBin-Source: alternate
X-HashBin-Supplier: {supplier_name}
X-HashBin-Supplier-URL: {supplier_url}
```

---

## Frontend Changes

### Supplier Management Page

New page: `/dashboard/suppliers/`

- List all registered suppliers
- Add new supplier form
- Supplier status indicators (active, scanning, failed)
- Scan history and CID counts
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
- Scan status and history

---

## Security Considerations

1. **URL Validation**: Validate supplier URLs against allowlist of protocols (https only)
2. **Content Verification**: Always verify content hash matches CID before serving
3. **Rate Limiting**: Limit scan requests to prevent abuse
4. **Privacy**: Supplier ownership is public information
5. **SSRF Prevention**: Block internal/private IP ranges in supplier URLs

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
| I9 | Cannot see other user's suppliers | User A suppliers exist | GET /api/suppliers as User B | Empty array |
| I10 | Pagination works | User with 25 suppliers | GET /api/suppliers?limit=10 | 10 items, has_more=true |

#### Supplier Deletion Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I11 | Delete own supplier | User owns supplier | DELETE /api/suppliers/{id} | 200, supplier removed |
| I12 | Cannot delete other's supplier | User A owns supplier | DELETE as User B | 403 forbidden |
| I13 | Delete removes CID mappings | Supplier with 10 CIDs | DELETE supplier | All mappings removed |
| I14 | Delete non-existent supplier | No supplier | DELETE /api/suppliers/{fake_id} | 404 not found |

#### Scan Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I15 | Initial scan triggered on create | New supplier | POST /api/suppliers | scan_status = "pending" |
| I16 | Manual rescan request | Existing supplier | POST /api/suppliers/{id}/scan | 200, scan initiated |
| I17 | Rescan respects cooldown | Scanned 30 min ago | POST /api/suppliers/{id}/scan | 429 too early |
| I18 | Rescan allowed after cooldown | Scanned 2 hours ago | POST /api/suppliers/{id}/scan | 200, scan initiated |
| I19 | Cannot scan other's supplier | User A supplier | POST as User B | 403 forbidden |

#### Content Verification Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I20 | Valid content hash verified | Real 256t.org content | Scan supplier | content_hash_match = true |
| I21 | Invalid content hash detected | Content doesn't match CID | Scan supplier | content_hash_match = false |
| I22 | Unreachable URL marked failed | Offline URL | Scan supplier | scan_status = "failed" |
| I23 | Timeout handled gracefully | Slow server (>30s) | Scan supplier | scan_status = "failed" |

#### CID Supplier Lookup Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| I24 | CID with suppliers returns list | CID in 2 suppliers | GET /api/content/{cid}/suppliers | Returns 2 suppliers |
| I25 | CID without suppliers returns empty | CID not in any supplier | GET /api/content/{cid}/suppliers | Empty array |
| I26 | Only verified suppliers returned | 1 verified, 1 failed | GET /api/content/{cid}/suppliers | Returns 1 supplier |

### End-to-End Tests

#### 256t.org Integration Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E1 | Register 256t.org as single CID supplier | Known valid CID on 256t.org | Register supplier | CID verified, supplier active |
| E2 | Content served from 256t.org fallback | Content deleted from R2 | GET /{cid} | Content served, X-HashBin-Source: alternate |
| E3 | Invalid CID on 256t.org | Non-existent CID | Register supplier | scan_status = "failed" |

#### GitHub Repository Integration Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E4 | Scan GitHub cids folder | Real GitHub repo URL | Register supplier | Multiple CIDs discovered |
| E5 | GitHub rate limit handled | Many requests | Scan large repo | Graceful degradation |
| E6 | Private repo rejected | Private repo URL | Register supplier | scan_status = "failed" |
| E7 | Non-existent repo rejected | Fake repo URL | Register supplier | scan_status = "failed" |

#### Fallback Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E8 | Primary available, no fallback used | Content in R2 + alternate | GET /{cid} | Served from R2, no alternate header |
| E9 | Primary unavailable, fallback used | Content only in alternate | GET /{cid} | Served from alternate |
| E10 | Multiple fallbacks tried in order | 3 alternates, first 2 fail | GET /{cid} | Served from 3rd alternate |
| E11 | All fallbacks fail | All alternates offline | GET /{cid} | 404 not found |
| E12 | Fallback content hash mismatch | Alternate returns wrong content | GET /{cid} | Skip to next alternate or 404 |

#### Details Page Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| E13 | Suppliers shown on details page | CID with 2 suppliers | View details page | Both suppliers listed |
| E14 | No suppliers section when none exist | CID with no suppliers | View details page | Section hidden or "None" |
| E15 | Supplier link goes to public page | CID with supplier | Click supplier link | Navigates to /suppliers/{id} |

### Edge Case Tests

#### Concurrency Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC1 | Concurrent scan requests | Same supplier | 2 simultaneous scan requests | Only 1 scan runs |
| EC2 | Concurrent supplier creation | Same user at limit (19) | 2 simultaneous POST requests | Only 1 succeeds |
| EC3 | Scan during deletion | Start scan, then delete | Delete during scan | Deletion succeeds, scan cancelled |

#### Data Consistency Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC4 | Supplier count matches actual | Various operations | Check count | count = actual supplier count |
| EC5 | CID mapping cleanup on supplier delete | Supplier with 50 CIDs | Delete supplier | All 50 mappings removed |
| EC6 | Orphaned mappings don't affect lookup | Orphaned data | GET /api/content/{cid}/suppliers | Only valid suppliers returned |

#### URL Pattern Tests
| # | Test Case | URL Pattern | CID | Expected URL |
|---|-----------|-------------|-----|--------------|
| EC7 | Simple base + CID | "{base}/{cid}" | "ABC123" | "https://example.com/ABC123" |
| EC8 | Custom path pattern | "{base}/content/{cid}" | "ABC123" | "https://example.com/content/ABC123" |
| EC9 | Pattern with extension | "{base}/{cid}.bin" | "ABC123" | "https://example.com/ABC123.bin" |
| EC10 | Missing {cid} placeholder | "{base}/fixed" | any | Error on registration |

#### Large Scale Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC11 | Supplier with 1000+ CIDs | Large CID group | Scan | Paginated discovery, max 100 per scan |
| EC12 | CID in 50 different suppliers | Many suppliers for 1 CID | GET suppliers | All 50 returned (paginated) |
| EC13 | User at exact limit (20) | 20 suppliers | GET /api/suppliers | Returns all 20 |

#### Error Handling Tests
| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| EC14 | Network timeout during scan | Slow/unresponsive URL | Scan | Timeout after 30s, mark failed |
| EC15 | SSL certificate error | Invalid cert URL | Scan | Mark failed, log error |
| EC16 | DNS resolution failure | Non-existent domain | Scan | Mark failed, specific error |
| EC17 | HTTP 403 from supplier | Access denied | Scan | Mark failed, "access denied" error |
| EC18 | HTTP 429 from supplier | Rate limited | Scan | Retry with backoff, then fail |
| EC19 | Malformed content response | Binary garbage | Scan | Hash mismatch, mark CID unverified |

### Security Tests

| # | Test Case | Setup | Action | Expected Result |
|---|-----------|-------|--------|-----------------|
| S1 | SSRF attempt with internal IP | URL = "https://10.0.0.1" | Register | Rejected |
| S2 | SSRF attempt with AWS metadata | URL = "https://169.254.169.254" | Register | Rejected |
| S3 | SSRF attempt with localhost | URL = "https://127.0.0.1" | Register | Rejected |
| S4 | SSRF via DNS rebinding | URL with rebinding domain | Scan | IP checked at fetch time |
| S5 | XSS in supplier name | name = "<script>..." | Register | Sanitized/escaped |
| S6 | SQL injection in supplier name | name = "'; DROP TABLE..." | Register | Properly escaped |
| S7 | Path traversal in URL pattern | pattern = "../../../etc/passwd" | Register | Rejected |

### Performance Tests

| # | Test Case | Target | Expected Result |
|---|-----------|--------|-----------------|
| P1 | Supplier lookup latency | < 100ms | p99 under 100ms |
| P2 | CID fallback adds latency | < 500ms additional | p99 under 500ms |
| P3 | Scan completion time | 100 CIDs | < 60 seconds |
| P4 | Details page load with suppliers | 10 suppliers | < 200ms additional |

---

## Open Questions

### Business Logic Questions

1. **Q1: Supplier Ownership Transfer** - Can suppliers be transferred to another user? What happens if a user account is deleted?

2. **Q2: Duplicate CID Handling** - If the same CID exists in multiple suppliers, how do we order fallback priority? Options:
   - Most recently verified first
   - User preference order
   - Geographic proximity
   - Random for load distribution

3. **Q3: Content Caching from Alternates** - When content is fetched from an alternate supplier, should we:
   - Cache it temporarily in R2?
   - Cache it permanently (re-upload)?
   - Never cache (always fetch from alternate)?

4. **Q4: Expired Content Behavior** - If hashbin.org content is expired but alternate has it:
   - Serve from alternate?
   - Require retention payment before serving?
   - Show as "available from alternate" but not serve?

5. **Q5: Rate Limiting for Alternates** - Should rate limits apply to alternate-sourced content?
   - Same rate limits as primary?
   - No rate limits (delegate to alternate)?
   - Separate rate limit tier?

6. **Q6: Supplier Verification Frequency** - How often should we re-verify that alternates still have content?
   - On every access attempt?
   - Daily background scan?
   - Weekly background scan?
   - Only on manual rescan?

7. **Q7: Public vs Private Suppliers** - Should suppliers always be public? Options:
   - Always public (current plan)
   - User chooses public/private
   - Private by default, opt-in public

8. **Q8: Anonymous Supplier Registration** - Can unauthenticated users register suppliers?
   - No, require authentication (current plan)
   - Yes, with captcha
   - Yes, but limited to 1 supplier

### Technical Questions

9. **Q9: URL Pattern Flexibility** - What URL patterns should we support?
   - Only `{base}/{cid}` format?
   - Custom patterns with placeholders?
   - Query string parameters (e.g., `?cid={cid}`)?

10. **Q10: GitHub API Authentication** - For scanning GitHub repos:
    - Use unauthenticated API (60 req/hour limit)?
    - Require user's GitHub token?
    - Use hashbin.org service token?

11. **Q11: Scan Depth for Group Suppliers** - For large repositories:
    - Scan all CIDs (could be thousands)?
    - Limit to first N CIDs?
    - Paginate and scan incrementally?

12. **Q12: Content-Type Handling** - When serving from alternate:
    - Trust alternate's Content-Type header?
    - Use hashbin.org's stored Content-Type?
    - Detect from content?

13. **Q13: Redirect vs Proxy** - When using alternate:
    - Redirect user to alternate URL (302)?
    - Proxy content through hashbin.org?
    - Offer both options?

14. **Q14: Offline Supplier Grace Period** - If a supplier becomes unreachable:
    - Immediately mark as failed?
    - Retry for X hours before failing?
    - Keep in list but mark as "unreachable"?

### Edge Cases

15. **Q15: Circular Redirects** - What if 256t.org redirects back to hashbin.org?
    - Detect and prevent loops
    - Limit redirect depth
    - Block self-references

16. **Q16: Content Size Mismatch** - If alternate returns content with different size than CID indicates:
    - Always reject (strict)?
    - Accept if hash matches (lenient)?

17. **Q17: Partial Content (Range Requests)** - Should we support range requests from alternates?
    - Yes, if alternate supports it
    - No, always fetch full content
    - Proxy range requests

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create SupplierRegistry Durable Object
- [ ] Add supplier fields to UserProfile
- [ ] Implement supplier CRUD API endpoints
- [ ] Add URL and CID validation utilities

### Phase 2: Scanning System
- [ ] Implement single CID verification
- [ ] Implement GitHub repository scanning
- [ ] Implement generic web directory scanning
- [ ] Add async scan job processing
- [ ] Implement scan rate limiting

### Phase 3: Fallback Logic
- [ ] Modify content download handler
- [ ] Implement supplier priority ordering
- [ ] Add content hash verification for alternates
- [ ] Add response headers for alternate sources

### Phase 4: Frontend
- [ ] Create supplier management page
- [ ] Update CID details page
- [ ] Create public supplier page
- [ ] Add supplier status indicators

### Phase 5: Testing & Documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] API documentation
- [ ] User documentation

---

## Metrics to Track

- Number of suppliers registered
- Number of CIDs discovered via scanning
- Fallback usage rate (% of requests served from alternates)
- Scan success/failure rates
- Average fallback latency added
- Supplier availability rates

---

## Dependencies

- Cloudflare Workers fetch API for external requests
- GitHub API for repository scanning
- Existing 256t hash verification utilities
- Existing authentication system

---

*Last updated: 2026-01-22*
*Status: Draft - Pending answers to open questions*
