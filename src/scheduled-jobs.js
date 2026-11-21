/**
 * Cron jobs. Spread into the Worker's default export (src/index.js), so `this` is the
 * Worker and tests can call each job on it.
 */
import { runCostMonitor } from './services/cost-monitor.js';
import { disputeExpires } from './durable-objects/dispute-record.js';
import { getRepeatInfringers } from './api/admin-disputes.js';
import { deleteContent, getContentMetadata } from './services/content-deletion.js';
import { cleanupPendingR2Deletions } from './services/r2-cleanup.js';
import { runAppSafetyChecks } from './api/app-safety.js';

// Anomaly detection thresholds
const ANOMALY_DETECTION = {
  DEPOSIT_VELOCITY_MULTIPLIER: 5,    // Alert if deposits > 5x normal rate
  DEPOSIT_VELOCITY_ABSOLUTE: 20,     // Alert if deposits > 20 per hour
  UPLOAD_VELOCITY_MULTIPLIER: 5,     // Alert if uploads > 5x normal rate
  UPLOAD_VELOCITY_ABSOLUTE: 100      // Alert if uploads > 100 per hour
};

export const scheduledJobs = {

  /** Hourly safety monitoring; maintenance remains nightly at 02:00 UTC. */
  async scheduled(event, env, _ctx) {
    const now = new Date(event.scheduledTime || Date.now());
    // Isolate failures so a maintenance error cannot skip monitoring.
    for (const job of [() => runCostMonitor(env, now), () => this.runAnomalyDetection(env), () => this.checkNciiDeadlines(env, now)]) {
      try { await job(); } catch (error) { console.error('Hourly safety job failed:', error); }
    }
    if (now.getUTCHours() !== 2) return;
    for (const job of [this.processExpiredContent, this.computePlatformSnapshot, this.cleanupAuditLog,
      this.processExpiredDisputes, this.cleanupR2PendingDeletion, this.startBackupSnapshot, runAppSafetyChecks]) {
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
   * Alert while intimate-image reports wait for a decision past half their 48-hour window.
   * Their content is blocked from the moment of the report; the decision removes it for good.
   */
  async checkNciiDeadlines(env, now = new Date()) {
    const index = env.DISPUTE_INDEX.get(env.DISPUTE_INDEX.idFromName('dispute-index:global'));
    const list = await (await index.fetch(new Request('http://internal/list?claim_type=ncii&limit=100'))).json();
    const waiting = (list.disputes || [])
      .filter(d => d.removal_due_at && new Date(d.removal_due_at) - now < 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.removal_due_at) - new Date(b.removal_due_at));
    if (waiting.length === 0) return;

    const overdue = new Date(waiting[0].removal_due_at) <= now;
    const alertStore = env.ALERT_STORE.get(env.ALERT_STORE.idFromName('global'));
    await alertStore.fetch(new Request('https://dummy/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ncii_deadline',
        severity: 'critical',
        title: overdue ? 'Intimate image report past its 48-hour deadline' : 'Intimate image report due within 24 hours',
        message: `${waiting.length} report(s) need a decision at /admin/disputes.html; the earliest ${overdue ? 'was' : 'is'} due by ${waiting[0].removal_due_at} (content ${waiting[0].cid}).`,
        metadata: { disputes: waiting.map(d => ({ cid: d.cid, dispute_id: d.dispute_id, removal_due_at: d.removal_due_at })) }
      })
    }));
  },

  /**
   * Process expired disputes
   * Closes disputes past their expires_at as closed_expired, and restores copyright content
   * whose counter-notice wait has passed with no reported court action (closed_restored).
   * Copyright and intimate-image reports have no expiry: their content stays blocked until
   * an administrator decides.
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
      let restored = 0;
      
      for (const dispute of listData.disputes || []) {
        try {
          const disputeRecordStub = env.DISPUTE_RECORD.get(env.DISPUTE_RECORD.idFromName(`dispute:${dispute.cid}`));
          let close = null;

          if (dispute.claim_type === 'copyright') {
            // The counter-notice wait lives on the record, not the index
            const recordResponse = await disputeRecordStub.fetch(new Request('http://internal/dispute'));
            const record = recordResponse.ok ? await recordResponse.json() : null;
            if (record?.restore_after && !record.court_action_at && new Date(record.restore_after) <= now) {
              close = {
                status: 'closed_restored',
                resolution: 'restored',
                resolution_reason: 'Restored after a counter-notice; no court action was reported during the waiting period'
              };
            }
          } else if (dispute.expires_at && disputeExpires(dispute.claim_type) && new Date(dispute.expires_at) <= now) {
            close = {
              status: 'closed_expired',
              resolution: 'expired',
              resolution_reason: 'Dispute expired after 30 days without resolution'
            };
          }
          if (!close) continue;

          const closeResponse = await disputeRecordStub.fetch(new Request('http://internal/dispute', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...close, resolved_by: 'system' })
          }));
          if (!closeResponse.ok) {
            throw new Error(`DisputeRecord returned ${closeResponse.status}`);
          }

          if (dispute.target_type !== 'alias') {
          const availability = env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(dispute.cid));
          const availabilityResponse = await availability.fetch(new Request('http://internal/availability', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disputed: false })
          }));
          if (!availabilityResponse.ok) throw new Error('Failed to publish dispute closure');
          // A closed dispute no longer blocks the content: 256t.us serves 451 while this marker exists
          await env.CONTENT_BUCKET.delete(`${dispute.cid}.disputed`);
          }

          // Remove from DisputeIndex
          await indexStub.fetch(new Request('http://internal/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dispute_id: dispute.dispute_id
            })
          }));

          if (close.status === 'closed_restored') restored++;
          else expired++;
        } catch (error) {
          console.error(`Error closing dispute ${dispute.dispute_id}:`, error);
        }
      }
      
      console.log(`Disputes processed: ${expired} expired, ${restored} restored after counter-notice`);
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
