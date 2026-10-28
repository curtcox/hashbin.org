import { describe, expect, it, vi } from 'vitest';
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('../auth/middleware.js', async () => ({ ...await vi.importActual('../auth/middleware.js'), authenticate: auth, applyRateLimit: () => null }));
import worker from '../index.js';

const appId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const path = `/api/developers/apps/${appId}/run`;
function environment() {
  const requests = [];
  return { requests, env: { APPLICATION_REGISTRY: { idFromName: x => x, get: () => ({ fetch: async request => { requests.push(request); return Response.json({ status: 'off' }); } }) } } };
}

describe('hosted run API access', () => {
  it('requires a session for owner settings and overwrites supplied ownership', async () => {
    const { env, requests } = environment();
    const make = () => new Request(`https://hashbin.test${path}`, { method: 'PUT', body: JSON.stringify({ status: 'active', owner_user_id: 'victim', daily_request_cap: 99999 }) });
    auth.mockResolvedValue({ authenticated: true, user: { userId: 'owner', authMethod: 'clerk', session: true, scopes: [] } });
    expect((await worker.fetch(make(), env, {})).status).toBe(200);
    expect(await requests[0].json()).toEqual({ status: 'active', owner_user_id: 'owner' });
    auth.mockResolvedValue({ authenticated: true, user: { userId: 'owner', authMethod: 'oauth', session: false, scopes: ['content:write'] } });
    expect((await worker.fetch(make(), env, {})).status).toBe(403);
    auth.mockResolvedValue({ authenticated: false });
    expect((await worker.fetch(make(), env, {})).status).toBe(401);
  });

  it('requires admin:takedown for suspension and restoration', async () => {
    const { env, requests } = environment();
    for (const action of ['suspend', 'restore']) {
      const make = () => new Request(`https://hashbin.test/api/admin/apps/${appId}/run/${action}`, { method: 'POST', body: JSON.stringify({ reason: 'Abuse', actor: 'forged' }) });
      auth.mockResolvedValue({ authenticated: true, user: { userId: 'admin', authMethod: 'admin_key', keyId: 'key', session: false, scopes: ['admin:read'] } });
      expect((await worker.fetch(make(), env, {})).status).toBe(403);
      auth.mockResolvedValue({ authenticated: true, user: { userId: 'admin', authMethod: 'admin_key', keyId: 'key', session: false, scopes: ['admin:takedown'] } });
      expect((await worker.fetch(make(), env, {})).status).toBe(200);
      expect(await requests.at(-1).json()).toEqual({ reason: 'Abuse', actor: 'admin (admin key key)' });
    }
  });
});
