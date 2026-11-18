/**
 * Signing helpers for the issuer (the devicebasedauth.org Worker) and for tests.
 * Verifiers do not need this module.
 */
import { signJws, importJwk, publicJwk } from './jose.js';
import { CREDENTIAL_TYP, ACCESS_TYP, STATUS_LIST_TYP, validateCredentialPayload } from './credential.js';
import { encodeStatusList } from './status-list.js';

/** Import an issuer key { kid, jwk (private, with d) } for signing. */
export async function issuerSigner({ kid, jwk }) {
  return { kid, key: await importJwk(jwk, 'sign'), publicJwk: { ...publicJwk(jwk), kid, alg: 'ES256', use: 'sig' } };
}

/** Build a JWKS from issuer keys (public halves only). */
export function jwksFor(keys) {
  return { keys: keys.map(({ kid, jwk }) => ({ ...publicJwk(jwk), kid, alg: 'ES256', use: 'sig' })) };
}

/** Sign a device credential after validating its payload. */
export async function signCredential(payload, signer, typ = CREDENTIAL_TYP) {
  const problems = validateCredentialPayload(payload, { typ });
  if (problems.length) throw new Error(`invalid credential: ${problems.join('; ')}`);
  return signJws({ typ, kid: signer.kid }, payload, signer.key);
}

/** Sign a short-lived access token (bearer; carries the same grants). */
export function signAccessToken(payload, signer) { return signCredential(payload, signer, ACCESS_TYP); }

/** Sign a status list token for the bytes of one list. */
export async function signStatusList({ uri, bytes, issuer, ttl = 60, now = Math.floor(Date.now() / 1000), lifetime = 86400 }, signer) {
  return signJws({ typ: STATUS_LIST_TYP, kid: signer.kid }, { iss: issuer, sub: uri, iat: now, exp: now + lifetime, ttl, status_list: await encodeStatusList(bytes) }, signer.key);
}
