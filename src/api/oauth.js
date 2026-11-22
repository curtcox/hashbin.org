import { verifyDPoP, dpopNonce } from '../auth/dpop.js';
import { authenticate, requireAuth } from '../auth/middleware.js';
import { SPENDING_SCOPES, parseCaveats, parseScopes } from '../auth/scopes.js';
import { createPkceChallenge, generateOAuthSecret, sha256Hex, signOAuthJwt, verifyOAuthJwt } from '../auth/oauth.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_SPENDING_LIMIT_USD = 1000000;
export const GRANT_EXPIRY_CHOICES_DAYS = [1, 7, 30, 90, 365];

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
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export async function getApplication(env, clientId) {
  const id = env.APPLICATION_REGISTRY.idFromName('global');
  const stub = env.APPLICATION_REGISTRY.get(id);
  const response = await stub.fetch(new Request(`http://internal/apps/${clientId}`));
  if (!response.ok) {
    return null;
  }
  return response.json();
}

// Monthly spending limit in USD. Returns null when no limit was requested and
// undefined when the value is not a usable amount.
function parseSpendingLimit(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const amount = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SPENDING_LIMIT_USD) {
    return undefined;
  }
  return Math.round(amount * 100) / 100;
}

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

export function validateAuthorizeRequest(data, app) {
  if (!app || app.status !== 'active') {
    return { valid: false, error: 'invalid_client', message: 'The requested application could not be found.' };
  }

  if (data.response_type !== 'code') {
    return { valid: false, error: 'unsupported_response_type', message: 'Only authorization code flow is supported.' };
  }

  if (!app.redirect_uris.includes(data.redirect_uri)) {
    return { valid: false, error: 'invalid_redirect_uri', message: 'The redirect URI is not registered for this application.' };
  }

  if (!data.code_challenge || data.code_challenge_method !== 'S256') {
    return { valid: false, error: 'invalid_request', message: 'PKCE with S256 is required.' };
  }

  const scopes = parseScopes(data.scope, 'oauth');
  if (scopes === null || scopes.length === 0) {
    return { valid: false, error: 'invalid_scope', message: 'At least one supported scope is required.' };
  }

  const spendingLimit = parseSpendingLimit(data.spending_limit);
  if (spendingLimit === undefined || spendingLimit === 0) {
    return { valid: false, error: 'invalid_request', message: 'The spending limit must be a positive amount in US dollars.' };
  }

  if (data.dpop_jkt && (typeof data.dpop_jkt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.dpop_jkt))) {
    return { valid: false, error: 'invalid_request', message: 'Invalid DPoP key thumbprint.' };
  }
  const maxUpload = parseOptionalInteger(data.max_upload_bytes, 1, 5 * 1024 * 1024);
  if (maxUpload === undefined) return { valid: false, error: 'invalid_request', message: 'max_upload_bytes must be 1 to 5242880 bytes.' };
  const maxRetention = parseOptionalInteger(data.max_retention_months, 1, 120);
  if (maxRetention === undefined) {
    return { valid: false, error: 'invalid_request', message: 'max_retention_months must be a whole number of months from 1 to 120.' };
  }

  return { valid: true, scopes, spendingLimit, maxRetention, maxUpload };
}

// A whole number within bounds; null when absent, undefined when invalid.
function parseOptionalInteger(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : undefined;
}

/**
 * What the user approved on the consent page: a subset of the requested scopes and
 * limits at least as tight as the app asked for. Spending scopes need a spend limit.
 * Returns { scopes, caveats } or { error, message }.
 */
function grantedAccess(data, validation) {
  const scopes = data.granted_scopes === undefined ? validation.scopes : parseScopes(data.granted_scopes, 'oauth');
  if (!scopes || scopes.length === 0 || scopes.some((scope) => !validation.scopes.includes(scope))) {
    return { error: 'invalid_scope', message: 'Approve at least one of the requested permissions, and no others.' };
  }

  const limit = data.granted_spending_limit === undefined ? validation.spendingLimit : parseSpendingLimit(data.granted_spending_limit);
  if (limit === undefined || (validation.spendingLimit !== null && limit !== null && limit > validation.spendingLimit)) {
    return { error: 'invalid_request', message: 'The spending limit must be a positive amount no higher than the app requested.' };
  }
  if (limit === null && scopes.some((scope) => SPENDING_SCOPES.has(scope))) {
    return { error: 'invalid_request', message: 'Set a monthly spending limit to let this app spend from your balance.' };
  }

  const retention = data.granted_max_retention_months === undefined
    ? validation.maxRetention
    : parseOptionalInteger(data.granted_max_retention_months, 1, 120);
  if (retention === undefined || (validation.maxRetention !== null && (retention === null || retention > validation.maxRetention))) {
    return { error: 'invalid_request', message: 'The retention cap must be 1 to 120 months, no higher than the app requested.' };
  }

  const maxUpload = data.granted_max_upload_bytes === undefined ? validation.maxUpload : parseOptionalInteger(data.granted_max_upload_bytes, 1, 5 * 1024 * 1024);
  if (maxUpload === undefined || (validation.maxUpload !== null && (maxUpload === null || maxUpload > validation.maxUpload))) {
    return { error: 'invalid_request', message: 'Choose a file size no higher than the app requested.' };
  }
  const expiryDays = parseOptionalInteger(data.expires_in_days === undefined ? 30 : data.expires_in_days, 1, 365);
  if (expiryDays === undefined || (expiryDays !== null && !GRANT_EXPIRY_CHOICES_DAYS.includes(expiryDays))) {
    return { error: 'invalid_request', message: `Choose an expiry of ${GRANT_EXPIRY_CHOICES_DAYS.join(', ')} days, or none.` };
  }

  const caveats = {};
  if (limit !== null) caveats.monthly_spend_limit_cents = Math.round(limit * 100);
  if (retention !== null) caveats.max_retention_months = retention;
  if (maxUpload !== null) caveats.max_upload_bytes = maxUpload;
  if (expiryDays !== null) caveats.expires_at = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  return { scopes, caveats };
}

async function createGrant(env, userId, grantData) {
  const profileId = env.USER_PROFILES.idFromName(userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  const grantRequest = () => new Request('http://internal/oauth/grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(grantData)
  });

  let response = await profileStub.fetch(grantRequest());
  if (response.status === 404) {
    // Some Clerk-authenticated users can reach OAuth authorize before profile provisioning completes.
    const createProfileResponse = await profileStub.fetch(new Request('http://internal/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        providers: []
      })
    }));

    if (createProfileResponse.ok || createProfileResponse.status === 409) {
      response = await profileStub.fetch(grantRequest());
    } else {
      let details = `status=${createProfileResponse.status}`;
      try {
        const data = await createProfileResponse.json();
        details = `${details}, error=${data.error || 'unknown'}, message=${data.message || 'unknown'}`;
      } catch (_error) {
        // Ignore non-JSON bodies.
      }
      throw new Error(`Failed to create oauth profile: ${details}`);
    }
  }

  if (!response.ok) {
    let details = `status=${response.status}`;
    try {
      const data = await response.json();
      details = `${details}, error=${data.error || 'unknown'}, message=${data.message || 'unknown'}`;
    } catch (_error) {
      // Ignore non-JSON bodies.
    }
    throw new Error(`Failed to persist oauth grant: ${details}`);
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

  if (response.status === 422) {
    return { error: 'invalid_scope' };
  }
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

export async function handleUpdateDeveloperApp(request, env, appId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const data = await request.json();
  const registryStub = env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
  return registryStub.fetch(new Request(`http://internal/apps/${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, owner_user_id: authResult.user.userId })
  }));
}

export async function handleDeleteDeveloperApp(request, env, appId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const registryStub = env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
  return registryStub.fetch(new Request(
    `http://internal/apps/${encodeURIComponent(appId)}?owner_user_id=${encodeURIComponent(authResult.user.userId)}`,
    { method: 'DELETE' }
  ));
}

export async function handleOAuthAuthorize(request, env) {
  const requestId = crypto.randomUUID();

  try {
    const authResult = await authenticate(request, env);
    const authError = requireAuth(authResult);
    if (authError) return authError;

    if (!env.OAUTH_SIGNING_KEY) {
      return jsonResponse({
        error: 'server_misconfigured',
        message: 'OAuth signing key is not configured on the server.',
        request_id: requestId
      }, 500);
    }

    if (!env.USER_PROFILES || !env.APPLICATION_REGISTRY) {
      return jsonResponse({
        error: 'server_misconfigured',
        message: 'Required OAuth bindings are not configured on the server.',
        request_id: requestId
      }, 500);
    }

    const data = await request.json();
    const app = await getApplication(env, data.client_id);
    const validation = validateAuthorizeRequest(data, app);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error, message: validation.message }, 400);
    }
    const granted = grantedAccess(data, validation);
    if (granted.error) {
      return jsonResponse({ error: granted.error, message: granted.message }, 400);
    }
    const scopes = granted.scopes;

    // Each approval is its own grant, so two installs of an app can hold different access
    const grant = await createGrant(env, authResult.user.userId, {
      app_id: app.app_id,
      scopes,
      caveats: granted.caveats
    });

    const now = Math.floor(Date.now() / 1000);
    const code = await signOAuthJwt({
      token_type: 'authorization_code',
      jti: crypto.randomUUID(),
      app_id: app.app_id,
      grant_id: grant.grant_id,
      user_id: authResult.user.userId,
      redirect_uri: data.redirect_uri,
      scopes,
      dpop_jkt: data.dpop_jkt || null,
      code_challenge: data.code_challenge,
      code_challenge_method: 'S256',
      iat: now,
      exp: now + AUTHORIZATION_CODE_TTL_SECONDS
    }, env.OAUTH_SIGNING_KEY);

    const redirectUrl = new URL(data.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (data.state) {
      redirectUrl.searchParams.set('state', data.state);
    }

    // The consent page calls this with fetch, which would follow a 302 to the
    // app's redirect URI and fail unless that host allows CORS. It asks for
    // JSON instead and navigates itself.
    if (wantsJson(request)) {
      return jsonResponse({ redirect_to: redirectUrl.toString() });
    }
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('OAuth authorize failed', {
      requestId,
      message: error?.message || 'Unknown error',
      stack: error?.stack || null
    });

    return jsonResponse({
      error: 'authorization_failed',
      message: 'OAuth authorization failed on the server.',
      details: error?.message || 'Unknown error',
      request_id: requestId
    }, 500);
  }
}

/**
 * Scopes for an access token: those the client asks for (RFC 6749 §3.3, §6), which
 * must all be available, or every available scope. Returns null when invalid.
 */
function tokenScopes(requested, available) {
  if (requested === undefined || requested === null || requested === '') return available;
  const scopes = parseScopes(requested, 'oauth');
  return scopes && scopes.length > 0 && scopes.every((scope) => available.includes(scope)) ? scopes : null;
}

// Authorization codes work once
async function redeemCode(env, codePayload) {
  if (typeof codePayload.jti !== 'string') return false;
  const profileStub = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(codePayload.user_id));
  const response = await profileStub.fetch(new Request('http://internal/oauth/codes/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jti: codePayload.jti, expires_at: codePayload.exp })
  }));
  return response.ok;
}

async function issueTokenPair(env, codePayload, scopes, dpopJkt) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signOAuthJwt({
    token_type: 'access',
    ...(dpopJkt ? { cnf: { jkt: dpopJkt } } : {}),
    grant_id: codePayload.grant_id,
    app_id: codePayload.app_id,
    user_id: codePayload.user_id,
    scopes,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS
  }, env.OAUTH_SIGNING_KEY);

  const refreshToken = createRefreshToken(codePayload.user_id);
  const refreshTokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await storeRefreshToken(env, codePayload.user_id, {
    token_hash: refreshTokenHash,
    dpop_jkt: dpopJkt || null,
    grant_id: codePayload.grant_id,
    app_id: codePayload.app_id,
    expires_at: expiresAt
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: dpopJkt ? 'DPoP' : 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: scopes.join(' ')
  };
}

export async function handleDPoPNonce(_request, env) {
  return jsonResponse({ nonce: await dpopNonce(env) });
}

export async function handleOAuthToken(request, env) {
  const data = await request.json();
  let dpopJkt = null;
  if (request.headers.has('dpop')) {
    try { dpopJkt = await verifyDPoP(request, env); }
    catch { return jsonResponse({ error: 'invalid_dpop_proof' }, 400); }
  }

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

    const scopes = tokenScopes(data.scope, codePayload.scopes);
    if (!scopes) {
      return jsonResponse({ error: 'invalid_scope' }, 400);
    }

    if (codePayload.dpop_jkt && codePayload.dpop_jkt !== dpopJkt) return jsonResponse({ error: 'invalid_dpop_proof' }, 400);
    if (!await redeemCode(env, codePayload)) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    return jsonResponse(await issueTokenPair(env, codePayload, scopes, dpopJkt));
  }

  if (data.grant_type === 'refresh_token') {
    if (typeof data.client_id !== 'string' || !data.client_id) {
      return jsonResponse({ error: 'invalid_client' }, 400);
    }
    const app = await getApplication(env, data.client_id);
    if (!app || app.status !== 'active') return jsonResponse({ error: 'invalid_client' }, 400);
    const userId = extractRefreshTokenUserId(data.refresh_token);
    if (!userId) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    // A narrower request applies to this access token only; the refresh token keeps the grant's scopes
    const requestedScopes = data.scope ? parseScopes(data.scope, 'oauth') : undefined;
    if (requestedScopes === null || requestedScopes?.length === 0) {
      return jsonResponse({ error: 'invalid_scope' }, 400);
    }

    const refreshTokenHash = await sha256Hex(data.refresh_token || '');
    const newRefreshToken = createRefreshToken(userId);
    const rotated = await rotateRefreshToken(env, userId, {
      client_id: data.client_id,
      dpop_jkt: dpopJkt,
      current_token_hash: refreshTokenHash,
      new_token_hash: await sha256Hex(newRefreshToken),
      new_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      requested_scopes: requestedScopes
    });

    if (rotated?.error) {
      return jsonResponse({ error: rotated.error }, 400);
    }
    if (!rotated) {
      return jsonResponse({ error: 'invalid_grant' }, 400);
    }

    const scopes = requestedScopes || rotated.scopes;

    const accessToken = await signOAuthJwt({
      token_type: 'access',
      ...(rotated.dpop_jkt ? { cnf: { jkt: rotated.dpop_jkt } } : {}),
      grant_id: rotated.grant_id,
      app_id: rotated.app_id,
      user_id: rotated.user_id,
      scopes,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS
    }, env.OAUTH_SIGNING_KEY);

    return jsonResponse({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: rotated.dpop_jkt ? 'DPoP' : 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: scopes.join(' ')
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
  const grantsResponse = await profileStub.fetch(new Request('http://internal/oauth/grants'));
  if (!grantsResponse.ok) {
    return grantsResponse;
  }

  const grantsData = await grantsResponse.json();
  const authorizations = await Promise.all((grantsData.authorizations || []).map(async (authorization) => {
    const app = await getApplication(env, authorization.app_id);
    return {
      ...authorization,
      app_name: app?.app_name || authorization.app_id,
      redirect_uris: app?.redirect_uris || [],
      website_url: app?.website_url || null,
      logo_url: app?.logo_url || null
    };
  }));

  return jsonResponse({ authorizations, security_events: grantsData.security_events || [] });
}

/**
 * DELETE /api/account/authorizations/:id — a grant ID revokes that grant, an app ID every grant the app holds
 */
export async function handleRevokeAllAuthorizations(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;
  const stub = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(authResult.user.userId));
  return stub.fetch(new Request('http://internal/oauth/grants', { method: 'DELETE' }));
}

export async function handleRevokeAuthorization(request, env, id) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const profileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  return profileStub.fetch(new Request(`http://internal/oauth/grants/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }));
}

/**
 * PATCH /api/account/authorizations/:grantId — narrow an app's scopes or tighten its limits
 * Body: { scopes?, caveats? }
 */
export async function handleUpdateAuthorization(request, env, grantId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  let data;
  try {
    data = await request.json();
  } catch (_error) {
    return jsonResponse({ error: 'invalid_request', message: 'Request body must be valid JSON' }, 400);
  }

  const update = {};
  if (data.scopes !== undefined) {
    const scopes = parseScopes(data.scopes, 'oauth');
    if (!scopes || scopes.length === 0) {
      return jsonResponse({ error: 'invalid_scope', message: 'scopes must be a non-empty list of scopes' }, 400);
    }
    update.scopes = scopes;
  }
  if (data.caveats !== undefined) {
    const { caveats, error } = parseCaveats(data.caveats, 'oauth');
    if (error) {
      return jsonResponse({ error: 'invalid_request', message: error }, 400);
    }
    update.caveats = caveats;
  }

  const profileStub = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(authResult.user.userId));
  return profileStub.fetch(new Request(`http://internal/oauth/grants/${encodeURIComponent(grantId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update)
  }));
}

export async function handleOAuthRevoke(request, env) {
  const data = await request.json();
  const token = data.token;

  if (data.token_type_hint === 'refresh_token') {
    const userId = extractRefreshTokenUserId(token);
    if (!userId) {
      return new Response(null, { status: 200 });
    }

    const profileId = env.USER_PROFILES.idFromName(userId);
    const profileStub = env.USER_PROFILES.get(profileId);
    await profileStub.fetch(new Request('http://internal/oauth/refresh-tokens/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token_hash: await sha256Hex(token)
      })
    }));
    return new Response(null, { status: 200 });
  }

  try {
    const payload = await verifyOAuthJwt(token, env.OAUTH_SIGNING_KEY);
    const profileId = env.USER_PROFILES.idFromName(payload.user_id);
    const profileStub = env.USER_PROFILES.get(profileId);
    await profileStub.fetch(new Request(`http://internal/oauth/grants-by-id/${payload.grant_id}`, {
      method: 'POST'
    }));
  } catch (_error) {
    // OAuth revocation is intentionally idempotent and quiet.
  }

  return new Response(null, { status: 200 });
}
