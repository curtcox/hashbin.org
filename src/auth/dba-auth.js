/**
 * Authenticating a request that carries a devicebasedauth.org ("DBA") credential, and the
 * online decisions some of its grants need. Configuration and the shared verifier are in
 * ./dba.js; see todo/dba_integration.md.
 *
 * What a credential may do comes from its grants' `hashbin:<scope>` actions, evaluated now:
 * - allowed offline: the credential holds the scope;
 * - allowed only online (step-up, gates, use counts, require.online, gated catalog actions):
 *   the scope is listed in `dba.onlineScopes`, and the dispatcher asks DBA when a route needs
 *   it (authorizeDbaOnline);
 * - `hashbin:session` makes the credential a device session: it holds every user scope and
 *   reaches SESSION routes, but never ACCOUNT_SESSION ones (minting credentials, ending the
 *   account), so revoking the device at DBA ends everything it could do.
 */

import { ACCOUNT_SESSION, ADMIN_SESSION, ALL_USER_SCOPES, PUBLIC, SESSION } from './scopes.js';
import { DBA_ACTIONS, DBA_NAMESPACE, dbaSpendLimitCents, dbaVerifier, linkedUserId } from './dba.js';

// DBA verifier codes (spec/credential.md in devicebasedauth.org) mapped to HashBin's
// AUTH_ERROR_CODES (src/auth/middleware.js). Anything else is AUTH_INVALID_FORMAT.
const DBA_ERROR_CODES = {
  expired: 'AUTH_EXPIRED',
  revoked: 'AUTH_KEY_REVOKED',
  proof_required: 'AUTH_DBA_PROOF_INVALID',
  invalid_proof: 'AUTH_DBA_PROOF_INVALID',
  key_mismatch: 'AUTH_DBA_PROOF_INVALID',
  stale_proof: 'AUTH_DBA_PROOF_INVALID',
  replayed_proof: 'AUTH_DBA_PROOF_INVALID',
  use_dpop_nonce: 'AUTH_DBA_PROOF_INVALID',
  jwks_unavailable: 'AUTH_DBA_UNAVAILABLE',
  status_unavailable: 'AUTH_DBA_UNAVAILABLE',
  catalog_unavailable: 'AUTH_DBA_UNAVAILABLE'
};

const unavailable = message => ({ valid: false, error: 'AUTH_DBA_UNAVAILABLE', message });

/** The key a revoked status entry is known by (spec/events.md §3: the status entry is the revoked thing). */
export function dbaStatusKey(status) {
  return status && typeof status.uri === 'string' && Number.isSafeInteger(status.idx) ? `${status.uri}#${status.idx}` : null;
}

// Revocations DBA pushed to the webhook (DbaRevocations), cached briefly per isolate: one
// object read per isolate per window instead of one per request.
const PUSHED_TTL_MS = 30000;
let pushed = null;

/**
 * Status entries DBA has told us are revoked. The status lists stay authoritative, so when
 * the object cannot be read this answers an empty set (and does not cache it).
 */
export async function pushedDbaRevocations(env) {
  if (!env?.DBA_REVOCATIONS) return new Set();
  if (pushed && pushed.binding === env.DBA_REVOCATIONS && pushed.until > Date.now()) return pushed.keys;
  try {
    const stub = env.DBA_REVOCATIONS.get(env.DBA_REVOCATIONS.idFromName('global'));
    const response = await stub.fetch(new Request('https://dba-revocations/revoked'));
    if (!response.ok) return new Set();
    const keys = new Set((await response.json()).revoked || []);
    pushed = { binding: env.DBA_REVOCATIONS, keys, until: Date.now() + PUSHED_TTL_MS };
    return keys;
  } catch {
    return new Set();
  }
}

/** Forget the cached pushed revocations (after a webhook, and in tests). */
export function forgetPushedDbaRevocations() {
  pushed = null;
}

/**
 * Is this status entry revoked? Checks pushed revocations, then DBA's status list.
 * Throws when the status list cannot be fetched (callers fail closed).
 */
export async function dbaStatusRevoked(env, status) {
  const key = dbaStatusKey(status);
  if (!key) return true;
  if ((await pushedDbaRevocations(env)).has(key)) return true;
  const verifier = dbaVerifier(env);
  if (!verifier) throw new Error('DBA_ISSUER is not a valid issuer');
  return verifier.isRevoked({ status: { status_list: status } });
}

/** The tightest monthly spend cap on this site's grants (other sites' caps are theirs). */
function spendCaveats(payload) {
  const ours = (payload.grants || []).filter(g => Array.isArray(g.actions) && g.actions.some(a => a.startsWith(`${DBA_NAMESPACE}:`)));
  const caps = ours.map(g => g.limits?.spend_usd_per_month).filter(v => v !== undefined);
  const cents = dbaSpendLimitCents(caps.length ? { spend_usd_per_month: Math.min(...caps) } : {});
  return cents === undefined ? {} : { monthly_spend_limit_cents: cents };
}

/**
 * Validate a DBA credential (or access token) and find the HashBin user its DBA account is
 * linked to. The index (DbaLink) and the user's profile must agree.
 */
export async function validateDbaCredential(request, env) {
  const verifier = dbaVerifier(env);
  if (!verifier) return unavailable('DBA_ISSUER is not a valid issuer');

  let auth;
  try {
    auth = await verifier.authenticateRequest(request);
  } catch (_error) {
    return unavailable('Could not verify the devicebasedauth.org credential');
  }
  if (!auth.ok) {
    return {
      valid: false,
      error: DBA_ERROR_CODES[auth.code] || 'AUTH_INVALID_FORMAT',
      message: auth.message || 'Invalid devicebasedauth.org credential',
      details: { dba_code: auth.code }
    };
  }
  const { payload, proof, confirmation } = auth;
  const status = payload.status.status_list;
  if ((await pushedDbaRevocations(env)).has(dbaStatusKey(status))) {
    return { valid: false, error: 'AUTH_KEY_REVOKED', message: 'This devicebasedauth.org credential was revoked', details: { dba_code: 'revoked' } };
  }

  const account = payload.acct;
  const notLinked = {
    valid: false,
    error: 'AUTH_DBA_NOT_LINKED',
    message: 'Link this devicebasedauth.org account to your HashBin account first (Account Settings)',
    details: { dba_account: account }
  };
  let profile, userId;
  try {
    userId = await linkedUserId(env, account);
    if (!userId) return notLinked;
    const response = await env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId)).fetch(new Request('http://internal/profile'));
    if (!response.ok) return notLinked;
    profile = await response.json();
  } catch (_error) {
    return unavailable('Could not look up the devicebasedauth.org link');
  }
  if (profile.deleted_at) return { valid: false, error: 'AUTH_USER_DELETED', message: 'User account has been deleted' };
  if (profile.dba_link?.account !== account || profile.migrated_to) return notLinked;

  const offline = [];
  const online = [];
  for (const action of DBA_ACTIONS) {
    const scope = action.slice(DBA_NAMESPACE.length + 1);
    const decision = verifier.decide(payload, { action }, { request, proof, confirmation });
    if (decision.allow) offline.push(scope);
    else if (decision.online_required) online.push(scope);
  }
  const session = offline.includes('session');
  return {
    valid: true,
    userId: profile.user_id || userId,
    session,
    scopes: session ? deviceSessionScopes() : offline,
    caveats: spendCaveats(payload),
    profile,
    dba: {
      account, deviceId: payload.sub, credentialId: payload.cid, kind: auth.kind,
      status: { uri: status.uri, idx: status.idx }, exp: payload.exp,
      onlineScopes: session ? [] : online
    }
  };
}

/** A device session holds every user scope, like the account's own sign-in. */
function deviceSessionScopes() {
  return [...ALL_USER_SCOPES];
}

/** Make an authenticated DBA user a device session (after an online allow of hashbin:session). */
function becomeDeviceSession(user) {
  user.session = true;
  user.deviceSession = true;
  user.scopes = deviceSessionScopes();
  user.dba.onlineScopes = [];
}

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The scope a route needs that this DBA credential could get only online, or null. */
function onlineScopeFor(user, access) {
  const online = user.dba?.onlineScopes || [];
  if (!online.length || access === PUBLIC) return null;
  if (access === SESSION || access === ACCOUNT_SESSION || access === ADMIN_SESSION) {
    return !user.session && online.includes('session') ? 'session' : null;
  }
  const anyOf = Array.isArray(access) ? access : [access];
  if (anyOf.some(scope => user.scopes.includes(scope))) return null;
  return anyOf.find(scope => online.includes(scope)) || (online.includes('session') ? 'session' : null);
}

/**
 * Ask DBA (POST /api/v1/authorize, metered to the hashbin.org operator) for a scope this
 * route needs that the credential's grants allow only online. On an allow the scope (or the
 * device session) is added to the caller and null is returned; otherwise the response to
 * send. Gated grants answer 403 `gate_pending` with DBA's gate_request until their gates
 * settle; DBA's SDK and CLI retry with a fresh proof.
 */
export async function authorizeDbaOnline(request, env, authResult, access) {
  const user = authResult?.authenticated ? authResult.user : null;
  if (user?.authMethod !== 'dba') return null;
  const scope = onlineScopeFor(user, access);
  if (!scope) return null;
  const verifier = dbaVerifier(env);
  if (!env?.DBA_API_KEY || !verifier) {
    return json({ error: 'online_required', code: 'online_required', message: `This devicebasedauth.org grant for ${DBA_NAMESPACE}:${scope} needs an online check, which hashbin.org has not enabled` }, 403);
  }
  let result;
  try {
    result = await verifier.verifyOnline(request, { action: `${DBA_NAMESPACE}:${scope}` });
  } catch (_error) {
    return json({ error: 'AUTH_DBA_UNAVAILABLE', message: 'Could not reach devicebasedauth.org for an online check' }, 503);
  }
  if (result.allow) {
    if (scope === 'session') becomeDeviceSession(user);
    else user.scopes = [...user.scopes, scope];
    const cap = dbaSpendLimitCents(result.caveats);
    const current = user.caveats?.monthly_spend_limit_cents;
    if (cap !== undefined && (current === undefined || cap < current)) user.caveats = { ...user.caveats, monthly_spend_limit_cents: cap };
    return null;
  }
  if (result.code === 'gate_pending') {
    return json({ error: 'gate_pending', code: 'gate_pending', message: 'Waiting for this grant\'s gates to approve; retry with a fresh proof', gate_request: result.gate_request }, 403);
  }
  if (result.status >= 500) return json({ error: 'AUTH_DBA_UNAVAILABLE', dba_code: result.code, message: 'devicebasedauth.org could not decide' }, 503);
  if (result.status === 401) return json({ error: 'AUTH_INVALID_FORMAT', dba_code: result.code, message: result.message || 'devicebasedauth.org refused the credential' }, 401);
  return json({ error: 'dba_denied', code: result.code || 'forbidden', reasons: result.reasons || [], message: `devicebasedauth.org did not allow ${DBA_NAMESPACE}:${scope}` }, 403);
}
