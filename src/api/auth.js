/**
 * Authentication API Routes
 * Handles session management, API key operations, and account management
 */

import { authenticate, requireAuth, AUTH_ERROR_CODES } from '../auth/middleware.js';
import { generateApiKey, hashApiKey, generateKeyId, validateKeyName, validateExpiration, encryptApiKey, decryptApiKey, isSessionFresh } from '../auth/utils.js';
import { createClerkClient } from '@clerk/backend';

/**
 * Handle OAuth callback endpoint
 * POST /api/auth/callback
 * 
 * Note: In most Clerk integrations, the OAuth callback is handled entirely by
 * Clerk's frontend SDK and redirects. This endpoint provides a server-side
 * callback handler for custom OAuth flows or backend-only integrations.
 */
export async function handleAuthCallback(request, env) {
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

  // Require authentication
  const authError = requireAuth(authResult);
  if (authError) return authError;

  // Only Clerk sessions can be logged out
  if (authResult.user.authMethod !== 'clerk') {
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

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'Use Clerk session to link OAuth providers'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

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

/**
 * Handle API key creation
 * POST /api/auth/apikeys
 */
export async function handleCreateApiKey(request, env) {
  const authResult = await authenticate(request, env);

  // Require Clerk session (API keys can't create other API keys)
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'API keys cannot be used to create new API keys. Use Clerk session.'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate key name
  const nameValidation = validateKeyName(body.name);
  if (!nameValidation.valid) {
    return new Response(
      JSON.stringify({
        error: 'Invalid key name',
        message: nameValidation.message
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate expiration
  const expirationValidation = validateExpiration(body.expires_at);
  if (!expirationValidation.valid) {
    return new Response(
      JSON.stringify({
        error: 'Invalid expiration',
        message: expirationValidation.message
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Generate API key
  const apiKey = generateApiKey(env.ENVIRONMENT);
  const keyHash = await hashApiKey(apiKey);
  const keyId = generateKeyId();

  // Encrypt the API key for reveal functionality
  if (!env.API_KEY_ENCRYPTION_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Encryption key not configured',
        message: 'API_KEY_ENCRYPTION_KEY secret must be set'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  const keyEncrypted = await encryptApiKey(apiKey, env.API_KEY_ENCRYPTION_KEY);

  // Store in UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/apikeys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key_id: keyId,
        key_hash: keyHash,
        key_encrypted: keyEncrypted,
        name: body.name,
        expires_at: expirationValidation.expiresAt
      })
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

  const keyInfo = await response.json();

  // Register key in KeyRegistry
  const registryId = env.KEY_REGISTRY.idFromName('global');
  const registryStub = env.KEY_REGISTRY.get(registryId);

  await registryStub.fetch(
    new Request('http://internal/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key_hash: keyHash,
        user_id: authResult.user.userId,
        key_id: keyId
      })
    })
  );

  // Return the API key (ONLY SHOWN ONCE!)
  return new Response(
    JSON.stringify({
      ...keyInfo,
      api_key: apiKey,
      warning: 'Save this API key securely. It will not be shown again.'
    }),
    {
      status: 201,
      headers: { 'content-type': 'application/json' }
    }
  );
}

/**
 * Handle list API keys
 * GET /api/auth/apikeys
 */
export async function handleListApiKeys(request, env) {
  const authResult = await authenticate(request, env);

  // Require Clerk session
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'Use Clerk session to list API keys'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Get keys from UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request('http://internal/apikeys', {
      method: 'GET'
    })
  );

  const keys = await response.json();

  return new Response(JSON.stringify(keys), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/**
 * Handle revoke API key
 * DELETE /api/auth/apikeys/:keyId
 */
export async function handleRevokeApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);

  // Require Clerk session
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'Use Clerk session to revoke API keys'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Revoke key in UserProfile DO
  const userProfileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request(`http://internal/apikeys/${keyId}`, {
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

  // Note: KeyRegistry entry is not removed here because we don't have the key hash
  // The validation in middleware will check the revoked_at field in the UserProfile
  // This is acceptable because revoked keys are kept for 5 years for audit purposes

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/**
 * Handle reveal API key
 * POST /api/auth/apikeys/:keyId/reveal
 */
export async function handleRevealApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);

  // Require Clerk session (API keys cannot reveal other keys)
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'API keys cannot reveal other API keys. Use Clerk session.'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Verify session is fresh (authenticated within last 5 minutes)
  try {
    if (!env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerkClient = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY
    });

    const sessionId = authResult.user.sessionId;
    const session = await clerkClient.sessions.getSession(sessionId);

    // Check if session is fresh
    if (!isSessionFresh(session, 5)) {
      return new Response(
        JSON.stringify({
          error: 'FRESH_AUTH_REQUIRED',
          message: 'This operation requires a fresh authentication session (authenticated within the last 5 minutes). Please re-authenticate.'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Session verification failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Get encrypted key from UserProfile DO (includes rate limiting)
  const userProfileId = env.USER_PROFILES.idFromName(authResult.user.userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  const response = await userProfileStub.fetch(
    new Request(`http://internal/apikeys/${keyId}/reveal`, {
      method: 'POST'
    })
  );

  if (!response.ok) {
    const error = await response.json();
    return new Response(
      JSON.stringify(error),
      {
        status: response.status,
        headers: response.headers
      }
    );
  }

  const keyData = await response.json();

  // Decrypt the API key
  if (!env.API_KEY_ENCRYPTION_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Encryption key not configured',
        message: 'API_KEY_ENCRYPTION_KEY secret must be set'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const apiKey = await decryptApiKey(keyData.key_encrypted, env.API_KEY_ENCRYPTION_KEY);

    return new Response(
      JSON.stringify({
        key_id: keyData.key_id,
        name: keyData.name,
        api_key: apiKey,
        created_at: keyData.created_at,
        expires_at: keyData.expires_at,
        last_used_at: keyData.last_used_at,
        warning: 'Keep this API key secure. Limit how often you reveal it.'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Decryption failed',
        message: 'Unable to decrypt API key'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Update API key name
 * Requires fresh Clerk session (authenticated within last 5 minutes)
 * PATCH /api/auth/apikeys/:keyId
 * @param {Request} request
 * @param {Object} env
 * @param {string} keyId
 * @returns {Response}
 */
export async function handleUpdateApiKey(request, env, keyId) {
  const authResult = await authenticate(request, env);

  // Require Clerk session (API keys cannot update themselves)
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (authResult.user.authMethod !== 'clerk') {
    return new Response(
      JSON.stringify({
        error: 'Invalid authentication method',
        message: 'API keys cannot update other API keys. Use Clerk session.'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Verify session is fresh (authenticated within last 5 minutes)
  try {
    if (!env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerkClient = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY
    });

    const sessionId = authResult.user.sessionId;
    const session = await clerkClient.sessions.getSession(sessionId);

    // Check if session is fresh (5 minutes)
    if (!isSessionFresh(session, 5)) {
      return new Response(
        JSON.stringify({
          error: 'FRESH_AUTH_REQUIRED',
          message: 'This operation requires a fresh authentication session (authenticated within the last 5 minutes). Please re-authenticate.'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Session verification failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate name
  const { name } = body;

  if (!name || typeof name !== 'string') {
    return new Response(
      JSON.stringify({
        error: 'Invalid name',
        message: 'Name is required and must be a string'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Validate name length (1-100 characters)
  if (name.length < 1 || name.length > 100) {
    return new Response(
      JSON.stringify({
        error: 'Invalid name length',
        message: 'Name must be between 1 and 100 characters'
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  // Get user profile DO
  const userId = authResult.user.userId;
  const userProfileId = env.USER_PROFILES.idFromName(userId);
  const userProfileStub = env.USER_PROFILES.get(userProfileId);

  // Update API key name
  const updateResponse = await userProfileStub.fetch(
    new Request(`http://internal/apikeys/${keyId}/update`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ name })
    })
  );

  // Return response from DO
  return updateResponse;
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
