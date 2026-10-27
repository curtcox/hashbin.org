/**
 * Admin Authentication Module
 * Validates the platform admin token. Which admin scopes a caller holds, and so
 * which admin routes it may use, is decided in authenticate() and the route table.
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
 * Identifier for the admin in audit records
 * @param {Request} request - HTTP request
 * @returns {string} - Admin's user ID, or 'admin_token' for token auth
 */
export function adminActorId(request) {
  return request.user?.userId || 'admin_token';
}
