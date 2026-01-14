# Frontend Deployment Guide

## Overview

The HashBin.org frontend is served directly from the Cloudflare Worker using static assets. The frontend files are automatically deployed alongside the Worker API.

## Configuration Steps

### 1. Set Up Clerk OAuth

1. **Create a Clerk Application**
   - Go to [clerk.com](https://clerk.com) and create an account
   - Create a new application
   - Enable OAuth providers: Google, Apple, Microsoft, GitHub

2. **Get Clerk Keys**
   - Navigate to **API Keys** in Clerk Dashboard
   - Copy the **Publishable Key** (starts with `pk_test_` or `pk_live_`)
   - Copy the **Secret Key** (for backend use)

3. **Configure OAuth Redirect URLs**
   - Development: `http://localhost:8787`
   - Production: `https://hashbin.org`

### 2. Update Frontend Configuration

The Clerk publishable key needs to be configured in each HTML file:

**For Development:**
```javascript
window.CLERK_PUBLISHABLE_KEY = 'pk_test_xxxxxxxxxxxxx';
```

**For Production:**
```javascript
window.CLERK_PUBLISHABLE_KEY = 'pk_live_xxxxxxxxxxxxx';
```

Files to update:
- `frontend/index.html`
- `frontend/upload.html`
- `frontend/dashboard.html`
- `frontend/retrieve.html`
- `frontend/deposit.html`

### 3. Set Backend Secrets

Add Clerk secret key to Cloudflare Workers:

```bash
# Development
npx wrangler secret put CLERK_SECRET_KEY --env development
# Enter your Clerk secret key when prompted

npx wrangler secret put CLERK_PUBLISHABLE_KEY --env development
# Enter your Clerk publishable key when prompted

# Production
npx wrangler secret put CLERK_SECRET_KEY --env production
npx wrangler secret put CLERK_PUBLISHABLE_KEY --env production
```

### 4. Deploy

```bash
# Development
npm run deploy:dev

# Production  
npm run deploy:prod
```

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
- `/css/*` → CSS files
- `/js/*` → JavaScript modules
- `/assets/*` → Images and icons

### Backend API
- `/api/*` → API endpoints
- `/health` → Health check endpoint

## Routing Logic

The Worker routing (in `src/index.js`) works as follows:

1. **Webhook endpoints** → Handled first (no rate limiting)
2. **API paths** (`/api/*`, `/health`) → API route handler
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
- Worker URL: `https://hashbin-worker-dev.<account-id>.workers.dev`
- Local dev: `http://localhost:8787`

### Production
- Use `pk_live_` Clerk keys
- Custom domain: `https://hashbin.org`
- Ensure production Clerk app is configured

## CORS Configuration

CORS is handled automatically by the Worker for API routes. Static assets don't require CORS headers since they're served from the same origin.

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
