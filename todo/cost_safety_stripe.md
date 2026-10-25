# Stripe operator work: cost safety and funded downloads

Status: **not verified in the production account**. Covers
[cost_safety.md](cost_safety.md) and [funded_downloads.md](funded_downloads.md).
These tasks require Stripe account access, real delivery evidence or financial
observations; repository edits alone do not complete them.

Record completion dates, non-secret event/payment IDs and evidence. Never store
API keys, signing secrets, card details or customer personal data here.

- [ ] **ST1 — Dispute notifications.** Enable dispute email notifications for the
  responsible operator and verify the recipient and escalation process. Stripe
  documents Dashboard, email, webhook and API dispute notifications, and debits
  the disputed amount plus a fee. Verify actual account fees rather than assuming
  the repository model covers every card/network/country.
  [Official dispute lifecycle](https://docs.stripe.com/disputes/how-disputes-work).
- [ ] **ST2 — Radar.** Inspect the account's enabled built-in fraud rules and risk
  settings; record changes or exceptions and verify the actual Radar plan. Do not
  assume custom-rule availability or enable an upgrade implicitly.
  [Official Radar rules](https://docs.stripe.com/radar/rules).
- [ ] **ST3 — Webhook delivery.** Verify the intended endpoint and signing secret,
  required checkout/dispute events, successful deliveries and retries. Exercise
  test-mode replay/idempotency before any owner-approved live payment. Verify
  donation refunds when outstanding retention reaches its cap. Confirm the
  deployment's test/live modes and credentials match the intended environment.
- [ ] **ST4 — Checkout/accounting acceptance.** Using a controlled account, verify
  the $1 credit minimum, corrected gross-up, $20 checkout cap for accounts under
  30 days old, exact credited balance and ledger entries. Local/mocked tests do
  not establish live processor fees, refunds or dispute delivery.
- [ ] **ST5 — Financial evidence.** Provide payout/fee/refund/dispute totals for
  the same UTC periods as the Cloudflare invoice. Use them to calibrate the
  assumed kept-revenue factor and dispute reserve after observations exist.

## Owner policy decisions, not Stripe dashboard configuration

The repo currently keeps the approved fee gross-up and prepaid caps. Whether to
absorb card fees/change deposit packs and what happens to prepaid retention on
shutdown still require owner/legal decisions (STATUS L20/S17). Record those
decisions before implementing a different customer price or new shutdown terms.
No such policy change is implied by these checklists.

Funded singleton leases can cost more than their minimum request charge. Changing
that price/lease policy also needs a product decision; account configuration does
not remove the documented limitation. Discounts for cache hits, offline signing
and budget emails remain optional follow-ups, not acceptance blockers.
