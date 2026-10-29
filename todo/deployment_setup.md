# Deployment setup: API and CLI first

**Type:** active quick reference, updated 2026-10-25.

Prefer supported provider APIs/SDKs, repo-pinned Wrangler, GitHub CLI and Actions
for inspection, configuration, deployment and verification. Read existing state,
apply the intended change and read it back. Record IDs and non-secret evidence.
Use browser configuration only for a specific operation without documented API
support or the required entitlement; record that limitation and manual action.
Missing API credentials are an access prerequisite, not a blanket dashboard path.

The detailed external checklists take precedence over older browser recipes:
[Cloudflare](cost_safety_cloudflare.md), [Stripe](cost_safety_stripe.md) and
[Clerk](clerk_remaining.md). Real login/Checkout/cookie browser acceptance is
still required. Full deployment context: [docs/deployment.md](../docs/deployment.md).

## 1. Discover Cloudflare account, zones and access

Use an existing authorized API credential or approved secret source. Through the
Cloudflare API, list accounts (`GET /accounts`) and zones (`GET /zones`, filtered
by the domain) to identify the target IDs. Verify the intended account and both
`hashbin.org` and `256t.us` zones; do not infer IDs from a hostname. API paths here
are relative to `https://api.cloudflare.com/client/v4`.

For token provisioning, prefer the token API with an authorized bootstrap
credential, discover permission groups and create a resource-scoped token.
[Token API](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/create/).
Use a browser only for initial account/token bootstrap when no supported API
credential can perform it; retain that as a specific access exception.

Keep deployment access separate from read-only analytics access. Review actual
permissions needed by the current workflow, including Workers scripts, R2,
account settings, Workers routes and zone cache purge. Grant only the target
account/zones and required operations. WAF/notification configuration may require
separate scoped write access; an analytics token must not be reused for it.
Verify billing entitlements through available account APIs before any plan change.

## 2. Set GitHub secrets and variables with CLI

Under Decision 21, GitHub is the configuration source of truth. Use
`gh secret set NAME --repo curtcox/hashbin.org` with secure stdin or its hidden
interactive prompt. Do not put secret values in arguments, committed files or
logs. Verify names with:

```bash
gh secret list --repo curtcox/hashbin.org
```

Required names and exact use are in `.github/workflows/deploy.yml`. They include
Cloudflare deployment IDs/token, Clerk and Stripe credentials and the shared
download/OAuth signing keys; the table in [the deployment checklist](deployment_checklist.md#secrets)
summarizes them. Follow the provider plans for webhook,
analytics and alert secrets; verify optional settings needed for launch rather
than assuming the workflow's minimum list establishes production readiness.
Use `gh variable set` for supported non-secret configuration where the workflow
actually reads it. Secret listing cannot reveal/verify stored secret values.

## 3. Deploy the existing main release workflow

Install the repository's pinned dependencies with `npm ci`; use `npx wrangler`
instead of installing a different global version. Deploy the intended reviewed
revision through the existing workflow:

```bash
gh workflow run deploy.yml --repo curtcox/hashbin.org --ref main
gh run list --repo curtcox/hashbin.org --workflow deploy.yml --limit 5
gh run view RUN_ID --repo curtcox/hashbin.org
```

The current workflow deploys production on a push to `main` or manual dispatch;
it does not deploy a separate development Worker from `develop`. Verify the
exact run/revision and CI test result. The workflow deploys the main Worker
before the content Worker and provisions secrets from GitHub. Do not assume a
successful push means the deployment completed.

## 4. Verify routes, domains, DNS and integration state

Prefer Workers/Routes and DNS APIs plus deployed Wrangler metadata to inspect
bindings, domains/routes and cron schedules. Apply necessary DNS changes through
the DNS API using the current config and provider-returned records. Preserve
unrelated routes/records. Do not build a workers.dev URL from an account ID;
read the actual subdomain/deployed URL from the API or deployment output.

Run the repository verification and production smoke checks:

```bash
npm run verify
curl -fsS https://hashbin.org/health | jq '{status,environment,checks}'
gh workflow run smoke-test.yml --repo curtcox/hashbin.org --ref main --field environment=production
```

The health response reports configuration/binding checks; it does not prove
OAuth, payment or webhook delivery. A degraded production integration needs
investigation even when deployment itself succeeded. Complete CF/ST/CL live
acceptance and retain their evidence before claiming readiness.

## Troubleshooting and fallback evidence

- Authentication/authorization: inspect API status/error and token scope; obtain
  the needed access rather than automatically repeating setup in the browser.
- Missing feature: record the documented API/plan limitation. Use a dashboard
  only for that specific field/artifact, with read-back verification if possible.
- Deployment failure: inspect the exact GitHub run and Wrangler/Workers logs.
- Domain failure: inspect API DNS/route state and DNS resolution before changing
  records. Treat provider-specific records as authoritative.

For each browser configuration exception, record provider, setting, unavailable
API/entitlement, date, manual action and non-secret verification in the relevant
provider plan. Do not store secrets, management URLs or customer data as evidence.
