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

import { createSiteAuth, createOidcClient } from '../vendor/devicebasedauth/site.js';
import { USER_SCOPES } from './scopes.js';

export const DBA_DEFAULT_ISSUER = 'https://devicebasedauth.org';
export const DBA_AUDIENCE = 'hashbin.org';
export const DBA_NAMESPACE = 'hashbin';
export const DBA_CLIENT_ID = 'hashbin.org';
export const DBA_REDIRECT_URI = 'https://hashbin.org/auth/dba/callback';
export const DBA_CALLBACK_PATH = '/auth/dba/callback';

/**
 * Scopes a DBA credential cannot use yet, even when its grants name them. Signed download
 * links outlive the request and need a revocable spending identity on 256t.us (keys and app
 * grants have one; DBA credentials do not yet), so `downloads:spend` stays with keys.
 */
export const DBA_UNSUPPORTED_SCOPES = new Set(['downloads:spend']);

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

// One verifier per issuer, kept for the life of the isolate so DBA's JWKS, status lists
// and the DPoP replay cache survive across requests instead of being fetched every time.
const siteAuths = new Map();
const oidcClients = new Map();

/**
 * The shared DBA site authenticator for this deployment's issuer, or null when the issuer
 * is misconfigured. Which HashBin user an `acct` belongs to is looked up per request by the
 * caller (it needs this request's env), so linkedUser here only passes the account through.
 */
export function dbaSiteAuth(env) {
  const issuer = dbaIssuer(env);
  if (!issuer) return null;
  if (!siteAuths.has(issuer)) {
    siteAuths.set(issuer, createSiteAuth({
      audience: DBA_AUDIENCE,
      namespace: DBA_NAMESPACE,
      scopes: Object.keys(USER_SCOPES),
      linkedUser: async account => account,
      issuer,
      fetch: (...args) => globalThis.fetch(...args)
    }));
  }
  return siteAuths.get(issuer);
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
  siteAuths.clear();
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
