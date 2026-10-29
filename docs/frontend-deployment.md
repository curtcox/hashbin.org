# Frontend Deployment Guide

## Overview

The HashBin.org frontend is served directly from the Cloudflare Worker using static assets. The frontend files are automatically deployed alongside the Worker API.

## Configuration Steps

### 1. Set Up Clerk OAuth

1. **Create a Clerk Application**
   - Go to [clerk.com](https://clerk.com) and create an account
   - Create a new application
   - Enable OAuth providers. Production enables Google and GitHub only; Apple and Microsoft
     are not configured (`todo/clerk_remaining.md` CL3)

2. **Get Clerk Keys**
   - Navigate to **API Keys** in Clerk Dashboard
   - Copy the **Publishable Key** (starts with `pk_test_` or `pk_live_`)
   - Copy the **Secret Key** (for backend use)

3. **Configure OAuth Redirect URLs**
   - Development: `http://localhost:8787`
   - Production: `https://hashbin.org`

### 2. Update Frontend Configuration

The frontend reads Clerk's publishable key from `GET /api/config`. Configure it on the
Worker rather than editing each HTML file. The auth loader selects local authentication
when `/api/config` reports `authMode: "local"`.

### 3. Set backend secrets

Configure secrets on the main production Worker:

```bash
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put OAUTH_SIGNING_KEY
```

`OAUTH_SIGNING_KEY` signs authorization/access tokens, DPoP nonces and hosted Publish
approvals. Keep it and `DOWNLOAD_TOKEN_SECRET` synchronized with the dedicated content
Worker where required; never paste secret values into HTML or public docs.

### 4. Deploy and verify

Push reviewed changes to `main`. `.github/workflows/deploy.yml` publishes the Worker and its
`frontend/` assets together after its checks. It also deploys the dedicated content Worker
and verifies the main site's health and Git SHA. The GitHub Pages build report is separate.
For manual deployments, use the repository's documented production procedure in
[deployment.md](deployment.md), including SHA injection and verification.

### Browser safety assets and bindings

- Publish `/publish`, `/js/publish.js`, the SDK, and the public browser safety/API/SDK guides
  with the same code release. The page and its session-only `/api/publish` handlers cooperate.
- Preserve `frontend/_headers`: `frame-ancestors 'none'`, `X-Frame-Options: DENY` and no-store
  on Publish; CORS for SDK modules; immutable caching on frozen version paths.
- The main `APPLICATION_REGISTRY` binding stores app origins and DPoP replay receipts. The
  dedicated content Worker must bind to that same class in the main Worker, as shown in its
  Wrangler configuration. It verifies bound tokens for funded OAuth downloads too.
- App-origin CORS comes from active registrations; do not restore a shared-host exception or
  an environment allow-list. Register each exact redirect URI and acknowledge shared origins.
- Release new SDK versions with `node scripts/release-browser-sdk.mjs vMAJOR.MINOR.PATCH`,
  add their immutable cache rule and publish their SRI hash. Never change a published version's
  bytes to apply a fix; create a new version. Unversioned `/sdk/hashbin.js` stays latest.

After deployment, verify `/health` reports the deployed commit, inspect `/publish` framing
headers, and fetch both `/docs/browser-client-safety` and `/sdk/v0.3.0/integrity.json`.
Local Chromium/WebKit tests cover the protocol, but live Clerk/social sign-in in Safari with
tracking prevention and Firefox still needs acceptance. Do not describe that as covered by local auth.

## Static Assets Configuration

The `wrangler.toml` file includes an `[assets]` section that configures static file serving:

```toml
[assets]
directory = "./frontend"
binding = "ASSETS"
```

This tells the Worker to:
- Serve files from the `frontend/` directory
- Make them available via the `ASSETS` binding
- Automatically handle content types and caching

## URL Structure

### Frontend Pages (Static Assets)
- `/` → Landing page (index.html)
- `/upload.html` → Upload page (requires auth)
- `/dashboard.html` → Dashboard (requires auth)
- `/retrieve.html` → Retrieve page (public)
- `/deposit.html` → Add funds (requires auth)
- `/publish` → Hosted save review and allowance entry (sign-in required to approve)
- `/docs/sdk`, `/docs/browser-client-safety`, `/docs/api` → Public integration guides
- `/sdk/*` → Cross-origin browser SDK modules and frozen release manifests
- `/css/*` → CSS files
- `/js/*` → JavaScript modules
- `/assets/*` → Images and icons

### Backend API
- `/api/*` → API endpoints
- `/health` → Health check endpoint

## Routing Logic

The Worker routing (in `src/index.js`) works as follows:

1. **Webhook endpoints** → Handled first (no rate limiting)
2. **API/OAuth paths** (`/api/*`, `/oauth/*`, `/health`) → API route handler
3. **Static assets** → Served from `frontend/` directory
4. **404** → If no asset or route found

## Testing Locally

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Access the frontend:**
   - Open browser to `http://localhost:8787`
   - Landing page should load with header and navigation
   - Try signing in (requires Clerk configuration)

3. **Test API endpoints:**
   ```bash
   curl http://localhost:8787/health
   curl http://localhost:8787/api/balance -H "Authorization: Bearer <token>"
   ```

## Environment-Specific Configuration

### Development
- Use `pk_test_` Clerk keys
- The repo has one production deployment; use local mode for isolated development
- Local dev: `http://localhost:8787`

### Production
- Use `pk_live_` Clerk keys
- Custom domain: `https://hashbin.org`
- Ensure production Clerk app is configured

## CORS Configuration

API CORS allows active registered app origins only. The cross-origin SDK asset paths need `Access-Control-Allow-Origin: *` from `frontend/_headers`; other UI assets are normally served from the same origin. Do not remove the SDK rule when updating documentation or release caching.

## Troubleshooting

### Frontend not loading
1. Check that `frontend/` directory exists and has files
2. Verify `wrangler.toml` has correct `[assets]` configuration
3. Check browser console for errors
4. Ensure Wrangler version supports assets (4.0.0+)

### Sign In not working
1. Verify Clerk publishable key is correct in HTML files
2. Check Clerk dashboard for OAuth provider configuration
3. Ensure redirect URLs are configured in Clerk
4. Check browser console for Clerk SDK errors

### Balance not loading
1. Verify user is authenticated (check auth state)
2. Ensure backend `/api/balance` endpoint is working
3. Check that `CLERK_SECRET_KEY` is set in Worker secrets
4. Verify JWT token is being sent in Authorization header

### Protected pages not redirecting
1. Check auth-gate.js is imported and called
2. Verify Clerk SDK is loaded and initialized
3. Check browser console for JavaScript errors

## Next Steps

After deployment:
1. Test OAuth sign-in with all providers
2. Verify balance display works
3. Test protected page redirects
4. Check session persistence
5. Test on multiple browsers
6. Mobile responsive testing

## Additional Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/configuration/assets/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [HashBin.org API Docs](../docs/API.md)
