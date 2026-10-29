# Working in this repository

Guide for coding agents and new contributors. `CLAUDE.md` and
`.github/copilot-instructions.md` point here, so keep this file current instead of copying it.

HashBin.org is a pay-to-publish, free-to-download content host. Content is addressed by
[256t](todo/master_plan.md#256t-specification-summary) CIDs. It runs on Cloudflare Workers,
Durable Objects and R2, with Clerk for sign-in and Stripe for deposits.

## Start here

| Question | Answer lives in |
|----------|-----------------|
| What is done, what blocks launch, what's next? | [`STATUS.md`](STATUS.md) (the only source of truth for status; `npm run status` summarizes it) |
| Design and decisions for an open item | `todo/<plan>.md`, linked from the item's STATUS row |
| Why something finished was built the way it was | `done/<plan>.md`; older implementation write-ups are in `done/history/` |
| How to operate, deploy or configure something | [`docs/README.md`](docs/README.md) |
| The public API | [`docs/API.md`](docs/API.md) and the route table `API_ROUTES` in `src/index.js` |

## Repository map

```
src/                     Main Worker (hashbin.org): API, cron jobs, Durable Objects
  index.js               Entry point: fetch/scheduled handlers, API_ROUTES table, DO exports
  api/                   One module per API area (content, oauth, payments, disputes, admin-*)
  auth/                  Authentication: middleware, scopes, OAuth, DPoP, admin, local auth
  durable-objects/       17 DO classes (bound in wrangler.toml) plus their helpers
  services/ utils/       Shared logic: pricing, cost policy and monitoring, deletion, backups
  integration/           Multi-module tests
workers/
  256t-content/          256t.us download Worker (separate origin from sessions)
  run-origin/            hashbin.app hosted sandbox origin Worker
  shared/                Code shared by the two Workers
frontend/                Static site served by the main Worker; no build step
  js/ css/               Page scripts (ES modules imported by absolute path, e.g. /js/html.js)
  sdk/                   Browser SDK: hashbin.js is the latest; sdk/vX.Y.Z/ releases are immutable
  docs/                  Public docs pages (API, SDK, security notes, Textpad walkthroughs)
  tests/                 Playwright tests
examples/                Textpad sample apps for Expo and Flutter
scripts/                 Test runners, report generators, operator CLIs (see scripts/README.md)
test-utils/              Clerk, Stripe and Expo mocks for unit tests
todo/ done/              Plans: open and finished (see "Plans and status" below)
docs/                    Operator and developer guides; docs/business/ models costs and risks
docs/video-series/       Explainer video scripts, narration and Manim scenes
```

## Commands

Node 22+. Run `npm install` first.

| Command | Use it for | Needs |
|---------|-----------|-------|
| `npm run test:unit` | Unit tests (Vitest, `**/*.test.js` beside the code). **Run before every commit.** | nothing |
| `npx vitest run src/api/oauth.test.js` | One test file | nothing |
| `npm run lint` | ESLint over `src/`, `workers/`, `scripts/`, `frontend/js/`, `frontend/sdk/`. Must report 0 errors. | nothing |
| `npm run dev:local` | Full local stack at `http://localhost:8787` with no Clerk, Stripe or Cloudflare account | `.dev.vars` from `.dev.vars.example` |
| `npm run test:e2e` | Playwright browser tests | starts `dev:local` if needed |
| `npm run test:hosted` | Hosted sandbox tests (Chromium, WebKit) | `npx playwright install chromium webkit` |
| `npm run test:funded:local` | Funded-download acceptance in two isolated local Workers | nothing |
| `npm run test:api` | Local API suites in `scripts/api-tests/` | `dev:local` running |
| `npm test` | Unit tests plus legacy grep-based shell checks | `dev:local` running for the supplier checks |
| `npm run verify:production` | Strict production post-deploy checks for all three origins | deployed site; optional `EXPECTED_GIT_SHA` |
| `npm run status` | Open STATUS items | nothing |

Deployment CI (`.github/workflows/deploy.yml`) gates on the runtime audit, lint, unit, local
API, browser, hosted-sandbox and funded-download checks. Every push to `main` deploys
production, the only environment, so don't push to `main` unless the owner asked you to.

In local mode, authenticate API calls with `Authorization: LocalDev <user_id>`. New local
users start with $10.00, and `POST /api/balance/dev-deposit` adds more
([docs/local-development.md](docs/local-development.md)).

## Conventions

- **JavaScript:** ES modules, async/await, JSDoc on exported functions. Files are kebab-case,
  classes PascalCase. Match the comment density of the file you're editing: comments explain
  *why*, not what.
- **Tests sit beside the code** as `name.test.js` and use Vitest globals. Durable Objects are
  tested by constructing the class with an in-memory storage stub. Copy the pattern from a
  neighboring test rather than inventing one.
- **Every API route declares its access** in `API_ROUTES` (`src/index.js`): `PUBLIC`, `SESSION`,
  `ADMIN_SESSION`, or the scope(s) a delegated credential needs (`src/auth/scopes.js`). The
  dispatcher enforces it, and a test fails for any route without a valid declaration. A new
  scope needs an entry in `USER_SCOPES` or `ADMIN_SCOPES`. After changing `API_ROUTES`, run
  `node scripts/docs/generate-api-route-index.mjs` to refresh the route index in `docs/API.md`.
- **A new Durable Object** needs its class exported from `src/index.js`, a binding and a
  migration in `wrangler.toml`, and the same binding in `wrangler.local.toml`
  (`src/wrangler-bindings.test.js` checks the first and last).
- **Errors** are JSON `{ error, ... }` with the right HTTP status.
- **Frontend:** no framework, no bundler. Escape anything dynamic before it reaches
  `innerHTML` with `escapeHtml` from `/js/html.js`, or build nodes with `textContent`. Link
  new public pages from `frontend/sitemap.html`.
- **Money** is integer cents. Storage pricing is in `src/utils/pricing.js`; Cloudflare cost
  rates and safety limits are in `src/utils/cost-policy.js`. Don't duplicate either.
- **Secrets** never go in the repo. Worker secrets are listed in the comment block in
  `wrangler.toml` and pushed by the deploy workflow from GitHub secrets.

## Generated and immutable files

- `frontend/sdk/vX.Y.Z/` is a published SDK release, pinned by apps through SRI. Never edit it.
  Change `frontend/sdk/hashbin.js` (and `hashbin-cache.js`), then cut a new version with
  `node scripts/release-browser-sdk.mjs vX.Y.Z`, then add the version to `src/app-safety.js`,
  `src/browser-sdk-release.test.js`, an immutable cache rule in `frontend/_headers` and
  `frontend/docs/sdk.html`.
- `frontend/docs/textpad*.html` are generated from `scripts/docs/*.template.html`. After
  changing a template or a Textpad app, run `python3 scripts/docs/generate-textpad-docs.py`;
  `src/docs-textpad*.test.js` fails if they drift.
- The route index in `docs/API.md` (between the `GENERATED ROUTE INDEX` markers) is generated
  from `API_ROUTES` by `node scripts/docs/generate-api-route-index.mjs`;
  `src/docs-api-routes.test.js` fails if it drifts.
- `docs/video-series/narration/*.txt` is generated from `episodes/` by
  `docs/video-series/tools/extract_narration.py`.
- `build-reports/` and `test-results/` are local output and are gitignored.

## Plans and status

- `STATUS.md` rows have stable IDs: `L…` launch blockers, `S…` soon after launch, `B…`
  backlog. Reference them in commits (`L19: add NCII report type`).
- A change that finishes, starts or discovers an item updates its STATUS row **in the same
  commit**. When a `todo/` plan is fully done, `git mv` it to `done/` and fix links to it.
- `todo/<plan>.md` files are written to be picked up cold: each lists its remaining steps
  and what "done" looks like.
- Items owned by `ops` or `legal` need the project owner (dashboards, credentials, legal
  decisions). Prepare everything that can be prepared in code, then say what's left for them.

## Things that are easy to get wrong

- Downloads are served by the **256t.us Worker** (`workers/256t-content/`), not by
  `handleDownloadContent` in the main Worker, which only answers in local development.
  Download behavior changes belong in the content Worker.
- Same bytes mean the same CID. Re-uploading existing content is charged as an extension.
- Rate-limit counters in `src/auth/middleware.js` are per-isolate memory (best-effort).
  Download cost is bounded by the prepaid allowances in `docs/cost-safety.md`.
- `/` and other pages are the static frontend; only `/api/*`, `/oauth/*` and `/health` reach
  `API_ROUTES`. Unknown page paths redirect home, unknown API paths are JSON 404s.
- Production sign-in offers Google and GitHub only (`todo/clerk_remaining.md` CL3).
- `frontend/js/auth.js` initializes Clerk once, and `getSessionToken()` waits for it. Page
  scripts that call the API on load must go through it (STATUS L18).
