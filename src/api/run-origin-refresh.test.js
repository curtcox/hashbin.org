import { afterEach, describe, expect, it, vi } from 'vitest';
const { authenticate, monitor } = vi.hoisted(() => ({ authenticate: vi.fn(), monitor: vi.fn() }));
vi.mock('../auth/middleware.js', async () => ({ ...await vi.importActual('../auth/middleware.js'), authenticate, applyRateLimit: () => null }));
vi.mock('../services/cost-monitor.js', async () => ({ ...await vi.importActual('../services/cost-monitor.js'), runRunOriginCostMonitor: monitor }));
import worker from '../index.js';

describe('operator hosted-run cost refresh', () => {
  afterEach(() => vi.clearAllMocks());
  const request = () => new Request('https://hashbin.test/api/admin/cost-safety/run/refresh', { method: 'POST' });
  const user = scopes => ({ authenticated: true, user: { userId: 'admin', authMethod: 'admin_key', keyId: 'cost_key', scopes, session: false } });
  it('requires admin:costs before invoking the monitor', async () => {
    authenticate.mockResolvedValue({ authenticated: false });
    expect((await worker.fetch(request(), {}, {})).status).toBe(401);
    authenticate.mockResolvedValue(user(['admin:read']));
    expect((await worker.fetch(request(), {}, {})).status).toBe(403);
    expect(monitor).not.toHaveBeenCalled();
  });
  it('returns fresh analytics and records the actor without accepting override inputs', async () => {
    authenticate.mockResolvedValue(user(['admin:costs']));
    monitor.mockResolvedValue({ period: '2026-10', requests: 10, cost_cents: 0.01, brake: false });
    const audit = vi.fn(async () => Response.json({}));
    const env = { RUN_DOMAIN: 'hashbin.app', AUDIT_LOG: { idFromName: x => x, get: () => ({ fetch: audit }) } };
    const response = await worker.fetch(request(), env, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requests: 10, brake: false });
    expect(monitor).toHaveBeenCalledWith(env);
    expect(await audit.mock.calls[0][0].json()).toMatchObject({ actor_id: 'admin (admin key cost_key)', action: 'refresh_run_cost' });
  });
  it('keeps failures visible rather than inventing safety evidence', async () => {
    authenticate.mockResolvedValue(user(['admin:costs']));
    monitor.mockRejectedValue(new Error('Analytics unavailable'));
    const response = await worker.fetch(request(), { RUN_DOMAIN: 'hashbin.app' }, {});
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: 'Analytics unavailable' });
  });
});
