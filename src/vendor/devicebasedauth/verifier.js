/**
 * A caching verifier for relying parties. Verifies credentials offline with the issuer's
 * JWKS and status lists (both CDN-served and cached here), and optionally online.
 */
import { verifyJws, decodeJws } from './jose.js';
import { verifyCredential, verifyProof, verifyConfirmation, ReplayCache, VerificationError, DEFAULT_ISSUER, STATUS_LIST_TYP, CLOCK_SKEW } from './credential.js';
import { evaluateGrants } from './grants.js';
import { decodeStatusList, getBit } from './status-list.js';
import { verifyEvent } from './events.js';

/** Bitwise OR of two status lists (the longer length). */
function unionBits(a, b) {
  const out = new Uint8Array(Math.max(a.length, b.length));
  out.set(a.length >= b.length ? a : b);
  const shorter = a.length >= b.length ? b : a;
  for (let i = 0; i < shorter.length; i++) out[i] |= shorter[i];
  return out;
}

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
 * createVerifier({ audience, issuer, fetch, jwksTtl, jwksCooldown, statusTtl, replay, now, online })
 *   audience  — your audience name, e.g. "hashbin.org" (required)
 *   jwksCooldown — seconds between JWKS refetches forced by an unknown kid (default 30)
 *   online    — { apiKey } to enable verifyOnline (POST {issuer}/api/v1/authorize)
 *   catalog   — your action catalog's gate policies (spec/evaluation.md §3.8): true to fetch your
 *               audience's public record from the issuer (cached like the JWKS; requests fail
 *               closed with 503 catalog_unavailable while it cannot be loaded), or a static list
 *               [{ action, gates: { require, kinds, fail_open } }]. Actions whose entry requires
 *               gates are then online only, and confirmations that passed by timeout are refused
 *               where fail_open is false. Without it, an audience's policy is enforced online only.
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
  let catalog = new Map((Array.isArray(options.catalog) ? options.catalog : []).map(entry => [entry.action, entry]));
  let catalogCache = null; let catalogFailure = null;
  // Revocations pushed by webhook (handleEvent): "uri#idx" -> credential exp. Checked before the
  // cached status list, so a pushed revocation takes effect before the list's TTL runs out.
  const pushedRevocations = new Map(); const seenEvents = new Map();

  let jwksFailure = null; const statusFailures = new Map();
  const FAILURE_BACKOFF = options.failureBackoff ?? 30;
  // An unknown kid forces a refetch (a new key may be out), but at most once per cooldown:
  // anyone can send a credential with a made-up kid, and each would otherwise cost a JWKS fetch.
  const JWKS_COOLDOWN = options.jwksCooldown ?? 30;

  async function jwks(force = false) {
    const now = clock();
    if (jwksCache && (force ? jwksCache.fetched + JWKS_COOLDOWN > now : jwksCache.expires > now)) return jwksCache.value;
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
    jwksCache = { value: await response.json(), expires: now + jwksTtl, fetched: now };
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
    if (key) { try { decoded = await verifyJws(jws, key); } catch { decoded = null; } }
    if (!decoded || decoded.header.typ !== STATUS_LIST_TYP || decoded.payload.sub !== uri || decoded.payload.iss !== issuer) throw new VerificationError('status_unavailable', 'Status list did not verify');
    if (!Number.isSafeInteger(decoded.payload.exp)) throw new VerificationError('status_unavailable', 'Status list has no expiry');
    if (decoded.payload.exp < now - CLOCK_SKEW) throw new VerificationError('status_unavailable', 'Status list has expired');
    let bytes;
    try { bytes = await decodeStatusList(decoded.payload.status_list); } catch { throw new VerificationError('status_unavailable', 'Status list could not be decoded'); }
    // The issuer never clears a bit (indexes are not reused), so every bit seen set stays set: an
    // older copy from a stale cache cannot bring a revoked credential back (spec/credential.md §7).
    if (cached) bytes = unionBits(bytes, cached.bytes);
    const ttl = Math.min(statusTtl, Number.isSafeInteger(decoded.payload.ttl) ? decoded.payload.ttl : statusTtl);
    statusCache.set(uri, { bytes, expires: now + ttl });
    return bytes;
  }

  /** Load the audience's catalog when options.catalog is true (throws catalog_unavailable). */
  async function loadCatalog() {
    if (options.catalog !== true) return catalog;
    const now = clock();
    if (catalogCache && catalogCache.expires > now) return catalog;
    if (catalogFailure && catalogFailure.until > now) {
      if (catalogCache) return catalog;
      throw new VerificationError('catalog_unavailable', catalogFailure.message);
    }
    let response;
    try { response = await fetcher(`${issuer}/api/v1/audiences/${encodeURIComponent(audience)}`); } catch (error) { response = { ok: false, status: error.message }; }
    let record = null;
    if (response.ok) { try { record = await response.json(); } catch { record = null; } }
    if (!record || record.name !== audience || !Array.isArray(record.catalog)) {
      catalogFailure = { until: now + FAILURE_BACKOFF, message: `Audience catalog fetch failed (${response.status})` };
      // A stale copy is better than none: policies only ever tighten what the grants allow.
      if (catalogCache) return catalog;
      throw new VerificationError('catalog_unavailable', catalogFailure.message);
    }
    catalogFailure = null;
    catalog = new Map(record.catalog.map(entry => [entry.action, entry]));
    catalogCache = { expires: now + jwksTtl };
    return catalog;
  }

  /** Is the credential revoked? (true / false; throws status_unavailable when unknown) */
  async function isRevoked(payload) {
    const { idx, uri } = payload.status.status_list;
    if (pushedRevocations.has(`${uri}#${idx}`)) return true;
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
      await loadCatalog();
      let proof = null;
      if (found.kind === 'device') {
        if (!found.proof) return { ok: false, status: 401, code: 'proof_required' };
        proof = await verifyProof(found.proof, { method: request.method, url: request.url, credential: found.credential, jkt: payload.cnf.jkt, now: clock(), replay });
      }
      // A confirmation that does not verify is refused rather than ignored: it was presented as
      // this credential's and is not (spec/credential.md §9).
      let confirmation = null;
      const confirmationHeader = found.kind === 'device' ? request.headers.get('DBA-Confirmation') : null;
      if (confirmationHeader) {
        const check = keys => verifyConfirmation(confirmationHeader.trim(), { jwks: keys, issuer, credential: payload, audience });
        try { confirmation = (await check(await jwks())).payload; }
        catch (error) {
          if (error.code !== 'unknown_kid') throw new VerificationError(`confirmation_${error.code}`, error.message);
          try { confirmation = (await check(await jwks(true))).payload; } catch (again) { throw new VerificationError(`confirmation_${again.code}`, again.message); }
        }
      }
      return { ok: true, kind: found.kind, payload, proof, confirmation, credential: found.credential };
    } catch (error) {
      if (error instanceof VerificationError) return { ok: false, status: ['jwks_unavailable', 'status_unavailable', 'catalog_unavailable'].includes(error.code) ? 503 : 401, code: error.code, message: error.message };
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
    return decide(auth.payload, check, { request, proof: auth.proof, confirmation: auth.confirmation });
  }

  /** Which of these actions does a verified credential allow right now (offline checks only)? */
  function allowedActions(payload, actions, { request, proof, location, confirmation } = {}) {
    return actions.filter(action => decide(payload, { action, location }, { request, proof, confirmation }).allow);
  }

  /** Evaluate grants for an already-verified payload (and its verified confirmation, if any). */
  function decide(payload, check, { request, proof, confirmation } = {}) {
    const location = { network: check.location?.network ?? (request ? networkLocation(request) : undefined), device: check.location?.device ?? proof?.loc };
    const result = evaluateGrants(payload.grants, { now: clock(), action: check.action, resource: check.resource, location, online: false, attestation: payload.device?.attestation, confirmation: confirmation ?? undefined, policy: catalog.get(check.action) });
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

  /**
   * Verify a webhook body from devicebasedauth.org (spec/events.md) and apply it: a
   * credentials.revoked event marks those credentials revoked in this verifier at once.
   * Returns { ok: true, type, payload, duplicate } or { ok: false, status, code, message }.
   * Answer the webhook with 2xx when ok, else with the returned status.
   */
  async function handleEvent(body) {
    const now = clock();
    for (const [key, exp] of pushedRevocations) if (exp + CLOCK_SKEW < now) pushedRevocations.delete(key);
    for (const [key, at] of seenEvents) if (at < now - 3600) seenEvents.delete(key);
    let result;
    try {
      try { result = await verifyEvent(body, { jwks: await jwks(), issuer, audience, now }); }
      catch (error) {
        if (error.code !== 'unknown_kid') throw error;
        result = await verifyEvent(body, { jwks: await jwks(true), issuer, audience, now });
      }
    } catch (error) {
      if (error instanceof VerificationError) return { ok: false, status: error.code === 'jwks_unavailable' ? 503 : 400, code: error.code, message: error.message };
      throw error;
    }
    const { payload } = result;
    const duplicate = seenEvents.has(payload.jti);
    seenEvents.set(payload.jti, now);
    if (payload.type === 'credentials.revoked') {
      for (const c of payload.credentials) pushedRevocations.set(`${c.status.uri}#${c.status.idx}`, c.exp);
    }
    return { ok: true, type: payload.type, payload, duplicate };
  }

  return { jwks, verify, isRevoked, loadCatalog, handleEvent, authenticateRequest, verifyRequest, allowedActions, verifyOnline, decide, issuer, audience };
}
