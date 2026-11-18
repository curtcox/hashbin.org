/**
 * Helpers for a site that accepts devicebasedauth.org credentials as API keys (device-bound) and
 * as a sign-in method. Built on createVerifier; used by hashbin.org and cronly.org.
 */
import { createVerifier } from './verifier.js';
import { decodeJws, verifyJws, sha256b64u, b64u } from './jose.js';

/**
 * createSiteAuth({ audience, namespace, scopes, linkedUser, issuer, fetch, now, online })
 *   namespace  — the site's action namespace ("hashbin")
 *   scopes     — the site's own scope names ("content:write", …); actions are `${namespace}:${scope}`
 *   linkedUser — async (dbaAccount, { request, payload }) => local user id, or null when not linked
 * authenticate(request) returns null when the request carries no DBA credential (fall through to
 * the site's other auth), or { ok: false, status, code } / { ok: true, userId, scopes, … }.
 */
export function createSiteAuth({ audience, namespace, scopes, linkedUser, ...verifierOptions }) {
  if (!namespace || !Array.isArray(scopes) || typeof linkedUser !== 'function') throw new Error('createSiteAuth needs namespace, scopes and linkedUser');
  const verifier = createVerifier({ audience, ...verifierOptions });
  const actions = [...new Set([...scopes, 'session'])].map(scope => `${namespace}:${scope}`);

  async function authenticate(request) {
    const auth = await verifier.authenticateRequest(request);
    if (!auth.ok) return auth.code === 'credential_required' ? null : { ok: false, status: auth.status, code: auth.code, message: auth.message };
    const { payload, proof } = auth;
    const userId = await linkedUser(payload.acct, { request, payload, kind: auth.kind });
    if (!userId) return { ok: false, status: 403, code: 'account_not_linked', message: `Link devicebasedauth.org account ${payload.acct} to your ${audience} account first`, dba_account: payload.acct };
    const allowed = verifier.allowedActions(payload, actions, { request, proof }).map(a => a.slice(namespace.length + 1));
    // The tightest spend cap of any grant this credential holds applies to everything it does.
    const caps = payload.grants.map(g => g.limits?.spend_usd_per_month).filter(v => v !== undefined);
    return {
      ok: true, userId, dbaAccount: payload.acct, deviceId: payload.sub, credentialId: payload.cid, kind: auth.kind,
      session: allowed.includes('session'), scopes: allowed.filter(s => s !== 'session'),
      caveats: caps.length ? { spend_usd_per_month: Math.min(...caps) } : {},
      payload, proof
    };
  }

  /** Decide one action for an authenticated result, including resource-scoped grants. */
  function allows(result, action, resource) {
    return result?.ok === true && verifier.decide(result.payload, { action: `${namespace}:${action}`, resource }, { proof: result.proof }).allow;
  }

  return { authenticate, allows, verifier };
}

/**
 * OpenID Connect client for "Sign in with devicebasedauth.org" and account linking
 * (authorization code + PKCE S256; no client secret).
 *   const oidc = createOidcClient({ clientId: 'hashbin.org', redirectUri: 'https://hashbin.org/auth/dba/callback' });
 *   const { url, state } = await oidc.begin();   // store state server-side (or signed cookie), redirect to url
 *   const claims = await oidc.finish(callbackUrlSearchParams, state);  // { sub, acct, dev?, cid?, … }
 */
export function createOidcClient({ clientId, redirectUri, issuer = 'https://devicebasedauth.org', fetch: fetcher = (...a) => globalThis.fetch(...a), now = () => Math.floor(Date.now() / 1000) }) {
  let discovery = null; let jwks = null;
  const config = async () => discovery ||= await (await fetcher(`${issuer}/.well-known/openid-configuration`)).json();

  async function begin({ scope = 'openid profile' } = {}) {
    const c = await config();
    const random = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
    const state = { state: random(), nonce: random(), verifier: random() };
    const url = new URL(c.authorization_endpoint);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope, state: state.state, nonce: state.nonce, code_challenge: await sha256b64u(state.verifier), code_challenge_method: 'S256' })) url.searchParams.set(k, v);
    return { url: url.toString(), state };
  }

  async function finish(params, saved) {
    const p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    if (p.get('error')) throw Object.assign(new Error(`Sign-in was not completed: ${p.get('error')}`), { code: p.get('error') });
    if (!saved || p.get('state') !== saved.state) throw Object.assign(new Error('State mismatch'), { code: 'invalid_state' });
    const c = await config();
    const response = await fetcher(c.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code') || '', redirect_uri: redirectUri, client_id: clientId, code_verifier: saved.verifier }).toString() });
    const tokens = await response.json();
    if (!response.ok) throw Object.assign(new Error(tokens.error_description || 'Token exchange failed'), { code: tokens.error });
    const { header, payload } = decodeJws(tokens.id_token);
    jwks ||= await (await fetcher(c.jwks_uri)).json();
    let key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) { jwks = await (await fetcher(c.jwks_uri)).json(); key = jwks.keys.find(k => k.kid === header.kid); }
    if (!key || !await verifyJws(tokens.id_token, key)) throw Object.assign(new Error('ID token signature is invalid'), { code: 'invalid_id_token' });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== c.issuer || !audiences.includes(clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) || payload.nonce !== saved.nonce || payload.exp < now() - 60) throw Object.assign(new Error('ID token claims are invalid'), { code: 'invalid_id_token' });
    return payload;
  }

  return { begin, finish };
}
