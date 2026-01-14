# Deployment Verification Scripts

This directory contains scripts for verifying deployments and testing the HashBin.org infrastructure.

## test-user-balance.sh

Tests that verify user profile creation with zero balance.

### Usage

```bash
# Run balance tests
./scripts/test-user-balance.sh

# Or use npm script
npm run test:balance
```

### What It Tests

The script verifies the following user balance features:

1. **Profile Creation with Zero Balance**
   - Verifies `UserProfile.createProfile` sets `balance_cents: 0`
   - Ensures new users start with exactly $0.00 balance

2. **Balance Field Defaults**
   - Tests that `getBalance` defaults to 0 if balance_cents is missing
   - Ensures backward compatibility

3. **Balance Response Structure**
   - Validates that balance response includes:
     - `balance_cents`: Current account balance
     - `total_deposited_cents`: Lifetime deposits
     - `total_spent_cents`: Lifetime spending

4. **Balance API Authentication**
   - Verifies balance endpoint requires authentication
   - Checks that unauthenticated requests receive 401

5. **Complete Profile Initialization**
   - Ensures all balance fields initialized to 0:
     - `balance_cents`
     - `total_deposited_cents`
     - `total_spent_cents`

6. **Authentication Flow**
   - Verifies `handleSessionInfo` creates profile for new users
   - Tests first-login profile creation

7. **Middleware Profile Detection**
   - Confirms middleware detects when profiles don't exist
   - Ensures `profileExists: false` flag is set correctly

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Example Output

```
==========================================
User Balance Creation Tests
==========================================

Testing against: http://localhost:8787

==========================================
TEST: New user profile is created with balance of 0 cents
==========================================
✅ PASS: UserProfile.createProfile sets balance_cents to 0

==========================================
TEST: getBalance method returns 0 for new users with no balance
==========================================
✅ PASS: getBalance defaults to 0 if balance_cents is missing

...

==========================================
Test Summary
==========================================
Total Tests:  7
Passed:       7
Failed:       0

✅ All tests passed!
```

## test-auth-system.sh

Comprehensive test script for User Authorization System that tests authentication flows, API key management, and authorization middleware.

### Usage

```bash
# Run auth tests (requires dev server running)
./scripts/test-auth-system.sh

# Or use npm script
npm run test:auth
```

See the script file for detailed documentation of what it tests.

## verify-deployment.sh

Comprehensive deployment verification script that tests all critical endpoints and services.

### Usage

```bash
# Verify development deployment
./scripts/verify-deployment.sh development <account-id>

# Verify production deployment
./scripts/verify-deployment.sh production <account-id>

# Verify custom domain
./scripts/verify-deployment.sh https://hashbin.org
```

### NPM Scripts

For convenience, you can use npm scripts:

```bash
# Verify development (requires CLOUDFLARE_ACCOUNT_ID env var)
npm run verify:dev -- <account-id>

# Verify production (requires CLOUDFLARE_ACCOUNT_ID env var)
npm run verify:prod -- <account-id>

# Verify custom domain
npm run verify:custom
```

### What It Tests

The verification script performs 4 comprehensive tests:

1. **Root Endpoint Test** (`GET /`)
   - Verifies HTTP 200 response
   - Checks response contains service name
   - Validates JSON structure

2. **Health Endpoint Test** (`GET /health`)
   - Verifies HTTP 200 response
   - Checks health status is "healthy"
   - Validates environment matches expected
   - Verifies JSON structure

3. **Service Status Test**
   - Worker operational status
   - Durable Objects operational status
   - R2 Storage operational status

4. **404 Handling Test** (`GET /nonexistent`)
   - Verifies HTTP 404 for invalid routes
   - Tests error handling

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Example Output

```
==========================================
Verifying deployment: development
Base URL: https://hashbin-worker-dev.abc123.workers.dev
==========================================

Test 1: Root endpoint
--------------------
HTTP Status: 200
✅ PASSED

Test 2: Health endpoint
--------------------
HTTP Status: 200
Response: {"status":"healthy","environment":"development",...}
✅ PASSED

Test 3: Service status
--------------------
Worker: operational
Durable Objects: operational
R2: operational
✅ PASSED

Test 4: 404 handling
--------------------
HTTP Status: 404
✅ PASSED

==========================================
✅ All verification tests passed!
==========================================
Environment: development
Base URL: https://hashbin-worker-dev.abc123.workers.dev
Status: All systems operational

Endpoints tested:
  - GET / (root)
  - GET /health
  - GET /nonexistent (404)

Services verified:
  - Cloudflare Workers
  - Durable Objects
  - R2 Storage
==========================================
```

## Integration with CI/CD

The verification tests are automatically run in GitHub Actions after each deployment:

- **Development:** Tests run after deploying to `develop` branch
- **Production:** Tests run after deploying to `main` branch

If verification fails, the deployment is marked as failed in GitHub Actions.

## Troubleshooting

### "Connection refused" or timeout
- Deployment may not have propagated yet (wait 30 seconds and retry)
- Check Cloudflare status page for service issues
- Verify account ID is correct

### "Environment mismatch" warning
- Check wrangler.toml environment configuration
- Verify correct environment variable in Worker

### Health check returns unhealthy
- Check Cloudflare Workers logs in dashboard
- Verify Durable Objects are enabled
- Verify R2 buckets exist

### 404 for all endpoints
- Worker may not be deployed
- Check Workers dashboard for deployment status
- Verify account ID is correct

## Local Testing

You can run the verification script locally after deploying:

```bash
# Deploy to development
npm run deploy:dev

# Wait a few seconds for propagation
sleep 10

# Verify deployment
./scripts/verify-deployment.sh development your-account-id
```

## Adding New Tests

To add new verification tests, edit `verify-deployment.sh`:

1. Add a new test section with descriptive echo statements
2. Use `curl` to test the endpoint
3. Parse the response and check expected values
4. Exit with code 1 if test fails
5. Print ✅ PASSED if test succeeds

Example:

```bash
echo "Test N: My New Test"
echo "--------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/my-endpoint")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED: Expected HTTP 200, got $HTTP_CODE"
  exit 1
fi

echo "✅ PASSED"
echo ""
```

## Future Enhancements

Planned improvements for verification scripts:

- [ ] Test Durable Objects directly (not just health check)
- [ ] Test R2 bucket access (upload/download)
- [ ] Performance testing (response time thresholds)
- [ ] Load testing for scalability verification
- [ ] Security testing (CORS, headers, etc.)
- [ ] Integration tests with full API workflows
