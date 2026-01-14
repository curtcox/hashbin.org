# Manual Testing Guide for User Authorization

This guide provides step-by-step instructions for manually testing the user authorization system with actual Clerk OAuth providers.

## Prerequisites

- Clerk application configured with OAuth providers
- Production deployment completed (see deployment_checklist.md)
- Test accounts for each OAuth provider:
  - Google account
  - Apple ID
  - Microsoft account
  - GitHub account

---

## Test Suite Organization

### Test Categories

1. **OAuth Authentication Tests** - Test OAuth login flows
2. **Account Linking Tests** - Test multiple provider linking
3. **API Key Lifecycle Tests** - Test API key CRUD operations
4. **Session Management Tests** - Test session info and logout
5. **Account Deletion Tests** - Test soft delete and data retention
6. **Error Handling Tests** - Test error cases and edge conditions

---

## 1. OAuth Authentication Tests

### Test 1.1: Google OAuth Login

**Objective:** Verify users can sign in with Google

**Steps:**
1. Visit https://hashbin.org
2. Click "Sign In" or "Get Started"
3. Select "Continue with Google"
4. Authenticate with Google account
5. Authorize HashBin.org application

**Expected Results:**
- ✅ Redirected to Clerk OAuth flow
- ✅ Google authentication page loads
- ✅ After authentication, redirected back to HashBin
- ✅ User session created
- ✅ `user.created` webhook fires
- ✅ UserProfile Durable Object created

**Verification:**
```bash
# Check worker logs for webhook
wrangler tail --env production --format pretty

# Should see: Clerk webhook event: user.created for user: user_xxx
```

### Test 1.2: GitHub OAuth Login

**Objective:** Verify users can sign in with GitHub

**Steps:**
1. Log out from any existing session
2. Click "Sign In"
3. Select "Continue with GitHub"
4. Authorize HashBin.org application
5. Complete GitHub OAuth flow

**Expected Results:**
- ✅ GitHub authentication page loads
- ✅ After authentication, redirected back to HashBin
- ✅ User session created
- ✅ UserProfile includes GitHub provider

**Verification:**
```bash
# Make authenticated request
curl https://hashbin.org/api/auth/session \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"

# Response should include:
# {
#   "user_id": "user_xxx",
#   "auth_method": "clerk",
#   "profile": {
#     "providers": [
#       {"provider": "github", ...}
#     ]
#   }
# }
```

### Test 1.3: Apple Sign In

**Objective:** Verify users can sign in with Apple

**Steps:**
1. Visit HashBin on iOS device or macOS with Safari
2. Click "Sign In"
3. Select "Continue with Apple"
4. Complete Apple authentication
5. Choose name/email privacy options

**Expected Results:**
- ✅ Apple Sign In flow completes
- ✅ User session created
- ✅ Privacy-preserving email used if selected

### Test 1.4: Microsoft OAuth Login

**Objective:** Verify users can sign in with Microsoft

**Steps:**
1. Log out from any existing session
2. Click "Sign In"
3. Select "Continue with Microsoft"
4. Authenticate with Microsoft account
5. Consent to permissions

**Expected Results:**
- ✅ Microsoft authentication page loads
- ✅ After authentication, redirected back
- ✅ User session created

---

## 2. Account Linking Tests

### Test 2.1: Link Additional OAuth Provider

**Objective:** Verify users can link multiple OAuth accounts

**Steps:**
1. Log in with Google account
2. Note current user_id
3. Navigate to account settings
4. Click "Link GitHub Account"
5. Complete GitHub OAuth flow
6. Verify account linked

**Expected Results:**
- ✅ GitHub successfully linked to existing account
- ✅ Same user_id maintained
- ✅ `user.updated` webhook fires
- ✅ UserProfile updated with both providers

**Verification:**
```bash
# Check session info
curl https://hashbin.org/api/auth/session \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"

# Response should show both providers:
# {
#   "profile": {
#     "providers": [
#       {"provider": "google", ...},
#       {"provider": "github", ...}
#     ]
#   }
# }
```

### Test 2.2: Login with Linked Account

**Objective:** Verify users can log in with any linked provider

**Steps:**
1. Log out completely
2. Click "Sign In"
3. Select "Continue with GitHub" (previously linked)
4. Complete authentication

**Expected Results:**
- ✅ Logged in to same account
- ✅ Same user_id as before
- ✅ Both providers still linked
- ✅ No duplicate profile created

### Test 2.3: Link Third Provider

**Objective:** Verify users can link 3+ OAuth accounts

**Steps:**
1. While logged in (with Google + GitHub)
2. Link Microsoft account
3. Verify all three providers linked

**Expected Results:**
- ✅ All three providers listed in profile
- ✅ Can log in with any of the three

---

## 3. API Key Lifecycle Tests

### Test 3.1: Create API Key

**Objective:** Verify users can create API keys

**Steps:**
1. Log in with Clerk session
2. Make POST request to create API key:

```bash
curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Key 1",
    "expires_at": "2027-01-14T00:00:00Z"
  }'
```

**Expected Results:**
- ✅ API key returned in response
- ✅ Key format: `hb_live_` + 32 random characters
- ✅ Warning message about saving key
- ✅ Key ID, name, created_at, expires_at included
- ✅ Key hash stored in UserProfile DO
- ✅ Key registered in KeyRegistry DO

**Save the returned API key for subsequent tests!**

### Test 3.2: List API Keys

**Objective:** Verify users can see their API keys

**Steps:**
```bash
curl https://hashbin.org/api/auth/apikeys \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"
```

**Expected Results:**
- ✅ Array of API keys returned
- ✅ Each key shows: key_id, name, created_at, expires_at, last_used_at, revoked
- ✅ API key values NOT included (security)
- ✅ Previously created key listed

### Test 3.3: Use API Key for Authentication

**Objective:** Verify API keys work for authentication

**Steps:**
```bash
# Using Authorization header
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey YOUR_API_KEY_HERE"

# Using X-API-Key header
curl https://hashbin.org/api/auth/session \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

**Expected Results:**
- ✅ Authentication succeeds
- ✅ User context returned
- ✅ auth_method is "apikey"
- ✅ last_used_at timestamp updated

### Test 3.4: Create Multiple API Keys

**Objective:** Verify users can create up to 25 API keys

**Steps:**
```bash
# Create keys with different names
for i in {1..5}; do
  curl -X POST https://hashbin.org/api/auth/apikeys \
    -H "Cookie: __session=YOUR_SESSION_COOKIE" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"Test Key $i\"}"
done
```

**Expected Results:**
- ✅ All 5 keys created successfully
- ✅ Each key has unique key_id
- ✅ Each key has unique key value
- ✅ All keys listed in list endpoint

### Test 3.5: Revoke API Key

**Objective:** Verify users can revoke API keys

**Steps:**
```bash
# Get key_id from list endpoint
KEY_ID="YOUR_KEY_ID_HERE"

# Revoke key
curl -X DELETE https://hashbin.org/api/auth/apikeys/$KEY_ID \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"
```

**Expected Results:**
- ✅ Key revoked successfully
- ✅ Response: `{"success": true, "message": "API key revoked successfully"}`

**Verification:**
```bash
# Try to use revoked key
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey REVOKED_KEY_HERE"

# Expected: 401 with AUTH_REVOKED error
```

### Test 3.6: API Key Limit Enforcement

**Objective:** Verify 25 key limit is enforced

**Steps:**
1. Create 25 API keys (may need to create in batches)
2. Attempt to create 26th key

**Expected Results:**
- ✅ Keys 1-25 created successfully
- ✅ 26th key returns 400 error
- ✅ Error code: `AUTH_KEY_LIMIT`
- ✅ Message: "Maximum of 25 API keys allowed"

---

## 4. Session Management Tests

### Test 4.1: Get Session Info

**Objective:** Verify session endpoint returns user info

**Steps:**
```bash
curl https://hashbin.org/api/auth/session \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"
```

**Expected Results:**
- ✅ User ID returned
- ✅ Auth method: "clerk"
- ✅ Profile data included
- ✅ Linked providers listed

### Test 4.2: Session Without Authentication

**Objective:** Verify endpoint requires authentication

**Steps:**
```bash
curl https://hashbin.org/api/auth/session
```

**Expected Results:**
- ✅ 401 status code
- ✅ Error: "AUTH_MISSING"
- ✅ Message: "Authentication required"

### Test 4.3: Invalid Session Token

**Objective:** Verify invalid tokens are rejected

**Steps:**
```bash
curl https://hashbin.org/api/auth/session \
  -H "Cookie: __session=invalid_token_here"
```

**Expected Results:**
- ✅ 401 status code
- ✅ Error: "AUTH_INVALID_FORMAT" or "AUTH_EXPIRED"

---

## 5. Account Deletion Tests

### Test 5.1: Delete Account with Confirmation

**Objective:** Verify account deletion requires confirmation

**Steps:**
```bash
# Without confirmation (should fail)
curl -X DELETE https://hashbin.org/api/auth/account \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Results:**
- ✅ 403 status code
- ✅ Error: "Confirmation required"
- ✅ Message: "2FA confirmation required for account deletion"

### Test 5.2: Delete Account with Confirmation

**Objective:** Verify account deletion works with confirmation

**Steps:**
```bash
curl -X DELETE https://hashbin.org/api/auth/account \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"confirmed": true}'
```

**Expected Results:**
- ✅ 200 status code
- ✅ Success message returned
- ✅ UserProfile soft-deleted (deleted_at set)
- ✅ API keys cleared
- ✅ Uploads cleared
- ✅ Payment records retained

**Verification:**
```bash
# Try to use session after deletion
curl https://hashbin.org/api/auth/session \
  -H "Cookie: __session=YOUR_SESSION_COOKIE"

# Expected: 401 with AUTH_USER_DELETED
```

### Test 5.3: Account Deletion via Clerk Dashboard

**Objective:** Verify webhook handles Clerk-initiated deletion

**Steps:**
1. Log in to Clerk Dashboard
2. Navigate to Users
3. Find test user
4. Click "Delete User"
5. Confirm deletion

**Expected Results:**
- ✅ `user.deleted` webhook fires
- ✅ UserProfile soft-deleted in Worker
- ✅ User cannot authenticate afterward

---

## 6. Error Handling Tests

### Test 6.1: Rate Limiting

**Objective:** Verify rate limiting is enforced

**Steps:**
```bash
# Make 101 requests rapidly (anonymous limit is 100/min)
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://hashbin.org/
done
```

**Expected Results:**
- ✅ First 100 requests: 200 status
- ✅ 101st request: 429 status
- ✅ Response includes: error "AUTH_RATE_LIMITED"
- ✅ Retry-After header present
- ✅ X-RateLimit headers present

### Test 6.2: Malformed API Key

**Objective:** Verify malformed keys are rejected

**Steps:**
```bash
# Wrong prefix
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey wrong_prefix_abcdefghijklmnopqrstuvwxyz123456"

# Too short
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey hb_live_short"

# Invalid characters
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey hb_live_!!!invalid!!!characters!!!"
```

**Expected Results:**
- ✅ All return 401 status
- ✅ Error: "AUTH_INVALID_FORMAT"
- ✅ Appropriate error messages

### Test 6.3: Test Key in Production

**Objective:** Verify environment mismatch detection

**Steps:**
```bash
# Try to use test key in production
curl https://hashbin.org/api/auth/session \
  -H "Authorization: ApiKey hb_test_abcdefghijklmnopqrstuvwxyz123456"
```

**Expected Results:**
- ✅ 401 status code
- ✅ Error: "AUTH_ENV_MISMATCH"
- ✅ Message: "Test keys cannot be used in production environment"

### Test 6.4: Expired API Key

**Objective:** Verify expired keys are rejected

**Steps:**
1. Create API key with past expiration:
```bash
curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Cookie: __session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Expired Key Test",
    "expires_at": "2020-01-01T00:00:00Z"
  }'
```

**Expected Results:**
- ✅ 400 status code
- ✅ Error: "Invalid expiration"
- ✅ Message: "Expiration date must be in the future"

### Test 6.5: API Key Creation Without Clerk Session

**Objective:** Verify API keys require Clerk session

**Steps:**
```bash
# Try to create API key with another API key
curl -X POST https://hashbin.org/api/auth/apikeys \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Should Fail"}'
```

**Expected Results:**
- ✅ 403 status code
- ✅ Error: "Invalid authentication method"
- ✅ Message: "API keys cannot be used to create new API keys"

---

## Test Results Template

Copy and fill out after completing manual tests:

```
# Manual Testing Results - User Authorization

**Date:** YYYY-MM-DD
**Tester:** Your Name
**Environment:** Production / Development
**Clerk App ID:** app_xxxxx

## OAuth Authentication
- [ ] Google OAuth: PASS / FAIL / SKIP
- [ ] GitHub OAuth: PASS / FAIL / SKIP
- [ ] Apple Sign In: PASS / FAIL / SKIP
- [ ] Microsoft OAuth: PASS / FAIL / SKIP

## Account Linking
- [ ] Link additional provider: PASS / FAIL
- [ ] Login with linked account: PASS / FAIL
- [ ] Multiple providers: PASS / FAIL

## API Key Management
- [ ] Create API key: PASS / FAIL
- [ ] List API keys: PASS / FAIL
- [ ] Use API key: PASS / FAIL
- [ ] Revoke API key: PASS / FAIL
- [ ] 25 key limit: PASS / FAIL

## Session Management
- [ ] Get session info: PASS / FAIL
- [ ] Unauthenticated access: PASS / FAIL
- [ ] Invalid token: PASS / FAIL

## Account Deletion
- [ ] Deletion requires confirmation: PASS / FAIL
- [ ] Deletion with confirmation: PASS / FAIL
- [ ] Webhook deletion: PASS / FAIL

## Error Handling
- [ ] Rate limiting: PASS / FAIL
- [ ] Malformed API key: PASS / FAIL
- [ ] Environment mismatch: PASS / FAIL
- [ ] Expired API key: PASS / FAIL
- [ ] API key creation auth: PASS / FAIL

## Issues Found
1. (Describe any issues)

## Notes
(Any additional observations)
```

---

## Common Issues and Troubleshooting

### Issue: OAuth Redirect Loop

**Symptom:** After OAuth login, repeatedly redirected to OAuth provider

**Solution:**
1. Check Clerk Dashboard redirect URLs configuration
2. Verify CORS settings in Worker
3. Clear browser cookies and try again

### Issue: Webhook Not Firing

**Symptom:** UserProfile not created after signup

**Solution:**
1. Check Clerk Dashboard webhook logs
2. Verify webhook URL is correct: `https://hashbin.org/api/webhooks/clerk`
3. Verify CLERK_WEBHOOK_SECRET is set correctly
4. Check Worker logs for webhook processing

### Issue: API Key Not Working

**Symptom:** Valid API key returns 401

**Solution:**
1. Verify key format matches `hb_live_` + 32 characters
2. Check if key has been revoked
3. Verify key hasn't expired
4. Check Worker logs for specific error

### Issue: Session Not Persisting

**Symptom:** User logged out immediately after login

**Solution:**
1. Check browser cookie settings
2. Verify HTTPS is enabled (required for secure cookies)
3. Check Clerk session configuration

---

## Regression Testing

After any code changes, re-run these critical tests:

1. **Smoke Tests** (Quick validation)
   - OAuth login with one provider
   - Create one API key
   - Make authenticated request
   - Check health endpoint

2. **Core Functionality** (Full validation)
   - All OAuth providers
   - API key full lifecycle
   - Account linking
   - Account deletion

3. **Error Handling** (Edge cases)
   - Invalid credentials
   - Rate limiting
   - Malformed requests

---

## Automated Testing

While this guide covers manual testing, many tests can be automated:

```bash
# Run automated test suite
./scripts/test-auth-system.sh

# Run with actual Clerk credentials
CLERK_SECRET_KEY=sk_test_xxx ./scripts/test-auth-system.sh
```

See `scripts/test-auth-system.sh` for automated test coverage.

---

## Sign-Off

**Manual Testing Completed:** ☐  
**All Tests Passed:** ☐  
**Issues Documented:** ☐  
**Ready for Production:** ☐  

**Tester Signature:** _______________  
**Date:** _______________
