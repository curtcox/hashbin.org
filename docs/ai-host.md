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
