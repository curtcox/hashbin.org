# Security notes and case studies

## Status

**Phase:** Parts 1 and 2 done and H1–H4 built 2026-10-28 (local; deploy pending). Row B14 in `STATUS.md`.

- **Record:** `/docs/security/` with SN-2026-001–009. SN-001/002 (the case studies), 005, 006 and 007 are
  `fixed`; 004 is open; 003 and 008 fixed; 009 accepted. `src/docs-security-notes.test.js` checks the index.
- **Case studies:** Python Online and Manim Online run all user code through `createSandbox()`. Their browser
  suites assert the code's origin is `null` (Chromium and WebKit; Firefox not run here). The ask-before-run
  stopgap (step 3) was dropped because the fix shipped in the same pass. Demonstration material is limited to
  that regression check.
- **SDK v0.3.0** (`frontend/sdk/v0.3.0/`, `hashbin.js` and `hashbin-cache.js`): H1 `createSandbox()`;
  H2 `hashbin-cache.js` verified cache; H3 `clientState` on publish errors, automatic redirect when
  `crossOriginIsolated`, `popup_severed` error code, and a file handoff above 512 KiB (Publish page accepts
  only a file matching the recorded CID).
- **Clients:** Python and Manim vendor v0.3.0 (SRI-checked) and use `hashbin-cache.js`; Pages, Gnuplot,
  Sheets and apptron pin `https://hashbin.org/sdk/v0.3.0/hashbin.js`. All six dropped their pending-save
  copies; apptron dropped its manual-upload message. Gnuplot and Sheets service workers still use their own
  (equivalent) verification code; adopting `hashbin-cache.js` there is optional cleanup.
- **H4:** `src/app-safety.js` and `src/api/app-safety.js`: per-app check on the developer page
  (`GET`/`POST /api/developers/apps/:id/safety`) and nightly for the 20 least recently checked apps.
- **H5/H6:** plans below; not started, pending cost and abuse review.

## Goals

1. Publish, with the HashBin docs, a record of security problems found in HashBin and in
   HashBin clients: what was wrong, how it was detected, how it can be demonstrated and
   how it was or can be fixed.
2. Start with PythonOnline and ManimOnline as case studies, and fix both.
3. Keep the record living: problems found while HashBin is used get entries, and the
   avoidance guidance is updated.
4. **HashBin first.** Every entry answers "Can HashBin remove this for every client?" When
   it can, that is the primary fix; per-client changes are stopgaps or fallbacks.

## Part 1: the published record

| Page | Path | Contents |
|---|---|---|
| Security notes index | `frontend/docs/security/index.html` → `/docs/security/` | Purpose, the HashBin-first rule, an entry table (ID, title, affected, status, HashBin-side fix?), how to report a problem |
| One page per entry | `frontend/docs/security/sn-YYYY-NNN.html` | The template below |
| Avoidance guide | existing `/docs/browser-client-safety` | Gains a "Known pitfalls" list linking each entry |

Link the index from the docs index banner, sitemap, developer registration page, SDK guide
and the browser client safety page. Match `browser-client-safety.html` styling; wrap
tables for horizontal scroll and check 375 px width. Add a test that every `sn-*.html`
appears on the index and every index link resolves.

**Entry template:** Summary · Facts (ID, found/mitigated/fixed/published dates, affected
versions, severity, status `open`/`mitigated`/`fixed`/`accepted`, commits) · What was
wrong · How it was detected (and what would have caught it sooner) · How it can be
demonstrated (a local harness with test data only, never live users' data; it doubles as
the regression test) · How it was fixed (HashBin-side / client-side / rejected options) ·
How to avoid it · Lessons.

**Disclosure rule:** analysis and the fix plan publish when an entry opens. Demonstration
material for a live shared origin publishes only after the fix ships (or 30 days after the
affected owner is told). Third-party owners are told before their entry opens.

**Living process:**
- **Intake:** reviews, test failures, reports (address on the index), incidents, and the automated client checks in Part 3.
- **Triage:** every finding gets an ID and a written HashBin-first answer.
- **Updates:** when a fix ships, update the entry's status, add the regression test and adjust the guide.
- **Review:** open entries are reviewed alongside `STATUS.md`.

## Part 2: first case studies

**SN-2026-001 PythonOnline** and **SN-2026-002 ManimOnline** share one cause. Code from a
link runs automatically: PythonOnline's Auto-run and ManimOnline's render on load. It runs
in a dedicated worker on `curtcox.github.io`, the origin every curtcox app shares, so it
is not isolated from those apps' origin-wide browser storage. Found during the
2026-10-28 C3 review by asking of each app: "Where does untrusted code run, and with
which origin?" No exploitation or report is known. Since C1 no curtcox app holds a
HashBin credential, which limits the impact.

Steps:

1. **Analyse.** Write each entry's "what was wrong" precisely from the code, with an
   isolation test matrix: Chromium, WebKit and Firefox, for both apps. Confirm what the
   worker can and cannot reach and how the editor treats messages from it. Record the
   severity.
2. **Build the regression harness.** A local-only Playwright check with test data
   that asserts user code cannot reach the editor origin's storage. It fails today and
   must pass after the fix. Write the published "how it can be demonstrated" section from
   this harness.
3. **Interim mitigation.** Ask before running code that arrived by link
   ("Run code from this link?"), and remember the choice per document fingerprint for the
   tab. It reduces drive-by runs; it is not the fix.
4. **Fix: opaque-origin execution.** Run the Pyodide worker from inside a
   `sandbox="allow-scripts"` iframe (no `allow-same-origin`), using a blob-URL worker.
   Neither app needs SharedArrayBuffer, which makes this feasible. The editor fetches the
   runtime and packages from its verified cache and passes them in as bytes, so offline
   use and C4 cache verification survive. Messages cross only the existing
   validated channel. Spike in PythonOnline first (stdin, turtle, matplotlib, micropip,
   `t256`, timeouts), then ManimOnline (frames, MathJax/Typst stay in the editor).
5. **Rejected or partial options, documented:**
   - Removing Pyodide's JS bridge from Python is not a security boundary.
   - An origin per app (section B of `browser_client_safety.md`) protects sibling apps but not the app's own storage. It complements the fix rather than replacing it.
6. **Publish** both entries as `fixed` with commits, the harness and before/after results.
   Add the pitfall "untrusted code on a shared origin" to the guide.

## Part 3: HashBin-side work (preferred)

Ordered by value per cost. Each item becomes, or closes, a security-notes entry.

| # | Item | Removes for customers |
|---|---|---|
| H1 | **SDK sandbox helper.** `createSandbox()` in the pinned SDK: an opaque-origin iframe and blob worker with a validated message channel, extracted from the Part 2 fix | Hand-rolling isolation for user code (C3) |
| H2 | **SDK verified-cache helper** for service workers: SHA-256 manifest checks before storing or serving, pinned CDN hashes, lockfile-verified packages; generalised from the four implementations written for C4 | Cache poisoning on shared origins |
| H3 | **SDK publish fixes found during C1:**<br>• return `clientState` with errors, so cancelled redirects restore without app-side copies<br>• detect a severed opener (COOP) and fall back to redirect automatically<br>• a larger redirect handoff (for example a file chooser on `/publish`), so isolated apps are not capped at 512 KiB | Per-app pending copies, COOP failures, manual uploads |
| H4 | **Registered-app safety check** on the developer page and on a schedule: shared origin, CSP present and strength (inline script, script hosts), service-worker cache verification, where untrusted code runs, SDK pinning. Findings feed intake | Unnoticed regressions; customers' blind spots |
| H5 | **Hosted isolated run origin**: a HashBin-operated origin (on its own registrable domain, apart from `hashbin.org` sessions), with a subdomain per registered app, serving pinned runtimes by CID for H1 to embed | Needing an own origin to isolate user code |
| H6 | **Per-app hosting from CIDs**: serve a registered app's static bundle at its own HashBin-provided origin | Section B (origin per app) without DNS or orgs |

H1–H3 are SDK work. Release them as a new immutable SDK version, then migrate the six
clients and delete their local copies. H4 is server and UI work. H5 and H6 need cost,
abuse and moderation review before they are committed to, and their own plans.

## Backlog entries to open from the 2026-10-28 rollout

Retroactive entries, mostly short, to seed the record:
- JavaScript-readable tokens on shared origins (fixed by A1/C1).
- A meta CSP also binds `srcdoc` previews (Pages; open, needs a preview origin).
- COOP severs the Publish popup (apptron; H3).
- The SDK drops `clientState` on cancellation (H3).
- Redirect handoff limit of 512 KiB (H3).
- Local Worker runs need `OAUTH_SIGNING_KEY` (dev setup; document it in `wrangler.local.toml` or `.dev.vars.example`).
- DOMPurify's inert parse raising CSP reports (test noise; guidance only).

## Order of work

1. Part 1 pages with the template, the backlog entries above and Part 2's entries opened
   with analysis.
2. Part 2 steps 1–3 for both apps.
3. Part 2 step 4 (PythonOnline, then ManimOnline) together with H1, so the fix is the
   SDK helper rather than two hand-rolled copies.
4. H3 and H2 in the same SDK release. Then migrate the clients.
5. H4. Then decide on H5/H6.

## H5 plan: hosted isolated run origin

Only needed for code that must run with a stable origin of its own (persistent storage for the sandboxed
code, or APIs an opaque origin lacks). `createSandbox()` covers the current apps without it.

1. **Domain.** Register a separate registrable domain (not a `hashbin.org` subdomain), listed on the Public
   Suffix List so each `<app>.<domain>` is its own site for cookies and storage partitioning.
2. **Serving.** A Worker serves only immutable files addressed by CID (pinned runtimes such as Pyodide, and the
   SDK's frame document), with `Cross-Origin-Resource-Policy: cross-origin`, a strict CSP, no cookies and no
   HashBin session.
3. **SDK.** `createSandbox({ origin: 'hosted' })` frames `https://<app_id>.<domain>/frame/<cid>` instead of
   `srcdoc`, so the sandbox has a stable per-app origin and its own service worker for offline use.
4. **Abuse and cost.** Serve only CIDs on an allow-list (runtimes HashBin pins) plus content registered apps
   publish; per-app request quotas; a kill switch per app; R2 egress estimate before launch.
5. **Open:** storage partitioning when framed from `*.github.io` (Safari, Firefox) may make per-app storage
   per-embedder anyway; measure before committing.

## H6 plan: per-app hosting from CIDs

1. **Model.** A registered app publishes a manifest CID (path → CID map). HashBin serves it at
   `https://<app_id>.<apps-domain>/` (same PSL-listed domain family as H5, separate from H5's run origin).
2. **Updates.** The developer page sets the current manifest CID; old manifests stay addressable for rollback.
   Users see a stable origin, so drafts survive releases.
3. **Safety.** Default CSP and `X-Content-Type-Options` headers; no HashBin cookies; the H4 check runs on every
   manifest change.
4. **Costs and moderation.** Hosted bytes count against the developer's balance like other content; abuse
   reports and takedown use the existing dispute flow; rate limits per app.
5. **Migration.** For github.io apps, ship a build that copies drafts to the new origin through a one-time
   export link before switching (see the guide's migration advice).
6. **Decision needed:** whether HashBin wants to be an app host at all. It removes section B of
   `browser_client_safety.md` for every customer, but it adds moderation duties.

## Open questions

- Should demonstration material for curtcox apps publish immediately, since the owner is
  affected, or follow the 30-day rule like third parties?
- Which registrable domain would host H5, and should H5 and H6 share it?
- Does Firefox's or Safari's storage partitioning change the isolation matrix for H5's
  iframes embedded on `*.github.io`?
