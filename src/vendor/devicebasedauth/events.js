// Signed events devicebasedauth.org pushes to an audience's webhook (spec/events.md).
// Events are compact JWS signed with the issuer key, so an audience verifies them with the same
// JWKS it already trusts for credentials: there is no per-audience shared secret to leak.
import { decodeJws, verifyJws } from './jose.js';
import { VerificationError, CLOCK_SKEW, DEFAULT_ISSUER } from './credential.js';

export const EVENT_TYP = 'dba-event+jwt';
export const EVENT_TYPES = Object.freeze(['credentials.revoked', 'webhook.test']);
/** Events older than this are refused, so a captured body cannot be replayed much later. */
export const EVENT_MAX_AGE = 600;

const fail = (code, message) => { throw new VerificationError(code, message); };

/**
 * Check an event payload's shape. Returns a list of problems (empty when valid).
 * credentials.revoked carries { credentials: [{ cid, jti, exp, status: { idx, uri } }] }.
 */
export function validateEventPayload(payload) {
  const errors = [];
  if (typeof payload?.jti !== 'string' || !payload.jti) errors.push('jti is required');
  if (typeof payload?.aud !== 'string') errors.push('aud must be one audience name');
  if (!Number.isSafeInteger(payload?.iat)) errors.push('iat must be an integer');
  if (!EVENT_TYPES.includes(payload?.type)) errors.push(`type must be one of ${EVENT_TYPES.join(', ')}`);
  if (payload?.type === 'credentials.revoked') {
    if (!Array.isArray(payload.credentials) || !payload.credentials.length) errors.push('credentials must be a non-empty list');
    else payload.credentials.forEach((c, i) => {
      if (typeof c?.cid !== 'string') errors.push(`credentials[${i}].cid is required`);
      if (!Number.isSafeInteger(c?.status?.idx) || c.status.idx < 0 || typeof c?.status?.uri !== 'string') errors.push(`credentials[${i}].status must be { idx, uri }`);
      if (!Number.isSafeInteger(c?.exp)) errors.push(`credentials[${i}].exp must be an integer`);
    });
  }
  return errors;
}

/**
 * Verify a webhook body: signature by a key in jwks, issuer, audience, age and shape.
 * Returns { header, payload }; throws VerificationError (codes: invalid_format, wrong_type,
 * unknown_kid, invalid_signature, wrong_issuer, wrong_audience, stale_event, invalid_claims).
 */
export async function verifyEvent(jws, { jwks, issuer = DEFAULT_ISSUER, audience, now = Math.floor(Date.now() / 1000), maxAge = EVENT_MAX_AGE } = {}) {
  let decoded;
  try { decoded = decodeJws(String(jws ?? '').trim()); } catch { fail('invalid_format', 'Not a compact JWS'); }
  const { header, payload } = decoded;
  if (header.typ !== EVENT_TYP) fail('wrong_type', `Expected typ ${EVENT_TYP}`);
  const jwk = jwks?.keys?.find(k => k.kid === header.kid);
  if (!jwk) fail('unknown_kid', `Unknown signing key ${header.kid}`);
  if (!await verifyJws(String(jws).trim(), jwk)) fail('invalid_signature', 'Signature does not verify');
  if (payload.iss !== issuer) fail('wrong_issuer', `Issuer is not ${issuer}`);
  const problems = validateEventPayload(payload);
  if (problems.length) fail('invalid_claims', problems.join('; '));
  if (audience !== undefined && payload.aud !== audience) fail('wrong_audience', `Not addressed to ${audience}`);
  if (payload.iat > now + CLOCK_SKEW || payload.iat < now - maxAge) fail('stale_event', 'Event is too old (or from the future)');
  return { header, payload };
}
