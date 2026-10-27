/**
 * Scopes: the single list of what a delegated credential may do.
 *
 * API keys, OAuth grants and admin keys all hold scopes from this list. A signed-in
 * session is the account's root credential and holds every user scope; only the
 * ADMIN_USER_ID session also holds the admin scopes. Everything a route needs is
 * declared in the route table (src/index.js), which denies anything undeclared.
 */

export const USER_SCOPES = {
  'content:write': 'Publish content, paid from your balance.',
  'content:extend': 'Extend how long content is kept, paid from your balance.',
  'content:delete': 'Delete content you uploaded.',
  'uploads:read': 'List the content you uploaded.',
  'balance:read': 'Read your current balance.',
  'transactions:read': 'Read your balance history.',
  'ratelimit:purchase': 'Buy download allowances for content, paid from your balance.',
  'downloads:spend': 'Pay for downloads from your balance, within your download caps.',
  'suppliers:read': 'List the alternate suppliers you registered.',
  'suppliers:write': 'Register, change and remove alternate suppliers.'
};

export const ADMIN_SCOPES = {
  'admin:disputes': 'Review and resolve disputes; read repeat infringers and the admin action log.',
  'admin:takedown': 'Delete any content.',
  'admin:stats': 'Read platform statistics, health, alerts and the audit log; acknowledge and test alerts.',
  'admin:costs': 'Read and record costs; read and set the cost-safety brake.',
  'admin:backups': 'Read backup status and files; start a backup.',
  'admin:restore': 'Restore an object from a backup.',
  'admin:export': 'Export platform data.'
};

// Scopes that move money out of the balance; each needs a spend limit on delegated credentials.
export const SPENDING_SCOPES = new Set(['content:write', 'content:extend', 'ratelimit:purchase', 'downloads:spend']);

export const ALL_USER_SCOPES = Object.freeze(Object.keys(USER_SCOPES));
export const ALL_ADMIN_SCOPES = Object.freeze(Object.keys(ADMIN_SCOPES));

// Route access levels besides a scope (or list of scopes, any one of which suffices).
export const PUBLIC = 'public';
export const SESSION = 'session';

/**
 * Parse a list of scopes for a credential kind ('key' | 'oauth' | 'admin').
 * Returns the de-duplicated list, or null when any entry is unknown or not allowed.
 */
export function parseScopes(input, kind) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/\s+/);
  const scopes = [...new Set(list.filter(Boolean))];
  const allowed = kind === 'admin' ? ADMIN_SCOPES : USER_SCOPES;
  if (scopes.some(scope => typeof scope !== 'string' || !Object.hasOwn(allowed, scope))) return null;
  return scopes;
}

export function scopeDescription(scope) {
  return USER_SCOPES[scope] || ADMIN_SCOPES[scope] || 'Requested access.';
}

export function isSessionAuth(authResult) {
  return Boolean(authResult?.authenticated && authResult.user?.session);
}

export function hasScope(authResult, scope) {
  return Boolean(authResult?.authenticated && authResult.user?.scopes?.includes(scope));
}

function jsonError(status, error, message) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export function insufficientScopeResponse(scope) {
  return jsonError(403, 'insufficient_scope', `This credential is missing the ${scope} scope`);
}

export function sessionRequiredResponse() {
  return jsonError(403, 'session_required', 'Sign in to HashBin to use this endpoint; keys and app tokens cannot');
}

/**
 * Check a route's declared access against an authentication result.
 * Returns null when allowed, otherwise the error response to send.
 */
export function checkAccess(authResult, access, unauthenticated) {
  if (access === PUBLIC) return null;
  if (!authResult?.authenticated) return unauthenticated();
  if (access === SESSION) return isSessionAuth(authResult) ? null : sessionRequiredResponse();
  const anyOf = Array.isArray(access) ? access : [access];
  return anyOf.some(scope => hasScope(authResult, scope)) ? null : insufficientScopeResponse(anyOf.join(' or '));
}
