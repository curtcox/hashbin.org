import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async () => ({
    sub: 'clerk_bootstrap_user',
    sid: 'sess_bootstrap'
  }))
}));

import { handleCreateDeveloperApp, handleOAuthAuthorize } from './oauth.js';
import { ApplicationRegistry } from '../durable-objects/application-registry.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { createPkceChallenge } from '../auth/oauth.js';

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
  const userProfiles = createDurableObjectBinding(
    () => new UserProfile(createMockState(), {})
  );
  const applicationRegistry = createDurableObjectBinding(
    () => new ApplicationRegistry(createMockState(), {})
  );

  return {
    ENVIRONMENT: 'production',
    CLERK_SECRET_KEY: 'test-clerk-secret',
    USER_PROFILES: userProfiles,
    APPLICATION_REGISTRY: applicationRegistry,
    OAUTH_SIGNING_KEY: 'test-oauth-signing-key'
  };
}

describe('OAuth authorize profile bootstrap', () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  it('creates a missing user profile before persisting oauth grants', async () => {
    const createAppResponse = await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-clerk-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        app_name: 'Bootstrap App',
        redirect_uris: ['https://publisher.example/callback']
      })
    }), env);
    expect(createAppResponse.status).toBe(201);
    const app = await createAppResponse.json();

    const authorizeResponse = await handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-clerk-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        client_id: app.client_id,
        redirect_uri: 'https://publisher.example/callback',
        response_type: 'code',
        scope: 'content:write balance:read',
        state: 'bootstrap-state',
        code_challenge: await createPkceChallenge('bootstrap-verifier-123'),
        code_challenge_method: 'S256'
      })
    }), env);

    expect(authorizeResponse.status).toBe(302);
    const redirectUrl = new URL(authorizeResponse.headers.get('location'));
    expect(redirectUrl.searchParams.get('code')).toBeTruthy();
    expect(redirectUrl.searchParams.get('state')).toBe('bootstrap-state');

    const profileId = env.USER_PROFILES.idFromName('clerk_bootstrap_user');
    const profileStub = env.USER_PROFILES.get(profileId);
    const profileResponse = await profileStub.fetch(new Request('http://internal/profile'));
    expect(profileResponse.status).toBe(200);
  });
});
