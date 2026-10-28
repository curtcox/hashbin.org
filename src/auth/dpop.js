import { signOAuthJwt, verifyOAuthJwt } from './oauth.js';

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function dpopNonce(env) {
  return signOAuthJwt({ token_type: 'dpop_nonce', jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 }, env.OAUTH_SIGNING_KEY);
}

// Verify before consuming the jti. Only public P-256 keys, ES256, exact method/URL,
// bounded clocks, a fresh server nonce and (for resources) an access-token hash.
export async function verifyDPoP(request, env, { expectedJkt, accessToken } = {}) {
  const raw = request.headers.get('dpop');
  if (!raw || raw.length > 8192) throw new Error('Missing DPoP proof');
  const parts = raw.split('.');
  if (parts.length !== 3) throw new Error('Invalid DPoP proof');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const proof = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const jwk = header.jwk;
  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256' || header.crit !== undefined || header.b64 === false || jwk?.kty !== 'EC' || jwk.crv !== 'P-256' || Object.hasOwn(jwk, 'd') || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw new Error('Invalid DPoP key');
  const publicKey = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const jkt = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))));
  if (expectedJkt && expectedJkt !== jkt) throw new Error('DPoP key mismatch');
  const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error('Invalid DPoP signature');
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  if (proof.htm !== request.method || proof.htu !== `${url.origin}${url.pathname}` || !Number.isInteger(proof.iat) || Math.abs(now - proof.iat) > 60 || typeof proof.jti !== 'string' || proof.jti.length < 16 || proof.jti.length > 200) throw new Error('Invalid DPoP claims');
  const nonce = await verifyOAuthJwt(proof.nonce, env.OAUTH_SIGNING_KEY);
  if (nonce.token_type !== 'dpop_nonce' || !nonce.exp) throw new Error('Invalid DPoP nonce');
  if (accessToken) {
    const ath = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))));
    if (proof.ath !== ath) throw new Error('Invalid DPoP token hash');
  }
  const stub = env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName(`dpop:${jkt}`));
  const response = await stub.fetch(new Request('http://internal/dpop/consume', { method: 'POST', body: JSON.stringify({ jti: proof.jti, expires_at: (proof.iat + 61) * 1000 }) }));
  if (!response.ok) throw new Error('DPoP proof replay');
  return jkt;
}
