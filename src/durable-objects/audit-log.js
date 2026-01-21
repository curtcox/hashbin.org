/**
 * AuditLog Durable Object
 * Tracks admin actions and significant system events
 * Implements 1-year retention with automatic cleanup
 */

export class AuditLog {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Create audit entry
      if (path === '/log' && request.method === 'POST') {
        const body = await request.json();
        return this.logEntry(body);
      }

      // List audit entries
      if (path === '/list' && request.method === 'GET') {
        return this.listEntries(url.searchParams);
      }

      // Cleanup old entries (called by scheduled job)
      if (path === '/cleanup' && request.method === 'POST') {
        return this.cleanupOldEntries();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('AuditLog error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Log an audit entry
   */
  async logEntry(body) {
    const {
      actor_type,
      actor_id,
      action,
      resource_type,
      resource_id,
      metadata = {},
      ip_address = null
    } = body;

    if (!actor_type || !actor_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const entryId = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const entry = {
      id: entryId,
      timestamp: new Date().toISOString(),
      actor_type,
      actor_id,
      action,
      resource_type: resource_type || null,
      resource_id: resource_id || null,
      metadata,
      ip_address
    };

    await this.state.storage.put(entryId, entry);

    return new Response(
      JSON.stringify({ entry }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * List audit entries with filtering
   */
  async listEntries(searchParams) {
    const actorType = searchParams.get('actor_type');
    const actorId = searchParams.get('actor_id');
    const action = searchParams.get('action');
    const resourceType = searchParams.get('resource_type');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const entries = await this.state.storage.list({ prefix: 'audit_' });
    let entryList = Array.from(entries.values());

    // Apply filters
    if (actorType) {
      entryList = entryList.filter(e => e.actor_type === actorType);
    }
    if (actorId) {
      entryList = entryList.filter(e => e.actor_id === actorId);
    }
    if (action) {
      entryList = entryList.filter(e => e.action === action);
    }
    if (resourceType) {
      entryList = entryList.filter(e => e.resource_type === resourceType);
    }
    if (startDate) {
      const start = new Date(startDate);
      entryList = entryList.filter(e => new Date(e.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      entryList = entryList.filter(e => new Date(e.timestamp) <= end);
    }

    // Sort by timestamp (newest first)
    entryList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const total = entryList.length;
    const paginatedEntries = entryList.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        entries: paginatedEntries,
        total,
        limit,
        offset,
        has_more: offset + limit < total
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Cleanup entries older than 1 year
   */
  async cleanupOldEntries() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const entries = await this.state.storage.list({ prefix: 'audit_' });
    let deletedCount = 0;

    for (const [key, entry] of entries) {
      if (new Date(entry.timestamp) < oneYearAgo) {
        await this.state.storage.delete(key);
        deletedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        cutoff_date: oneYearAgo.toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
