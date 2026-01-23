/**
 * ExpirationIndex Durable Object
 * Global index that maps expiration dates to content hashes
 * Enables efficient batch processing of expired content
 * 
 * Single global instance with structure:
 * {
 *   "2026-01-23": ["hash1", "hash2", ...],
 *   "2026-01-24": ["hash3", "hash4", ...],
 *   ...
 * }
 */

export class ExpirationIndex {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Register content with expiration date
      if (url.pathname === '/register' && method === 'POST') {
        const data = await request.json();
        return await this.register(data);
      }

      // Unregister content (when deleted or extended)
      if (url.pathname === '/unregister' && method === 'POST') {
        const data = await request.json();
        return await this.unregister(data);
      }

      // Update expiration date (when retention is extended)
      if (url.pathname === '/update' && method === 'POST') {
        const data = await request.json();
        return await this.updateExpiration(data);
      }

      // Get expired content for a specific date
      if (url.pathname === '/expired' && method === 'GET') {
        const date = url.searchParams.get('date');
        return await this.getExpired(date);
      }

      // Get statistics
      if (url.pathname === '/stats' && method === 'GET') {
        return await this.getStats();
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
   * Extract date in YYYY-MM-DD format from ISO timestamp
   */
  extractDate(isoTimestamp) {
    return isoTimestamp.split('T')[0];
  }

  /**
   * Register content with expiration date
   */
  async register(data) {
    const { hash_256t, expires_at } = data;
    const expirationDate = this.extractDate(expires_at);

    // Get existing hashes for this date
    const hashes = await this.state.storage.get(expirationDate) || [];

    // Add hash if not already present (idempotency)
    if (!hashes.includes(hash_256t)) {
      hashes.push(hash_256t);
      await this.state.storage.put(expirationDate, hashes);
    }

    return new Response(
      JSON.stringify({ success: true, date: expirationDate }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Unregister content (when deleted or before extension)
   */
  async unregister(data) {
    const { hash_256t, expires_at } = data;
    const expirationDate = this.extractDate(expires_at);

    // Get existing hashes for this date
    const hashes = await this.state.storage.get(expirationDate) || [];

    // Remove hash
    const updatedHashes = hashes.filter(h => h !== hash_256t);

    if (updatedHashes.length === 0) {
      // Clean up empty date entries
      await this.state.storage.delete(expirationDate);
    } else {
      await this.state.storage.put(expirationDate, updatedHashes);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Update expiration date (when retention is extended)
   */
  async updateExpiration(data) {
    const { hash_256t, old_expires_at, new_expires_at } = data;
    const oldDate = this.extractDate(old_expires_at);
    const newDate = this.extractDate(new_expires_at);

    // If dates are the same, nothing to do
    if (oldDate === newDate) {
      return new Response(
        JSON.stringify({ success: true, unchanged: true }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Remove from old date
    await this.unregister({ hash_256t, expires_at: old_expires_at });

    // Add to new date
    await this.register({ hash_256t, expires_at: new_expires_at });

    return new Response(
      JSON.stringify({ success: true, old_date: oldDate, new_date: newDate }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get expired content for a specific date
   */
  async getExpired(date) {
    if (!date) {
      return new Response(
        JSON.stringify({ error: 'Date parameter required' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const hashes = await this.state.storage.get(date) || [];

    return new Response(
      JSON.stringify({
        date,
        hashes,
        count: hashes.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get statistics about the expiration index
   */
  async getStats() {
    const allKeys = await this.state.storage.list();
    const stats = {
      total_dates: allKeys.size,
      dates: []
    };

    for (const [date, hashes] of allKeys) {
      stats.dates.push({
        date,
        count: hashes.length
      });
    }

    // Sort by date
    stats.dates.sort((a, b) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}
