# User Balance Creation with Zero Dollars

## Overview

When a new user logs in for the first time through Clerk authentication, the system automatically creates a user profile with an account balance of **$0.00** (0 cents). This ensures that all users have a balance they can view immediately upon account creation.

## Implementation Details

### 1. Profile Creation Flow

The user profile creation happens automatically during the first login:

```
User logs in with Clerk
    ↓
Clerk JWT validated by middleware
    ↓
Middleware detects profile doesn't exist (404 from UserProfile DO)
    ↓
Middleware returns profileExists: false
    ↓
handleSessionInfo checks profileExists === false
    ↓
Creates profile with balance_cents: 0
    ↓
User can immediately view their $0.00 balance
```

### 2. Code Components

#### UserProfile Durable Object (`src/durable-objects/user-profile.js`)

The `createProfile()` method initializes all balance fields to 0:

```javascript
const profile = {
  user_id: data.user_id,
  providers: data.providers || [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  api_keys: [],
  uploads: [],
  balance_cents: 0,              // Initial balance: $0.00
  total_deposited_cents: 0,      // No deposits yet
  total_spent_cents: 0           // No spending yet
};
```

#### Authentication Middleware (`src/auth/middleware.js`)

The middleware detects when a user profile doesn't exist:

```javascript
if (!response.ok) {
  if (response.status === 404) {
    // User profile doesn't exist yet, create it
    // This happens on first login after Clerk webhook
    return {
      authenticated: true,
      user: {
        userId,
        sessionId: validation.sessionId,
        authMethod: 'clerk',
        profileExists: false  // Signal to create profile
      },
      error: null
    };
  }
}
```

#### Session Info Handler (`src/api/auth.js`)

The `handleSessionInfo` endpoint creates the profile on first login:

```javascript
// If profile doesn't exist yet, create it
if (user.authMethod === 'clerk' && user.profileExists === false) {
  const userProfileId = env.USER_PROFILES.idFromName(user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: user.userId,
        providers: []
      })
    })
  );
}
```

### 3. Balance Retrieval

Users can retrieve their balance via the `/api/balance` endpoint:

**Request:**
```http
GET /api/balance
Authorization: Bearer <clerk-jwt>
```

**Response:**
```json
{
  "balance_cents": 0,
  "total_deposited_cents": 0,
  "total_spent_cents": 0
}
```

The `getBalance()` method handles missing balance fields gracefully:

```javascript
return new Response(
  JSON.stringify({
    balance_cents: profile.balance_cents || 0,
    total_deposited_cents: profile.total_deposited_cents || 0,
    total_spent_cents: profile.total_spent_cents || 0
  }),
  {
    status: 200,
    headers: { 'content-type': 'application/json' }
  }
);
```

## Testing

### Unit Tests

The `scripts/test-user-balance.sh` script verifies:

1. **Profile Creation**: New profiles have `balance_cents: 0`
2. **Balance Defaults**: Missing balances default to 0
3. **Response Structure**: Balance response includes all required fields
4. **API Authentication**: Balance endpoint requires authentication
5. **Complete Initialization**: All balance fields initialized to 0
6. **Auth Flow**: Session handler creates profiles for new users
7. **Profile Detection**: Middleware detects missing profiles

### Running Tests

```bash
# Run balance tests only
npm run test:balance

# Run all tests
npm test
```

### Expected Test Output

```
==========================================
User Balance Creation Tests
==========================================

✅ PASS: UserProfile.createProfile sets balance_cents to 0
✅ PASS: getBalance defaults to 0 if balance_cents is missing
✅ PASS: getBalance returns all required fields
✅ PASS: Balance API handler exists in codebase
✅ PASS: createProfile initializes all balance fields to 0
✅ PASS: handleSessionInfo creates profile for new users
✅ PASS: Middleware detects missing profiles

Test Summary: 7/7 tests passed ✅
```

## User Experience

### First Login Flow

1. User signs in with Clerk (GitHub, Google, etc.)
2. System validates authentication
3. System creates profile with $0.00 balance
4. User is redirected to dashboard
5. User can immediately see their balance of $0.00

### Balance Display

The balance is displayed in a user-friendly format:

- **API**: 0 cents (integer)
- **UI**: $0.00 (formatted with dollar sign and decimal places)

## Security Considerations

1. **Authentication Required**: Balance endpoint requires valid Clerk JWT or API key
2. **User Isolation**: Each user can only view their own balance
3. **Atomic Creation**: Profile creation is atomic within Durable Object
4. **No Negative Balances**: Initial balance is always 0, never negative

## Future Enhancements

- [ ] Add balance change notifications
- [ ] Implement balance audit logging
- [ ] Add transaction history for balance changes
- [ ] Support multiple currencies
- [ ] Add low balance warnings

## Related Files

- `src/durable-objects/user-profile.js` - Profile and balance management
- `src/auth/middleware.js` - Authentication and profile detection
- `src/api/auth.js` - Session management and profile creation
- `src/api/balance.js` - Balance retrieval endpoints
- `scripts/test-user-balance.sh` - Unit tests
- `docs/user-balance-creation.md` - This documentation

## References

- [Clerk Authentication](https://clerk.com/docs)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [HashBin.org User Profile Schema](../src/durable-objects/user-profile.js)
