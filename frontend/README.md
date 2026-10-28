# HashBin.org frontend

The production UI, public documentation and hosted browser SDK are static assets in this
directory. Cloudflare Workers Assets serves them together with the API on `hashbin.org`;
raw uploaded content is isolated on `256t.us`. There is no frontend build step.

## Structure

| Path | Purpose |
| --- | --- |
| `publish.html`, `js/publish.js` | First-party per-save approval and allowance setup entry page |
| `sdk/hashbin.js` | Latest self-contained browser SDK |
| `sdk/v0.2.0/` | Immutable SDK release and SHA-384 integrity manifest |
| `docs/browser-client-safety.html` | Choosing save flows, shared origins, storage and recovery |
| `docs/sdk.html` | SDK usage, callbacks, SRI and migration |
| `docs/api.html` | Public API reference |
| `developers.html`, `js/developers.js` | App registration, redirect URIs and shared-origin acknowledgment |
| `account.html`, `js/account.js` | Retention defaults, grants, spending/activity, revoke-all and download budgets |
| `upload.html`, `retrieve.html`, `info.html` | Content upload, retrieval and metadata |
| `dashboard/`, `api-keys*.html`, `transactions.html` | Uploads, suppliers, scoped API keys and account history |
| `js/auth-loader.js`, `js/auth.js`, `js/local-auth.js` | Clerk/local authentication selection and session helpers |
| `_headers` | SDK CORS/cache policy and hosted approval framing protections |
| `tests/` | Playwright browser tests |

## Browser publishing

- **Default save button:** `client.publish(bytes, options)` opens HashBin Publish. The user
  reviews the content, retention and exact price on HashBin and approves once. The app
  receives a verified CID and no credential. Popup handoffs accept up to 5 MiB; redirect
  handoffs accept up to 512 KiB and require `handlePublishCallback()` on return.
- **Silent saves:** `authorize()` opens allowance setup; `save()` uploads using that grant.
  Defaults suggest $1/month, 1 MiB per upload and a 30-day consent expiry. Access tokens
  last 15 minutes. New refresh tokens have seven-day idle expiry and a 90-day family maximum.
- **DPoP:** the hosted SDK binds new tokens to a non-extractable P-256 key in IndexedDB.
  New bound tokens normally live in local storage; an unavailable key database falls back
  to memory-only keys/tokens and popup authorization. Same-origin scripts can still use
  the browser key while running. A separate origin per allowance app remains valuable.
- **Verification and spending:** `retrieve()` verifies the full body before returning a
  Response; `publish()` and `save()` check returned CIDs. `verifyCID()` covers custom fetches.
  `save(content, {maxCostCents})` sets a per-upload charge ceiling. `disconnect()` revokes server-side;
  `clearTokens()` only removes the local copy.

The previous OAuth-upload behavior of `publish()` moved to `save()`. Read the repository
[browser safety and migration guide](../docs/browser-client-safety.md) before upgrading a client.
Pinned SDK scripts need `integrity` and `crossorigin="anonymous"`; the published SDK guide
contains the exact release hash. Never edit an existing published release directory.

## Configuration and local development

The backend supplies Clerk's publishable key through `GET /api/config`. Set
`CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on the Worker; do not put secret keys into HTML.
The auth loader selects local authentication when the API reports local mode.

```bash
npm install
npm run dev:local
```

For hosted approval or OAuth tests, supply a throwaway signing key as well:

```bash
npm run dev:local -- --var OAUTH_SIGNING_KEY:local-test-key
```

Open `http://localhost:8787`; local sign-in accepts a username. Registered redirects must
match exactly. The browser SDK defaults to the production API, so local clients must set
`baseUrl: 'http://localhost:8787'` and `contentBaseUrl` explicitly. See
[local development](../docs/local-development.md).

## Documentation authoring

Edit the public `.html` sources here and repository Markdown under `docs/`. The Textpad
walkthroughs are generated: edit `scripts/docs/*-doc.template.html` and the corresponding
example source/comments, then run `python3 scripts/docs/generate-textpad-docs.py`.
The unit suite checks that embedded excerpts and complete sources still match the examples.
Historical plans in `done/` retain their original context; `STATUS.md` tracks current acceptance.

## Validation

```bash
npm run test:unit
npx playwright test frontend/tests/browser-client-safety.spec.js
```

The Playwright configuration can start local mode, but the safety flows need an OAuth
signing key, so start the keyed local server above first. The tests exercise two loopback
origins, popup/redirect callbacks, reload recovery, DPoP saves/disconnect, framing headers
and real SRI loading. Chromium and WebKit local-auth validation does not establish live
Clerk/social sign-in behavior under Safari ITP or Firefox tracking protection.

Modern browsers need ES modules, WebCrypto, popup/postMessage support and session storage
for redirects. IndexedDB provides persistent keys; Web Locks serializes refreshes across
tabs. Without Web Locks, use one active allowance tab or per-save approval.

## Deployment

The `Deploy to Cloudflare` GitHub Actions workflow on `main` publishes this directory as
Worker Assets, deploys the API and dedicated content worker, and verifies the deployed Git SHA.
The GitHub Pages build report is a separate site and is not the production documentation host.
See [frontend deployment](../docs/frontend-deployment.md) for bindings and verification.

Keep the `_headers` rules when deploying: Publish must reject framing and use `no-store`,
the SDK must be importable across origins, and immutable version paths must keep their bytes
and integrity hashes. The main and content Workers share OAuth signing material and the
ApplicationRegistry replay-store binding for funded DPoP requests.
