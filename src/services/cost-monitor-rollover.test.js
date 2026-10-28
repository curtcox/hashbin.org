import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectMonthUsage, runCostMonitor } from './cost-monitor.js';
import { InfrastructureCost } from '../durable-objects/infrastructure-cost.js';
import { PlatformStats } from '../durable-objects/platform-stats.js';

function state() {
  const rows = new Map(); let queue = Promise.resolve();
  const storage = { get: async key => structuredClone(rows.get(key)),
    put: async (key, value) => rows.set(key, structuredClone(value)),
    list: async ({ prefix = '', end, limit, reverse } = {}) => {
      const entries = [...rows].filter(([key]) => key.startsWith(prefix) && (!end || key < end)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      if (reverse) entries.reverse(); return new Map(limit ? entries.slice(0, limit) : entries);
    },
    delete: async keys => { for (const key of keys) rows.delete(key); }, transaction: async operation => operation(storage) };
  return { storage, rows, blockConcurrencyWhile(operation) { const next = queue.then(operation); queue = next.catch(() => {}); return next; } };
}
const binding = object => ({ idFromName: name => name, get: () => object });
const post = (path, body) => new Request(`https://internal${path}`, { method: 'POST', body: JSON.stringify(body) });
const schema = { workers: { fields: ['requests', 'cpuTimeUs'].map(name => ({ name })) },
  periodic: { fields: ['duration', 'rowsRead', 'rowsWritten'].map(name => ({ name })) }, storage: { fields: [{ name: 'storedBytes' }] } };
const account = requests => ({ workers: [{ sum: { requests, cpuTimeUs: 0 } }], operations: [], r2: [], invocations: [], periodic: [], storage: [] });
afterEach(() => vi.unstubAllGlobals());

async function fixture(options = {}) {
  const backing = state(), costs = new InfrastructureCost(backing, {}), stats = new PlatformStats(state(), {});
  const alerts = [], windows = [], revenuePeriods = [];
  const flags = { requests: 2e8, ...options };
  for (const [sequence, period, revenue_cents] of [[1, '2026-10', 2], [2, '2026-10', -1], [3, '2026-11', 0.5]]) {
    await stats.fetch(post('/download-revenue', { id: `event-${sequence}`, user_id: 'user', sequence, period, revenue_cents }));
  }
  const env = { CLOUDFLARE_ANALYTICS_TOKEN: 'test-read-only', CLOUDFLARE_ACCOUNT_ID: 'test-account',
    INFRASTRUCTURE_COST: binding({ fetch: async request => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/snapshot' && flags.fail === 'snapshot' && (await request.clone().json()).period === '2026-10') return new Response('', { status: 503 });
      return costs.fetch(request);
    } }),
    PLATFORM_STATS: binding({ fetch: async request => {
      const period = new URL(request.url).searchParams.get('period'); revenuePeriods.push(period);
      return flags.fail === 'all_revenue' || (flags.fail === 'revenue' && period === '2026-10') ? new Response('', { status: 503 }) : stats.fetch(request);
    } }),
    ALERT_STORE: binding({ fetch: async request => { alerts.push(await request.json()); return Response.json({}); } }) };
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.endsWith('/analytics_engine/sql')) {
      if (init.body.includes("AND blob4 = 'funded'")) return Response.json({ data: [{ downloads: null, price_dollars: null, lease_cost_dollars: null }] });
      const closed = init.body.includes("timestamp < toDateTime('2026-11-01 00:00:00')");
      if (closed && flags.fail === 'attribution') return new Response('', { status: 503 });
      return Response.json({ data: [{ cid: closed ? 'tail-burst' : 'live-file', downloads: 2e8, status: '200', payer: 'funded' }] });
    }
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('__type')) return Response.json({ data: schema });
    windows.push(variables);
    if (variables.start.startsWith('2026-10') && flags.fail === 'analytics') return new Response('', { status: 503 });
    if (variables.start.startsWith('2026-11') && flags.fail === 'current_analytics') return new Response('', { status: 503 });
    const requests = variables.start.startsWith('2026-10-31') ? flags.requests : variables.start.startsWith('2026-11') ? (flags.currentRequests || 0) : 0;
    return Response.json({ data: { viewer: { accounts: [account(requests)] } } });
  });
  return { env, costs, stats, alerts, windows, backing, revenuePeriods, flags };
}

const get = (object, path) => object.fetch(new Request(`https://internal${path}`)).then(response => response.json());

describe('month boundary cost monitoring', () => {
  it.each([
    ['2026-02-01T00:00:00Z', '2026-01', 31], ['2026-03-01T00:00:00Z', '2026-02', 28],
    ['2028-03-01T00:00:00Z', '2028-02', 29], ['2027-01-01T00:00:00Z', '2026-12', 31]
  ])('collects every completed-month window through the exact boundary (%s)', async (time, period, days) => {
    const windows = [];
    vi.stubGlobal('fetch', async (_, init) => {
      const { query, variables } = JSON.parse(init.body);
      if (query.includes('__type')) return Response.json({ data: schema });
      windows.push(variables);
      return Response.json({ data: { viewer: { accounts: [{ ...account(0), r2: [{ max: { payloadSize: 1e9, metadataSize: 0 } }] }] } } });
    });
    const costs = await collectMonthUsage({ CLOUDFLARE_ANALYTICS_TOKEN: 'test', CLOUDFLARE_ACCOUNT_ID: 'account' }, new Date(time), period);
    expect(windows).toHaveLength(days);
    expect(windows[0].start).toBe(`${period}-01T00:00:00.000Z`);
    expect(windows.at(-1).end).toBe(new Date(time).toISOString());
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
    expect(costs.r2_storage).toBeCloseTo(1.5);
  });

  it('catches the last-hour burst using the original month net funded revenue, without corrupting the new month', async () => {
    const f = await fixture();
    for (const [hour, amount] of [['22', 1], ['23', 2]]) await f.costs.fetch(post('/snapshot', {
      recorded_at: `2026-10-31T${hour}:00:00Z`, costs: { workers: amount, r2_operations: 0, r2_storage: 0, durable_objects: 0 }, revenue_cents: 0
    }));
    const report = await runCostMonitor(f.env, new Date('2026-11-01T00:00:00Z'));
    expect(report.period).toBe('2026-11'); expect(report.costs_cents).toBe(0); expect(report.revenue_cents).toBe(0.5);
    expect(report.brake).toBe(true);
    const previous = (await get(f.costs, '/snapshot?period=2026-10')).snapshot;
    expect(previous.costs_cents).toBe(6000); expect(previous.hourly_cost_cents).toBe(5998);
    expect(previous.usage.worker_requests).toBe(2e8);
    expect(previous.usage_units.worker_requests).toBe('requests');
    expect(previous.revenue_cents).toBe(1); expect(previous.revenue_kept_cents).toBe(0.92);
    expect(previous.usage_end).toBe('2026-11-01T00:00:00.000Z');
    expect(f.alerts.find(alert => alert.type === 'closed_month_cost_brake').message).toContain('tail-burst');
    expect(f.alerts.some(alert => alert.type === 'closed_month_hourly_cost_spike')).toBe(true);
    expect((await get(f.costs, '/safety')).period).toBe('2026-11');
    await runCostMonitor(f.env, new Date('2026-11-01T00:00:00Z'));
    expect((await get(f.costs, '/summary')).costs.total).toBe(6000);
    f.flags.requests = 2.1e8;
    await f.stats.fetch(post('/download-revenue', { id: 'late-return', user_id: 'user', sequence: 4, period: '2026-10', revenue_cents: -0.5 }));
    await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
    expect((await get(f.costs, '/summary')).costs.total).toBe(6300);
    expect((await get(f.costs, '/snapshot?period=2026-10')).snapshot.revenue_cents).toBe(0.5);
  });

  it.each(['analytics', 'snapshot'])('continues the current monitor when completed-month %s fails', async fail => {
    const f = await fixture({ fail });
    const report = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
    expect(report.period).toBe('2026-11'); expect(report.error).toBeUndefined();
    expect(f.alerts.some(alert => alert.type === 'closed_month_cost_monitor_unavailable')).toBe(true);
    expect((await get(f.costs, '/snapshot?period=2026-10')).snapshot).toBeNull();
  });

  it('retains completed-month brake checks during a historical attribution outage', async () => {
    const f = await fixture({ fail: 'attribution' });
    const report = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
    expect(report.brake).toBe(true); expect(report.top_files[0].cid).toBe('live-file');
    expect(f.alerts.some(alert => alert.type === 'closed_month_download_analytics_unavailable')).toBe(true);
    expect(f.alerts.some(alert => alert.type === 'closed_month_cost_brake')).toBe(true);
  });

  it('uses separate alert types for completed and current months in the same run', async () => {
    const f = await fixture({ currentRequests: 1e6 });
    await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
    const types = f.alerts.map(alert => alert.type);
    expect(types).toContain('closed_month_cost_brake'); expect(types).toContain('cost_brake');
  });

  it('recovers a known incomplete month after the two-day correction window', async () => {
    const f = await fixture();
    await f.costs.fetch(post('/snapshot', { recorded_at: '2026-10-31T23:00:00Z',
      costs: { workers: 2, r2_operations: 0, r2_storage: 0, durable_objects: 0 }, revenue_cents: 0 }));
    expect((await runCostMonitor(f.env, new Date('2026-11-05T01:00:00Z'))).period).toBe('2026-11');
    expect((await get(f.costs, '/snapshot?period=2026-10')).snapshot.closed_month).toBe(true);
    f.windows.length = 0;
    await runCostMonitor(f.env, new Date('2026-11-05T02:00:00Z'));
    expect(f.windows.every(window => window.start.startsWith('2026-11'))).toBe(true);
  });

  it('does not invent previous history when first enabled after the correction window', async () => {
    const f = await fixture();
    await runCostMonitor(f.env, new Date('2026-11-05T01:00:00Z'));
    expect(f.windows.every(window => window.start.startsWith('2026-11'))).toBe(true);
    expect(f.revenuePeriods).toEqual(['2026-11']);
  });
});

it('updates original-month revenue for a funding outbox recovered after the cost correction window', async () => {
  const f = await fixture();
  await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
  await f.stats.fetch(post('/download-revenue', { id: 'delayed-return', user_id: 'user', sequence: 4, period: '2026-10', revenue_cents: -0.5 }));
  f.windows.length = 0;
  const report = await runCostMonitor(f.env, new Date('2026-11-05T01:00:00Z'));
  expect(f.windows.every(window => window.start.startsWith('2026-11'))).toBe(true);
  const previous = (await get(f.costs, '/snapshot?period=2026-10')).snapshot;
  expect(previous.revenue_cents).toBe(0.5);
  expect(previous.recorded_at).toBe('2026-11-05T01:00:00.000Z');
  expect(previous.costs_cents).toBe(6000);
  expect(report.revenue_cents).toBe(0.5);
  expect((await get(f.costs, '/summary')).costs.total).toBe(6000);
});

it('still saves current monitoring when delivery of completed-month alerts fails', async () => {
  const f = await fixture();
  f.env.ALERT_STORE = binding({ fetch: async request => {
    const alert = await request.json();
    return alert.type.startsWith('closed_month_') ? new Response('', { status: 503 }) : Response.json({});
  } });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let report;
  try { report = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z')); }
  finally { log.mockRestore(); }
  expect(report.period).toBe('2026-11'); expect(report.brake).toBe(true);
  expect((await get(f.costs, '/safety')).period).toBe('2026-11');
});

it('does not make failed live monitoring appear fresh when the completed-month refresh succeeds', async () => {
  const f = await fixture({ fail: 'current_analytics' });
  await f.costs.fetch(post('/snapshot', { recorded_at: '2026-11-01T00:00:00Z',
    costs: { workers: 0, r2_operations: 0, r2_storage: 0, durable_objects: 0 }, revenue_cents: 0 }));
  const report = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
  expect(report.error).toContain('503');
  const live = await get(f.costs, '/safety');
  expect(live.recorded_at).toBe('2026-11-01T00:00:00.000Z');
  expect(live.brake).toBe(true);
  expect((await get(f.costs, '/snapshot?period=2026-10')).snapshot.closed_month).toBe(true);
  expect(f.alerts.some(alert => alert.type === 'cost_monitor_unavailable')).toBe(true);
});

it('keeps both cost projections and brakes active when the revenue service is down', async () => {
  const f = await fixture({ fail: 'all_revenue', currentRequests: 1e8 });
  const report = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
  expect(report.costs_cents).toBe(3000); expect(report.brake).toBe(true);
  expect(report.revenue_cents).toBeNull(); expect(report.revenue_kept_cents).toBeNull();
  expect(report.revenue_known).toBe(false); expect(report.revenue_error).toContain('Revenue');
  expect(f.alerts.some(alert => alert.type === 'cost_revenue_unavailable' && alert.severity === 'critical')).toBe(true);
  expect(f.alerts.some(alert => alert.type === 'cost_brake')).toBe(true);
  expect(f.alerts.some(alert => alert.type === 'cost_exceeds_revenue')).toBe(false);
  const previous = (await get(f.costs, '/snapshot?period=2026-10')).snapshot;
  expect(previous.costs_cents).toBe(6000); expect(previous.revenue_known).toBe(false);
  f.flags.fail = null;
  const recovered = await runCostMonitor(f.env, new Date('2026-11-01T02:00:00Z'));
  expect(recovered.revenue_cents).toBe(0.5); expect(recovered.revenue_known).toBe(true);
  expect(recovered.revenue_error).toBeNull();
});

it('persists a completed-month cost report even when only its revenue lookup fails', async () => {
  const f = await fixture({ fail: 'revenue' });
  const current = await runCostMonitor(f.env, new Date('2026-11-01T01:00:00Z'));
  expect(current.revenue_known).toBe(true);
  const previous = (await get(f.costs, '/snapshot?period=2026-10')).snapshot;
  expect(previous.costs_cents).toBe(6000); expect(previous.revenue_known).toBe(false);
  expect(f.alerts.some(alert => alert.type === 'closed_month_cost_revenue_unavailable')).toBe(true);
});
