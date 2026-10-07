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

  async function consentPage(extraParams) {
    const registryId = env.APPLICATION_REGISTRY.idFromName('global');
    const app = await (await env.APPLICATION_REGISTRY.get(registryId).fetch(new Request('http://internal/apps?owner_user_id=developer_1'))).json();
    const params = new URLSearchParams({
      client_id: app.apps[0].client_id,
      redirect_uri: 'https://publisher.example/callback',
      response_type: 'code',
      scope: 'content:write',
      state: 'test-state',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
      ...extraParams
    });
    return handleGetOAuthAuthorizePage(new Request(`https://hashbin.test/oauth/authorize?${params}`), env);
  }

  it('shows a requested spending limit and passes it on when approving', async () => {
    const response = await consentPage({ spending_limit: '12.5' });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Monthly spending limit');
    expect(html).toContain('$12.50 per month');
    expect(html).toContain('"spending_limit":12.5');
  });

  it('omits the spending limit row when none is requested', async () => {
    const html = await (await consentPage({})).text();
    expect(html).not.toContain('Monthly spending limit');
    expect(html).toContain('"spending_limit":null');
  });

  it('rejects a spending limit that is not a positive amount', async () => {
    for (const value of ['abc', '-5', '0']) {
      const response = await consentPage({ spending_limit: value });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('spending limit');
    }
  });

  it('keeps request values from closing the inline script', async () => {
    const html = await (await consentPage({ state: '</script><script>alert(1)</script>' })).text();
    const script = html.slice(html.indexOf('const authorizePayload'));
    expect(script).not.toContain('</script><script>');
    expect(script).toContain('\\u003c/script>');
  });

  it('asks the authorize endpoint for JSON instead of following its redirect', async () => {
    const html = await (await consentPage({})).text();
    expect(html).toContain("accept: 'application/json'");
    expect(html).toContain('result.redirect_to');
    expect(html).not.toContain('response.redirected');
  });

  it('rejects invalid authorize requests with a readable html error page', async () => {
    const response = await handleGetOAuthAuthorizePage(new Request('https://hashbin.test/oauth/authorize?client_id=missing&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&response_type=code&scope=content%3Awrite&code_challenge=x&code_challenge_method=S256'), env);

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Unable to Continue');
    expect(html).toContain('invalid_client');
  });
});
