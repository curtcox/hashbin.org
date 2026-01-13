/**
 * Authentication API Routes
 * Handles session management, API key operations, and account management
 */

import { authenticate, requireAuth, AUTH_ERROR_CODES } from '../auth/middleware.js';
import { generateApiKey, hashApiKey, generateKeyId, validateKeyName, validateExpiration } from '../auth/utils.js';

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

  // Parse request body for 2FA confirmation
  let body;
  try {
    body = await request.json();
  } catch (error) {
    body = {};
  }

  // TODO: Implement actual 2FA verification with Clerk
  // For now, require a confirmation field
  if (!body.confirmed || body.confirmed !== true) {
    return new Response(
      JSON.stringify({
        error: 'Confirmation required',
        message: '2FA confirmation required for account deletion'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
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
