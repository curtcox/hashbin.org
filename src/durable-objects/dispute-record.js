/**
 * DisputeRecord Durable Object
 * Stores dispute records and history for a single CID
 */

import { handleBackupRequest, registerForBackup } from '../utils/backup.js';

// Reports of intimate images published without consent (TAKE IT DOWN Act, 47 U.S.C. § 223a).
// They block the content at once, never expire, and must be decided within 48 hours.
export const NCII_CLAIM_TYPE = 'ncii';
export const NCII_REMOVAL_HOURS = 48;
const NCII_SIGNATURE_MAX = 200;

// Copyright reports stay open until decided: restoring noticed content without a counter-notice
// risks the DMCA safe harbor (17 U.S.C. § 512(g)). After a counter-notice, content comes back
// 10–14 business days later unless the reporter says they filed suit. 12 weekdays stays inside
// that window with up to two holidays in it, and the nightly restore adds at most a day.
const NON_EXPIRING_CLAIM_TYPES = [NCII_CLAIM_TYPE, 'copyright'];
export const COUNTER_NOTICE_WAIT_WEEKDAYS = 12;

/**
 * Whether disputes of this kind close on their own after 30 days
 * @param {string} claimType - Dispute claim type
 * @returns {boolean} False for copyright and intimate image reports
 */
export function disputeExpires(claimType) {
  return !NON_EXPIRING_CLAIM_TYPES.includes(claimType);
}

/**
 * Add weekdays (Monday–Friday, UTC) to a date
 * @param {Date} date - Start
 * @param {number} days - Weekdays to add
 * @returns {Date} The resulting date, same time of day
 */
export function addWeekdays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/**
 * DisputeRecord Durable Object
 * One instance per CID
 */
export class DisputeRecord {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const response = await this.handleRequest(request);
    await this.ensureBackupRegistration();
    return response;
  }

  /**
   * Name this object was created with, once its data identifies it
   */
  async backupName() {
    const active = await this.state.storage.get('active_dispute');
    const cid = active?.cid || (await this.state.storage.get('dispute_history'))?.[0]?.cid;
    return cid ? `dispute:${cid}` : null;
  }

  /**
   * Register with the BackupIndex (once per object; see src/utils/backup.js)
   */
  async ensureBackupRegistration() {
    if (this.backupRegistered) return;
    const name = await this.backupName();
    if (!name) return;
    this.backupRegistered = await registerForBackup(this.state, this.env, 'DISPUTE_RECORD', name);
  }

  /**
   * Handle requests to this Durable Object
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // POST /dispute - Create new dispute
      if (method === 'POST' && url.pathname === '/dispute') {
        return await this.createDispute(request);
      }

      // GET /dispute - Get current active dispute
      if (method === 'GET' && url.pathname === '/dispute') {
        return await this.getActiveDispute();
      }

      // GET /history - Get all disputes for this CID
      if (method === 'GET' && url.pathname === '/history') {
        return await this.getHistory();
      }

      // PATCH /dispute - Update dispute status
      if (method === 'PATCH' && url.pathname === '/dispute') {
        return await this.updateDispute(request);
      }

      // GET /can-dispute - Check if can create new dispute
      if (method === 'GET' && url.pathname === '/can-dispute') {
        return await this.canDispute();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('DisputeRecord error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Create a new dispute
   */
  async createDispute(request) {
    const data = await request.json();
    
    // Validation
    if (!data.cid) {
      return new Response(JSON.stringify({ error: 'CID_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validClaimTypes = ['copyright', 'illegal', 'privacy', 'harassment', 'malware', 'other', NCII_CLAIM_TYPE];
    if (!data.claim_type || !validClaimTypes.includes(data.claim_type)) {
      return new Response(JSON.stringify({ error: 'INVALID_CLAIM_TYPE' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const isNcii = data.claim_type === NCII_CLAIM_TYPE;

    // The law's valid request is a signature, the content, a good-faith statement and contact
    // details; an explanation is optional, so a short one must not invalidate the report
    let nciiStatement = null;
    if (isNcii) {
      const signature = typeof data.ncii?.signature === 'string' ? data.ncii.signature.trim() : '';
      if (signature.length < 2 || signature.length > NCII_SIGNATURE_MAX) {
        return new Response(JSON.stringify({ error: 'SIGNATURE_REQUIRED' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (data.ncii.good_faith !== true) {
        return new Response(JSON.stringify({ error: 'NCII_STATEMENT_REQUIRED' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      nciiStatement = { signature, on_behalf: data.ncii.on_behalf === true, good_faith: true };
    }

    if (isNcii && data.evidence == null) data.evidence = '';
    if (typeof data.evidence !== 'string' || (!isNcii && data.evidence.length < 50)) {
      return new Response(JSON.stringify({ error: 'EVIDENCE_TOO_SHORT' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (data.evidence.length > 10000) {
      return new Response(JSON.stringify({ error: 'EVIDENCE_TOO_LONG' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate evidence URLs
    if (data.evidence_urls && data.evidence_urls.length > 0) {
      if (data.evidence_urls.length > 10) {
        return new Response(JSON.stringify({ error: 'TOO_MANY_EVIDENCE_URLS' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      for (const url of data.evidence_urls) {
        try {
          const parsed = new URL(url);
          // Only allow HTTPS URLs
          if (parsed.protocol !== 'https:') {
            return new Response(JSON.stringify({ error: 'INVALID_EVIDENCE_URL', details: 'Only HTTPS URLs allowed' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          // Prevent internal network addresses and localhost
          const hostname = parsed.hostname.toLowerCase();
          if (hostname === 'localhost' || 
              hostname === '127.0.0.1' || 
              hostname === '0.0.0.0' ||
              hostname.startsWith('192.168.') ||
              hostname.startsWith('10.') ||
              hostname.startsWith('172.16.') ||
              hostname.startsWith('169.254.') ||
              hostname === '::1') {
            return new Response(JSON.stringify({ error: 'INVALID_EVIDENCE_URL', details: 'Internal URLs not allowed' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch {
          return new Response(JSON.stringify({ error: 'INVALID_EVIDENCE_URL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Validate contact info
    if (!data.contact || !data.contact.type || !data.contact.value) {
      return new Response(JSON.stringify({ error: 'CONTACT_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!['email', 'url'].includes(data.contact.type)) {
      return new Response(JSON.stringify({ error: 'INVALID_CONTACT_TYPE' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check for existing open dispute. An intimate-image report can't wait behind another kind
    // of dispute, so it replaces that one; the content stays blocked throughout.
    const activeDispute = await this.state.storage.get('active_dispute');
    const history = await this.state.storage.get('dispute_history') || [];
    let supersededDisputeId = null;
    if (activeDispute) {
      if (!isNcii || activeDispute.claim_type === NCII_CLAIM_TYPE) {
        return new Response(JSON.stringify({ error: 'DISPUTE_EXISTS' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const closedAt = new Date().toISOString();
      Object.assign(activeDispute, {
        status: 'closed_superseded',
        resolution: 'superseded',
        resolution_reason: 'Replaced by a report of an intimate image shared without consent',
        resolved_by: 'system',
        closed_at: closedAt,
        updated_at: closedAt
      });
      const index = history.findIndex(d => d.dispute_id === activeDispute.dispute_id);
      if (index >= 0) history[index] = activeDispute;
      await this.state.storage.delete('active_dispute');
      supersededDisputeId = activeDispute.dispute_id;
    }

    // Check re-dispute rate limit (30 days); it never delays an intimate-image report
    const lastClosedDispute = isNcii ? null : history
      .filter(d => d.closed_at)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];

    if (lastClosedDispute) {
      const daysSinceClosed = (Date.now() - new Date(lastClosedDispute.closed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceClosed < 30) {
        return new Response(JSON.stringify({ 
          error: 'REDISPUTE_TOO_SOON',
          days_remaining: Math.ceil(30 - daysSinceClosed)
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create dispute
    const now = new Date().toISOString();
    const expiresAt = disputeExpires(data.claim_type) ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null; // 30 days
    const removalDueAt = isNcii ? new Date(Date.now() + NCII_REMOVAL_HOURS * 60 * 60 * 1000).toISOString() : null;
    
    const dispute = {
      dispute_id: `disp_${crypto.randomUUID()}`,
      cid: data.cid,
      status: 'open',
      created_at: now,
      updated_at: now,
      closed_at: null,
      expires_at: expiresAt,
      removal_due_at: removalDueAt,
      
      // Submitter info
      submitter_contact: {
        type: data.contact.type,
        value: data.contact.value,
        verified: false
      },
      submitter_ip_hash: data.submitter_ip_hash || null,
      
      // Claim details
      claim_type: data.claim_type,
      evidence: data.evidence,
      evidence_urls: data.evidence_urls || [],
      ncii_statement: nciiStatement,
      
      // Resolution
      resolution: null,
      resolution_reason: null,
      resolved_by: null
    };

    // Store as active dispute
    await this.state.storage.put('active_dispute', dispute);
    
    // Add to history
    history.push(dispute);
    await this.state.storage.put('dispute_history', history);

    return new Response(JSON.stringify({ 
      success: true,
      dispute: {
        dispute_id: dispute.dispute_id,
        cid: dispute.cid,
        status: dispute.status,
        created_at: dispute.created_at,
        expires_at: dispute.expires_at,
        removal_due_at: dispute.removal_due_at
      },
      superseded_dispute_id: supersededDisputeId
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get active dispute
   */
  async getActiveDispute() {
    const activeDispute = await this.state.storage.get('active_dispute');
    
    if (!activeDispute) {
      return new Response(JSON.stringify({ error: 'NO_ACTIVE_DISPUTE' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(activeDispute), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get dispute history
   */
  async getHistory() {
    const history = await this.state.storage.get('dispute_history') || [];
    
    return new Response(JSON.stringify({ 
      disputes: history,
      total: history.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Update dispute status
   */
  async updateDispute(request) {
    const data = await request.json();
    const activeDispute = await this.state.storage.get('active_dispute');
    
    if (!activeDispute) {
      return new Response(JSON.stringify({ error: 'NO_ACTIVE_DISPUTE' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update fields
    if (data.status) {
      const validStatuses = ['open', 'under_review', 'closed_deleted', 'closed_denied', 'closed_expired', 'closed_superseded', 'closed_restored'];
      if (!validStatuses.includes(data.status)) {
        return new Response(JSON.stringify({ error: 'INVALID_STATUS' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      activeDispute.status = data.status;
    }

    if (data.resolution) {
      activeDispute.resolution = data.resolution;
    }

    if (data.resolution_reason) {
      activeDispute.resolution_reason = data.resolution_reason;
    }

    if (data.resolved_by) {
      activeDispute.resolved_by = data.resolved_by;
    }

    // A counter-notice schedules the content's return; a reported court action cancels it
    if (data.counter_notice) {
      if (activeDispute.claim_type !== 'copyright') {
        return new Response(JSON.stringify({ error: 'COUNTER_NOTICE_COPYRIGHT_ONLY' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const receivedAt = new Date(data.counter_notice.received_at || Date.now());
      if (Number.isNaN(receivedAt.getTime()) || receivedAt > new Date()) {
        return new Response(JSON.stringify({ error: 'INVALID_RECEIVED_AT' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      activeDispute.counter_notice_received_at = receivedAt.toISOString();
      activeDispute.restore_after = activeDispute.court_action_at
        ? null
        : addWeekdays(receivedAt, COUNTER_NOTICE_WAIT_WEEKDAYS).toISOString();
      activeDispute.status = 'under_review';
    }

    if (data.court_action) {
      activeDispute.court_action_at = new Date().toISOString();
      activeDispute.restore_after = null;
    }

    // If closing, set closed_at
    if (data.status && data.status.startsWith('closed_')) {
      activeDispute.closed_at = new Date().toISOString();
      // Remove from active disputes
      await this.state.storage.delete('active_dispute');
    } else {
      // Update active dispute
      await this.state.storage.put('active_dispute', activeDispute);
    }

    activeDispute.updated_at = new Date().toISOString();

    // Update history
    const history = await this.state.storage.get('dispute_history') || [];
    const index = history.findIndex(d => d.dispute_id === activeDispute.dispute_id);
    if (index >= 0) {
      history[index] = activeDispute;
      await this.state.storage.put('dispute_history', history);
    }

    return new Response(JSON.stringify({ 
      success: true,
      dispute: activeDispute
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Check if can create new dispute (for rate limiting)
   */
  async canDispute() {
    // Check for active dispute
    const activeDispute = await this.state.storage.get('active_dispute');
    if (activeDispute) {
      return new Response(JSON.stringify({ 
        can_dispute: false,
        reason: 'DISPUTE_EXISTS'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check re-dispute rate limit
    const history = await this.state.storage.get('dispute_history') || [];
    const lastClosedDispute = history
      .filter(d => d.closed_at)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];

    if (lastClosedDispute) {
      const daysSinceClosed = (Date.now() - new Date(lastClosedDispute.closed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceClosed < 30) {
        return new Response(JSON.stringify({ 
          can_dispute: false,
          reason: 'REDISPUTE_TOO_SOON',
          days_remaining: Math.ceil(30 - daysSinceClosed)
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ 
      can_dispute: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
