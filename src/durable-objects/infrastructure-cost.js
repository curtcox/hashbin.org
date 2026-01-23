/**
 * InfrastructureCost Durable Object
 * Tracks platform-wide infrastructure costs
 * Single instance stores aggregate costs for all services
 */
export class InfrastructureCost {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Record costs
      if (url.pathname === '/record' && method === 'POST') {
        const data = await request.json();
        return await this.recordCost(data);
      }

      // Get cost summary
      if (url.pathname === '/summary' && method === 'GET') {
        const period = url.searchParams.get('period') || 'all_time';
        return await this.getCostSummary(period);
      }

      // Get detailed costs by service
      if (url.pathname === '/by-service' && method === 'GET') {
        const period = url.searchParams.get('period') || 'all_time';
        return await this.getCostsByService(period);
      }

      // Get monthly breakdown
      if (url.pathname === '/monthly' && method === 'GET') {
        const months = parseInt(url.searchParams.get('months') || '12');
        return await this.getMonthlyBreakdown(months);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('InfrastructureCost error:', error);
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
   * Record infrastructure cost
   * @param {object} data - Cost data
   * @param {string} data.service - Service name (workers|r2_storage|r2_bandwidth|durable_objects|stripe)
   * @param {number} data.cost_cents - Cost in cents
   * @param {string} data.period - Time period (ISO date string for month, e.g., "2024-01")
   * @param {object} data.metadata - Optional metadata (e.g., transaction_id, bytes, requests)
   */
  async recordCost(data) {
    const { service, cost_cents, period, metadata = {} } = data;

    // Validate inputs
    if (!service) {
      return new Response(
        JSON.stringify({ error: 'service is required' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    if (cost_cents === undefined || cost_cents < 0) {
      return new Response(
        JSON.stringify({ error: 'cost_cents must be non-negative' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const validServices = ['workers', 'r2_storage', 'r2_bandwidth', 'durable_objects', 'stripe'];
    if (!validServices.includes(service)) {
      return new Response(
        JSON.stringify({ 
          error: 'invalid service',
          valid_services: validServices
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Use current month if period not specified
    const costPeriod = period || new Date().toISOString().substring(0, 7); // YYYY-MM

    // Create cost record
    const costRecord = {
      id: crypto.randomUUID(),
      service,
      cost_cents,
      period: costPeriod,
      metadata,
      recorded_at: new Date().toISOString()
    };

    // Store individual cost record
    await this.state.storage.put(`cost:${costRecord.id}`, costRecord);

    // Update aggregates
    await this.updateAggregates(service, cost_cents, costPeriod);

    return new Response(
      JSON.stringify(costRecord),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Update aggregate cost counters
   */
  async updateAggregates(service, cost_cents, period) {
    // Update all-time totals
    const totalKey = `total:${service}`;
    const currentTotal = (await this.state.storage.get(totalKey)) || 0;
    await this.state.storage.put(totalKey, currentTotal + cost_cents);

    // Update all services total
    const allServicesTotal = (await this.state.storage.get('total:all_services')) || 0;
    await this.state.storage.put('total:all_services', allServicesTotal + cost_cents);

    // Update period-specific totals
    const periodKey = `period:${period}:${service}`;
    const currentPeriodTotal = (await this.state.storage.get(periodKey)) || 0;
    await this.state.storage.put(periodKey, currentPeriodTotal + cost_cents);

    // Update period all services total
    const periodAllKey = `period:${period}:all_services`;
    const currentPeriodAll = (await this.state.storage.get(periodAllKey)) || 0;
    await this.state.storage.put(periodAllKey, currentPeriodAll + cost_cents);

    // Track periods we have data for
    const periods = (await this.state.storage.get('periods')) || [];
    if (!periods.includes(period)) {
      periods.push(period);
      periods.sort();
      await this.state.storage.put('periods', periods);
    }
  }

  /**
   * Get cost summary
   */
  async getCostSummary(period) {
    let costs = {};

    if (period === 'all_time') {
      // Get all-time totals
      costs = {
        workers: (await this.state.storage.get('total:workers')) || 0,
        r2_storage: (await this.state.storage.get('total:r2_storage')) || 0,
        r2_bandwidth: (await this.state.storage.get('total:r2_bandwidth')) || 0,
        durable_objects: (await this.state.storage.get('total:durable_objects')) || 0,
        stripe: (await this.state.storage.get('total:stripe')) || 0,
        total: (await this.state.storage.get('total:all_services')) || 0
      };
    } else {
      // Get period-specific totals
      costs = {
        workers: (await this.state.storage.get(`period:${period}:workers`)) || 0,
        r2_storage: (await this.state.storage.get(`period:${period}:r2_storage`)) || 0,
        r2_bandwidth: (await this.state.storage.get(`period:${period}:r2_bandwidth`)) || 0,
        durable_objects: (await this.state.storage.get(`period:${period}:durable_objects`)) || 0,
        stripe: (await this.state.storage.get(`period:${period}:stripe`)) || 0,
        total: (await this.state.storage.get(`period:${period}:all_services`)) || 0
      };
    }

    return new Response(
      JSON.stringify({
        period,
        costs,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get costs by service with breakdown
   */
  async getCostsByService(period) {
    const summary = await this.getCostSummary(period);
    const summaryData = await summary.json();

    // Calculate percentages
    const total = summaryData.costs.total;
    const breakdown = Object.entries(summaryData.costs)
      .filter(([key]) => key !== 'total')
      .map(([service, cost]) => ({
        service,
        cost_cents: cost,
        cost_dollars: cost / 100,
        percentage: total > 0 ? (cost / total) * 100 : 0
      }))
      .sort((a, b) => b.cost_cents - a.cost_cents);

    return new Response(
      JSON.stringify({
        period,
        total_cents: total,
        total_dollars: total / 100,
        breakdown,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get monthly breakdown of costs
   */
  async getMonthlyBreakdown(months) {
    const periods = (await this.state.storage.get('periods')) || [];
    const recentPeriods = periods.slice(-months);

    const breakdown = await Promise.all(
      recentPeriods.map(async (period) => {
        const summary = await this.getCostSummary(period);
        const data = await summary.json();
        return {
          period,
          costs: data.costs
        };
      })
    );

    return new Response(
      JSON.stringify({
        months: breakdown.length,
        breakdown,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
