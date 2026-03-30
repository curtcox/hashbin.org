import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleCreateDeveloperApp,
  handleListDeveloperApps,
  handleOAuthAuthorize,
  handleOAuthToken
} from './oauth.js';
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
        default_retention_months: 6,
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

describe('OAuth API', () => {
  let env;

  beforeEach(() => {
    env = createEnv();
  });

  it('registers and lists developer applications for the authenticated user', async () => {
    const createRequest = new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev dev_user'
      },
      body: JSON.stringify({
        app_name: 'Publish Widget',
        redirect_uris: ['https://widget.example/callback']
      })
    });

    const createResponse = await handleCreateDeveloperApp(createRequest, env);
    expect(createResponse.status).toBe(201);

    const listRequest = new Request('https://hashbin.test/api/developers/apps', {
      headers: {
        authorization: 'LocalDev dev_user'
      }
    });
    const listResponse = await handleListDeveloperApps(listRequest, env);

    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.apps).toHaveLength(1);
    expect(listed.apps[0].app_name).toBe('Publish Widget');
  });

  it('authorizes an app with PKCE and exchanges the code for access and refresh tokens', async () => {
    const registerResponse = await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev developer_user'
      },
      body: JSON.stringify({
        app_name: 'PKCE App',
        redirect_uris: ['https://pkce.example/callback']
      })
    }), env);
    const app = await registerResponse.json();

    const codeVerifier = 'verifier-value-for-tests-1234567890';
    const codeChallenge = await createPkceChallenge(codeVerifier);

    const authorizeResponse = await handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev user_authorizing'
      },
      body: JSON.stringify({
        client_id: app.client_id,
        redirect_uri: 'https://pkce.example/callback',
        response_type: 'code',
        scope: 'content:write balance:read',
        state: 'opaque-state',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        spending_limit: 12.5
      })
    }), env);

    expect(authorizeResponse.status).toBe(302);
    const redirectUrl = new URL(authorizeResponse.headers.get('location'));
    expect(redirectUrl.origin + redirectUrl.pathname).toBe('https://pkce.example/callback');
    expect(redirectUrl.searchParams.get('state')).toBe('opaque-state');
    expect(redirectUrl.searchParams.get('code')).toBeTruthy();

    const tokenResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: app.client_id,
        code: redirectUrl.searchParams.get('code'),
        redirect_uri: 'https://pkce.example/callback',
        code_verifier: codeVerifier
      })
    }), env);

    expect(tokenResponse.status).toBe(200);
    const tokenData = await tokenResponse.json();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.scope).toBe('content:write balance:read');
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.refresh_token).toBeTruthy();
    expect(tokenData.expires_in).toBe(3600);
  });

  it('rejects token exchange when the PKCE verifier does not match', async () => {
    const registerResponse = await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev developer_user'
      },
      body: JSON.stringify({
        app_name: 'Mismatch App',
        redirect_uris: ['https://mismatch.example/callback']
      })
    }), env);
    const app = await registerResponse.json();

    const authorizeResponse = await handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev mismatch_user'
      },
      body: JSON.stringify({
        client_id: app.client_id,
        redirect_uri: 'https://mismatch.example/callback',
        response_type: 'code',
        scope: 'content:write',
        state: 'mismatch-state',
        code_challenge: await createPkceChallenge('correct-verifier'),
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
        redirect_uri: 'https://mismatch.example/callback',
        code_verifier: 'wrong-verifier'
      })
    }), env);

    expect(tokenResponse.status).toBe(400);
    const error = await tokenResponse.json();
    expect(error.error).toBe('invalid_grant');
  });

  it('rotates refresh tokens and rejects reuse of the old token', async () => {
    const registerResponse = await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev developer_user'
      },
      body: JSON.stringify({
        app_name: 'Refresh App',
        redirect_uris: ['https://refresh.example/callback']
      })
    }), env);
    const app = await registerResponse.json();

    const codeVerifier = 'refresh-verifier-1234567890';
    const authorizeResponse = await handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'LocalDev refresh_user'
      },
      body: JSON.stringify({
        client_id: app.client_id,
        redirect_uri: 'https://refresh.example/callback',
        response_type: 'code',
        scope: 'content:write balance:read',
        state: 'refresh-state',
        code_challenge: await createPkceChallenge(codeVerifier),
        code_challenge_method: 'S256'
      })
    }), env);

    const redirectUrl = new URL(authorizeResponse.headers.get('location'));
    const initialTokenResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: app.client_id,
        code: redirectUrl.searchParams.get('code'),
        redirect_uri: 'https://refresh.example/callback',
        code_verifier: codeVerifier
      })
    }), env);
    const initialTokens = await initialTokenResponse.json();

    const refreshResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: initialTokens.refresh_token
      })
    }), env);

    expect(refreshResponse.status).toBe(200);
    const rotatedTokens = await refreshResponse.json();
    expect(rotatedTokens.refresh_token).toBeTruthy();
    expect(rotatedTokens.refresh_token).not.toBe(initialTokens.refresh_token);
    expect(rotatedTokens.access_token).toBeTruthy();

    const reuseResponse = await handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: initialTokens.refresh_token
      })
    }), env);

    expect(reuseResponse.status).toBe(400);
    const reuseError = await reuseResponse.json();
    expect(reuseError.error).toBe('invalid_grant');
  });
});
