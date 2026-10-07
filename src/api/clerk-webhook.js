/**
 * POST /api/webhooks/clerk
 *
 * Keeps UserProfiles in step with Clerk. Most importantly, when a user is deleted in
 * Clerk their profile is soft-deleted, which also stops their API keys (API keys don't
 * go through Clerk, so without this they would keep working).
 *
 * Clerk signs webhooks with Svix: HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}"
 * using the base64 key in CLERK_WEBHOOK_SECRET ("whsec_..."). See docs/deployment.md.
 */

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Verify a Svix-signed webhook
 * @param {string} secret - Signing secret ("whsec_<base64>")
 * @param {Headers} headers - Request headers
 * @param {string} body - Raw request body
 * @param {number} [nowSeconds] - Current time (for tests)
 * @returns {Promise<boolean>} True if any signature matches and the timestamp is fresh
 */
export async function verifySvixSignature(secret, headers, body, nowSeconds = Math.floor(Date.now() / 1000)) {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = bytesToBase64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));

  // Header holds space-separated "v1,<base64>" entries (several during secret rotation)
  return signatureHeader.split(' ').some(entry => {
    const [version, signature] = entry.split(',');
    return version === 'v1' && signature && timingSafeEqual(signature, expected);
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function providersFrom(user) {
  return (user.external_accounts || []).map(account => ({
    provider: String(account.provider || '').replace(/^oauth_/, ''),
    linked_at: account.created_at ? new Date(account.created_at).toISOString() : null
  }));
}

export async function handleClerkWebhook(request, env) {
  if (!env.CLERK_WEBHOOK_SECRET) {
    return json({ error: 'Clerk webhook secret not configured' }, 503);
  }

  const body = await request.text();
  if (!(await verifySvixSignature(env.CLERK_WEBHOOK_SECRET, request.headers, body))) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const userId = event?.data?.id;
  if (!userId || !['user.created', 'user.updated', 'user.deleted'].includes(event.type)) {
    // Acknowledge events we don't act on so Clerk doesn't retry them
    return json({ received: true, ignored: true });
  }

  const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId));

  if (event.type === 'user.deleted') {
    const response = await profile.fetch(new Request('http://internal/profile', { method: 'DELETE' }));
    // 404: the user never used HashBin, nothing to delete
    return json({ received: true, deleted: response.ok }, response.ok || response.status === 404 ? 200 : 500);
  }

  // user.created / user.updated: make sure a profile exists (409 = already there)
  const response = await profile.fetch(new Request('http://internal/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: userId, providers: providersFrom(event.data) })
  }));
  return json({ received: true, created: response.status === 201 }, response.ok || response.status === 409 ? 200 : 500);
}
