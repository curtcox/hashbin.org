# Stripe operator work: cost safety and funded downloads

Status: **not verified in the production account**. Covers
[cost_safety.md](cost_safety.md) and [funded_downloads.md](funded_downloads.md).
These tasks require Stripe account access, real delivery evidence or financial
observations; repository edits alone do not complete them.

Record completion dates, non-secret event/payment IDs and evidence. Never store
API keys, signing secrets, card details or customer personal data here.

## Access preference: API and CLI first

Use the Stripe API/SDK and Stripe CLI for account inspection, configuration,
test events, replay and financial exports. Read existing objects first, preserve
their IDs, make the intended change, and retrieve the object to verify it. Use
idempotency keys for supported creation/payment requests. Check the account and
test/live mode explicitly. Keep credentials in GitHub secrets, deployed by CI;
send secrets via stdin rather than command arguments or committed output.

Browser configuration is a fallback for a specific setting without a documented
API or the needed entitlement. Record the setting, access limitation and manual
evidence. A hosted Checkout payment/customer authentication flow still requires
browser acceptance; that does not make the setup dashboard-first.

| Work | Preferred access and explicit fallback |
| --- | --- |
| ST1 disputes | Read disputes/events with the API and verify the configured dispute webhook and operator alert delivery. For the operator's Stripe email preference, check for a supported account API; use the Dashboard for that preference only if none is available. Webhook coverage alone does not complete the email checkbox. |
| ST2 Radar | Inspect available API resources and payment risk outcomes first. Supported value-list/item APIs manage lists, not rule enablement. Stripe documents rule configuration in the Dashboard; use that fallback for built-in/custom rule settings unless a supported rule-management API is available to this account. Record plan/access and resulting rules. |
| ST3 webhook | Use `/v1/webhook_endpoints` to list/create/update/retrieve the endpoint for `https://hashbin.org/api/payments/webhook`. Match the handler's snapshot payload and events (`checkout.session.completed`, `checkout.session.expired`, `charge.dispute.created`); preserve its compatible API version. Use `stripe events resend <event_id> --webhook-endpoint=<endpoint_id>` for controlled replay and verify the app ledger/logs. Store a newly returned signing secret directly in the secret store. |
| ST4 checkout | HashBin's deposit API creates the Checkout Session; retrieve its session/payment/refund objects with Stripe API/SDK to verify amounts, currency, mode and metadata. Complete the hosted payment journey in a browser with the designated test account. |
| ST5 evidence | Paginate `/v1/balance_transactions`, payouts, refunds and disputes for matching UTC periods; retain fee/net/currency fields privately. Use reports APIs for available reconciliations. A Dashboard export is a fallback only for a required artifact unavailable through supported APIs. |

Do not replace the existing webhook with thin events or upgrade its version as
part of configuration: those require matching handler changes and testing.
Local `stripe listen` signing secrets belong to that listener and do not replace
the deployed endpoint's signing secret.

API references checked 2026-10-25:
[webhook endpoint API](https://docs.stripe.com/api/webhook_endpoints/create),
[delivery and CLI replay](https://docs.stripe.com/webhooks),
[balance transaction export](https://docs.stripe.com/api/balance_transactions/list),
[Radar value lists](https://docs.stripe.com/api/radar/value_lists).

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
