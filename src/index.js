/**
 * HashBin.org - Main Worker Entry Point
 * Content distribution platform using 256t hash-based addressing
 */

// Export Durable Object classes
export { ContentMetadata } from './durable-objects/content-metadata.js';
export { UserProfile } from './durable-objects/user-profile.js';
export { PaymentRecord } from './durable-objects/payment-record.js';
export { ContestRecord } from './durable-objects/contest-record.js';
export { MessageThread } from './durable-objects/message-thread.js';
export { KeyRegistry } from './durable-objects/key-registry.js';
export { PlatformStats } from './durable-objects/platform-stats.js';
export { AlertStore } from './durable-objects/alert-store.js';
export { AuditLog } from './durable-objects/audit-log.js';
export { SupplierRegistry } from './durable-objects/supplier-registry.js';
export { InfrastructureCost } from './durable-objects/infrastructure-cost.js';
export { DeletionRecord } from './durable-objects/deletion-record.js';
export { ExpirationIndex } from './durable-objects/expiration-index.js';

// Import API route handlers
import {
  handleAuthCallback,
  handleSessionInfo,
  handleLogout,
  handleLinkProvider,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleRevealApiKey,
  handleUpdateApiKey,
  handleDeleteAccount
} from './api/auth.js';

import { handleGetBalance, handleGetBalanceHistory } from './api/balance.js';

import { 
  handleCreateDeposit, 
  handleStripeWebhook, 
  handleCalculateRetention,
  handleCreateDonation
} from './api/payments.js';
import { handleLocalDevDeposit } from './api/local-payments.js';

import {
  handleUploadContent,
  handleGetContent,
  handleCheckContentExists,
  handleExtendContent,
  handleDownloadContent
} from './api/content.js';

import { 
  handlePurchaseRateLimit, 
  handleGetRateLimit 
} from './api/rate-limit.js';

import { handleGetUserUploads } from './api/user.js';

import {
  handleCreateSupplier,
  handleListSuppliers,
  handleGetSupplier,
  handleDeleteSupplier,
  handleUpdateSupplier,
  handleRescanSupplier,
  handleGetCIDSuppliers
} from './api/suppliers.js';

import {
  handleGetStats,
  handleGetFinancialStats,
  handleGetContentStats,
  handleGetUserStats,
  handleGetAdminHealth,
  handleGetAlerts,
  handleAcknowledgeAlert,
  handleGetAuditLog,
  handleExportData,
  handleGetCosts,
  handleGetCostsByService,
  handleGetProfitability,
  handleRecordCost
} from './api/admin.js';

import {
  handleListDeletions,
  handleGetDeletion,
  handleGetDeletionStats
} from './api/public-deletions.js';

import { deleteContent, getContentMetadata } from './services/content-deletion.js';

import { applyRateLimit, authenticate } from './auth/middleware.js';

// Configuration constants
const VALID_ENVIRONMENTS = ['development', 'production', 'local'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const HEALTH_CHECK_ID = 'health-check';
const GIT_SHA_PLACEHOLDER = 'unknown';

// Anomaly detection thresholds
const ANOMALY_DETECTION = {
  DEPOSIT_VELOCITY_MULTIPLIER: 5,    // Alert if deposits > 5x normal rate
  DEPOSIT_VELOCITY_ABSOLUTE: 20,     // Alert if deposits > 20 per hour
  UPLOAD_VELOCITY_MULTIPLIER: 5,     // Alert if uploads > 5x normal rate
  UPLOAD_VELOCITY_ABSOLUTE: 100      // Alert if uploads > 100 per hour
};

// Git SHA embedded at build time - replaced during deployment
// This constant forces code changes on each deploy, ensuring wrangler uploads new code
const BUNDLED_GIT_SHA = '__DEPLOY_GIT_SHA__';

// Static paths that should not be matched as CIDs
// These paths are served by the ASSETS binding (frontend files)
// Note: In a larger application, consider moving this to a configuration file
const STATIC_PATHS = [
  'index.html',
  'upload.html',
  'retrieve.html',
  'dashboard.html',
  'dashboard/',
  'deposit.html',
  'info.html',
  'css/',
  'js/',
  'img/',
  'docs/',
  'api-keys'
];

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Stripe webhook endpoint (no rate limiting or auth required)
    // Verified by Stripe signature instead
    if (url.pathname === '/api/payments/webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    // Apply rate limiting to all other requests
    const authResult = await authenticate(request, env);
    const rateLimitError = applyRateLimit(request, authResult);
    if (rateLimitError) return rateLimitError;

    // API routes (all paths starting with /api or /health)
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      // Handle API routes (existing logic below)
      return handleApiRoutes(url, request, env);
    }

    // Content download routes: /{cid} or /{cid}.{ext}
    // Match CID pattern at root level (excluding known static paths)
    const pathWithoutLeadingSlash = url.pathname.substring(1);
    
    // Skip if it's a known static path
    const isStaticPath = STATIC_PATHS.some(path => pathWithoutLeadingSlash.startsWith(path));
    
    if (!isStaticPath && pathWithoutLeadingSlash) {
      // Check if this looks like a CID (256t format)
      const cidMatch = pathWithoutLeadingSlash.match(/^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$/);
      
      if (cidMatch) {
        const cid = cidMatch[1];
        const extension = cidMatch[2] || null;
        
        // Only handle GET and HEAD methods for download
        if (request.method === 'GET' || request.method === 'HEAD') {
          return handleDownloadContent(request, env, cid, extension);
        }
      }
    }

    // If path contains invalid characters and isn't a static asset or CID, return 404
    if (pathWithoutLeadingSlash && /[^A-Za-z0-9._\/-]/.test(pathWithoutLeadingSlash)) {
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
        if (url.pathname.match(/^\/dashboard\/uploads\/[^\/]+\/?$/)) {
          const detailRequest = new Request(new URL('/dashboard/uploads/detail.html', url), request);
          const detailAsset = await env.ASSETS.fetch(detailRequest);
          if (detailAsset.status !== 404) {
            return withGitShaComment(detailAsset, env);
          }
        }
        
        // Special handling for /dashboard/suppliers/{supplier_id} -> serve detail.html
        if (url.pathname.match(/^\/dashboard\/suppliers\/[^\/]+\/?$/)) {
          const detailRequest = new Request(new URL('/dashboard/suppliers/detail.html', url), request);
          const detailAsset = await env.ASSETS.fetch(detailRequest);
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

  /**
   * Scheduled handler for cron jobs
   * Runs daily at 2 AM UTC for:
   * - Content expiration processing
   * - Platform statistics snapshot computation
   * - Audit log cleanup (1-year retention)
   * - Anomaly detection
   */
  async scheduled(event, env, ctx) {
    try {
      console.log('Scheduled job executed:', new Date().toISOString());

      // 1. Process expired content
      await this.processExpiredContent(env);

      // 2. Compute platform statistics snapshot
      await this.computePlatformSnapshot(env);

      // 3. Clean up old audit log entries (older than 1 year)
      await this.cleanupAuditLog(env);

      // 4. Run anomaly detection
      await this.runAnomalyDetection(env);

      console.log('Scheduled tasks completed');
    } catch (error) {
      console.error('Scheduled job error:', error);
    }
  },

  /**
   * Process expired content
   * 
   * Batch processes content that has expired for the current date.
   * Implements "extension wins" strategy: validates metadata before deletion
   * to ensure content wasn't extended after being indexed for expiration.
   * 
   * Batch Limit: Maximum 5,000 deletions per run (Cloudflare Workers 30s CPU limit)
   * Strategy: Check metadata expires_at before deletion; skip if extended
   * 
   * @param {Object} env - Environment bindings
   */
  async processExpiredContent(env) {
    try {
      console.log('Processing expired content...');
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const expirationIndexId = env.EXPIRATION_INDEX.idFromName('global');
      const expirationIndexStub = env.EXPIRATION_INDEX.get(expirationIndexId);
      
      // Get expired content for today
      const expiredResponse = await expirationIndexStub.fetch(
        new Request(`https://dummy/expired?date=${today}`, { method: 'GET' })
      );
      const expiredData = await expiredResponse.json();
      const expiredHashes = expiredData.hashes || [];
      
      console.log(`Found ${expiredHashes.length} expired content items for ${today}`);
      
      let deleted = 0;
      let skipped = 0;
      let failed = 0;
      const BATCH_LIMIT = 5000;
      
      // Process up to BATCH_LIMIT items
      for (const hash of expiredHashes.slice(0, BATCH_LIMIT)) {
        try {
          // Get current metadata to check for extension ("extension wins" strategy)
          const metadata = await getContentMetadata(env, hash);
          
          if (!metadata) {
            // Already deleted
            skipped++;
            continue;
          }
          
          const expiresDate = metadata.expires_at.split('T')[0];
          
          // Check if content was extended after being indexed for expiration
          if (expiresDate > today) {
            console.log(`Skipping ${hash}: extended to ${expiresDate}`);
            skipped++;
            continue;
          }
          
          // Use deletion service for consistent deletion logic
          const result = await deleteContent(env, hash, metadata, 'expired');
          
          if (result.success) {
            deleted++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          console.error(`Failed to delete ${hash}:`, error);
        }
      }
      
      console.log(`Expiration job complete: ${deleted} deleted, ${skipped} skipped, ${failed} failed`);
    } catch (error) {
      console.error('Error processing expired content:', error);
    }
  },

  /**
   * Compute platform statistics snapshot
   */
  async computePlatformSnapshot(env) {
    try {
      console.log('Computing platform statistics snapshot...');
      
      const statsId = env.PLATFORM_STATS.idFromName('global');
      const statsStub = env.PLATFORM_STATS.get(statsId);
      
      await statsStub.fetch(new Request('https://dummy/snapshot', {
        method: 'POST'
      }));
      
      console.log('Platform statistics snapshot computed');
    } catch (error) {
      console.error('Error computing platform snapshot:', error);
    }
  },

  /**
   * Clean up old audit log entries (older than 1 year)
   */
  async cleanupAuditLog(env) {
    try {
      console.log('Cleaning up old audit log entries...');
      
      const auditLogId = env.AUDIT_LOG.idFromName('global');
      const auditLogStub = env.AUDIT_LOG.get(auditLogId);
      
      const response = await auditLogStub.fetch(new Request('https://dummy/cleanup', {
        method: 'POST'
      }));
      
      const result = await response.json();
      console.log(`Audit log cleanup complete. Removed ${result.deleted_count || 0} entries`);
    } catch (error) {
      console.error('Error cleaning up audit log:', error);
    }
  },

  /**
   * Run anomaly detection and create alerts
   */
  async runAnomalyDetection(env) {
    try {
      console.log('Running anomaly detection...');
      
      const statsId = env.PLATFORM_STATS.idFromName('global');
      const statsStub = env.PLATFORM_STATS.get(statsId);
      const alertStoreId = env.ALERT_STORE.idFromName('global');
      const alertStoreStub = env.ALERT_STORE.get(alertStoreId);
      
      // Get current statistics
      const statsResponse = await statsStub.fetch(new Request('https://dummy/stats?type=all'));
      const stats = await statsResponse.json();
      
      // Check for anomalies and create alerts
      
      // 1. Check for high error rate (>5% in last 6 hours)
      // This would need error tracking to be implemented
      // Placeholder for now
      
      // 2. Check for unusual deposit velocity
      const depositRate = stats.financial?.deposits_last_hour || 0;
      const normalDepositRate = stats.financial?.avg_deposits_per_hour || 10;
      if (depositRate > normalDepositRate * ANOMALY_DETECTION.DEPOSIT_VELOCITY_MULTIPLIER || 
          depositRate > ANOMALY_DETECTION.DEPOSIT_VELOCITY_ABSOLUTE) {
        await alertStoreStub.fetch(new Request('https://dummy/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'unusual_deposit_velocity',
            severity: 'warning',
            title: 'Unusual Deposit Activity Detected',
            message: `Deposit rate (${depositRate}/hour) exceeds normal rate (${normalDepositRate}/hour)`,
            metadata: {
              current_rate: depositRate,
              normal_rate: normalDepositRate,
              threshold: normalDepositRate * ANOMALY_DETECTION.DEPOSIT_VELOCITY_MULTIPLIER
            }
          })
        }));
      }
      
      // 3. Check for unusual upload velocity
      const uploadRate = stats.content?.uploads_last_hour || 0;
      const normalUploadRate = stats.content?.avg_uploads_per_hour || 50;
      if (uploadRate > normalUploadRate * ANOMALY_DETECTION.UPLOAD_VELOCITY_MULTIPLIER || 
          uploadRate > ANOMALY_DETECTION.UPLOAD_VELOCITY_ABSOLUTE) {
        await alertStoreStub.fetch(new Request('https://dummy/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'unusual_upload_velocity',
            severity: 'warning',
            title: 'Unusual Upload Activity Detected',
            message: `Upload rate (${uploadRate}/hour) exceeds normal rate (${normalUploadRate}/hour)`,
            metadata: {
              current_rate: uploadRate,
              normal_rate: normalUploadRate,
              threshold: normalUploadRate * ANOMALY_DETECTION.UPLOAD_VELOCITY_MULTIPLIER
            }
          })
        }));
      }
      
      console.log('Anomaly detection complete');
    } catch (error) {
      console.error('Error running anomaly detection:', error);
    }
  }
};

/**
 * Handle API routes
 */
function handleApiRoutes(url, request, env) {
  // Basic routing
  if (url.pathname === '/health') {
    return handleHealth(env);
  }

  // Public config endpoint (serves non-secret configuration to frontend)
  if (url.pathname === '/api/config' && request.method === 'GET') {
    return handleConfig(env);
  }

  // Authentication API routes
  if (url.pathname === '/api/auth/callback' && request.method === 'POST') {
    return handleAuthCallback(request, env);
  }

  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    return handleSessionInfo(request, env);
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    return handleLogout(request, env);
  }

  if (url.pathname === '/api/auth/link' && request.method === 'POST') {
    return handleLinkProvider(request, env);
  }

  if (url.pathname === '/api/auth/apikeys' && request.method === 'POST') {
    return handleCreateApiKey(request, env);
  }

  if (url.pathname === '/api/auth/apikeys' && request.method === 'GET') {
    return handleListApiKeys(request, env);
  }

  if (url.pathname.startsWith('/api/auth/apikeys/') && request.method === 'DELETE') {
    const keyId = url.pathname.split('/')[4];
    return handleRevokeApiKey(request, env, keyId);
  }

  if (url.pathname.startsWith('/api/auth/apikeys/') && url.pathname.endsWith('/reveal') && request.method === 'POST') {
    const keyId = url.pathname.split('/')[4];
    return handleRevealApiKey(request, env, keyId);
  }

  if (url.pathname.startsWith('/api/auth/apikeys/') && request.method === 'PATCH') {
    const parts = url.pathname.split('/');
    // Ensure exact pattern: /api/auth/apikeys/{keyId} (5 parts)
    if (parts.length === 5 && parts[4]) {
      const keyId = parts[4];
      return handleUpdateApiKey(request, env, keyId);
    }
  }

  if (url.pathname === '/api/auth/account' && request.method === 'DELETE') {
    return handleDeleteAccount(request, env);
  }

  // Balance API routes
  if (url.pathname === '/api/balance' && request.method === 'GET') {
    return handleGetBalance(request, env);
  }

  if (url.pathname === '/api/balance/history' && request.method === 'GET') {
    return handleGetBalanceHistory(request, env);
  }

  if (url.pathname === '/api/balance/deposit' && request.method === 'POST') {
    return handleCreateDeposit(request, env);
  }

  if (url.pathname === '/api/balance/dev-deposit' && request.method === 'POST') {
    return handleLocalDevDeposit(request, env);
  }

  // Payment calculation endpoint (public)
  if (url.pathname === '/api/payments/calculate' && request.method === 'POST') {
    return handleCalculateRetention(request, env);
  }

  // Content API routes
  if (url.pathname === '/api/content' && request.method === 'POST') {
    return handleUploadContent(request, env);
  }

  if (url.pathname.startsWith('/api/content/') && request.method === 'GET') {
    const parts = url.pathname.split('/');
    const cid = parts[3];
    const action = parts[4];

    if (!action) {
      return handleGetContent(request, env, cid);
    } else if (action === 'exists') {
      return handleCheckContentExists(request, env, cid);
    }
  }

  if (url.pathname.startsWith('/api/content/') && url.pathname.endsWith('/extend') && request.method === 'POST') {
    const cid = url.pathname.split('/')[3];
    return handleExtendContent(request, env, cid);
  }

  // Rate limit API routes
  if (url.pathname === '/api/content/rate-limit/purchase' && request.method === 'POST') {
    return handlePurchaseRateLimit(request, env);
  }

  if (url.pathname.startsWith('/api/content/') && url.pathname.endsWith('/rate-limit') && request.method === 'GET') {
    const cid = url.pathname.split('/')[3];
    return handleGetRateLimit(request, env, cid);
  }

  // Donation API route (public - no auth required)
  if (url.pathname.startsWith('/api/donate/cid/') && request.method === 'POST') {
    const cid = url.pathname.split('/')[4];
    return handleCreateDonation(request, env, cid);
  }

  // User API routes
  if (url.pathname === '/api/user/uploads' && request.method === 'GET') {
    return handleGetUserUploads(request, env);
  }

  // Supplier API routes
  if (url.pathname === '/api/suppliers' && request.method === 'POST') {
    return handleCreateSupplier(request, env);
  }

  if (url.pathname === '/api/suppliers' && request.method === 'GET') {
    return handleListSuppliers(request, env);
  }

  if (url.pathname.match(/^\/api\/suppliers\/[^\/]+$/) && request.method === 'GET') {
    const supplierId = url.pathname.split('/')[3];
    return handleGetSupplier(request, env, supplierId);
  }

  if (url.pathname.match(/^\/api\/suppliers\/[^\/]+$/) && request.method === 'DELETE') {
    const supplierId = url.pathname.split('/')[3];
    return handleDeleteSupplier(request, env, supplierId);
  }

  if (url.pathname.match(/^\/api\/suppliers\/[^\/]+$/) && request.method === 'PATCH') {
    const supplierId = url.pathname.split('/')[3];
    return handleUpdateSupplier(request, env, supplierId);
  }

  if (url.pathname.match(/^\/api\/suppliers\/[^\/]+\/scan$/) && request.method === 'POST') {
    const supplierId = url.pathname.split('/')[3];
    return handleRescanSupplier(request, env, supplierId);
  }

  if (url.pathname.match(/^\/api\/content\/[^\/]+\/suppliers$/) && request.method === 'GET') {
    const cid = url.pathname.split('/')[3];
    return handleGetCIDSuppliers(request, env, cid);
  }

  // Admin API routes (no rate limiting or auth - admin token checked in handlers)
  if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
    return handleGetStats(request, env);
  }

  if (url.pathname === '/api/admin/stats/financial' && request.method === 'GET') {
    return handleGetFinancialStats(request, env);
  }

  if (url.pathname === '/api/admin/stats/content' && request.method === 'GET') {
    return handleGetContentStats(request, env);
  }

  if (url.pathname === '/api/admin/stats/users' && request.method === 'GET') {
    return handleGetUserStats(request, env);
  }

  if (url.pathname === '/api/admin/health' && request.method === 'GET') {
    return handleGetAdminHealth(request, env);
  }

  if (url.pathname === '/api/admin/alerts' && request.method === 'GET') {
    return handleGetAlerts(request, env);
  }

  if (url.pathname.match(/^\/api\/admin\/alerts\/[^\/]+\/acknowledge$/) && request.method === 'POST') {
    const alertId = url.pathname.split('/')[4];
    return handleAcknowledgeAlert(request, env, alertId);
  }

  if (url.pathname === '/api/admin/audit-log' && request.method === 'GET') {
    return handleGetAuditLog(request, env);
  }

  if (url.pathname === '/api/admin/export' && request.method === 'GET') {
    return handleExportData(request, env);
  }

  // Admin cost and profitability endpoints
  if (url.pathname === '/api/admin/costs' && request.method === 'GET') {
    return handleGetCosts(request, env);
  }

  if (url.pathname === '/api/admin/costs/by-service' && request.method === 'GET') {
    return handleGetCostsByService(request, env);
  }

  if (url.pathname === '/api/admin/costs/record' && request.method === 'POST') {
    return handleRecordCost(request, env);
  }

  if (url.pathname === '/api/admin/profitability' && request.method === 'GET') {
    return handleGetProfitability(request, env);
  }

  // Public deletion records API routes (no auth required for transparency)
  if (url.pathname === '/api/public/deletions/stats' && request.method === 'GET') {
    return handleGetDeletionStats(request, env);
  }

  if (url.pathname.match(/^\/api\/public\/deletions\/[^\/]+$/) && request.method === 'GET') {
    const hash = url.pathname.split('/')[4];
    return handleGetDeletion(request, env, hash);
  }

  if (url.pathname === '/api/public/deletions' && request.method === 'GET') {
    return handleListDeletions(request, env);
  }

  // TODO: Add API routes for:
  // - Contests

  return new Response(
    JSON.stringify({
      error: 'Not Found',
      message: 'API endpoint not found'
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' }
    }
  );
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

  // Prefer bundled SHA (embedded at build time), fall back to secret, then placeholder
  const bundledShaIsValid = BUNDLED_GIT_SHA && BUNDLED_GIT_SHA !== '__DEPLOY_GIT_SHA__';
  const gitSha = bundledShaIsValid ? BUNDLED_GIT_SHA : (env.GIT_SHA || GIT_SHA_PLACEHOLDER);
  const html = await response.text();
  const updatedHtml = injectGitShaIntoHtml(html, gitSha);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('x-git-sha', gitSha);
  headers.set('x-git-sha-present', String(bundledShaIsValid || Boolean(env.GIT_SHA)));

  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Root endpoint - Basic info
 */
function handleRoot(env) {
  const info = {
    service: 'HashBin.org API',
    version: '0.1.0',
    environment: env.ENVIRONMENT || 'unknown',
    status: 'operational',
    phase: 'Phase 1 - Infrastructure Setup',
    endpoints: {
      health: '/health',
      // More endpoints will be added in future phases
    }
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*'
    }
  });
}

/**
 * Public configuration endpoint
 * Returns non-secret configuration needed by the frontend
 */
function handleConfig(env) {
  const isLocalMode = env.ENVIRONMENT === 'local';
  const config = {
    clerkPublishableKey: isLocalMode ? null : (env.CLERK_PUBLISHABLE_KEY || null),
    isLocalMode,
    authMode: isLocalMode ? 'local' : 'clerk'
  };

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  });
}

/**
 * Health check endpoint with comprehensive validation
 */
async function handleHealth(env) {
  const checks = {
    worker: await checkWorker(env),
    environment: await checkEnvironment(env),
    durableObjects: await checkDurableObjects(env),
    r2: await checkR2Buckets(env),
    clerk: await checkClerk(env),
    stripe: await checkStripe(env)
  };

  // Determine overall status
  const allOperational = Object.values(checks).every(check => check.status === 'operational');
  const anyDegraded = Object.values(checks).some(check => check.status === 'degraded');
  const anyDown = Object.values(checks).some(check => check.status === 'down');

  let overallStatus = 'healthy';
  if (anyDown) {
    overallStatus = 'unhealthy';
  } else if (anyDegraded) {
    overallStatus = 'degraded';
  }

  // Create alerts for degraded or unhealthy components
  try {
    if (anyDown || anyDegraded) {
      const alertStoreId = env.ALERT_STORE.idFromName('global');
      const alertStoreStub = env.ALERT_STORE.get(alertStoreId);
      
      for (const [componentName, check] of Object.entries(checks)) {
        if (check.status === 'down') {
          await alertStoreStub.fetch(new Request('https://dummy/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'health_unhealthy',
              severity: 'critical',
              title: `Component Down: ${componentName}`,
              message: `${componentName} health check failed: ${check.error || 'Unknown error'}`,
              metadata: {
                component: componentName,
                error: check.error || null,
                timestamp: new Date().toISOString()
              }
            })
          }));
        } else if (check.status === 'degraded') {
          await alertStoreStub.fetch(new Request('https://dummy/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'health_degraded',
              severity: 'warning',
              title: `Component Degraded: ${componentName}`,
              message: `${componentName} health check shows degraded performance`,
              metadata: {
                component: componentName,
                timestamp: new Date().toISOString()
              }
            })
          }));
        }
      }
      
      // Auto-resolve alerts if all components are now healthy
      if (allOperational && !anyDown && !anyDegraded) {
        // Resolve health_degraded and health_unhealthy alerts
        const alertsResponse = await alertStoreStub.fetch(new Request('https://dummy/list'));
        const alertsData = await alertsResponse.json();
        
        for (const alert of alertsData.alerts || []) {
          if ((alert.type === 'health_degraded' || alert.type === 'health_unhealthy') && !alert.resolved_at) {
            await alertStoreStub.fetch(new Request(`https://dummy/resolve/${alert.id}`, {
              method: 'POST'
            }));
          }
        }
      }
    }
  } catch (alertError) {
    console.error('Error creating health alerts:', alertError);
    // Don't fail the health check if alert creation fails
  }

  // Determine git SHA: prefer bundled value (embedded at build time), fall back to secret, then placeholder
  const bundledShaIsValid = BUNDLED_GIT_SHA && BUNDLED_GIT_SHA !== '__DEPLOY_GIT_SHA__';
  const effectiveGitSha = bundledShaIsValid ? BUNDLED_GIT_SHA : (env.GIT_SHA || GIT_SHA_PLACEHOLDER);

  if (!bundledShaIsValid && !env.GIT_SHA) {
    console.warn('Health check: Neither BUNDLED_GIT_SHA nor GIT_SHA secret is configured.');
  }

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'unknown',
    gitSha: effectiveGitSha,
    gitShaPresent: bundledShaIsValid || Boolean(env.GIT_SHA),
    checks: checks,
    summary: {
      total: Object.keys(checks).length,
      operational: Object.values(checks).filter(c => c.status === 'operational').length,
      degraded: Object.values(checks).filter(c => c.status === 'degraded').length,
      down: Object.values(checks).filter(c => c.status === 'down').length
    }
  };

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'x-git-sha': effectiveGitSha,
      'x-git-sha-present': String(bundledShaIsValid || Boolean(env.GIT_SHA))
    }
  });
}

/**
 * Check worker configuration and basic functionality
 */
async function checkWorker(env) {
  try {
    return {
      status: 'operational',
      message: 'Worker is responding',
      details: {
        hasEnvironment: !!env.ENVIRONMENT,
        hasLogLevel: !!env.LOG_LEVEL
      }
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Worker check failed',
      error: error.message
    };
  }
}

/**
 * Check environment configuration
 */
async function checkEnvironment(env) {
  try {
    const envName = env.ENVIRONMENT || 'unknown';
    const logLevel = env.LOG_LEVEL || 'unknown';
    
    const envValid = VALID_ENVIRONMENTS.includes(envName);
    const logLevelValid = VALID_LOG_LEVELS.includes(logLevel);
    
    const allValid = envValid && logLevelValid;
    
    return {
      status: allValid ? 'operational' : 'degraded',
      message: allValid ? 'Environment configuration valid' : 'Environment configuration issues detected',
      details: {
        environment: envName,
        environmentValid: envValid,
        logLevel: logLevel,
        logLevelValid: logLevelValid
      }
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Environment check failed',
      error: error.message
    };
  }
}

/**
 * Check Durable Objects bindings and accessibility
 */
async function checkDurableObjects(env) {
  const doTypes = [
    { name: 'CONTENT_METADATA', binding: env.CONTENT_METADATA },
    { name: 'USER_PROFILES', binding: env.USER_PROFILES },
    { name: 'PAYMENT_RECORDS', binding: env.PAYMENT_RECORDS },
    { name: 'CONTEST_RECORDS', binding: env.CONTEST_RECORDS },
    { name: 'MESSAGE_THREADS', binding: env.MESSAGE_THREADS },
    { name: 'KEY_REGISTRY', binding: env.KEY_REGISTRY }
  ];

  const results = {};
  let allOperational = true;
  let anyAccessible = false;

  for (const doType of doTypes) {
    try {
      if (!doType.binding) {
        results[doType.name] = {
          available: false,
          accessible: false,
          error: 'Binding not found'
        };
        allOperational = false;
      } else {
        // Try to get an ID and stub - this validates the binding works
        const id = doType.binding.idFromName(HEALTH_CHECK_ID);
        const stub = doType.binding.get(id);
        results[doType.name] = {
          available: true,
          accessible: !!stub,
          error: null
        };
        anyAccessible = true;
      }
    } catch (error) {
      results[doType.name] = {
        available: !!doType.binding,
        accessible: false,
        error: error.message
      };
      allOperational = false;
    }
  }

  return {
    status: allOperational ? 'operational' : (anyAccessible ? 'degraded' : 'down'),
    message: allOperational ? 'All Durable Objects accessible' : 'Some Durable Objects unavailable',
    details: results
  };
}

/**
 * Check R2 bucket accessibility
 */
async function checkR2Buckets(env) {
  const buckets = [
    { name: 'CONTENT_BUCKET', binding: env.CONTENT_BUCKET },
    { name: 'BACKUP_BUCKET', binding: env.BACKUP_BUCKET }
  ];

  const results = {};
  let allOperational = true;
  let anyAccessible = false;

  for (const bucket of buckets) {
    try {
      if (!bucket.binding) {
        results[bucket.name] = {
          available: false,
          accessible: false,
          error: 'Binding not found'
        };
        allOperational = false;
      } else {
        // Try to list with limit 1 to verify bucket is accessible
        await bucket.binding.list({ limit: 1 });
        results[bucket.name] = {
          available: true,
          accessible: true,
          error: null
        };
        anyAccessible = true;
      }
    } catch (error) {
      results[bucket.name] = {
        available: !!bucket.binding,
        accessible: false,
        error: error.message
      };
      allOperational = false;
    }
  }

  return {
    status: allOperational ? 'operational' : (anyAccessible ? 'degraded' : 'down'),
    message: allOperational ? 'All R2 buckets accessible' : 'Some R2 buckets unavailable',
    details: results
  };
}

/**
 * Check Clerk integration health
 */
async function checkClerk(env) {
  if (env.ENVIRONMENT === 'local') {
    return {
      status: 'operational',
      message: 'Clerk disabled in local mode',
      details: {
        secretKeyConfigured: false,
        publishableKeyConfigured: false
      }
    };
  }

  const checks = {
    secretKeyConfigured: false,
    publishableKeyConfigured: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.CLERK_SECRET_KEY;
    checks.publishableKeyConfigured = !!env.CLERK_PUBLISHABLE_KEY;

    const allConfigured = checks.secretKeyConfigured &&
                          checks.publishableKeyConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.publishableKeyConfigured;

    return {
      status: allConfigured ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: allConfigured ? 'Clerk secrets configured' :
               (someConfigured ? 'Some Clerk secrets missing' : 'Clerk not configured'),
      details: checks
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Clerk check failed',
      error: error.message,
      details: checks
    };
  }
}

/**
 * Check Stripe integration health
 */
async function checkStripe(env) {
  if (env.ENVIRONMENT === 'local') {
    return {
      status: 'operational',
      message: 'Stripe disabled in local mode',
      details: {
        secretKeyConfigured: false,
        webhookSecretConfigured: false
      }
    };
  }

  const checks = {
    secretKeyConfigured: false,
    webhookSecretConfigured: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.STRIPE_SECRET_KEY;
    checks.webhookSecretConfigured = !!env.STRIPE_WEBHOOK_SECRET;

    const allConfigured = checks.secretKeyConfigured &&
                          checks.webhookSecretConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.webhookSecretConfigured;

    return {
      status: allConfigured ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: allConfigured ? 'Stripe secrets configured' :
               (someConfigured ? 'Some Stripe secrets missing' : 'Stripe not configured'),
      details: checks
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Stripe check failed',
      error: error.message,
      details: checks
    };
  }
}
