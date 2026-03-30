import { describe, expect, it } from 'vitest';
import worker, { ApplicationRegistry, UserProfile } from './index.js';

function createMockState(initialData = {}) {
  const storage = new Map();
  if (initialData.profile) {
    storage.set('profile', initialData.profile);
  }
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

function createEnv() {
  const applicationRegistry = createDurableObjectBinding(() => new ApplicationRegistry(createMockState(), {}));
  const userProfiles = createDurableObjectBinding((userId) => new UserProfile(createMockState({
    profile: {
      user_id: userId,
      providers: ['local'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      api_keys: [],
      uploads: [],
      balance_cents: 4200,
      total_deposited_cents: 4200,
      total_spent_cents: 0,
      supplier_ids: [],
      supplier_count: 0,
      default_retention_months: 3,
      oauth_grants: [],
      oauth_refresh_tokens: []
    }
  }), {}));

  return {
    ENVIRONMENT: 'local',
    LOG_LEVEL: 'debug',
    APPLICATION_REGISTRY: applicationRegistry,
    USER_PROFILES: userProfiles
  };
}

async function registerApp(env, origin) {
  const registryId = env.APPLICATION_REGISTRY.idFromName('global');
  const registryStub = env.APPLICATION_REGISTRY.get(registryId);
  await registryStub.fetch(new Request('http://internal/apps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      app_name: 'CORS App',
      owner_user_id: 'developer_1',
      redirect_uris: [`${origin}/callback`]
    })
  }));
}

describe('OAuth CORS handling', () => {
  it('allows preflight for registered app origins', async () => {
    const env = createEnv();
    await registerApp(env, 'https://publisher.example');

    const response = await worker.fetch(new Request('https://hashbin.test/api/content', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://publisher.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    }), env, {});

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://publisher.example');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
  });

  it('allows preflight for trusted GitHub Pages origin', async () => {
    const env = createEnv();

    const response = await worker.fetch(new Request('https://hashbin.test/api/content', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://curtcox.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    }), env, {});

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://curtcox.github.io');
  });

  it('rejects preflight for unknown origins', async () => {
    const env = createEnv();
    await registerApp(env, 'https://publisher.example');

    const response = await worker.fetch(new Request('https://hashbin.test/api/content', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST'
      }
    }), env, {});

    expect(response.status).toBe(403);
  });

  it('adds CORS headers to API responses for registered origins', async () => {
    const env = createEnv();
    await registerApp(env, 'https://publisher.example');

    const response = await worker.fetch(new Request('https://hashbin.test/api/balance', {
      headers: {
        Origin: 'https://publisher.example',
        Authorization: 'LocalDev cors_user'
      }
    }), env, {});

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://publisher.example');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('adds CORS headers to API responses for trusted GitHub Pages origin', async () => {
    const env = createEnv();

    const response = await worker.fetch(new Request('https://hashbin.test/api/balance', {
      headers: {
        Origin: 'https://curtcox.github.io',
        Authorization: 'LocalDev cors_user'
      }
    }), env, {});

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://curtcox.github.io');
    expect(response.headers.get('Vary')).toContain('Origin');
  });
});
