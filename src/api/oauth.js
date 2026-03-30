import { authenticate, requireAuth } from '../auth/middleware.js';
import {
  createPkceChallenge,
  generateOAuthSecret,
  sha256Hex,
  signOAuthJwt,
  verifyOAuthJwt
} from '../auth/oauth.js';

const ALLOWED_SCOPES = new Set(['content:write', 'content:read', 'balance:read']);
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

function createRefreshToken(userId) {
  return `hbr_${userId}.${generateOAuthSecret('')}`;
}

function extractRefreshTokenUserId(refreshToken) {
  if (typeof refreshToken !== 'string' || !refreshToken.startsWith('hbr_')) {
    return null;
  }

  const separatorIndex = refreshToken.indexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const userId = refreshToken.slice(4, separatorIndex);
  return userId || null;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...extraHeaders
    }
  });
}

async function getApplication(env, clientId) {
  const id = env.APPLICATION_REGISTRY.idFromName('global');
  const stub = env.APPLICATION_REGISTRY.get(id);
  const response = await stub.fetch(new Request(`http://internal/apps/${clientId}`));
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function parseScopes(scopeString) {
  const scopes = (scopeString || '').split(/\s+/).filter(Boolean);
  if (scopes.length === 0) {
    return [];
  }
  if (scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    return null;
  }
  return Array.from(new Set(scopes));
}

async function upsertGrant(env, userId, grantData) {
  const profileId = env.USER_PROFILES.idFromName(userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  const response = await profileStub.fetch(new Request('http://internal/oauth/grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(grantData)
  }));

  if (!response.ok) {
    throw new Error('Failed to persist oauth grant');
  }

  return response.json();
}

async function storeRefreshToken(env, userId, tokenData) {
  const profileId = env.USER_PROFILES.idFromName(userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  const response = await profileStub.fetch(new Request('http://internal/oauth/refresh-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tokenData)
  }));

  if (!response.ok) {
    throw new Error('Failed to persist refresh token');
  }

  return response.json();
}

async function rotateRefreshToken(env, userId, tokenData) {
  const profileId = env.USER_PROFILES.idFromName(userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  const response = await profileStub.fetch(new Request('http://internal/oauth/refresh-tokens/rotate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tokenData)
  }));

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function handleCreateDeveloperApp(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const data = await request.json();
  const registryId = env.APPLICATION_REGISTRY.idFromName('global');
  const registryStub = env.APPLICATION_REGISTRY.get(registryId);
  return registryStub.fetch(new Request('http://internal/apps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...data,
      owner_user_id: authResult.user.userId
    })
  }));
}

export async function handleListDeveloperApps(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const registryId = env.APPLICATION_REGISTRY.idFromName('global');
  const registryStub = env.APPLICATION_REGISTRY.get(registryId);
  return registryStub.fetch(new Request(`http://internal/apps?owner_user_id=${encodeURIComponent(authResult.user.userId)}`));
}

export async function handleOAuthAuthorize(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const data = await request.json();
  const app = await getApplication(env, data.client_id);
  if (!app || app.status !== 'active') {
    return jsonResponse({ error: 'invalid_client' }, 400);
  }

  if (data.response_type !== 'code') {
    return jsonResponse({ error: 'unsupported_response_type' }, 400);
  }

  if (!app.redirect_uris.includes(data.redirect_uri)) {
    return jsonResponse({ error: 'invalid_redirect_uri' }, 400);
  }

  if (!data.code_challenge || data.code_challenge_method !== 'S256') {
    return jsonResponse({ error: 'invalid_request', message: 'PKCE with S256 is required' }, 400);
  }

  const scopes = parseScopes(data.scope);
  if (scopes === null || scopes.length === 0) {
    return jsonResponse({ error: 'invalid_scope' }, 400);
  }

  const grant = await upsertGrant(env, authResult.user.userId, {
    app_id: app.app_id,
    scopes,
    spending_limit: data.spending_limit ?? null
  });

  const now = Math.floor(Date.now() / 1000);
  const code = await signOAuthJwt({
    token_type: 'authorization_code',
    app_id: app.app_id,
    grant_id: grant.grant_id,
    user_id: authResult.user.userId,
    redirect_uri: data.redirect_uri,
    scopes,
    code_challenge: data.code_challenge,
    code_challenge_method: 'S256',
    spending_limit: grant.spending_limit ?? null,
    iat: now,
    exp: now + AUTHORIZATION_CODE_TTL_SECONDS
  }, env.OAUTH_SIGNING_KEY);

  const redirectUrl = new URL(data.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (data.state) {
    redirectUrl.searchParams.set('state', data.state);
  }

  return Response.redirect(redirectUrl.toString(), 302);
}

async function issueTokenPair(env, codePayload) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signOAuthJwt({
    token_type: 'access',
    grant_id: codePayload.grant_id,
    app_id: codePayload.app_id,
    user_id: codePayload.user_id,
    scopes: codePayload.scopes,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS
  }, env.OAUTH_SIGNING_KEY);

  const refreshToken = createRefreshToken(codePayload.user_id);
  const refreshTokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await storeRefreshToken(env, codePayload.user_id, {
    token_hash: refreshTokenHash,
    grant_id: codePayload.grant_id,
    app_id: codePayload.app_id,
    expires_at: expiresAt
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: codePayload.scopes.join(' ')
  };
}

export async function handleOAuthToken(request, env) {
  const data = await request.json();

  if (data.grant_type === 'authorization_code') {
    let codePayload;
    try {
      codePayload = await verifyOAuthJwt(data.code, env.OAUTH_SIGNING_KEY);
    } catch (error) {
      return jsonResponse({
        error: error.code === 'expired' ? 'invalid_grant' : 'invalid_request'
      }, 400);
    }

    if (codePayload.token_type !== 'authorization_code' || codePayload.app_id !== data.client_id || codePayload.redirect_uri !== data.redirect_uri) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    const expectedChallenge = await createPkceChallenge(data.code_verifier || '');
    if (expectedChallenge !== codePayload.code_challenge) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    return jsonResponse(await issueTokenPair(env, codePayload));
  }

  if (data.grant_type === 'refresh_token') {
    const userId = extractRefreshTokenUserId(data.refresh_token);
    if (!userId) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    const refreshTokenHash = await sha256Hex(data.refresh_token || '');
    const newRefreshToken = createRefreshToken(userId);
    const rotated = await rotateRefreshToken(env, userId, {
      current_token_hash: refreshTokenHash,
      new_token_hash: await sha256Hex(newRefreshToken),
      new_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });

    if (!rotated) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    const accessToken = await signOAuthJwt({
      token_type: 'access',
      grant_id: rotated.grant_id,
      app_id: rotated.app_id,
      user_id: rotated.user_id,
      scopes: rotated.scopes,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS
    }, env.OAUTH_SIGNING_KEY);

    return jsonResponse({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: rotated.scopes.join(' ')
    });
  }

  return jsonResponse({ error: 'unsupported_grant_type' }, 400);
}

export async function handleGetAccountSettings(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const profileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  return profileStub.fetch(new Request('http://internal/settings'));
}

export async function handleUpdateAccountSettings(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const profileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  return profileStub.fetch(new Request('http://internal/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: await request.text()
  }));
}

export async function handleListAuthorizations(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const profileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  return profileStub.fetch(new Request('http://internal/oauth/grants'));
}
