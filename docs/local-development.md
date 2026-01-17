# Local Development (Fully Offline)

This guide describes how to run HashBin.org entirely locally without external services (Clerk, Stripe, or Cloudflare production infrastructure).

## Prerequisites

- Node.js 20+
- npm

## Quick Start

```bash
npm install
npm run dev:local
```

The app runs at `http://localhost:8787`.

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
