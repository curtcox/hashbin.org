/**
 * Device credentials (typ "dba-device+jwt"), short-lived access tokens (typ "dba-access+jwt")
 * and DPoP proofs (RFC 9449, typ "dpop+jwt"). See spec/credential.md.
 */
import { decodeJws, verifyJws, jwkThumbprint, sha256b64u, signJws, publicJwk, b64u } from './jose.js';
import { validateGrants, VOCABULARY_VERSION } from './grants.js';

export const CREDENTIAL_TYP = 'dba-device+jwt';
export const ACCESS_TYP = 'dba-access+jwt';
export const PROOF_TYP = 'dpop+jwt';
export const STATUS_LIST_TYP = 'statuslist+jwt';
export const CONFIRMATION_TYP = 'dba-confirmation+jwt';
export const DEFAULT_ISSUER = 'https://devicebasedauth.org';
export const CLOCK_SKEW = 60;
export const PROOF_MAX_AGE = 60;

/** A verification failure with a stable machine-readable code. */
export class VerificationError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
/** Largest status-list index a credential may carry (spec/credential.md §7). */
export const MAX_STATUS_INDEX = 2 ** 31 - 1;

const fail = (code, message) => { throw new VerificationError(code, message); };

/** Decode a credential or access token for display. Does NOT verify anything. */
export function inspectCredential(jws) {
  const { header, payload } = decodeJws(jws);
  return { header, payload };
}

/** Structural checks shared by issuers (before signing) and verifiers (after). */
export function validateCredentialPayload(payload, { typ = CREDENTIAL_TYP } = {}) {
  const errors = [];
  const str = (k, re) => { if (typeof payload[k] !== 'string' || (re && !re.test(payload[k]))) errors.push(`${k} is missing or malformed`); };
  str('iss'); str('sub', /^dev_[A-Za-z0-9]{8,64}$/); str('acct', /^[A-Za-z0-9_-]{1,128}$/); str('jti'); str('cid', /^crd_[A-Za-z0-9]{8,64}$/);
  for (const k of ['iat', 'nbf', 'exp']) if (!Number.isSafeInteger(payload[k])) errors.push(`${k} must be a NumericDate`);
  if (!Array.isArray(payload.aud) || payload.aud.length === 0 || payload.aud.some(a => typeof a !== 'string')) errors.push('aud must be a list of audiences');
  if (payload.exp <= payload.nbf) errors.push('exp must be after nbf');
  if (payload.ver !== VOCABULARY_VERSION) errors.push(`ver must be ${VOCABULARY_VERSION}`);
  const status = payload.status?.status_list;
  if (!status || !Number.isSafeInteger(status.idx) || status.idx < 0 || status.idx > MAX_STATUS_INDEX || typeof status.uri !== 'string') errors.push('status.status_list must have idx (0 to 2^31-1) and uri');
  if (typ === CREDENTIAL_TYP && typeof payload.cnf?.jkt !== 'string') errors.push('cnf.jkt is required');
  errors.push(...validateGrants(payload.grants));
  return errors;
}

/**
 * Verify a credential or access token signature and claims.
 * options: { jwks: {keys:[...]}, issuer, audience, now (seconds), typ: 'device'|'access'|'any' }
 * Revocation is checked separately (status lists, or online).
 */
export async function verifyCredential(jws, { jwks, issuer = DEFAULT_ISSUER, audience, now = Math.floor(Date.now() / 1000), typ = 'device' } = {}) {
  let decoded;
  try { decoded = decodeJws(jws); } catch { fail('invalid_format', 'Not a compact JWS'); }
  const { header, payload } = decoded;
  const allowed = typ === 'any' ? [CREDENTIAL_TYP, ACCESS_TYP] : [typ === 'access' ? ACCESS_TYP : CREDENTIAL_TYP];
  if (!allowed.includes(header.typ)) fail('wrong_type', `Expected typ ${allowed.join(' or ')}`);
  const jwk = jwks?.keys?.find(k => k.kid === header.kid);
  if (!jwk) fail('unknown_kid', `Unknown signing key ${header.kid}`);
  if (!await verifyJws(jws, jwk)) fail('invalid_signature', 'Signature does not verify');
  if (payload.iss !== issuer) fail('wrong_issuer', `Issuer is not ${issuer}`);
  const problems = validateCredentialPayload(payload, { typ: header.typ });
  if (problems.length) fail('invalid_claims', problems.join('; '));
  if (audience !== undefined && !payload.aud.includes(audience)) fail('wrong_audience', `Not valid for ${audience}`);
  if (now + CLOCK_SKEW < payload.nbf) fail('not_yet_valid', 'Credential is not valid yet');
  if (now - CLOCK_SKEW >= payload.exp) fail('expired', 'Credential has expired');
  return { header, payload };
}

/**
 * Verify a confirmation (typ "dba-confirmation+jwt", spec/credential.md §9) for an
 * already-verified device credential payload: issuer signature, issuer, and the binding to the
 * credential (same cid, sub and cnf.jkt). Time is not checked here: the evaluator compares
 * iat/exp with its clock (spec/evaluation.md §3.6), as DBA does with its own record online.
 * Returns { header, payload }.
 */
export async function verifyConfirmation(jws, { jwks, issuer = DEFAULT_ISSUER, credential, audience } = {}) {
  let decoded;
  try { decoded = decodeJws(jws); } catch { fail('invalid_format', 'Confirmation is not a compact JWS'); }
  const { header, payload } = decoded;
  if (header.typ !== CONFIRMATION_TYP) fail('wrong_type', `Expected typ ${CONFIRMATION_TYP}`);
  const jwk = jwks?.keys?.find(k => k.kid === header.kid);
  if (!jwk) fail('unknown_kid', `Unknown signing key ${header.kid}`);
  if (!await verifyJws(jws, jwk)) fail('invalid_signature', 'Confirmation signature does not verify');
  if (payload.iss !== issuer) fail('wrong_issuer', `Issuer is not ${issuer}`);
  const problems = [];
  if (typeof payload.cid !== 'string' || typeof payload.sub !== 'string' || typeof payload.cnf?.jkt !== 'string') problems.push('cid, sub and cnf.jkt are required');
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat) problems.push('iat and exp must be NumericDates with exp after iat');
  if (typeof payload.by_timeout !== 'boolean') problems.push('by_timeout must be true or false');
  if (!Array.isArray(payload.aud) || payload.aud.some(a => typeof a !== 'string')) problems.push('aud must be a list of audiences');
  if (problems.length) fail('invalid_claims', problems.join('; '));
  if (!credential || payload.cid !== credential.cid || payload.sub !== credential.sub) fail('wrong_credential', 'Confirmation is for another credential');
  if (payload.cnf.jkt !== credential.cnf?.jkt) fail('key_mismatch', 'Confirmation is for another device key');
  if (audience !== undefined && !payload.aud.includes(audience)) fail('wrong_audience', `Confirmation is not valid for ${audience}`);
  return { header, payload };
}

/** Normalize a URL for htu: scheme, host and path only (RFC 9449 §4.3). */
export function htu(url) { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname}`; }

/**
 * Create a DPoP proof for one request with the device key.
 * options: { method, url, credential (to bind with ath), nonce, location: {lat, lon, acc_m, t}, now, jti }
 */
export async function createProof({ privateKey, publicJwk: jwk, method, url, credential, nonce, location, now = Math.floor(Date.now() / 1000), jti }) {
  const payload = { jti: jti || b64u(crypto.getRandomValues(new Uint8Array(16))), htm: method.toUpperCase(), htu: htu(url), iat: now };
  if (credential) payload.ath = await sha256b64u(credential);
  if (nonce) payload.nonce = nonce;
  if (location) payload.loc = location;
  return signJws({ typ: PROOF_TYP, jwk: publicJwk(jwk) }, payload, privateKey);
}

/** A tiny in-memory jti replay cache, per isolate/process. */
export class ReplayCache {
  constructor(ttlSeconds = PROOF_MAX_AGE * 2 + CLOCK_SKEW, max = 100000) { this.ttl = ttlSeconds; this.max = max; this.seen = new Map(); }
  /** Returns false when the jti was already used. */
  check(jti, now) {
    // Entries share one TTL, so insertion order is expiry order.
    for (const [key, exp] of this.seen) { if (exp > now) break; this.seen.delete(key); }
    if (this.seen.has(jti)) return false;
    if (this.seen.size >= this.max) this.seen.delete(this.seen.keys().next().value);
    this.seen.set(jti, now + this.ttl); return true;
  }
}

/**
 * Verify a DPoP proof for a request.
 * options: { method, url, credential (compact string; checks ath), jkt (expected thumbprint),
 *            now, nonce (required value, if any), replay (ReplayCache or { check(key, now) → boolean | Promise<boolean> }) }
 * Returns the proof payload (including any device-reported loc).
 */
export async function verifyProof(proof, { method, url, credential, jkt, now = Math.floor(Date.now() / 1000), nonce, replay }) {
  let decoded;
  try { decoded = decodeJws(proof); } catch { fail('invalid_proof', 'DPoP proof is not a compact JWS'); }
  const { header, payload } = decoded;
  if (header.typ !== PROOF_TYP || header.alg !== 'ES256' || !header.jwk) fail('invalid_proof', 'DPoP proof header must have typ dpop+jwt, alg ES256 and jwk');
  let thumbprint;
  try { thumbprint = await jwkThumbprint(header.jwk); } catch { fail('invalid_proof', 'DPoP proof jwk is not a P-256 key'); }
  if (jkt && thumbprint !== jkt) fail('key_mismatch', 'DPoP proof was not signed by the credential key');
  // A jwk with the right members but no point on the curve makes WebCrypto throw; that is a bad
  // proof (401), not a server error.
  let signed = false;
  try { signed = !!await verifyJws(proof, header.jwk); } catch { signed = false; }
  if (!signed) fail('invalid_proof', 'DPoP proof signature does not verify');
  if (payload.htm !== method.toUpperCase()) fail('invalid_proof', 'DPoP proof htm does not match the request method');
  if (payload.htu !== htu(url)) fail('invalid_proof', 'DPoP proof htu does not match the request URL');
  if (!Number.isSafeInteger(payload.iat) || payload.iat > now + CLOCK_SKEW || payload.iat < now - PROOF_MAX_AGE - CLOCK_SKEW) fail('stale_proof', 'DPoP proof iat is outside the allowed window');
  if (typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 128) fail('invalid_proof', 'DPoP proof jti is missing');
  if (credential !== undefined && payload.ath !== await sha256b64u(credential)) fail('invalid_proof', 'DPoP proof ath does not match the credential');
  if (nonce !== undefined && payload.nonce !== nonce) fail('use_dpop_nonce', 'DPoP nonce required');
  // check may be async (a shared cache such as durableReplayCache).
  if (replay && !(await replay.check(`${thumbprint}:${payload.jti}`, now))) fail('replayed_proof', 'DPoP proof was already used');
  return { ...payload, jkt: thumbprint };
}
