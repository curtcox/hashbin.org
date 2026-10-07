/**
 * AdminActionLog Durable Object
 * Logs all admin actions with append-only storage
 * Singleton: admin-action-log:global
 */

import { handleBackupRequest } from '../utils/backup.js';

/**
 * AdminActionLog Durable Object
 */
export class AdminActionLog {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Handle requests to this Durable Object
   */
  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const url = new URL(request.url);
    const method = request.method;

    try {
      // POST /log - Add new action log entry
      if (method === 'POST' && url.pathname === '/log') {
        return await this.logAction(request);
      }

      // GET /actions - Get action logs with filtering
      if (method === 'POST' && url.pathname === '/strike') {
        return await this.recordStrike(await request.json());
      }

      if (method === 'GET' && url.pathname === '/repeat-infringers') {
        const min = parseInt(url.searchParams.get('min') || '3');
        const since = url.searchParams.get('since') || new Date(0).toISOString();
        return await this.listRepeatInfringers(min, since);
      }

      if (method === 'GET' && url.pathname === '/actions') {
        return await this.getActions(url);
      }

      // GET /stats - Get action statistics
      if (method === 'GET' && url.pathname === '/stats') {
        return await this.getStats();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('AdminActionLog error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Log an admin action (append-only)
   */
  async logAction(request) {
    const data = await request.json();
    
    // Validation
    if (!data.admin_user_id) {
      return new Response(JSON.stringify({ error: 'ADMIN_USER_ID_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validActionTypes = [
      'content_deleted',
      'dispute_denied',
      'dispute_approved',
      'dispute_status_changed'
    ];

    if (!data.action_type || !validActionTypes.includes(data.action_type)) {
      return new Response(JSON.stringify({ error: 'INVALID_ACTION_TYPE' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create action entry
    const action = {
      action_id: `action_${crypto.randomUUID()}`,
      admin_user_id: data.admin_user_id,
      action_type: data.action_type,
      timestamp: new Date().toISOString(),
      target_cid: data.target_cid || null,
      target_dispute_id: data.target_dispute_id || null,
      details: data.details || {}
    };

    // Get existing actions
    const actions = await this.state.storage.get('actions') || [];
    
    // Append new action (append-only)
    actions.push(action);
    
    // Store updated actions
    await this.state.storage.put('actions', actions);

    return new Response(JSON.stringify({ 
      success: true,
      action_id: action.action_id
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Record an upheld copyright removal against an uploader (one per CID)
   */
  async recordStrike({ uploader_id, cid, dispute_id }) {
    if (!uploader_id || !cid) {
      return Response.json({ error: 'UPLOADER_AND_CID_REQUIRED' }, { status: 400 });
    }
    const key = `strike:${uploader_id}`;
    const strikes = (await this.state.storage.get(key)) || [];
    if (!strikes.some(strike => strike.cid === cid)) {
      strikes.push({ cid, dispute_id: dispute_id || null, at: new Date().toISOString() });
      await this.state.storage.put(key, strikes);
    }
    return Response.json({ uploader_id, strikes: strikes.length }, { status: 201 });
  }

  /**
   * Uploaders with at least `min` upheld copyright removals since `since`
   */
  async listRepeatInfringers(min, since) {
    const entries = await this.state.storage.list({ prefix: 'strike:' });
    const infringers = [];
    for (const [key, strikes] of entries) {
      const recent = strikes.filter(strike => strike.at >= since);
      if (recent.length >= min) {
        infringers.push({ uploader_id: key.slice('strike:'.length), strikes: recent.length, recent_strikes: recent });
      }
    }
    infringers.sort((a, b) => b.strikes - a.strikes);
    return Response.json({ min, since, infringers });
  }

  /**
   * Get action logs with filtering and pagination
   */
  async getActions(url) {
    const actions = await this.state.storage.get('actions') || [];
    
    // Parse query parameters
    const actionType = url.searchParams.get('action_type');
    const adminUserId = url.searchParams.get('admin_user_id');
    const targetCid = url.searchParams.get('target_cid');
    const targetDisputeId = url.searchParams.get('target_dispute_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Filter actions
    let filtered = actions;
    
    if (actionType) {
      filtered = filtered.filter(a => a.action_type === actionType);
    }
    
    if (adminUserId) {
      filtered = filtered.filter(a => a.admin_user_id === adminUserId);
    }
    
    if (targetCid) {
      filtered = filtered.filter(a => a.target_cid === targetCid);
    }
    
    if (targetDisputeId) {
      filtered = filtered.filter(a => a.target_dispute_id === targetDisputeId);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Paginate
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return new Response(JSON.stringify({
      actions: paginated,
      total,
      limit,
      offset
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get action statistics
   */
  async getStats() {
    const actions = await this.state.storage.get('actions') || [];
    
    // Calculate statistics
    const stats = {
      total_actions: actions.length,
      by_type: {},
      by_admin: {},
      recent_actions: actions.slice(-10).reverse() // Last 10 actions
    };

    // Count by action type
    for (const action of actions) {
      stats.by_type[action.action_type] = (stats.by_type[action.action_type] || 0) + 1;
      stats.by_admin[action.admin_user_id] = (stats.by_admin[action.admin_user_id] || 0) + 1;
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
