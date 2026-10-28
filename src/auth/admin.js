/**
 * Admin identity helpers. Which admin scopes a caller holds, and so which admin
 * routes it may use, is decided in authenticate() and the route table: the
 * ADMIN_USER_ID session holds every admin scope, an hba_ admin key only its own.
 */

/**
 * Identifier for the admin in audit records
 * @param {Request} request - HTTP request
 * @returns {string} - Admin's user ID, with the admin key's ID when one was used
 */
export function adminActorId(request) {
  if (request.user?.authMethod === 'admin_key') return `${request.user.userId} (admin key ${request.user.keyId})`;
  return request.user?.userId || 'admin';
}
