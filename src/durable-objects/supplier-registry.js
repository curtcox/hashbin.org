/**
 * SupplierRegistry Durable Object
 * Manages alternate supplier registrations and their CID mappings
 */

/**
 * Supplier Registry Durable Object
 * Stores supplier information, CID mappings, and statistics
 */
export class SupplierRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET /supplier - Get supplier details
      if (path === '/supplier' && request.method === 'GET') {
        return this.getSupplier();
      }

      // POST /supplier - Create or update supplier
      if (path === '/supplier' && request.method === 'POST') {
        const data = await request.json();
        return this.createOrUpdateSupplier(data);
      }

      // DELETE /supplier - Delete supplier
      if (path === '/supplier' && request.method === 'DELETE') {
        return this.deleteSupplier();
      }

      // GET /cids - Get list of CIDs for this supplier
      if (path === '/cids' && request.method === 'GET') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        return this.getCIDs(page, limit);
      }

      // POST /cids - Add CIDs (from scan)
      if (path === '/cids' && request.method === 'POST') {
        const data = await request.json();
        return this.addCIDs(data.cids);
      }

      // DELETE /cids - Clear all CIDs
      if (path === '/cids' && request.method === 'DELETE') {
        return this.clearCIDs();
      }

      // GET /stats - Get supplier statistics
      if (path === '/stats' && request.method === 'GET') {
        return this.getStats();
      }

      // POST /stats/record - Record request result
      if (path === '/stats/record' && request.method === 'POST') {
        const data = await request.json();
        return this.recordRequest(data);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
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
   * Get supplier details
   */
  async getSupplier() {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier) {
      return new Response(
        JSON.stringify({ error: 'Supplier not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(supplier), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Create or update supplier
   */
  async createOrUpdateSupplier(data) {
    const now = new Date().toISOString();
    const existingSupplier = await this.state.storage.get('supplier');

    const supplier = {
      supplier_id: data.supplier_id,
      owner_user_id: data.owner_user_id,
      name: data.name,
      supplier_type: data.supplier_type,
      base_url: data.base_url,
      single_cid: data.single_cid || null,
      discovered_cids: existingSupplier?.discovered_cids || [],
      created_at: existingSupplier?.created_at || now,
      last_scanned_at: data.last_scanned_at || existingSupplier?.last_scanned_at || null,
      scan_status: data.scan_status || existingSupplier?.scan_status || 'pending',
      scan_error: data.scan_error || null,
      cid_count: existingSupplier?.discovered_cids?.length || 0,
      is_active: data.is_active !== undefined ? data.is_active : (existingSupplier?.is_active ?? true),
      stats: existingSupplier?.stats || this.initializeStats(data.supplier_id)
    };

    await this.state.storage.put('supplier', supplier);

    return new Response(JSON.stringify(supplier), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Delete supplier
   */
  async deleteSupplier() {
    await this.state.storage.deleteAll();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get CIDs with pagination
   */
  async getCIDs(page = 1, limit = 50) {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier) {
      return new Response(
        JSON.stringify({ error: 'Supplier not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const cids = supplier.discovered_cids || [];
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedCids = cids.slice(start, end);

    return new Response(
      JSON.stringify({
        cids: paginatedCids,
        page,
        limit,
        total: cids.length,
        has_more: end < cids.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Add CIDs to supplier (from scan)
   */
  async addCIDs(newCids) {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier) {
      return new Response(
        JSON.stringify({ error: 'Supplier not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Merge with existing CIDs (avoid duplicates)
    const existingCids = new Set(supplier.discovered_cids || []);
    newCids.forEach(cid => existingCids.add(cid));
    
    supplier.discovered_cids = Array.from(existingCids);
    supplier.cid_count = supplier.discovered_cids.length;

    await this.state.storage.put('supplier', supplier);

    return new Response(
      JSON.stringify({
        success: true,
        cid_count: supplier.cid_count
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Clear all CIDs
   */
  async clearCIDs() {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier) {
      return new Response(
        JSON.stringify({ error: 'Supplier not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    supplier.discovered_cids = [];
    supplier.cid_count = 0;

    await this.state.storage.put('supplier', supplier);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get supplier statistics
   */
  async getStats() {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier || !supplier.stats) {
      return new Response(
        JSON.stringify({ error: 'Statistics not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(supplier.stats), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Record a request result (for statistics)
   */
  async recordRequest(data) {
    const supplier = await this.state.storage.get('supplier');
    
    if (!supplier) {
      return new Response(
        JSON.stringify({ error: 'Supplier not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const stats = supplier.stats || this.initializeStats(supplier.supplier_id);
    const success = data.success;
    const responseTimeMs = data.response_time_ms || null;
    const wasProxy = data.was_proxy || false;
    const verificationFailed = data.verification_failed || false;

    // Update totals
    stats.total_requests++;
    if (success) {
      stats.successful_requests++;
      stats.last_success_at = new Date().toISOString();
    } else {
      stats.failed_requests++;
      stats.last_failure_at = new Date().toISOString();
    }

    // Update verification failures
    if (verificationFailed) {
      stats.verification_failures++;
    }

    // Update rolling window (last 100 requests)
    if (!Array.isArray(stats.recent_results)) {
      stats.recent_results = [];
    }
    
    stats.recent_results.push(success);
    if (stats.recent_results.length > 100) {
      stats.recent_results.shift(); // Remove oldest
    }

    // Recalculate recent counts
    stats.recent_success_count = stats.recent_results.filter(r => r === true).length;
    stats.recent_failure_count = stats.recent_results.filter(r => r === false).length;

    // Update average response time (exponential moving average)
    if (responseTimeMs !== null && success) {
      if (stats.avg_response_time_ms === null || stats.avg_response_time_ms === 0) {
        stats.avg_response_time_ms = responseTimeMs;
      } else {
        // Use exponential moving average (alpha = 0.2)
        stats.avg_response_time_ms = stats.avg_response_time_ms * 0.8 + responseTimeMs * 0.2;
      }
    }

    // Update proxy counter
    if (wasProxy) {
      stats.requests_since_last_proxy = 0;
      stats.last_verified_at = new Date().toISOString();
    } else {
      stats.requests_since_last_proxy++;
    }

    supplier.stats = stats;
    await this.state.storage.put('supplier', supplier);

    return new Response(JSON.stringify({ success: true, stats }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Initialize statistics for a new supplier
   */
  initializeStats(supplierId) {
    return {
      supplier_id: supplierId,
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      recent_results: [],
      recent_success_count: 0,
      recent_failure_count: 0,
      avg_response_time_ms: null,
      last_success_at: null,
      last_failure_at: null,
      last_verified_at: null,
      verification_failures: 0,
      requests_since_last_proxy: 0
    };
  }
}
