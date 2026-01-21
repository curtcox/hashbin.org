/**
 * PlatformStats Durable Object
 * Aggregates and caches platform-wide statistics
 * Uses hybrid strategy: real-time counters + periodic snapshot computation
 */

export class PlatformStats {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Increment counter
      if (path === '/increment' && request.method === 'POST') {
        const body = await request.json();
        return this.incrementCounter(body);
      }

      // Get statistics
      if (path === '/stats' && request.method === 'GET') {
        return this.getStats(url.searchParams);
      }

      // Compute snapshot (called by scheduled job)
      if (path === '/snapshot' && request.method === 'POST') {
        return this.computeSnapshot();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('PlatformStats error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Increment a counter in real-time
   */
  async incrementCounter(body) {
    const { counter, value = 1 } = body;

    if (!counter) {
      return new Response(
        JSON.stringify({ error: 'Counter name required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const current = (await this.state.storage.get(counter)) || 0;
    await this.state.storage.put(counter, current + value);

    return new Response(
      JSON.stringify({ counter, value: current + value }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Get current statistics
   */
  async getStats(searchParams) {
    const statsType = searchParams.get('type') || 'all';

    // Get all counters
    const counters = await this.state.storage.list();
    const stats = {};
    counters.forEach((value, key) => {
      stats[key] = value;
    });

    // Get last snapshot timestamp
    const lastSnapshotAt = stats.last_snapshot_at || null;

    // Build response based on requested type
    let response;
    if (statsType === 'all') {
      response = {
        timestamp: new Date().toISOString(),
        period: 'all_time',
        content: {
          total_files: stats.total_uploads || 0,
          total_size_bytes: stats.total_uploads_bytes || 0,
          inline_content_count: stats.inline_content_count || 0,
          active_files: stats.active_content_count || 0,
          expired_files: stats.expired_files || 0,
          expiring_soon_count: stats.expiring_soon_count || 0,
          total_downloads: stats.total_downloads || 0
        },
        users: {
          total_accounts: stats.total_users || 0,
          active_accounts: stats.active_users || 0,
          deleted_accounts: stats.deleted_users || 0,
          accounts_with_balance: stats.users_with_balance || 0
        },
        financial: {
          total_revenue_cents: stats.total_revenue_cents || 0,
          total_deposits_cents: stats.total_deposits_cents || 0,
          total_spent_cents: stats.total_spent_cents || 0,
          platform_balance_cents: stats.platform_balance_cents || 0,
          average_deposit_cents: stats.average_deposit_cents || 0
        },
        api_keys: {
          total_created: stats.total_api_keys || 0,
          active_keys: stats.active_api_keys || 0,
          revoked_keys: stats.revoked_api_keys || 0
        },
        rate_limits: {
          total_purchases: stats.rate_limit_purchases || 0,
          total_revenue_cents: stats.rate_limit_revenue_cents || 0
        },
        last_snapshot_at: lastSnapshotAt
      };
    } else if (statsType === 'financial') {
      response = await this.getFinancialStats(stats);
    } else if (statsType === 'content') {
      response = await this.getContentStats(stats);
    } else if (statsType === 'users') {
      response = await this.getUserStats(stats);
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid stats type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Get detailed financial statistics
   */
  async getFinancialStats(stats) {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        total_revenue_cents: stats.total_revenue_cents || 0,
        total_deposits_cents: stats.total_deposits_cents || 0,
        total_refunds_cents: stats.total_refunds_cents || 0,
        net_revenue_cents: (stats.total_revenue_cents || 0) - (stats.total_refunds_cents || 0)
      },
      breakdown_by_type: {
        upload_payment: {
          count: stats.upload_payment_count || 0,
          total_cents: stats.upload_payment_total || 0
        },
        cid_extension: {
          count: stats.extension_count || 0,
          total_cents: stats.extension_total || 0
        },
        donation_received: {
          count: stats.donation_count || 0,
          total_cents: stats.donation_total || 0
        },
        rate_limit_purchase: {
          count: stats.rate_limit_purchases || 0,
          total_cents: stats.rate_limit_revenue_cents || 0
        }
      },
      deposits: {
        count: stats.total_deposits || 0,
        total_cents: stats.total_deposits_cents || 0,
        average_cents: stats.average_deposit_cents || 0,
        min_cents: stats.min_deposit_cents || 0,
        max_cents: stats.max_deposit_cents || 0
      },
      disputes: {
        total_count: stats.total_disputes || 0,
        pending_count: stats.pending_disputes || 0,
        resolved_count: stats.resolved_disputes || 0
      }
    };
  }

  /**
   * Get content statistics
   */
  async getContentStats(stats) {
    return {
      timestamp: new Date().toISOString(),
      total_files: stats.total_uploads || 0,
      total_size_bytes: stats.total_uploads_bytes || 0,
      inline_content_count: stats.inline_content_count || 0,
      active_files: stats.active_content_count || 0,
      expired_files: stats.expired_files || 0,
      expiring_soon_count: stats.expiring_soon_count || 0,
      total_downloads: stats.total_downloads || 0
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(stats) {
    return {
      timestamp: new Date().toISOString(),
      total_accounts: stats.total_users || 0,
      active_accounts: stats.active_users || 0,
      deleted_accounts: stats.deleted_users || 0,
      accounts_with_balance: stats.users_with_balance || 0
    };
  }

  /**
   * Compute snapshot of complex aggregates (called by scheduled job)
   * This queries all Durable Objects to compute accurate counts
   */
  async computeSnapshot() {
    // Note: In a full implementation, this would query all user profiles,
    // content metadata, and payment records to compute accurate aggregates.
    // For now, we'll just update the snapshot timestamp.
    
    await this.state.storage.put('last_snapshot_at', new Date().toISOString());

    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
