/**
 * Minimal JOSE helpers (ES256 only) on WebCrypto. No dependencies, so the same code runs in
 * Workers, Node 22+, Deno, Bun and browsers.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ES256 = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

/** Encode bytes or a string as unpadded base64url. */
export function b64u(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Decode base64url to bytes; throws on invalid input. */
export function unb64u(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('invalid base64url');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Decode base64url JSON. */
export function unb64uJson(value) { return JSON.parse(decoder.decode(unb64u(value))); }

/** SHA-256 of a string, base64url encoded. */
export async function sha256b64u(value) {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value)));
}

/** Keep only the public members of a P-256 JWK, in a fixed order. */
export function publicJwk(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw new Error('expected a P-256 public JWK');
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/** RFC 7638 JWK thumbprint (SHA-256, base64url). */
export async function jwkThumbprint(jwk) {
  const { crv, kty, x, y } = publicJwk(jwk);
  return sha256b64u(JSON.stringify({ crv, kty, x, y }));
}

/** Generate a P-256 key pair. Browsers should pass extractable=false so the private key can never be exported. */
export async function generateKeyPair(extractable = false) {
  return crypto.subtle.generateKey(ES256, extractable, ['sign', 'verify']);
}

/** Export the public key of a CryptoKey pair as a JWK. */
export async function exportPublicJwk(publicKey) { return publicJwk(await crypto.subtle.exportKey('jwk', publicKey)); }

/** Import a P-256 JWK as a verify (public) or sign (private, has d) key. */
export async function importJwk(jwk, usage = jwk.d ? 'sign' : 'verify') {
  const key = usage === 'sign' ? { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d } : publicJwk(jwk);
  return crypto.subtle.importKey('jwk', key, ES256, false, [usage]);
}

/**
 * Sign a compact JWS with ES256. `privateKey` is a WebCrypto private key, or an external signer
 * `{ sign(bytes) }` resolving to the 64-byte r ‖ s signature over SHA-256 of `bytes`, for keys
 * that live in a TPM, HSM or secure element and never come into this process.
 */
export async function signJws(header, payload, privateKey) {
  const input = `${b64u(JSON.stringify({ ...header, alg: 'ES256' }))}.${b64u(JSON.stringify(payload))}`;
  const bytes = encoder.encode(input);
  const signature = typeof privateKey?.sign === 'function' ? await privateKey.sign(bytes) : await crypto.subtle.sign(SIGN, privateKey, bytes);
  const raw = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (raw.length !== 64) throw new Error('an ES256 signature is 64 bytes (r ‖ s)');
  return `${input}.${b64u(raw)}`;
}

/**
 * Split and decode a compact JWS without verifying it. Use this to read a credential;
 * never trust what it says until verifyJws succeeds.
 */
export function decodeJws(jws) {
  if (typeof jws !== 'string' || jws.length > 65536) throw new Error('invalid_format');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('invalid_format');
  try {
    const header = unb64uJson(parts[0]); const payload = unb64uJson(parts[1]); const signature = unb64u(parts[2]);
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_format');
    return { header, payload, signature, signingInput: `${parts[0]}.${parts[1]}` };
  } catch { throw new Error('invalid_format'); }
}

/** Verify a compact JWS against a public key (CryptoKey or JWK). Returns the decoded parts or null. */
export async function verifyJws(jws, key) {
  let decoded;
  try { decoded = decodeJws(jws); } catch { return null; }
  if (decoded.header.alg !== 'ES256' || decoded.signature.length !== 64) return null;
  const cryptoKey = key?.type ? key : await importJwk(key, 'verify');
  const ok = await crypto.subtle.verify(SIGN, cryptoKey, decoded.signature, encoder.encode(decoded.signingInput));
  return ok ? decoded : null;
}
