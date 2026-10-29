# Scripts

Test runners, operator CLIs, release tools and the build-report pipeline. Run everything from
the repository root. Most have an `npm run` alias in `package.json`; each script's header
comment says what it needs.

## Operator and release tools

| Script | What it does |
|--------|--------------|
| `verify-production.mjs` | `npm run verify:production`: strict post-deploy checks for all three origins, page/health commits, credential/signature refusals and public endpoints. Set `EXPECTED_GIT_SHA` to require a full commit. Used by deploy and scheduled smoke CI ([checklist](../todo/deployment_checklist.md)). |
| `check-deployment-secrets.mjs` | Validates required CI secrets and live key modes before Cloudflare writes; reports names only. |
| `verify-deployment.sh` | Checks a deployment: home page, `/health` (config, Durable Objects, R2), the 256t.us content domain and API 404s. `npm run verify` checks `https://hashbin.org`; `npm run verify:workers-dev -- <subdomain>` checks `hashbin-worker-prod.<subdomain>.workers.dev`. |
| `verify-hosted-run-origin.mjs` | Checks the live `hashbin.app` sandbox origin's headers (run by the deploy workflow). |
| `generate-oauth-signing-key.sh` | Prints a random `OAUTH_SIGNING_KEY` and how to add it as a GitHub secret. Rotating it invalidates OAuth tokens and codes. |
| `publish.mjs` | Publishes files through a scoped OAuth grant ([guide](../docs/publishing-from-the-command-line.md)). |
| `release-browser-sdk.mjs` | `node scripts/release-browser-sdk.mjs vX.Y.Z` freezes `frontend/sdk/hashbin.js` into an immutable release with an SRI manifest. It refuses to overwrite a release. Then add the version to `src/app-safety.js`, `src/browser-sdk-release.test.js`, an immutable cache rule in `frontend/_headers` and `frontend/docs/sdk.html`. |
| `pin-runtime.mjs` | Verifies upstream runtime bytes for the hosted sandbox, uploads them and writes the runtime allowlist ([operator guide](../docs/hosted-run-origin.md)). |
| `backup/restore-snapshot.mjs` | Restores Durable Object state from a nightly snapshot ([runbook](../docs/backup-and-restore.md)). |
| `cost-safety-report.mjs` | `npm run cost-safety:report` exports cost history and reconciles it with an invoice ([runbook](../docs/cost-safety.md#export-and-invoice-reconciliation)). |
| `cost-safety-model.js` | The pricing-floor model behind `docs/business/price-floor.org` and `src/services/funded-margin.test.js`. |
| `purge-cloudflare-cache.sh` | Purges the hashbin.org Cloudflare cache (also a manual workflow). |
| `status.sh` | `npm run status`: open items in `STATUS.md` (`--all` for everything). |
| `docs/generate-api-route-index.mjs` | Regenerates the route index in `docs/API.md` from `API_ROUTES`. `src/docs-api-routes.test.js` fails if it drifts. |
| `docs/generate-textpad-docs.py` | Regenerates `frontend/docs/textpad*.html` from the `*.template.html` files beside it. |
| `inject-git-sha.sh`, `inject-git-sha-code.sh` | Embed the deployed commit in the Worker and frontend (deploy workflow; see [git SHA verification](../docs/git-sha-verification.md)). |

Admin tools take an `hba_` admin key in `ADMIN_KEY`; issue one at `/admin/keys.html`.

## Tests

Unit tests are Vitest files beside the code (`npm run test:unit`). The scripts here cover what
needs a running Worker or a browser.

| Script | What it tests | Needs |
|--------|---------------|-------|
| `run-all-api-tests.sh` | `npm run test:api`: every suite in [`api-tests/`](api-tests/README.md) | `npm run dev:local` |
| `run-funded-local-acceptance.mjs` | `npm run test:funded:local`: funded downloads across two isolated local Workers (gates deploys) | nothing |
| `hosted-run-test-server.mjs`, `measure-hosted-run-origin.mjs` | Fixture server for `npm run test:hosted`, and `npm run test:hosted:measure` browser measurements | Playwright browsers |
| `validation/run-all-validations.sh` | Post-deploy validation of a live target ([README](validation/README.md)) | `TARGET_URL` |
| `test-auth-system.sh` | `npm run test:auth`: sign-in, API keys and middleware against a local server | `npm run dev:local` |
| `test-local-mode.sh` | Local sign-in and payments ([local development](../docs/local-development.md)) | `npm run dev:local` |
| `test-admin-endpoints.sh`, `test-system-management.sh` | Admin endpoints, scheduled jobs, alerts and export limits | a server and `ADMIN_KEY` |
| `test-reporter.sh` | Runs the suites and writes the GitHub Actions summary (deploy workflow) | nothing |

The remaining `test-*.sh` scripts (`test-grep-patterns`, `test-user-balance`, `test-auth-gate`,
`test-stripe-webhook`, `test-api-keys`, `test-upload-balance`, `test-rate-limiting`,
`test-git-sha-injection`, `test-transaction-history`, `test-supplier-*`) are older grep-based
structural checks. `npm test` runs them after the unit tests; the supplier checks need
`npm run dev:local`. Each has a `test:*` alias. Prefer a Vitest test for new checks.

## Build report

`.github/workflows/build-report.yml` runs on pushes to `main` and publishes an HTML report to
GitHub Pages at `https://curtcox.github.io/hashbin.org/` ([setup](../docs/github-pages-setup.md)).
Findings are warnings and never fail the build. Each area has a collect script and a generate
script, writing under `build-reports/` (gitignored):

| Directory | Report |
|-----------|--------|
| `coverage/` | Unit-test coverage (c8); warns under 80% lines or 70% branches |
| `unit-tests/` | Vitest results |
| `api-tests/` (`collect-api-test-results.sh`, `generate-api-test-report.sh`) | Local API suite results |
| `security/` | `npm audit` and ESLint security findings |
| `performance/` | API suite timings; warns over 1000 ms average |
| `quality/` | ESLint |
| `complexity/` | ESLint complexity rules |
| `structure/` | Module structure |
| `documentation/` | JSDoc coverage |
| `visual-regression/` | Playwright screenshots compared with the last run |
| `trends/` | History across runs |
| `reports/` | The index page (`generate-main-report.sh`), `problems.txt` and the HTML templates |

To build one locally, run its scripts in order, for example:

```bash
bash scripts/coverage/collect-coverage.sh
bash scripts/coverage/generate-coverage-report.sh
bash scripts/reports/generate-main-report.sh
open build-reports/index.html
```

The performance and API reports need `npm run dev:local` running. The generators read
`GITHUB_REPOSITORY`, `GITHUB_SHA`, `GITHUB_SERVER_URL` and `GITHUB_RUN_ID` for source links;
set them by hand outside Actions. The generators need `jq`.
