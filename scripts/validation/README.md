# Deployment Validation Scripts

This directory contains comprehensive validation tests for the HashBin.org deployment. The tests verify infrastructure health, frontend availability, API functionality, authentication boundaries, security headers, performance, and more.

## Overview

The validation suite consists of:
- **12 test categories** covering 89+ individual tests
- **3 library modules** for common functionality (assertions, HTTP client, reporting)
- **1 main orchestrator** that runs all tests in the correct order
- **1 GitHub Actions workflow** for automated and scheduled validation

## Quick Start

### Run All Validations

```bash
# Against production
TARGET_URL=https://hashbin.org bash scripts/validation/run-all-validations.sh

# With verbose output
TARGET_URL=https://hashbin.org VERBOSE=true bash scripts/validation/run-all-validations.sh

# Skip authentication tests
TARGET_URL=https://hashbin.org SKIP_AUTH_TESTS=true bash scripts/validation/run-all-validations.sh
```

### Run Individual Test Suite

```bash
# Infrastructure tests only
TARGET_URL=https://hashbin.org bash scripts/validation/test-infrastructure.sh

# Frontend tests only
TARGET_URL=https://hashbin.org bash scripts/validation/test-frontend.sh

# API tests only
TARGET_URL=https://hashbin.org bash scripts/validation/test-public-api.sh
```

## Test Categories

### Core Tests (Always Run)

1. **Infrastructure** (`test-infrastructure.sh`) - INF-001 to INF-010
   - Health endpoint availability and response structure
   - Integration status (Clerk, Stripe, R2, Durable Objects)
   - Git SHA verification
   - TLS certificate validation
   - HTTP to HTTPS redirect

2. **Frontend** (`test-frontend.sh`) - FE-001 to FE-015
   - Root and application pages load successfully
   - Git SHA embedded in HTML
   - Static assets (CSS, JS) accessible
   - Auth gate and Clerk SDK present
   - 404 handling

3. **Public API** (`test-public-api.sh`) - API-001 to API-010
   - Payment calculation endpoint
   - Content retrieval (HEAD/GET)
   - CORS headers
   - Content-Type headers
   - Rate limit headers

4. **Authentication Boundaries** (`test-auth-boundaries.sh`) - AUTH-001 to AUTH-013
   - Protected endpoints require authentication
   - Invalid tokens rejected
   - Malformed auth headers handled
   - Expired tokens rejected

5. **Error Handling** (`test-error-handling.sh`) - ERR-001 to ERR-007
   - Invalid JSON rejected
   - Missing required fields handled
   - Wrong HTTP methods rejected
   - Error responses properly formatted
   - No stack traces exposed

6. **Content Integrity** (`test-content-integrity.sh`) - INT-001 to INT-005
   - Git SHA consistency across endpoints
   - Favicon and robots.txt handling
   - Debug endpoints not exposed

7. **Security** (`test-security.sh`) - SEC-001 to SEC-005
   - Security headers present (X-Content-Type-Options, X-Frame-Options)
   - Server header doesn't leak version info
   - HTTPS enforced
   - HSTS header configured
   - Sensitive data not in URLs

8. **Performance** (`test-performance.sh`) - PERF-001 to PERF-007
   - Response times within thresholds (1s pages, 500ms API, 2s health)
   - Cache headers on static assets
   - Compression enabled (gzip/brotli)
   - Connection reuse (Keep-Alive/HTTP2)

9. **Webhooks** (`test-webhooks.sh`) - HOOK-001 to HOOK-004
   - Stripe webhook endpoint accessible
   - Signature validation required
   - Invalid signatures rejected
   - POST-only enforcement

10. **Edge/Geographic** (`test-edge.sh`) - GEO-001 to GEO-003
    - Cloudflare Ray ID present
    - Edge caching working
    - Worker location headers

### Optional Tests (Require Secrets)

11. **API Keys** (`test-api-keys.sh`) - KEY-001 to KEY-006
    - Valid API key authentication
    - Invalid/revoked/expired keys rejected
    - Rate limit headers for API keys
    - Scope enforcement
    - **Requires**: `VALIDATION_API_KEY` environment variable

12. **Rate Limiting** (`test-rate-limiting.sh`) - RATE-001 to RATE-004
    - Rate limit headers present
    - Anonymous vs authenticated limits
    - Rate limit status endpoint
    - **Note**: Does not test exhaustion to avoid affecting production

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_URL` | `https://hashbin.org` | URL to test against |
| `VERBOSE` | `false` | Enable detailed output |
| `SKIP_AUTH_TESTS` | `false` | Skip authentication boundary tests |
| `EXPECTED_GIT_SHA` | (empty) | Expected Git SHA for version verification |
| `VALIDATION_API_KEY` | (empty) | API key for authenticated endpoint tests |

## Test Execution Order

The orchestrator runs tests in this order with fail-fast on Phase 1:

1. **Phase 1** (Critical - abort on failure): Infrastructure smoke tests
2. **Phase 2**: Frontend availability
3. **Phase 3**: Public API validation
4. **Phase 4**: Authentication boundaries
5. **Phase 5**: Security checks
6. **Phase 6**: Error handling
7. **Phase 7**: Content integrity
8. **Phase 8**: Performance checks
9. **Phase 9**: Webhook validation
10. **Phase 10**: Edge/geographic tests
11. **Phase 11**: API key tests (if `VALIDATION_API_KEY` provided)
12. **Phase 12**: Rate limiting tests

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed
- `2`: Critical infrastructure failure (Phase 1)

## GitHub Actions Integration

The validation workflow (`.github/workflows/deployment-validation.yml`) runs:

- **Daily** at 06:00 UTC (scheduled)
- **After deployment** when a deployment to `main` completes successfully
- **Manually** via workflow_dispatch with customizable parameters

### Workflow Parameters (Manual Run)

- **target_url**: Override the default production URL
- **verbose**: Enable verbose output for debugging
- **skip_auth_tests**: Skip authentication boundary tests

### GitHub Actions Outputs

- Test results with pass/fail status
- GitHub annotations for failures
- Test artifacts (logs)
- Job summary with results table

## Library Modules

### `lib/assertions.sh`

Common assertion functions for tests:
- `assert_http_status` - Compare HTTP status codes
- `assert_contains` - Check if response contains pattern
- `assert_json_field` - Verify JSON field value
- `assert_json_field_exists` - Verify JSON field presence
- `assert_response_time` - Check response time threshold
- `assert_header_exists` - Verify HTTP header present
- `assert_header_value` - Check HTTP header value
- `assert_matches_pattern` - Regex pattern matching
- `assert_equal` - Compare two values
- `assert_not_empty` - Verify value is not empty

### `lib/http-client.sh`

HTTP request wrapper functions:
- `http_get` - Make GET request
- `http_post` - Make POST request
- `http_head` - Make HEAD request
- `http_delete` - Make DELETE request
- `http_put` - Make PUT request
- `http_check` - Simple connectivity test
- `http_follow_redirect` - Follow redirects
- `is_json` - Check if response is JSON
- `get_header` - Extract header value

Sets global variables: `HTTP_STATUS`, `HTTP_BODY`, `HTTP_HEADERS`, `HTTP_TIME_MS`

### `lib/reporting.sh`

Test result formatting and reporting:
- `init_test_suite` - Initialize test counters
- `log_pass` - Log successful test
- `log_fail` - Log failed test with details
- `log_skip` - Log skipped test
- `log_info` - Log informational message
- `log_warn` - Log warning message
- `log_section` - Print section header
- `print_test_summary` - Display results summary
- `generate_json_report` - Export results as JSON
- `exit_with_results` - Exit with appropriate code
- `create_github_annotations` - Add GitHub Actions annotations

## Development

### Adding New Tests

1. Add test specification to `todo/deployment_validation.md`
2. Choose appropriate test script file
3. Implement test using library functions:
   ```bash
   log_info "Testing new feature..."
   http_get "$TARGET_URL/api/new-endpoint"
   assert_http_status "$HTTP_STATUS" "200" "NEW-001" "New Feature Test"
   ```
4. Update test count in this README
5. Test locally before committing

### Test Writing Guidelines

- Use descriptive test IDs (e.g., INF-001, FE-001)
- Provide clear descriptions for each test
- Use assertion functions from `lib/assertions.sh`
- Log informational context with `log_info`
- Skip tests gracefully when prerequisites not met
- Don't exhaust rate limits in production
- Clean up any test data created

## Troubleshooting

### Tests Fail with HTTP 000

- Check network connectivity to target URL
- Verify DNS resolution: `nslookup hashbin.org`
- Check for firewall or proxy blocking requests

### Tests Time Out

- Increase `HTTP_TIME_MS` thresholds if needed
- Check if target server is under load
- Verify network latency to target

### API Key Tests Skipped

- Ensure `VALIDATION_API_KEY` environment variable is set
- Verify API key is valid and not revoked
- Check API key has appropriate permissions

### GitHub Actions Workflow Fails

- Check workflow logs for detailed error messages
- Verify secrets are configured in repository settings
- Ensure target URL is accessible from GitHub Actions runners

## References

- Plan document: `todo/deployment_validation.md`
- GitHub Actions workflow: `.github/workflows/deployment-validation.yml`
- Existing smoke tests: `.github/workflows/smoke-test.yml`
