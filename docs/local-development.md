# Local Development (Fully Offline)

This guide describes how to run HashBin.org entirely locally without external services (Clerk, Stripe, or Cloudflare production infrastructure).

## Prerequisites

- Node.js 22+
- npm

## Quick Start

```bash
npm install
cp .dev.vars.example .dev.vars   # then replace the placeholder secrets with random values
npm run dev:local
```

The app runs at `http://localhost:8787`. `.dev.vars` sets the local signing secrets and
`ADMIN_USER_ID` (see the comments in `.dev.vars.example`).

## Local Authentication

Local mode replaces Clerk with a lightweight username prompt:

- Click **Sign In** in the UI and enter a username.
- API calls can use the header:

```
Authorization: LocalDev <user_id>
```

User IDs are free-form strings (up to 256 characters).
New local users start with a $10.00 balance for convenience.

## Local Payments

Stripe is disabled in local mode. Use the dev deposit endpoint instead:

```bash
curl -X POST http://localhost:8787/api/balance/dev-deposit \
  -H "Authorization: LocalDev demo_user" \
  -H "Content-Type: application/json" \
  --data '{"amount_cents": 1000}'
```

This credits the local balance immediately and records a transaction in history.

## Local OAuth

Plain `npm run dev:local` does not provide `OAUTH_SIGNING_KEY`. Hosted Publish approvals,
DPoP nonces and OAuth exchanges need that signing material; `/oauth/authorize` reports
`server_misconfigured` when it is absent. Start a local server with a throwaway key:

```bash
npx wrangler dev --config wrangler.local.toml --local --var OAUTH_SIGNING_KEY:local-test-key
```

Approve a request without the browser by posting the authorize URL's query parameters as JSON to
`/oauth/authorize` with `Authorization: LocalDev <user_id>` and `Accept: application/json`; the
response's `redirect_to` is the callback URL. See [publishing from the command line](publishing-from-the-command-line.md).

### Browser save-flow checks

Register an app on the local server with the exact callback URI, acknowledging shared-origin
risk if another local app uses the same origin. Set the browser SDK's `baseUrl` and
`contentBaseUrl` explicitly: its API default is `https://hashbin.org`, regardless of the
client page's origin.

With the keyed local server running, `npx playwright test frontend/tests/browser-client-safety.spec.js`
checks hosted popup/redirect publishing, reload recovery, allowance consent, DPoP saves,
disconnect, framing headers and SRI. `npm run test:funded:local` independently starts and
cleans up an isolated main/content Worker pair with matching throwaway secrets and bindings.
Never use production signing material in these commands. Local auth cannot validate real
Clerk/social sign-in or a browser's tracking-prevention behavior.

## Helpful Endpoints

- `GET /health` — confirms the server is running and shows `environment: "local"`
- `GET /api/config` — returns `isLocalMode: true` and `authMode: "local"`

## Debugging Tips

- Wrangler local state is stored in `.wrangler/state`.
- Use `npm run dev` to compare behavior against production-like mode.
- If UI auth doesn’t appear, refresh and ensure `/api/config` is reachable.

## Local Test Script

Run a basic local check (server must already be running):

```bash
scripts/test-local-mode.sh
```
