import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleCreateDeveloperApp,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleRevokeAuthorization,
  handleUpdateAuthorization
} from './oauth.js';
import { ApplicationRegistry } from '../durable-objects/application-registry.js';
import { UserProfile } from '../durable-objects/user-profile.js';
import { authenticate } from '../auth/middleware.js';
import { createPkceChallenge, verifyOAuthJwt } from '../auth/oauth.js';

function createMockState(profile) {
  const storage = new Map(profile ? [['profile', profile]] : []);
  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    }
  };
}

function binding(factory) {
  const instances = new Map();
  return {
    idFromName: (name) => ({ toString: () => name }),
    get: (id) => {
      if (!instances.has(id.toString())) instances.set(id.toString(), factory(id.toString()));
      return instances.get(id.toString());
    }
  };
}

const USER = 'narrow_user';
const REDIRECT = 'https://narrow.example/callback';
const VERIFIER = 'verifier-value-for-narrowing-tests-123456';

describe('OAuth narrowing', () => {
  let env;
  let app;

  beforeEach(async () => {
    env = {
      ENVIRONMENT: 'local',
      OAUTH_SIGNING_KEY: 'test-oauth-signing-key',
      APPLICATION_REGISTRY: binding(() => new ApplicationRegistry(createMockState(), {})),
      USER_PROFILES: binding((userId) => new UserProfile(createMockState({
        user_id: userId, providers: ['local'], deleted_at: null, api_keys: [], uploads: [], balance_cents: 5000,
        default_retention_months: 6, oauth_grants: [], oauth_refresh_tokens: []
      }), {}))
    };
    app = await (await handleCreateDeveloperApp(new Request('https://hashbin.test/api/developers/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'LocalDev developer' },
      body: JSON.stringify({ app_name: 'Narrow App', redirect_uris: [REDIRECT] })
    }), env)).json();
  });

  async function approve(consent = {}, request = {}) {
    return handleOAuthAuthorize(new Request('https://hashbin.test/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `LocalDev ${USER}` },
      body: JSON.stringify({
        client_id: app.client_id, redirect_uri: REDIRECT, response_type: 'code',
        scope: 'content:write balance:read', spending_limit: '5',
        code_challenge: await createPkceChallenge(VERIFIER), code_challenge_method: 'S256',
        ...request, ...consent
      })
    }), env);
  }

  const codeFrom = (response) => new URL(response.headers.get('location')).searchParams.get('code');
  const token = (body) => handleOAuthToken(new Request('https://hashbin.test/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }), env);
  const exchange = (code, extra = {}) => token({
    grant_type: 'authorization_code', code, client_id: app.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER, ...extra
  });
  const grants = async () => (await (await env.USER_PROFILES.get(env.USER_PROFILES.idFromName(USER))
    .fetch(new Request('http://internal/oauth/grants'))).json()).authorizations;
  const session = (method, body) => new Request('https://hashbin.test/api/account/authorizations', {
    method, headers: { 'content-type': 'application/json', authorization: `LocalDev ${USER}` }, ...(body ? { body: JSON.stringify(body) } : {})
  });

  it('grants only the permissions and limits the user approved', async () => {
    const approved = await approve({ granted_scopes: ['balance:read'], granted_spending_limit: '2', granted_max_retention_months: '3', expires_in_days: '30' });
    expect(approved.status).toBe(302);
    const [grant] = await grants();
    expect(grant.scopes).toEqual(['balance:read']);
    expect(grant.caveats).toMatchObject({ monthly_spend_limit_cents: 200, max_retention_months: 3 });
    expect(Date.parse(grant.caveats.expires_at) - Date.now()).toBeGreaterThan(29 * 86400000);
    expect((await (await exchange(codeFrom(approved))).json()).scope).toBe('balance:read');
  });

  it.each([
    [{ granted_scopes: ['content:write', 'downloads:spend'] }, 'invalid_scope'],
    [{ granted_scopes: [] }, 'invalid_scope'],
    [{ granted_spending_limit: '6' }, 'invalid_request'],
    [{ granted_spending_limit: null }, 'invalid_request'],
    [{ expires_in_days: '7' }, 'invalid_request']
  ])('refuses consent that widens or drops a required limit: %j', async (consent, error) => {
    const response = await approve(consent);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it('lets a non-spending app go without a spend limit', async () => {
    const response = await approve({}, { scope: 'balance:read', spending_limit: undefined });
    expect(response.status).toBe(302);
  });

  it('accepts each authorization code once', async () => {
    const code = codeFrom(await approve());
    expect((await exchange(code)).status).toBe(200);
    const replay = await exchange(code);
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('invalid_grant');
  });

  it('issues narrower access tokens on request and never wider ones', async () => {
    const narrow = await (await exchange(codeFrom(await approve()), { scope: 'balance:read' })).json();
    expect(narrow.scope).toBe('balance:read');
    expect((await verifyOAuthJwt(narrow.access_token, env.OAUTH_SIGNING_KEY)).scopes).toEqual(['balance:read']);
    const auth = await authenticate(new Request('https://hashbin.test', { headers: { authorization: `Bearer ${narrow.access_token}` } }), env);
    expect(auth.user.scopes).toEqual(['balance:read']);

    const wider = await exchange(codeFrom(await approve({ granted_scopes: ['balance:read'] })), { scope: 'content:write' });
    expect((await wider.json()).error).toBe('invalid_scope');
  });

  it('refuses a wider refresh request without consuming the refresh token', async () => {
    const tokens = await (await exchange(codeFrom(await approve({ granted_scopes: ['balance:read'] })))).json();
    const wider = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: 'content:write' });
    expect((await wider.json()).error).toBe('invalid_scope');
    const refreshed = await (await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: 'balance:read' })).json();
    expect(refreshed.scope).toBe('balance:read');
  });

  it('keeps each approval as its own grant, revocable and narrowable alone', async () => {
    await approve();
    await approve({ granted_scopes: ['balance:read'], granted_spending_limit: '1' });
    const [first, second] = await grants();
    expect(first.grant_id).not.toBe(second.grant_id);

    const widened = await handleUpdateAuthorization(session('PATCH', { scopes: ['content:write'] }), env, second.grant_id);
    expect((await widened.json()).error).toBe('SCOPE_WIDENING');
    const loosened = await handleUpdateAuthorization(session('PATCH', { caveats: { monthly_spend_limit_cents: 900 } }), env, first.grant_id);
    expect((await loosened.json()).error).toBe('CAVEAT_WIDENING');
    const narrowed = await handleUpdateAuthorization(session('PATCH', { scopes: ['balance:read'], caveats: { monthly_spend_limit_cents: 100 } }), env, first.grant_id);
    expect(await narrowed.json()).toMatchObject({ scopes: ['balance:read'], caveats: { monthly_spend_limit_cents: 100 } });

    expect((await handleRevokeAuthorization(session('DELETE'), env, first.grant_id)).status).toBe(200);
    expect((await grants()).map((grant) => grant.grant_id)).toEqual([second.grant_id]);
  });

  it('stops honoring tokens and refreshes once a grant expires', async () => {
    const tokens = await (await exchange(codeFrom(await approve({ expires_in_days: '30' })))).json();
    const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(USER));
    const [grant] = await grants();
    // Expire it in storage, as time passing would
    const stored = await profile.state.storage.get('profile');
    stored.oauth_grants.find((entry) => entry.grant_id === grant.grant_id).caveats.expires_at = new Date(Date.now() - 1000).toISOString();
    await profile.state.storage.put('profile', stored);

    const auth = await authenticate(new Request('https://hashbin.test', { headers: { authorization: `Bearer ${tokens.access_token}` } }), env);
    expect(auth.authenticated).toBe(false);
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect((await refreshed.json()).error).toBe('invalid_grant');
  });
});
