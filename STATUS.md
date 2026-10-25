# HashBin.org Project Status

**This file is the single source of truth for project status.** If another document
disagrees with it, this file wins and the other document is stale.

- **Last audited:** 2026-10-07 (against commit `2c5b12d`)
- **Production:** `https://hashbin.org` and `https://256t.us` are live. `main` deploys on every push (deploy workflow green as of 2026-10-07). Health = **degraded** (Clerk test keys in production).
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
| L1 | Production Clerk keys (`sk_live_`/`pk_live_`) in GitHub secrets | ops | ⬜ | Health reports `degraded` because of test keys. The deploy workflow now treats `degraded` as a warning (only `unhealthy` fails a deploy); the scheduled smoke test still fails until live keys are in. See `todo/clerk_remaining.md`. |
| L2 | Stripe live mode: live secret key, live webhook endpoint + secret | ops | ✅ | Verified 2026-10-07 in the Stripe dashboard: live key and webhook secret in production; the live endpoint `https://hashbin.org/api/payments/webhook` is active for `checkout.session.completed`, `checkout.session.expired`, and `charge.dispute.created` (its API version is 2012-03-25, but every session field the handler reads exists in that version). Stripe Tax calculation is on (head office Missouri, preset code: electronically supplied services); a live $1.00 deposit checkout showed a $0.00 tax line and credited the balance. **Open (owner):** no tax registration yet, so Stripe collects no tax. Decided 2026-10-07 not to buy Tax Complete; register with the Missouri DOR directly, then add the registration in Stripe. See `docs/payments-setup.md`. |
| L3 | Health check flags Stripe test keys in production (like it does for Clerk) | code | ✅ | After the next deploy, `/health` → `checks.stripe.details.usingTestKeysInProduction` answers L2. |
| L4 | `256t.us` DNS, TLS, and content worker live | ops | ✅ | Live 2026-10-07: `https://256t.us/health` returns 200. The worker had never been reachable before: its `routes` sat below the `[[r2_buckets]]` header, so TOML read them as a bucket field. It now uses Workers custom domains, which create the DNS record and certificate on deploy. Real downloads get exercised in L11. |
| L5 | Real Terms of Service | legal | 🚧 | **Drafted 2026-10-07** in `frontend/terms.html`, marked DRAFT. Owner: fill in placeholders, confirm the policy choices, get it reviewed, remove the DRAFT notice. Checklist: `docs/legal-review.md`. Upload and deposit pages now link to it. |
| L6 | Privacy Policy | legal | 🚧 | **Drafted 2026-10-07** in `frontend/privacy.html`, marked DRAFT. Same checklist. Reporter contact details stay visible to signed-in users (decided 2026-10-07). |
| L7 | DMCA designated agent registered, with contact info on the site | legal/ops | 🚧 | `frontend/dmca.html` drafted (notice and counter-notice requirements, repeat-infringer policy). Owner: register the agent with the U.S. Copyright Office and fill in agent details; set up NCMEC CSAM reporting. See `docs/legal-review.md`. |
| L8 | Public UI for reporting content (dispute submission + open disputes list) | code | ✅ | `/disputes/submit.html`, `/disputes/index.html`, `/disputes/view.html?cid=`, a dispute notice and "Report this content" link on `/info.html`, and links from the FAQ, footer, and sitemap. Verified in a browser against local dev; the 256t.us worker returns 451 for disputed and 404 for deleted content. `/public-records.html` (previously broken: it called a nonexistent `/api/records`) now shows real deletion records. |
| L9 | Upload size limit matches reality | code | ✅ | **Decision (2026-10-07): cap at 90 MB.** Enforced server-side (`src/utils/upload-limits.js`, 413 before buffering) and in the upload UI and docs; published as `max_upload_bytes` in `/api/config`. Larger files are B6. L11 should include an upload near 90 MB to confirm it fits in Worker memory. |
| L10 | Metadata backups: daily snapshots | code | ✅ | **Decision (2026-10-07): nightly snapshots (RPO 24h).** `BackupIndex` DO + cron: every user, payment, content, dispute, and supplier object plus all singletons → `hashbin-backups-prod/snapshots/{run}/`, keeping 30 runs. Admin API to check, run, and restore; `scripts/backup/restore-snapshot.mjs`. Stale or failed runs raise a critical alert. Snapshot and restore verified end to end in local workerd. Runbook: `docs/backup-and-restore.md`. **Ops:** after the first production deploy, run `POST /api/admin/backups/run` and confirm `failed: 0`. |
| L11 | End-to-end production test: real OAuth login, real deposit, upload, download from 256t.us, dispute, deletion | ops | 🚧 | Ran 2026-10-07 against `3389c8e`, all passing: Google sign-in; live $1.00 deposit ($1.33 charged) credited by the webhook; 4.8 KB uploads for 1 month at $0.01; `https://256t.us/{cid}` served the bytes unchanged; a dispute from the public form blocked the content (451), then admin under review → deny restored it (200); uploader delete from the dashboard → 404. **Remaining:** rerun sign-in with live Clerk keys once L1 is done (Clerk was still on dev keys). |
| L13 | Extend retention from the dashboard | code | ✅ | Extend Retention card on `/dashboard/uploads/{cid}`: quotes come from `/api/payments/calculate`, then a confirmation, then `POST /api/content/{cid}/extend`. Verified in a browser against local dev. |
| L14 | No known vulnerabilities in runtime dependencies | code | ✅ | `npm audit --omit=dev` showed a critical `@clerk/shared` route-protection bypass plus high-severity Clerk/js-cookie issues; fixed with semver-compatible updates on 2026-10-07. Re-check before launch. |
| L15 | Content deletion and dispute moderation work in production | code | ✅ | Found 2026-10-07: `request.user` was never set, so `DELETE /api/content/{cid}` and every admin dispute endpoint always returned 401. Deletion also crashed on a misspelled binding (`PAYMENT_RECORD`), and resolving a dispute crashed before unblocking content. All fixed and covered by tests. Admin endpoints accept `X-Admin-Token` (deployed from GitHub secret `ADMIN_SECRET_TOKEN`) or an `ADMIN_USER_ID` session. Uploader deletion verified in production 2026-10-07 (L11). `ADMIN_SECRET_TOKEN` set as a GitHub secret and deployed 2026-10-07; the dispute admin API (under review, deny) verified in production with it (L11). Runbook: `docs/ADMIN_SYSTEM.md` → Content Moderation. |
| L16 | Upload and supplier detail pages reachable from their lists | code | ✅ | Found 2026-10-07: in production `/dashboard/uploads/{cid}/` and `/dashboard/suppliers/{id}` returned a 307 to `/…/detail`, dropping the ID, so every "My Uploads" card opened an error page. The worker now follows the assets redirect internally. |
| L17 | Pricing consistent across code, UI, and docs | code | ✅ | **Decision (2026-10-07): no minimum charge; cost rounds up to the next cent.** The code charged a $2.00 minimum on every upload and extension, which contradicted Decision #16 and the pricing page. Master plan Decision #16 has been revised to match. |
| L18 | Signed-in pages that call the API at load work with Clerk | code | ✅ | Found 2026-10-07 in L11: `getSessionToken()` returned null until `app.js` finished initializing Clerk, so page scripts that call the API right away failed silently. The upload page showed "Balance: Loading…" and disabled Upload ("Need $0.01 more"); the upload detail page never showed the Delete card. Local auth mode hides this, so tests didn't catch it. Fixed in `frontend/js/auth.js`: one shared initialization that `getSessionToken()` waits for (this also stops Clerk initializing twice per page). Verified in production 2026-10-07: balance loads, upload and the Delete card work. |
| L19 | TAKE IT DOWN Act removal process for non-consensual intimate images | code/legal | ⬜ | Found 2026-10-24: the law's removal duty has applied to sites hosting user content since 2026-05-19 (FTC-enforced). Needs a report type for it on `/disputes/submit.html` (today only copyright and illegal), removal within 48 hours, no 30-day auto-expiry, removal of identical copies (same bytes = same CID), and a plain-language notice of the process. See `docs/business/README.md`. |
| L20 | Stop adding the Stripe fee as a "card processing fee" | legal/code | ❓ | Found 2026-10-24: checkout adds the fee on top (a $1 deposit charges $1.33), and Terms §3 calls it a card processing fee, which makes it a credit card surcharge (Visa: 3% cap, none on debit, 30 days' notice to the processor). **Decide:** a $10 minimum deposit with the fee absorbed (5.9%), or fixed-price credit packs. Also found 2026-10-24: the added fee comes up about 1.7¢ short per $10, because Stripe takes 2.9% of the fee too; the even total is (credit + $0.30) / 0.971. `todo/cost_safety.md` Phase 4 also suggests capping a new account's first deposit. `src/utils/pricing.js`, `src/api/payments.js`. |
| L21 | Form the operating entity and move accounts into it | ops/legal | ⬜ | Recommended 2026-10-24: a Missouri single-member LLC ($50 online, no annual report). Then EIN, business bank account, and Stripe, Cloudflare, Clerk, domains and the DMCA registration in its name. Supplies `[LEGAL ENTITY NAME]` for L5–L7. Costs, risks and the reserve are modeled in `docs/business/`. |
| L22 | Bound what one file can cost: download allowances tied to paid storage | code | ❓ | Found 2026-10-24: 256t.us downloads are free and unlimited apart from a per-instance IP limit, and each does a Worker request plus four uncached R2 reads ($1.78 per million). One file downloaded 200M times a month costs about $350 a month, more than the yearly loss budget (`docs/business/price-floor.org`). **Decide:** the allowance (suggested 2,000 downloads per paid GB-month, at least 5,000 per file) and overage price (suggested $4 per million) or throttling. Replaces B9's design. `todo/cost_safety.md` Phase 3 |
| L12 | Remove "Unstable Beta — Do not use" banner | code | ⬜ | `frontend/js/banner-config.js`. Do last. |

## Soon after launch

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| S1 | R2 cleanup of soft-deleted content | code | ✅ | Deletions queue the CID in the DeletionRecord; the daily cron removes the bytes after 24h (200 per run; the `.deleted` marker stays). Also fixed: re-uploading, extending, or donating to deleted content charged the user while the content stayed deleted. These now return 410 before charging. Content soft-deleted before this change isn't queued; any such bytes can be removed by hand. |
| S2 | Clerk webhook endpoint `POST /api/webhooks/clerk` | code | ✅ | Svix-signature verified; `user.deleted` soft-deletes the profile, which also disables the user's API keys (they bypass Clerk); `user.created`/`updated` ensure a profile exists. Verified end to end in workerd. **Ops:** add the `CLERK_WEBHOOK_SECRET` GitHub secret and the endpoint in the Clerk dashboard (`docs/deployment.md` §3.6). |
| S3 | Operator alert delivery (email/webhook) | code | ✅ | **Decision (2026-10-07): generic webhook.** New alerts POST to `ALERT_WEBHOOK_URL` (Slack/Discord-compatible JSON); `POST /api/admin/alerts/test` checks delivery. Verified from workerd. **Ops:** create a Slack/Discord incoming webhook and set the `ALERT_WEBHOOK_URL` GitHub secret. |
| S4 | Admin dispute review UI | code | ✅ | `/admin/disputes.html`: token-gated (session storage only); shows open disputes with reporter contact and evidence; actions are under review, deny, and uphold (takedown, with a public reason); repeat-infringer list. Verified end to end in a browser. |
| S5 | Deletion transactions shown in transaction history | code | ✅ | "Content Deletion" rows with reason and closed dispute, plus a filter option. Also fixed: CID links in the history pointed to a nonexistent `/content/{cid}` route (now `/info.html?cid=`), and the detail text is now HTML-escaped. |
| S6 | Developer app update/delete (`PATCH`/`DELETE /api/developers/apps/{id}`) | code | ✅ | Owner-only (others get 404), with Edit/Delete in the `/developers` console; delete is a soft delete. Redirect URIs are now validated (https or localhost, no fragment). **Security fix:** the account page rendered third-party app names as raw HTML, so a malicious app could run script against users who authorized it; this and the developer console are now escaped. OAuth tokens can no longer manage developer apps. |
| S7 | Production OAuth third-party publishing smoke test | ops | ⬜ | `done/third_party_publishing.md` "Production Deployment Verification". |
| S8 | Donation UI for content | code | ✅ | "Keep this content available" card on `/info.html` with a live preview; Stripe checkout; thank-you/cancel messages on return. Also fixed: Stripe returned donors to a nonexistent `/content/{cid}`; donations too small to buy a month were charged but added nothing; very small files produced an invalid date, so the webhook failed after payment. Donations now buy whole months (minimum one month, cap 100 years per donation). |
| S9 | Dev-dependency vulnerabilities (wrangler, playwright, sharp, eslint plugins) | code | ✅ | 29 → 3. Upgraded wrangler 4.59 → 4.148, vitest 3 → 5 (clears a critical tinypool RCE advisory; fixed a test mock for it), and madge 6 → 8; removed the unused `@cloudflare/vitest-pool-workers`; replaced fast-glob (vulnerable braces, no fix) with tinyglobby. Remaining: `sharp` via wrangler's miniflare; every wrangler ≥4.16 includes it, and it's only used locally, never deployed. Also fixed the JSDoc report script's broken `espree` import. |
| S10 | Per-IP rate limit on dispute submission (10/hour per plan) | code | ✅ | Counted per hashed IP in hourly buckets in the DisputeIndex, before any other check; returns 429 with `Retry-After`. The report form explains the wait. |
| S11 | Delete button for uploaders on the upload detail page | code | ✅ | Shown only when an authenticated `GET /api/content/{cid}` returns `is_owner`; asks for confirmation, then deletes. Also fixed: that public endpoint returned the uploader's account ID, payer IDs, and the deletion reason (Decision #9 says uploaders stay anonymous); it now returns a public view. Verified in a browser. |
| S12 | Make the Playwright E2E suite runnable and run it in CI | code | ✅ | Added `@playwright/test`; the config starts or reuses `npm run dev:local` (Chromium by default, `E2E_ALL_BROWSERS=1` for all browsers); stale tests updated (protected pages sign in through local auth). `npm run test:e2e`: 25/25 pass. Runs in the PR workflow after the API tests. Also: the pricing calculator now counts whole months like billing does, and two API tests that relied on the old \$2 minimum were rewritten (all 11 API suites pass). |
| S13 | Fix the legacy grep-based shell checks in `npm test` | code | ✅ | `test-api-keys.sh` resolves the repo root instead of `/home/runner/...`; stale patterns in it and `test-upload-balance.sh` updated to the current code; the supplier scripts exited after their first pass (`((n++))` under `set -e`), and two expected messages were stale. `npm test` passes end to end (needs `npm run dev:local` running for the supplier checks). |
| S14 | Track upheld copyright removals per uploader (repeat-infringer policy) | code | ✅ | An admin removal that closes a copyright dispute records a strike (one per CID); `GET /api/admin/repeat-infringers`; the nightly alert fires at 3 strikes in 365 days. Also fixed: upholding a dispute (`PATCH status: closed_deleted`) unblocked the content instead of removing it; it now runs the full takedown. Closing an account is still manual. |
| S15 | Expired disputes unblock their content | code | ✅ | Found 2026-10-23: the nightly job closed disputes after 30 days but never deleted the `{cid}.disputed` marker, so 256t.us kept answering 451, contradicting the FAQ, report form, and DMCA page. It now deletes the marker once the dispute is closed (`src/index-expired-disputes.test.js`). Content blocked by a dispute that already expired stays blocked until its marker is deleted by hand. |
| S16 | Pricing examples and retention wording match billing | code | ✅ | Found 2026-10-23: the pricing page listed 100 MB for a year at $0.36 (billing charges $0.04), 1 MB for a month at $0.00 ($0.01), and 1–5 GB examples over the 90 MB limit; the FAQ said $0.036; the docs said retention is "multiples of 30 days" and "1 year (365 days)", but billing uses calendar months. The FAQ also said re-uploading existing content isn't charged; it is charged as an extension. |
| S17 | Cap prepaid retention; say what happens to it if HashBin shuts down | code/legal | ❓ | Found 2026-10-24: uploads accept any number of months (`src/api/content.js`; donations cap at 1,200), and every prepaid month must keep being paid for in R2. The Terms have no discontinuation clause. **Decide** the cap (e.g. 10 years) and the shutdown terms. |
| S18 | Update Cloudflare prices in cost estimation | code | ⬜ | Found 2026-10-24: `src/utils/cost-estimation.js` uses $0.50 per million Worker requests (now $0.30) and charges $0.015/GB for R2 egress (free), so `/api/admin/profitability` overstates costs. |
| S19 | Copyright disputes shouldn't restore content without a counter-notice | legal/code | ❓ | Found 2026-10-24: every dispute expires after 30 days and S15 then unblocks the content. Restoring noticed content without a valid counter-notice and the statutory wait may cost the DMCA safe harbor for that work (`docs/legal-review.md` item 5). Worth a lawyer's view. |
| S20 | Hourly cost monitor and automatic brake | code/ops | ⬜ | Found 2026-10-24: infrastructure costs are only recorded by hand (`POST /api/admin/costs/record`), the 256t.us Worker records nothing, and spike checks run once a day. Plan: hourly cron, month-to-date usage from Cloudflare's GraphQL Analytics priced from one shared table, compared with revenue after Stripe, alerting through `ALERT_WEBHOOK_URL`; per-file download counts; throttle past a hard limit. **Ops:** a read-only analytics API token. `todo/cost_safety.md` Phases 1 and 5 |
| S21 | Cloudflare usage-based billing notifications | ops | ⬜ | Cloudflare has no hard spending cap. Set notifications for Workers requests and CPU, R2 class B and storage, and Durable Objects near the free allowances. `todo/cost_safety.md` Phase 0 |
| S22 | Cache 256t.us downloads and cut R2 reads per download | code | ⬜ | Found 2026-10-24: responses say `immutable` but nothing is cached (no `cf-cache-status`; the Worker runs before the cache), so every download does four R2 reads. Use the Cache API with a short TTL or purge-by-URL so takedowns still land, and move the deleted/disputed flags into `.meta`. `docs/decisions/edge_cache.md` assumes caching that doesn't happen. `todo/cost_safety.md` Phase 2 |

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
| B9 | Enforce per-content download allowances (MTBR) on 256t.us | code | ❓ | **Superseded by L22 (2026-10-24),** which ties allowances to paid storage instead of this default; the cost estimate there replaces the earlier $1,070 a year. Found 2026-10-23: the MTBR check and purchase API exist, but only `handleDownloadContent` enforces them, and that handler answers only in local development; 256t.us applies just its per-IP limit. **Decide first:** the default (one request per 30 days for 30 days, then none) is global per CID, and 256t.us runs on every request, so enforcing it as is would let a new file be downloaded about once a month. `done/content_rate_limit.md`, `docs/decisions/edge_cache.md` |
| B10 | Alternate-supplier fallback on 256t.us | code | ⬜ | Found 2026-10-23: redirect/proxy to verified suppliers also lives only in `handleDownloadContent`. The 256t.us worker reads only R2, so it needs the supplier list there (or a binding to ContentMetadata). `done/support_cid_redirects.md` |

---

## What's done

The backend for each of these is implemented and covered by unit tests (`npm run test:unit`:
362 passing, 2 skipped; plus 25 Playwright E2E tests and 11 local API suites, as of 2026-10-07). "Done" means implemented, not tested in
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
