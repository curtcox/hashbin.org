# Running HashBin.org Fully Local

## Overview

This plan describes how to run a local-only version of HashBin.org that works without any external services (Clerk, Stripe, or Cloudflare production infrastructure).

## Current Architecture

The application currently depends on:

| Dependency | Purpose | Local Alternative |
|------------|---------|-------------------|
| Cloudflare Workers | Serverless runtime | Wrangler local dev mode |
| Cloudflare Durable Objects | State storage (SQLite) | Wrangler local emulation |
| Cloudflare R2 | Object storage | Wrangler local emulation |
| Clerk | OAuth authentication | Mock authentication system |
| Stripe | Payment processing | Mock payment system |

## Goals

After implementation, a user should be able to:

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev:local` (or similar)
4. Access the app at `http://localhost:8787`
5. Upload, download, and manage content without any external accounts or API keys
6. Test all features in isolation

---

## Implementation Plan

### Phase 1: Local Development Configuration

#### 1.1 Create Local Environment Configuration

Create a new configuration file `wrangler.local.toml` that:
- Sets `ENVIRONMENT = "local"`
- Disables routes to production domains
- Uses local R2 bucket emulation
- Enables development mode features

#### 1.2 Add Local Development Script

Add to `package.json`:
```json
{
  "scripts": {
    "dev:local": "wrangler dev --config wrangler.local.toml --local"
  }
}
```

---

### Phase 2: Mock Authentication System

#### 2.1 Backend: Create Local Auth Bypass

Create `src/auth/local-auth.js`:
- Detect when running in local mode via `env.ENVIRONMENT === 'local'`
- Skip Clerk JWT verification
- Accept a simple local auth header format: `Authorization: LocalDev <user_id>`
- Auto-create user profiles on first request with $10 starting balance (hardcoded)
- Store API keys as plain text (no encryption in local mode)

**Local Auth Flow:**
```
Authorization: LocalDev user_123
```

When this header is present in local mode:
1. Extract user ID from header
2. Create UserProfile if it doesn't exist
3. Return authenticated context

#### 2.2 Backend: Modify Auth Middleware

Update `src/auth/middleware.js`:
- Check for local mode before attempting Clerk validation
- Route to local auth handler when `ENVIRONMENT === 'local'`

#### 2.3 Frontend: Create Local Auth Module

Create `frontend/js/local-auth.js`:
- Provide same interface as `auth.js` (getAuthState, signIn, signOut, etc.)
- Reuse the same session storage mechanism as production (no reimplementation)
- Show simple login prompt (just enter a username)
- No external script dependencies (no Clerk SDK)

#### 2.4 Frontend: Auth Module Switcher

Create `frontend/js/auth-loader.js`:
- Detect if running locally (check `/api/config` response)
- Dynamically import either `auth.js` (Clerk) or `local-auth.js`
- Export unified interface

---

### Phase 3: Mock Payment System

#### 3.1 Backend: Create Local Payment Handler

Create `src/api/local-payments.js`:
- Mock deposit creation that immediately credits balance
- Skip Stripe checkout session creation
- Skip webhook verification

#### 3.2 Backend: Modify Payment Routes

Update `src/api/payments.js`:
- Check for local mode
- Route to mock handlers when `ENVIRONMENT === 'local'`
- Add a "dev deposit" endpoint that directly adds funds

#### 3.3 Frontend: Local Deposit Flow

Update deposit page to:
- Detect local mode
- Show simple "Add Funds" form instead of Stripe redirect
- Call `/api/balance/dev-deposit` endpoint

---

### Phase 4: API Config Endpoint Enhancement

#### 4.1 Update Config Endpoint

Modify `handleConfig()` in `src/index.js`:
- Return `isLocalMode: true` when `ENVIRONMENT === 'local'`
- Omit Clerk publishable key in local mode
- Add `authMode: 'local' | 'clerk'` field

---

### Phase 5: Local Setup Documentation

#### 5.1 Create Local Development Guide

Create `docs/local-development.md`:
- Prerequisites (Node.js 20+, npm)
- Quick start instructions
- How local auth works
- How local payments work
- Debugging tips

#### 5.2 Update README.md

Add "Local Development" section to main README.

---

## Test Plan

### Unit Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| LOCAL-001 | Server starts in local mode | `npm run dev:local` starts server on port 8787 |
| LOCAL-002 | Health endpoint returns local status | `/health` returns `environment: 'local'` |
| LOCAL-003 | Config endpoint indicates local mode | `/api/config` returns `isLocalMode: true` |

### Authentication Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| AUTH-LOCAL-001 | Local auth header creates user | `Authorization: LocalDev user_1` creates profile |
| AUTH-LOCAL-002 | Local auth header authenticates | Protected endpoints accept local auth |
| AUTH-LOCAL-003 | Invalid local auth is rejected | Missing user ID returns 401 |
| AUTH-LOCAL-004 | Clerk auth disabled in local mode | Clerk JWT tokens are ignored (not verified) |
| AUTH-LOCAL-005 | Frontend local login works | Simple login form stores session |
| AUTH-LOCAL-006 | Frontend local logout works | Logout clears localStorage session |
| AUTH-LOCAL-007 | Auth state persists across refreshes | Page refresh maintains logged-in state |
| AUTH-LOCAL-008 | Multiple users supported | Different user IDs have separate profiles |
| AUTH-LOCAL-009 | API key creation works locally | Can create/list/revoke API keys |
| AUTH-LOCAL-010 | API key auth works locally | `X-API-Key` header authenticates |

### Payment Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| PAY-LOCAL-001 | Dev deposit endpoint exists | `POST /api/balance/dev-deposit` returns 200 |
| PAY-LOCAL-002 | Dev deposit credits balance | Balance increases after dev deposit |
| PAY-LOCAL-003 | Dev deposit appears in history | Transaction shows in balance history |
| PAY-LOCAL-004 | Stripe endpoints disabled locally | `/api/balance/deposit` returns helpful error |
| PAY-LOCAL-005 | Frontend shows local deposit form | Deposit page shows direct amount input |
| PAY-LOCAL-006 | Negative deposit rejected | Cannot add negative amounts |
| PAY-LOCAL-007 | Zero deposit rejected | Cannot add zero amount |

### Content Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| CONTENT-LOCAL-001 | Content upload works | Upload returns CID |
| CONTENT-LOCAL-002 | Content download works | Download by CID returns content |
| CONTENT-LOCAL-003 | Content stored in local R2 | File persists across restarts |
| CONTENT-LOCAL-004 | Content metadata stored | Metadata retrievable via API |
| CONTENT-LOCAL-005 | Upload deducts balance | Balance decreases after upload |
| CONTENT-LOCAL-006 | Insufficient balance rejected | Upload fails without funds |
| CONTENT-LOCAL-007 | Content expiration works | Expired content not downloadable |
| CONTENT-LOCAL-008 | Content extension works | Retention can be extended |

### End-to-End Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| E2E-LOCAL-001 | Full local workflow | Login → Deposit → Upload → Download |
| E2E-LOCAL-002 | Multiple user isolation | User A cannot access User B's dashboard |
| E2E-LOCAL-003 | API key workflow | Create key → Use key → Revoke key |
| E2E-LOCAL-004 | Balance workflow | Deposit → Check balance → Upload → Check balance |
| E2E-LOCAL-005 | Protected pages require auth | Dashboard redirects without login |
| E2E-LOCAL-006 | Public pages accessible | Retrieve page works without login |

### Edge Case Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| EDGE-LOCAL-001 | Empty user ID rejected | `Authorization: LocalDev ` returns 401 |
| EDGE-LOCAL-002 | Whitespace user ID rejected | `Authorization: LocalDev   ` returns 401 |
| EDGE-LOCAL-003 | Special chars in user ID | `Authorization: LocalDev user@test` works |
| EDGE-LOCAL-004 | Very long user ID | 256+ char user ID is rejected |
| EDGE-LOCAL-005 | Server restart preserves data | Stop/start keeps Durable Object state |
| EDGE-LOCAL-006 | Concurrent requests handled | Multiple parallel requests succeed |
| EDGE-LOCAL-007 | Large file upload | 100MB+ file uploads successfully |
| EDGE-LOCAL-008 | Binary file handling | Non-text files preserve integrity |

### Regression Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| REG-LOCAL-001 | Existing tests pass locally | `npm test` passes with local server |
| REG-LOCAL-002 | Production mode unaffected | `npm run dev` still uses Clerk/Stripe |
| REG-LOCAL-003 | Deployment unaffected | `npm run deploy` works as before |

---

## Open Questions

1. **User ID Format**: What format should local user IDs follow?
   - ✅ **DECISION: Option A - Free-form string (e.g., "alice", "bob")**

2. **Session Persistence**: How should local sessions be stored?
   - ✅ **DECISION: Same as production - use the same code and mechanism**

3. **Balance Initialization**: Should new local users get starting balance?
   - ✅ **DECISION: Option B - Start with $10 (hardcoded, convenient for testing)**

4. **API Key Encryption**: How to handle `API_KEY_ENCRYPTION_KEY` locally?
   - ✅ **DECISION: Option C - Skip encryption in local mode (store as plain text)**

5. **Rate Limiting**: Should rate limiting be active in local mode?
   - ✅ **DECISION: Option C - Keep same limits (realistic testing)**

6. **Durable Object Persistence**: What about data between `npm run dev:local` sessions?
   - ✅ **DECISION: Option A - Persist in `.wrangler/state` (current behavior)**

7. **CORS Configuration**: Should local mode be more permissive?
   - ✅ **DECISION: Option B - Keep same CORS policy**

8. **Local Auth Header Name**: What header format for local auth?
   - ✅ **DECISION: Option A - `Authorization: LocalDev <user_id>`**
   - Rationale: Explicit about local development, reuses existing Authorization header, clearly distinguishable from production

9. **Frontend Detection Method**: How should frontend detect local mode?
   - ✅ **DECISION: Option A - Check `/api/config` response**
   - Rationale: Server-driven single source of truth, already planned in Phase 4, most reliable approach

10. **Multi-tab Behavior**: How should local auth work across browser tabs?
    - ✅ **DECISION: Same as production - use the same code and mechanism**

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `wrangler.local.toml` | Local development Wrangler config |
| `src/auth/local-auth.js` | Backend local auth implementation |
| `src/api/local-payments.js` | Backend mock payment handlers |
| `frontend/js/local-auth.js` | Frontend local auth module |
| `frontend/js/auth-loader.js` | Auth module dynamic loader |
| `docs/local-development.md` | Local development guide |
| `scripts/test-local-mode.sh` | Local mode test suite |

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add `dev:local` script |
| `src/index.js` | Update config endpoint |
| `src/auth/middleware.js` | Add local mode check |
| `src/api/payments.js` | Add dev deposit route |
| `frontend/deposit.html` | Support local deposit UI |
| `README.md` | Add local development section |

---

## Success Criteria

The implementation is complete when:

1. [ ] `npm run dev:local` starts the server without errors
2. [ ] All tests in the test plan pass
3. [ ] A new developer can follow the documentation to run locally
4. [ ] No external network calls are made in local mode
5. [ ] Production deployment is unaffected
6. [ ] Existing tests continue to pass

---

## Implementation Order

1. Phase 1: Local Development Configuration (foundation)
2. Phase 4: API Config Endpoint Enhancement (detection mechanism)
3. Phase 2: Mock Authentication System (enables testing)
4. Phase 3: Mock Payment System (enables full workflow)
5. Phase 5: Local Setup Documentation (final polish)

---

## Status

**All open questions resolved. Ready for implementation.**

- [ ] Phase 1: Local Development Configuration
- [ ] Phase 2: Mock Authentication System
- [ ] Phase 3: Mock Payment System
- [ ] Phase 4: API Config Endpoint Enhancement
- [ ] Phase 5: Local Setup Documentation
- [ ] All tests passing
- [ ] Documentation complete
