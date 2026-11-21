/**
 * HashBin.org - Main Worker Entry Point
 * Content distribution platform using 256t hash-based addressing
 */

import { handleStripeWebhook } from './api/payments.js';
import { handleDownloadContent } from './api/content-download.js';
import { applyRateLimit, authenticate } from './auth/middleware.js';
import { handleOAuthCorsPreflight, withOAuthCors } from './auth/oauth-cors.js';
import { handleClerkWebhook } from './api/clerk-webhook.js';
import { gitShaInfo, setBundledGitSha } from './build-info.js';
import { handleApiRoutes } from './api-routes.js';
import { scheduledJobs } from './scheduled-jobs.js';

// Export Durable Object classes
export { ContentMetadata } from './durable-objects/content-metadata.js';
export { UserProfile } from './durable-objects/user-profile.js';
export { PaymentRecord } from './durable-objects/payment-record.js';
export { ContestRecord } from './durable-objects/contest-record.js';
export { MessageThread } from './durable-objects/message-thread.js';
export { PlatformStats } from './durable-objects/platform-stats.js';
export { AlertStore } from './durable-objects/alert-store.js';
export { AuditLog } from './durable-objects/audit-log.js';
export { SupplierRegistry } from './durable-objects/supplier-registry.js';
export { InfrastructureCost } from './durable-objects/infrastructure-cost.js';
export { DeletionRecord } from './durable-objects/deletion-record.js';
export { ExpirationIndex } from './durable-objects/expiration-index.js';
export { DisputeRecord } from './durable-objects/dispute-record.js';
export { DisputeIndex } from './durable-objects/dispute-index.js';
export { AdminActionLog } from './durable-objects/admin-action-log.js';
export { ApplicationRegistry } from './durable-objects/application-registry.js';
export { BackupIndex } from './durable-objects/backup-index.js';
export { AliasRecord } from './durable-objects/alias-record.js';

// Git SHA embedded at build time - replaced during deployment
// This constant forces code changes on each deploy, ensuring wrangler uploads new code
const BUNDLED_GIT_SHA = '__DEPLOY_GIT_SHA__';
setBundledGitSha(BUNDLED_GIT_SHA);

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/'))) {
      return handleOAuthCorsPreflight(request, env);
    }

    // Stripe webhook endpoint (no rate limiting or auth required)
    // Verified by Stripe signature instead
    if (url.pathname === '/api/payments/webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    // Clerk webhook endpoint, verified by its Svix signature
    if (url.pathname === '/api/webhooks/clerk' && request.method === 'POST') {
      return handleClerkWebhook(request, env);
    }

    // Apply rate limiting to all other requests
    const authResult = await authenticate(request, env);
    const rateLimitError = applyRateLimit(request, authResult);
    if (rateLimitError) return rateLimitError;

    // API and OAuth routes
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/') || url.pathname === '/health') {
      const response = await handleApiRoutes(url, request, env);
      return withOAuthCors(request, env, response);
    }

    // Info page route: /info/{cid}
    const infoMatch = url.pathname.match(/^\/info\/([A-Za-z0-9_-]{8,94})$/);
    if (infoMatch && request.method === 'GET') {
      const cid = infoMatch[1];
      // Redirect to info.html with CID as query parameter
      const redirectUrl = new URL('/info.html', url);
      redirectUrl.searchParams.set('cid', cid);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const pathWithoutLeadingSlash = url.pathname.substring(1);

    if (env.ENVIRONMENT === 'local' && pathWithoutLeadingSlash) {
      const cidMatch = pathWithoutLeadingSlash.match(/^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$/);
      if (cidMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        return handleDownloadContent(request, env, cidMatch[1], cidMatch[2] || null);
      }
    }

    // If path contains invalid characters and isn't a static asset or CID, return 404
    if (pathWithoutLeadingSlash && /[^A-Za-z0-9._/-]/.test(pathWithoutLeadingSlash)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid path',
          message: 'The requested path is invalid'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Try to serve static assets for non-API paths
    if (env.ASSETS) {
      try {
        // Special handling for /dashboard/uploads/{cid}/ -> serve detail.html
        if (url.pathname.match(/^\/dashboard\/uploads\/[^/]+\/?$/) && !url.pathname.startsWith('/dashboard/uploads/detail')) {
          const detailAsset = await fetchAssetPage(env, request, url, '/dashboard/uploads/detail.html');
          if (detailAsset.status !== 404) {
            return withGitShaComment(detailAsset, env);
          }
        }
        
        // Special handling for /dashboard/suppliers/{supplier_id} -> serve detail.html
        if (url.pathname.match(/^\/dashboard\/suppliers\/[^/]+\/?$/) && !url.pathname.startsWith('/dashboard/suppliers/detail')) {
          const detailAsset = await fetchAssetPage(env, request, url, '/dashboard/suppliers/detail.html');
          if (detailAsset.status !== 404) {
            return withGitShaComment(detailAsset, env);
          }
        }

        // Serve static files
        const asset = await env.ASSETS.fetch(request);
        
        // If asset found, return it
        if (asset.status !== 404) {
          return withGitShaComment(asset, env);
        }
        
        // If requesting a path without extension, try index.html
        if (!url.pathname.includes('.')) {
          const indexRequest = new Request(new URL('/index.html', url), request);
          const indexAsset = await env.ASSETS.fetch(indexRequest);
          if (indexAsset.status !== 404) {
            return withGitShaComment(indexAsset, env);
          }
        }
      } catch (error) {
        console.error('Asset serving error:', error);
      }
    }

    // If no static asset found, return 404
    return new Response('Not Found', { status: 404 });
  },
  ...scheduledJobs,
};

/**
 * Serve a static page from ASSETS at a different path than the one requested.
 * The assets binding answers "/x.html" with a redirect to its canonical URL ("/x"),
 * which would send the browser away from the requested URL (losing e.g. a CID in
 * the path), so follow that one redirect here instead.
 */
async function fetchAssetPage(env, request, url, assetPath) {
  const assetResponse = await env.ASSETS.fetch(new Request(new URL(assetPath, url), request));
  const location = assetResponse.headers.get('location');
  if (assetResponse.status >= 300 && assetResponse.status < 400 && location) {
    return env.ASSETS.fetch(new Request(new URL(location, url), request));
  }
  return assetResponse;
}

function injectGitShaIntoHtml(html, gitSha) {
  const comment = `<!-- git-sha: ${gitSha} -->`;
  const commentRegex = /<!--\s*git-sha:[^>]*-->/i;

  if (commentRegex.test(html)) {
    return html.replace(commentRegex, comment);
  }

  const doctypeMatch = html.match(/<!doctype[^>]*>/i);
  if (doctypeMatch) {
    return html.replace(doctypeMatch[0], `${doctypeMatch[0]}\n${comment}`);
  }

  return `${comment}\n${html}`;
}

async function withGitShaComment(response, env) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const { sha: gitSha, present: gitShaPresent } = gitShaInfo(env);
  const html = await response.text();
  const updatedHtml = injectGitShaIntoHtml(html, gitSha);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('x-git-sha', gitSha);
  headers.set('x-git-sha-present', String(gitShaPresent));

  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
