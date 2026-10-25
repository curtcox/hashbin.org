# Cloudflare operator work: cost safety and funded downloads

Status: **not verified in the production account**. These tasks require Cloudflare
or repository-secret administration and live evidence; changing repository files
does not complete them. Covers [cost_safety.md](cost_safety.md) and
[funded_downloads.md](funded_downloads.md). Implementation/runbook:
[docs/cost-safety.md](../docs/cost-safety.md).

Record completion date, deployment/rule IDs and non-secret evidence alongside
each checkbox. Keep credentials out of this file and out of command output.

## Access preference: API and CLI first

Use authenticated Cloudflare APIs, the repo-pinned Wrangler (`npx wrangler`),
and GitHub CLI/Actions before browser configuration. Start by reading the current
account, zone and resource IDs; update existing resources and read them back to
verify the result. Keep GitHub as the configuration source of truth (Decision 21),
using `gh secret set` via stdin and the existing deployment workflow for secrets.
Use the dashboard only for a specific task without a supported API or without
the required account entitlement. Record that limitation and the smallest manual
step; missing API credentials are an access prerequisite, not a reason to move
all configuration into the browser. Actual sign-in/cookie browser acceptance
remains necessary even when setup is automated.

| Work | Preferred access and verification |
| --- | --- |
| CF1 analytics/token | Cloudflare token API to provision scoped access when an authorized bootstrap credential exists; GraphQL and Analytics Engine SQL for dataset/access checks. Initial account login or token bootstrap is a browser fallback only when necessary. |
| CF2 secrets/bindings | `gh secret set`, GitHub Actions and Wrangler; inspect deployed binding/configuration metadata through the Workers API. Verify secret names, never values. |
| CF3 deploy/domains/cron | Existing deploy workflow via `gh workflow run deploy.yml --ref main`, then `gh run view`; Wrangler/Workers API for deployment revision, domains/routes and schedules; HTTP health checks. |
| CF4 alert destination | GitHub secret/CI deployment and `POST /api/admin/alerts/test`; verify delivery through the destination's API where available. |
| CF5 WAF | Rulesets API: read `/zones/{zone_id}/rulesets/phases/http_ratelimit/entrypoint`, update the existing rule by ID, and read back its expression/rate settings. Create only if absent; preserve unrelated rules. API rejection is evidence of unsupported configuration, not a reason to bypass plan limits. |
| CF6 notifications | Read `/accounts/{account_id}/alerting/v3/available_alerts` and `/destinations/eligible`; list/create/update policies under `/alerting/v3/policies` using the returned alert types and account-supported filters. Read back policy IDs/recipients and verify delivery. |
| CF7–CF9 acceptance | Scripted HTTP requests, admin APIs, GraphQL/SQL and the export tool; real browser checks only for the cookie/login journey. Use regional HTTP probes for cache/takedown evidence. |
| CF10 invoices/evidence | Billing/usage APIs and retained exports where available. Download an invoice in the browser only if its required fields/artifact are unavailable through the account's documented API. |

API references checked 2026-10-25:
[token creation](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/create/),
[zone rate-rule API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/),
[notification discovery and policies](https://developers.cloudflare.com/api/resources/alerting/),
[Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).

## Setup and deployment

- [ ] **CF1 — Analytics access.** Create the read-only account analytics token and
  verify the required GraphQL datasets/fields and Analytics Engine SQL access.
  Verify complete current/previous-month windows, not just today's sample.
  Configure `CLOUDFLARE_ANALYTICS_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the main
  Worker (and matching GitHub secrets if CI manages them).
- [ ] **CF2 — Shared credentials.** Configure the same `DOWNLOAD_TOKEN_SECRET` and
  `OAUTH_SIGNING_KEY` on both Workers. Verify all DO, R2 and Analytics Engine
  bindings against their actual deployed namespaces/dataset. A required missing
  safety binding deliberately returns 503 outside local mode.
- [ ] **CF3 — Deploy and confirm.** Deploy the main Worker before the content
  Worker. Record the successful deployment revision, confirm both custom domains
  and the hourly cron, and verify the deployed revision against GitHub. A pushed
  commit or dry-run bundle alone is not deployment evidence.
- [ ] **CF4 — Alert destination.** Configure `ALERT_WEBHOOK_URL`; send the admin
  test alert and confirm delivery to the intended operator. Confirm a real hourly
  cost report/alert arrives, including behavior when an analytics dataset is
  unavailable. The webhook destination may require separate service administration.

## Upstream protection

- [ ] **CF5 — WAF rule.** Validate/save the actual zone rate rule, counting by IP,
  including cached requests, with the repository policy of 5 requests/10 seconds
  and exemptions for `/a/` and `/s/`. Candidate expression:

  ```text
  not starts_with(http.request.uri.path, "/a/") and
  not starts_with(http.request.uri.path, "/s/")
  ```

  Verify normalization, custom-domain matching and the `www` redirect. Confirm
  the actual plan accepts the fields/operators; if it does not, record the
  rejection before choosing a different hostname or a paid plan. Those choices
  can require follow-up repo configuration and owner approval of new costs.
- [ ] **CF6 — Billing notifications.** Check account eligibility and available
  products, then configure notifications near the applicable included allowances
  for Workers requests/CPU, R2 operations/storage and Durable Objects. Record the
  thresholds and recipients. Cloudflare's published notification catalog currently
  lists Usage Based Billing for Professional-or-higher, pay-as-you-go accounts;
  do not assume a Free zone can enable it. If unavailable, record the limitation
  and the owner's monitoring/plan decision; do not silently increase fixed costs.
  [Official notification catalog](https://developers.cloudflare.com/notifications/notification-available/).
  [Rate-limiting availability](https://developers.cloudflare.com/waf/rate-limiting-rules/).

## Live acceptance

Use designated test content and small opt-in budgets. Global brake/hard-stop
tests belong before launch or in an owner-approved maintenance window.

- [ ] **CF7 — Cache and availability.** Verify MISS then HIT from the same region,
  HEAD behavior and expiry. Verify takedowns within 60 seconds for stored paid
  content and within the documented one-hour inline/marker-only cache TTL, from
  more than one region. Local cache tests cannot establish regional behavior.
- [ ] **CF8 — Funded paths.** With file allowance exhausted and the normal brake
  enabled, send a burst exceeding both zone/Worker anonymous limits using direct
  credentials and signed links. Confirm no 429 on protected paths, correct
  `X-Budget`, bounded account/key/grant charges and transaction delivery. Verify
  cookie activation/replay, exhausted fallback, key/session revocation and
  availability responses. Confirm hard-stop 503s across plain, funded, signed,
  inline and cached content; restore the switches afterward.
- [ ] **CF9 — Monitor and history.** Verify costs, revenue, projection, stale-data
  warnings, sampled file/payer attribution, margin alerts and automatic/manual
  brakes. Verify completed-month reports and the actual analytics retention
  required for catch-up. Check that a revenue outage exposes unknown revenue
  and alerts while cost projection/brake checks continue. Export reports before
  93-day retention expires with `npm run cost-safety:report`; retain financial
  exports privately using the runbook, not as committed evidence.
- [ ] **CF10 — Production evidence.** After one month, provide the Cloudflare
  invoice and retained observations for reconciliation and operation-count
  calibration. After two months, provide per-file traffic/dispute observations
  before fitting distributions or implementing the planned simulation.

The repo's prepaid accounting bounds accepted stored downloads. Public refusals,
free inline traffic and other uncovered costs still prevent an absolute spending
guarantee; these operator protections and observed invoices remain necessary.
