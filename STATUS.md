# HashBin.org Project Status

**This file is the single source of truth for project status.** If another document
disagrees with it, this file wins and the other document is stale.

- **Last audited:** 2026-11-25 (rows checked against the code, the docs and the live sites; live acceptance items were not rerun)
- **Production:** `https://hashbin.org`, `https://256t.us` and `https://hashbin.app` deploy on every push to `main`. The first-party editors on `*.hashbin.page` (plus `pages.hashbin.us`) and the AI credential host `ai.hashbin.page` deploy when the owner dispatches their workflows. Only Python Online is enabled on the run domain.
- **Overall:** Feature-complete for an MVP backend. **Not ready to accept customers** — see the launch blockers below.

Run `npm run status` for a one-screen summary of open items.

---

## How this file works

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and verified |
| 🚧 | In progress |
| 🟨 | Implemented; live acceptance or an owner step remains (see notes) |
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
| L1 | Production Clerk keys (`sk_live_`/`pk_live_`) in GitHub secrets | ops | 🟨 | Production Clerk instance on `clerk.hashbin.org` with Google and GitHub sign-in; webhook delivering; `/health` healthy; the owner's account is on its production user ID. Left: GitHub, linking and mobile browser checks (CL10). `todo/clerk_remaining.md` |
| L2 | Stripe live mode: live secret key, live webhook endpoint + secret | ops | ✅ | Live key and webhook secret in production; the live endpoint `https://hashbin.org/api/payments/webhook` receives `checkout.session.completed`, `checkout.session.expired` and `charge.dispute.created`. `docs/payments-setup.md` |
| L3 | Health check flags Stripe test keys in production (like it does for Clerk) | code | ✅ | `/health` → `checks.stripe.details.usingTestKeysInProduction`. |
| L4 | `256t.us` DNS, TLS, and content worker live | ops | ✅ | `https://256t.us` is served by the content Worker on Workers custom domains (DNS record and certificate created on deploy). |
| L5 | Real Terms of Service | legal | 🚧 | Draft in `frontend/terms.html`, marked DRAFT. Owner: fill in placeholders, confirm the policy choices, remove the DRAFT notice. Owner decision: no lawyer review for L5–L7 and L19–L20. Checklist: `docs/legal-review.md`. |
| L6 | Privacy Policy | legal | 🚧 | Draft in `frontend/privacy.html`, marked DRAFT. Same checklist. Reporter contact details are visible to signed-in users. |
| L7 | DMCA designated agent registered, with contact info on the site | legal/ops | 🚧 | `frontend/dmca.html` drafted (notice and counter-notice requirements, repeat-infringer policy). Owner: register the agent with the U.S. Copyright Office and fill in agent details; set up NCMEC CSAM reporting. See `docs/legal-review.md`. |
| L8 | Public UI for reporting content (dispute submission + open disputes list) | code | ✅ | `/disputes/submit.html`, `/disputes/index.html`, `/disputes/view.html?cid=`, a dispute notice and "Report this content" link on `/info.html`, links from the FAQ, footer and sitemap; `/public-records.html` lists deletion records. 256t.us returns 451 for disputed and 404 for deleted content. |
| L9 | Upload size limit matches reality | code | ✅ | **Decision: cap at 90 MB.** Enforced server-side (`src/utils/upload-limits.js`, 413 before buffering), in the upload UI and docs, and published as `max_upload_bytes` in `/api/config`. Larger files are B6. L11 should include an upload near 90 MB. |
| L10 | Metadata backups: daily snapshots | code | ✅ | **Decision: nightly snapshots (RPO 24h).** `BackupIndex` and the 02:00 UTC cron snapshot every stateful Durable Object to `hashbin-backups-prod`, keeping 30 runs; admin API and `scripts/backup/restore-snapshot.mjs` restore. Stale or failed runs raise a critical alert. Runbook: `docs/backup-and-restore.md`. **Ops:** record production evidence of a completed run with `failed: 0` (`todo/deployment_checklist.md`). |
| L11 | End-to-end production test: real OAuth login, real deposit, upload, download from 256t.us, dispute, deletion | ops | 🚧 | Passed in production: Google sign-in, a live $1.00 deposit credited by the webhook, upload, unchanged download from `https://256t.us/{cid}`, dispute block (451) and deny (200), uploader delete (404); alias claim, renewal, personal override, transaction history and anonymous redirect/inline download. **Remaining:** rerun sign-in on the live Clerk instance (L1); a paid two-account alias sale and identified redirect (B17), which needs a second funded account. |
| L13 | Extend retention from the dashboard | code | ✅ | Extend Retention card on `/dashboard/uploads/{cid}`: quote from `/api/payments/calculate`, confirmation, then `POST /api/content/{cid}/extend`. |
| L14 | No known vulnerabilities in runtime dependencies | code | ✅ | `npm audit --omit=dev` reports zero vulnerabilities and gates deployment. |
| L15 | Content deletion and dispute moderation work in production | code | ✅ | `DELETE /api/content/{cid}` and the admin dispute API work in production. Admin endpoints take the `ADMIN_USER_ID` session or a scoped `hba_` admin key. Runbook: `docs/ADMIN_SYSTEM.md` → Content Moderation. |
| L16 | Upload and supplier detail pages reachable from their lists | code | ✅ | The Worker serves `/dashboard/uploads/{cid}` and `/dashboard/suppliers/{id}` from their `detail.html` pages without losing the ID. |
| L17 | Pricing consistent across code, UI, and docs | code | ✅ | **Decision: no minimum charge; cost rounds up to the next cent** (master plan Decision #16). |
| L18 | Signed-in pages that call the API at load work with Clerk | code | ✅ | `frontend/js/auth.js` initializes Clerk once and `getSessionToken()` waits for it, so pages that call the API on load work. |
| L19 | TAKE IT DOWN Act removal process for non-consensual intimate images | code/legal | 🟨 | An "Intimate image shared without consent" reason on `/disputes/submit.html` (signature, good-faith statement, contact) blocks the content at once, never expires, replaces any other open dispute and skips the re-report cooldown; details are admin-only. A critical alert fires on filing and hourly once a report is within 24h of its 48-hour deadline; the admin page lists these first. Upholding removes the CID and blocks re-upload. Notice at `/take-it-down.html`, linked from the form, footer, Terms §6, Privacy, DMCA, FAQ and sitemap. **Left:** set `ALERT_WEBHOOK_URL` (S3); confirm the notice wording (`docs/legal-review.md` item 8). Runbook: `docs/ADMIN_SYSTEM.md`. |
| L20 | Card fee on deposits: clear, accurate wording | legal/code | 🟨 | **Decision: pass Stripe's fee through, worded clearly wherever prices appear.** Checkout itemizes "HashBin balance credit" and "Card payment cost"; the deposit page, Terms §3, pricing page, home page and transaction history explain it, and `/docs/deposits.html` has a calculator (shared `frontend/js/deposit-math.js`, tested against the server's `grossUp`). A $1 credit costs $1.34; accounts under 30 days old have a $20-per-checkout cap. **Open:** whether card-network surcharge rules (Visa's 3% cap, no surcharges on debit cards) apply. `docs/cost-safety.md` |
| L21 | Form the operating entity and move accounts into it | ops/legal | ⬜ | Recommended: a Missouri single-member LLC ($50 online, no annual report). Then EIN, business bank account, and Stripe, Cloudflare, Clerk, domains and the DMCA registration in its name. Supplies `[LEGAL ENTITY NAME]` for L5–L7. Costs, risks and the reserve: `docs/business/`. |
| L22 | Bound what one file can cost: download allowances tied to paid storage | code/ops | 🟨 | Prepaid reservations across isolates, capped by the storage reserve; target 2,000/paid GiB-month and a 5,000 minimum where affordable. Cache hits consume allowance; exhaustion returns 429; bandwidth purchases prepay counts at ≥ $4/M. **Left:** WAF rule and live acceptance (`todo/cost_safety_cloudflare.md`). `docs/cost-safety.md` |
| L23 | Only invited people can create accounts | ops | ⬜ | Production sign-up is open to any Google or GitHub account; the beta banner is the only warning. **Decision: Clerk's Restricted sign-up mode**, inviting each user; no app-side gate. Steps: `todo/clerk_remaining.md` CL16. Lift it when the banner comes down (L12). |
| L12 | Remove "Unstable Beta — Do not use" banner | code | ⬜ | `frontend/js/banner-config.js`. Do last. |

## Soon after launch

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| S1 | R2 cleanup of soft-deleted content | code | ✅ | Deletions queue the CID in the DeletionRecord; the daily cron removes the bytes after 24h (200 per run; the `.deleted` marker stays). Re-uploading, extending or donating to deleted content returns 410 before charging. |
| S2 | Clerk webhook endpoint `POST /api/webhooks/clerk` | code | ✅ | Svix-verified; `user.deleted` soft-deletes the profile and disables its API keys; `user.created`/`updated` ensure a profile exists. Configured in production (L1). |
| S3 | Operator alert delivery (email/webhook) | code | ✅ | **Decision: generic webhook.** New alerts POST to `ALERT_WEBHOOK_URL` (Slack/Discord-compatible JSON); `POST /api/admin/alerts/test` checks delivery. **Ops:** create the webhook and set the `ALERT_WEBHOOK_URL` GitHub secret. |
| S4 | Admin dispute review UI | code | ✅ | `/admin/disputes.html` (admin sign-in only): open disputes with reporter contact and evidence; under review, deny and uphold (takedown with a public reason); repeat-infringer list. |
| S5 | Deletion transactions shown in transaction history | code | ✅ | "Content Deletion" rows with the reason and closed dispute, plus a filter option. |
| S6 | Developer app update/delete (`PATCH`/`DELETE /api/developers/apps/{id}`) | code | ✅ | Owner-only (others get 404), with Edit/Delete in the developer console; delete is a soft delete. Redirect URIs must be https or localhost with no fragment. App names are HTML-escaped everywhere they're shown. OAuth tokens can't manage developer apps. |
| S7 | Production OAuth third-party publishing smoke test | ops | ⬜ | `done/third_party_publishing.md` "Production Deployment Verification". |
| S8 | Donation UI for content | code | ✅ | "Keep this content available" card on `/info.html` with a live preview and Stripe checkout. Donations buy whole months (at least one), within the 10-year retention cap (S17). |
| S9 | Dev-dependency vulnerabilities (wrangler, playwright, sharp, eslint plugins) | code | ✅ | Runtime dependencies are clean (L14). Dev-only advisories remain, chiefly `sharp` through wrangler's miniflare, which is never deployed; GitHub's Dependabot lists the current set. |
| S10 | Per-IP rate limit on dispute submission (10/hour per plan) | code | ✅ | Counted per hashed IP in hourly buckets in the DisputeIndex, before any other check; returns 429 with `Retry-After`. The report form explains the wait. |
| S11 | Delete button for uploaders on the upload detail page | code | ✅ | Shown only when an authenticated `GET /api/content/{cid}` returns `is_owner`; asks for confirmation. The public view of that endpoint omits uploader and payer IDs and the deletion reason. |
| S12 | Make the Playwright E2E suite runnable and run it in CI | code | ✅ | `npm run test:e2e` starts or reuses `npm run dev:local` (Chromium; `E2E_ALL_BROWSERS=1` for all) and runs in the local API workflow and deploy CI. |
| S13 | Fix the legacy grep-based shell checks in `npm test` | code | ✅ | `npm test` runs them after the unit tests; the supplier checks need `npm run dev:local`. |
| S14 | Track upheld copyright removals per uploader (repeat-infringer policy) | code | ✅ | An admin removal that closes a copyright dispute records a strike (one per CID); `GET /api/admin/repeat-infringers`; the nightly alert fires at 3 strikes in 365 days. Closing an account is manual. |
| S15 | Expired disputes unblock their content | code | ✅ | The nightly job closes non-copyright disputes after 30 days and deletes the `{cid}.disputed` marker (`src/index-expired-disputes.test.js`). |
| S16 | Pricing examples and retention wording match billing | code | ✅ | Pricing page, FAQ and docs use billing's calendar months, whole-cent rounding and the 90 MB limit; re-uploading existing content is charged as an extension. |
| S17 | Cap prepaid retention; say what happens to it if HashBin shuts down | code/legal | 🟨 | Outstanding retention is capped at 10 years across uploads, extensions, donations and DO enforcement. Terms §7A: 30 days' notice of a shutdown, downloads and an account-data copy during it, and a refund of remaining balance; prepaid storage and alias terms past shutdown are not refunded. Closing an account without cause refunds the balance (§7). **Left:** the legal pages are still drafts (L5). `docs/cost-safety.md` |
| S18 | Update Cloudflare prices in cost estimation | code | ✅ | Shared prices in `src/utils/cost-policy.js`: $0.30/M Workers, free R2 egress, class A/B, CPU and DO rates. Estimates and hourly monitor share it; download costs scale by request count. |
| S19 | Copyright disputes shouldn't restore content without a counter-notice | legal/code | ✅ | **Decision: copyright reports never expire.** Content stays blocked until an admin decides. A recorded counter-notice (`PATCH /api/admin/disputes/{cid}` `action: counter_notice`, or the admin page) restores the content 12 weekdays later unless a court action is recorded first. DMCA §2–3, Terms §6, FAQ and the report pages say so. Open owner question on deleting upheld content: `docs/legal-review.md` item 5. |
| S20 | Hourly cost monitor and automatic brake | code/ops | 🟨 | Hourly GraphQL cost monitor with retry-safe monthly snapshots and 93-day history, completed-month refreshes, sampled per-file counts, $25/$50 alert and brake, monthly kept revenue, the `/admin/costs` page, and export/invoice reconciliation. Delivery and reservations fail closed on invalid safety state. **Left:** external setup and live evidence in `todo/cost_safety_cloudflare.md` CF1–CF10 and `todo/cost_safety_stripe.md` ST1–ST5. Runbook: `docs/cost-safety.md` |
| S21 | Cloudflare usage-based billing notifications | ops | ⬜ | Check the account's eligibility for Workers/R2/DO usage notifications before configuring thresholds (Cloudflare lists them for Professional-or-higher pay-as-you-go accounts). Record any gap and the owner's monitoring or plan decision. There is no hard spending cap. `todo/cost_safety_cloudflare.md` CF6 |
| S22 | Cache 256t.us downloads and cut R2 reads per download | code/ops | 🟨 | Explicit Cache API (max 1 hour, bounded by expiry), two reads for v2 metadata, legacy markers and serialized availability writes. Reservations recheck takedowns every minute. Local cache tests pass; regional acceptance remains. `docs/decisions/edge_cache.md`. |
| S23 | Availability statistics: served versus 429 per file, visible from every 429 and to everyone who paid to store or serve it | code | ⬜ | Planned: batched per-isolate counts reported with existing reservations, hourly/daily buckets in ContentMetadata, public per-file totals (hourly detail and cost-to-cover for payers), a per-user paid-content index including funded downloads, an availability page, `Link` and reason headers on 429s. WAF 429s are not counted, and the page will say so. `todo/availability_stats.md` |
| S24 | devicebasedauth.org device-bound keys and account linking | code/ops | 🟨 | Done in code: vendored verifier; `Authorization: DBA` + DPoP and DBA access tokens act as the linked user with their `hashbin:` scopes (including `downloads:spend`), verified offline and failing closed; per-credential spend caps; OIDC linking (`DbaLink`); online `/authorize` for gated grants when `DBA_API_KEY` is set; revocation webhook `POST /api/dba/events` (`DbaRevocations`); cross-isolate DPoP replay cache; renewals and download links stop on revocation; any-origin CORS; credentials listed on Account Settings. **Ops:** register the webhook at DBA and fund the operator account; optionally set `DBA_API_KEY`; live check. `todo/dba_integration.md`, `docs/devicebasedauth.md` |
| S25 | Sign in with devicebasedauth.org (Stage A: Clerk custom OIDC provider; Stage B: device-bound sessions) | ops | 🟨 | Stage B done in code: `hashbin:session` credentials are device sessions that reach session routes except `ACCOUNT_SESSION` ones (minting credentials, ending the account). Stage A is a Clerk dashboard setting (check the plan supports custom OIDC providers). `todo/dba_integration.md` |

## Backlog (not needed for launch)

| ID | Item | Owner | Status | Notes / reference |
|----|------|-------|--------|-------------------|
| B1 | Payer ↔ contester messaging, email notifications, paid moderation (Decision #19) | code | ⬜ | `todo/content_moderation.md`, `todo/user_stories.md` |
| B2 | Tiered automated/AI dispute escalation and appeals | code | ⬜ | `todo/content_dispute_resolution.md` |
| B3 | npm distribution of `hashbin-sdk` | code | ⬜ | `done/third_party_publishing.md` |
| B4 | Developer webhooks and bulk operations | code | ⬜ | `todo/user_stories.md` (API Developers) |
| B5 | Peer-to-peer balance transfer | legal | ❓ | `todo/balance_transfer.md` — undecided whether it should exist |
| B6 | Uploads larger than 90 MB (multipart, up to R2's limits) | code | ⬜ | Follows the L9 decision |
| B7 | Sample third-party integration app | code | ✅ | Textpad in three versions: web (`frontend/docs/textpad/app.html`), Expo and Flutter (`examples/`), each with a walkthrough at `/docs/textpad*.html` generated by `scripts/docs/generate-textpad-docs.py`. |
| B8 | Append-only event log to R2 for every state change (Decision #15, RPO ≤1h) | code | ⬜ | Deferred by the L10 decision |
| B9 | Enforce per-content download allowances (MTBR) on 256t.us | code | ✅ | Replaced by L22 prepaid reservations. MTBR pacing remains only in the local-development download handler. `docs/api-rate-limiting.md` |
| B10 | Alternate-supplier fallback on 256t.us | code | ⬜ | Redirect/proxy to verified suppliers exists only in the main Worker's local-development `handleDownloadContent`. The 256t.us Worker needs the supplier list (or its ContentMetadata binding) to do it. `done/support_cid_redirects.md` |
| B11 | Funded downloads: no 429 for accounts and keys with download budget left | code/ops | 🟨 | Done in code: account, key and grant budgets; serialized prepaid leases; scoped OAuth; signed links; revocable browser sessions; protected paths; brake bypass and hard stop; an ordered accounting outbox; cost monitoring. Unit tests and the native two-Worker acceptance (`npm run test:funded:local`) gate deployment. **Left:** WAF rule and live acceptance in `todo/cost_safety_cloudflare.md`; Stripe items in `todo/cost_safety_stripe.md`. `todo/funded_downloads.md` |
| B12 | Least-privilege keys: every credential holds only declared scopes and caveats | code/ops | ✅ | Route table with default deny; scoped, hash-only `hbk_` API keys (90-day default); caveats (spend limit, retention, size, types, CIDs, grant expiry) with one monthly spend limit per key or grant; user-narrowed OAuth consent, per-install grants, single-use codes; scoped `hba_` admin keys; per-purpose HKDF signing keys. Only deleting two unused secrets remains (owner). `todo/scoped_keys.md` |
| B13 | Browser client safety: no JavaScript-readable tokens on shared origins, CID-verifying SDK, hosted per-save approval | code/ops | 🟨 | Deployed on hashbin.org: hosted per-save approval, DPoP allowances, CID-verifying SDK, refresh-token reuse detection and client binding, upload price ceilings, shared-origin acknowledgment, per-grant activity and revoke-all, versioned SDK with SRI, and guidance. First-party editors moved to their own origins: `pages`, `python`, `manim`, `gnuplot`, `sheets`, `modl`, `diagram`, `upload`, `textpad`, `audio`, `r`, `livelier`, `apptron`, `gripeline` and `slides` on `*.hashbin.page`, with the Pages preview on `pages.hashbin.us`; each has a canonical callback, response policies and safe draft recovery, and the app safety report shows only Gnuplot's worker advisory. **Left:** live Clerk sign-in in Safari and Firefox; Gnuplot's worker isolation. `docs/owned-app-hosting.md`, `todo/browser_client_safety.md` |
| B14 | Security notes and case studies: published record of problems, detection, demonstration and fixes; HashBin-first remedies | docs/code | 🟨 | Security notes SN-2026-001–009 and the app safety checks are published. The hosted sandbox runs on `hashbin.app` with registry controls, a 20k/day app cap, a $5/month brake and SDK v0.4.0; Python Online's opt-in persistent home passes live persistence and isolation checks. **Left:** runtime pins, PSL eligibility (`hashbin.app` expires 2027-10-28), Firefox restart and Safari retention measurements. H6 customer hosting is planned. `docs/hosted-run-origin.md`, `todo/hosted_run_origin.md`, `todo/app_hosting.md`, `todo/security_case_studies.md` |
| B15 | Automate the production deployment checklist | code/ops | 🟨 | Deploy CI gates on the audit and all local acceptance suites, checks required secrets and live key modes before any Cloudflare write, and runs `npm run verify:production` (health, commit/HTML consistency, content health, auth and webhook refusals, HTTPS redirects, security headers, hosted-origin security); the smoke workflow runs it every six hours. **Left (owner):** provider and legal acceptance, deleting retired secrets, live browser checks and production backup evidence (`todo/deployment_checklist.md`). |
| B16 | Dedicated page for a developer's apps, with search, sorting and filters | code | 🟨 | `/developers/apps` lists every app with search, sorting and filters kept in the URL, and expands a row for edit, hosted sandbox, safety check and delete; `/developers` keeps registration, counts and the five latest apps. **Left:** a look with real apps. |
| B17 | Aliases: global (yearly fee, bought and sold for balance) and personal (owner-only override) names for CIDs, resolved at `256t.us/@{name}` | code | ✅ | $1/year global names, prepaid 1¢/month personal overrides, 10% seller fee (10¢ minimum), listings and held offers, retry-safe accounting, renewal and expiry, scoped APIs, cost brake, dashboard and public history, moderation, backups and SDK v0.5.0. Owner policies: no shutdown refund; upheld trademark reports only suspend. Live claim, renewal, personal override and anonymous redirect pass; the two-account sale is in L11. `done/aliases.md` |
| B18 | gripeline pipeline editor dedicated hosting and Publish | code/ops | ✅ | `https://gripeline.hashbin.page/` is deployed with registered client `app_dc8bf51a-ebee-4ef0-879e-1cccbfc1a01b`, source-only draft recovery and a passing real paid save. `docs/owned-app-hosting.md` |
| B19 | Separate AI credential host for opt-in Fragment Kit clients | code/ops | ✅ | `ai.hashbin.page` serves four immutable entries: `/v0.4.0/` (Python), `/v0.4.3/` (R), `/fleet-v0.4.3/` (nine editors) and `/slides-v0.4.4/` (Slidev Online, deployed 2026-11-25). Every deploy preserves earlier entries byte for byte; Chromium, Firefox and WebKit pass key and PKCE handoff, consent, Forget and stale-popup checks with mocked providers. Native Safari is unverified. `docs/ai-host.md` |
| B20 | Opaque DOM execution in the browser SDK | code/ops | 🟨 | SDK v0.6.0 with opt-in `execution: 'frame'` (opaque origin, private message port, parent fetch proxy) is live at `/sdk/v0.6.0/` with matching integrity hashes. Fragment Kit v0.4.4 vendors it, and Slidev Online is deployed on `slides.hashbin.page` with that kit. **Left:** live acceptance of DOM mode in Slidev Online; Slidev's own fidelity and performance gates are tracked in its repository. `todo/opaque_dom_sandbox.md` |
| B21 | Work down the file size ratchet | code | ✅ | Per-type size limits run in the pre-push hook, unit tests and deploy CI (`scripts/check-file-sizes.mjs`); the baseline is empty. The split Diagram Editor is deployed (owned-app run 45635242813). |

---

## What's done

The backend for each of these is implemented and covered by unit tests (`npm run test:unit`),
Playwright browser tests and the local API suites. "Done" means implemented, not tested in
production with live credentials (that's L11).

| Area | Plan(s) |
|------|---------|
| Infrastructure, CI/CD, health checks, build reports | `done/site_creation.md`, `done/deployment_validation.md`, `done/health_validation.md`, `done/only_production.md` |
| 256t addressing, upload, download, inline content, range requests | `done/upload.md`, `done/download.md`, `done/download_extended.md` |
| Content served from a separate origin (`256t.us`) | `done/content_domain_separation.md` |
| Clerk auth, API keys (backend and UI), account deletion with 2FA | `done/user_authorization.md`, `done/api_keys.md`, `done/key_management_ui.md`, `done/account_management.md`, `done/login.md` |
| Stripe deposits, balance, pricing, transaction history | `done/payments.md`, `done/stripe.md`, `done/add_to_balance.md`, `done/user_transaction_history.md` |
| Personal/global CID aliases, paid renewal, marketplace and moderation | `done/aliases.md` |
| Download allowance purchases (originally per-content MTBR, now prepaid counts; see B9) | `done/content_rate_limit.md`, `done/content_rate_limit_ui.md` |
| Expiration cron job, deletion records, public deletion API | `done/content_lifecycle_complete.md` |
| Dispute and deletion backend, admin moderation API | `todo/content_moderation.md` (Phases 1–5) |
| Admin stats, alerts, audit log, cost tracking | `done/system_management.md`, `done/track_and_predict_expenses.md` |
| OAuth 2.0 + PKCE third-party publishing, hosted SDK, developer console | `done/third_party_publishing.md` |
| Navigation, site map, docs pages, public records page | `done/navigation_discoverability.md`, `done/frontend_ui.md` |
| Fully local development mode and local API test suites | `done/running_fully_local.md`, `done/local_API_tests.md` |

## Other planning documents

- `todo/master_plan.md` — vision, architecture, and the 21 architectural decisions (phase status points here)
- `todo/<plan>.md` — one plan per open STATUS row; each row's notes name its plan
- `docs/README.md` — index of operator and developer documentation
- `todo/user_stories.md` — per-story UI/API status
- `todo/deployment_setup.md`, `todo/deployment_checklist.md`, `docs/deployment.md` — deployment how-to
