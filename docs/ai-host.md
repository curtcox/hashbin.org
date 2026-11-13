# AI host deployment

The static credential origin is `https://ai.hashbin.page`, with three immutable
entry points. `/v0.4.0/host.html` allows only `https://python.hashbin.page`;
`/v0.4.3/host.html` allows only `https://r.hashbin.page`. The `/fleet-v0.4.3/host.html` entry allows the nine canonical origins listed below. All three are deployed and
verified. No HashBin publisher app ID is invented: this host holds neither
account sessions nor execution origins.

The manual workflow requires both actual published kit manifests, stages
verified public assets, applies the kit CSP/frame-ancestors headers and uses a
separate static-assets-only Cloudflare deployment. No API keys or weights are
packaged. Add required owner reviewers to the `ai-host-production` environment
before dispatch. Do not dispatch without owner approval. No main-site deployment
is needed to publish this host.

For a new version, release the kit and review its consumer adoption first. After
dispatch, verify HTTPS, versioned asset hashes, response CSP, blocked non-allowlisted
frames, per-app popup consent, memory-only/remembered-key behavior and Forget app.
Measure actual Safari/Firefox storage before relying on cross-app persistence.
Keep new consumers in paste/direct mode until their live checks pass. Record the workflow,
Cloudflare version and browser results before marking it deployed in STATUS.md.

The first deployment contained one version. Every future deployment must assemble
all previously published version directories as well as the new one; publishing
only a new directory would remove old entry points. Never rewrite old kit assets
or move a release tag. The stager refuses to overwrite an existing version.

The deployment configures a hostname-specific Cloudflare redirect from HTTP to
HTTPS, preserving paths and query strings, and sends HSTS. It changes only its
`fragment_kit_ai_force_https` rule; other app rules are retained. The owner can
configure this rule once in Cloudflare. Subsequent deployments
verify the public redirect without requesting zone access. Creating or changing
the rule through the API requires zone read and redirect-rule write permissions;
a missing rule and insufficient permission stop deployment. The host remains
static assets without application code.

## Deployed pilot receipt — 2026-11-08

[Deployment 42522697907](https://github.com/curtcox/hashbin.org/actions/runs/42522697907)
published Cloudflare version `12b0350c-a29e-43bc-ad2d-1ca2175b869a`. All 93
servable assets matched the deployment inventory and every previously deployed
`v0.4.0` byte remained unchanged. HTTP returns 301 to HTTPS with the exact path
and query; HTTPS sends HSTS, the exact Python frame allowlist, no-referrer and
nosniff. The owner configured only the AI hostname redirect through Cloudflare.

The actual host frame, same-origin credential popup, session-only key handoff and
Forget action passed in isolated Chromium and Playwright WebKit. A synthetic key
and mocked provider response were used; these checks spent no provider credits.
App storage and URLs contained no key, and the host did not remember it.

Top-level to same-site frame storage shared localStorage, IndexedDB and Cache in
Chromium. WebKit shared localStorage but partitioned IndexedDB and Cache. WebKit
is not native Safari; Firefox and native Safari storage remain unmeasured here.
The session credential handoff passed despite WebKit storage partitioning. See
[the machine-readable receipt](ai-host-acceptance.json).

## Deployed R adoption receipt — 2026-11-09

The R migration adds published Fragment Kit 0.4.3 at `/v0.4.3/host.html`,
allowing only `https://r.hashbin.page`. Python keeps its immutable 0.4.0
entry point and Python-only frame/connection policy. The workflow checks out
both exact release tags, independently verifies both published manifests, and
assembles both directories; no existing version is dropped or rewritten.
The root Cloudflare header file scopes each CSP to its version directory.
No app keys, runtime secrets, execution policy or account registration change.
[Deployment 42538709784](https://github.com/curtcox/hashbin.org/actions/runs/42538709784)
published Cloudflare version `47679755-d7f3-4b9d-be3e-4cfacb740a15` from
`19d94b453e27a8479f5e52de6e450e0b74e40a2c`. All 186 servable files matched
the independently verified staged pins. Every previously deployed Python
versioned byte and its exact frame policy remained unchanged. Both versioned
host URLs upgrade HTTP to HTTPS, retaining path/query, and send HSTS,
no-referrer and nosniff.

[Manual browser run 42538939542](https://github.com/curtcox/R/actions/runs/42538939542)
passed real deployed-host popup, session-key handoff, provider transport,
credential isolation and Forget in Chromium, Firefox and WebKit on Linux.
Provider responses were mocked and keys synthetic; no paid calls occurred.
Chromium/Firefox shared top-level-to-frame localStorage, Cache and IndexedDB.
WebKit shared localStorage and partitioned Cache/IndexedDB; session handoff
still passed. Native Safari and GPU behavior remain unverified.

The styled R client source at `16b8039811a6b4c7b0284bb862bba04177546b47`,
routed at its canonical origin, also passed settings, real host popup,
streaming proposal, review and acceptance in Chromium/WebKit. Accepted code
did not auto-run and no key entered app storage. This source-integration
check does not claim the R editor itself was already deployed. Its separate
canonical/recovery deployment receipts are maintained in
[Fragment Kit's R rollout](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/blob/main/todo/r_ai_acceptance.json).

## Deployed remaining-client host — 2026-11-12

The new `/fleet-v0.4.3/` entry is deployed. It uses the published 0.4.3 kit, exact canonical origins for Gnuplot, Livelier, Audio, Pages, Manim, Apptron, Sheets, MODL and Gripeline, and a separate per-app storage prefix. Python `/v0.4.0/` and R `/v0.4.3/` remain immutable.

Apptron retains its existing isolation. The new entry keeps COOP `same-origin`, COEP `require-corp` and CORP `cross-origin`. WebKit severs popup openers and partitions message channels under these policies, so a consumer-owned handoff encrypts temporary credentials with WebCrypto ECDH P-256 and AES-GCM. Only the host stores public keys and ciphertext, with additional data binding the nonce, kind and app; the receiving private key is nonextractable and stays in memory. Successful, expired, cancelled and invalid transfers are deleted. A session key is never written as plaintext unless the user explicitly selects Remember on this host. Encrypted leftovers after a crash cannot be recovered without the lost in-memory private key. OAuth PKCE callbacks use the same bounded encrypted handoff after scrubbing the callback URL. Keys never cross to an editor origin.

This is a host UI adapter, not a new kit engine or a modification of pinned vendor bytes. Its MIT license is shipped as `LICENSE-fragment-kit`. Native Safari, GPU engines and untested providers remain unverified. Deployment evidence is recorded below.

[Run 43349881620](https://github.com/curtcox/hashbin.org/actions/runs/43349881620) published commit `89551812964eb2b6ccd8200f5801ddf73802cd87`, Cloudflare version `927ef80d-7186-4fcc-950c-f8dd29e912f7`. All 282 served files match their recorded hashes. All 188 prior versioned assets (including response-policy files) remain unchanged. HTTPS redirects retain paths and queries; all entries send HSTS. Linux Chromium, Firefox and WebKit passed manual key handoff, OAuth PKCE, session-only storage, Forget and rejection of a stale remembered-key popup with synthetic keys and mocked providers. No paid calls ran in CI. [Machine-readable receipt](ai-fleet-host-acceptance.json).

The `remaining-ai` option in the owned-app deployment workflow publishes only Gnuplot, Livelier, Audio, Pages, Manim, Apptron, Sheets, MODL and Gripeline. It excludes Python, R and helper sites. This host receipt does not claim those clients were already deployed.
