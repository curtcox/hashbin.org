import { handleDownloads } from './api/downloads.js';
import { runCostMonitor } from './services/cost-monitor.js';
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

// Import API route handlers
import {
  handleAuthCallback,
  handleSessionInfo,
  handleLogout,
  handleLinkProvider,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
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
  handleCostSafety,
  handleGetCosts,
  handleGetCostsByService,
  handleGetProfitability,
  handleRecordCost,
  handleTestAlertWebhook
} from './api/admin.js';

import {
  handleListDeletions,
  handleGetDeletion,
  handleGetDeletionStats
} from './api/public-deletions.js';

import {
  handleCreateDispute,
  handleListDisputes,
  handleGetDispute,
  handleGetContentDisputes
} from './api/disputes.js';

import { 
  handleDeleteContent, 
  handleAdminDeleteContent 
} from './api/content-deletion.js';

import {
  handleAdminListDisputes,
  handleAdminUpdateDispute,
  getRepeatInfringers,
  handleGetRepeatInfringers,
  handleGetAdminActions
} from './api/admin-disputes.js';

import { deleteContent, getContentMetadata } from './services/content-deletion.js';
import { cleanupPendingR2Deletions } from './services/r2-cleanup.js';
import { MAX_UPLOAD_BYTES } from './utils/upload-limits.js';
import {
  handleGetBackupFile,
  handleGetBackupStatus,
  handleListBackupFiles,
  handleRestoreObject,
  handleRunBackup
} from './api/admin-backups.js';
import { getContentDomain } from './utils/content-domain.js';
import {
  handleCreateDeveloperApp,
  handleListDeveloperApps,
  handleUpdateDeveloperApp,
  handleDeleteDeveloperApp,
  handleGetOAuthAuthorizePage,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthRevoke,
  handleGetAccountSettings,
  handleUpdateAccountSettings,
  handleListAuthorizations,
  handleRevokeAuthorization
} from './api/oauth.js';

import { applyRateLimit, authenticate, requireAuth } from './auth/middleware.js';
import { handleOAuthCorsPreflight, withOAuthCors } from './auth/oauth-cors.js';
import { PUBLIC, SESSION, USER_SCOPES, checkAccess, isSessionAuth } from './auth/scopes.js';
import { handleClerkWebhook } from './api/clerk-webhook.js';

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
      // Handle API routes (existing logic below)
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

  /** Hourly safety monitoring; maintenance remains nightly at 02:00 UTC. */
  async scheduled(event, env, _ctx) {
    const now = new Date(event.scheduledTime || Date.now());
    // Isolate failures so a maintenance error cannot skip monitoring.
    for (const job of [() => runCostMonitor(env, now), () => this.runAnomalyDetection(env)]) {
      try { await job(); } catch (error) { console.error('Hourly safety job failed:', error); }
    }
    if (now.getUTCHours() !== 2) return;
    for (const job of [this.processExpiredContent, this.computePlatformSnapshot, this.cleanupAuditLog,
      this.processExpiredDisputes, this.cleanupR2PendingDeletion, this.startBackupSnapshot]) {
      try { await job.call(this, env); } catch (error) { console.error('Nightly job failed:', error); }
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
      
      // 4. Accounts at the repeat-infringer threshold (DMCA policy) need an admin decision
      const { infringers = [] } = await getRepeatInfringers(env);
      if (infringers.length > 0) {
        await alertStoreStub.fetch(new Request('https://dummy/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'repeat_infringer',
            severity: 'warning',
            title: 'Accounts reached the repeat-infringer threshold',
            message: `${infringers.length} account(s) have repeated upheld copyright removals; review under the DMCA policy`,
            metadata: { uploader_ids: infringers.map(i => i.uploader_id) }
          })
        }));
      }

      console.log('Anomaly detection complete');
    } catch (error) {
      console.error('Error running anomaly detection:', error);
    }
  },

  /**
   * Process expired disputes
   * Updates disputes that are past their expires_at date to closed_expired
   */
  async processExpiredDisputes(env) {
    try {
      console.log('Processing expired disputes...');
      
      const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
      const indexStub = env.DISPUTE_INDEX.get(indexId);
      
      // Get all open disputes
      const listResponse = await indexStub.fetch(
        new Request('http://internal/list?limit=1000')
      );
      const listData = await listResponse.json();
      
      const now = new Date();
      let expired = 0;
      
      // Check each dispute for expiration
      for (const dispute of listData.disputes || []) {
        const expiresAt = new Date(dispute.expires_at);
        
        if (expiresAt <= now) {
          try {
            // Update dispute status to closed_expired
            const disputeRecordId = env.DISPUTE_RECORD.idFromName(`dispute:${dispute.cid}`);
            const disputeRecordStub = env.DISPUTE_RECORD.get(disputeRecordId);
            
            const closeResponse = await disputeRecordStub.fetch(new Request('http://internal/dispute', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'closed_expired',
                resolution: 'expired',
                resolution_reason: 'Dispute expired after 30 days without resolution',
                resolved_by: 'system'
              })
            }));
            if (!closeResponse.ok) {
              throw new Error(`DisputeRecord returned ${closeResponse.status}`);
            }

            const availability = env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(dispute.cid));
            const availabilityResponse = await availability.fetch(new Request('http://internal/availability', {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disputed: false })
            }));
            if (!availabilityResponse.ok) throw new Error('Failed to publish dispute expiry');
            // An expired dispute no longer blocks the content: 256t.us serves 451 while this marker exists
            await env.CONTENT_BUCKET.delete(`${dispute.cid}.disputed`);

            // Remove from DisputeIndex
            await indexStub.fetch(new Request('http://internal/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dispute_id: dispute.dispute_id
              })
            }));
            
            expired++;
          } catch (error) {
            console.error(`Error expiring dispute ${dispute.dispute_id}:`, error);
          }
        }
      }
      
      console.log(`Expired disputes processed: ${expired} disputes closed`);
    } catch (error) {
      console.error('Error processing expired disputes:', error);
    }
  },

  /**
   * Start the nightly Durable Object snapshot, and alert if the last one is stale or failed
   */
  async startBackupSnapshot(env) {
    try {
      const index = env.BACKUP_INDEX.get(env.BACKUP_INDEX.idFromName('global'));
      const status = await index.fetch(new Request('https://backup-index/snapshot/status')).then(r => r.json());
      const last = status.last_run;
      const staleMs = 48 * 60 * 60 * 1000;

      if (!last || Date.now() - Date.parse(last.finished_at) > staleMs || last.failed > 0) {
        const alertStore = env.ALERT_STORE.get(env.ALERT_STORE.idFromName('global'));
        await alertStore.fetch(new Request('https://dummy/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'backup_unhealthy',
            severity: 'critical',
            title: 'Backup snapshot missing, stale, or incomplete',
            message: last
              ? `Last snapshot ${last.id} finished ${last.finished_at} with ${last.failed} failure(s)`
              : 'No completed backup snapshot yet',
            metadata: { last_run: last || null }
          })
        }));
      }

      await index.fetch(new Request('https://backup-index/snapshot/start', { method: 'POST' }));
      console.log('Backup snapshot started');
    } catch (error) {
      console.error('Error starting backup snapshot:', error);
    }
  },

  /**
   * Remove R2 bytes for content soft-deleted more than 24 hours ago
   */
  async cleanupR2PendingDeletion(env) {
    try {
      const { cleaned, failed } = await cleanupPendingR2Deletions(env);
      console.log(`R2 cleanup complete: ${cleaned} cleaned, ${failed} failed`);
    } catch (error) {
      console.error('Error cleaning up R2:', error);
    }
  },
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

/**
 * API route table. Every route declares its access: PUBLIC, SESSION (the account's
 * own sign-in only), or the scope(s) a delegated credential needs, any one of which
 * suffices. The dispatcher enforces it before the handler runs; a test fails for any
 * route without a valid declaration.
 */
const API_ROUTES = [
  // Downloads (budgets and sessions belong to the account; signing spends)
  { method: ['GET', 'PUT'], path: '/api/downloads/budget', access: SESSION, handler: handleDownloads },
  { method: 'PUT', path: /^\/api\/(auth\/apikeys|oauth\/grants)\/[^/]+\/download-budget$/, access: SESSION, handler: handleDownloads },
  { method: ['GET', 'DELETE'], path: '/api/downloads/sessions', access: SESSION, handler: handleDownloads },
  { method: 'POST', path: '/api/downloads/session', access: SESSION, handler: handleDownloads },
  { method: 'POST', path: '/api/downloads/sign', access: 'downloads:spend', handler: handleDownloads },

  { method: ['GET', 'HEAD'], path: '/health', access: PUBLIC, handler: (request, env) => handleHealth(env) },
  { method: 'GET', path: '/api/config', access: PUBLIC, handler: (request, env) => handleConfig(env) },

  // Account and credentials
  { method: 'POST', path: '/api/auth/callback', access: PUBLIC, handler: handleAuthCallback },
  { method: 'GET', path: '/api/auth/session', access: SESSION, handler: handleSessionInfo },
  { method: 'POST', path: '/api/auth/logout', access: SESSION, handler: handleLogout },
  { method: 'POST', path: '/api/auth/link', access: SESSION, handler: handleLinkProvider },
  { method: 'POST', path: '/api/auth/apikeys', access: SESSION, handler: handleCreateApiKey },
  { method: 'GET', path: '/api/auth/apikeys', access: SESSION, handler: handleListApiKeys },
  { method: 'DELETE', path: /^\/api\/auth\/apikeys\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleRevokeApiKey(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/auth\/apikeys\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleUpdateApiKey(request, env, m[1]) },
  { method: 'DELETE', path: '/api/auth/account', access: SESSION, handler: handleDeleteAccount },
  { method: 'POST', path: '/api/developers/apps', access: SESSION, handler: handleCreateDeveloperApp },
  { method: 'GET', path: '/api/developers/apps', access: SESSION, handler: handleListDeveloperApps },
  { method: 'PATCH', path: /^\/api\/developers\/apps\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleUpdateDeveloperApp(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/developers\/apps\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleDeleteDeveloperApp(request, env, m[1]) },
  { method: 'POST', path: '/oauth/authorize', access: SESSION, handler: handleOAuthAuthorize },
  { method: 'GET', path: '/oauth/authorize', access: PUBLIC, handler: handleGetOAuthAuthorizePage },
  { method: 'POST', path: '/oauth/token', access: PUBLIC, handler: handleOAuthToken },
  { method: 'POST', path: '/oauth/revoke', access: PUBLIC, handler: handleOAuthRevoke },
  { method: 'GET', path: '/api/account/settings', access: SESSION, handler: handleGetAccountSettings },
  { method: 'PATCH', path: '/api/account/settings', access: SESSION, handler: handleUpdateAccountSettings },
  { method: 'GET', path: '/api/account/authorizations', access: SESSION, handler: handleListAuthorizations },
  { method: 'DELETE', path: /^\/api\/account\/authorizations\/([^/]+)$/, access: SESSION, handler: (request, env, m) => handleRevokeAuthorization(request, env, m[1]) },

  // Balance and payments
  { method: 'GET', path: '/api/balance', access: 'balance:read', handler: handleGetBalance },
  { method: 'GET', path: '/api/balance/history', access: 'transactions:read', handler: handleGetBalanceHistory },
  { method: 'POST', path: '/api/balance/deposit', access: SESSION, handler: handleCreateDeposit },
  { method: 'POST', path: '/api/balance/dev-deposit', access: SESSION, handler: handleLocalDevDeposit },
  { method: 'POST', path: '/api/payments/calculate', access: PUBLIC, handler: handleCalculateRetention },

  // Content
  { method: 'POST', path: '/api/content', access: 'content:write', handler: handleUploadContent },
  { method: 'POST', path: '/api/content/rate-limit/purchase', access: 'ratelimit:purchase', handler: handlePurchaseRateLimit },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/exists$/, access: PUBLIC, handler: (request, env, m) => handleCheckContentExists(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/rate-limit$/, access: PUBLIC, handler: (request, env, m) => handleGetRateLimit(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/disputes$/, access: PUBLIC, handler: (request, env, m) => handleGetContentDisputes(request, env, m[1], request.user?.userId || null) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)\/suppliers$/, access: PUBLIC, handler: (request, env, m) => handleGetCIDSuppliers(request, env, m[1]) },
  { method: 'GET', path: /^\/api\/content\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetContent(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/content\/([^/]+)\/extend$/, access: 'content:extend', handler: (request, env, m) => handleExtendContent(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/content\/([^/]+)$/, access: ['content:delete', 'admin:takedown'], handler: (request, env, m) => handleDeleteContent(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/donate\/cid\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleCreateDonation(request, env, m[1]) },
  { method: 'GET', path: '/api/user/uploads', access: 'uploads:read', handler: handleGetUserUploads },

  // Disputes (public; signed-in users see contact details)
  { method: 'POST', path: '/api/disputes', access: PUBLIC, handler: handleCreateDispute },
  { method: 'GET', path: '/api/disputes', access: PUBLIC, handler: handleListDisputes },
  { method: 'GET', path: /^\/api\/disputes\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetDispute(request, env, m[1], request.user?.userId || null) },

  // Suppliers
  { method: 'POST', path: '/api/suppliers', access: 'suppliers:write', handler: handleCreateSupplier },
  { method: 'GET', path: '/api/suppliers', access: 'suppliers:read', handler: handleListSuppliers },
  { method: 'GET', path: /^\/api\/suppliers\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetSupplier(request, env, m[1]) },
  { method: 'DELETE', path: /^\/api\/suppliers\/([^/]+)$/, access: 'suppliers:write', handler: (request, env, m) => handleDeleteSupplier(request, env, m[1]) },
  { method: 'PATCH', path: /^\/api\/suppliers\/([^/]+)$/, access: 'suppliers:write', handler: (request, env, m) => handleUpdateSupplier(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/suppliers\/([^/]+)\/scan$/, access: 'suppliers:write', handler: (request, env, m) => handleRescanSupplier(request, env, m[1]) },

  // Admin
  { method: 'GET', path: '/api/admin/disputes', access: 'admin:disputes', handler: handleAdminListDisputes },
  { method: 'PATCH', path: /^\/api\/admin\/disputes\/([^/]+)$/, access: 'admin:disputes', handler: (request, env, m) => handleAdminUpdateDispute(request, env, m[1]) },
  { method: 'POST', path: /^\/api\/admin\/content\/([^/]+)\/delete$/, access: 'admin:takedown', handler: (request, env, m) => handleAdminDeleteContent(request, env, m[1]) },
  { method: 'GET', path: '/api/admin/repeat-infringers', access: 'admin:disputes', handler: handleGetRepeatInfringers },
  { method: 'GET', path: '/api/admin/actions', access: 'admin:disputes', handler: handleGetAdminActions },
  { method: 'GET', path: '/api/admin/stats', access: 'admin:stats', handler: handleGetStats },
  { method: 'GET', path: '/api/admin/stats/financial', access: 'admin:stats', handler: handleGetFinancialStats },
  { method: 'GET', path: '/api/admin/stats/content', access: 'admin:stats', handler: handleGetContentStats },
  { method: 'GET', path: '/api/admin/stats/users', access: 'admin:stats', handler: handleGetUserStats },
  { method: 'GET', path: '/api/admin/health', access: 'admin:stats', handler: handleGetAdminHealth },
  { method: 'POST', path: '/api/admin/alerts/test', access: 'admin:stats', handler: handleTestAlertWebhook },
  { method: 'GET', path: '/api/admin/alerts', access: 'admin:stats', handler: handleGetAlerts },
  { method: 'POST', path: /^\/api\/admin\/alerts\/([^/]+)\/acknowledge$/, access: 'admin:stats', handler: (request, env, m) => handleAcknowledgeAlert(request, env, m[1]) },
  { method: 'GET', path: '/api/admin/audit-log', access: 'admin:stats', handler: handleGetAuditLog },
  { method: 'GET', path: '/api/admin/export', access: 'admin:export', handler: handleExportData },
  { method: ['GET', 'POST'], path: '/api/admin/cost-safety', access: 'admin:costs', handler: handleCostSafety },
  { method: 'GET', path: '/api/admin/cost-safety/history', access: 'admin:costs', handler: handleCostSafety },
  { method: 'GET', path: '/api/admin/costs', access: 'admin:costs', handler: handleGetCosts },
  { method: 'GET', path: '/api/admin/costs/by-service', access: 'admin:costs', handler: handleGetCostsByService },
  { method: 'POST', path: '/api/admin/costs/record', access: 'admin:costs', handler: handleRecordCost },
  { method: 'GET', path: '/api/admin/profitability', access: 'admin:costs', handler: handleGetProfitability },
  { method: 'GET', path: '/api/admin/backups', access: 'admin:backups', handler: handleGetBackupStatus },
  { method: 'POST', path: '/api/admin/backups/run', access: 'admin:backups', handler: handleRunBackup },
  { method: 'GET', path: '/api/admin/backups/file', access: 'admin:backups', handler: handleGetBackupFile },
  { method: 'GET', path: /^\/api\/admin\/backups\/([^/]+)\/files$/, access: 'admin:backups', handler: (request, env, m) => handleListBackupFiles(request, env, m[1]) },
  { method: 'POST', path: '/api/admin/restore', access: 'admin:restore', handler: handleRestoreObject },

  // Public deletion records (transparency)
  { method: 'GET', path: '/api/public/deletions/stats', access: PUBLIC, handler: handleGetDeletionStats },
  { method: 'GET', path: /^\/api\/public\/deletions\/([^/]+)$/, access: PUBLIC, handler: (request, env, m) => handleGetDeletion(request, env, m[1]) },
  { method: 'GET', path: '/api/public/deletions', access: PUBLIC, handler: handleListDeletions }
];

/**
 * The declared API routes, for tests that check every route's access.
 */
export function apiRoutes() {
  return API_ROUTES;
}

function matchRoute(route, method, pathname) {
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  if (!methods.includes(method)) return null;
  if (typeof route.path === 'string') return route.path === pathname ? [pathname] : null;
  return pathname.match(route.path);
}

/**
 * Handle API routes: find the declared route, enforce its access, then run it
 */
async function handleApiRoutes(url, request, env) {
  for (const route of API_ROUTES) {
    const match = matchRoute(route, request.method, url.pathname);
    if (!match) continue;

    const authResult = await authenticate(request, env);
    const denied = checkAccess(authResult, route.access, () => requireAuth(authResult));
    if (denied) return denied;

    // Handlers read the caller from request.user. On public routes only the account's
    // own session counts, so keys and app tokens never act as the user there.
    request.auth = authResult;
    if (authResult.authenticated && (route.access !== PUBLIC || isSessionAuth(authResult))) {
      request.user = authResult.user;
    }
    return route.handler(request, env, match);
  }

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
    authMode: isLocalMode ? 'local' : 'clerk',
    content_domain: getContentDomain(env),
    max_upload_bytes: MAX_UPLOAD_BYTES,
    api_key_scopes: USER_SCOPES
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
    const oauthSigningKeyConfigured = envName === 'local' ? true : !!env.OAUTH_SIGNING_KEY;
    
    const allValid = envValid && logLevelValid && oauthSigningKeyConfigured;
    
    return {
      status: allValid ? 'operational' : 'degraded',
      message: allValid ? 'Environment configuration valid' : 'Environment configuration issues detected',
      details: {
        environment: envName,
        environmentValid: envValid,
        logLevel: logLevel,
        logLevelValid: logLevelValid,
        oauthSigningKeyConfigured
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
    { name: 'MESSAGE_THREADS', binding: env.MESSAGE_THREADS }
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
export async function checkClerk(env) {
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
    publishableKeyConfigured: false,
    usingTestKeysInProduction: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.CLERK_SECRET_KEY;
    checks.publishableKeyConfigured = !!env.CLERK_PUBLISHABLE_KEY;
    checks.usingTestKeysInProduction = env.ENVIRONMENT === 'production' && (
      (env.CLERK_SECRET_KEY || '').startsWith('sk_test_') ||
      (env.CLERK_PUBLISHABLE_KEY || '').startsWith('pk_test_')
    );

    const allConfigured = checks.secretKeyConfigured &&
                          checks.publishableKeyConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.publishableKeyConfigured;
    const healthy = allConfigured && !checks.usingTestKeysInProduction;

    return {
      status: healthy ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: healthy
        ? 'Clerk secrets configured'
        : (checks.usingTestKeysInProduction
            ? 'Clerk is using test keys in production'
            : (someConfigured ? 'Some Clerk secrets missing' : 'Clerk not configured')),
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
export async function checkStripe(env) {
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
    webhookSecretConfigured: false,
    usingTestKeysInProduction: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.STRIPE_SECRET_KEY;
    checks.webhookSecretConfigured = !!env.STRIPE_WEBHOOK_SECRET;
    // Standard (sk_) and restricted (rk_) keys both carry a _test_ marker in test mode
    checks.usingTestKeysInProduction = env.ENVIRONMENT === 'production' &&
      /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '');

    const allConfigured = checks.secretKeyConfigured &&
                          checks.webhookSecretConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.webhookSecretConfigured;
    const healthy = allConfigured && !checks.usingTestKeysInProduction;

    return {
      status: healthy ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: healthy
        ? 'Stripe secrets configured'
        : (checks.usingTestKeysInProduction
            ? 'Stripe is using test keys in production'
            : (someConfigured ? 'Some Stripe secrets missing' : 'Stripe not configured')),
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
