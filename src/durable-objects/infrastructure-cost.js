/**
 * InfrastructureCost Durable Object
 * Tracks platform-wide infrastructure costs
 * Single instance stores aggregate costs for all services
 */

import { handleBackupRequest } from '../utils/backup.js';
import { COST_POLICY as P } from '../utils/cost-policy.js';
import { costPeriodBounds } from '../utils/cost-period.js';
import { COST_USAGE_UNITS, validCostUsage } from '../utils/cost-measurements.js';

/**
 * Get current month period string in YYYY-MM format
 * @returns {string} Current month period (e.g., "2026-01")
 */
function getCurrentMonthPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function trailingHourlyAverage(history, period, through) {
  let total = 0, hours = 0;
  for (const entry of history) {
    if (entry.period !== period || entry.hourly_cost_cents === null) continue;
    const end = Date.parse(entry.usage_end || entry.recorded_at);
    // Legacy history was produced hourly and did not retain interval bounds.
    const start = entry.usage_start ? Date.parse(entry.usage_start) : end - 3600000;
    const overlap = Math.max(0, Math.min(end, through) - Math.max(start, through - 86400000)) / 3600000;
    if (Number.isFinite(overlap)) { total += entry.hourly_cost_cents * overlap; hours += overlap; }
  }
  return hours ? total / hours : null;
}


export class InfrastructureCost {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/snapshot' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.recordSnapshot(data));
      }
      if (url.pathname === '/snapshot' && method === 'GET') {
        const period = url.searchParams.get('period');
        try { costPeriodBounds(period); }
        catch { return Response.json({ error: 'Invalid cost period' }, { status: 400 }); }
        return Response.json({ snapshot: (await this.state.storage.get(`snapshot:${period}`)) || null });
      }
      if (url.pathname === '/safety' && method === 'GET') {
        const latest = await this.state.storage.get('safety:latest');
        const run = await this.state.storage.get(`run:snapshot:${getCurrentMonthPeriod()}`);
        return Response.json({ ...latest, brake: this.env.COST_SAFETY_ALLOWANCE_ONLY === 'true' || Boolean(await this.state.storage.get('safety:brake')),
          run: run || null,
          run_brake: this.env.ENVIRONMENT !== 'local' && Boolean(this.env.RUN_DOMAIN) &&
            (!run || run.brake || Date.now() - Date.parse(run.recorded_at) > 2 * 3600000),
          manual_brake: this.env.COST_SAFETY_ALLOWANCE_ONLY === 'true',
          hard_stop: this.env.COST_SAFETY_HARD_STOP === 'true',
          stale: !latest || Date.now() - new Date(latest.recorded_at).getTime() > 2 * 3600000 });
      }
      if (url.pathname === '/run/snapshot' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(async () => {
          const at = Date.parse(data.recorded_at);
          if (!Number.isFinite(at) || at > Date.now() + 60000 || !Number.isFinite(data.cost_cents) || data.cost_cents < 0 || !Number.isSafeInteger(data.requests) || data.requests < 0) return Response.json({ error: 'Invalid run snapshot' }, { status: 400 });
          const period = new Date(at).toISOString().slice(0, 7);
          const key = `run:snapshot:${period}`;
          const old = await this.state.storage.get(key);
          if (old && Date.parse(old.recorded_at) >= at) return Response.json(old);
          const cost = Math.max(data.cost_cents, old?.cost_cents || 0);
          const report = { ...data, period, cost_cents: cost, requests: Math.max(data.requests, old?.requests || 0), brake: cost >= P.runOriginMonthlyCapCents || old?.brake === true };
          await this.state.storage.put(key, report);
          return Response.json(report);
        });
      }
      if (url.pathname === '/history' && method === 'GET') {
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 168));
        const before = url.searchParams.get('before');
        const rows = await this.state.storage.list({ prefix: 'analytics:', reverse: true, limit,
          ...(before ? { end: `analytics:${before}` } : {}) });
        return Response.json({ snapshots: [...rows.values()], next_before: rows.size === limit ? [...rows.keys()].at(-1).slice(10) : null });
      }
      if (url.pathname === '/safety' && method === 'POST') {
        const { brake } = await request.json();
        if (typeof brake !== 'boolean') return Response.json({ error: 'brake must be boolean' }, { status: 400 });
        await this.state.storage.put('safety:brake', brake);
        return Response.json({ brake });
      }
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

  async recordSnapshot(data) {
    const at = new Date(data.recorded_at);
    const services = ['workers', 'r2_operations', 'r2_storage', 'durable_objects'];
    const revenueKnown = Number.isFinite(data.revenue_cents) && data.revenue_cents >= 0;
    const revenueUnavailable = data.revenue_cents === null && typeof data.revenue_error === 'string' &&
      data.revenue_error.length > 0 && data.revenue_error.length <= 500;
    if (!Number.isFinite(at.getTime()) || (!revenueKnown && !revenueUnavailable) ||
      (data.usage !== undefined && data.usage !== null && !validCostUsage(data.usage)) ||
      services.some(key => !Number.isFinite(data.costs?.[key]) || data.costs[key] < 0)) {
      return Response.json({ error: 'Invalid cost snapshot' }, { status: 400 });
    }
    const currentPeriod = at.toISOString().slice(0, 7);
    const period = data.period ?? currentPeriod;
    let bounds;
    try { bounds = costPeriodBounds(period); }
    catch { return Response.json({ error: 'Invalid cost period' }, { status: 400 }); }
    const { start, end } = bounds;
    const closedMonth = period < currentPeriod;
    const usageEnd = new Date(data.usage_end ?? at);
    if (period > currentPeriod || !Number.isFinite(usageEnd.getTime()) || usageEnd < start || usageEnd > end || usageEnd > at ||
      (closedMonth && usageEnd.getTime() !== end.getTime()) || (!closedMonth && usageEnd.getTime() !== at.getTime())) {
      return Response.json({ error: 'Invalid cost usage window' }, { status: 400 });
    }
    const previous = await this.state.storage.get(`snapshot:${period}`);
    if (previous && new Date(previous.recorded_at) >= at) return Response.json(previous);
    const elapsed = Math.max(1, usageEnd - start);
    const costs = Object.fromEntries(services.map(key => [key, data.costs[key]]));
    const total = Object.values(costs).reduce((a, b) => a + b, 0);
    const projected = total / elapsed * (end - start);
    const alertThreshold = Number(this.env.COST_SAFETY_ALERT_CENTS || P.projectionAlertCents);
    const brakeThreshold = Number(this.env.COST_SAFETY_BRAKE_CENTS || P.projectionBrakeCents);
    if (!Number.isFinite(alertThreshold) || alertThreshold <= 0 || !Number.isFinite(brakeThreshold) || brakeThreshold < alertThreshold) {
      return Response.json({ error: 'Invalid cost safety thresholds' }, { status: 400 });
    }
    const alerts = [];
    if (!revenueKnown) alerts.push({ type: 'cost_revenue_unavailable', message: 'Revenue is unavailable; cost projection and brake checks remain active' });
    if (revenueKnown && total > data.revenue_cents * P.revenueKept + P.fixedMonthlyCents) {
      alerts.push({ type: 'cost_exceeds_revenue', message: 'Month-to-date costs exceed kept revenue plus the fixed budget' });
    }
    if (projected > alertThreshold) alerts.push({ type: 'cost_projection', message: `Projected monthly costs $${(projected / 100).toFixed(2)} exceed the alert threshold` });
    const history = (await this.state.storage.get('safety:history')) || [];
    let hourlyCost = null;
    if (previous) {
      const hours = (usageEnd - new Date(previous.usage_end || previous.recorded_at)) / 3600000;
      if (hours > 0) hourlyCost = Math.max(0, total - previous.costs_cents) / hours;
    }
    const average = trailingHourlyAverage(history, period, usageEnd.getTime());
    if (hourlyCost > 0 && average !== null && hourlyCost > average * 10) alerts.push({ type: 'hourly_cost_spike', message: 'Hourly costs exceed ten times the trailing daily average' });
    let brake = Boolean(await this.state.storage.get('safety:brake'));
    if (projected > brakeThreshold) {
      brake = true;
      alerts.push({ type: 'cost_brake', message: 'Automatic brake enabled; only included download allowances may be served' });
    }
    const report = { period, recorded_at: at.toISOString(), usage_end: usageEnd.toISOString(), closed_month: closedMonth,
      costs, costs_cents: total,
      usage: data.usage || null, usage_units: data.usage ? COST_USAGE_UNITS : null,
      revenue_cents: revenueKnown ? data.revenue_cents : null, revenue_kept_cents: revenueKnown ? data.revenue_cents * P.revenueKept : null,
      revenue_known: revenueKnown, revenue_error: revenueKnown ? null : data.revenue_error,
      projected_cents: projected, hourly_cost_cents: hourlyCost, trailing_hourly_average_cents: average,
      top_files: data.top_files || [], top_files_error: data.top_files_error || null,
      brake, alerts, source: 'cloudflare_analytics', conservative: true };
    // Cumulative MTD snapshots replace the previous value, never add it twice.
    // The storage transaction also prevents partial aggregate updates on retries.
    await this.state.storage.transaction(async storage => {
      for (const service of services) {
        const delta = costs[service] - (previous?.costs?.[service] || 0);
        for (const key of [`total:${service}`, 'total:all_services', `period:${period}:${service}`, `period:${period}:all_services`]) {
          await storage.put(key, ((await storage.get(key)) || 0) + delta);
        }
      }
      const periods = (await storage.get('periods')) || [];
      if (!periods.includes(period)) await storage.put('periods', [...periods, period].sort());
      await storage.put(`snapshot:${period}`, report);
      await storage.put('safety:brake', brake);
      if (!closedMonth) {
        await storage.put('safety:latest', report);
        await storage.put('safety:history', [...history, { period, recorded_at: report.recorded_at,
          usage_start: previous?.usage_end || previous?.recorded_at || null, usage_end: report.usage_end,
          hourly_cost_cents: hourlyCost }].slice(-48));
      }
      await storage.put(`analytics:${report.recorded_at.slice(0, 13)}${closedMonth ? `:${period}` : ''}`, report);
      const cutoff = new Date(at.getTime() - 93 * 86400000).toISOString().slice(0, 13);
      const expired = await storage.list({ prefix: 'analytics:', end: `analytics:${cutoff}`, limit: 48 });
      if (expired.size) await storage.delete([...expired.keys()]);
    });
    return Response.json(report);
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

    const validServices = ['workers', 'r2_operations', 'r2_storage', 'r2_bandwidth', 'durable_objects', 'stripe'];
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
    // Format: YYYY-MM (e.g., "2026-01")
    const costPeriod = period || getCurrentMonthPeriod();

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
        r2_operations: (await this.state.storage.get('total:r2_operations')) || 0,
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
        r2_operations: (await this.state.storage.get(`period:${period}:r2_operations`)) || 0,
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
