# Account Management Plan

## Overview

This document covers account management features for HashBin.org, including account linking, deletion, and handling of orphaned accounts. For core authentication and API key management, see [user_authorization.md](./user_authorization.md).

---

## Implementation Status

**Status:** ✅ COMPLETE - Core Account Management Features Implemented

- [x] Multiple OAuth provider linking (via Clerk)
- [x] Self-service account deletion with TOTP 2FA verification
- [x] Soft delete with payment record retention
- [x] Session freshness validation for sensitive operations
- [x] Graceful degradation for development environments
- [ ] Clerk webhooks for account events (requires deployed Clerk application - production setup)

**2FA Implementation:**
- ✅ TOTP verification integrated with Clerk Backend API
- ✅ Session freshness check (5-minute window for sensitive operations)
- ✅ Active session validation with 2FA factor verification
- ✅ Detailed error messages for different failure scenarios
- ✅ Development mode graceful degradation

---

## Account Linking

Users can link multiple OAuth providers (Google, Apple, Microsoft, GitHub) to a single HashBin account via Clerk.

### Behavior

| Scenario | Behavior |
|----------|----------|
| Link second OAuth provider | Both providers can be used to authenticate |
| OAuth provider account deleted | HashBin account retained if other providers linked |
| Last provider deleted | Account becomes orphaned (see Orphaned Accounts below) |
| Provider already linked to another user | Rejected with clear error message |

---

## Account Deletion

### Requirements

1. **2FA Confirmation Required**: Account deletion requires 2FA verification if enabled
2. **Soft Delete**: Account marked as deleted (not immediately purged)
3. **Payment Records Retained**: Legal/financial compliance requires retention
4. **All Other Data Deleted**: API keys, upload history, profile data removed

### 2FA Verification Flow

The account deletion endpoint implements comprehensive 2FA verification:

1. **Explicit Confirmation**: User must provide `confirmed: true` in request body
2. **TOTP Check**: System fetches user's Clerk profile to check if TOTP 2FA is enabled
3. **If 2FA is Enabled**:
   - System validates session is "fresh" (last active within 5 minutes)
   - System validates session has active 2FA verification status
   - User must provide TOTP token in request body
   - Returns detailed error messages if verification fails
4. **If 2FA is Not Enabled**:
   - Confirmation alone is sufficient for account deletion
5. **Graceful Degradation**:
   - If CLERK_SECRET_KEY is not configured (development mode), skips verification with warning
   - If Clerk API is unavailable, returns error to prevent unverified deletion

### API Endpoint

```
DELETE /api/auth/account
  - Deletes user account (requires confirmation and 2FA if enabled)
  - Requires: Clerk session (not API key)
  - Request body:
    {
      "confirmed": true,        // Required: explicit confirmation
      "totp_token": "123456"   // Optional: required if user has TOTP 2FA enabled
    }
  - 2FA Verification:
    - Checks if user has TOTP enabled via Clerk API
    - If enabled, validates session is fresh (< 5 minutes old)
    - If enabled, validates session has active 2FA verification
    - If disabled, confirmation alone is sufficient
  - Response codes:
    - 200: Account deleted successfully
    - 403: Missing confirmation, TOTP required, or stale session
    - 500: Unable to verify 2FA status
  - Retains: Payment records only
```

### Post-Deletion Behavior

| Resource | Behavior |
|----------|----------|
| API keys | Immediately invalidated (`AUTH_USER_DELETED`) |
| Upload history | Deleted |
| Payment records | Retained |
| User profile | Soft-deleted (`deleted_at` timestamp set) |
| Re-registration | Creates new account (not restored) |

---

## Orphaned Accounts

An account becomes "orphaned" when the user can no longer authenticate (e.g., their only linked OAuth provider is deleted).

### Handling

| Scenario | Behavior |
|----------|----------|
| Single provider deleted | Account becomes inaccessible |
| Content expiration | Follows standard retention policy |
| Existing API keys | Continue working until expiration |
| Same email re-registers | Creates fresh account (not restored) |

---

## Data Retention

| Data Type | Retention Period | Rationale |
|-----------|------------------|-----------|
| Revoked API keys | 5 years | Audit trail for security investigations |
| Payment records | Indefinite (post-deletion) | Legal/financial compliance |
| Deleted user profile | Soft-deleted (timestamp retained) | Reference for payment records |

---

## Decisions

### Account Operations

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multiple OAuth account linking | **Yes, supported** | Users can link Google, Apple, Microsoft, GitHub to single account via Clerk |
| OAuth provider account deleted | **Keep HashBin account** | User retains access via other linked providers or can re-link |
| 2FA requirement | **User self-deletion only** | Only action requiring extra verification is account deletion |
| Post-deletion retention | **Payment records only** | Legal/financial compliance; all other data deleted |
| Orphaned accounts | **Content expires normally** | If user can't log in, content follows standard retention/expiration |

---

## Test Plan

### Account Linking Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| LINK-01 | Link second OAuth provider | User with Google adds GitHub | Both providers in profile |
| LINK-02 | Link all four OAuth providers | Add Google, Apple, Microsoft, GitHub | All four providers linked |
| LINK-03 | Unlink provider with multiple linked | Remove one of several | Provider removed, others remain |
| LINK-04 | Cannot unlink last provider | Try to unlink only provider | 400 Bad Request (must have one) |
| LINK-05 | Login with any linked provider | User with Google+GitHub logs in via GitHub | Same user session |
| LINK-06 | Duplicate provider link rejected | Link Google twice | 400 Bad Request |
| LINK-07 | Provider already linked to other user | Link GitHub already on another account | 400 Bad Request with clear error |

### Account Deletion Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| DEL-01 | Delete account without confirmation fails | Delete request, no confirmed field | 403 Forbidden |
| DEL-02 | Delete account with 2FA disabled succeeds | Delete request + confirmed, no TOTP | Account marked deleted |
| DEL-03 | Delete account with 2FA enabled, no token | Delete request + confirmed, TOTP enabled, no token | 403 with TOTP required error |
| DEL-04 | Delete account with 2FA enabled, stale session | Delete request + confirmed + token, session > 5 min old | 403 with re-authentication required |
| DEL-05 | Delete account with 2FA enabled, valid token | Delete request + confirmed + token, fresh session | Account marked deleted |
| DEL-06 | Payment records retained after deletion | Query after deletion | Payment records exist |
| DEL-07 | API keys invalidated after deletion | Use key after deletion | 401 with `AUTH_USER_DELETED` |
| DEL-08 | Upload history deleted | Query after deletion | No upload records |
| DEL-09 | User profile soft-deleted | Check DO after deletion | `deleted_at` timestamp set |
| DEL-10 | Cannot re-register with deleted email | Same OAuth after delete | New account created (not restored) |
| DEL-11 | Delete with inactive session | Delete with inactive session status | 403 Forbidden |
| DEL-12 | Development mode without CLERK_SECRET_KEY | Delete in dev without secret | Proceeds with warning (graceful degradation) |

### Orphaned Account Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| ORPH-01 | Single provider deleted, no other linked | Google account deleted, only provider | Account becomes inaccessible |
| ORPH-02 | Orphaned user content expires normally | Content with standard retention | Content expires per retention policy |
| ORPH-03 | Orphaned user cannot create new sessions | Try to log in | No valid provider, cannot auth |
| ORPH-04 | Orphaned user API keys still work until expiry | Use existing API key | Key works until expiration |
| ORPH-05 | New OAuth login creates new account | Same email, new registration | Fresh account created |

### Related Integration Tests

| Test ID | Test Case | Steps | Expected Outcome |
|---------|-----------|-------|------------------|
| INT-06 | User deletion cascade | 1. Delete account with 2FA 2. Try API key 3. Check payment records | Key rejected, payments retained |
| INT-11 | Link multiple providers | 1. Login Google 2. Link GitHub 3. Logout 4. Login GitHub | Same user session |
| INT-12 | Provider account deleted, other works | 1. Link Google+GitHub 2. Delete Google account 3. Login GitHub | Access maintained via GitHub |

### Related Edge Case Tests

| Test ID | Test Case | Scenario | Expected Behavior |
|---------|-----------|----------|-------------------|
| EDGE-07 | Upload during user deletion | Upload while delete processing | Upload fails or succeeds atomically |
| EDGE-13 | Link provider during deletion | Link OAuth while delete in progress | One operation fails cleanly |

### Related Security Tests

| Test ID | Test Case | Attack Vector | Expected Protection |
|---------|-----------|---------------|---------------------|
| SEC-11 | 2FA bypass on deletion (no confirmation) | Skip confirmation field | 403 Forbidden |
| SEC-12 | Delete other user's account | Attempt with wrong user_id | 403/404 (no access) |
| SEC-13 | 2FA bypass with expired session | Old session token + TOTP | 403 with re-authentication required |
| SEC-14 | Replay TOTP token | Reuse previously valid token | Session freshness check prevents replay |

---

## Related Documents

- [User Authorization](./user_authorization.md) - Core authentication, API keys, rate limiting
- [Content Dispute Resolution](./content_dispute_resolution.md) - Contests, DMCA, escalation system

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-13 | Claude | Initial version (split from user_authorization.md) |
