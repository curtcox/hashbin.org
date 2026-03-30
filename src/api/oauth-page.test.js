import { beforeEach, describe, expect, it } from 'vitest';
import { handleGetOAuthAuthorizePage } from './oauth.js';
import { ApplicationRegistry } from '../durable-objects/application-registry.js';

function createMockState(initialData = {}) {
  const storage = new Map();
  if (initialData.apps) {
    storage.set('apps', initialData.apps);
  }

  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    }
  };
}

function createDurableObjectBinding(instanceFactory) {
  const instances = new Map();

  return {
    idFromName: (name) => ({ toString: () => name }),
    get: (id) => {
      const key = id.toString();
      if (!instances.has(key)) {
        instances.set(key, instanceFactory(key));
      }
      return instances.get(key);
    }
  };
}

describe('OAuth authorize page', () => {
  let env;

  beforeEach(async () => {
    env = {
      APPLICATION_REGISTRY: createDurableObjectBinding(() => new ApplicationRegistry(createMockState(), {}))
    };

    const registryId = env.APPLICATION_REGISTRY.idFromName('global');
    const registryStub = env.APPLICATION_REGISTRY.get(registryId);
    await registryStub.fetch(new Request('http://internal/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_name: 'Example Publisher',
        owner_user_id: 'developer_1',
        redirect_uris: ['https://publisher.example/callback']
      })
    }));
  });

  it('renders an html consent page for a valid authorize request', async () => {
    const registryId = env.APPLICATION_REGISTRY.idFromName('global');
    const app = await (await env.APPLICATION_REGISTRY.get(registryId).fetch(new Request('http://internal/apps?owner_user_id=developer_1'))).json();
    const clientId = app.apps[0].client_id;

    const response = await handleGetOAuthAuthorizePage(new Request(`https://hashbin.test/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent('https://publisher.example/callback')}&response_type=code&scope=${encodeURIComponent('content:write balance:read')}&state=test-state&code_challenge=test-challenge&code_challenge_method=S256`), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Example Publisher');
    expect(html).toContain('content:write');
    expect(html).toContain('balance:read');
    expect(html).toContain('test-state');
  });

  it('rejects invalid authorize requests with a readable html error page', async () => {
    const response = await handleGetOAuthAuthorizePage(new Request('https://hashbin.test/oauth/authorize?client_id=missing&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&response_type=code&scope=content%3Awrite&code_challenge=x&code_challenge_method=S256'), env);

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Unable to Continue');
    expect(html).toContain('invalid_client');
  });
});
