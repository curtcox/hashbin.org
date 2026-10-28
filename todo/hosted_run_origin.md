# H5: Hosted isolated run origin

## Status

**Phase:** Implemented locally 2026-10-28 with a configurable domain; production rollout and the external
Python Online pilot remain pending. The owner requested implementation, then selected `hashbin.app` as the production domain,
leaving registration, deployment and the external pilot pending. D3–D5 use the defaults below; D1 now builds
the implementation ahead of the pilot. Split out of [security_case_studies.md](security_case_studies.md) (Part 3, H5). It is tracked
under row B14 in `STATUS.md`. The related plan is [app_hosting.md](app_hosting.md) (H6).

- [x] Owner: implement with configurable domain and recommended label/access/cost defaults
- [ ] Phase 0: all-browser acceptance (Chromium/WebKit measurements passed; Firefox and Safari 7-day retention pending)
- [ ] Phase 1: domain, DNS and Public Suffix List request
- [x] Phase 2: run-origin Worker and local/production configuration (not deployed)
- [x] Phase 3: registry, API and developer page
- [x] Phase 4: SDK v0.4.0 `createSandbox({ origin: 'hosted' })` artifacts, integrity and headers (not published)
- [x] Phase 5: H4 check and docs
- [ ] Phase 5: external Python Online pilot and runtime selection/pinning
- [ ] Phase 6: offline service worker (optional)

## Why

`createSandbox()` (SDK v0.3.0) runs untrusted code in an opaque origin. This isolates the code from the page.
The cost is that the code has no storage that outlives the frame, and some browser features need a real
origin:

| Need | Opaque sandbox (v0.3.0) | Hosted run origin (H5) |
|---|---|---|
| Isolation from the embedding page's storage, cookies and DOM | Yes | Yes |
| IndexedDB, OPFS or Cache Storage that persists across runs (a Python home directory, a micropip cache) | No (throws or is discarded) | Yes, per app |
| Module workers in Chromium | No | Yes |
| Runtime files loaded without the embedding page proxying them | No | Yes, from the run origin |
| Works with no HashBin infrastructure | Yes | No |

H5 is optional infrastructure. No current app needs it, so the opaque sandbox stays the default. The pilot
consumer is a Python Online feature that keeps `/home/pyodide` across runs (Phase 5).

## Non-goals

- Hosting developer-supplied files. The run origin serves only a fixed frame document and runtime files
  that HashBin pins. Because no user content is hosted, the run origin adds no moderation duty. App files
  keep coming through the v0.3.0 proxy from the embedding page.
- Separate origins per document or per share link. One origin per app is the unit; see "Security model".
- Cross-origin isolation (`SharedArrayBuffer`). A frame gets it only if its embedder is cross-origin
  isolated and delegates it. That is out of scope here; it is noted in the docs.

## Decisions (recommended defaults)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Build now or wait for a consumer | Do Phase 0 now; build Phases 1–5 only together with the Python Online persistence feature | Avoids maintaining unused infrastructure |
| D2 | Domain | A new registrable domain used only for H5, separate from `hashbin.org`, `256t.us` and H6's domain. Use an HSTS-preloaded TLD (`.app` or `.dev`) so HTTPS is forced. Check availability of short names at Cloudflare Registrar | Keeps sessions and the content domain's `__Host-hb_dl` cookie out of the same site. A flat `<label>.<domain>` is covered by the free Universal SSL wildcard, while `<label>.run.<shared-domain>` would need Advanced Certificate Manager (about $10/month) |
| D3 | Subdomain label | `a` plus the app UUID with its hyphens removed, for example `a1932999d125c4cf6bf56806d6df1fa3a`. That is 33 lowercase characters | Deterministic, so the SDK computes it with no lookup. `app_` contains an underscore, which is not a valid host name. App IDs are never reused, so a label never passes to a new owner |
| D4 | Who pays | HashBin absorbs the cost, under a global cap and per-app daily caps | The estimated cost is under $1 a month (see "Cost"). Billing developers would add accounting out of proportion to that |
| D5 | Who may use it | Any active registered app whose owner turns it on in the developer page; admins can suspend | The run origin serves only HashBin-pinned files, so abuse is limited to load |

## Design

### Implementation notes (2026-10-28)

See [the operator guide](../docs/hosted-run-origin.md) for local commands, deployment order,
runtime pinning/renewal and the remaining Python Online acceptance checklist.

- `RUN_DOMAIN` is `hashbin.app` in both production configs, with wildcard/apex zone routes.
  SDK callers default to `hashbin.app` and can override `runDomain` for tests. Local defaults use
  `localhost:8790`; domain registration/DNS/TLS, deployment and runtime pins still need acceptance. The
  [Python Online integration plan](https://github.com/curtcox/PythonOnline/blob/main/todo/hosted_run_origin.md)
  tracks the consumer changes.
- `workers/shared/` contains the CID and response header helpers shared with the content Worker.
- The bootstrap first accepts a validated parent connection, reports its origin on the port, and only
  then accepts worker source. This lets the SDK validate readiness **before** sending untrusted code.
- Daily caps use an additional internal `POST /run/reserve` route. Registry reservations of up to 120
  requests bound usage across isolates. `POST /run/usage` accepts a `lease_id` and cumulative `requests`
  for that reservation, applying only the new delta so retries cannot double count. Day records are
  separate storage values, retained for 35 days on subsequent usage. Lost isolates can strand quota
  until midnight, but cannot refund it. A `waitUntil` flush after 25 seconds covers short sessions;
  active request handling also flushes within 60 seconds. Display counts can lag or lose unflushed
  usage after eviction. Per-IP counters remain per isolate.
- Admin restore returns run status to `off`, allowing the owner to opt in again. Suspension and restore
  require successful audit recording before the registry saves the change.
- The hourly monitor uses `hashbin_run` request counts and a conservative CPU/R2/DO allowance for the
  500-cent cap. Missing or stale (>2 hours) current-month run measurements stop production run traffic.
  The brake is latched for its UTC month. Monitoring delay means this is not a strict dollar ceiling.
- `runtimes.json` is empty until the pilot selects files. The pin tool requires upstream SHA-256 hashes,
  checks every download before uploads, uses the publisher grant, verifies CID/maximum retention and
  writes the manifest atomically. Configure the operator account's default retention to 120 months;
  the existing OAuth API deliberately ignores caller overrides and applies grant caveats.
- Validation: 777 unit tests passed; 14 hosted SDK/developer browser tests passed in Chromium/WebKit; Wrangler
  production bundle dry runs cover the main, content and run Workers. SDK v0.3.0 files are unchanged.

### Domain, DNS and TLS (Phase 1)

1. Register the D2 domain at Cloudflare Registrar with auto-renew and registrar lock. Registration should
   run at least 2 years ahead, which the Public Suffix List requires.
2. Add the zone to the HashBin Cloudflare account. Create a proxied wildcard record `*` (AAAA `100::`) and a
   proxied apex record. The apex serves only a short explanation page.
3. TLS: Universal SSL covers the apex and `*.<domain>`. Set Always Use HTTPS and minimum TLS 1.2. Send HSTS
   (`max-age=63072000; includeSubDomains; preload`) and submit the apex to the HSTS preload list once stable.
   The TLD may already be preloaded.
4. Public Suffix List: open a PR adding `<domain>` to the PRIVATE section. Its comment names HashBin, with
   `curtcox@gmail.com` as the contact. Add a `_psl.<domain>` TXT record pointing to the PR. Merge takes
   weeks, and browsers ship it in a later release.
   - Before PSL inclusion, origins are already separate for storage, service workers and the Cache API, so
     launch does not wait for it.
   - PSL inclusion adds site-level separation: cookies, `SameSite`, and process isolation between app labels.
   - The run origin sets and reads no cookies, so the gap before inclusion matters little.

### Run-origin Worker (Phase 2)

New Worker at `workers/run-origin/`, named `hashbin-run-prod`. Share CID parsing and header helpers with
`workers/256t-content/` by moving them to `workers/shared/`.

`wrangler.toml`:
- Routes `*.<domain>/*` and `<domain>/*` on the D2 zone. Custom domains do not take wildcards, so these are
  zone routes.
- `CONTENT_BUCKET` (same R2 bucket).
- `APPLICATION_REGISTRY`, `INFRASTRUCTURE_COST` and `CONTENT_METADATA` bound to `hashbin-worker-prod`, as
  in the content Worker.
- Analytics Engine dataset `hashbin_run`.
- `[limits] cpu_ms = 10`.
- A `wrangler.local.toml` for local development.

Request handling, in order:

1. Ignore and never forward the `Cookie` header. Never send `Set-Cookie`.
2. The apex `/` serves a static page: "This domain runs code for apps that use HashBin", linking to the
   SDK docs and the report address. `www` redirects to the apex.
3. Parse the host's first label. It must match `^a[0-9a-f]{32}$`, otherwise 404. Rebuild `app_<uuid>` and
   fetch `GET /run/by-app/:app_id` from the registry. Cache the result in memory for 60 s, including
   negative results.
4. The app must be active with `run.status === 'active'`. Suspended apps get 403 and a short body; unknown
   or disabled apps get 404. All of these are `no-store`.
5. `hardStopped(env)` from the cost-safety state answers 503 with `Retry-After: 60`.
6. Per-IP limit: 120 requests a minute, using the 256t pattern with a higher limit. Per-app daily cap:
   `run.daily_request_cap`, default 20,000. Count in memory per isolate, flushed every 60 s to the registry
   (`POST /run/usage`). Over either limit, answer 429.
7. Routes:

| Path | Response |
|---|---|
| `/frame/<sdk-version>` | The frame document (below). `text/html`. Only versions in a constant list, such as `v0.4.0` |
| `/frame/<sdk-version>.js` | The hosted bootstrap script, `text/javascript`, immutable |
| `/r/<name>/<version>/<path>` | A pinned runtime file from `runtimes.json`, served from R2 by CID, immutable |
| `/sw.js` | Phase 6 only |
| `/health` | `OK` |
| anything else | 404 |

Headers on every response:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), payment=()`
- `Strict-Transport-Security` as above

The frame document's headers:
- CSP: `default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors <embedders>`
- `Cache-Control: no-cache`, because embedders can change
- `Vary: Host`

`<embedders>` is the app's embed origins (below). If there are none, it is `'none'`.

Runtime files:
- Sent with `Cache-Control: public, max-age=31536000, immutable` and an `ETag` equal to the CID.
- Read through the Cache API, keyed by CID, so R2 is read only on a miss.
- Requests must carry `Sec-Fetch-Site: same-origin`, otherwise 403. That keeps `/r/` from serving as a free
  public CDN. Non-browser clients can forge the header, but the IP and app limits still apply.

### Frame document and hosted bootstrap

```html
<!doctype html><meta charset="utf-8">
<meta name="hashbin-embedders" content='["https://curtcox.github.io"]'>
<script src="/frame/v0.4.0.js"></script>
```

The bootstrap is the v0.3.0 `SANDBOX_BOOTSTRAP` with these changes:
- It accepts `hashbin:sandbox:boot` only when `e.source === parent` and `e.origin` is in `hashbin-embedders`.
  This check backs up `frame-ancestors`, whose behaviour has varied across browsers.
- It accepts `workerType: 'module'` and starts `new Worker(blobURL, { type: 'module' })` when asked, because
  module workers work in a real origin.
- It sends `hashbin:sandbox:ready` with `location.origin` on the port, so the SDK can confirm which origin it
  got.

The worker is created from a blob URL inside the frame, so it runs with the frame's origin. Its IndexedDB,
OPFS and Cache Storage belong to `https://<label>.<domain>`, partitioned by the browser under the embedding
page's top-level site.

### Embed origins

An app's embed origins are the web origins of its registered `redirect_uris`:
- `https:` origins.
- `http://localhost`, `http://127.0.0.1` and `http://[::1]` origins with their ports. These are kept for
  development only and are dropped from production frame-ancestors unless the app opts in with
  `run.allow_local`.

The registry already computes origins with `webOrigin()`. A later version may add a separate `embed_origins`
list; v1 reuses redirect URIs so there is one place to configure.

### Runtime pinning

`workers/run-origin/runtimes.json` lists every file the run origin will serve:

```json
{ "pyodide": { "0.27.7": { "pyodide.js": { "cid": "…", "type": "text/javascript", "sha256": "…" } } } }
```

`scripts/pin-runtime.mjs <name> <version> <url-prefix> <file…>`:
1. Downloads each file.
2. Checks it against the upstream hash: Pyodide's `pyodide-lock.json` for packages, or a hash the operator
   passes for core files.
3. Uploads it as HashBin content owned by the HashBin operator account, with maximum retention, through the
   `scripts/publish.mjs` grant.
4. Writes the CID into `runtimes.json`.

The Worker imports `runtimes.json` at build time, so serving needs no lookup. Pin only what a consumer
loads. Pyodide core is about 10 MB; packages are added on demand.

Retention renewal: the existing expiration index already warns about expiring content. Add the run-origin
CIDs to the operator's renewal checklist in `docs/`.

### Registry and API (Phase 3)

`ApplicationRegistry` app record gains:

```js
run: { status: 'off' | 'active' | 'suspended', allow_local: false, daily_request_cap: 20000,
       enabled_at, suspended_at, suspended_reason }
```

DO routes:
- `GET /run/by-app/:app_id` returns `{ status, embedders, daily_request_cap }`. It is computed from the
  record, so it is never stale beyond the Worker's 60 s cache.
- `PUT /apps/:id/run` lets the owner set `status: 'active' | 'off'` and `allow_local`. Owners cannot change
  `suspended`.
- `POST /run/usage` takes `{ app_id, day, requests }` increments and stores daily totals for 35 days.

Worker API, in `src/index.js` with session access:
- `GET`/`PUT /api/developers/apps/:id/run` for the owner.
- `POST /api/admin/apps/:id/run/suspend` and `/restore`, which require `admin:takedown` and are logged to
  `ADMIN_ACTION_LOG`.

Developer page (`frontend/js/developers.js`): a "Hosted sandbox origin" panel per app. It has an on/off
toggle and shows the origin URL, today's and the month's requests, the cap, and the CSP lines to add.

### SDK v0.4.0 (Phase 4)

`createSandbox({ source, proxy, base, origin = 'opaque', clientId, runDomain = '<D2 domain>', workerType = 'classic', timeout = 15000 })`:
- `origin: 'opaque'` behaves exactly as v0.3.0.
- `origin: 'hosted'` requires `clientId`.
  - The frame is `https://a<uuid-hex>.<runDomain>/frame/v0.4.0` with `sandbox="allow-scripts allow-same-origin"`.
    That combination is safe here only because the frame is cross-origin to the page; document this next to
    the code.
  - The SDK waits for `hashbin:sandbox:ready`, checks that the reported origin equals the expected one, and
    then boots the worker.
  - If the frame fails or times out, `onerror` gets code `sandbox_unavailable`. There is no silent fallback
    to opaque mode, because storage would differ. Apps may catch the error and call
    `createSandbox({ origin: 'opaque' })` deliberately.
- The prelude gains `hashbinSandbox.origin`, the origin the code runs with.
- `workerType: 'module'` is allowed only with `origin: 'hosted'`.

The embedding page's CSP needs:
- `frame-src https://<label>.<runDomain>`
- Nothing else for hosted mode; the bootstrap hash and `blob:` are needed only for opaque mode.

Release:
- `node scripts/release-browser-sdk.mjs v0.4.0`.
- Update `integrity.json`, `frontend/_headers` and `src/browser-sdk-release.test.js`.
- v0.3.0 stays immutable.

### H4 safety check changes (Phase 5)

In `src/app-safety.js`:
- **Remove known SDK files before scanning.** Skip any script whose sha256 matches a released SDK file in
  `frontend/sdk/*/integrity.json`. The v0.4.0 SDK contains the string `allow-scripts allow-same-origin`, and
  would otherwise trigger the `sandbox-same-origin` warning in every app that vendors it.
- **New finding `sandbox-hosted` (ok).** It fires when the page's CSP `frame-src` names the run domain and
  the page calls `createSandbox`.
- **New finding `run-embedder-mismatch` (warn).** It fires when the app has hosted mode on but the checked
  page's origin is not among its embed origins.

## Security model

- **What is protected:** the embedding page's origin. Code in the frame cannot reach the page's storage,
  cookies, service worker or DOM. It can send messages only through the port the SDK validates.
- **What is shared:** every run of every document in one app shares `https://<label>.<domain>` storage
  (within one top-level site, because of partitioning). Code from a hostile link can read or alter what
  earlier runs stored there. Docs must say:
  - Keep nothing secret in run-origin storage.
  - Treat what you read back as untrusted.
  - Use opaque mode for code you do not want to share state with other runs.
- **Sibling apps on a shared embedder origin.** If two apps both embed from `curtcox.github.io`, each can
  frame the other's run origin, because `frame-ancestors` and the bootstrap check origins, not apps. The
  browser partitions storage by top-level site, which is the same for both. Per-app run storage is therefore
  per app only when apps have distinct origins, such as with H6 or their own domains. The developer page
  shows this warning when an app's embed origin is a known shared host.
- **Embedding by an unregistered site** is refused by `frame-ancestors` and by the bootstrap's origin check.
- **Top-level navigation** to `/frame/…` boots nothing: `parent === window`, and an opener's message has a
  different `source`.
- **Label reuse:** none. App IDs are UUIDs and deleted apps keep their IDs, so no new owner inherits an old
  label's storage. Deleting an app sets `run.status = 'off'`.

## Cost

Per pilot user session there are about 15 requests (the frame, the bootstrap and runtime files), most served
from the edge cache.
- 100,000 sessions a month is 1.5 M Worker requests, about $0.45, plus negligible CPU.
- R2 Class B reads happen only on cache misses, for a few dollars-worth of reads at most.
- Egress is free.
- Storage for one pinned Pyodide core is under 50 MB, under $0.01 a month.

Add `runOriginMonthlyCapCents: 500` to `COST_POLICY`. The hourly cost job reads Analytics Engine
`hashbin_run` counts. At 80 % of the cap it raises an operator alert; at the cap it sets `run_brake`, which
the Worker treats like `hardStopped`.

## Tests

- **Worker unit tests** (`workers/run-origin/src/index.test.js`):
  - label parsing
  - unknown, off and suspended apps
  - `frame-ancestors` contents, including `allow_local`
  - `Cookie` ignored and no `Set-Cookie`
  - `Sec-Fetch-Site` enforcement on `/r/`
  - runtime 404 for unpinned paths
  - immutable headers
  - IP and app caps
  - hard stop and brake
- **Registry tests:** run status changes, owner versus admin suspension, `by-app` output and usage
  aggregation.
- **SDK tests:**
  - hosted mode sets the right `src` and `sandbox` attributes
  - rejects a mismatched `ready` origin
  - times out to `sandbox_unavailable`
  - opaque mode unchanged
  - module workers refused in opaque mode
- **H4 tests:** SDK files skipped by hash; `sandbox-hosted` and `run-embedder-mismatch`.
- **Browser e2e** (`frontend/tests/hosted-sandbox.spec.js`, Chromium and WebKit, Firefox when Playwright can
  start it):
  - Run the run-origin Worker locally on `*.localhost`. Chromium and Firefox resolve `*.localhost` to
    loopback and treat it as secure; for WebKit use a hosts entry or route interception.
  - The embedding page runs on `127.0.0.1`.
  - Assertions:
    1. Code reports the hosted origin.
    2. A value written to IndexedDB in one sandbox is read by a second sandbox.
    3. The embedding page's `localStorage` is unreachable.
    4. A page on an unregistered origin cannot boot the frame.
    5. Opaque mode still reports `null`.

## Phase 0: measurements before purchase

Use local `*.localhost` origins, which count as separate sites. In Chromium, WebKit and Firefox, with the
embedder and frame on different sites, record:
1. Does the frame's IndexedDB persist across reloads and a browser restart?
2. Is storage partitioned by top-level site? Two different embedders should see different data.
3. Does the frame register and use a service worker? This is needed only for Phase 6.
4. Can it start module workers?
5. Is a `frame-ancestors` violation enforced?
6. Safari: does partitioned storage survive 7 days without visiting the embedder? Check by advancing
   `ITPDebugMode` or by testing manually.

Write the results into this file. If (1) fails in a major browser, stop: H5's purpose is persistence.

### Phase 0 results (2026-10-28)

Measured with `scripts/measure-hosted-run-origin.mjs` using persistent browser profiles and default
storage/privacy behavior. The embedder sites were `http://127.0.0.1:<port>` and `http://[::1]:<port>`;
the frame was `http://h5-run.localhost:<port>` in Chromium and `http://localhost:<port>` in WebKit,
whose resolver does not reliably support `*.localhost`. Both are cross-site secure loopback contexts.
Chromium's Playwright flag disabling storage partitioning was overridden to restore browser defaults.
Profiles were closed and reopened at the **same path**, then removed after measurement.

| Measurement | Chromium 156.0.8078.4 | Playwright WebKit 26.0 | Firefox |
|---|---|---|---|
| Frame + blob-worker IndexedDB, across new frames/reloads | Passed | Passed | Not measured |
| IndexedDB across a clean browser restart | Passed | Passed | Not measured |
| Distinct top-level sites get distinct storage; returning to the first preserves its value | Passed | Passed | Not measured |
| Register, activate and message a service worker | Passed | Passed | Not measured |
| Start a module worker | Passed | Passed | Not measured |
| `frame-ancestors 'none'` blocks frame boot, with browser CSP evidence | Passed | Passed | Not measured |
| Seven days without visiting the embedder (Safari/ITP) | N/A | Requires manual Safari acceptance | N/A |

Firefox's installed build exited before opening the persistent profile with
`Could not find profile folder`; this is an environment failure, not a measured storage failure.
[Machine-readable evidence](../docs/hosted-run-origin-measurements.json) is committed. No major browser
showed a persistence failure in the measured local scenarios. Production HTTPS/Safari retention and
Firefox acceptance remain rollout gates; the local implementation and two-engine SDK tests can proceed.

## Rollout

1. Phase 0 results recorded; D1–D5 signed off.
2. Domain bought, DNS and TLS set, PSL PR opened. The PSL PR proceeds in parallel and does not block.
3. Worker deployed with no apps enabled; `/health` and the apex page verified.
4. Registry and API deployed; the toggle is enabled for Python Online only.
5. SDK v0.4.0 released.
6. Python Online pilot:
   - A "Keep files between runs" setting uses hosted mode and an IDBFS mount at `/home/pyodide`.
   - Its browser test asserts persistence and the isolation checks above.
   - Opaque mode stays the default for code that arrives by link until the user turns the setting on.
7. Docs:
   - SDK guide: a "Hosted sandbox origin" section.
   - Browser client safety: when to choose each mode.
   - Security notes index: list the run domain as HashBin-operated.
   - `STATUS.md` row B14.
8. Phase 6 if offline use is wanted: `/sw.js` caches `/frame/*` and `/r/*` with `HashBinCache` CID checks.
   It runs only if Phase 0 (3) passed in the browsers that matter.
