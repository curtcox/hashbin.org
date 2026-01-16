# Key Management Backend Implementation Plan

**Status:** Ready for Implementation
**Date:** 2026-01-16
**Related:** `todo/key_management_ui.md`

## Overview

Implement two backend features required for the key management UI:
1. **Usage count tracking** - Track total API requests per key
2. **PATCH endpoint** - Allow renaming API keys with fresh authentication

These features must be implemented before UI work can begin.

## Timeline Estimate

- **Feature 1 (Usage Count):** 4-6 hours
- **Feature 2 (PATCH Endpoint):** 4-6 hours
- **Testing:** 4-6 hours
- **Total:** 12-18 hours (2-3 days)

---

## Feature 1: Usage Count Tracking

### Objective
Track the total number of API requests made with each API key and return this count in the API key list response.

### Current State
- API keys track `last_used_at` timestamp
- No usage count is tracked
- `updateLastUsed()` method updates timestamp only
- Source: `/home/user/hashbin.org/src/durable-objects/user-profile.js:630-670`

### Implementation Steps

#### Step 1: Add `usage_count` field to API key schema

**File:** `/home/user/hashbin.org/src/durable-objects/user-profile.js`

**Location:** `createApiKey()` method (lines 245-318)

**Changes:**
```javascript
// In createApiKey() method, when creating new key object:
const apiKey = {
  key_id: keyId,
  key_hash: keyHash,
  key_encrypted: encryptedKey,
  name: name,
  created_at: now,
  expires_at: expiresAt,
  last_used_at: null,
  usage_count: 0,  // ADD THIS LINE
  revoked_at: null,
  reveal_timestamps: []
};
```

#### Step 2: Increment usage count in `updateLastUsed()` method

**File:** `/home/user/hashbin.org/src/durable-objects/user-profile.js`

**Location:** `updateLastUsed()` method (lines 630-670)

**Changes:**
```javascript
async updateLastUsed(keyId) {
  const profile = await this.state.storage.get('profile');

  if (!profile) {
    return new Response(
      JSON.stringify({
        error: 'Profile not found'
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  const apiKey = profile.api_keys.find(key => key.key_id === keyId);

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'API key not found'
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  apiKey.last_used_at = new Date().toISOString();

  // ADD THESE LINES:
  // Initialize usage_count if not present (backward compatibility)
  if (typeof apiKey.usage_count !== 'number') {
    apiKey.usage_count = 0;
  }
  // Increment usage count
  apiKey.usage_count++;

  profile.updated_at = new Date().toISOString();

  await this.state.storage.put('profile', profile);

  return new Response(
    JSON.stringify({
      success: true
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}
```

#### Step 3: Return usage_count in API key list response

**File:** `/home/user/hashbin.org/src/durable-objects/user-profile.js`

**Location:** `listApiKeys()` method (lines 323-352)

**Changes:**
```javascript
async listApiKeys() {
  const profile = await this.state.storage.get('profile');

  if (!profile) {
    return new Response(
      JSON.stringify({
        error: 'Profile not found'
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Return keys without hashes
  const keys = profile.api_keys.map(key => ({
    key_id: key.key_id,
    name: key.name,
    created_at: key.created_at,
    expires_at: key.expires_at,
    last_used_at: key.last_used_at,
    usage_count: key.usage_count || 0,  // ADD THIS LINE (with backward compatibility)
    revoked: !!key.revoked_at
  }));

  return new Response(JSON.stringify(keys), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
```

#### Step 4: Handle backward compatibility

**Considerations:**
- Existing API keys in production won't have `usage_count` field
- Need to initialize to 0 when missing
- No migration needed - handled in code

**Implementation:**
- Use `|| 0` default when returning in list
- Use `typeof apiKey.usage_count !== 'number'` check in updateLastUsed
- Initialize to 0 when creating new keys

### Testing for Feature 1

#### Unit Tests

**File:** Create/update tests in appropriate test file

**Tests to add:**

1. ✅ New API keys have usage_count of 0
2. ✅ usage_count increments on each API request
3. ✅ usage_count returned in GET /api/auth/apikeys response
4. ✅ Backward compatibility: existing keys without usage_count return 0
5. ✅ Backward compatibility: first use of old key initializes usage_count to 1
6. ✅ usage_count increments correctly across multiple requests
7. ✅ usage_count persists after server restart (storage)
8. ✅ Concurrent requests increment usage_count correctly

#### Integration Tests

9. ✅ Create key → use key → verify count is 1
10. ✅ Create key → use 10 times → verify count is 10
11. ✅ Create key → revoke → verify count still accessible (read-only)

### Verification

**Manual testing:**
```bash
# Create a new API key
curl -X POST http://localhost:8787/api/auth/apikeys \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Key","environment":"test","expiresAt":"2027-01-16T00:00:00Z"}'

# Use the key (save key from response)
curl -X GET http://localhost:8787/api/balance \
  -H "Authorization: ApiKey hb_test_..."

# List keys and verify usage_count is 1
curl -X GET http://localhost:8787/api/auth/apikeys \
  -H "Authorization: Bearer $CLERK_JWT"

# Expected response includes:
# {
#   "key_id": "...",
#   "name": "Test Key",
#   "usage_count": 1,  // <-- Should be 1
#   ...
# }
```

---

## Feature 2: PATCH Endpoint for Name Updates

### Objective
Implement an endpoint to update API key names with fresh authentication required.

### Current State
- No PATCH endpoint exists
- Only POST (create), GET (list), DELETE (revoke), POST /reveal endpoints exist
- Fresh auth is already implemented for reveal endpoint
- Source: `/home/user/hashbin.org/src/api/auth.js:495-621`

### Implementation Steps

#### Step 1: Add route handler in main router

**File:** `/home/user/hashbin.org/src/index.js`

**Location:** After line 215 (after the reveal endpoint route)

**Add:**
```javascript
// Update API key name
if (url.pathname.startsWith('/api/auth/apikeys/') && !url.pathname.endsWith('/reveal') && request.method === 'PATCH') {
  const keyId = url.pathname.split('/')[4];
  return handleUpdateApiKey(request, env, keyId);
}
```

**Note:** Make sure this comes BEFORE the reveal route to avoid conflicts

#### Step 2: Implement handler function

**File:** `/home/user/hashbin.org/src/api/auth.js`

**Location:** After `handleRevealApiKey()` function (after line 621)

**Add:**
```javascript
/**
 * Update API key name
 * Requires fresh Clerk session (authenticated within last 5 minutes)
 * @param {Request} request
 * @param {Object} env
 * @param {string} keyId
 * @returns {Response}
 */
export async function handleUpdateApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);

  // Require Clerk session (API keys cannot update themselves)
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'API keys cannot update other API keys. Use Clerk session.'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Verify session is fresh (authenticated within last 5 minutes)
  try {
    if (!env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerkClient = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY
    });

    const sessionId = authResult.user.sessionId;
    const session = await clerkClient.sessions.getSession(sessionId);

    // Check if session is fresh (5 minutes)
    if (!isSessionFresh(session, 5)) {
      return new Response(
        JSON.stringify({
          error: 'FRESH_AUTH_REQUIRED',
          message: 'This operation requires a fresh authentication session (authenticated within the last 5 minutes). Please re-authenticate.'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Session verification failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate name
  const { name } = body;

  if (!name || typeof name !== 'string') {
    return new Response(
      JSON.stringify({
        error: 'Invalid name',
        message: 'Name is required and must be a string'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate name length (1-100 characters)
  if (name.length < 1 || name.length > 100) {
    return new Response(
      JSON.stringify({
        error: 'Invalid name length',
        message: 'Name must be between 1 and 100 characters'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Get user profile DO
  const userId = authResult.user.userId;
  const userProfileId = env.USER_PROFILE.idFromName(userId);
  const userProfileStub = env.USER_PROFILE.get(userProfileId);

  // Update API key name
  const updateResponse = await userProfileStub.fetch(
    new Request(`http://internal/apikeys/${keyId}/update`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ name })
    })
  );

  // Return response from DO
  return updateResponse;
}
```

#### Step 3: Add update method to UserProfile Durable Object

**File:** `/home/user/hashbin.org/src/durable-objects/user-profile.js`

**Location:** In the `fetch()` method routing section (after line 75)

**Add route:**
```javascript
if (url.pathname.startsWith('/apikeys/') && url.pathname.endsWith('/update') && method === 'PATCH') {
  const keyId = url.pathname.split('/')[2];
  return await this.updateApiKeyName(keyId, request);
}
```

**Location:** After `updateLastUsed()` method (after line 670)

**Add method:**
```javascript
/**
 * Update API key name
 * @param {string} keyId
 * @param {Request} request
 * @returns {Response}
 */
async updateApiKeyName(keyId, request) {
  const profile = await this.state.storage.get('profile');

  if (!profile) {
    return new Response(
      JSON.stringify({
        error: 'Profile not found'
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Find the API key
  const apiKey = profile.api_keys.find(key => key.key_id === keyId);

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'API key not found'
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Check if key is revoked
  if (apiKey.revoked_at) {
    return new Response(
      JSON.stringify({
        error: 'KEY_REVOKED',
        message: 'Cannot update a revoked API key'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Check if key is expired
  const now = new Date();
  const expiresAt = new Date(apiKey.expires_at);
  if (expiresAt < now) {
    return new Response(
      JSON.stringify({
        error: 'KEY_EXPIRED',
        message: 'Cannot update an expired API key'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  const { name } = body;

  // Update the name
  apiKey.name = name;
  profile.updated_at = new Date().toISOString();

  await this.state.storage.put('profile', profile);

  // Return updated key metadata (without sensitive fields)
  return new Response(
    JSON.stringify({
      key_id: apiKey.key_id,
      name: apiKey.name,
      created_at: apiKey.created_at,
      expires_at: apiKey.expires_at,
      last_used_at: apiKey.last_used_at,
      usage_count: apiKey.usage_count || 0,
      revoked: !!apiKey.revoked_at
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}
```

#### Step 4: Import required functions in auth.js

**File:** `/home/user/hashbin.org/src/api/auth.js`

**Location:** Top of file, in import section

**Verify these imports exist:**
```javascript
import { createClerkClient } from '@clerk/backend';
import { isSessionFresh } from '../auth/utils.js';
```

If not, add them.

### Testing for Feature 2

#### Unit Tests

**Tests to add:**

1. ✅ PATCH /api/auth/apikeys/:id updates name successfully
2. ✅ Requires Clerk session (not API key auth)
3. ✅ Requires fresh session (<5 minutes)
4. ✅ Returns 403 FRESH_AUTH_REQUIRED for stale session
5. ✅ Validates name is required
6. ✅ Validates name is string
7. ✅ Validates name length (1-100 chars)
8. ✅ Returns 400 for empty name
9. ✅ Returns 400 for name >100 chars
10. ✅ Returns 404 for non-existent key
11. ✅ Returns 400 for revoked key
12. ✅ Returns 400 for expired key
13. ✅ Returns updated key metadata in response
14. ✅ Does not return sensitive fields (key_hash, key_encrypted)
15. ✅ Updates usage_count is preserved after name update
16. ✅ Updates last_used_at is preserved after name update
17. ✅ Updates revoked_at is preserved after name update
18. ✅ Profile updated_at timestamp is updated

#### Integration Tests

19. ✅ Create key → update name → list keys → verify new name
20. ✅ Create key → update name → detail view → verify new name
21. ✅ Create key → update name twice → verify latest name
22. ✅ Create key → use key → update name → usage_count preserved
23. ✅ Create key → update name → revoke → name still updated
24. ✅ Create multiple keys → update one → others unchanged
25. ✅ Fresh auth → update name → wait 6 mins → update fails

#### Security Tests

26. ✅ API key cannot update itself (requires Clerk session)
27. ✅ User can only update their own keys
28. ✅ Fresh auth is enforced (5-minute threshold)
29. ✅ XSS protection: name with <script> tags sanitized
30. ✅ SQL injection protection: name with SQL not executed
31. ✅ Name with special characters handled correctly
32. ✅ Name with emoji handled correctly
33. ✅ Name with Unicode characters handled correctly

### Verification

**Manual testing:**
```bash
# Get a fresh Clerk JWT (must be <5 minutes old)
# Login to get fresh token...

# Create a test key
KEY_RESPONSE=$(curl -X POST http://localhost:8787/api/auth/apikeys \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Original Name","environment":"test","expiresAt":"2027-01-16T00:00:00Z"}')

KEY_ID=$(echo $KEY_RESPONSE | jq -r '.key_id')

# Update the name
curl -X PATCH http://localhost:8787/api/auth/apikeys/$KEY_ID \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'

# Expected response:
# {
#   "key_id": "...",
#   "name": "Updated Name",  // <-- Changed
#   "created_at": "...",
#   "expires_at": "...",
#   "last_used_at": null,
#   "usage_count": 0,
#   "revoked": false
# }

# List keys and verify
curl -X GET http://localhost:8787/api/auth/apikeys \
  -H "Authorization: Bearer $CLERK_JWT"

# Verify name is "Updated Name"
```

---

## Error Handling

### Feature 1: Usage Count

**Potential Errors:**
1. `usage_count` field missing on old keys → Handle with `|| 0` default
2. Concurrent increments → Durable Objects handle atomicity
3. Storage failure → Return 500, don't increment

**Error Responses:**
- No new error codes needed
- Existing error handling sufficient

### Feature 2: PATCH Endpoint

**Error Codes:**
- `403 FRESH_AUTH_REQUIRED` - Session >5 minutes old
- `403 Invalid authentication method` - API key used instead of Clerk
- `400 Invalid request body` - Malformed JSON
- `400 Invalid name` - Name missing or not string
- `400 Invalid name length` - Name <1 or >100 chars
- `400 KEY_REVOKED` - Cannot update revoked key
- `400 KEY_EXPIRED` - Cannot update expired key
- `404 Profile not found` - User profile doesn't exist
- `404 API key not found` - Key ID doesn't exist
- `500 Session verification failed` - Clerk API error

---

## Deployment Plan

### Step 1: Local Development & Testing
1. Implement Feature 1 (usage count)
2. Test locally with `wrangler dev`
3. Run all unit tests
4. Implement Feature 2 (PATCH endpoint)
5. Test locally with `wrangler dev`
6. Run all unit tests
7. Run integration tests
8. Manual verification with curl

### Step 2: Code Review
1. Create feature branch: `feature/api-key-usage-and-update`
2. Commit changes with clear messages
3. Push to GitHub
4. Create pull request
5. Request code review
6. Address feedback

### Step 3: Deploy to Production
1. Merge to main after approval
2. Deploy via GitHub Actions
3. Verify deployment successful
4. Run smoke tests on production
5. Monitor logs for errors

### Step 4: Verify in Production
1. Create test API key
2. Use key and verify usage_count increments
3. Update key name and verify change persists
4. List keys and verify both fields present
5. Monitor for 24 hours

---

## Rollback Plan

If issues are discovered:

1. **Immediate:** Revert deployment via GitHub Actions
2. **Usage count issues:**
   - Not critical - can be fixed in patch
   - Defaults to 0 if missing (safe)
3. **PATCH endpoint issues:**
   - Disable route in index.js
   - UI will show error when trying to edit
   - Users can still revoke and recreate keys

---

## Success Criteria

Feature 1 is complete when:
- ✅ New keys have `usage_count: 0`
- ✅ Count increments on each API request
- ✅ Count returned in GET /api/auth/apikeys
- ✅ Old keys without count return 0 (backward compatible)
- ✅ All unit tests pass
- ✅ Manual verification successful

Feature 2 is complete when:
- ✅ PATCH endpoint implemented and routed
- ✅ Fresh auth required (5-minute threshold)
- ✅ Name validation works (1-100 chars)
- ✅ Returns updated key metadata
- ✅ Revoked/expired keys cannot be updated
- ✅ All unit tests pass
- ✅ All security tests pass
- ✅ Manual verification successful

Both features are production-ready when:
- ✅ Code review approved
- ✅ Deployed to production
- ✅ Smoke tests pass
- ✅ Monitored for 24 hours without errors
- ✅ UI team notified and can begin implementation

---

## Files to Modify

### Changes Required

1. **`/home/user/hashbin.org/src/index.js`**
   - Add PATCH route for API key updates

2. **`/home/user/hashbin.org/src/api/auth.js`**
   - Add `handleUpdateApiKey()` function
   - Import `isSessionFresh` if not already imported

3. **`/home/user/hashbin.org/src/durable-objects/user-profile.js`**
   - Add `usage_count: 0` to new keys in `createApiKey()`
   - Increment `usage_count` in `updateLastUsed()`
   - Return `usage_count` in `listApiKeys()`
   - Add route for `/apikeys/:id/update` in `fetch()`
   - Add `updateApiKeyName()` method

### Files to Create (Tests)

- Create test file for usage count tracking
- Create test file for PATCH endpoint
- Add integration tests

---

## Estimated Effort Breakdown

### Feature 1: Usage Count (4-6 hours)
- Code changes: 1-2 hours
- Unit tests: 2-3 hours
- Manual testing: 1 hour

### Feature 2: PATCH Endpoint (4-6 hours)
- Code changes: 2-3 hours
- Unit tests: 1-2 hours
- Security tests: 1-2 hours
- Manual testing: 1 hour

### Code Review & Deployment (2-4 hours)
- Code review: 1-2 hours
- Deployment: 30 minutes
- Production verification: 1-2 hours

### Total: 10-16 hours (1.5-2.5 days)

---

## Notes

- Both features are additive (no breaking changes)
- Backward compatible with existing data
- No database migration needed
- Can be implemented and tested independently
- Can be deployed together in single release
- Low risk of production issues
- Easy rollback if needed
