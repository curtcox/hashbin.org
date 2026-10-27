import { describe, expect, it, vi } from 'vitest';
import { exportCostHistory, reconcileCostReports } from './cost-safety-report.mjs';
import { COST_USAGE_UNITS } from '../src/utils/cost-measurements.js';
const usage = Object.fromEntries(Object.keys(COST_USAGE_UNITS).map(key => [key, 0]));
const snapshot = (recorded_at, cents, extra = {}) => ({ period: '2026-10', recorded_at, usage_end: '2026-11-01T00:00:00Z',
  closed_month: true, costs_cents: cents, revenue_kept_cents: 200, usage, ...extra });

describe('cost observation reconciliation', () => {
  it('uses the latest corrected cumulative period rather than summing hourly observations', () => {
    const result = reconcileCostReports({ snapshots: [snapshot('2026-11-01T01:00:00Z', 100), snapshot('2026-11-01T02:00:00Z', 90)] },
      { period: '2026-10', variable_cost_cents: 80 });
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].estimated_variable_cost_cents).toBe(90);
    expect(result.reports[0].invoice_minus_estimate_cents).toBe(-10);
    expect(result.reports[0].estimated_margin_cents).toBe(110);
  });
  it('does not invent measurements or revenue for legacy and degraded snapshots', () => {
    const report = reconcileCostReports({ snapshots: [snapshot('2026-11-01T01:00:00Z', 100, { usage: null, revenue_known: false })] }).reports[0];
    expect(report.usage).toBeNull(); expect(report.estimated_margin_cents).toBeNull(); expect(report.repriced_with_current_policy_cents).toBeNull();
  });
  it('refuses mismatched periods, partial-month invoices and invalid metrics', () => {
    const data = { snapshots: [snapshot('2026-11-01T01:00:00Z', 100)] };
    expect(() => reconcileCostReports(data, { period: '2026-09', variable_cost_cents: 1 })).toThrow('no snapshots');
    expect(() => reconcileCostReports({ snapshots: [snapshot('2026-10-25T01:00:00Z', 100, { closed_month: false })] }, { period: '2026-10', variable_cost_cents: 1 })).toThrow('completed');
    expect(() => reconcileCostReports({ snapshots: [snapshot('2026-11-01T01:00:00Z', 100, { usage: {} })] })).toThrow('measurements');
  });
});

describe('read-only observation export', () => {
  it('preserves opaque period-suffixed cursors and never sends credentials through redirects', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ snapshots: [snapshot('2026-11-01T01:00:00Z', 100)], next_before: '2026-11-01T01:2026-10' }))
      .mockResolvedValueOnce(Response.json({ snapshots: [], next_before: null }));
    expect((await exportCostHistory('https://example.com', 'private-token', request)).snapshots).toHaveLength(1);
    expect(new URL(request.mock.calls[1][0]).searchParams.get('before')).toBe('2026-11-01T01:2026-10');
    expect(request.mock.calls[0][1].redirect).toBe('error');
    expect(request.mock.calls[0][1].headers).toEqual({ 'X-Admin-Token': 'private-token' });
  });

  it('sends an admin key as an ApiKey credential', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ snapshots: [], next_before: null }));
    await exportCostHistory('https://example.com', 'hba_route.random.tag', request);
    expect(request.mock.calls[0][1].headers).toEqual({ Authorization: 'ApiKey hba_route.random.tag' });
  });
  it('rejects credential leaks, missing tokens and pagination loops', async () => {
    await expect(exportCostHistory('http://example.com', 'private')).rejects.toThrow('HTTPS');
    await expect(exportCostHistory('https://user:password@example.com', 'private')).rejects.toThrow('HTTPS');
    await expect(exportCostHistory('https://example.com', '')).rejects.toThrow('TOKEN');
    await expect(exportCostHistory('https://example.com', 'private', async () => Response.json({ snapshots: [], next_before: 'same' }))).rejects.toThrow('did not advance');
    await expect(exportCostHistory('https://example.com', 'private', async () => new Response('', { status: 401 }))).rejects.toThrow('401');
  });
});
