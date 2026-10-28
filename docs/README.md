# Documentation index

Project status is in [`../STATUS.md`](../STATUS.md); repository conventions for agents and
contributors are in [`../AGENTS.md`](../AGENTS.md). Open plans live in [`../todo/`](../todo/),
finished ones in [`../done/`](../done/).

## Building on HashBin

| Doc | What it covers |
|-----|----------------|
| [API.md](API.md) | REST API reference: a generated index of every route and its access, then content, auth, payments, OAuth details |
| [browser-client-safety.md](browser-client-safety.md) | Browser save flows (hosted approval, DPoP allowances), token lifetimes, shared origins, SRI, migration |
| [api-keys-setup.md](api-keys-setup.md) | Scoped `hbk_` API keys and their caveats |
| [api-rate-limiting.md](api-rate-limiting.md) | Buying download allowance for content |
| [publishing-from-the-command-line.md](publishing-from-the-command-line.md) | `scripts/publish.mjs`: publish files through a scoped OAuth grant |

The public site has user-facing versions of several of these under `frontend/docs/`
(served at `https://hashbin.org/docs/`), including the SDK guide and security notes.

## Running it locally

| Doc | What it covers |
|-----|----------------|
| [local-development.md](local-development.md) | `npm run dev:local`: everything offline, local sign-in and payments |

## Deploying and operating

| Doc | What it covers |
|-----|----------------|
| [deployment.md](deployment.md) | Deploying a fork: Cloudflare, GitHub secrets, custom domains |
| [frontend-deployment.md](frontend-deployment.md) | How the static frontend ships with the Worker; Clerk setup |
| [payments-setup.md](payments-setup.md) | Stripe keys, webhook and secrets |
| [health.md](health.md) | `/health` checks and what each status means |
| [git-sha-verification.md](git-sha-verification.md) | How deploys embed and verify the git SHA |
| [ADMIN_SYSTEM.md](ADMIN_SYSTEM.md) | Admin sign-in, scoped `hba_` admin keys, admin API, moderation runbook |
| [backup-and-restore.md](backup-and-restore.md) | Nightly metadata snapshots and restore |
| [cost-safety.md](cost-safety.md) | Cost policy, download allowances, monitor and brake, invoice reconciliation |
| [hosted-run-origin.md](hosted-run-origin.md) | Operating the `hashbin.app` hosted sandbox origin |
| [github-pages-setup.md](github-pages-setup.md) | The build report published to GitHub Pages |

Setup checklists for hashbin.org itself are in `todo/deployment_setup.md`,
`todo/cost_safety_cloudflare.md`, `todo/cost_safety_stripe.md` and `todo/clerk_remaining.md`.

## Decisions, business and legal

| Doc | What it covers |
|-----|----------------|
| [decisions/edge_cache.md](decisions/edge_cache.md) | Why 256t.us uses explicit edge caching with prepaid enforcement |
| [business/README.md](business/README.md) | Opening to the public at low risk: costs, reserve, pricing floor, entity and insurance |
| [legal-review.md](legal-review.md) | Review checklist for the draft Terms, Privacy and DMCA pages |
| [video-series/README.md](video-series/README.md) | Explainer video scripts and render pipeline |

`hosted-run-origin-measurements.json` holds the browser measurements behind `hosted-run-origin.md`.
