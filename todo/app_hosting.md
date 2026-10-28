# H6: Per-app hosting from CIDs

## Status

**Phase:** Planned 2026-10-28; nothing is built. This plan is ready to implement once the owner signs off the
decisions below. Split out of [security_case_studies.md](security_case_studies.md) (Part 3, H6). It is tracked
under row B14 in `STATUS.md`. The related plan is [hosted_run_origin.md](hosted_run_origin.md) (H5).

- [ ] Owner: sign off decisions D1–D7, above all D1 (whether HashBin hosts apps at all)
- [ ] Phase 1: domain, DNS and Public Suffix List request
- [ ] Phase 2: manifest format, validation and publish tool
- [ ] Phase 3: registry, billing identity and API
- [ ] Phase 4: hosting Worker
- [ ] Phase 5: developer page, admin controls and docs
- [ ] Phase 6: pilot (Pages Online), then migrate the other curtcox apps

## Why

Every curtcox app lives at `https://curtcox.github.io/<repo>/`, which is one origin. Each app can read the
others' storage, caches and service workers (SN-2026-003; section B of
[browser_client_safety.md](browser_client_safety.md)). The fix today is the owner's job: buy a domain and
give each repo a custom subdomain (B1), or create a GitHub organisation per app (B2). H6 gives every
registered app its own origin, `https://<slug>.<apps-domain>/`. It serves the app's static files from
HashBin content addressed by CID, with no DNS or GitHub setup for the developer.

What H6 adds beyond B1/B2:
- **Atomic, verifiable releases.** A release is one manifest CID, and anyone can check the bytes served
  against it.
- **Instant rollback.** The developer selects an earlier manifest.
- **Origins never reused.** A slug never passes to another owner, so nobody inherits an old app's storage.
- **Safety check on every release.** The H4 check runs automatically when the manifest changes.

## Non-goals

- Server-side code, redirects to other hosts, custom request handling, or form posts to the host. Hosting
  is static GET/HEAD only.
- Custom domains. A later version could add them through Cloudflare for SaaS.
- Previews of unreleased manifests at the same origin. A preview there would share the app's storage. A
  later version could add a separate preview origin per app.
- Hosting apps that are not registered HashBin apps.

## Decisions (recommended defaults)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Should HashBin be an app host? | Yes, limited as listed below: static files, registered apps, funded accounts, an acceptable use policy, and admin suspension. Start with curtcox apps only (an allow-list flag), then open it | Removes section B for every customer. The added duty, phishing and abuse takedowns, is bounded by the limits below |
| D2 | Domain | A new registrable domain only for H6, separate from `hashbin.org`, `256t.us` and H5's run domain, on an HSTS-preloaded TLD (`.app`). Check availability at Cloudflare Registrar | Hosted apps must not be same-site with HashBin sessions or the content domain. The flat `<slug>.<domain>` is covered by free Universal SSL |
| D3 | Subdomain name | A developer-chosen slug: 3–32 characters, `[a-z0-9-]`, no leading, trailing or doubled hyphen, not on the reserved list, first come first served. It cannot change once hosting starts. It is never reassigned, even after the app is deleted | Readable URLs. Changing a slug changes the origin and strands the app's storage. Reassigning one would hand old storage and links to a stranger |
| D4 | Who pays for traffic | The app owner's balance, through a new `hosting` download identity, at the existing identified-download price `identifiedDownloadPriceUc(size)` (at least 400 µ¢ a request). The developer sets a monthly hosting cap (default $5). Per-CID anonymous allowances are not used | Predictable for the developer, and it reuses the funded-download leases already in the content Worker. Cost is about $0.30–$0.70 per million requests, against a price of $4 per million at the minimum |
| D5 | Who may host | Accounts with at least one completed deposit, the hosting acceptable use policy accepted, and the app active. During the pilot, also `hosting_allowed` set by an admin | A deposit requirement is the main brake on throwaway phishing sites |
| D6 | Moderation | The existing dispute flow, per file CID and per app. An admin can suspend an app's hosting. Three upheld disputes against one app's files suspend it automatically | Reuses DisputeRecord, AdminActionLog and the 451 handling |
| D7 | Headers apps may set | An allow-list in the manifest: `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`, `Cache-Control` (non-HTML only), `Service-Worker-Allowed`. Never `Set-Cookie` or any CORS header | Apps get COOP/COEP (Gnuplot and apptron need cross-origin isolation) and their own CSP. HashBin keeps control of cookies and the other headers listed under "Hosting Worker" |

## Design

### Domain, DNS and TLS (Phase 1)

These steps are the same as H5 Phase 1, on the H6 domain:
- Registrar lock and auto-renew, registered at least 2 years ahead.
- Proxied wildcard `*` and apex records.
- Universal SSL.
- HSTS with `includeSubDomains; preload`.
- A PSL PRIVATE-section PR with a `_psl` TXT record.

The apex serves the hosting landing page, with a link to the app directory on `hashbin.org` and to abuse
reports. Until PSL inclusion:
- Sibling apps are same-site, though storage stays per origin.
- An app could set a `Domain=<apps-domain>` cookie that other apps read.
- The docs say not to use cookies until the PSL status reads "included". The developer page shows that
  status.

### Manifest format (Phase 2)

A release is a JSON document stored as ordinary HashBin content (`application/json`):

```json
{
  "hashbin_app_manifest": 1,
  "files": {
    "/index.html": { "cid": "AAAA…", "type": "text/html; charset=utf-8" },
    "/src/app.js": { "cid": "AAAA…", "type": "text/javascript" },
    "/service-worker.js": { "cid": "AAAA…", "type": "text/javascript" }
  },
  "headers": [
    { "path": "/*", "set": { "Content-Security-Policy": "default-src 'self'; object-src 'none'" } },
    { "path": "/gnuplot/*", "set": { "Cross-Origin-Embedder-Policy": "require-corp" } }
  ],
  "not_found": "/404.html",
  "spa_fallback": null
}
```

Validation, in `src/utils/app-manifest.js` and shared by the API, the Worker and the publish tool:
- The manifest is at most 1 MiB, with at most 5,000 files.
- Paths:
  - start with `/` and are at most 1,024 bytes after NFC normalisation
  - contain no `//`, `.` or `..` segments, backslashes or control characters
  - do not begin with `/.hashbin/`, which is reserved
  - `/.well-known/` is allowed, except `/.well-known/acme-challenge/`
- `type` comes from an allow-list: the content Worker's `MIME_TYPES` plus `text/javascript`,
  `application/wasm`, `application/manifest+json`, `font/woff2`, `font/woff`, `text/plain` with charset, and
  `application/octet-stream`.
- `headers[].path` is an exact path, or a prefix ending in `/*`. Later rules override earlier ones per header
  name. Names come from the D7 allow-list. Each value is at most 4 KiB.
- `not_found` and `spa_fallback` must name files in the manifest. `spa_fallback` serves for unmatched
  navigations (`Sec-Fetch-Mode: navigate`) only.
- Every file CID and the manifest CID must be:
  - stored and not deleted
  - not disputed
  - retained for at least 30 more days
  - no larger than 25 MiB per file, matching Cloudflare's cache object limit for the default plan

Directory requests: `/x/` serves `/x/index.html`. `/x` with no file but an `/x/index.html` redirects 308 to
`/x/`.

### Publish tool (Phase 2)

`scripts/publish-app.mjs <dir> --app <app_id> [--headers headers.json] [--dry-run]`:
1. Walk `<dir>`, skipping dotfiles other than `.well-known/`, and `node_modules`.
2. Compute each file's CID locally, with the same function as the SDK's `computeCID`.
3. Ask `GET /api/content/:cid/exists` for each one. Upload only the missing files, through the `scripts/publish.mjs`
   OAuth flow (`content:write`). Each upload is checked against its CID, as the SDK does.
4. Build and validate the manifest, upload it, and print its CID.
5. Call `PUT /api/developers/apps/:id/hosting` with `{ manifest_cid }`, using a new `apps:hosting` scope:
   "Publish releases of your registered apps to HashBin hosting". It is not a spending scope, because
   traffic is paid by the hosting identity under its own cap.
6. Print the hosted URL and the H4 findings returned.

Also provide a GitHub Action in `docs/`, `hashbin-publish-app.yml`, that runs the tool on tag push with a
stored refresh token. That keeps GitHub as the source of truth for developers who want it.

### Registry, billing and API (Phase 3)

`ApplicationRegistry` app record gains:

```js
hosting: {
  status: 'off' | 'active' | 'suspended',
  slug, manifest_cid,
  history: [{ manifest_cid, set_at, set_by }],   // last 50
  monthly_cap_cents: 500,
  terms_accepted_at, suspended_at, suspended_reason, upheld_disputes: 0
}
```

Plus a `slug:<slug>` → `app_id` index in DO storage. It is written once and never deleted.

DO routes:
- `GET /hosting/by-slug/:slug` returns `{ app_id, owner_user_id, status, manifest_cid }`.
- `GET /hosting/slug-available/:slug`.
- `PUT /apps/:id/hosting`, for the owner: claim the slug once; set `manifest_cid`, `monthly_cap_cents` and
  `terms_accepted_at`; set status `off` or `active`.
- `POST /apps/:id/hosting/suspend` and `/restore`, for admins.

The reserved slug list:
- `www`, `api`, `admin`, `mail`, `hashbin`, `status`, `docs`, `login`, `auth`, `account`, `support`,
  `abuse`, `security`
- anything containing `hashbin`, `paypal`, `stripe`, `google`, `apple`, `microsoft`, `github`, `bank` or
  `login`
- all two-letter slugs

Worker API in `src/index.js`. All owner routes accept session or `apps:hosting` OAuth.
- `GET /api/developers/apps/:id/hosting` returns:
  - the hosting record
  - the month's spend
  - the PSL status
  - the last H4 result
- `PUT /api/developers/apps/:id/hosting`:
  - Validates the manifest and its files as described above.
  - Requires D5 and that the acceptable use policy has been accepted.
  - Mirrors `active` and the cap to the owner's UserProfile.
  - Runs the H4 check on `https://<slug>.<domain>/` after the change, through `ctx.waitUntil`, and returns
    the previous result.
  - Rollback is the same call with an earlier `manifest_cid` from `history`.
- `DELETE /api/developers/apps/:id/hosting` sets status `off`. The slug stays reserved. Deleting the app
  turns hosting off.
- `POST /api/admin/apps/:id/hosting/suspend` and `/restore` require `admin:takedown` and are logged to
  `ADMIN_ACTION_LOG`.

Billing identity:
- Add `kind: 'hosting'` to `downloadIdentityValid()` in `src/utils/download-budget.js`. It is valid when
  `profile.download_budget.hosting[app_id]?.active`.
- The cap is tracked like a key's in `download_budget.spend.keys` under `hosting:<app_id>`, with
  `month_uc` compared against `monthly_cap_cents * 10_000`.
- The registry API is the only writer of `download_budget.hosting`, through a new UserProfile route
  `POST /download/hosting`.
- The hosting Worker builds `{ u: owner_user_id, kind: 'hosting', k: app_id }` itself. It never comes from
  a request.

Disputes:
- `POST /api/disputes` already works per CID. A file CID that becomes `disputed` answers 451 from the
  hosting Worker, because it reads the same `.meta`.
- Add an "app" field to the dispute form, which is filled when the report comes from the hosted 404 page or
  the app directory.
- When an admin upholds a dispute against a CID in an app's current manifest, increment
  `hosting.upheld_disputes`. At 3, suspend the app automatically.

### Hosting Worker (Phase 4)

New Worker at `workers/app-hosting/`, named `hashbin-apps-prod`. It shares helpers with the content Worker
through `workers/shared/` (CID parsing, `hardStopped`, `confirmedFunding` and `takeFundedDownload`, and the
mutex). Bindings:
- `CONTENT_BUCKET`
- `APPLICATION_REGISTRY`, `CONTENT_METADATA`, `USER_PROFILES` and `INFRASTRUCTURE_COST`, bound to
  `hashbin-worker-prod`
- Analytics Engine dataset `hashbin_hosting`
- `cpu_ms = 10`

Zone routes `*.<domain>/*` and `<domain>/*`.

Per request:
1. Only GET and HEAD are allowed; anything else gets 405. Ignore the `Cookie` header and drop any
   `Set-Cookie`.
2. The apex and `www` serve the landing page.
3. Look up the slug through `GET /hosting/by-slug/:slug`, cached in memory for 30 s.
   - Unknown or `off`: 404 with the HashBin hosted 404 page.
   - `suspended`: 451 with a page naming the reason category and linking to the dispute page.
4. `hardStopped(env)`: 503 with `Retry-After: 60`.
5. Load the manifest by CID through the Cache API (key `https://manifest.internal/<cid>`, immutable), with
   R2 on a miss. Parse it and keep it in memory per isolate, at most 50 manifests, LRU.
6. Resolve the path:
   - Exact match first, then the `index.html` and 308 rules.
   - Then `spa_fallback` for navigations.
   - Then `not_found` with status 404.
   - Otherwise the HashBin hosted 404 page.
7. Billing:
   - Call `confirmedFunding` and `takeFundedDownload` with the hosting identity at
     `identifiedDownloadPriceUc(file.size)`.
   - If not funded, a navigation gets 503 with a static "This app is over its hosting limit" page, and a
     subresource gets 429. Both are `no-store`.
   - A per-IP limit of 300 requests a minute applies regardless, as a flood guard. Real apps load many files.
8. Read the file:
   - Through the Cache API keyed by CID, then R2.
   - Check `.meta` for `deleted` or `disputed` on a cache miss, and cache that verdict for the same TTL as
     the content Worker (`COST_POLICY.cacheSeconds`).
   - A file disputed after caching stops within that TTL. Admin suspension of the whole app takes effect
     within 30 s.

Response headers:

| Header | Value |
|---|---|
| `Content-Type` | The manifest's `type` |
| `ETag` | `"<file cid>"`; `If-None-Match` answers 304, which is still billed at the minimum price |
| `Cache-Control` | HTML: `no-cache`. Other files: manifest value or `public, max-age=300` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Manifest value. If there is none: `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'` |
| `X-HashBin-Manifest` | The current manifest CID |
| `X-HashBin-CID` | The file CID |
| Other D7 headers | From the manifest |

Reserved paths served by the Worker:
- `/.hashbin/manifest`: the current manifest CID and JSON, so anyone can verify a release against HashBin
  content.
- `/.hashbin/report`: a redirect to the dispute form with the app filled in.

Analytics: sample 1 % of requests to `hashbin_hosting` with slug, status, cache hit or miss, and price. The
developer page reads its spend from the UserProfile's spend counters, not from the samples.

### Developer page and docs (Phase 5)

`frontend/js/developers.js` gets a "Hosting" panel per app:
- slug claim, with an availability check
- the acceptable use policy checkbox
- an on/off toggle and the monthly cap
- the current release and its history, with a Roll back button
- the month's spend
- PSL status
- the last H4 findings
- the redirect URI to add, `https://<slug>.<domain>/…`, with an "Add to redirect URIs" button. That button
  runs the existing PATCH without the shared-origin warning, because the hosted origin is not shared

Admin page: a hosted apps list with status, spend and upheld disputes, plus suspend and restore.

Public app directory at `hashbin.org/apps/`, read-only: hosted apps listed with name, owner display name,
URL, current manifest CID and a report link. Abuse reporters and users can check who runs a hosted app
there.

Docs:
- New `frontend/docs/hosting.html`: setup, the publish tool, the manifest reference, headers, billing,
  limits, rollback, and migration from GitHub Pages.
- New `frontend/docs/hosting-policy.html`: the acceptable use policy. It forbids phishing, credential
  collection, malware, impersonation, and anything already prohibited for content.
- `browser-client-safety.html`: "Shared origins" names HashBin hosting as the first choice, with B1 and B2
  as alternatives.
- SN-2026-003: add "HashBin-side fix available: hosting (H6)".
- H4 (`src/app-safety.js`): the `shared-origin` finding's message suggests HashBin hosting. Add a new
  `hosted` (ok) finding when the page is on the hosting domain.

## Security model

- **Separation from HashBin.** The hosting domain is its own registrable domain. Apps cannot read or set
  `hashbin.org` or `256t.us` cookies, and HashBin never sets cookies on the hosting domain.
- **Separation between apps.** Each slug is its own origin, so storage, service workers and caches are
  separate. After PSL inclusion each is also its own site, which separates cookies, `SameSite` and processes.
- **What HashBin does not protect against.** A bug in the app (T2), or a hostile app attacking its own
  users. The CSP default and the H4 check reduce the first; the acceptable use policy and takedown address
  the second.
- **Release integrity.** Files are named by CID, and the manifest is public at `/.hashbin/manifest`. A
  HashBin compromise could still serve other bytes. An SDK helper,
  `verifyHostedRelease(origin, expectedManifestCid)`, lets cautious users or monitors compare.
- **Phishing.** Mitigations:
  - the deposit requirement
  - the reserved and brand-name slug list
  - the public directory and a report path on every hosted 404 or suspended page
  - Google Safe Browsing reporting by the admin on takedown, as a manual step in the runbook
  - fast suspension, effective within 30 s
- **Cost abuse.** Every byte is paid by the owner under a cap, with a per-IP flood guard and the global
  hard stop. A hostile third party can exhaust an app's cap by flooding it. The per-IP limit slows this. If
  it happens, the developer can raise the cap or an admin can block the source at Cloudflare's WAF.

## Cost

Per request:
- a Worker request, $0.30 per million
- under 10 ms of CPU
- a UserProfile lease call amortised over leases of up to 250 requests
- an R2 Class B read only on a cache miss, $0.36 per million

That totals about $0.30–$0.70 per million requests. The price is at least $4 per million, from
`identifiedDownloadPriceUc`.

Storage: retention is paid at upload like other content. A typical 5 MB app kept for 12 months costs a few
cents.

Add `hostingMonthlyCapCents: 2000` to `COST_POLICY` as a global brake on HashBin's own exposure, in case
billing fails open. The hourly cost job reads `hashbin_hosting` and sets `hosting_brake` like the existing
brake.

## Migration from GitHub Pages (Phase 6)

GitHub Pages cannot redirect at the server without a custom domain, and the new origin cannot read the old
origin's storage. Each app therefore ships a migration build first:
1. Publish the app to hosting, and add the hosted redirect URI to the app's HashBin registration.
2. Release a GitHub Pages build that shows "This app has moved" with a Move my work button. The button
   publishes the app's local drafts and settings as one HashBin document, using `publish()`. It then opens
   `https://<slug>.<domain>/#import=<cid>`.
3. The hosted build reads `#import=`, retrieves and verifies the CID with `retrieve()`, restores the data,
   and removes the fragment.
4. Fragments never reach servers, and the CID check stops tampering. Drafts that were never sent stay on the
   old origin until the user moves them.
5. Clear the old origin's tokens and service worker caches after the move, as the B1 migration advice says.
6. After a notice period, replace the GitHub Pages site with a static redirect page. Keep share-link
   handling working by rewriting the link to the new origin with the same query and fragment.

Pilot order:
1. **Pages Online.** It already carries projects in share links, and it gains a real preview origin for the
   open `srcdoc` problem (SN-2026-004).
2. Python Online and Manim Online.
3. Gnuplot and Sheets.
4. apptron. It needs COOP/COEP from manifest headers, and its large VM images are near the 25 MiB file
   limit, so check that limit first.

## Tests

- **Manifest validator unit tests** (`src/utils/app-manifest.test.js`):
  - path normalisation and traversal
  - reserved paths
  - header allow-list
  - limits
  - fallback rules
- **Registry tests:**
  - slug rules, uniqueness and non-reuse after deletion
  - history cap
  - owner versus admin suspension
  - automatic suspension at 3 upheld disputes
- **Billing tests:**
  - the `hosting` identity is valid only while active
  - the monthly cap stops funding
  - the registry mirror updates the profile
- **Worker unit tests** (`workers/app-hosting/src/index.test.js`):
  - slug lookup and the off, suspended and unknown pages
  - path resolution, including `index.html`, 308, SPA fallback and the 404 page
  - default and manifest headers, with `Set-Cookie` dropped
  - ETag and 304
  - funded versus over-cap behaviour for navigations and subresources
  - disputed or deleted files
  - hard stop
  - the per-IP limit
  - `/.hashbin/manifest`
- **Publish tool tests** (`scripts/publish-app.test.js`): directory walk, unchanged files skipped, manifest
  output, dry run.
- **Browser e2e** (`frontend/tests/app-hosting.spec.js`, Chromium and WebKit, plus Firefox where Playwright
  runs). Run the hosting Worker locally with two slugs on `*.localhost` and check:
  1. App A's `localStorage`, IndexedDB and service worker are not visible to app B.
  2. App A's own service worker installs and serves offline.
  3. A rollback changes the served bytes.
  4. The migration `#import=` flow restores data and rejects a tampered CID.

## Rollout

1. Owner signs off D1–D7.
2. Domain bought, DNS and TLS set, PSL PR opened. The PSL PR proceeds in parallel.
3. Manifest validator, publish tool and registry and billing changes deployed, with the hosting toggle
   hidden.
4. Hosting Worker deployed. The admin sets `hosting_allowed` for curtcox apps only.
5. Pages Online migrated; check it live across browsers for two weeks.
6. Remaining curtcox apps migrated in the pilot order.
7. Docs, the acceptable use policy and the public directory published. `hosting_allowed` is removed, so
   hosting is open under D5.
8. `STATUS.md` row B14 and the security notes index updated. Section B of `browser_client_safety.md` notes
   that hosting replaces it.
