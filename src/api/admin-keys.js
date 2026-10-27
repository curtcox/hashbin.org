/**
 * Admin keys: hba_ keys holding only the admin scopes they were issued with.
 *
 * Only the ADMIN_USER_ID session may issue, list or revoke them (the route table's
 * ADMIN_SESSION access). They live in that account's profile as hashes, expire within
 * 90 days, and stop working if ADMIN_USER_ID changes.
 */

import { authenticate, requireAuth } from '../auth/middleware.js';
import { generateApiKey } from '../auth/download-tokens.js';
import { generateKeyId, hashApiKey, validateKeyName } from '../auth/utils.js';
import { ADMIN_SCOPES, ALL_ADMIN_SCOPES, parseScopes } from '../auth/scopes.js';

const MAX_ADMIN_KEY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function adminProfile(env, userId) {
  return env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId));
}

/**
 * POST /api/admin/keys — body { name?, scopes, expires_in_days }
 */
export async function handleCreateAdminKey(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const scopes = parseScopes(body.scopes, 'admin');
  if (!scopes || scopes.length === 0) {
    return Response.json({ error: 'Invalid scopes', message: `scopes must be a non-empty list drawn from: ${ALL_ADMIN_SCOPES.join(', ')}` }, { status: 400 });
  }
  const days = Number(body.expires_in_days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ADMIN_KEY_DAYS) {
    return Response.json({ error: 'Invalid expiration', message: `expires_in_days must be a whole number from 1 to ${MAX_ADMIN_KEY_DAYS}` }, { status: 400 });
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Admin key';
  const nameValidation = validateKeyName(name);
  if (!nameValidation.valid) {
    return Response.json({ error: 'Invalid key name', message: nameValidation.message }, { status: 400 });
  }
  if (!env.DOWNLOAD_TOKEN_SECRET) {
    return Response.json({ error: 'DOWNLOAD_TOKEN_SECRET must be configured before creating keys' }, { status: 503 });
  }

  const keyId = generateKeyId();
  const adminKey = await generateApiKey(authResult.user.userId, keyId, env.DOWNLOAD_TOKEN_SECRET, 'hba');
  const response = await adminProfile(env, authResult.user.userId).fetch(new Request('http://internal/admin-keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key_id: keyId,
      key_hash: await hashApiKey(adminKey),
      name,
      scopes,
      expires_at: new Date(Date.now() + days * DAY_MS).toISOString()
    })
  }));
  if (!response.ok) return response;

  return Response.json({
    ...(await response.json()),
    admin_key: adminKey,
    warning: 'Save this admin key securely. It cannot be shown again.'
  }, { status: 201 });
}

/**
 * GET /api/admin/keys — the admin's keys (never their hashes) and the scopes a key may hold
 */
export async function handleListAdminKeys(request, env) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const response = await adminProfile(env, authResult.user.userId).fetch(new Request('http://internal/admin-keys'));
  if (!response.ok) return response;
  return Response.json({ keys: await response.json(), scopes: ADMIN_SCOPES });
}

/**
 * DELETE /api/admin/keys/:keyId
 */
export async function handleRevokeAdminKey(request, env, keyId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;

  return adminProfile(env, authResult.user.userId).fetch(
    new Request(`http://internal/admin-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' })
  );
}
