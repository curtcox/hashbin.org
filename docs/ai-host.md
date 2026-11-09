# AI host deployment candidate

This is a prepared integration, not a deployment receipt. The origin is
`https://ai.hashbin.page`, with the Fragment Kit 0.4.0 host at `/v0.4.0/host.html`.
Only `https://python.hashbin.page` is allowlisted. No HashBin app ID is invented:
this is a static credential host, not a HashBin publisher or execution origin.

The manual workflow requires the actual published v0.4.0 kit manifest, stages
verified public assets, applies the kit CSP/frame-ancestors headers and uses a
separate static-assets-only Cloudflare deployment. No API keys or weights are
packaged. Add required owner reviewers to the `ai-host-production` environment
before dispatch. Do not dispatch without owner approval. No main-site deployment
is needed to publish this host.

Before first dispatch, merge/release the kit and review the Python pilot. After
dispatch, verify HTTPS, versioned asset hashes, response CSP, blocked non-allowlisted
frames, per-app popup consent, memory-only/remembered-key behavior and Forget app.
Measure actual Safari/Firefox storage before relying on cross-app persistence.
Keep Python in direct mode until these live checks pass. Record the workflow,
Cloudflare version and browser results before marking it deployed in STATUS.md.

The first deployment contains one version. Every future deployment must assemble
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

## R adoption candidate

The R migration adds published Fragment Kit 0.4.3 at `/v0.4.3/host.html`,
allowing only `https://r.hashbin.page`. Python keeps its immutable 0.4.0
entry point and Python-only frame/connection policy. The workflow checks out
both exact release tags, independently verifies both published manifests, and
assembles both directories; no existing version is dropped or rewritten.
The root Cloudflare header file scopes each CSP to its version directory.
No app keys, runtime secrets, execution policy or account registration change.
This section records prepared source; deployment and browser verification follow.
