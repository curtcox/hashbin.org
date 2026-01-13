/**
 * Authentication and Authorization Middleware
 * Handles Clerk session validation and API key authentication
 */

import { verifyToken } from '@clerk/backend';
import { hashApiKey, validateApiKeyFormat } from './utils.js';

// Error codes for authentication failures
export const AUTH_ERROR_CODES = {
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_INVALID_FORMAT: 'AUTH_INVALID_FORMAT',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_REVOKED: 'AUTH_REVOKED',
  AUTH_USER_DELETED: 'AUTH_USER_DELETED',
  AUTH_ENV_MISMATCH: 'AUTH_ENV_MISMATCH',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
  AUTH_KEY_LIMIT: 'AUTH_KEY_LIMIT'
};

// Rate limiting windows (in milliseconds)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const ANONYMOUS_RATE_LIMIT = 100;
const USER_RATE_LIMIT = 1000;
const KEY_RATE_LIMIT = 500;

// In-memory rate limiting cache (simple implementation)
// In production, this could be stored in Durable Objects or KV
const rateLimitCache = new Map();

/**
 * Extract authentication from request headers
 * Supports:
 * - Authorization: Bearer <clerk-jwt>
 * - Authorization: ApiKey <api-key>
 * - X-API-Key: <api-key>
 */
function extractAuth(request) {
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
      return { type: 'invalid', value: null };
    }

    const [scheme, value] = parts;
    const normalizedScheme = scheme.toLowerCase();

    if (normalizedScheme === 'bearer') {
      return { type: 'clerk', value };
    } else if (normalizedScheme === 'apikey') {
      return { type: 'apikey', value };
    } else {
      return { type: 'invalid', value: null };
    }
  }

  if (apiKeyHeader) {
    return { type: 'apikey', value: apiKeyHeader };
  }

  return { type: 'none', value: null };
}

/**
 * Validate Clerk JWT token
 */
async function validateClerkToken(token, env) {
  try {
    if (!env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      // Clerk automatically handles expiration checking
    });

    return {
      valid: true,
      userId: payload.sub,
      sessionId: payload.sid,
      error: null
    };
  } catch (error) {
    // Check for specific error types
    if (error.message.includes('expired')) {
      return {
        valid: false,
        error: AUTH_ERROR_CODES.AUTH_EXPIRED,
        message: 'Token has expired'
      };
    }

    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'Invalid token format'
    };
  }
}

/**
 * Validate API key against UserProfile Durable Object
 */
async function validateApiKey(apiKey, env) {
  // Validate format first
  const formatValidation = validateApiKeyFormat(apiKey, env.ENVIRONMENT);
  if (!formatValidation.valid) {
    return {
      valid: false,
      error: formatValidation.error,
      message: formatValidation.message
    };
  }

  // Hash the key for lookup
  const keyHash = await hashApiKey(apiKey);

  // We need to find which user owns this key
  // For now, we'll store a mapping in a special DO
  // In a real implementation, you might want a KeyRegistry DO
  // For this implementation, we'll iterate through user profiles (not scalable)
  // A better approach would be to have a KeyRegistry DO that maps key hashes to user IDs

  // TODO: Implement KeyRegistry DO for efficient key lookup
  // For now, return a placeholder that requires the user to be known
  return {
    valid: false,
    error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
    message: 'Key registry not yet implemented'
  };
}

/**
 * Check rate limits for a given identifier
 */
function checkRateLimit(identifier, limit) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Get or create rate limit entry
  let entry = rateLimitCache.get(identifier);
  if (!entry) {
    entry = { requests: [], windowStart: now };
    rateLimitCache.set(identifier, entry);
  }

  // Remove old requests outside the window
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

  // Check if limit exceeded
  if (entry.requests.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.requests[0] + RATE_LIMIT_WINDOW
    };
  }

  // Add current request
  entry.requests.push(now);

  return {
    allowed: true,
    remaining: limit - entry.requests.length,
    resetAt: now + RATE_LIMIT_WINDOW
  };
}

/**
 * Main authentication middleware
 * Returns user context or null for anonymous requests
 */
export async function authenticate(request, env) {
  const auth = extractAuth(request);

  // No authentication provided
  if (auth.type === 'none') {
    return {
      authenticated: false,
      user: null,
      error: null
    };
  }

  // Invalid authentication format
  if (auth.type === 'invalid') {
    return {
      authenticated: false,
      user: null,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT
    };
  }

  // Clerk JWT token
  if (auth.type === 'clerk') {
    const validation = await validateClerkToken(auth.value, env);
    if (!validation.valid) {
      return {
        authenticated: false,
        user: null,
        error: validation.error
      };
    }

    // Fetch user profile from UserProfile DO
    const userId = validation.userId;
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);

    try {
      const response = await userProfileStub.fetch(
        new Request('http://internal/profile', {
          method: 'GET'
        })
      );

      if (!response.ok) {
        if (response.status === 404) {
          // User profile doesn't exist yet, create it
          // This happens on first login after Clerk webhook
          return {
            authenticated: true,
            user: {
              userId,
              sessionId: validation.sessionId,
              authMethod: 'clerk',
              profileExists: false
            },
            error: null
          };
        }

        return {
          authenticated: false,
          user: null,
          error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT
        };
      }

      const profile = await response.json();

      // Check if user is deleted
      if (profile.deleted_at) {
        return {
          authenticated: false,
          user: null,
          error: AUTH_ERROR_CODES.AUTH_USER_DELETED
        };
      }

      return {
        authenticated: true,
        user: {
          userId: profile.user_id,
          sessionId: validation.sessionId,
          authMethod: 'clerk',
          profile
        },
        error: null
      };
    } catch (error) {
      return {
        authenticated: false,
        user: null,
        error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT
      };
    }
  }

  // API Key authentication
  if (auth.type === 'apikey') {
    const validation = await validateApiKey(auth.value, env);
    if (!validation.valid) {
      return {
        authenticated: false,
        user: null,
        error: validation.error
      };
    }

    return {
      authenticated: true,
      user: {
        userId: validation.userId,
        keyId: validation.keyId,
        authMethod: 'apikey',
        profile: validation.profile
      },
      error: null
    };
  }

  return {
    authenticated: false,
    user: null,
    error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT
  };
}

/**
 * Enforce authentication requirement
 * Returns 401 response if not authenticated
 */
export function requireAuth(authResult) {
  if (!authResult.authenticated) {
    const errorCode = authResult.error || AUTH_ERROR_CODES.AUTH_MISSING;
    return new Response(
      JSON.stringify({
        error: errorCode,
        message: getErrorMessage(errorCode)
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  return null;
}

/**
 * Apply rate limiting based on user context
 */
export function applyRateLimit(request, authResult) {
  let identifier, limit;

  if (authResult.authenticated) {
    if (authResult.user.authMethod === 'apikey') {
      // Per-key rate limit
      identifier = `key:${authResult.user.keyId}`;
      limit = KEY_RATE_LIMIT;
    } else {
      // Per-user rate limit
      identifier = `user:${authResult.user.userId}`;
      limit = USER_RATE_LIMIT;
    }
  } else {
    // Anonymous rate limit by IP
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    identifier = `anon:${ip}`;
    limit = ANONYMOUS_RATE_LIMIT;
  }

  const result = checkRateLimit(identifier, limit);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: AUTH_ERROR_CODES.AUTH_RATE_LIMITED,
        message: 'Rate limit exceeded',
        retry_after: retryAfter
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': retryAfter.toString(),
          'x-ratelimit-limit': limit.toString(),
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': Math.floor(result.resetAt / 1000).toString()
        }
      }
    );
  }

  return null;
}

/**
 * Get human-readable error message for error code
 */
function getErrorMessage(errorCode) {
  const messages = {
    [AUTH_ERROR_CODES.AUTH_MISSING]: 'Authentication required',
    [AUTH_ERROR_CODES.AUTH_INVALID_FORMAT]: 'Invalid authentication format',
    [AUTH_ERROR_CODES.AUTH_EXPIRED]: 'Authentication token expired',
    [AUTH_ERROR_CODES.AUTH_REVOKED]: 'API key has been revoked',
    [AUTH_ERROR_CODES.AUTH_USER_DELETED]: 'User account has been deleted',
    [AUTH_ERROR_CODES.AUTH_ENV_MISMATCH]: 'API key environment mismatch',
    [AUTH_ERROR_CODES.AUTH_RATE_LIMITED]: 'Rate limit exceeded',
    [AUTH_ERROR_CODES.AUTH_KEY_LIMIT]: 'Maximum API keys limit reached'
  };
  return messages[errorCode] || 'Authentication failed';
}
