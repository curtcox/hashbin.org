/**
 * DeletionRecord Durable Object
 * Stores public deletion records for transparency
 * 
 * Single global instance stores all deletion records with pagination
 */

import { createHash } from 'node:crypto';

export class DeletionRecord {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Create deletion record
      if (url.pathname === '/record' && method === 'POST') {
        const data = await request.json();
        return await this.createDeletionRecord(data);
      }

      // Get all deletion records (paginated)
      if (url.pathname === '/records' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const reason = url.searchParams.get('reason');
        return await this.getDeletionRecords(limit, offset, reason);
      }

      // Get specific deletion record by hash
      if (url.pathname.startsWith('/record/') && method === 'GET') {
        const hash = url.pathname.split('/')[2];
        return await this.getDeletionRecord(hash);
      }

      // Get deletion statistics
      if (url.pathname === '/stats' && method === 'GET') {
        return await this.getDeletionStats();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Internal error',
          message: error.message
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  }

  /**
   * Hash uploader ID for privacy
   */
  hashUploaderId(uploaderId) {
    if (!uploaderId) return null;
    return createHash('sha256').update(uploaderId).digest('hex').substring(0, 16);
  }

  /**
   * Create a deletion record
   */
  async createDeletionRecord(data) {
    const { hash_256t, reason, uploader_id, size_bytes, content_type } = data;

    // Check if deletion record already exists (idempotency)
    const existingRecord = await this.state.storage.get(`deletion:${hash_256t}`);
    if (existingRecord) {
      return new Response(JSON.stringify(existingRecord), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const deletionRecord = {
      hash_256t,
      deleted_at: new Date().toISOString(),
      reason, // 'expired', 'contested', 'admin_action', etc.
      uploader_id_hash: this.hashUploaderId(uploader_id),
      size_bytes: size_bytes || null,
      content_type: content_type || null
    };

    // Store deletion record
    await this.state.storage.put(`deletion:${hash_256t}`, deletionRecord);

    // Add to chronological list
    const allDeletions = await this.state.storage.get('deletions') || [];
    allDeletions.unshift(hash_256t); // newest first
    await this.state.storage.put('deletions', allDeletions);

    // Update statistics
    await this.updateStats(reason);

    return new Response(JSON.stringify(deletionRecord), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get deletion records with pagination and filtering
   */
  async getDeletionRecords(limit, offset, reasonFilter) {
    const allDeletionHashes = await this.state.storage.get('deletions') || [];
    
    // Get deletions in the requested range
    const requestedHashes = allDeletionHashes.slice(offset, offset + limit);
    
    // Fetch full deletion objects
    const deletions = [];
    for (const hash of requestedHashes) {
      const deletion = await this.state.storage.get(`deletion:${hash}`);
      if (deletion) {
        // Apply reason filter if specified
        if (!reasonFilter || deletion.reason === reasonFilter) {
          deletions.push(deletion);
        }
      }
    }

    return new Response(
      JSON.stringify({
        deletions,
        total: allDeletionHashes.length,
        limit,
        offset
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get a specific deletion record by hash
   */
  async getDeletionRecord(hash) {
    const deletion = await this.state.storage.get(`deletion:${hash}`);

    if (!deletion) {
      return new Response(
        JSON.stringify({
          error: 'Deletion record not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(deletion), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Update deletion statistics
   */
  async updateStats(reason) {
    const stats = await this.state.storage.get('stats') || {
      total_deletions: 0,
      by_reason: {}
    };

    stats.total_deletions++;
    stats.by_reason[reason] = (stats.by_reason[reason] || 0) + 1;
    stats.last_updated = new Date().toISOString();

    await this.state.storage.put('stats', stats);
  }

  /**
   * Get deletion statistics
   */
  async getDeletionStats() {
    const stats = await this.state.storage.get('stats') || {
      total_deletions: 0,
      by_reason: {},
      last_updated: null
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}
