/**
 * Admin Authentication Module
 * Provides authentication and authorization for administrative operations
 */

/**
 * Validates admin token using constant-time comparison
 * @param {string} token - Token from X-Admin-Token header
 * @param {object} env - Environment bindings
 * @returns {boolean} - True if token is valid
 */
export function validateAdminToken(token, env) {
  if (!token || !env.ADMIN_SECRET_TOKEN) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  const expectedToken = env.ADMIN_SECRET_TOKEN;
  
  if (token.length !== expectedToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Admin authentication middleware
 * Checks X-Admin-Token header and returns error response if invalid
 * @param {Request} request - HTTP request
 * @param {object} env - Environment bindings
 * @returns {Response|null} - Error response if authentication fails, null if successful
 */
export function requireAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token');

  if (!validateAdminToken(token, env)) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Valid admin token required'
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  return null; // Authentication successful
}
