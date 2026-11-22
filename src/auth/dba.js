/**
 * devicebasedauth.org ("DBA") credentials: device-bound keys a user creates at DBA and
 * presents here as `Authorization: DBA <credential>` + `DPoP: <proof>`, or as a short-lived
 * `Authorization: Bearer <access token>` (JWS typ "dba-access+jwt").
 *
 * Verification is offline with the vendored @devicebasedauth/verify: DBA's JWKS and status
 * lists are fetched and cached in this isolate, so a revoked device stops working within the
 * status list's TTL (at most 5 minutes). A credential's `acct` must be linked to a HashBin
 * account (src/api/dba.js). See todo/dba_integration.md.
 */

import { createOidcClient } from '../vendor/devicebasedauth/site.js';
import { createVerifier } from '../vendor/devicebasedauth/verifier.js';
import { durableReplayCache } from '../vendor/devicebasedauth/replay-do.js';
import { USER_SCOPES } from './scopes.js';

export const DBA_DEFAULT_ISSUER = 'https://devicebasedauth.org';
export const DBA_AUDIENCE = 'hashbin.org';
export const DBA_NAMESPACE = 'hashbin';
export const DBA_CLIENT_ID = 'hashbin.org';
export const DBA_REDIRECT_URI = 'https://hashbin.org/auth/dba/callback';
export const DBA_CALLBACK_PATH = '/auth/dba/callback';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The DBA issuer for this deployment: DBA_ISSUER, or https://devicebasedauth.org. It must be
 * an https origin; local mode also accepts http on localhost (a local DBA at :8787).
 * Returns null when DBA_ISSUER is set to anything else.
 */
export function dbaIssuer(env) {
  const configured = env?.DBA_ISSUER || DBA_DEFAULT_ISSUER;
  let url;
  try { url = new URL(configured); } catch { return null; }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
  const local = env?.ENVIRONMENT === 'local' && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  return url.protocol === 'https:' || local ? url.origin : null;
}

// One verifier per issuer, kept for the life of the isolate so DBA's JWKS, status lists and
// action catalog survive across requests instead of being fetched every time.
const verifiers = new Map();
const oidcClients = new Map();

/** The DBA actions HashBin understands: hashbin:<scope> for every user scope, and hashbin:session. */
export const DBA_ACTIONS = [...Object.keys(USER_SCOPES), 'session'].map(scope => `${DBA_NAMESPACE}:${scope}`);

/**
 * The shared DBA verifier for this deployment's issuer, or null when the issuer is
 * misconfigured.
 *
 * - DPoP proof ids are claimed in the DBA_REPLAY Durable Object, so a captured proof cannot be
 *   replayed against another isolate (it fails closed when that object is unreachable).
 * - The hashbin.org action catalog is loaded from DBA, so actions whose policy requires gates
 *   are sent online and confirmations passed by timeout are refused where the policy says so.
 * - DBA_API_KEY (a secret) enables online decisions for grants that need them (step-up,
 *   gates, use counts, require.online); each one is billed to the hashbin.org operator.
 */
export function dbaVerifier(env) {
  const issuer = dbaIssuer(env);
  if (!issuer) return null;
  const key = `${issuer} ${env?.DBA_API_KEY ? 'online' : 'offline'}`;
  if (!verifiers.has(key)) {
    verifiers.set(key, createVerifier({
      audience: DBA_AUDIENCE,
      issuer,
      catalog: true,
      ...(env?.DBA_REPLAY ? { replay: durableReplayCache(env.DBA_REPLAY) } : {}),
      ...(env?.DBA_API_KEY ? { online: { apiKey: env.DBA_API_KEY } } : {}),
      fetch: (...args) => globalThis.fetch(...args)
    }));
  }
  return verifiers.get(key);
}

/**
 * The OIDC client for linking a DBA account. Production registers exactly
 * https://hashbin.org/auth/dba/callback with DBA; local mode uses this origin's callback.
 */
export function dbaOidcClient(env, request) {
  const issuer = dbaIssuer(env);
  if (!issuer) return null;
  const redirectUri = env?.ENVIRONMENT === 'local' ? `${new URL(request.url).origin}${DBA_CALLBACK_PATH}` : DBA_REDIRECT_URI;
  const key = `${issuer} ${redirectUri}`;
  if (!oidcClients.has(key)) {
    oidcClients.set(key, createOidcClient({ clientId: DBA_CLIENT_ID, redirectUri, issuer, fetch: (...args) => globalThis.fetch(...args) }));
  }
  return oidcClients.get(key);
}

/** Forget cached verifiers and OIDC discovery (tests only). */
export function resetDbaAuth() {
  verifiers.clear();
  oidcClients.clear();
}

/**
 * Convert a DBA grant's monthly spend cap in dollars to HashBin's caveat in cents, rounding
 * down so the cap is never loosened. Returns undefined when the credential has no cap.
 */
export function dbaSpendLimitCents(caveats) {
  const usd = caveats?.spend_usd_per_month;
  return typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.floor(usd * 100 + 1e-9) : undefined;
}

function dbaLinkStub(env, account) {
  return env.DBA_LINKS.get(env.DBA_LINKS.idFromName(account));
}

/** The HashBin user a DBA account is linked to, per the global index, or null. */
export async function linkedUserId(env, account) {
  if (!env?.DBA_LINKS || !account) return null;
  const response = await dbaLinkStub(env, account).fetch(new Request('https://dba-link/link'));
  if (!response.ok) return null;
  return (await response.json()).user_id || null;
}

/** Index a DBA account to a user; replaceUserId takes over a link found stale. */
export async function claimDbaLink(env, account, userId, replaceUserId) {
  return dbaLinkStub(env, account).fetch(new Request('https://dba-link/link/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, user_id: userId, ...(replaceUserId ? { replace_user_id: replaceUserId } : {}) })
  }));
}

/** Remove a DBA account's index entry if it still points at this user. */
export async function releaseDbaLink(env, account, userId) {
  return dbaLinkStub(env, account).fetch(new Request('https://dba-link/link/release', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: userId })
  }));
}
