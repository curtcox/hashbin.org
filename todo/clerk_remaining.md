# Clerk production setup: remaining work

## Status

**Phase:** production configuration and acceptance; not verified in the production
account. Backend implementation is in [done/clerk.md](../done/clerk.md).
Updated 2026-10-25. This plan takes precedence over older dashboard recipes in
[deployment_checklist.md](deployment_checklist.md).

## Access preference: API and CLI first

Use documented Clerk APIs/SDKs, GitHub CLI and deployment CI before browser
configuration. Read the current application/instance and schema first, apply a
minimal change, then read back and verify it. Record non-secret IDs, dates and
outcomes. Keep secret values and generated management URLs out of committed
files, command arguments and logs; transfer secrets through stdin to GitHub.

Clerk's **Platform API is currently private beta**. Check workspace entitlement
and access to a Platform API token first. It is distinct from the instance
`CLERK_SECRET_KEY` used by the Backend API. If unavailable, use supported Backend
API operations and record exactly which remaining setup requires the Dashboard.
Do not substitute undocumented Dashboard endpoints. Browser-based login/consent
acceptance remains necessary regardless of how configuration is applied.
[Platform API reference](https://clerk.com/docs/reference/platform-api),
[Backend API reference](https://clerk.com/docs/reference/backend-api).

## 1. Production instance, domain and providers

- [ ] **CL1 — Discover access.** Identify the existing workspace/application and
  production instance. With Platform API access, list applications at
  `GET /v1/platform/applications` and inspect the target application before
  creating anything. Record API availability, application/instance IDs and mode.
- [ ] **CL2 — Instance configuration.** Prefer Platform API instance creation at
  `POST /v1/platform/applications/{applicationID}/instances` when needed. Read
  `/v1/platform/applications/{applicationID}/instances/{envOrInsID}/config/schema`
  and `/config`, then PATCH only required supported settings. Configure the
  intended social providers, account-linking/verification policy and minimal
  profile fields using the schema, without silently changing existing policy.
  Backend `GET/PATCH /v1/instance` covers only its documented subset.
- [ ] **CL3 — Production providers.** Configure Google, Apple and Microsoft with
  production credentials; GitHub remains optional unless selected for launch.
  Prefer Platform config API fields available to this workspace. Provider-side
  credential creation/verification may require that provider's API or console;
  record each unavoidable manual step. Clerk's Backend `/oauth_applications`
  resource configures Clerk as an OAuth server and is not a replacement for
  social sign-in provider configuration.
- [ ] **CL4 — Domain and origins.** Prefer Platform domain operations under
  `/v1/platform/applications/{applicationID}/domains` and schema-supported
  settings for `hashbin.org`. Apply the returned DNS records via Cloudflare's
  DNS API, then verify resolution and Clerk's status. Inspect documented origin/
  redirect restrictions rather than inventing generic CORS settings. Only fall
  back to the Dashboard for fields/verification absent from available APIs.

If Platform access or a required field is unavailable, the documented fallback
is Clerk's production-instance/social-connection setup in the Dashboard. Record
that access/field limitation alongside CL1–CL4; a fallback does not mark any
acceptance check complete.
[Production setup](https://clerk.com/docs/guides/development/deployment/production),
[social connections](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/overview),
[Backend instance settings](https://clerk.com/docs/reference/backend/instance/update).

## 2. Webhook and secret provisioning

- [ ] **CL5 — Webhook.** Inspect available documented webhook management first.
  The Backend API exposes `POST /v1/webhooks/svix` to provision the associated
  Svix app and `POST /v1/webhooks/svix_url` for a management URL; neither is a
  generic endpoint-configuration API. If this Clerk instance provides an
  authorized Svix management token, prefer Svix's endpoint API to inspect/update
  the endpoint and event filters and retrieve its signing secret. A webhook
  signing secret is not a management API token, and a separate Svix account does
  not grant access to Clerk's managed app. If management API access is absent,
  record that limitation and use Clerk's embedded webhook UI for this step only.
  Configure `https://hashbin.org/api/webhooks/clerk` for `user.created`,
  `user.updated` and `user.deleted`; verify existing endpoints before creating
  duplicates. Record endpoint ID and delivery evidence without secrets.
  [Clerk webhooks](https://clerk.com/docs/guides/development/webhooks/overview),
  [Svix endpoint API](https://api.svix.com/docs).
- [ ] **CL6 — Secrets.** Obtain production credentials through the supported
  provisioning response or secret-management surface; use a browser only for
  credential bootstrap/reveal not exposed by an authorized API. Store
  `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` and `CLERK_WEBHOOK_SECRET` in GitHub
  using `gh secret set NAME --repo curtcox/hashbin.org` with a secure stdin
  source. `gh secret list` verifies names, never values. GitHub remains the
  source of truth under Decision 21; deploy through the existing workflow,
  which already publishes these values to Cloudflare when configured.
- [ ] **CL7 — Deploy and inspect.** Use `gh workflow run deploy.yml --ref main`
  and `gh run view` to deploy/inspect the result. Verify the intended revision,
  production instance and secret names using CI/Workers API metadata. This step
  deploys the repository revision and must follow the normal release process.

## 3. API and browser acceptance

- [ ] **CL8 — HTTP checks.** Check `/health` and `/api/config` via HTTP. Current
  `/health` Clerk details expose `secretKeyConfigured`,
  `publishableKeyConfigured` and `usingTestKeysInProduction`; these validate
  configuration presence/mode and do not establish authentication or webhook
  delivery. `/api/config` must return `authMode: "clerk"`, `isLocalMode: false`
  and a production `clerkPublishableKey`. Frontend initialization already reads
  this endpoint; no new HTML injection/config.js implementation is needed.

  ```bash
  curl -fsS https://hashbin.org/health | jq '.checks.clerk'
  curl -fsS https://hashbin.org/api/config | jq '{authMode,isLocalMode,productionKey:(.clerkPublishableKey | startswith("pk_live_"))}'
  ```

- [ ] **CL9 — Webhook acceptance.** Use Backend API/SDK calls to create, update
  and delete designated test users. Verify signed delivery creates/updates the
  HashBin profile and deletion disables its keys. Prefer authorized Svix API
  delivery inspection/replay when available; otherwise use the embedded UI
  only for delivery details/replay. Retain event IDs and observed application
  results. Never delete real users to test the integration.
- [ ] **CL10 — Real authentication.** In a browser, exercise each enabled launch
  provider's login/consent, callback, account linking, session and logout flow.
  Verify `/api/auth/session`, dashboard state and `/api/balance` through the
  authenticated session. API-created users alone do not verify OAuth/browser
  redirects or cookies. Test mobile layout and Clerk SDK initialization too.
- [ ] **CL11 — Smoke test.** Run and inspect the production smoke workflow via
  CLI; record its successful run ID. Smoke checks supplement CL9/CL10.

  ```bash
  gh workflow run smoke-test.yml --ref main --field environment=production
  gh run list --workflow smoke-test.yml --limit 5
  ```

## Completion criteria and manual exceptions

Complete CL1–CL11 with evidence before marking production readiness done. For
any browser configuration fallback, record the exact setting, missing documented
API/entitlement, manual action and verification. Missing credentials are an API
access prerequisite, not a blanket browser-configuration requirement. Product
browser acceptance is recorded separately from manual configuration exceptions.
If live API responses reveal a repo mismatch, record the required code follow-up.
