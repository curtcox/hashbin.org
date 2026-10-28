import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRegistry } from './application-registry.js';

const appId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const initial = { app_id: appId, owner_user_id: 'owner', app_name: 'App', status: 'active', redirect_uris: ['https://app.example/path', 'https://app.example/other', 'http://127.0.0.1:3000/cb', 'http://[::1]:3000/cb', 'org.example:/cb'] };
let registry, values, audit;
const call = (path, method = 'GET', data) => registry.fetch(new Request(`https://internal${path}`, { method, ...(data ? { body: JSON.stringify(data) } : {}) }));
const settings = (data, owner = 'owner') => call(`/apps/${appId}/run`, 'PUT', { owner_user_id: owner, ...data });
const day = '2026-10-28';

describe('application hosted run controls', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${day}T15:00:00Z`));
    values = new Map([['apps', [structuredClone(initial)]]]);
    audit = vi.fn(async () => Response.json({ success: true }));
    const state = { storage: { get: async key => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)), delete: async key => values.delete(key) } };
    registry = new ApplicationRegistry(state, { RUN_DOMAIN: 'run.example', ADMIN_ACTION_LOG: { idFromName: x => x, get: () => ({ fetch: audit }) } });
  });
  afterEach(() => vi.useRealTimers());

  it('defaults existing apps to off, and only the owner can enable or read usage', async () => {
    expect(await (await call(`/run/by-app/${appId}`)).json()).toMatchObject({ status: 'off' });
    expect((await settings({ status: 'active' }, 'stranger')).status).toBe(404);
    expect((await call(`/apps/${appId}/run?owner_user_id=stranger`)).status).toBe(404);
    expect((await settings({ status: 'active', daily_request_cap: 999999 })).status).toBe(200);
    const result = await (await call(`/apps/${appId}/run?owner_user_id=owner`)).json();
    expect(result).toMatchObject({ status: 'active', daily_request_cap: 20000, allow_local: false, requests_today: 0, requests_month: 0 });
    expect(result.origin).toBe('https://a1932999d125c4cf6bf56806d6df1fa3a.run.example');
    expect(result.csp).toBe(`frame-src ${result.origin}`);
  });

  it('derives deduplicated embedders and allows loopback only when opted in', async () => {
    await settings({ status: 'active' });
    expect((await (await call(`/run/by-app/${appId}`)).json()).embedders).toEqual(['https://app.example']);
    await settings({ status: 'active', allow_local: true });
    expect((await (await call(`/run/by-app/${appId}`)).json()).embedders).toEqual(['https://app.example', 'http://127.0.0.1:3000', 'http://[::1]:3000']);
  });

  it('validates settings and requires a configured domain', async () => {
    for (const data of [{}, { status: 'suspended' }, { status: 'active', allow_local: 'yes' }]) expect((await settings(data)).status).toBe(400);
    registry.env.RUN_DOMAIN = '';
    expect((await settings({ status: 'active' })).status).toBe(503);
    expect((await settings({ status: 'off' })).status).toBe(200);
  });

  it('logs admin suspension and restoration, and prevents owner escape', async () => {
    await settings({ status: 'active' });
    expect((await call(`/apps/${appId}/run/suspend`, 'POST', { reason: 'Abuse', actor: 'admin' })).status).toBe(200);
    expect((await settings({ status: 'off' })).status).toBe(403);
    expect((await settings({ status: 'active' })).status).toBe(403);
    expect((await (await call(`/run/by-app/${appId}`)).json()).status).toBe('suspended');
    expect((await call(`/apps/${appId}/run/restore`, 'POST', { actor: 'admin' })).status).toBe(200);
    expect((await (await call(`/run/by-app/${appId}`)).json()).status).toBe('off');
    const logs = await Promise.all(audit.mock.calls.map(([request]) => request.json()));
    expect(logs.map(log => log.action_type)).toEqual(['run_suspended', 'run_restored']);
    expect(logs[0]).toMatchObject({ admin_user_id: 'admin', details: { app_id: appId, reason: 'Abuse' } });
  });

  it('does not change state when audit recording fails', async () => {
    await settings({ status: 'active' });
    audit.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await call(`/apps/${appId}/run/suspend`, 'POST', { reason: 'Abuse', actor: 'admin' })).status).toBe(503);
    expect((await (await call(`/run/by-app/${appId}`)).json()).status).toBe('active');
  });

  it('soft deletion turns off hosted mode and never reuses the app record', async () => {
    await settings({ status: 'active' });
    expect((await call(`/apps/${appId}?owner_user_id=owner`, 'DELETE')).status).toBe(200);
    expect((await call(`/run/by-app/${appId}`)).status).toBe(404);
    expect(values.get('apps')[0]).toMatchObject({ app_id: appId, status: 'deleted', run: { status: 'off' } });
  });

  it('reserves globally capped batches, aggregates idempotent usage, and keeps 35 days', async () => {
    await settings({ status: 'active' });
    const lease = await (await call('/run/reserve', 'POST', { app_id: appId, day })).json();
    for (let i = 0; i < 167; i++) await call('/run/reserve', 'POST', { app_id: appId, day });
    expect(await (await call('/run/reserve', 'POST', { app_id: appId, day })).json()).toMatchObject({ count: 0 });
    const increment = { app_id: appId, day, requests: 100, lease_id: lease.lease_id };
    for (let i = 0; i < 2; i++) expect((await call('/run/usage', 'POST', increment)).status).toBe(200);
    expect((await (await call(`/apps/${appId}/run?owner_user_id=owner`)).json()).requests_today).toBe(100);
    for (const data of [{ ...increment, requests: -1 }, { ...increment, day: '2026-02-31' }, { ...increment, day: '2026-11-01' }, { ...increment, lease_id: 'oops' }]) expect((await call('/run/usage', 'POST', data)).status).toBe(400);
    vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));
    const november = await (await call('/run/reserve', 'POST', { app_id: appId, day: '2026-11-01' })).json();
    await call('/run/usage', 'POST', { ...increment, day: '2026-11-01', requests: 1, lease_id: november.lease_id });
    expect(await (await call(`/apps/${appId}/run?owner_user_id=owner`)).json()).toMatchObject({ requests_today: 1, requests_month: 1 });
    vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
    await call('/run/reserve', 'POST', { app_id: appId, day: '2026-12-02' });
    expect(values.get(`run:usage:${appId}:${day}`)).toBeUndefined();
  });
});
