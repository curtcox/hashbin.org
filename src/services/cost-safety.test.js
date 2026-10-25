import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentMetadata } from '../durable-objects/content-metadata.js';
import { InfrastructureCost } from '../durable-objects/infrastructure-cost.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { COST_POLICY as P, DOWNLOAD_COST_DOLLARS, downloadAllowance, grossUp } from '../utils/cost-policy.js';
import { calculateRetentionCost } from '../utils/pricing.js';
import { priceUsage, runCostMonitor } from './cost-monitor.js';
import { calculateRateLimitPrice } from '../utils/rate-limit-pricing.js';
import { calculateRateLimitPrice as previewPrice } from '../../frontend/js/rate-limit-utils.js';

function state(initial = {}) {
  const map = new Map(Object.entries(structuredClone(initial)));
  let pending = Promise.resolve();
  const storage = { get: async key => structuredClone(map.get(key)),
    put: async (key, value) => map.set(key, structuredClone(value)),
    delete: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key); },
    list: async (options = {}) => new Map([...map].filter(([key]) => (!options.prefix || key.startsWith(options.prefix)) && (!options.end || key < options.end))),
    transaction: async fn => fn(storage) };
  return { storage, blockConcurrencyWhile(fn) {
    const next = pending.then(fn); pending = next.catch(() => {}); return next;
  } };
}
const binding = object => ({ idFromName: name => name, get: () => object });
const content = overrides => ({ availability_version: 2, r2_meta_version: 2, hash_256t: 'test', size_bytes: 1024, retention_months: 1,
  retention_payments: [{ amount_cents: 1 }], expires_at: '2030-01-01T00:00:00Z', ...overrides });
const reserve = object => object.fetch(new Request('https://internal/download/reserve', { method: 'POST' }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('prepaid cost safety', () => {
  it('keeps storage plus all reserved downloads within kept payment for size and retention boundaries', () => {
    for (const size of [65, 1024, 1024 ** 2, Math.floor(1024 ** 3 / 3), 1024 ** 3, 5 * 1024 ** 3]) {
      for (const months of [1, 12, 120]) {
        const charge = calculateRetentionCost(size, months);
        const file = content({ size_bytes: size, retention_months: months, retention_payments: [{ amount_cents: charge }] });
        const cost = size / 1e9 * months * P.r2StoragePerGBMonth + downloadAllowance(file) * DOWNLOAD_COST_DOLLARS + 0.00003;
        expect(cost).toBeLessThanOrEqual(charge / 100 * P.revenueKept);
      }
    }
    expect(downloadAllowance(content({ size_bytes: 64 }))).toBe(0);
    expect(downloadAllowance(content({ retention_payments: [] }))).toBe(0);
  });

  it('grosses up the entire card charge without losing the promised credit', () => {
    for (const cents of [100, 1000, 2000, 100000]) {
      const charged = grossUp(cents);
      expect(charged - Math.round(charged * P.stripeRate + P.stripeFixedCents)).toBeGreaterThanOrEqual(cents);
    }
  });

  it('quotes the tiny-file request floor consistently in the browser and checkout', () => {
    // 864,000 tiny downloads cost $3.456 before rounding, even with negligible bytes.
    expect(calculateRateLimitPrice(100, 100, 86400).priceCents).toBe(346);
    expect(previewPrice(100, 100, 86400).priceCents).toBe(346);
  });

  it('serializes reservations across workers, including restarts, with no overrun', async () => {
    const file = content();
    const backing = state({ content: file });
    const doEnv = {};
    let object = new ContentMetadata(backing, doEnv);
    const granted = await Promise.all(Array.from({ length: 25 }, () => reserve(object).then(r => r.json())));
    const total = granted.reduce((sum, result) => sum + result.count, 0);
    expect(total).toBe(downloadAllowance(file));
    object = new ContentMetadata(backing, doEnv);
    expect((await reserve(object)).status).toBe(429);
  });

  it('honors expiry, takedowns, and a brake on already prepaid purchases', async () => {
    const file = content({ rate_limit_records: [{ record_id: 'paid', price_cents: 1, max_requests: 2500, expires_at: '2030-01-01' }] });
    const backing = state({ content: file, 'download-budget': { reserved: downloadAllowance(file), purchases: {} } });
    const env = { COST_SAFETY_ALLOWANCE_ONLY: 'true' };
    const object = new ContentMetadata(backing, env);
    expect((await reserve(object)).status).toBe(429);
    env.COST_SAFETY_ALLOWANCE_ONLY = 'false';
    expect((await reserve(object)).status).toBe(200);
    await backing.storage.put('content', { ...file, disputed: true });
    expect((await reserve(object)).status).toBe(451);
    await backing.storage.put('content', { ...file, expires_at: '2020-01-01' });
    expect((await reserve(object)).status).toBe(404);
  });

  it('caps total outstanding retention and keeps sidecar takedowns through an extension', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const stored = state({ content: content({ expires_at: '2036-01-01T00:00:00Z' }) });
    const put = vi.fn();
    const object = new ContentMetadata(stored, { CONTENT_BUCKET: { head: async () => null, put } });
    expect((await object.extendRetention({ months_to_add: 1, amount_cents: 1 })).status).toBe(400);
    await stored.storage.put('content', content({ disputed: true, availability_version: 2, r2_meta_version: 2, expires_at: '2026-02-01T00:00:00Z' }));
    expect((await object.extendRetention({ months_to_add: 1, amount_cents: 1 })).status).toBe(200);
    expect(JSON.parse(put.mock.calls.at(-1)[1]).disputed).toBe(true);
  });

  it('does not reapply a Stripe session when its webhook is retried', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const stored = state({ content: content({ expires_at: '2026-02-01T00:00:00Z' }) });
    const object = new ContentMetadata(stored, {});
    const payment = { months_to_add: 119, amount_cents: 100, payment_id: 'stripe-session' };
    expect((await object.extendRetention(payment)).status).toBe(200);
    const before = await stored.storage.get('content');
    const retry = await object.extendRetention(payment);
    expect(retry.status).toBe(200);
    expect((await retry.json()).duplicate).toBe(true);
    expect(await stored.storage.get('content')).toEqual(before);
  });

  it('repairs a failed takedown sidecar using current committed state', async () => {
    const stored = state({ content: content() });
    stored.storage.setAlarm = vi.fn();
    const put = vi.fn().mockRejectedValueOnce(new Error('R2 unavailable')).mockResolvedValue(undefined);
    const object = new ContentMetadata(stored, { CONTENT_BUCKET: { put } });
    const response = await object.fetch(new Request('https://internal/availability', { method: 'POST', body: JSON.stringify({ disputed: true }) }));
    expect(response.status).toBe(500);
    expect(stored.storage.setAlarm).toHaveBeenCalled();
    expect((await reserve(object)).status).toBe(451);
    await object.alarm();
    expect(JSON.parse(put.mock.calls.at(-1)[1]).disputed).toBe(true);
  });

  it('limits free uploads across concurrent sessions and resets the hourly window', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const stored = state();
    const object = new UserProfile(stored, {});
    const responses = await Promise.all(Array.from({ length: 65 }, () => object.handleRequest(new Request('https://internal/inline-upload', { method: 'POST' }))));
    expect(responses.filter(r => r.ok)).toHaveLength(60);
    expect(responses.filter(r => r.status === 429)).toHaveLength(5);
    vi.advanceTimersByTime(3600000);
    expect((await object.handleRequest(new Request('https://internal/inline-upload', { method: 'POST' }))).status).toBe(200);
  });
});

describe('hourly monitor', () => {
  it('replaces cumulative monthly snapshots, detects an hourly burst, and latches the brake', async () => {
    const backing = state();
    const object = new InfrastructureCost(backing, {});
    const snapshot = (hour, cents) => object.fetch(new Request('https://internal/snapshot', { method: 'POST',
      body: JSON.stringify({ recorded_at: `2026-10-01T${hour}:00:00Z`, costs: { workers: cents, r2_operations: 0, r2_storage: 0, durable_objects: 0 }, revenue_cents: 0, top_files: [] }) }));
    await snapshot('01', 1); await snapshot('02', 2);
    const report = await (await snapshot('03', 1000)).json();
    expect(report.brake).toBe(true);
    expect(report.alerts.map(a => a.type)).toContain('hourly_cost_spike');
    await snapshot('03', 1000);
    const summary = await (await object.fetch(new Request('https://internal/summary?period=2026-10'))).json();
    expect(summary.costs.total).toBe(1000);
    await snapshot('04', 1001);
    expect((await (await object.fetch(new Request('https://internal/safety'))).json()).brake).toBe(true);
  });

  it('rejects unpriced operations and missing analytics instead of reporting zero cost', () => {
    const empty = { workers: [], operations: [], r2: [], invocations: [], periodic: [], storage: [] };
    expect(() => priceUsage({ ...empty, workers: null }, 1)).toThrow('Incomplete');
    expect(() => priceUsage({ ...empty, operations: [{ dimensions: { actionType: 'NewOperation' }, sum: { requests: 1 } }] }, 1)).toThrow('Unpriced');
  });

  it('reports unavailable monitoring without replacing a good snapshot with zero', async () => {
    const snapshot = vi.fn();
    const alerts = [];
    const result = await runCostMonitor({
      INFRASTRUCTURE_COST: binding({ fetch: snapshot }),
      ALERT_STORE: binding({ fetch: async req => { alerts.push(await req.json()); return Response.json({}); } })
    });
    expect(result.error).toContain('CLOUDFLARE_ANALYTICS_TOKEN');
    expect(snapshot).not.toHaveBeenCalled();
    expect(alerts[0].type).toBe('cost_monitor_unavailable');
  });

  it('replays synthetic downloads and alerts within the hourly run naming the file', async () => {
    const alerts = [];
    let attributionUnavailable = false;
    const costObject = new InfrastructureCost(state(), {});
    const env = { CLOUDFLARE_ANALYTICS_TOKEN: 'test-read-only', CLOUDFLARE_ACCOUNT_ID: 'test-account',
      INFRASTRUCTURE_COST: binding(costObject),
      PLATFORM_STATS: binding({ fetch: async () => Response.json({ revenue_cents: 0 }) }),
      ALERT_STORE: binding({ fetch: async req => { alerts.push(await req.json()); return Response.json({}); } }) };
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url.endsWith('/analytics_engine/sql')) return attributionUnavailable
        ? new Response('Unavailable', { status: 503 })
        : Response.json({ data: [{ cid: 'burst-file', status: '200', downloads: 2e8 }] });
      const { query } = JSON.parse(init.body);
      if (query.includes('__type')) return Response.json({ data: {
        workers: { fields: ['requests', 'cpuTimeUs'].map(name => ({ name })) },
        periodic: { fields: ['duration', 'rowsRead', 'rowsWritten'].map(name => ({ name })) },
        storage: { fields: [{ name: 'storedBytes' }] }
      } });
      return Response.json({ data: { viewer: { accounts: [{
        workers: [{ sum: { requests: 2e8, cpuTimeUs: 2e11 } }],
        operations: [{ dimensions: { actionType: 'GetObject' }, sum: { requests: 4e8 } }],
        r2: [], invocations: [], periodic: [], storage: []
      }] } } });
    }));
    const result = await runCostMonitor(env, new Date('2026-10-01T01:00:00Z'));
    expect(result.brake).toBe(true);
    expect(alerts.some(alert => alert.message.includes('burst-file') && alert.type === 'cost_brake')).toBe(true);
    const total = result.costs_cents;
    await runCostMonitor(env, new Date('2026-10-01T01:00:00Z'));
    const summary = await (await costObject.fetch(new Request('https://internal/summary?period=2026-10'))).json();
    expect(summary.costs.total).toBe(total);
    attributionUnavailable = true;
    const withoutAttribution = await runCostMonitor(env, new Date('2026-10-01T02:00:00Z'));
    expect(withoutAttribution.brake).toBe(true);
    expect(withoutAttribution.top_files_error).toContain('503');
    expect(alerts.some(alert => alert.type === 'download_analytics_unavailable')).toBe(true);
  });
});
