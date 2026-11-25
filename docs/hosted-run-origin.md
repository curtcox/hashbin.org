# Hosted sandbox operations

The hosted sandbox (H5 in [`todo/hosted_run_origin.md`](../todo/hosted_run_origin.md), tracked under STATUS B14) runs on **hashbin.app**, served by `hashbin-run-prod`
(`workers/run-origin/`). Python Online is the only enabled app, restricted to its registered
`https://python.hashbin.page` embedder with local origins off. There are no pinned runtimes;
other registered apps default to `run.status = 'off'`.

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

Measured results are in [the JSON report](hosted-run-origin-measurements.json): Chromium and
WebKit passed; Firefox exited before opening a profile. Safari's seven-day ITP behavior remains a
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
node scripts/pin-runtime.mjs pyodide 314.0.7 https://cdn.jsdelivr.net/pyodide/v314.0.7/full/ \
  pyodide.mjs pyodide.asm.mjs pyodide.asm.wasm python_stdlib.zip pyodide-lock.json \
  --hashes /path/to/upstream-core-sha256.json --lock /path/to/pyodide-lock.json
```

Use the operator's HashBin account and set its default upload retention to 120 months
before uploading. OAuth uploads use the account default, narrowed by their grant;
the CLI cannot override that policy. The pin tool verifies all download hashes before
uploading through the stored publisher grant, verifies returned CIDs and maximum
retention, and atomically writes the manifest. It refuses to overwrite pinned paths.
A failed upload/retention check may leave uploaded content that needs an operator
extension or cleanup; it never writes a partial manifest. Redeploy the run Worker
after reviewing manifest changes.

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

## Python Online pilot

Python Online is the only enabled app. Its "Keep files between runs" preference mounts IDBFS at
`/home/pyodide`, loads stored files with `FS.syncfs(true)` and flushes writes with
`FS.syncfs(false)` before confirming a save. Only opt-in runs use hosted mode; code from links
stays opaque. Runtime files still come through the existing verified proxy, because direct
runtime pins need approved uploads. Its plan is
[in the Python Online repository](https://github.com/curtcox/PythonOnline/blob/main/todo/hosted_run_origin.md),
and its live hosted tests run there.

The hosted frame stays at `/frame/v0.4.0` for SDK v0.4.0 and loads the immutable
`/frame/v0.4.1.js` bootstrap. That script is stored as literal text, because serializing a
bundled function captured esbuild helpers that the served script lacked; a production-bundle
regression test covers this. Frame HTML is sent with `Cache-Control: no-cache, no-transform`
so Cloudflare can't inject beacons and registry policies stay fresh.

## Run-cost measurement

The hourly monitor needs `CLOUDFLARE_ANALYTICS_TOKEN` (Account Analytics Read only, installed by
the deploy workflow; rotate it before 2027-01-26 and never commit it). For fresh evidence, use
**Measure hosted run costs now** on `/admin/costs` (`POST /api/admin/cost-safety/run/refresh`,
`admin:costs`), which runs the real Analytics Engine query, records the actor and accepts no
overrides. Its SQL compares timestamps with `toDateTime`, because Analytics Engine rejects
comparing a DateTime with a bare string.

## Open items

- `hashbin.app` expires 2027-10-28 (public RDAP). PSL submission needs a longer registration
  and qualifying public use under the [PSL guidelines](https://github.com/publicsuffix/list/wiki/Guidelines).
- Direct runtime pins (`runtimes.json` is empty).
- Native Safari ITP retention and Firefox measurements, before promising long-lived storage.

Details are in [`todo/hosted_run_origin.md`](../todo/hosted_run_origin.md).
