import { describe, expect, it } from 'vitest';
import { InfrastructureCost } from './infrastructure-cost.js';

function fixture() {
  const rows = new Map(); let queue = Promise.resolve();
  const storage = {
    get: async key => structuredClone(rows.get(key)),
    put: async (key, value) => rows.set(key, structuredClone(value)),
    list: async ({ prefix = '', end, reverse, limit } = {}) => {
      const entries = [...rows].filter(([key]) => key.startsWith(prefix) && (!end || key < end))
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      if (reverse) entries.reverse();
      return new Map(limit ? entries.slice(0, limit) : entries);
    },
    delete: async keys => { for (const key of keys) rows.delete(key); },
    transaction: async operation => {
      const before = structuredClone(rows);
      try { return await operation(storage); }
      catch (error) { rows.clear(); for (const [key, value] of before) rows.set(key, value); throw error; }
    }
  };
  const object = new InfrastructureCost({ storage, blockConcurrencyWhile(operation) {
    const next = queue.then(operation); queue = next.catch(() => {}); return next;
  } }, {});
  const snapshot = (recorded_at, amount, extra = {}) => object.fetch(new Request('https://internal/snapshot', { method: 'POST', body: JSON.stringify({
    recorded_at, costs: { workers: amount, r2_operations: 0, r2_storage: 0, durable_objects: 0 }, revenue_cents: 0, ...extra
  }) }));
  const get = path => object.fetch(new Request(`https://internal${path}`)).then(r => r.json());
  return { rows, storage, object, snapshot, get };
}
const closed = { period: '2026-10', usage_end: '2026-11-01T00:00:00Z' };

describe('completed cost months', () => {
  it('captures the final hour without replacing the new month safety view', async () => {
    const f = fixture();
    await f.snapshot('2026-10-31T23:00:00Z', 100);
    await f.snapshot('2026-11-01T00:00:00Z', 0);
    const report = await (await f.snapshot('2026-11-01T01:00:00Z', 150, closed)).json();
    expect(report.period).toBe('2026-10'); expect(report.closed_month).toBe(true);
    expect(report.projected_cents).toBe(150); expect(report.hourly_cost_cents).toBe(50);
    expect((await f.get('/summary?period=2026-10')).costs.total).toBe(150);
    expect((await f.get('/summary?period=2026-11')).costs.total).toBe(0);
    expect((await f.get('/safety')).period).toBe('2026-11');
    const history = await f.get('/history');
    expect(history.snapshots.filter(row => row.recorded_at.startsWith('2026-11-01'))).toHaveLength(2);
  });

  it('replaces late cost/revenue corrections and repeated refreshes without double counting', async () => {
    const f = fixture();
    await f.snapshot('2026-10-31T23:00:00Z', 100);
    await f.snapshot('2026-11-01T01:00:00Z', 150, { ...closed, revenue_cents: 200 });
    await f.snapshot('2026-11-01T01:00:00Z', 150, { ...closed, revenue_cents: 200 });
    const correction = await (await f.snapshot('2026-11-01T02:00:00Z', 140, { ...closed, revenue_cents: 190 })).json();
    expect(correction.hourly_cost_cents).toBeNull();
    expect(correction.revenue_cents).toBe(190);
    expect((await f.get('/summary?period=2026-10')).costs.total).toBe(140);
    expect((await f.get('/summary')).costs.total).toBe(140);
    const stale = await (await f.snapshot('2026-11-01T01:30:00Z', 160, closed)).json();
    expect(stale.costs_cents).toBe(140);
  });

  it('can latch the brake from a completed-month loss while retaining the live report', async () => {
    const f = fixture();
    await f.snapshot('2026-11-01T01:00:00Z', 0);
    const report = await (await f.snapshot('2026-11-01T02:00:00Z', 6000, closed)).json();
    expect(report.alerts.map(alert => alert.type)).toContain('cost_brake');
    const safety = await f.get('/safety');
    expect(safety.brake).toBe(true); expect(safety.period).toBe('2026-11'); expect(safety.costs_cents).toBe(0);
  });

  it.each([
    { period: '2026-13' },
    { period: '2026-12' },
    { ...closed, usage_end: '2026-10-31T23:00:00Z' },
    { ...closed, usage_end: '2026-11-01T00:00:01Z' },
    { period: '2026-11', usage_end: '2026-11-01T02:00:00Z' }
  ])('rejects invalid or incomplete usage windows (%j)', async extra => {
    const f = fixture();
    expect((await f.snapshot('2026-11-01T01:00:00Z', 1, extra)).status).toBe(400);
    expect(f.rows.size).toBe(0);
  });
});

it('compares a late final-hour burst with its billing-day history', async () => {
  const f = fixture();
  await f.snapshot('2026-10-31T22:00:00Z', 1);
  await f.snapshot('2026-10-31T23:00:00Z', 2);
  await f.snapshot('2026-11-02T20:00:00Z', 0);
  const report = await (await f.snapshot('2026-11-03T01:00:00Z', 100, closed)).json();
  expect(report.hourly_cost_cents).toBe(98);
  expect(report.trailing_hourly_average_cents).toBe(1);
  expect(report.alerts.map(alert => alert.type)).toContain('hourly_cost_spike');
});

it('paginates current and completed reports collected in the same hour', async () => {
  const f = fixture();
  await f.snapshot('2026-11-01T01:00:00Z', 0);
  await f.snapshot('2026-11-01T01:00:00Z', 100, closed);
  const first = await f.get('/history?limit=1');
  const second = await f.get(`/history?limit=1&before=${encodeURIComponent(first.next_before)}`);
  expect(first.snapshots[0].period).toBe('2026-10');
  expect(second.snapshots[0].period).toBe('2026-11');
});

it.each([
  { middle: 120, last: 300, average: 120 / 21, spike: true },
  { middle: 2001, last: 2551, average: 2001 / 21, spike: false }
])('weights the daily spike baseline by actual observation duration (%j)', async ({ middle, last, average, spike }) => {
  const f = fixture();
  await f.snapshot('2026-10-01T01:00:00Z', 0);
  await f.snapshot('2026-10-01T02:00:00Z', middle === 120 ? 100 : 1);
  await f.snapshot('2026-10-01T22:00:00Z', middle);
  const report = await (await f.snapshot('2026-10-01T23:00:00Z', last)).json();
  expect(report.trailing_hourly_average_cents).toBeCloseTo(average);
  expect(report.alerts.some(alert => alert.type === 'hourly_cost_spike')).toBe(spike);
});
