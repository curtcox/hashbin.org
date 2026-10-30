# First-party app domains

The owner selected this layout on 2026-10-30:

| Domain | Role |
|---|---|
| `hashbin.org` | Accounts, sign-in, approval, payments, API, SDK and documentation |
| `hashbin.page` | One first-party editor per subdomain |
| `hashbin.us` | Preview hosts; currently `pages.hashbin.us` |
| `hashbin.app` | Existing UUID-based persistent execution origins; unchanged |

This keeps the account origin on its established domain and reserves `hashbin.app` for its existing execution storage. Editors and previews use different registrable domains, so a preview is also cross-site from its editor. Each editor gets its own origin, isolating browser storage and service workers from the other editors.

Editor subdomains are `pages`, `python`, `manim`, `gnuplot`, `sheets`, `modl`, `diagram`,
`upload` and `textpad`. Every editor uses `/` as its registered web return URL. Textpad
also retains its Expo and Flutter OAuth schemes. Python's old GitHub embedder was retired
after the owner confirmed that persistent files were backed up. App IDs are unchanged.

This implements browser-client-safety B1 for these first-party apps. H6's customer app hosting,
CID manifests, billing and moderation remain separate, unimplemented work.

## Hosting and source

Each app is a separate Cloudflare Workers **static-assets-only** deployment named
`hashbin-client-<slug>`. There is no application server, secret binding, wildcard DNS route,
or runtime code added to an editor. Exact Custom Domains create Cloudflare-managed DNS records
and certificates. The GitHub Pages copies remain at their original addresses for migration.
Do not configure GitHub Pages CNAME redirects: that would strand access to old-origin drafts.

`scripts/owned-apps.mjs` is the address/app-ID registry. `scripts/deploy-owned-apps.mjs` copies
only explicit public-asset allowlists into ignored `build-reports/owned-apps/<slug>/public`.
It rejects symlinks, secrets/development directories and files over 25 MiB. Textpad and the
report helpers pin SDK v0.4.0; native app code is unaffected. Pages' production index names
the preview host and the staged offline manifest hashes those final configured bytes.
`release.json` records source repository/revision, dirty state and deployed asset hashes.

The sibling checkouts must exist beside this repository. `GnuPlotOnline` is the local folder
name of the `curtcox/GnuplotOnline` repository. Sheets uses its existing staging allowlist.

```sh
node scripts/deploy-owned-apps.mjs all                 # stage only; no remote writes
node scripts/deploy-owned-apps.mjs pages --deploy      # publish one app
node scripts/deploy-owned-apps.mjs pages-preview --deploy
```

For reproducible releases from committed public sources, dispatch the dedicated workflow:

```sh
gh workflow run deploy-owned-apps.yml -f app=pages
```

Its choices include `all` and every slug. It checks out each client's current main branch and
uses the existing Cloudflare account/token secrets. Client GitHub Pages workflows still deploy
their recovery copies; dispatch the central workflow after subsequent client changes to update
the canonical site. Never reassign an app hostname to another owner.

## Pages preview boundary

The editor has a restrictive script policy. Online previews load
`https://pages.hashbin.us/preview.html`; that trusted relay runs user HTML only in an opaque
child without `allow-same-origin`. Messages check source, exact origin and a per-render token,
and forward bounded JSON fields. The preview response permits only the editor/preview ancestry.
It stores no HashBin credentials. When offline, the verified packaged local host preserves the
same opaque child boundary; no external preview fetch is needed.

## Moving existing work

Old copies offer **Move saved work** and **Download backup**. The popup uses source/origin/nonce
checks, and the new app's `/migration.html` requires **Restore and open app** before writing.
File import is also available there. Only these known values can move:

- Pages' project, Python's program/input/options, and Gnuplot's complete saved document.
- The upload helper's public client-ID preference.
- Textpad's current unsaved textarea contents.
- Current document/share-link parameters for the other editors.

The old copy is kept. Tokens, DPoP keys, arbitrary storage and Python's persistence permission
are excluded. Imported Python starts with persistence off. OAuth/Publish callback parameters
are discarded. Old files under `hashbin.app` are not part of this transfer; storage partitioning
changes when moving the editor's top-level site. Keep a separate backup of persistent files.

`node scripts/install-owned-app-notices.mjs` regenerates the common legacy notice in the client
repos, updates their offline manifests, and regenerates Textpad documentation. Review and test
those changes before committing. It does not deploy or delete drafts.

## Verification and rollback

```sh
npx vitest run scripts/deploy-owned-apps.test.js
node scripts/test-owned-app-migration.mjs
node scripts/verify-owned-apps.mjs
```

Set `OWNED_CHROMIUM_PATH` if the root project's expected Chromium revision is unavailable.
The browser checks use isolated test profiles and never approve a paid upload. Live verification
records `build-reports/owned-apps/live-verification.json`; it exercises actual Pyodide and Gnuplot,
all app starts, Pages' cross-site opaque preview, editor CSP and offline fallback. The migration
test moves fixture drafts between two real local origins and checks that credentials do not move.
Firefox's installed macOS build still fails before app startup; the client CI matrices retain it.

After deployment, verify each registration contains only its canonical web origin (plus native
Textpad schemes), refresh the developer safety checks, and verify the Python run-origin CSP
allows `https://python.hashbin.page` and refuses `https://curtcox.github.io`.

Use Wrangler's rollback command for the affected `hashbin-client-*` deployment, then rerun live
checks. Returning to an old editor URI also requires an explicit registry change; do not silently
restore the shared GitHub embedder. No DNS changes are needed for ordinary asset rollbacks.

Subdomains have separate storage but remain same-site within each parent domain. Set no
parent-domain cookies. PSL inclusion remains a separate follow-up, not a prerequisite for B1.

## Safety report outcome (2026-10-30)

| App | Original findings | Result and recommendation |
|---|---|---|
| Gnuplot Online | Shared origin; same-origin worker | Shared-origin finding resolved by B1. Retain the worker advisory: the WASM interpreter still runs within its editor origin. See the assessment below. |
| HashBin Textpad | Two unpinned SDK findings across web return pages | Canonical site pins SDK v0.4.0 with SRI and a hash-based script policy; old web callbacks retired. All clear. Native schemes retained. |
| HashBin Diagram Editor | Shared origin | Dedicated editor origin, pinned helper SDK and CSP. All clear. |
| Manim Online | Shared origin | Dedicated editor origin; existing isolated execution retained. All clear. |
| Manual Override Diagram Language | Shared origin | Dedicated editor origin, pinned helper SDK and CSP. All clear. |
| Pages Online | Shared origin | Dedicated editor plus separate preview site, opaque user frame and strict editor CSP. All clear. |
| Python Online | Shared origin | Dedicated editor; old shared embedder removed from hosted execution policy after owner-confirmed backup. All clear. |
| Registered upload helper | Shared origin | Dedicated editor origin, pinned helper SDK and CSP. All clear. |
| Sheets | Shared origin | Dedicated editor origin; existing runtime isolation retained. All clear. |

Gnuplot's worker is a fixed runner that passes user Gnuplot programs and files to the bundled
WASM engine; it does not intentionally evaluate user JavaScript. B1 removes access to other
apps' origin storage, but cannot remove the worker's access to its own origin. Keep per-save
HashBin approval, verified assets and sanitized SVG output, and do not add stored allowances
to this origin. For a stronger interpreter boundary, move the runner to an isolated execution
origin with a narrow message protocol, bounded inputs/outputs and no editor storage access.
That runtime migration needs its own renderer/terminal/offline acceptance checks; it remains
a follow-up rather than suppressing the scanner's advisory.

The central [committed-source deployment](https://github.com/curtcox/hashbin.org/actions/runs/41095235607)
published all ten bundles successfully. Live checks exercised all nine editors, actual Python
and Gnuplot execution, Pages isolation/CSP/offline behavior, and a real two-origin draft
transfer for Pages, Python and Textpad. Real-provider sign-in acceptance in Safari/Firefox
remains separate from these rendering checks.
