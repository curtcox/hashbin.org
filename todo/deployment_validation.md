# Deployment Validation Workflow Plan

## Overview

This document outlines a comprehensive GitHub Actions workflow for validating the deployed hashbin.org site. The workflow will run daily on a schedule and support manual on-demand execution.

## Workflow Configuration

**File**: `.github/workflows/deployment-validation.yml`

**Triggers**:
- **Schedule**: Daily at 06:00 UTC
- **Manual**: `workflow_dispatch` with optional parameters
- **After deployment**: `workflow_run` triggered by deploy.yml completion

**Parameters for manual runs**:
- `target_url`: Override the default production URL (default: `https://hashbin.org`)
- `verbose`: Enable verbose output for debugging (default: `false`)
- `skip_auth_tests`: Skip tests requiring authentication secrets (default: `false`)

---

## Test Categories

### 1. Infrastructure Health Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| INF-001 | Health Endpoint Availability | `GET /health` returns 200 | HTTP 200 with JSON body |
| INF-002 | Health Response Structure | Validate health JSON schema | Contains `status`, `clerk`, `stripe`, `r2`, `durableObjects`, `gitSha` |
| INF-003 | Clerk Integration Status | Check `clerk.status` in health | `"connected"` or valid status string |
| INF-004 | Stripe Integration Status | Check `stripe.status` in health | `"connected"` or valid status string |
| INF-005 | R2 Storage Status | Check `r2.status` in health | `"available"` or valid status string |
| INF-006 | Durable Objects Status | Check `durableObjects.status` in health | `"available"` or valid status string |
| INF-007 | Git SHA Presence | Verify `gitSha` is present and valid | 40-character hex string (full SHA) or 7-char short SHA |
| INF-008 | Response Time Check | Measure health endpoint latency | Response time < 2000ms |
| INF-009 | TLS Certificate Valid | Verify HTTPS certificate | Valid, not expired, correct domain |
| INF-010 | HTTP to HTTPS Redirect | `http://hashbin.org` redirects to HTTPS | 301/302 redirect to `https://` |

### 2. Frontend Availability Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| FE-001 | Root Page Load | `GET /` returns 200 | HTTP 200 with HTML content |
| FE-002 | Root Page Contains Git SHA | HTML contains embedded git SHA comment | `<!-- git-sha: [SHA] -->` present |
| FE-003 | Dashboard Page Load | `GET /dashboard.html` returns 200 | HTTP 200 with HTML content |
| FE-004 | Upload Page Load | `GET /upload.html` returns 200 | HTTP 200 with HTML content |
| FE-005 | Retrieve Page Load | `GET /retrieve.html` returns 200 | HTTP 200 with HTML content |
| FE-006 | Deposit Page Load | `GET /deposit.html` returns 200 | HTTP 200 with HTML content |
| FE-007 | Info Page Load | `GET /info.html` returns 200 | HTTP 200 with HTML content |
| FE-008 | API Keys Page Load | `GET /api-keys.html` returns 200 | HTTP 200 with HTML content |
| FE-009 | API Keys Create Page Load | `GET /api-keys-create.html` returns 200 | HTTP 200 with HTML content |
| FE-010 | API Keys Detail Page Load | `GET /api-keys-detail.html` returns 200 | HTTP 200 with HTML content |
| FE-011 | CSS Assets Load | `GET /css/base.css` returns 200 | HTTP 200 with CSS content-type |
| FE-012 | JS Assets Load | `GET /js/app.js` returns 200 | HTTP 200 with JS content-type |
| FE-013 | Auth Gate Script Present | Protected pages include auth-gate.js | Script tag present in HTML |
| FE-014 | Clerk SDK Loaded | Pages include Clerk frontend SDK | Clerk script reference present |
| FE-015 | 404 Page Handling | Non-existent path returns 404 | HTTP 404 with appropriate body |

### 3. Public API Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| API-001 | Calculate Retention Endpoint | `POST /api/payments/calculate` with valid size | HTTP 200 with cost calculation |
| API-002 | Calculate Retention - Zero Size | `POST /api/payments/calculate` with size=0 | HTTP 400 or appropriate error |
| API-003 | Calculate Retention - Large Size | `POST /api/payments/calculate` with 1TB size | HTTP 200 with calculated cost |
| API-004 | Calculate Retention - Invalid Input | `POST /api/payments/calculate` with negative size | HTTP 400 with error message |
| API-005 | Content HEAD Request - Non-existent | `HEAD /api/content/{fake-hash}` | HTTP 404 |
| API-006 | Content GET Request - Non-existent | `GET /api/content/{fake-hash}` | HTTP 404 |
| API-007 | CID-Based Download - Non-existent | `GET /{fake-cid}` | HTTP 404 or appropriate error |
| API-008 | CORS Headers Present | Check CORS headers on API responses | Appropriate CORS headers set |
| API-009 | Content-Type Headers | Verify correct content-type on responses | JSON for API, HTML for pages |
| API-010 | Rate Limit Headers | Check rate limit headers on responses | X-RateLimit-* headers present |

### 4. Authentication Boundary Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| AUTH-001 | Session Endpoint - No Auth | `GET /api/auth/session` without token | HTTP 401 Unauthorized |
| AUTH-002 | API Keys List - No Auth | `GET /api/auth/apikeys` without token | HTTP 401 Unauthorized |
| AUTH-003 | Balance Endpoint - No Auth | `GET /api/balance` without token | HTTP 401 Unauthorized |
| AUTH-004 | Upload Endpoint - No Auth | `POST /api/content/upload` without token | HTTP 401 Unauthorized |
| AUTH-005 | User Uploads - No Auth | `GET /api/user/uploads` without token | HTTP 401 Unauthorized |
| AUTH-006 | Logout Endpoint - No Auth | `POST /api/auth/logout` without token | HTTP 401 Unauthorized |
| AUTH-007 | Create API Key - No Auth | `POST /api/auth/apikeys` without token | HTTP 401 Unauthorized |
| AUTH-008 | Delete Account - No Auth | `DELETE /api/auth/account` without token | HTTP 401 Unauthorized |
| AUTH-009 | Checkout Create - No Auth | `POST /api/payments/create-checkout` without token | HTTP 401 Unauthorized |
| AUTH-010 | Rate Limit Purchase - No Auth | `POST /api/rate-limit/purchase` without token | HTTP 401 Unauthorized |
| AUTH-011 | Invalid Bearer Token | `GET /api/auth/session` with invalid token | HTTP 401 Unauthorized |
| AUTH-012 | Malformed Auth Header | `GET /api/auth/session` with malformed header | HTTP 401 Unauthorized |
| AUTH-013 | Expired Token Handling | Request with expired JWT | HTTP 401 Unauthorized |

### 5. API Key Authentication Tests (Requires Test API Key)

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| KEY-001 | Valid API Key Auth | Request with valid `X-API-Key` header | HTTP 200 (or appropriate success) |
| KEY-002 | Invalid API Key | Request with non-existent API key | HTTP 401 Unauthorized |
| KEY-003 | Revoked API Key | Request with previously revoked key | HTTP 401 Unauthorized |
| KEY-004 | Expired API Key | Request with expired API key | HTTP 401 Unauthorized |
| KEY-005 | API Key Rate Limit Headers | Check rate limit info in response | X-RateLimit headers reflect key limits |
| KEY-006 | API Key Scope Enforcement | Key with limited scope denied other actions | HTTP 403 Forbidden |

### 6. Rate Limiting Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| RATE-001 | Rate Limit Headers Present | Any request returns rate limit headers | X-RateLimit-Limit, X-RateLimit-Remaining present |
| RATE-002 | Anonymous Rate Limit Info | Unauthenticated request shows anonymous limits | Limit reflects 100/minute |
| RATE-003 | Rate Limit Status Endpoint | `GET /api/rate-limit` accessible | HTTP 200 with rate limit info |
| RATE-004 | API Key Reveal Rate Limit | Test 3/hour reveal limit enforcement | After 3 reveals, HTTP 429 with Retry-After |

*Note: Only test restrictive rate limits (like reveal 3/hour). Do not exhaust general rate limits (100/min) as this could affect production.*

### 7. Error Handling Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| ERR-001 | Invalid JSON Body | POST with malformed JSON | HTTP 400 with error message |
| ERR-002 | Missing Required Fields | POST with missing required fields | HTTP 400 with field-specific error |
| ERR-003 | Invalid Content-Type | POST with wrong content-type | HTTP 400 or 415 |
| ERR-004 | Method Not Allowed | Wrong HTTP method on endpoint | HTTP 405 Method Not Allowed |
| ERR-005 | Unknown API Endpoint | `GET /api/nonexistent` | HTTP 404 Not Found |
| ERR-006 | Server Error Response Format | Force/simulate error, check format | JSON error with message field |
| ERR-007 | No Stack Traces Exposed | Error responses don't leak internals | No stack traces in response body |

### 8. Content Integrity Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| INT-001 | Git SHA Consistency | Health SHA matches HTML embedded SHA | Both SHAs are identical |
| INT-002 | Version Consistency | All version indicators match | wrangler.toml, health, HTML all match |
| INT-003 | Favicon Present | `GET /favicon.ico` or equivalent | HTTP 200 or appropriate handling |
| INT-004 | Robots.txt Present | `GET /robots.txt` | HTTP 200 or 404 (documented) |
| INT-005 | No Debug Endpoints Exposed | Common debug paths return 404 | /debug, /admin, /test return 404 |

### 9. Security Tests (Minimal - Header Checks Only)

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| SEC-001 | Security Headers Present | Check for security headers | X-Content-Type-Options, X-Frame-Options present |
| SEC-002 | No Server Header Leak | Server header doesn't expose details | No version info in Server header |
| SEC-003 | HTTPS Only | All resources served over HTTPS | No mixed content |
| SEC-004 | HSTS Header | Strict-Transport-Security present | Valid HSTS header with max-age |
| SEC-005 | No Sensitive Data in URLs | API doesn't require secrets in URL | Secrets in headers/body only |

*Note: Full security testing (injection attacks, XSS, etc.) is out of scope for this workflow.*

### 10. Performance Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| PERF-001 | Root Page Response Time | Measure index load time | < 1000ms |
| PERF-002 | Health Endpoint Response Time | Measure /health latency | < 2000ms |
| PERF-003 | API Endpoint Response Time | Measure typical API latency | < 500ms |
| PERF-004 | Static Asset Response Time | Measure CSS/JS load time | < 500ms |
| PERF-005 | Cache Headers Present | Static assets have cache headers | Cache-Control header present |
| PERF-006 | Gzip/Brotli Compression | Responses are compressed | Content-Encoding header present |
| PERF-007 | Connection Reuse | Multiple requests reuse connection | Keep-Alive or HTTP/2 |

### 11. Webhook Endpoint Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| HOOK-001 | Stripe Webhook Accessible | `POST /api/payments/webhook` reachable | Not HTTP 404 (signature will fail) |
| HOOK-002 | Webhook Requires Signature | POST without Stripe signature | HTTP 400 with signature error |
| HOOK-003 | Invalid Signature Rejected | POST with invalid signature | HTTP 400 with verification error |
| HOOK-004 | Webhook Accepts POST Only | GET on webhook endpoint | HTTP 405 |

### 12. Geographic/Edge Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| GEO-001 | CF-Ray Header Present | Cloudflare Ray ID in response | CF-Ray header present |
| GEO-002 | Edge Caching Working | Static assets cached at edge | CF-Cache-Status header present |
| GEO-003 | Worker Location Header | Check worker execution location | Appropriate headers present |

---

## Test Execution Order

Tests should be executed in the following order to fail fast on critical issues:

1. **Phase 1 - Smoke Tests** (abort on failure)
   - INF-001 (Health Endpoint)
   - FE-001 (Root Page)
   - INF-010 (HTTPS Redirect)

2. **Phase 2 - Infrastructure Validation**
   - INF-002 through INF-009
   - INT-001, INT-002 (Git SHA consistency)

3. **Phase 3 - Frontend Availability**
   - FE-002 through FE-015

4. **Phase 4 - Public API Validation**
   - API-001 through API-010

5. **Phase 5 - Authentication Boundaries**
   - AUTH-001 through AUTH-013

6. **Phase 6 - Security Checks** (header validation only)
   - SEC-001 through SEC-005

7. **Phase 7 - Error Handling**
   - ERR-001 through ERR-007

8. **Phase 8 - Performance Checks**
   - PERF-001 through PERF-007

9. **Phase 9 - Webhook Validation**
   - HOOK-001 through HOOK-004

10. **Phase 10 - Edge/Geographic**
    - GEO-001 through GEO-003

11. **Phase 11 - API Key Tests** (optional, requires secrets)
    - KEY-001 through KEY-006

12. **Phase 12 - Rate Limiting**
    - RATE-001 through RATE-004

---

## Implementation Notes

### Test Script Structure

```
.github/
└── workflows/
    └── deployment-validation.yml

scripts/
└── validation/
    ├── run-all-validations.sh       # Main orchestrator
    ├── test-infrastructure.sh       # INF-* tests
    ├── test-frontend.sh             # FE-* tests
    ├── test-public-api.sh           # API-* tests
    ├── test-auth-boundaries.sh      # AUTH-* tests
    ├── test-api-keys.sh             # KEY-* tests
    ├── test-rate-limiting.sh        # RATE-* tests
    ├── test-error-handling.sh       # ERR-* tests
    ├── test-content-integrity.sh    # INT-* tests
    ├── test-security.sh             # SEC-* tests
    ├── test-performance.sh          # PERF-* tests
    ├── test-webhooks.sh             # HOOK-* tests
    ├── test-edge.sh                 # GEO-* tests
    └── lib/
        ├── assertions.sh            # Common assertion functions
        ├── http-client.sh           # HTTP request wrapper
        └── reporting.sh             # Test result formatting
```

### Required Secrets

| Secret Name | Purpose | Required For |
|-------------|---------|--------------|
| `VALIDATION_API_KEY` | Test API key for KEY-* tests | Phase 11 |
| `EXPECTED_GIT_SHA` | Expected deployed SHA (auto-set) | INT-001, INT-002 |

### Workflow Outputs

- **Summary**: Pass/fail count, test duration
- **Artifacts**: Full test log, failed test details
- **Annotations**: GitHub Actions annotations for failures
- **Badge**: Workflow status badge for README

### Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed
- `2`: Critical infrastructure failure (Phase 1)
- `3`: Configuration error

---

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Test API Key Management | Pre-created key stored as GitHub secret (`VALIDATION_API_KEY`) |
| 2 | Rate Limiting Tests | Test only restrictive limits (once per minute max), verify headers otherwise |
| 3 | Performance Thresholds | Use proposed values: 1000ms pages, 500ms API, 2000ms health |
| 4 | Security Tests Scope | Minimal - header checks only. Full security tests are separate. |
| 5 | Webhook Testing | Test rejection of invalid requests only (no valid signature testing) |
| 6 | Geographic Testing | Single region (GitHub Actions runner location) |
| 7 | Notification Strategy | GitHub Actions annotations only |
| 8 | Test Data Cleanup | All tests are read-only, no cleanup needed |
| 9 | Existing Smoke Tests | Keep smoke-test.yml for quick checks, this workflow for comprehensive validation |
| 10 | Session/Token Testing | Use API key for authenticated endpoint tests |
| 11 | Expected Git SHA | Use SHA from triggering workflow (workflow_run) |
| 12 | Failure Severity | All failures are hard failures - any test failure causes workflow to fail |

---

## Success Criteria

The deployment is considered valid when:

1. All Phase 1 smoke tests pass
2. All infrastructure tests (INF-*) pass
3. All frontend pages load successfully (FE-*)
4. All authentication boundaries are enforced (AUTH-*)
5. All public APIs respond correctly (API-*)
6. Security headers are present (SEC-*)
7. Performance is within acceptable thresholds (PERF-*)
8. Git SHA consistency is verified (INT-001, INT-002)

---

## Future Enhancements

- [ ] Browser-based testing with Playwright for JavaScript functionality
- [ ] Load testing integration (k6, Artillery)
- [ ] Synthetic monitoring integration (Datadog, etc.)
- [ ] Multi-region testing
- [ ] Visual regression testing for frontend
- [ ] Contract testing for API endpoints
- [ ] Dependency vulnerability scanning
- [ ] Accessibility testing (a11y)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-17 | Initial draft |
| 0.2 | 2026-01-17 | Resolved 11 of 12 questions; simplified security tests to header-only; clarified rate limit testing approach |
| 1.0 | 2026-01-17 | All questions resolved; all failures are hard failures; plan ready for implementation |
