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
const SCOPE_DESCRIPTIONS = {
  'content:write': 'Publish immutable content using your account balance and default retention.',
  'content:read': 'Check whether content exists and inspect metadata.',
  'balance:read': 'Read your current account balance before publishing.'
};

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8'
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

function validateAuthorizeRequest(data, app) {
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

  const scopes = parseScopes(data.scope);
  if (scopes === null || scopes.length === 0) {
    return { valid: false, error: 'invalid_scope', message: 'At least one supported scope is required.' };
  }

  return { valid: true, scopes };
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
  const validation = validateAuthorizeRequest(data, app);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error, message: validation.message }, 400);
  }
  const scopes = validation.scopes;

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

export async function handleGetOAuthAuthorizePage(request, env) {
  const url = new URL(request.url);
  const app = await getApplication(env, url.searchParams.get('client_id'));
  const requestData = {
    client_id: url.searchParams.get('client_id'),
    redirect_uri: url.searchParams.get('redirect_uri'),
    response_type: url.searchParams.get('response_type'),
    scope: url.searchParams.get('scope') || '',
    state: url.searchParams.get('state') || '',
    code_challenge: url.searchParams.get('code_challenge'),
    code_challenge_method: url.searchParams.get('code_challenge_method')
  };
  const validation = validateAuthorizeRequest(requestData, app);

  if (!validation.valid) {
    return htmlResponse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unable to Continue - HashBin.org</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7fb; color: #1f2937; margin: 0; padding: 2rem; }
    .shell { max-width: 720px; margin: 4rem auto; background: white; border-radius: 18px; padding: 2rem; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); }
    .eyebrow { color: #b91c1c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; font-weight: 700; }
    h1 { margin: 0.75rem 0 1rem; font-size: 2rem; }
    p { color: #4b5563; line-height: 1.6; }
    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="eyebrow">Authorization Error</div>
    <h1>Unable to Continue</h1>
    <p>${escapeHtml(validation.message)}</p>
    <p>Error code: <code>${escapeHtml(validation.error)}</code></p>
  </div>
</body>
</html>`, 400);
  }

  const scopesHtml = validation.scopes.map((scope) => `
      <li>
        <strong>${escapeHtml(scope)}</strong>
        <span>${escapeHtml(SCOPE_DESCRIPTIONS[scope] || 'Requested access.')}</span>
      </li>`).join('');

  return htmlResponse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize ${escapeHtml(app.app_name)} - HashBin.org</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #13233a;
      --muted: #5f6f87;
      --paper: #ffffff;
      --sky: #edf6ff;
      --accent: #0f766e;
      --accent-2: #f59e0b;
      --line: #d8e4f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(245,158,11,0.20), transparent 28%),
        radial-gradient(circle at top right, rgba(15,118,110,0.18), transparent 30%),
        linear-gradient(180deg, #f6fbff, #eef4fb 46%, #f8f4eb 100%);
      padding: 2rem;
    }
    .sheet {
      max-width: 880px;
      margin: 2rem auto;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(216,228,242,0.9);
      border-radius: 28px;
      box-shadow: 0 30px 80px rgba(19,35,58,0.12);
      overflow: hidden;
    }
    .hero {
      padding: 2rem 2rem 1rem;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(237,246,255,0.95));
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.78rem;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 0.75rem;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.25rem);
      line-height: 1.05;
    }
    .hero p {
      max-width: 44rem;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1.7;
      margin: 1rem 0 0;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 0;
    }
    .panel {
      padding: 2rem;
    }
    .panel + .panel {
      border-left: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(248,250,252,0.7), rgba(237,246,255,0.55));
    }
    h2 {
      margin: 0 0 1rem;
      font-size: 1.15rem;
      letter-spacing: 0.01em;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.9rem;
    }
    li {
      padding: 1rem 1rem 0.95rem;
      border-radius: 18px;
      background: white;
      border: 1px solid var(--line);
      box-shadow: 0 10px 24px rgba(19,35,58,0.05);
    }
    li strong {
      display: block;
      font-size: 1rem;
      margin-bottom: 0.35rem;
    }
    li span {
      display: block;
      color: var(--muted);
      line-height: 1.55;
      font-size: 0.95rem;
    }
    dl { margin: 0; display: grid; gap: 1rem; }
    dt { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.25rem; }
    dd { margin: 0; font-size: 1rem; line-height: 1.55; word-break: break-word; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.9rem;
      margin-top: 1.5rem;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 0.95rem 1.4rem;
      font-size: 0.98rem;
      font-weight: 700;
      cursor: pointer;
    }
    .approve { background: var(--ink); color: white; }
    .deny { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .status {
      margin-top: 1rem;
      min-height: 1.5rem;
      color: var(--muted);
      font-size: 0.95rem;
    }
    @media (max-width: 860px) {
      body { padding: 1rem; }
      .grid { grid-template-columns: 1fr; }
      .panel + .panel { border-left: none; border-top: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <section class="hero">
      <div class="eyebrow">Third-Party Publishing</div>
      <h1>${escapeHtml(app.app_name)} wants to use your HashBin account.</h1>
      <p>
        Review the requested access below. Approving will let this app publish content with your balance using your current default retention settings.
      </p>
    </section>
    <div class="grid">
      <section class="panel">
        <h2>Requested permissions</h2>
        <ul>${scopesHtml}</ul>
      </section>
      <aside class="panel">
        <h2>App details</h2>
        <dl>
          <div>
            <dt>Application</dt>
            <dd>${escapeHtml(app.app_name)}</dd>
          </div>
          <div>
            <dt>Redirect URI</dt>
            <dd>${escapeHtml(requestData.redirect_uri)}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>${escapeHtml(requestData.state || '(none)')}</dd>
          </div>
        </dl>
        <div class="actions">
          <button class="approve" id="approve-button">Approve access</button>
          <button class="deny" id="deny-button">Deny</button>
        </div>
        <div class="status" id="status-message">Sign in to HashBin if prompted, then approve to continue.</div>
      </aside>
    </div>
  </div>
  <script type="module">
    import { initializeAuth, getAuthHeaders, signIn } from '/js/auth-loader.js';

    const authorizePayload = ${JSON.stringify(requestData)};
    const statusMessage = document.getElementById('status-message');
    const approveButton = document.getElementById('approve-button');
    const denyButton = document.getElementById('deny-button');

    function redirectDenied() {
      const deniedUrl = new URL(authorizePayload.redirect_uri);
      deniedUrl.searchParams.set('error', 'access_denied');
      if (authorizePayload.state) {
        deniedUrl.searchParams.set('state', authorizePayload.state);
      }
      window.location.href = deniedUrl.toString();
    }

    denyButton.addEventListener('click', () => {
      redirectDenied();
    });

    approveButton.addEventListener('click', async () => {
      approveButton.disabled = true;
      statusMessage.textContent = 'Checking your session...';

      try {
        await initializeAuth();
        let authHeaders = await getAuthHeaders();

        if (!authHeaders) {
          statusMessage.textContent = 'Sign-in is required before you can approve this request.';
          await signIn();
          authHeaders = await getAuthHeaders();
        }

        if (!authHeaders) {
          approveButton.disabled = false;
          return;
        }

        statusMessage.textContent = 'Authorizing application...';
        const response = await fetch('/oauth/authorize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify(authorizePayload)
        });

        if (response.redirected) {
          window.location.href = response.url;
          return;
        }

        if (response.status === 302) {
          const location = response.headers.get('location');
          if (location) {
            window.location.href = location;
            return;
          }
        }

        let errorMessage = 'Authorization failed.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (_error) {
          // Ignore JSON parsing errors for non-JSON responses.
        }

        statusMessage.textContent = errorMessage;
        approveButton.disabled = false;
      } catch (error) {
        statusMessage.textContent = error.message || 'Authorization failed.';
        approveButton.disabled = false;
      }
    });
  </script>
</body>
</html>`);
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

  return jsonResponse({ authorizations });
}

export async function handleRevokeAuthorization(request, env, appId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const profileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const profileStub = env.USER_PROFILES.get(profileId);
  return profileStub.fetch(new Request(`http://internal/oauth/grants/${appId}`, {
    method: 'DELETE'
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
