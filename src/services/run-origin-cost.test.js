import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRunOriginCostMonitor } from './cost-monitor.js';
import { InfrastructureCost } from '../durable-objects/infrastructure-cost.js';
import { readCostSafety } from '../utils/cost-safety-state.js';

describe('hosted run cost cap', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  function setup() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'));
    const values = new Map();
    const state = { blockConcurrencyWhile: fn => fn(), storage: { get: async key => values.get(key), put: async (key, value) => values.set(key, value) } };
    const costs = new InfrastructureCost(state, { RUN_DOMAIN: 'run.example' });
    const alert = vi.fn(async () => Response.json({}));
    const env = { RUN_DOMAIN: 'run.example', CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_ANALYTICS_TOKEN: 'test',
      INFRASTRUCTURE_COST: { idFromName: x => x, get: () => ({ fetch: req => costs.fetch(req) }) },
      ALERT_STORE: { idFromName: x => x, get: () => ({ fetch: alert }) } };
    return { env, values, alert };
  }

  it('alerts at 80%, brakes at the cap, and does not clear a latched brake on delayed lower counts', async () => {
    const { env, alert } = setup();
    const fetch = vi.fn(async () => Response.json({ data: [{ requests: '800000' }] }));
    vi.stubGlobal('fetch', fetch);
    let report = await runRunOriginCostMonitor(env);
    expect(report.cost_cents).toBeGreaterThan(400);
    expect(report.brake).toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body).toContain('FROM hashbin_run');
    vi.setSystemTime(Date.now() + 3600000);
    fetch.mockResolvedValue(Response.json({ data: [{ requests: 1000000 }] }));
    report = await runRunOriginCostMonitor(env);
    expect(report.brake).toBe(true);
    expect((await readCostSafety(env)).run_brake).toBe(true);
    vi.setSystemTime(Date.now() + 3600000);
    fetch.mockResolvedValue(Response.json({ data: [{ requests: 1 }] }));
    expect((await runRunOriginCostMonitor(env)).brake).toBe(true);
  });

  it('fails closed with missing or stale monthly measurements, and renews monthly', async () => {
    const { env } = setup();
    expect((await readCostSafety(env)).run_brake).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ requests: null }] })));
    await runRunOriginCostMonitor(env);
    expect((await readCostSafety(env)).run_brake).toBe(false);
    vi.setSystemTime(Date.now() + 2 * 3600000 + 1);
    expect((await readCostSafety(env)).run_brake).toBe(true);
    vi.setSystemTime(new Date('2026-11-01T00:00:01Z'));
    expect((await readCostSafety(env)).run_brake).toBe(true);
    await runRunOriginCostMonitor(env);
    expect((await readCostSafety(env)).run_brake).toBe(false);
  });

  it('rejects malformed analytics instead of reporting zero', async () => {
    const { env } = setup();
    for (const requests of [undefined, '', -1, 'invalid', false]) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ requests }] })));
      await expect(runRunOriginCostMonitor(env)).rejects.toThrow('Invalid');
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(runRunOriginCostMonitor(env)).rejects.toThrow('503');
  });
});
