import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleCreateDeveloperApp,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleGetAccountSettings,
  handleUpdateAccountSettings,
  handleListAuthorizations,
  handleRevokeAuthorization,
  handleOAuthRevoke
} from './oauth.js';
import { ApplicationRegistry } from '../durable-objects/application-registry.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { createPkceChallenge } from '../auth/oauth.js';
import { authenticate } from '../auth/middleware.js';

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
  const userProfiles = createDurableObjectBinding((userId) => new UserProfile(
    createMockState({
      profile: {
        user_id: userId,
        providers: ['local'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        api_keys: [],
        uploads: [],
        balance_cents: 5000,
        total_deposited_cents: 5000,
        total_spent_cents: 0,
        supplier_ids: [],
        supplier_count: 0,
        default_retention_months: 3,
        oauth_grants: [],
        oauth_refresh_tokens: []
      }
    }),
    {}
  ));

  const applicationRegistry = createDurableObjectBinding(() => new ApplicationRegistry(createMockState(), {}));

  return {
    ENVIRONMENT: 'local',
    USER_PROFILES: userProfiles,
    APPLICATION_REGISTRY: applicationRegistry,
    OAUTH_SIGNING_KEY: 'test-oauth-signing-key'
  };
}

async function issueTokens(env, {
  developerUser = 'developer_user',
  resourceUser = 'resource_user',
  scopes = 'content:write balance:read',
  redirectUri = 'https://client.example/callback'
} = {}) {
  const registerResponse = await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `LocalDev ${developerUser}`
    },
    body: JSON.stringify({
      app_name: 'Managed App',
      redirect_uris: [redirectUri]
    })
  }), env);
  const app = await registerResponse.json();

  const codeVerifier = 'managed-verifier-1234567890';
  const authorizeResponse = await handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `LocalDev ${resourceUser}`
    },
    body: JSON.stringify({
      client_id: app.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: 'managed-state',
      code_challenge: await createPkceChallenge(codeVerifier),
      code_challenge_method: 'S256'
    })
  }), env);

  const redirectUrl = new URL(authorizeResponse.headers.get('location'));
  const tokenResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: app.client_id,
      code: redirectUrl.searchParams.get('code'),
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  }), env);

  return {
    app,
    tokens: await tokenResponse.json()
  };
}

describe('OAuth management API', () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  it('gets and updates account settings for default retention', async () => {
    const getResponse = await handleGetAccountSettings(new Request('https://hashbin.test/api/account/settings', {
      headers: { authorization: 'LocalDev settings_user' }
    }), env);
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).default_retention_months).toBe(3);

    const patchResponse = await handleUpdateAccountSettings(new Request('https://hashbin.test/api/account/settings', {
      method: 'PATCH',
      headers: {
        authorization: 'LocalDev settings_user',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ default_retention_months: 12 })
    }), env);
    expect(patchResponse.status).toBe(200);
    expect((await patchResponse.json()).default_retention_months).toBe(12);
  });

  it('lists and revokes app authorizations for a user', async () => {
    const { app, tokens } = await issueTokens(env);

    const listResponse = await handleListAuthorizations(new Request('https://hashbin.test/api/account/authorizations', {
      headers: { authorization: 'LocalDev resource_user' }
    }), env);
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.authorizations).toHaveLength(1);
    expect(listed.authorizations[0].app_id).toBe(app.app_id);

    const revokeResponse = await handleRevokeAuthorization(new Request(`https://hashbin.test/api/account/authorizations/${app.app_id}`, {
      method: 'DELETE',
      headers: { authorization: 'LocalDev resource_user' }
    }), env, app.app_id);
    expect(revokeResponse.status).toBe(200);

    const authResult = await authenticate(new Request('https://hashbin.test/api/balance', {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    }), env);
    expect(authResult.authenticated).toBe(false);
  });

  it('revokes a refresh token and prevents reuse', async () => {
    const { tokens } = await issueTokens(env);

    const revokeResponse = await handleOAuthRevoke(new Request('https://hashbin.test/oauth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: tokens.refresh_token,
        token_type_hint: 'refresh_token'
      })
    }), env);
    expect(revokeResponse.status).toBe(200);

    const refreshResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token
      })
    }), env);
    expect(refreshResponse.status).toBe(400);
    expect((await refreshResponse.json()).error).toBe('invalid_grant');
  });
});
