# Hosted sandbox operations

H5 uses **hashbin.app** as its dedicated production domain. Both Worker configs and
zone routes now name it; domain/DNS/TLS and deployment acceptance remain to be verified.
There are no pinned runtimes, and every
existing or new registered app defaults to `run.status = 'off'`.

The domain must be separate from `hashbin.org`, `256t.us`, and the future H6 app-hosting
domain. Set the same `RUN_DOMAIN` in the main Worker and
`workers/run-origin/wrangler.toml`. The SDK defaults `runDomain` to `hashbin.app`; callers may override it for local tests. It is a bare domain,
without a scheme or path. Local development alone permits a `localhost` port.

## Local checks

`npm run test:hosted:measure` runs Phase 0 with persistent browser profiles. It checks
frame and blob-worker IndexedDB across frames, reloads and a clean browser restart;
two distinct top-level sites; service workers; module workers; and CSP enforcement.
It deletes its temporary profiles afterward. `H5_BROWSERS=chromium,webkit` can select
engines, `H5_REPORT=/tmp/report.json` writes evidence, and `H5_CHROMIUM_PATH`,
`H5_WEBKIT_PATH`, `H5_FIREFOX_PATH` override installed executable paths. Chromium's
Playwright switch that disables storage partitioning is overridden to restore the
browser default. Exit 0 means persistence passed in the selected engines, 1 means a
measured persistence failure, and 2 means a browser could not be measured.

Results from 2026-10-28 are recorded in
[the plan](../todo/hosted_run_origin.md#phase-0-results-2026-10-28) and
[the JSON report](hosted-run-origin-measurements.json). Chromium and WebKit passed.
Firefox exited before opening a profile. Safari's seven-day ITP behavior remains a
manual acceptance item; Playwright WebKit is not a Safari ITP retention guarantee.

`npm run test:hosted` exercises the actual run Worker/registry classes through a local
HTTP adapter and the SDK in Chromium and WebKit. Set the executable overrides if
the installed browser revisions differ; set `H5_INCLUDE_FIREFOX=1` to include Firefox.
The tests cover persistent IndexedDB, module workers, embedding-page isolation,
unregistered embedders with and without CSP, and opaque mode. The adapter runs on
8789/8790 and transports WebKit's `*.localhost` requests over loopback without
changing their browser origins or CSP.

For manual development, run Wrangler with both the root `wrangler.local.toml` and
`workers/run-origin/wrangler.local.toml` in one multi-Worker invocation:

```sh
npx wrangler dev --config wrangler.local.toml --config workers/run-origin/wrangler.local.toml --local
```

Use the developer page to register an app with `http://127.0.0.1:8787/callback`,
enable hosted mode and local origins, and pass `runDomain: 'localhost:8790'` to the
SDK. Production omits local embedders unless the owner explicitly enables them.

## Domain and deployment checklist

1. Verify registration/ownership of `hashbin.app`, with registrar lock,
   auto-renew and at least two years of registration. No registration is performed
   by the build or deployment scripts.
2. Add proxied wildcard and apex DNS records. Universal SSL must cover the apex and
   flat app labels. Enable HTTPS and minimum TLS 1.2. The Worker sends HSTS for two
   years with includeSubDomains/preload. Submit to the preload list when stable.
3. Add the private suffix to the PSL via a reviewed PR, identify HashBin and
   `curtcox@gmail.com`, and publish the `_psl` TXT reference. Storage origins are
   separate before browser PSL updates; site-level cookie/process separation is
   only assured after those updates. The run origin never uses cookies.
4. Verify `RUN_DOMAIN = "hashbin.app"` in both Worker configs and the two zone routes
   in `workers/run-origin/wrangler.toml`. Use zone routes, not custom domains.
   `workers_dev` and preview URLs stay disabled on the production run Worker.
5. Deploy the main Worker first (registry/API/cost controls), then the run Worker.
   The main Worker's hourly cost monitor needs its existing Analytics token to read
   the `hashbin_run` Analytics Engine dataset as well. If `COST_SAFETY_WORKERS` is
   overridden, include `hashbin-run-prod` so platform totals include it.
6. Obtain a successful current-month run-cost snapshot. Missing or older-than-two-hour
   snapshots stop hosted traffic, as does `COST_SAFETY_HARD_STOP`. The monitor runs
   independently of the main platform cost query. Start with no enabled apps.
7. Verify the apex explanation, www redirect, an unknown app's 404, and an enabled
   pilot's `/health`, frame headers and SDK handshakes. Then opt in the pilot app.
   Publish the SDK v0.4.0 artifacts together with its docs/immutable headers.

## Pinning and renewal

`workers/run-origin/runtimes.json` is intentionally empty until a consumer selects
files. It is a build-time allowlist; no runtime URL is a generic upload/CDN proxy.
Pin only what the consumer loads. Collect core-file SHA-256 values from an upstream
release into a JSON object mapping relative paths to hex hashes. Pyodide package
hashes may come from a separately obtained `pyodide-lock.json` (`--lock`).

```sh
node scripts/publish.mjs authorize --limit 5 --max-retention 120
node scripts/pin-runtime.mjs pyodide 0.27.7 https://UPSTREAM/pyodide/v0.27.7/full/ \
  pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip \
  --hashes /path/to/upstream-core-sha256.json --lock /path/to/pyodide-lock.json
```

Use the operator's HashBin account and set its default upload retention to 120 months
before uploading. OAuth uploads use the account default, narrowed by their grant;
the CLI cannot override that policy. The pin tool verifies all download hashes before
uploading through the stored publisher grant, verifies returned CIDs and maximum
retention, and atomically writes the manifest. It refuses to overwrite pinned paths.
A failed upload/retention check may leave uploaded content that needs an operator
extension or cleanup; it never writes a partial manifest. Redeploy the run Worker
after reviewing manifest changes. No upstream files were uploaded during implementation.

Renewal checklist: include **every CID in `workers/run-origin/runtimes.json`** in the
operator's regular expiration-index review. Verify ownership, retention and remaining
credit, extend before expiration and confirm that `/r/...` still serves the CID.
Never repoint an immutable runtime path to new bytes; publish a new version instead.

## Quotas, suspension and storage

An isolate limits each IP to 120 requests/minute. The registry reserves request
batches (up to 120) against each app's UTC daily cap, so adding isolates does not
multiply the cap. Unused reservations count against the cap until midnight. Usage
is flushed at most a minute apart during traffic, and after 25 seconds for short
sessions using `waitUntil`; cumulative per-reservation counts deduplicate ambiguous retries. Each day is stored
separately, keeping the 35-day history within Durable Object value size limits. An isolate
eviction can lose unflushed display counts but cannot refund reserved quota.
Daily records are pruned to 35 days on subsequent usage/reservations.

The global budget is 500 cents/month. The monitor prices Analytics Engine request
counts with a conservative CPU/R2/DO allowance, alerts at 80%, and latches a
month-specific `run_brake` at the cap. Analytics and hourly monitoring introduce
delay; this is a safety brake, not an exact bill or prepaid dollar guarantee. A
fresh snapshot is required again next month. Existing platform-wide cost controls
still apply. IP counters remain per isolate; a distributed attack can exceed one
IP's local limit and is ultimately bounded by app/global controls.

Owner settings use session-only `GET`/`PUT /api/developers/apps/:id/run`. Owners
may set only `status: 'active' | 'off'` and `allow_local`; they cannot raise the cap
or clear suspension. Admin `POST /api/admin/apps/:id/run/suspend` (JSON `reason`)
and `/restore` (JSON `{}`) require `admin:takedown` and record the actor in
`ADMIN_ACTION_LOG` before saving. Restore returns the origin to off for owner opt-in.
Deleting an app turns it off and preserves its UUID permanently. Registry decisions
are cached for up to 60 seconds, including negative answers.

No run storage is secret: all documents in an app, and other apps on the same
registered embedding origin, can access it. Treat stored data as untrusted. Opaque
mode remains the default for code from share links. Cross-origin isolation and an
offline service worker are not enabled by this rollout.

## Python Online acceptance still required

The Python Online implementation plan is [tracked in its repository](https://github.com/curtcox/PythonOnline/blob/main/todo/hosted_run_origin.md). Its pilot must
add an explicit “Keep files between runs” preference, mount IDBFS at `/home/pyodide`,
load stored files with `FS.syncfs(true)`, and flush writes with `FS.syncfs(false)`
before confirming save. Only opt-in runs use hosted mode; link code stays opaque by
default. Pin the selected runtime files, test persistence/isolation in its own
browser suite, and test real Safari retention before promising long-lived storage.
