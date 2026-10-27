import { validate256tCID } from '../utils/hash256t.js';
import { MAX_UPLOAD_BYTES } from '../utils/upload-limits.js';
import { COST_POLICY } from '../utils/cost-policy.js';

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

// Scopes that move money out of the balance; a monthly_spend_limit_cents caveat bounds them all.
export const SPENDING_SCOPES = new Set(['content:write', 'content:extend', 'ratelimit:purchase', 'downloads:spend']);

export const ALL_USER_SCOPES = Object.freeze(Object.keys(USER_SCOPES));
export const ALL_ADMIN_SCOPES = Object.freeze(Object.keys(ADMIN_SCOPES));

// Route access levels besides a scope (or list of scopes, any one of which suffices).
export const PUBLIC = 'public';
export const SESSION = 'session';
// The ADMIN_USER_ID account's own session (not an admin key), for issuing admin keys
export const ADMIN_SESSION = 'admin-session';

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
  if (access === ADMIN_SESSION) {
    if (!isSessionAuth(authResult)) return sessionRequiredResponse();
    return authResult.user.scopes?.some(scope => scope.startsWith('admin:')) ? null : jsonError(403, 'not_admin', 'Only the admin may manage admin keys');
  }
  const anyOf = Array.isArray(access) ? access : [access];
  return anyOf.some(scope => hasScope(authResult, scope)) ? null : insufficientScopeResponse(anyOf.join(' or '));
}

/**
 * Caveats: optional limits that only ever narrow what a key or grant may do.
 *
 * - monthly_spend_limit_cents: total spent per month through the credential
 * - max_retention_months: longest retention one upload or extension may buy
 * - max_upload_bytes: largest upload
 * - content_types: media types an upload may declare
 * - cids: the only content the credential may extend, delete, buy rate limits for or download
 * - expires_at: (grants only; keys have their own expiry) when the grant stops working
 */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

function positiveInteger(value, max) {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

const CAVEAT_RULES = {
  monthly_spend_limit_cents: value => positiveInteger(value, 100000000),
  max_retention_months: value => positiveInteger(value, COST_POLICY.maxRetentionMonths),
  max_upload_bytes: value => positiveInteger(value, MAX_UPLOAD_BYTES),
  content_types: value => Array.isArray(value) && value.length >= 1 && value.length <= 20 &&
    value.every(type => typeof type === 'string' && MEDIA_TYPE.test(type)),
  cids: value => Array.isArray(value) && value.length >= 1 && value.length <= 100 &&
    value.every(cid => typeof cid === 'string' && validate256tCID(cid)),
  expires_at: value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now()
};

/**
 * Parse caveats for a credential kind ('key' | 'oauth').
 * Returns { caveats } or { error } naming the first invalid caveat.
 */
export function parseCaveats(input, kind) {
  if (input === undefined || input === null) return { caveats: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { error: 'caveats must be an object' };
  const caveats = {};
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const rule = Object.hasOwn(CAVEAT_RULES, name) && !(name === 'expires_at' && kind === 'key') ? CAVEAT_RULES[name] : null;
    if (!rule) return { error: `Unknown caveat: ${name}` };
    if (!rule(value)) return { error: `Invalid caveat: ${name}` };
    caveats[name] = name === 'content_types' || name === 'cids' ? [...new Set(value)] : value;
  }
  return { caveats };
}

/**
 * Whether `proposed` caveats are at least as tight as `current`: every limit current
 * sets is kept and not loosened. New limits may be added.
 */
export function caveatsNarrower(current = {}, proposed = {}) {
  return Object.entries(current).every(([name, value]) => {
    const next = proposed[name];
    if (next === undefined) return false;
    if (Array.isArray(value)) return next.every(entry => value.includes(entry));
    if (name === 'expires_at') return Date.parse(next) <= Date.parse(value);
    return next <= value;
  });
}

function caveatError(caveat, message) {
  return new Response(JSON.stringify({ error: 'caveat_violation', caveat, message }), {
    status: 403,
    headers: { 'content-type': 'application/json' }
  });
}

/**
 * Check a request against the caller's caveats. ctx may carry cid, bytes,
 * retention_months and content_type; absent fields are not checked.
 * Returns null when allowed, otherwise the 403 response to send.
 */
export function checkCaveats(authResult, ctx) {
  const caveats = authResult?.user?.caveats || {};
  if (ctx.cid !== undefined && caveats.cids && !caveats.cids.includes(ctx.cid)) {
    return caveatError('cids', 'This credential is not allowed to act on this content');
  }
  if (ctx.bytes !== undefined && caveats.max_upload_bytes && ctx.bytes > caveats.max_upload_bytes) {
    return caveatError('max_upload_bytes', `This credential may upload at most ${caveats.max_upload_bytes} bytes`);
  }
  if (ctx.retention_months !== undefined && caveats.max_retention_months && ctx.retention_months > caveats.max_retention_months) {
    return caveatError('max_retention_months', `This credential may buy at most ${caveats.max_retention_months} months of retention`);
  }
  if (ctx.content_type !== undefined && caveats.content_types) {
    const type = String(ctx.content_type).split(';')[0].trim().toLowerCase();
    if (!caveats.content_types.includes(type)) {
      return caveatError('content_types', `This credential may upload only ${caveats.content_types.join(', ')}`);
    }
  }
  return null;
}

/**
 * The key or grant a request spends through, for per-credential spend limits;
 * undefined for the account's own session.
 */
export function spenderOf(authResult) {
  const user = authResult?.user;
  if (user?.authMethod === 'apikey') return { kind: 'key', id: user.keyId };
  if (user?.authMethod === 'oauth') return { kind: 'oauth', id: user.oauth?.grantId };
  return undefined;
}
