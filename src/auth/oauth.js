function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function textEncoder() {
  return new TextEncoder();
}

export function generateOAuthSecret(prefix = 'hbo_') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
  return `${prefix}${secret}`;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPkceChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function signOAuthJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(textEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(textEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyOAuthJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));

  if (header.alg !== 'HS256') {
    throw new Error('Unsupported token algorithm');
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(encodedSignature),
    textEncoder().encode(signingInput)
  );

  if (!valid) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= now) {
    const error = new Error('Token expired');
    error.code = 'expired';
    throw error;
  }

  return payload;
}
