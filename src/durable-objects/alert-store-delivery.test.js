import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertStore } from './alert-store.js';

function createStorage() {
  const data = new Map();
  return {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
    async list({ prefix = '' } = {}) { return new Map([...data].filter(([k]) => k.startsWith(prefix))); }
  };
}

const create = (store, type = 'backup_unhealthy') => store.fetch(new Request('https://dummy/create', {
  method: 'POST',
  body: JSON.stringify({ type, severity: 'critical', title: 'Backups stale', message: 'No snapshot in 48h' })
})).then(r => r.json());

afterEach(() => vi.unstubAllGlobals());

describe('alert delivery', () => {
  it('posts new alerts to ALERT_WEBHOOK_URL in a Slack/Discord-compatible body', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const store = new AlertStore({ storage: createStorage() }, { ALERT_WEBHOOK_URL: 'https://hooks.example/abc' });

    const result = await create(store);
    expect(result.delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example/abc');
    const body = JSON.parse(init.body);
    expect(body.text).toContain('[HashBin CRITICAL] Backups stale');
    expect(body.content).toBe(body.text);
    expect(body.alert.type).toBe('backup_unhealthy');
  });

  it('does not re-send duplicates, and works without a webhook', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const store = new AlertStore({ storage: createStorage() }, { ALERT_WEBHOOK_URL: 'https://hooks.example/abc' });
    await create(store);
    expect((await create(store)).duplicate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const quiet = new AlertStore({ storage: createStorage() }, {});
    expect((await create(quiet)).delivered).toBe(false);
  });

  it('keeps the alert when the webhook fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const store = new AlertStore({ storage: createStorage() }, { ALERT_WEBHOOK_URL: 'https://hooks.example/abc' });
    const result = await create(store);
    expect(result.alert.id).toBeDefined();
    expect(result.delivered).toBe(false);
  });
});
