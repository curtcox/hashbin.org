# HashBin.org Project Status

**This file is the single source of truth for project status.** If another document
disagrees with it, this file wins and the other document is stale.

- **Last audited:** 2026-10-07 (against commit `2c5b12d`)
- **Production:** `https://hashbin.org` is live, running `2c5b12d`, health = **degraded** (Clerk test keys in production)
- **Overall:** Feature-complete for an MVP backend. **Not ready to accept customers** — see the launch blockers below.

Run `npm run status` for a one-screen summary of open items.

---

## How this file works

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and verified |
| 🚧 | In progress |
| ⬜ | Not started |
| ❓ | Needs a decision or information from the project owner |

**Owner** says who can move an item forward:

- `code` — can be done entirely in this repo (by a contributor or an agent)
- `ops` — needs dashboard or credential access (Cloudflare, Clerk, Stripe, DNS); project owner only
- `legal` — needs legal input or a decision only the owner can make

**Rules for keeping it current**

1. A PR that finishes, starts, or discovers an item updates its row here **in the same PR**.
2. Each row has a stable ID (`L…` launch blocker, `S…` soon after launch, `B…` backlog).
   Reference IDs in commits and PRs (e.g. `L8: add dispute form`).
3. Detailed design lives in `todo/<plan>.md`. When a plan is fully done, move it to `done/`
   and update its row here.
4. Update **Last audited** whenever you re-verify the whole file against the code and production.

---

## Launch blockers

Everything here must be ✅ before the beta banner comes down and customers are accepted.

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| L1 | Production Clerk keys (`sk_live_`/`pk_live_`) in GitHub secrets | ops | ⬜ | Health reports `degraded` because of test keys. The deploy workflow's "Verify deployment - Custom domain" step requires `healthy`, so **every `main` deploy run has been marked failed since 2026-01-24** even though the code deploys. See `todo/clerk_remaining.md`. |
| L2 | Stripe live mode: live secret key, live webhook endpoint + secret | ops | ❓ | It's unknown whether prod uses live keys; check `/health` after the next deploy (L3). See `docs/payments-setup.md`. |
| L3 | Health check flags Stripe test keys in production (like it does for Clerk) | code | ✅ | After the next deploy, `/health` → `checks.stripe.details.usingTestKeysInProduction` answers L2. |
| L4 | `256t.us` DNS, TLS, and content worker live | ops | ❓ | Code done (`workers/256t-content/`). Not reachable from the audit environment, so unverified. The deploy workflow also checks `https://256t.us/health`. See `done/content_domain_separation.md` Phase 1. |
| L5 | Real Terms of Service | legal | ⬜ | **Decision (2026-10-07): Claude drafts it with placeholders; the owner fills them in and gets it reviewed.** `frontend/terms.html` is placeholder text. Must cover: no refunds (Decision #13), no grace period on expiry (#8), content responsibility, dispute process, liability, governing law. |
| L6 | Privacy Policy | legal | ⬜ | No page exists. Must cover: Clerk/Stripe as processors, hashed IPs, public records, account deletion and data retention. |
| L7 | DMCA designated agent registered, with contact info on the site | legal/ops | ⬜ | Required for DMCA safe harbor (17 U.S.C. §512(c)(2)). |
| L8 | Public UI for reporting content (dispute submission + open disputes list) | code | ⬜ | The backend API is done (`POST/GET /api/disputes`). The UI is missing: `todo/content_moderation.md` Phases 6–8. |
| L9 | Upload size limit matches reality | code | ✅ | **Decision (2026-10-07): cap at 90 MB.** Enforced server-side (`src/utils/upload-limits.js`, 413 before buffering) and in the upload UI and docs; published as `max_upload_bytes` in `/api/config`. Larger files are B6. L11 should include an upload near 90 MB to confirm it fits in Worker memory. |
| L10 | Metadata backups: daily snapshots | code | ⬜ | **Decision (2026-10-07): nightly JSON snapshots to `BACKUP_BUCKET` plus a documented restore procedure (RPO 24h).** The per-write event log from Decision #15 is deferred (B8). |
| L11 | End-to-end production test: real OAuth login, real deposit, upload, download from 256t.us, dispute, deletion | ops | ⬜ | Blocked by L1, L2, L4. Checklist: `todo/manual_testing_guide.md`. |
| L13 | Extend retention from the dashboard | code | ⬜ | The API exists (`POST /api/content/{cid}/extend`), but no UI calls it. With no grace period and no expiry emails (Decisions #8, #14), customers need an easy way to extend before content is deleted. |
| L14 | No known vulnerabilities in runtime dependencies | code | ✅ | `npm audit --omit=dev` showed a critical `@clerk/shared` route-protection bypass plus high-severity Clerk/js-cookie issues; fixed with semver-compatible updates on 2026-10-07. Re-check before launch. |
| L15 | Content deletion and dispute moderation work in production | code | ✅ | Found 2026-10-07: `request.user` was never set, so `DELETE /api/content/{cid}` and every admin dispute endpoint always returned 401. Deletion also crashed on a misspelled binding (`PAYMENT_RECORD`), and resolving a dispute crashed before unblocking content. All fixed and covered by tests. Admin endpoints accept `X-Admin-Token` (deployed from GitHub secret `ADMIN_SECRET_TOKEN`) or an `ADMIN_USER_ID` session. **Ops:** set the `ADMIN_SECRET_TOKEN` GitHub secret. Runbook: `docs/ADMIN_SYSTEM.md` → Content Moderation. |
| L12 | Remove "Unstable Beta — Do not use" banner | code | ⬜ | `frontend/js/banner-config.js`. Do last. |

## Soon after launch

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| S1 | R2 cleanup of soft-deleted content (`DeletionPendingIndex`) | code | ⬜ | `cleanupR2PendingDeletion` in `src/index.js` is a stub. Deleted content is already hidden (a `.deleted` marker blocks serving), but its bytes stay in R2 and keep costing money. |
| S2 | Clerk webhook endpoint `POST /api/webhooks/clerk` | code | ⬜ | Several docs say it exists, but it doesn't. Profiles are created on demand, so it's only needed to react to deletions on Clerk's side. |
| S3 | Operator alert delivery (email/webhook) | code | ⬜ | Anomaly alerts are only stored in `AlertStore`. Someone has to poll `/api/admin/alerts`. |
| S4 | Admin dispute review UI | code | ⬜ | Today admins use the API with `ADMIN_SECRET_TOKEN`. |
| S5 | Deletion transactions shown in transaction history | code | ⬜ | `todo/content_moderation.md` Phase 9. |
| S6 | Developer app update/delete (`PATCH`/`DELETE /api/developers/apps/{id}`) | code | ⬜ | `done/third_party_publishing.md` "Remaining". |
| S8 | Donation UI for content | code | ⬜ | API exists (`POST /api/donate/cid/{cid}`), no UI. |
| S9 | Dev-dependency vulnerabilities (wrangler, playwright, sharp, eslint plugins) | code | ⬜ | `npm audit` reports 29 (2 critical) in dev tooling only; not shipped to production. Fixing needs major-version upgrades. |
| S7 | Production OAuth third-party publishing smoke test | ops | ⬜ | `done/third_party_publishing.md` "Production Deployment Verification". |

## Backlog (not needed for launch)

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| B1 | Payer ↔ contester messaging, email notifications, paid moderation (Decision #19) | code | ⬜ | `todo/content_moderation.md`, `todo/user_stories.md` |
| B2 | Tiered automated/AI dispute escalation and appeals | code | ⬜ | `todo/content_dispute_resolution.md` |
| B3 | npm distribution of `hashbin-sdk` | code | ⬜ | `done/third_party_publishing.md` |
| B4 | Developer webhooks and bulk operations | code | ⬜ | `todo/user_stories.md` (API Developers) |
| B5 | Peer-to-peer balance transfer | legal | ❓ | `todo/balance_transfer.md` — undecided whether it should exist |
| B6 | Uploads larger than 90 MB (multipart, up to R2's limits) | code | ⬜ | Follows the L9 decision |
| B7 | Sample third-party integration app | code | ⬜ | `done/third_party_publishing.md` |
| B8 | Append-only event log to R2 for every state change (Decision #15, RPO ≤1h) | code | ⬜ | Deferred by the L10 decision |

---

## What's done

The backend for each of these is implemented and covered by unit tests (`npm run test:unit`:
313 passing, 2 skipped, as of the last audit). "Done" means implemented, not tested in
production with live credentials (that's L11).

| Area | Plan(s) |
|------|---------|
| Infrastructure, CI/CD, health checks, build reports | `done/site_creation.md`, `done/deployment_validation.md`, `done/health_validation.md`, `done/only_production.md` |
| 256t addressing, upload, download, inline content, range requests | `done/upload.md`, `done/download.md`, `done/download_extended.md` |
| Content served from a separate origin (`256t.us`) | `done/content_domain_separation.md` (code only; infrastructure is L4) |
| Clerk auth, API keys (backend and UI), account deletion with 2FA | `done/user_authorization.md`, `done/api_keys.md`, `done/key_management_ui.md`, `done/account_management.md`, `done/login.md` |
| Stripe deposits, balance, pricing, transaction history | `done/payments.md`, `done/stripe.md`, `done/add_to_balance.md`, `done/user_transaction_history.md` |
| Per-content rate limits (MTBR) and their purchase UI | `done/content_rate_limit.md`, `done/content_rate_limit_ui.md` |
| Expiration cron job, deletion records, public deletion API | `done/content_lifecycle_complete.md` |
| Dispute and deletion backend, admin moderation API | `todo/content_moderation.md` (Phases 1–5) |
| Admin stats, alerts, audit log, cost tracking | `done/system_management.md`, `done/track_and_predict_expenses.md` |
| OAuth 2.0 + PKCE third-party publishing, hosted SDK, developer console | `done/third_party_publishing.md` |
| Navigation, site map, docs pages, public records page | `done/navigation_discoverability.md`, `done/frontend_ui.md` |
| Fully local development mode and local API test suites | `done/running_fully_local.md`, `done/local_API_tests.md` |

## Other planning documents

- `todo/master_plan.md` — vision, architecture, and the 21 architectural decisions (phase status points here)
- `todo/user_stories.md` — per-story UI/API status
- `todo/deployment_setup.md`, `todo/deployment_checklist.md`, `docs/deployment.md` — deployment how-to
