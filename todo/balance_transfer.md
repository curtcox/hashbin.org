# Peer-to-Peer Balance Transfer

## Status: TBD

This feature is deferred. Decision pending on whether to implement.

## Overview

Allow users to transfer funds from their HashBin balance to another user's balance.

## Open Questions

1. **Should this feature exist at all?**
   - What use cases justify peer-to-peer transfers?
   - Is this just adding complexity with limited value?

2. **Fraud implications**
   - Could this be used for money laundering?
   - How do we prevent stolen credit card → deposit → transfer → withdraw schemes?
   - Do we need KYC/AML compliance if we enable transfers?

3. **Reversibility**
   - What happens if the original deposit is disputed/charged back?
   - Should transfers be reversible?
   - How long should funds be "held" before transfer is allowed?

4. **Fees**
   - Should there be a transfer fee?
   - Flat fee or percentage?

5. **Limits**
   - Maximum transfer amount?
   - Daily/monthly transfer limits?
   - Minimum transfer amount?

6. **Identity verification**
   - How does the sender identify the recipient?
   - By email? By username? By user ID?
   - What if the recipient doesn't have an account?

7. **Notifications**
   - Email sender when transfer completes?
   - Email recipient when they receive funds?

## Potential Implementation

If we decide to proceed, the feature would include:

### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/balance/transfer` | POST | Yes | Transfer funds to another user |
| `/api/balance/transfers` | GET | Yes | Get transfer history |

### Request Format
```javascript
// POST /api/balance/transfer
{
  recipient_email: string,    // or recipient_id
  amount_cents: number,
  note: string | null,        // optional message
}
```

### Transaction Record
```javascript
{
  type: "transfer_out" | "transfer_in",
  counterparty_id: string,
  // ... standard transaction fields
}
```

### Security Considerations

- Rate limiting on transfers
- Cooling-off period after deposit before transfer allowed
- Email verification required for both parties
- Two-factor authentication for large transfers?

## Related Decisions

- See [payments.md](payments.md) Decision #25

## Decision Log

| Date | Decision |
|------|----------|
| TBD | Feature pending review |
