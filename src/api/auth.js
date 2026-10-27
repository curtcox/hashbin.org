/**
 * Authentication API Routes
 * Handles session management, API key operations, and account management
 */

import { generateApiKey } from '../auth/download-tokens.js';
import { validDownloadCaps } from '../utils/download-budget.js';
import { authenticate, requireAuth } from '../auth/middleware.js';
import { ALL_USER_SCOPES, parseScopes } from '../auth/scopes.js';
import { hashApiKey, generateKeyId, validateKeyName, validateExpiration, isSessionFresh } from '../auth/utils.js';
import { createClerkClient } from '@clerk/backend';

/**
 * Handle OAuth callback endpoint
 * POST /api/auth/callback
 * 
 * Note: In most Clerk integrations, the OAuth callback is handled entirely by
 * Clerk's frontend SDK and redirects. This endpoint provides a server-side
 * callback handler for custom OAuth flows or backend-only integrations.
 */
export async function handleAuthCallback(_request, _env) {
  try {
    // In a typical Clerk setup, the OAuth flow is handled by the Clerk frontend SDK
    // This endpoint is provided for completeness but may not be used in standard flows
    
    // The callback would typically contain authorization codes or tokens
    // that need to be exchanged with Clerk's backend
    
    return new Response(
      JSON.stringify({
        error: 'Not implemented',
        message: 'OAuth callbacks are typically handled by Clerk frontend SDK. For backend-only flows, use Clerk Backend API directly.'
      }),
      {
        status: 501,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Callback processing failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Handle session info endpoint
 * GET /api/auth/session
 */
export async function handleSessionInfo(request, env) {
  const authResult = await authenticate(request, env);

  // Require authentication
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const user = authResult.user;

  // If profile doesn't exist yet, create it
  if (user.authMethod === 'clerk' && user.profileExists === false) {
    const userProfileId = env.USER_PROFILES.idFromName(user.userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);

    await userProfileStub.fetch(
      new Request('http://internal/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: user.userId,
          providers: []
        })
      })
    );
  }

  return new Response(
    JSON.stringify({
      user_id: user.userId,
      auth_method: user.authMethod,
      session_id: user.sessionId || null,
      profile: user.profile || null
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}

/**
 * Handle logout endpoint
 * POST /api/auth/logout
 * 
 * Invalidates the current Clerk session
 */
export async function handleLogout(request, env) {
  const authResult = await authenticate(request, env);
  const isLocalMode = env.ENVIRONMENT === 'local';

  // Require authentication
  const authError = requireAuth(authResult);
  if (authError) return authError;

  // Only Clerk sessions can be logged out
  if (authResult.user.authMethod !== 'clerk') {
    if (isLocalMode && authResult.user.authMethod === 'local') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Local session cleared'
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'Only Clerk sessions can be logged out. API keys must be revoked instead.'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    // Verify Clerk secret is configured
    if (!env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    // Create Clerk client
    const clerkClient = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY
    });

    // Revoke the session using Clerk Backend API
    // Note: The sessionId was extracted during authentication
    const sessionId = authResult.user.sessionId;
    
    if (sessionId && typeof sessionId === 'string' && sessionId.length > 0) {
      try {
        await clerkClient.sessions.revokeSession(sessionId);
      } catch (clerkError) {
        // Log specific Clerk API errors for debugging (without sensitive data)
        if (env.LOG_LEVEL === 'debug' && env.ENVIRONMENT !== 'production') {
          console.error('Clerk API error during logout:', {
            sessionId: sessionId.substring(0, 8) + '...', // Truncated for security
            error: clerkError.message || 'Unknown error',
            status: clerkError.status || 'unknown'
          });
        }
        // Re-throw to be handled by outer catch
        throw clerkError;
      }
    } else {
      // No valid sessionId to revoke, but that's okay
      // User might have already logged out or session might have expired
      if (env.LOG_LEVEL === 'debug' && env.ENVIRONMENT !== 'production') {
        console.warn('Logout called without valid sessionId');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Session logged out successfully'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    // Log error with minimal context for debugging (avoid sensitive data in production)
    if (env.ENVIRONMENT !== 'production') {
      const userId = authResult.user?.userId;
      console.error('Logout error:', {
        error: error.message || 'Unknown error',
        userId: userId && typeof userId === 'string' ? userId.substring(0, 8) + '...' : 'unknown'
      });
    } else {
      // Production: log only non-sensitive error info
      console.error('Logout error:', error.message || 'Unknown error');
    }
    
    // Return success to avoid information leakage about session validity
    // Even if revocation fails, the frontend can clear the token locally
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Logout processed'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Handle OAuth provider linking endpoint
 * POST /api/auth/link
 * 
 * Links additional OAuth provider to existing account
 */
export async function handleLinkProvider(request, env) {
  const authResult = await authenticate(request, env);

  // Require Clerk session
  const authError = requireAuth(authResult);
  if (authError) return authError;

  // In Clerk's architecture, OAuth provider linking is handled by the frontend SDK
  // The user initiates the OAuth flow in the browser, and Clerk handles the linking
  // automatically. The webhook (user.updated) will then notify this backend.
  
  // This endpoint serves as a placeholder/documentation endpoint
  return new Response(
    JSON.stringify({
      error: 'Not implemented',
      message: 'OAuth provider linking is handled by Clerk frontend SDK. Use Clerk Components or SignIn/SignUp components with the "Link Account" option. After successful linking, the user.updated webhook will update the backend profile automatically.'
    }),
    {
      status: 501,
      headers: { 'content-type': 'application/json' }
    }
  );
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function userProfileStub(env, userId) {
  return env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId));
}

/**
 * Default key name: "Key", then "Key 2", "Key 3"...
 */
async function defaultKeyName(stub) {
  try {
    const response = await stub.fetch(new Request('http://internal/apikeys', { method: 'GET' }));
    const names = response.ok ? (await response.json()).map(key => key.name) : [];
    if (!names.includes('Key')) return 'Key';
    let n = 2;
    while (names.includes(`Key ${n}`)) n++;
    return `Key ${n}`;
  } catch (_error) {
    return 'Key';
  }
}

/**
 * Handle API key creation
 * POST /api/auth/apikeys (session only; enforced by the route table)
 *
 * Body: { name?, scopes, expires_at?, download_budget? }. A key holds only the
 * scopes named here, and is shown once: only its hash is stored.
 */
export async function handleCreateApiKey(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid request body', message: 'Request body must be valid JSON' }, 400);
  }

  const stub = userProfileStub(env, authResult.user.userId);
  const keyName = typeof body.name === 'string' && body.name.trim() !== '' ? body.name : await defaultKeyName(stub);
  const nameValidation = validateKeyName(keyName);
  if (!nameValidation.valid) {
    return jsonResponse({ error: 'Invalid key name', message: nameValidation.message }, 400);
  }

  const scopes = parseScopes(body.scopes, 'key');
  if (!scopes || scopes.length === 0) {
    return jsonResponse({
      error: 'Invalid scopes',
      message: `scopes must be a non-empty list drawn from: ${ALL_USER_SCOPES.join(', ')}`
    }, 400);
  }

  const expirationValidation = validateExpiration(body.expires_at);
  if (!expirationValidation.valid) {
    return jsonResponse({ error: 'Invalid expiration', message: expirationValidation.message }, 400);
  }

  if (!env.DOWNLOAD_TOKEN_SECRET) {
    return jsonResponse({ error: 'DOWNLOAD_TOKEN_SECRET must be configured before creating keys' }, 503);
  }
  if (body.download_budget !== undefined && !validDownloadCaps(body.download_budget)) {
    return jsonResponse({ error: 'Invalid download caps' }, 400);
  }

  const keyId = generateKeyId();
  const apiKey = await generateApiKey(authResult.user.userId, keyId, env.DOWNLOAD_TOKEN_SECRET);

  const response = await stub.fetch(new Request('http://internal/apikeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key_id: keyId,
      key_hash: await hashApiKey(apiKey),
      download_budget: body.download_budget,
      name: keyName,
      scopes,
      expires_at: expirationValidation.expiresAt
    })
  }));

  if (!response.ok) {
    return jsonResponse(await response.json(), response.status);
  }

  // The key itself is returned only here
  return jsonResponse({
    ...(await response.json()),
    api_key: apiKey,
    warning: 'Save this API key securely. It cannot be shown again.'
  }, 201);
}

/**
 * Handle list API keys
 * GET /api/auth/apikeys (session only)
 */
export async function handleListApiKeys(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const response = await userProfileStub(env, authResult.user.userId).fetch(
    new Request('http://internal/apikeys', { method: 'GET' })
  );
  return jsonResponse(await response.json(), response.status);
}

/**
 * Handle revoke API key
 * DELETE /api/auth/apikeys/:keyId (session only)
 */
export async function handleRevokeApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const response = await userProfileStub(env, authResult.user.userId).fetch(
    new Request(`http://internal/apikeys/${encodeURIComponent(keyId)}`, { method: 'DELETE' })
  );
  return jsonResponse(await response.json(), response.status);
}

/**
 * Rename an API key or narrow its scopes (never widen them)
 * PATCH /api/auth/apikeys/:keyId (session only; Clerk sessions must be fresh)
 * Body: { name?, scopes? }
 */
export async function handleUpdateApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  // Verify session is fresh (authenticated within last 5 minutes)
  if (authResult.user.authMethod === 'clerk') {
    try {
      if (!env.CLERK_SECRET_KEY) {
        throw new Error('CLERK_SECRET_KEY not configured');
      }
      const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const session = await clerkClient.sessions.getSession(authResult.user.sessionId);
      if (!isSessionFresh(session, 5)) {
        return jsonResponse({
          error: 'FRESH_AUTH_REQUIRED',
          message: 'This operation requires a fresh authentication session (authenticated within the last 5 minutes). Please re-authenticate.'
        }, 403);
      }
    } catch (error) {
      return jsonResponse({ error: 'Session verification failed', message: error.message }, 500);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid request body', message: 'Request body must be valid JSON' }, 400);
  }

  const update = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
      return jsonResponse({ error: 'Invalid name', message: 'Name must be a string of 1 to 100 characters' }, 400);
    }
    update.name = body.name;
  }
  if (body.scopes !== undefined) {
    const scopes = parseScopes(body.scopes, 'key');
    if (!scopes || scopes.length === 0) {
      return jsonResponse({ error: 'Invalid scopes', message: 'scopes must be a non-empty list of user scopes' }, 400);
    }
    update.scopes = scopes;
  }
  if (Object.keys(update).length === 0) {
    return jsonResponse({ error: 'Nothing to update', message: 'Provide name or scopes' }, 400);
  }

  return userProfileStub(env, authResult.user.userId).fetch(
    new Request(`http://internal/apikeys/${encodeURIComponent(keyId)}/update`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update)
    })
  );
}

/**
 * Handle account deletion
 * DELETE /api/auth/account
 */
export async function handleDeleteAccount(request, env) {
  const authResult = await authenticate(request, env);

  // Require Clerk session
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'Use Clerk session to delete account'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Parse request body for confirmation
  // Note: Step-up authentication approach - user must re-authenticate with 2FA
  // before calling this endpoint. We validate the session is fresh, not a TOTP token.
  let body;
  try {
    body = await request.json();
  } catch (error) {
    body = {};
  }

  // Verify 2FA via step-up authentication approach
  // For sensitive operations like account deletion, Clerk recommends requiring
  // "step-up authentication" where the user must re-authenticate recently with 2FA.
  // The frontend should handle prompting for re-authentication if the session is stale.
  
  if (!body.confirmed || body.confirmed !== true) {
    return new Response(
      JSON.stringify({
        error: 'Confirmation required',
        message: 'Account deletion requires explicit confirmation'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Verify 2FA via step-up authentication approach
  // For sensitive operations like account deletion, Clerk recommends requiring
  // "step-up authentication" where the user must re-authenticate recently with 2FA.
  // The frontend should handle prompting for re-authentication if the session is stale.
  try {
    const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const clerkUser = await clerkClient.users.getUser(authResult.user.userId);
    
    // Check if user has TOTP (Time-based One-Time Password) 2FA enabled
    // Note: Clerk may use different properties (totpEnabled, twoFactorEnabled)
    // depending on the version. We check both for compatibility.
    const hasTOTP = clerkUser.totpEnabled || clerkUser.twoFactorEnabled || false;
    
    if (hasTOTP) {
      // If 2FA is enabled, verify the session is "fresh" (recently authenticated with 2FA)
      // This implements the "step-up authentication" pattern recommended by Clerk
      const sessionId = authResult.user.sessionId;
      const session = await clerkClient.sessions.getSession(sessionId);
      
      // Check session status
      if (session.status !== 'active') {
        return new Response(
          JSON.stringify({
            error: 'Invalid session',
            message: 'Session is not active. Please re-authenticate.',
            totp_enabled: true
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      
      // Verify session freshness (within 5 minutes)
      // A fresh session ensures the user has recently completed 2FA authentication
      const lastActiveAt = new Date(session.lastActiveAt);
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      if (lastActiveAt < fiveMinutesAgo) {
        return new Response(
          JSON.stringify({
            error: 'Re-authentication required',
            message: 'For security with 2FA enabled, please re-authenticate within the last 5 minutes before deleting your account. The frontend should prompt for re-authentication.',
            totp_enabled: true,
            requires_fresh_session: true
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      
      // Verify that the session was created with 2FA authentication
      // Note: The exact mechanism to verify 2FA completion depends on Clerk's
      // session object structure. In production, this should be validated against
      // Clerk's actual API response. For now, we rely on session freshness and
      // active status as indicators that 2FA was recently completed.
      // 
      // Clerk sessions created with 2FA will have appropriate metadata.
      // If the session is fresh and active, we can reasonably assume 2FA was used.
      // 
      // Future improvement: Check specific Clerk session properties that
      // explicitly indicate 2FA completion (e.g., factorVerificationStatus)
    }
  } catch (error) {
    // If Clerk API call fails, log the error but allow deletion to proceed
    // This prevents Clerk service outages from permanently blocking account deletion
    // However, we only do this if CLERK_SECRET_KEY is not configured (development mode)
    if (!env.CLERK_SECRET_KEY) {
      console.warn('CLERK_SECRET_KEY not configured, skipping 2FA verification');
    } else {
      console.error('Error verifying 2FA status:', error.message);
      return new Response(
        JSON.stringify({
          error: 'Verification failed',
          message: 'Unable to verify 2FA status. Please try again.'
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  }

  // Delete profile in UserProfile DO (soft delete)
  const userProfileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/profile', {
      method: 'DELETE'
    })
  );

  if (!response.ok) {
    const error = await response.json();
    return new Response(
      JSON.stringify(error),
      {
        status: response.status,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  const result = await response.json();

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
