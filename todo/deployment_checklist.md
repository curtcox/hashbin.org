# Production deployment checklist

Checks to run around every production deploy, and the one-time setup still open before
launch. Repository automation implemented 2026-10-28; production acceptance remains open below.

Production is the only environment, and every push to `main` deploys it, so push only when
the owner has asked for it. [`STATUS.md`](../STATUS.md) wins over this file. The details
live elsewhere:

| For | See |
|-----|-----|
| Every step CI runs, and the secrets it reads | [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) |
| Deploying and inspecting through `gh`, Wrangler and provider APIs | [`deployment_setup.md`](deployment_setup.md) |
| Setting up a new account and domain from scratch | [`docs/deployment.md`](../docs/deployment.md) |
| Open setup work for each provider | [Clerk](clerk_remaining.md) (CL), [Cloudflare](cost_safety_cloudflare.md) (CF), [Stripe](cost_safety_stripe.md) (ST) |
| Reading `/health` | [`docs/health.md`](../docs/health.md) |
| Brakes, hard stop and cost alerts | [`docs/cost-safety.md`](../docs/cost-safety.md) |
| Restoring data | [`docs/backup-and-restore.md`](../docs/backup-and-restore.md) |

## Implemented automation

`npm run verify:production` runs the credential-free post-deploy checks against all three
production origins. Set `EXPECTED_GIT_SHA` to the full deployed commit to require an exact
match; without it, scheduled checks compare the five HTML pages to the current health SHA.
The HTML checks use canonical paths (`/upload`, `/dashboard`, `/api-keys`, `/info`).
The command fails on degraded health, a non-production environment, missing or down health
components, mismatched page commits, content-origin failure, incorrect auth/webhook refusals,
a broken public price calculation, API 404 failure, or unsafe hosted-origin responses.
Requests have a 15-second timeout and refuse redirects. It never logs credentials.

CI runs the runtime dependency audit, unit/lint, hosted-sandbox, funded-download, local API
and browser suites before deployment. `scripts/check-deployment-secrets.mjs` rejects missing
required secrets and test-mode Clerk/Stripe keys before the first Cloudflare write. A failed
content Worker deploy now fails the workflow. Main/content verification runs after cache
purging; full verification runs after deploying the hosted origin and in the Smoke Test
workflow after successful deploys and every six hours. `--skip-run-origin` is reserved for
the intermediate CI step before that origin deploys.

Local evidence (2026-10-28): the runtime audit found a moderate `qs` advisory in Stripe's
transitive dependencies. The lockfile now resolves `qs` 6.17.1 and `npm audit --omit=dev`
reports zero vulnerabilities. Verification passed: 830 unit tests (including 43 new
verifier/preflight tests), 14 local API suites, 39 frontend browser tests, 16 hosted sandbox
checks, 2,500 funded requests within the one-cent cap, lint with zero errors, and Actionlint
for the three changed workflows. Playwright ran with the pinned Chromium/WebKit binaries
and Node 22. The credential-free verifier also passed against the existing production
sites; these changes have not been deployed. Owner acceptance below is still open.

The recurring checklist below remains a runbook. Automation does not complete the provider,
browser, backup, alert-delivery, financial or legal acceptance items under **Open launch
setup**. Record those results in their linked plans and STATUS rows; keep this plan open
until the owner work has evidence.

## What a deploy changes

| Worker | Config | Serves | Deployed by |
|--------|--------|--------|-------------|
| `hashbin-worker-prod` | `wrangler.toml` | `hashbin.org` and `www`: API, frontend, all Durable Objects, hourly cron | `deploy` job |
| `256t-content-prod` | `workers/256t-content/wrangler.toml` | `256t.us` downloads | `deploy` job, after the main Worker |
| `hashbin-run-prod` | `workers/run-origin/wrangler.toml` | `hashbin.app` hosted apps | `deploy-run-origin` job |

The content and run Workers bind Durable Objects that live in the main Worker, so the main
Worker deploys first. All three read the `hashbin-content-256t-prod` R2 bucket; the main
Worker also writes nightly snapshots to `hashbin-backups-prod`. CI creates both buckets if
they're missing.

## Before every deploy

- [ ] `npm run test:unit` passes and `npm run lint` reports 0 errors.
- [ ] Download, sandbox or SDK changes: `npm run test:funded:local` and
  `npm run test:hosted` pass. CI runs both, and a failure blocks the deploy.
- [ ] Page or API changes: `npm run test:e2e` and `npm run test:api` pass against
  `npm run dev:local`.
- [ ] A new Durable Object has its export, binding and migration
  ([AGENTS.md](../AGENTS.md#conventions)). Migrations can't be rolled back, and a
  `deleted_classes` migration destroys that class's data.
- [ ] A new secret is set in GitHub, written by a `deploy.yml` step (on both Workers if
  shared) and listed in the comment block in `wrangler.toml`, all before the merge.
- [ ] The STATUS rows the change affects are updated in the same commit.

## Deploy

Push to `main`, or rerun the workflow on the current `main`:

```bash
gh workflow run deploy.yml --repo curtcox/hashbin.org --ref main
```

```bash
gh run list --repo curtcox/hashbin.org --workflow deploy.yml --limit 3
```

Don't deploy production with `npm run deploy`. It deploys only the main Worker. It skips
the secrets, the git SHA injection that `/health` and the pages report, the other two
Workers and the cache purge.

## After every deploy

- [ ] The run is green, including the content Worker deploy and **Deploy hosted run origin
  (hashbin.app)**. Both now fail the workflow on a deployment or verification error.
- [ ] Main site health:

  ```bash
  curl -fsS https://hashbin.org/health | jq '{status, environment, gitSha, checks: (.checks | map_values(.status))}'
  ```

  `status` is `healthy`, `environment` is `production` and `gitSha` is the deployed
  commit. CI rejects a `degraded` deploy; each check's `message` says why.
- [ ] `npm run verify:production` passes (also run automatically by CI and smoke tests).
- [ ] `curl -fsS https://256t.us/health` returns 200.
- [ ] `node scripts/verify-hosted-run-origin.mjs` passes.
- [ ] The Smoke Test workflow, which runs after each successful deploy and every 6 hours,
  passed:

  ```bash
  gh run list --repo curtcox/hashbin.org --workflow smoke-test.yml --limit 3
  ```

- [ ] Requests without credentials are refused:

  | Request | Expected |
  |---------|----------|
  | `GET /api/auth/session` with no `Authorization` | 401 `{"error":"AUTH_MISSING", ...}` |
  | `GET /api/auth/session` with `Authorization: Invalid` | 401 `{"error":"AUTH_INVALID_FORMAT", ...}` |
  | Unsigned `POST /api/webhooks/clerk` | 401 `{"error":"Invalid signature"}`; 503 means `CLERK_WEBHOOK_SECRET` is missing |
  | `POST /api/payments/webhook` without `stripe-signature` | 400 `{"error":"Missing signature"}` |

- [ ] No new errors in `npx wrangler tail hashbin-worker-prod` or
  `npx wrangler tail 256t-content-prod` for a few minutes. No Worker sets
  `[observability]`, so live tailing is the only log.
- [ ] Changes to backups or the cron: `POST /api/admin/backups/run` reports `failed: 0`.

## Rollback

- **Normal path:** `git revert` the bad commit and push it to `main`. CI then redeploys
  all three Workers with their secrets.
- **Faster, one Worker:** `npx wrangler deployments list`, then `npx wrangler rollback`
  (add `--config workers/256t-content/wrangler.toml` or `--config workers/run-origin/wrangler.toml`
  for the others). Revert in git as well, or the next push redeploys the bad code.
  Wrangler can't roll back across a Durable Object migration; fix forward instead.
- **Stop downloads now:** `COST_SAFETY_HARD_STOP=true` on the main Worker returns 503 for
  all `256t.us` content within 60 seconds. The allowance-only brake is
  `COST_SAFETY_ALLOWANCE_ONLY=true`. See [`docs/cost-safety.md`](../docs/cost-safety.md).
- **Clerk webhook damaging profiles:** disable the endpoint in Clerk until a fix is out.
- A rollback restores code and bindings, not R2 or Durable Object data. For data, use
  [`docs/backup-and-restore.md`](../docs/backup-and-restore.md).

## Secrets

GitHub is the source of truth (Decision 21). Set a value with
`gh secret set NAME --repo curtcox/hashbin.org` (it prompts, so the value stays out of
shell history), then deploy. Setting Worker secrets by hand makes them drift from GitHub.
Check names (not values) with `gh secret list --repo curtcox/hashbin.org`,
`npx wrangler secret list` and `npx wrangler secret list --config workers/256t-content/wrangler.toml`.

| Secret | Where | Needed |
|--------|-------|--------|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | CI; the account ID is also used by the main Worker's cost monitor | Required |
| `CLOUDFLARE_ZONE_ID` | CI route check and cache purge | Required; checked before any Cloudflare write |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Main Worker | Required (`sk_live_`/`pk_live_`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Main Worker | Required (live mode) |
| `OAUTH_SIGNING_KEY`, `DOWNLOAD_TOKEN_SECRET` | Main and content Workers, same values | Required |
| `ADMIN_USER_ID` | Main Worker | Required; admin sign-in and issuing `hba_` keys |
| `CLERK_WEBHOOK_SECRET` | Main Worker | Required; profile sync/deletion and webhook refusal verification |
| `CLOUDFLARE_ANALYTICS_TOKEN` | Main Worker | Required, read-only; the hourly cost monitor needs it |
| `ALERT_WEBHOOK_URL` | Main Worker | Without it alerts appear only at `/api/admin/alerts` |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | CI | Optional extra workers.dev check |

CI also writes `GIT_SHA`. `ADMIN_SECRET_TOKEN` and `API_KEY_ENCRYPTION_KEY` are retired:
delete them from GitHub and the Worker. Non-secret settings (`ENVIRONMENT`, `LOG_LEVEL`,
`CONTENT_DOMAIN`, `RUN_DOMAIN`) are `[vars]` in each `wrangler.toml`.

## Open launch setup

Owner (`ops`) work. Each item's evidence goes in the linked plan.

- [ ] **Retired secrets:** delete `ADMIN_SECRET_TOKEN` and `API_KEY_ENCRYPTION_KEY`
  (`gh secret delete NAME`, `npx wrangler secret delete NAME`).
- [ ] **Clerk:** CL9 (`user.updated` and `user.deleted` deliveries) and CL10 (GitHub
  sign-in, account linking, logout, mobile layout). Then rerun L11's sign-in step on the
  live keys.
- [ ] **Cloudflare:** CF1–CF10, which cover the analytics token, alert delivery
  (`POST /api/admin/alerts/test`), the `256t.us` WAF rule, billing notifications and live
  cache and funded-path acceptance (S20, S21, S22, L22).
- [ ] **Stripe:** ST1–ST5 (dispute notifications, Radar, webhook and checkout acceptance,
  financial evidence) and the Missouri tax registration noted under L2.
- [ ] **Backups:** confirm a production `POST /api/admin/backups/run` reported
  `failed: 0` (L10).
- [ ] **Third-party publishing:** production OAuth smoke test (S7).
- [ ] **Dependencies:** `npm audit --omit=dev` is clean (L14).
- [ ] **Legal and launch:** L5–L7 and L19–L21 in STATUS. Remove the beta banner (L12) last.

Done and verified in STATUS: Workers Paid plan and all three domains (L4, B14), production
Clerk with Google and GitHub (CL1–CL8, CL11–CL15), Stripe live mode with the
`/api/payments/webhook` endpoint (L2, L3), and the end-to-end run on development Clerk keys
(L11).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `checks.clerk` or `checks.stripe` degraded | Test keys in production; check `details.usingTestKeysInProduction` |
| `"environment": "unknown"` | `ENVIRONMENT` missing from `[vars]` in `wrangler.toml` (a variable, not a secret) |
| A Durable Object shows `"accessible": false` | Missing binding or migration. `/health` probes only `CONTENT_METADATA`, `USER_PROFILES`, `PAYMENT_RECORDS`, `CONTEST_RECORDS` and `MESSAGE_THREADS` |
| `256t.us` serves old behavior | The content Worker step failed; rerun the workflow |
| Pages show an old `git-sha` comment | Cache; run the Purge Cloudflare Cache workflow |
| New user has no profile | The Clerk webhook is late. `GET /api/auth/session` and `GET /api/balance` create the profile on first use |
| Admin API returns 403 (`not_admin` or `insufficient_scope`) | `ADMIN_USER_ID` isn't the signed-in production user ID |
