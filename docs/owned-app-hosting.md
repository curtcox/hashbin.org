# First-party app domains

| Domain | Role |
|---|---|
| `hashbin.org` | Accounts, sign-in, approval, payments, API, SDK and documentation |
| `hashbin.page` | One first-party editor per subdomain |
| `hashbin.us` | Preview hosts; currently `pages.hashbin.us` |
| `hashbin.app` | UUID-based persistent execution origins ([hosted-run-origin.md](hosted-run-origin.md)) |
| `ai.hashbin.page` | AI provider credential host ([ai-host.md](ai-host.md)) |

Each editor has its own origin, so browser storage and service workers are isolated from the
other editors. Editors and previews use different registrable domains, so a preview is
cross-site from its editor. Subdomains are still same-site within each parent domain: set no
parent-domain cookies. Getting the domains onto the Public Suffix List is a possible follow-up,
not a requirement.

The editors are `pages`, `python`, `manim`, `gnuplot`, `sheets`, `modl`, `diagram`, `upload`,
`textpad`, `audio`, `r`, `livelier`, `apptron`, `gripeline` and `slides`. `scripts/owned-apps.mjs`
is the registry of their source repositories, public client IDs and old GitHub Pages addresses.
Every editor's registered web return URL is exactly its canonical origin with path `/`; Textpad
also keeps its Expo and Flutter OAuth schemes. Never reassign an app hostname to another owner.
Customer app hosting (H6 in `todo/app_hosting.md`) is separate and not built.

## Hosting and staging

Each app is a separate static-assets Cloudflare deployment named `hashbin-client-<slug>` on an
exact Custom Domain (Cloudflare creates the DNS record and certificate). There are no secret
bindings or wildcard routes, and only Apptron has Worker code (below). The GitHub Pages copies
stay at their old addresses so old-origin drafts remain reachable; don't add CNAME redirects.

`scripts/deploy-owned-apps.mjs` copies only an explicit public-asset allowlist from each
client checkout into the ignored `build-reports/owned-apps/<slug>/public`. It rejects symlinks,
secret or development directories and files over 25 MiB, adds the shared recovery page
(`/migration.html`), rehashes offline manifests after its own changes, and writes `release.json`
with the source repository, revision, dirty state and every deployed asset hash. For `r`,
`livelier`, `audio`, `apptron`, `gripeline` and `slides` it refuses a bundle whose
`hashbin-client-id` meta tag differs from the registry. Textpad and the report helpers pin SDK
v0.4.0. The stager keeps each bundled Fragment Kit's root `LICENSE` even when an offline
manifest lists only `src/` and `vendor/`.

The client checkouts must sit beside this repository. `GnuPlotOnline` is the local folder for
the `curtcox/GnuplotOnline` repository.

```sh
node scripts/deploy-owned-apps.mjs all                 # stage only; no remote writes
node scripts/deploy-owned-apps.mjs pages --deploy      # publish one app
node scripts/deploy-owned-apps.mjs pages-preview --deploy
```

For releases from committed sources, dispatch the workflow, which checks out each client's
`main`, builds the clients that need it (gripeline's site builder; Slidev's pnpm workspace,
runtime and `--release` bundle) and deploys with the repository's Cloudflare secrets:

```sh
gh workflow run deploy-owned-apps.yml -f app=pages
```

Choices are every slug, `pages-preview`, `all`, and `remaining-ai` (the nine fleet AI
editors: Gnuplot, Livelier, Audio, Pages, Manim, Apptron, Sheets, MODL and gripeline). Client
repositories' own workflows still update their GitHub Pages recovery copies; dispatch this
workflow after a client change to update the canonical site.

### Per-app notes

- **Pages:** the editor has a strict script policy. Online previews load
  `https://pages.hashbin.us/preview.html`, a relay that runs user HTML only in an opaque child
  frame without `allow-same-origin`. Messages check source, exact origin and a per-render token,
  and forward bounded JSON fields. The preview stores no HashBin credentials. Offline, the
  packaged local host keeps the same opaque boundary. Pages' production index names the preview
  host, and its offline manifest hashes those configured bytes.
- **Sheets:** its R interpreter needs the trusted `src/workers/sandbox-host.html` frame. Only that
  URL and its extensionless form allow `frame-ancestors 'self'`; everything else keeps `'none'`.
  The rule detaches the blanket CSP first, because matching
  [Cloudflare header rules](https://developers.cloudflare.com/workers/static-assets/headers/)
  otherwise accumulate. The staged offline version includes the response policy, so a
  header-only fix still updates offline copies.
- **Apptron:** its locked runtime has files above Cloudflare's 25 MiB static-asset limit. The
  deployment splits verified files into 20 MiB chunks and a narrow Worker streams them at the
  original runtime URLs; direct chunk paths are refused and other files are plain static assets.
  The paired same-origin VM needs COOP/COEP and allows self-framing; other apps keep
  `frame-ancestors 'none'`. The runtime lock and manifest are readable cross-origin so gripeline
  can verify the released overlay; VM files and network settings are not exposed.
- **gripeline:** staged from the site builder's explicit inventory at `site/_site/editor/`. The
  shared GitHub Pages mirror always disables publishing.
- **Slides (Slidev Online):** staged from `curtcox/slidev` `online/dist`; the stager adds the
  migration modules and rehashes its offline manifest with the `slidevonline-` prefix. The
  publisher's `release.json` is kept out of that manifest.
- **Gnuplot:** the WASM engine runs in a worker on the editor origin. It runs user Gnuplot
  programs, not user JavaScript, but it shares the editor's storage, so the app-safety report
  keeps an advisory for it. Keep per-save approval, verified assets and sanitized SVG output,
  and don't add stored allowances to this origin. Removing the advisory means moving the runner
  to an isolated execution origin with a narrow message protocol.

## Moving existing work

Old copies built on Fragment Kit offer **Move saved work** and **Download backup** under More.
The popup checks source, origin and nonce, and the new app's `/migration.html` requires
**Restore and open app** before writing; file import is also available there. Only known values
move:

- Pages' project, Python's program, input and options, and Gnuplot's and Audio Online's saved documents.
- The upload helper's public client-ID preference.
- Textpad's unsaved textarea contents.
- gripeline's source, positions and draft history (no execution settings).
- The current document or share-link parameters for the other editors.

The old copy is kept. Tokens, DPoP keys, arbitrary storage and Python's persistence permission
never move; imported Python starts with persistence off, and OAuth or Publish callback
parameters are discarded. Files stored under `hashbin.app` don't move either, so users should
back up persistent files separately.

`node scripts/install-owned-app-notices.mjs` regenerates the legacy notice in the client repos,
updates their offline manifests and regenerates the Textpad docs. Review and test those changes
before committing; it does not deploy or delete drafts.

## Verification and rollback

```sh
npx vitest run scripts/deploy-owned-apps.test.js
node scripts/test-owned-app-migration.mjs
node scripts/verify-owned-apps.mjs
```

Set `OWNED_CHROMIUM_PATH` if the expected Chromium revision is unavailable. The browser checks use
isolated profiles and never approve a paid upload. Live verification writes
`build-reports/owned-apps/live-verification.json`: it starts every app, runs real Pyodide and
Gnuplot, waits for a rendered R plot in the Sheets Quarto gallery example, and checks Pages'
cross-site opaque preview, editor CSP and offline fallback. The migration test moves fixture
drafts between two real local origins and checks that credentials stay behind. Firefox's
installed macOS build fails before app startup, so Firefox coverage comes from the client
repositories' CI.

After a deployment that changes registrations, check that each registration lists only its
canonical web origin (plus Textpad's native schemes), refresh the developer safety report, and
check that the Python run-origin CSP allows `https://python.hashbin.page` and refuses
`https://curtcox.github.io`.

To roll back, use `wrangler rollback` for the affected `hashbin-client-*` deployment and rerun
the live checks. Pointing an app back at an old address also needs a registry change. Asset
rollbacks need no DNS changes.
