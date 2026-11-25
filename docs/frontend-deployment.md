# Frontend deployment

The static site in `frontend/` is served by the main Worker through the `ASSETS` binding
(`[assets]` in `wrangler.toml`). There is no build step: every push to `main` deploys the
Worker and its assets together, after the deploy workflow injects the commit into each HTML
file ([git-sha-verification.md](git-sha-verification.md)).

## Clerk

The frontend reads Clerk's publishable key from `GET /api/config`, so no key lives in HTML.
When `/api/config` reports `authMode: "local"` (local development), the auth loader uses local
sign-in instead. `frontend/js/auth.js` loads clerk-js v6 with its `@clerk/ui` sign-in components,
initializes Clerk once, and `getSessionToken()` waits for it; page scripts that call the API on
load must go through it.

Clerk setup for production (keys, Google and GitHub providers, the webhook) is tracked in
[`todo/clerk_remaining.md`](../todo/clerk_remaining.md). The keys are GitHub secrets that the
deploy workflow pushes to the Worker ([deployment.md](deployment.md#36-configure-worker-secrets));
`/health` reports a test key in production as degraded.

## Routing

`src/index.js` handles a request in this order:

1. `POST /api/payments/webhook` (Stripe) and `POST /api/webhooks/clerk`, before rate limiting.
2. `/api/*`, `/oauth/*` and `/health`: the `API_ROUTES` dispatcher. Unknown API paths are JSON 404s.
3. `/info/{cid}` redirects to `/info.html?cid={cid}`; `/dashboard/uploads/{cid}` and
   `/dashboard/suppliers/{id}` serve their `detail.html` pages.
4. Static assets. Cloudflare serves `/x.html` at `/x`. An unknown path without an extension
   redirects to `/`; an unknown file is a 404.

Downloads are not served here: `https://256t.us/{cid}` is the content Worker. Only local
development answers `/{cid}` from the main Worker.

Public pages are linked from `frontend/sitemap.html`; add new ones there.

## Headers and the SDK

`frontend/_headers` sets the response policies. Keep in it:

- `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `no-store` on `/publish`.
- `Access-Control-Allow-Origin: *` on `/sdk/*`, so apps on other origins can load the SDK.
- An immutable cache rule for every frozen `/sdk/vX.Y.Z/*` release.

API CORS is separate: it allows only the origins of active registered apps (see
`src/auth/oauth-cors.js`). Don't add a shared-host exception or an environment allow-list.

`/sdk/hashbin.js` is always the latest SDK; releases under `/sdk/vX.Y.Z/` never change. To
release, follow [AGENTS.md](../AGENTS.md#generated-and-immutable-files). `/publish`,
`/js/publish.js`, the SDK and the guides under `/docs/` ship in the same deploy as the
`/api/publish` handlers they work with.

## Verifying a deploy

The deploy workflow runs `npm run verify:production`. By hand, check that `/health` reports
the commit, that `/publish` sends its framing headers, and that the newest release's
`/sdk/v0.6.0/integrity.json` loads. Local Chromium and WebKit tests cover the save protocol,
but live Clerk sign-in in Safari (with tracking prevention) and Firefox is still an open
acceptance item in `STATUS.md`.

## Troubleshooting

- **Sign-in button missing:** check that `/api/config` loads and returns a publishable key,
  and look for Clerk errors in the browser console.
- **API calls on page load return 401:** the page script called the API before Clerk was ready;
  use `getSessionToken()` from `/js/auth.js`.
- **Old page content after deploy:** purge the cache (`scripts/purge-cloudflare-cache.sh`).
