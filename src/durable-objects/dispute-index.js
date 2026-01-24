/**
 * DisputeIndex Durable Object
 * Maintains an index of all open disputes with caching support
 * Singleton: dispute-index:global
 */

/**
 * DisputeIndex Durable Object
 */
export class DisputeIndex {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Handle requests to this Durable Object
   */
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // POST /add - Add dispute to index
      if (method === 'POST' && url.pathname === '/add') {
        return await this.addDispute(request);
      }

      // POST /remove - Remove dispute from index
      if (method === 'POST' && url.pathname === '/remove') {
        return await this.removeDispute(request);
      }

      // GET /list - List open disputes
      if (method === 'GET' && url.pathname === '/list') {
        return await this.listDisputes(url);
      }

      // GET /cache-info - Get cache info
      if (method === 'GET' && url.pathname === '/cache-info') {
        return await this.getCacheInfo();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('DisputeIndex error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Add dispute to index
   */
  async addDispute(request) {
    const data = await request.json();
    
    if (!data.cid || !data.dispute_id || !data.claim_type || !data.created_at || !data.expires_at) {
      return new Response(JSON.stringify({ error: 'MISSING_REQUIRED_FIELDS' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const disputes = await this.state.storage.get('open_disputes') || [];
    
    // Check if already exists
    const exists = disputes.some(d => d.dispute_id === data.dispute_id);
    if (exists) {
      return new Response(JSON.stringify({ error: 'DISPUTE_ALREADY_INDEXED' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add to index
    disputes.push({
      cid: data.cid,
      dispute_id: data.dispute_id,
      claim_type: data.claim_type,
      created_at: data.created_at,
      expires_at: data.expires_at
    });

    await this.state.storage.put('open_disputes', disputes);
    
    // Mark cache as dirty
    await this.state.storage.put('cache_dirty', true);
    await this.state.storage.put('last_modified', new Date().toISOString());

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Remove dispute from index
   */
  async removeDispute(request) {
    const data = await request.json();
    
    if (!data.dispute_id) {
      return new Response(JSON.stringify({ error: 'DISPUTE_ID_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const disputes = await this.state.storage.get('open_disputes') || [];
    const filtered = disputes.filter(d => d.dispute_id !== data.dispute_id);

    if (filtered.length === disputes.length) {
      return new Response(JSON.stringify({ error: 'DISPUTE_NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await this.state.storage.put('open_disputes', filtered);
    
    // Mark cache as dirty
    await this.state.storage.put('cache_dirty', true);
    await this.state.storage.put('last_modified', new Date().toISOString());

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * List disputes with filtering and pagination
   */
  async listDisputes(url) {
    const disputes = await this.state.storage.get('open_disputes') || [];
    
    // Parse query parameters
    const claimType = url.searchParams.get('claim_type');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Filter by claim type if specified
    let filtered = disputes;
    if (claimType) {
      filtered = disputes.filter(d => d.claim_type === claimType);
    }

    // Sort by created_at descending (newest first)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Paginate
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    // Get cache info
    const lastModified = await this.state.storage.get('last_modified') || new Date().toISOString();
    const cacheDirty = await this.state.storage.get('cache_dirty') || false;

    return new Response(JSON.stringify({
      disputes: paginated,
      total,
      limit,
      offset,
      cache_info: {
        last_modified: lastModified,
        cache_dirty: cacheDirty
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Last-Modified': lastModified,
        'Cache-Control': 'public, max-age=300' // 5 minutes
      }
    });
  }

  /**
   * Get cache info
   */
  async getCacheInfo() {
    const lastModified = await this.state.storage.get('last_modified') || new Date().toISOString();
    const cacheDirty = await this.state.storage.get('cache_dirty') || false;
    const disputes = await this.state.storage.get('open_disputes') || [];

    return new Response(JSON.stringify({
      last_modified: lastModified,
      cache_dirty: cacheDirty,
      open_disputes_count: disputes.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
