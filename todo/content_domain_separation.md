# Content Domain Separation: hashbin.org + 256t.us

## Motivation

User-uploaded files (HTML, SVG, JS, etc.) currently share an origin with the admin
UI, API, and auth cookies. A malicious upload served from `hashbin.org` can steal
session cookies, make authenticated API requests, render phishing UI, access Clerk
auth storage, or register service workers — all because the browser treats it as
same-origin.

Serving uploads from `256t.us` eliminates these vectors via the browser's same-origin
policy. This is the same pattern used by GitHub, Google Drive, and Discord.

---

## Architecture

```
hashbin.org                              256t.us
  UI, API, auth, admin, SDK, SFWA          Raw content only: GET /{cid}(.{ext})?
  Writes to R2 on upload ──────────────►   Reads from same R2 bucket
                                           No auth, no cookies, no UI, no secrets
```

Both workers bind the same R2 bucket (`hashbin-content-256t-prod`) as `CONTENT_BUCKET`.
`BACKUP_BUCKET` binding on hashbin.org is unchanged.

---

## Phase 1: Infrastructure Setup

### 1.1 Cloudflare DNS for 256t.us
- [ ] Add proxied AAAA record for `256t.us` → `100::`
- [ ] Add proxied AAAA record for `www.256t.us` → `100::` (redirect to apex)
- [ ] Verify TLS is active

### 1.2 R2 Buckets
- [ ] Create `hashbin-content-256t-prod`
- [ ] Create `hashbin-content-256t-dev`
- [ ] Delete old `hashbin-content-prod` bucket (data can be discarded)

### 1.3 256t.us Worker Project
- [ ] Create `workers/256t-content/` in this repo (minimal, no dependency on hashbin.org code)
- [ ] Create wrangler.toml:
  ```toml
  name = "256t-content-prod"
  main = "src/index.js"
  compatibility_date = "2024-12-01"

  [[r2_buckets]]
  binding = "CONTENT_BUCKET"
  bucket_name = "hashbin-content-256t-prod"

  [routes]
  route = { pattern = "256t.us/*", zone_name = "256t.us" }

  [vars]
  ENVIRONMENT = "production"
  ```

---

## Phase 2: 256t.us Worker Implementation

### 2.1 Core Content Server
- [ ] `GET /{cid}` — R2 lookup, return with stored `Content-Type`
- [ ] `GET /{cid}.{ext}` — override Content-Type based on extension
- [ ] CID pattern: `^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$`
- [ ] Inline content support (≤64 bytes encoded in CID, no R2 read)
- [ ] `?download=true` → `Content-Disposition: attachment`

### 2.2 Security Headers (on every response)
- [ ] `Content-Security-Policy: default-src 'none'; sandbox`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Access-Control-Allow-Origin: *`
- [ ] `Cache-Control: public, max-age=31536000, immutable`
- [ ] Never set `Set-Cookie`

### 2.3 Error Handling
- [ ] 404 for missing/expired content
- [ ] 451 for disputed content (check `{cid}.disputed` marker object in R2)
- [ ] 429 for rate-limited requests (per-IP)
- [ ] Minimal plain-text error responses

### 2.4 Dispute & Expiration Checks
R2 custom metadata can't be updated without re-uploading the object body, so:
- [ ] **Disputes**: check for `{cid}.disputed` marker object in R2 (tiny, O(1) to write/delete)
- [ ] **Expiration**: store `expires_at` in R2 `httpMetadata.cacheExpiry` on upload,
      or read `expires_at` from a `{cid}.meta` marker object

### 2.5 Health
- [ ] `GET /health` → 200 OK

---

## Phase 3: hashbin.org Worker Changes

### 3.1 Retarget R2 Bucket
- [ ] In `wrangler.toml`, change `CONTENT_BUCKET` bucket_name from `hashbin-content-prod`
      to `hashbin-content-256t-prod` (binding name stays `CONTENT_BUCKET` — no code changes)

### 3.2 Upload Response
- [ ] `POST /api/content` response: add `"url": "https://256t.us/{cid}"` field

### 3.3 Remove Content Serving
- [ ] Remove `GET /{cid}` and `GET /{cid}.{ext}` route handlers from `src/index.js`

### 3.4 Content Metadata API
- [ ] `GET /api/content/{cid}` response: add `"url": "https://256t.us/{cid}"` field
- [ ] `GET /api/content/{cid}` response: add `"download_domain": "256t.us"` field

### 3.5 Dispute Writes
- [ ] On dispute filed: write `{cid}.disputed` marker object to R2
- [ ] On dispute resolved: delete `{cid}.disputed` marker object from R2

### 3.6 Environment Variables
- [ ] Add `CONTENT_DOMAIN = "256t.us"` env var (used in URL construction)
- [ ] Add `content_domain` field to `/api/config` response
- [ ] 256t.us worker needs no secrets

---

## Phase 4: Frontend Updates

### 4.1 Content URL Construction
- [ ] Add `content_domain` to `/api/config` response (reads `CONTENT_DOMAIN` env var)
- [ ] Add `contentUrl(cid, ext)` helper to `frontend/js/utils.js`
- [ ] `frontend/info.html` — download links → `https://256t.us/${cid}`
- [ ] `frontend/js/retrieve.js` — download links
- [ ] `frontend/js/rate-limit-purchase.js` — view/download links
- [ ] `frontend/dashboard/uploads/detail.html` — view/download links

### 4.2 SDK
- [ ] `frontend/sdk/hashbin.js` — add `contentBaseUrl` option (defaults to `https://256t.us`)
- [ ] Download/retrieve methods use `contentBaseUrl`; upload methods use `baseUrl`

### 4.3 Developer Docs
- [ ] `frontend/developers.html` — update code examples
- [ ] `frontend/developers/index.html` — update SDK examples
- [ ] `frontend/docs/sdk.html` — update SDK reference
- [ ] `frontend/docs/api.html` — update base URL docs, explain content domain

Note: SFWA editor stays on `hashbin.org/sfwa/` — client-side decoded, no server storage.

---

## Phase 5: Documentation

### 5.1 Content Security Page
Create `frontend/docs/content-security.html` covering:
- [ ] **What**: uploads served from `256t.us`, everything else stays on `hashbin.org`
- [ ] **Why**: same-origin policy, cookie theft, CSRF, phishing, service worker hijacking.
      Explain each attack vector in plain language. Reference GitHub/Google Drive/Discord precedent.
- [ ] **For users**: content URLs are `https://256t.us/{cid}`, API stays at `hashbin.org/api/`
- [ ] **What 256t.us is**: same operator, dedicated content sandbox

### 5.2 API & Deployment Docs
- [ ] `docs/API.md` — document `url` and `download_domain` fields, content domain
- [ ] `docs/deployment.md` — 256t.us worker deploy, R2 bucket, env vars

### 5.3 Working Examples
- [ ] Upload sample content (text, image, PDF)
- [ ] Verify examples render on hashbin.org and resolve on 256t.us
- [ ] Include working example URLs in docs

---

## Phase 6: CI/CD

- [ ] Update `.github/workflows/deploy.yml` to deploy both workers
- [ ] Add health check for `256t.us/health` in deploy verification
- [ ] R2 bucket creation step targets `hashbin-content-256t-prod`

---

## File Change Summary

| File | Change |
|------|--------|
| `wrangler.toml` | Retarget `CONTENT_BUCKET` to `hashbin-content-256t-prod`, add `CONTENT_DOMAIN` var |
| `workers/256t-content/` | New: 256t.us worker (wrangler.toml, src/index.js) |
| `src/index.js` | Remove `/{cid}` handlers, add `content_domain` to `/api/config` |
| `src/api/content.js` | Add `url` field to upload + metadata responses |
| `src/services/content-deletion.js` | Write/delete `{cid}.disputed` markers on dispute changes |
| `frontend/js/utils.js` | Add `contentUrl()` helper |
| `frontend/info.html` | Use 256t.us URLs for downloads |
| `frontend/js/retrieve.js` | Use 256t.us URLs |
| `frontend/js/rate-limit-purchase.js` | Use 256t.us URLs |
| `frontend/dashboard/uploads/detail.html` | Use 256t.us URLs |
| `frontend/sdk/hashbin.js` | Add `contentBaseUrl` option |
| `frontend/developers.html` | Update examples |
| `frontend/developers/index.html` | Update examples |
| `frontend/docs/sdk.html` | Update examples |
| `frontend/docs/api.html` | Update base URL docs |
| `frontend/docs/content-security.html` | New: security explanation page |
| `docs/API.md` | Document content domain, new response fields |
| `docs/deployment.md` | Add 256t.us worker deployment |
| `.github/workflows/deploy.yml` | Deploy both workers, new health check |
