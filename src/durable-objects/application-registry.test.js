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
});
