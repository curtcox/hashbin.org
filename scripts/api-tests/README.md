# Local API Tests

Automated integration tests for the HashBin.org API running in local development mode.

## Overview

This test suite validates the HTTP API behavior by making real requests to a locally running development server. The tests cover:

- Health & configuration endpoints
- Authentication (LocalDev and API keys)
- Balance management
- Content upload/download
- Rate limiting
- Content extension
- User data
- Donations
- Error handling
- Concurrent operations

**Total: 138 tests across 11 test suites**

## Prerequisites

1. Start the local development server:
   ```bash
   npm run dev:local
   ```

2. Wait for the server to be ready (check http://localhost:8787/health)

## Running Tests

### Run All Tests

```bash
# From repository root
npm run test:api

# Or directly
bash scripts/run-all-api-tests.sh
```

### Run Individual Test Suites

```bash
npm run test:api:health         # Health & Config (10 tests)
npm run test:api:auth           # Authentication (31 tests)
npm run test:api:balance        # Balance Management (10 tests)
npm run test:api:upload         # Content Upload (35 tests)
npm run test:api:download       # Content Download (17 tests)
npm run test:api:ratelimit      # Rate Limit Purchase (10 tests)
npm run test:api:extension      # Content Extension (6 tests)
npm run test:api:user           # User Data (5 tests)
npm run test:api:donation       # Donations (4 tests)
npm run test:api:errors         # Error Handling (6 tests)
npm run test:api:concurrent     # Concurrent Operations (4 tests)
```

## Test Architecture

### Common Utilities (`common.sh`)

Provides shared functionality:

- **HTTP helpers**: `http_get`, `http_post`, `http_delete`, etc.
- **Assertion helpers**: `assert_status`, `assert_json_field`, `assert_contains`
- **JSON parsing**: Using `jq` for reliable JSON extraction
- **Test reporting**: Pass/fail tracking with colored output
- **Cleanup**: Automatic temp file cleanup

### Test Structure

Each test file follows this pattern:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Run tests
response=$(http_get "/endpoint")
status=$(get_status "$response")
body=$(get_body "$response")
assert_status "$status" "200" "Test description"

# Print summary
print_summary "Test Suite Name"
exit $?
```

## Authentication

Tests use LocalDev authentication mode:

```bash
Authorization: LocalDev <user_id>
```

Each test run generates a unique user ID to ensure isolation:
```bash
api_test_user_$(date +%s)_$$
```

## Configuration

Environment variables:

- `BASE_URL`: Server URL (default: `http://localhost:8787`)
- `TEST_USER`: User ID for LocalDev auth (auto-generated if not set)
- `DEBUG`: Set to `1` for verbose output

Example:
```bash
DEBUG=1 BASE_URL=http://localhost:9000 npm run test:api:health
```

## CI Integration

Tests run automatically on pull requests via GitHub Actions (`.github/workflows/local-api-tests.yml`):

- Triggers on PRs to `main` or `develop` branches
- Starts local server automatically
- Runs full test suite
- Reports results in PR checks
- Timeout: 5 minutes

## Test Design

- **Sequential execution**: Tests run in order and may share state
- **Unique user IDs**: Each run uses fresh user IDs (no cleanup needed)
- **Fail fast**: Tests exit on first failure for quick feedback
- **Minimal dependencies**: Uses bash, curl, and jq (all standard tools)

## Troubleshooting

### Server not responding

```bash
# Check if server is running
curl http://localhost:8787/health

# Restart server
npm run dev:local
```

### Test failures

1. Check server logs for errors
2. Run tests with `DEBUG=1` for verbose output
3. Run individual failing tests for isolation
4. Verify API behavior manually with curl

### JSON parsing errors

Tests use `jq` for JSON parsing. If `jq` is not installed:

```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

## File Structure

```
scripts/api-tests/
├── README.md                        # This file
├── common.sh                        # Shared utilities
├── test-local-health.sh             # Health & Config tests
├── test-local-auth.sh               # Authentication tests
├── test-local-balance.sh            # Balance tests
├── test-local-upload.sh             # Upload tests
├── test-local-download.sh           # Download tests
├── test-local-ratelimit-purchase.sh # Rate limit tests
├── test-local-extension.sh          # Extension tests
├── test-local-user.sh               # User data tests
├── test-local-donation.sh           # Donation tests
├── test-local-errors.sh             # Error handling tests
└── test-local-concurrent.sh         # Concurrent tests
```

## Contributing

When adding new tests:

1. Follow existing test structure and naming conventions
2. Use helper functions from `common.sh`
3. Add test to appropriate suite or create new suite
4. Update master runner (`scripts/run-all-api-tests.sh`)
5. Add npm script to `package.json`
6. Document new tests in `todo/local_API_tests.md`

## References

- Full test plan: `todo/local_API_tests.md`
- API documentation: Project README and source code
- CI workflow: `.github/workflows/local-api-tests.yml`
