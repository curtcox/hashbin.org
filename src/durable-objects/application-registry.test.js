import { beforeEach, describe, expect, it } from 'vitest';
import { ApplicationRegistry } from './application-registry.js';

function createMockState(initialData = {}) {
  const storage = new Map(Object.entries(initialData));

  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    }
  };
}

describe('ApplicationRegistry Durable Object', () => {
  let registry;

  beforeEach(() => {
    registry = new ApplicationRegistry(createMockState(), {});
  });

  it('registers an application and returns public developer credentials', async () => {
    const response = await registry.fetch(new Request('http://internal/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_name: 'Example Publisher',
        owner_user_id: 'user_123',
        redirect_uris: ['https://example.com/callback']
      })
    }));

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.app_id).toMatch(/^app_/);
    expect(data.client_id).toBe(data.app_id);
    expect(data.client_secret).toMatch(/^hbs_/);
    expect(data.app_name).toBe('Example Publisher');
    expect(data.redirect_uris).toEqual(['https://example.com/callback']);
  });

  it('lists applications for a given owner', async () => {
    await registry.fetch(new Request('http://internal/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_name: 'Owned App',
        owner_user_id: 'owner_1',
        redirect_uris: ['https://owner.example/callback']
      })
    }));

    await registry.fetch(new Request('http://internal/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_name: 'Other App',
        owner_user_id: 'owner_2',
        redirect_uris: ['https://other.example/callback']
      })
    }));

    const response = await registry.fetch(new Request('http://internal/apps?owner_user_id=owner_1'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.apps).toHaveLength(1);
    expect(data.apps[0].app_name).toBe('Owned App');
  });

  it('looks up an application by client id for oauth validation', async () => {
    const createResponse = await registry.fetch(new Request('http://internal/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_name: 'Lookup App',
        owner_user_id: 'owner_lookup',
        redirect_uris: ['https://lookup.example/callback']
      })
    }));

    const created = await createResponse.json();
    const response = await registry.fetch(new Request(`http://internal/apps/${created.client_id}`));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.app_id).toBe(created.app_id);
    expect(data.client_secret_hash).toBeTypeOf('string');
    expect(data.client_secret_hash).not.toBe(created.client_secret);
  });

  describe('update and delete', () => {
    async function create(owner = 'user_123') {
      const response = await registry.fetch(new Request('http://internal/apps', {
        method: 'POST',
        body: JSON.stringify({ app_name: 'Example', owner_user_id: owner, redirect_uris: ['https://example.com/cb'] })
      }));
      return (await response.json()).app_id;
    }
    const patch = (appId, body) => registry.fetch(new Request(`http://internal/apps/${appId}`, { method: 'PATCH', body: JSON.stringify(body) }));
    const remove = (appId, owner) => registry.fetch(new Request(`http://internal/apps/${appId}?owner_user_id=${owner}`, { method: 'DELETE' }));

    it('lets the owner rename and change redirect URIs', async () => {
      const appId = await create();
      const response = await patch(appId, { owner_user_id: 'user_123', app_name: 'Renamed', redirect_uris: ['https://new.example/cb'] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ app_name: 'Renamed', redirect_uris: ['https://new.example/cb'] });
    });

    it('hides other owners\' apps behind 404', async () => {
      const appId = await create();
      expect((await patch(appId, { owner_user_id: 'intruder', app_name: 'Mine now' })).status).toBe(404);
      expect((await remove(appId, 'intruder')).status).toBe(404);
    });

    it('rejects unsafe redirect URIs and names', async () => {
      const appId = await create();
      for (const redirect_uris of [['http://evil.example/cb'], ['javascript:alert(1)'], ['https://ok.example/cb#frag'], []]) {
        expect((await patch(appId, { owner_user_id: 'user_123', redirect_uris })).status).toBe(400);
      }
      expect((await patch(appId, { owner_user_id: 'user_123', app_name: 'x'.repeat(101) })).status).toBe(400);
      expect((await patch(appId, { owner_user_id: 'user_123', redirect_uris: ['http://localhost:3000/cb'] })).status).toBe(200);
    });

    it('accepts native app schemes named after a domain, and nothing riskier', async () => {
      const appId = await create();
      for (const uri of ['org.hashbin.textpad://oauth', 'com.example.app:/oauth2redirect']) {
        expect((await patch(appId, { owner_user_id: 'user_123', redirect_uris: [uri] })).status, uri).toBe(200);
      }
      for (const uri of ['myapp://oauth', 'data:text/html,hi', 'file:///etc/passwd', 'vbscript:x', 'org.example.app://user:pw@oauth', 'org.example.app://oauth#x']) {
        expect((await patch(appId, { owner_user_id: 'user_123', redirect_uris: [uri] })).status, uri).toBe(400);
      }
    });

    it('never treats the "null" origin of a native app scheme as a CORS origin', async () => {
      const appId = await create();
      await patch(appId, { owner_user_id: 'user_123', redirect_uris: ['org.hashbin.textpad://oauth', 'https://example.com/cb'] });
      const check = async (origin) => (await (await registry.fetch(new Request(`http://internal/origins/check?origin=${encodeURIComponent(origin)}`))).json()).allowed;
      expect(await check('null')).toBe(false);
      expect(await check('https://example.com')).toBe(true);
    });

    it('soft-deletes: hidden from lists, inactive for authorization and CORS', async () => {
      const appId = await create();
      expect((await remove(appId, 'user_123')).status).toBe(200);

      const list = await (await registry.fetch(new Request('http://internal/apps?owner_user_id=user_123'))).json();
      expect(list.apps).toEqual([]);
      const app = await (await registry.fetch(new Request(`http://internal/apps/${appId}`))).json();
      expect(app.status).toBe('deleted');
      const cors = await (await registry.fetch(new Request('http://internal/origins/check?origin=https://example.com'))).json();
      expect(cors.allowed).toBe(false);
    });
  });
});
