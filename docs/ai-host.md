# AI credential host

`https://ai.hashbin.page` is a static-assets-only Cloudflare deployment (`hashbin-ai-host`)
that holds users' AI provider keys for opt-in Fragment Kit editors. It holds no HashBin
account sessions, runs no application code, has no HashBin publisher app ID and is separate
from editor, preview, account and run origins. No API keys or model weights are packaged.

## Entries

Each entry is an immutable directory built from one published Fragment Kit release, and its
CSP allows framing only by the editors listed for it.

| Entry | Kit | Allowed editor origins | Config |
|-------|-----|------------------------|--------|
| `/v0.4.0/host.html` | 0.4.0 | `python.hashbin.page` | `scripts/ai-host.config.json` |
| `/v0.4.3/host.html` | 0.4.3 | `r.hashbin.page` | `scripts/ai-host-r.config.json` |
| `/fleet-v0.4.3/host.html` | 0.4.3 | `gnuplot`, `livelier`, `audio`, `pages`, `manim`, `apptron`, `sheets`, `modl`, `gripeline` (all `.hashbin.page`) | `scripts/ai-host-fleet.config.json` |
| `/slides-v0.4.4/host.html` | 0.4.4 | `slides.hashbin.page` | `scripts/ai-host-slides.config.json` |

The live `https://ai.hashbin.page/release.json` lists the entries, kit versions and the hash
of every served asset. `validateAiHost` in `scripts/deploy-ai-host.mjs` refuses any config
whose origins differ from the registered list for its entry, so adding an editor is a code
change that gets reviewed.

The fleet entry sends COOP `same-origin`, COEP `require-corp` and CORP `cross-origin` (for
Apptron). Because WebKit severs popup openers and partitions message channels under those
policies, the fleet entry hands credentials over with a consumer-owned encrypted handoff:
WebCrypto ECDH P-256 plus AES-GCM, with the nonce, kind and app bound as additional data. The
host stores only public keys and ciphertext; the receiving private key is non-extractable and
stays in memory, and every completed, expired, cancelled or invalid transfer is deleted. OAuth
PKCE callbacks use the same handoff after scrubbing the callback URL. A key is stored as
plaintext only if the user picks **Remember** on this host, and keys never reach an editor
origin. This is a host UI adapter, not a change to the pinned kit bytes; the kit's MIT license
ships as `LICENSE-fragment-kit`.

## Deploying

Dispatch `.github/workflows/deploy-ai-host.yml` only with the owner's approval; the
`ai-host-production` environment should have the owner as a required reviewer. It does not
deploy the main site. The workflow:

1. Checks out the exact kit tags for every entry (v0.4.0, v0.4.3, v0.4.4) and runs the
   host unit tests.
2. Runs `node scripts/deploy-ai-host.mjs kit previous-kit slides-kit`, which verifies each
   published kit manifest, stages every entry, scopes each CSP to its own directory, writes
   `release.json` and the Wrangler config to `build-reports/ai-host/`, and checks that every
   previously published versioned byte is unchanged. It refuses to overwrite a staged version.
3. Runs `tests/ai-host-fleet.mjs` in Chromium, Firefox and WebKit: popup consent, PKCE, session
   keys, Forget and stale-popup rejection, with synthetic keys and mocked providers (no paid calls).
4. Runs `scripts/secure-ai-host.mjs`, which checks the hostname's HTTP→HTTPS redirect rule
   (`fragment_kit_ai_force_https`, paths and queries kept). Creating or changing that rule needs
   zone read and redirect-rule write permissions; a missing rule or permission stops the deploy.
5. Deploys with Wrangler.

Every deployment must assemble all earlier entries as well as the new one: publishing only a new
directory would delete the old entry points. Never rewrite old kit assets or move a release tag.

To add an entry: release the kit and review consumer adoption first, add a config and its
registered origin list in `deploy-ai-host.mjs`, check out the new tag in the workflow, and keep
new consumers in paste/direct mode until their live checks pass. After dispatch, verify HTTPS
and HSTS, asset hashes against `release.json`, response CSP, refusal of non-allowlisted frames,
per-app popup consent, memory-only and remembered keys, and Forget. Then record the run in
`STATUS.md`.

## Known limits

- Browser checks run Chromium, Firefox and Playwright WebKit on Linux. Native Safari, GPU
  engines and untested providers are unverified.
- Chromium and Firefox share top-level-to-frame localStorage, IndexedDB and Cache. WebKit shares
  localStorage but partitions IndexedDB and Cache; the session handoff still works there. Measure
  native Safari storage before relying on cross-app persistence.
- Encrypted handoff leftovers after a crash cannot be recovered, because the in-memory private
  key is gone.

Machine-readable acceptance receipts: [ai-host-acceptance.json](ai-host-acceptance.json) (Python
and R entries) and [ai-fleet-host-acceptance.json](ai-fleet-host-acceptance.json) (fleet entry).
