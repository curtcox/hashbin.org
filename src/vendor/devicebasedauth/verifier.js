/**
 * A caching verifier for relying parties. Verifies credentials offline with the issuer's
 * JWKS and status lists (both CDN-served and cached here), and optionally online.
 */
import { verifyJws, decodeJws } from './jose.js';
import { verifyCredential, verifyProof, ReplayCache, VerificationError, DEFAULT_ISSUER, STATUS_LIST_TYP, CLOCK_SKEW } from './credential.js';
import { evaluateGrants } from './grants.js';
import { decodeStatusList, getBit } from './status-list.js';

/** Read Cloudflare's request.cf (when present) into a network location. */
export function networkLocation(request) {
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || undefined;
  const lat = cf.latitude !== undefined ? Number(cf.latitude) : undefined;
  const lon = cf.longitude !== undefined ? Number(cf.longitude) : undefined;
  if (!cf.country && !ip && lat === undefined) return undefined;
  return { country: cf.country, region: cf.country && cf.regionCode ? `${cf.country}-${cf.regionCode}` : undefined, lat, lon, ip };
}

/** Pull the credential and proof out of request headers. */
export function credentialFromRequest(request) {
  const auth = (request.headers.get('Authorization') || '').trim();
  const space = auth.indexOf(' ');
  const scheme = space > 0 ? auth.slice(0, space).toLowerCase() : '';
  const value = space > 0 ? auth.slice(space + 1).trim() : '';
  // HTTP authentication schemes are case-insensitive (RFC 9110 §11.1).
  if (scheme === 'dba') return { kind: 'device', credential: value, proof: request.headers.get('DPoP') || undefined };
  if (scheme === 'bearer') {
    const token = value;
    // Only DBA access tokens are claimed here; other bearer tokens belong to the site.
    try { const header = JSON.parse(atob(token.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))); if (header.typ === 'dba-access+jwt') return { kind: 'access', credential: token }; } catch { /* not ours */ }
  }
  return null;
}

/**
 * createVerifier({ audience, issuer, fetch, jwksTtl, statusTtl, replay, now, online })
 *   audience  — your audience name, e.g. "hashbin.org" (required)
 *   online    — { apiKey } to enable verifyOnline (POST {issuer}/api/v1/authorize)
 */
export function createVerifier(options = {}) {
  const issuer = options.issuer || DEFAULT_ISSUER;
  const audience = options.audience;
  if (!audience) throw new Error('createVerifier needs an audience');
  const fetcher = options.fetch || ((...args) => globalThis.fetch(...args));
  const clock = options.now || (() => Math.floor(Date.now() / 1000));
  const jwksTtl = options.jwksTtl ?? 3600; const statusTtl = options.statusTtl ?? 300;
  const replay = options.replay === false ? null : options.replay || new ReplayCache();
  let jwksCache = null; const statusCache = new Map();

  let jwksFailure = null; const statusFailures = new Map();
  const FAILURE_BACKOFF = options.failureBackoff ?? 30;

  async function jwks(force = false) {
    const now = clock();
    if (!force && jwksCache && jwksCache.expires > now) return jwksCache.value;
    // While the issuer is unreachable, fail fast instead of fetching on every request.
    if (jwksFailure && jwksFailure.until > now) {
      if (jwksCache) return jwksCache.value;
      throw new VerificationError('jwks_unavailable', jwksFailure.message);
    }
    let response;
    try { response = await fetcher(`${issuer}/.well-known/jwks.json`); } catch (error) { response = { ok: false, status: error.message }; }
    if (!response.ok) {
      jwksFailure = { until: now + FAILURE_BACKOFF, message: `JWKS fetch failed (${response.status})` };
      if (jwksCache) return jwksCache.value;
      throw new VerificationError('jwks_unavailable', jwksFailure.message);
    }
    jwksFailure = null;
    jwksCache = { value: await response.json(), expires: now + jwksTtl };
    return jwksCache.value;
  }

  async function statusBytes(uri) {
    const now = clock(); const cached = statusCache.get(uri);
    if (cached && cached.expires > now) return cached.bytes;
    const failed = statusFailures.get(uri);
    if (failed && failed.until > now) throw new VerificationError('status_unavailable', failed.message);
    let response;
    try { response = await fetcher(uri, { headers: { Accept: 'application/statuslist+jwt' } }); } catch (error) { response = { ok: false, status: error.message }; }
    if (!response.ok) {
      statusFailures.set(uri, { until: now + FAILURE_BACKOFF, message: `Status list fetch failed (${response.status})` });
      throw new VerificationError('status_unavailable', `Status list fetch failed (${response.status})`);
    }
    statusFailures.delete(uri);
    const jws = (await response.text()).trim();
    const keys = await jwks();
    let decoded = null; let kid;
    try { kid = JSON.parse(atob(jws.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))).kid; } catch { /* handled below */ }
    const key = keys.keys?.find(k => k.kid === kid);
    if (key) decoded = await verifyJws(jws, key);
    if (!decoded || decoded.header.typ !== STATUS_LIST_TYP || decoded.payload.sub !== uri || decoded.payload.iss !== issuer) throw new VerificationError('status_unavailable', 'Status list did not verify');
    if (Number.isSafeInteger(decoded.payload.exp) && decoded.payload.exp < now - CLOCK_SKEW) throw new VerificationError('status_unavailable', 'Status list has expired');
    const bytes = await decodeStatusList(decoded.payload.status_list);
    const ttl = Math.min(statusTtl, Number.isSafeInteger(decoded.payload.ttl) ? decoded.payload.ttl : statusTtl);
    statusCache.set(uri, { bytes, expires: now + ttl });
    return bytes;
  }

  /** Is the credential revoked? (true / false; throws status_unavailable when unknown) */
  async function isRevoked(payload) {
    const { idx, uri } = payload.status.status_list;
    return getBit(await statusBytes(uri), idx) === 1;
  }

  /** Verify signature, claims and revocation. */
  async function verify(credential, { typ = 'device' } = {}) {
    // Reject malformed input before any network fetch.
    try { decodeJws(credential); } catch { throw new VerificationError('invalid_format', 'Not a compact JWS'); }
    let keys = await jwks(); let result;
    try { result = await verifyCredential(credential, { jwks: keys, issuer, audience, now: clock(), typ }); }
    catch (error) {
      // A new signing key may have been published since the cache was filled.
      if (error.code !== 'unknown_kid') throw error;
      keys = await jwks(true); result = await verifyCredential(credential, { jwks: keys, issuer, audience, now: clock(), typ });
    }
    if (await isRevoked(result.payload)) throw new VerificationError('revoked', 'Credential has been revoked');
    return result;
  }

  /**
   * Verify an incoming request's credential (and proof) without deciding an action yet.
   * Returns { ok: true, kind, payload, proof } or { ok: false, status, code, message }.
   */
  async function authenticateRequest(request) {
    const found = credentialFromRequest(request);
    if (!found) return { ok: false, status: 401, code: 'credential_required' };
    try {
      if (found.kind === 'access' && options.acceptAccessTokens === false) return { ok: false, status: 401, code: 'access_tokens_not_accepted' };
      const { payload } = await verify(found.credential, { typ: found.kind });
      let proof = null;
      if (found.kind === 'device') {
        if (!found.proof) return { ok: false, status: 401, code: 'proof_required' };
        proof = await verifyProof(found.proof, { method: request.method, url: request.url, credential: found.credential, jkt: payload.cnf.jkt, now: clock(), replay });
      }
      return { ok: true, kind: found.kind, payload, proof, credential: found.credential };
    } catch (error) {
      if (error instanceof VerificationError) return { ok: false, status: ['jwks_unavailable', 'status_unavailable'].includes(error.code) ? 503 : 401, code: error.code, message: error.message };
      throw error;
    }
  }

  /**
   * Verify an incoming request end to end and decide one action.
   * check: { action, resource, location: { network, device } }
   * Returns { allow, status, code, reasons, credential, device, account, grant, caveats, online_required }.
   */
  async function verifyRequest(request, check) {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return { allow: false, status: auth.status, code: auth.code, message: auth.message, reasons: [] };
    return decide(auth.payload, check, { request, proof: auth.proof });
  }

  /** Which of these actions does a verified credential allow right now (offline checks only)? */
  function allowedActions(payload, actions, { request, proof, location } = {}) {
    return actions.filter(action => decide(payload, { action, location }, { request, proof }).allow);
  }

  /** Evaluate grants for an already-verified payload. */
  function decide(payload, check, { request, proof } = {}) {
    const location = { network: check.location?.network ?? (request ? networkLocation(request) : undefined), device: check.location?.device ?? proof?.loc };
    const result = evaluateGrants(payload.grants, { now: clock(), action: check.action, resource: check.resource, location, online: false });
    return {
      allow: result.allow, status: result.allow ? 200 : 403, code: result.allow ? 'ok' : result.online_required ? 'online_required' : 'forbidden',
      reasons: result.reasons, grant_index: result.grant_index, grant: result.grant, caveats: result.caveats, online_required: result.online_required,
      credential: payload, device: payload.sub, account: payload.acct, credential_id: payload.cid
    };
  }

  /**
   * Ask devicebasedauth.org (metered; billed to your audience account). Needed for grants with
   * usage limits, step-up or require.online, and for instant revocation.
   */
  async function verifyOnline(request, check) {
    if (!options.online?.apiKey) throw new Error('verifyOnline needs options.online.apiKey');
    const found = credentialFromRequest(request);
    if (!found) return { allow: false, status: 401, code: 'credential_required', reasons: [] };
    const response = await fetcher(`${issuer}/api/v1/authorize`, {
      method: 'POST', headers: { Authorization: `ApiKey ${options.online.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: found.credential, proof: found.proof, request: { method: request.method, url: request.url }, audience, action: check.action, resource: check.resource, context: { network: check.location?.network ?? networkLocation(request) } })
    });
    const body = await response.json();
    if (!response.ok) return { allow: false, status: response.status === 402 ? 503 : response.status, code: body.code, message: body.error, reasons: [] };
    return { ...body, status: body.allow ? 200 : 403 };
  }

  return { jwks, verify, isRevoked, authenticateRequest, verifyRequest, allowedActions, verifyOnline, decide, issuer, audience };
}
