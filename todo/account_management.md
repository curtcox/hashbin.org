# Account Management Plan

## Overview

This document covers account management features for HashBin.org, including account linking, deletion, and handling of orphaned accounts. For core authentication and API key management, see [user_authorization.md](./user_authorization.md).

---

## Implementation Status

**Status:** Partially Complete

- [x] Multiple OAuth provider linking (via Clerk)
- [x] Self-service account deletion with 2FA
- [x] Soft delete with payment record retention
- [ ] Clerk webhooks for account events (requires deployed Clerk application)

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

1. **2FA Confirmation Required**: Account deletion requires 2FA verification
2. **Soft Delete**: Account marked as deleted (not immediately purged)
3. **Payment Records Retained**: Legal/financial compliance requires retention
4. **All Other Data Deleted**: API keys, upload history, profile data removed

### API Endpoint

```
DELETE /api/auth/account
  - Deletes user account (requires 2FA)
  - Requires: Clerk session + 2FA confirmation
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
| DEL-01 | Delete account without 2FA fails | Delete request, no 2FA | 403 Forbidden |
| DEL-02 | Delete account with 2FA succeeds | Delete request + 2FA | Account marked deleted |
| DEL-03 | Payment records retained after deletion | Query after deletion | Payment records exist |
| DEL-04 | API keys invalidated after deletion | Use key after deletion | 401 with `AUTH_USER_DELETED` |
| DEL-05 | Upload history deleted | Query after deletion | No upload records |
| DEL-06 | User profile soft-deleted | Check DO after deletion | `deleted_at` timestamp set |
| DEL-07 | Cannot re-register with deleted email | Same OAuth after delete | New account created (not restored) |

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
| SEC-11 | 2FA bypass on deletion | Skip 2FA step | 403 Forbidden |
| SEC-12 | Delete other user's account | Attempt with wrong user_id | 403/404 (no access) |

---

## Related Documents

- [User Authorization](./user_authorization.md) - Core authentication, API keys, rate limiting
- [Content Dispute Resolution](./content_dispute_resolution.md) - Contests, DMCA, escalation system

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-13 | Claude | Initial version (split from user_authorization.md) |
