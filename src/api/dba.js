/**
 * Link a devicebasedauth.org ("DBA") account to the signed-in HashBin account.
 *
 * Linking is an OpenID Connect round trip (authorization code + PKCE) to DBA. The state,
 * nonce and PKCE verifier stay in the user's profile Durable Object for ten minutes and are
 * used once, so a code arriving at the callback only links the account that started it.
 * Afterwards the DbaLink index maps the DBA account to this user and the profile records the
 * reverse; device credentials from that DBA account then act as this user (src/auth/dba.js).
 * All four routes are session-only (src/index.js).
 */

import { authenticate } from '../auth/middleware.js';
import { claimDbaLink, dbaIssuer, dbaOidcClient, linkedUserId, releaseDbaLink } from '../auth/dba.js';

const STATE_TTL_SECONDS = 600;
const ACCOUNT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function profileStub(env, userId) {
  return env.USER_PROFILES.get(env.USER_PROFILES.idFromName(userId));
}

async function profileCall(env, userId, path, method = 'GET', body) {
  return profileStub(env, userId).fetch(new Request(`https://internal${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }));
}

function unavailable(error) {
  return json({ error: 'dba_unavailable', message: `Could not reach devicebasedauth.org: ${error.message}` }, 502);
}

function notConfigured() {
  return json({ error: 'dba_not_configured', message: 'DBA_ISSUER is not a valid issuer' }, 503);
}

/**
 * GET /api/auth/dba/link: { linked, account, linked_at, issuer }
 */
export async function handleGetDbaLink(request, env) {
  const { user } = await authenticate(request, env);
  const response = await profileCall(env, user.userId, '/dba/link');
  const { link } = response.ok ? await response.json() : { link: null };
  return json({ linked: Boolean(link), account: link?.account || null, linked_at: link?.linked_at || null, issuer: dbaIssuer(env) });
}

/**
 * POST /api/auth/dba/link/start: { url } to send the browser to. Starting again replaces
 * any link in progress.
 */
export async function handleStartDbaLink(request, env) {
  const { user } = await authenticate(request, env);
  const oidc = dbaOidcClient(env, request);
  if (!oidc) return notConfigured();
  let begun;
  try {
    begun = await oidc.begin({ scope: 'openid profile' });
  } catch (error) {
    return unavailable(error);
  }
  const stored = await profileCall(env, user.userId, '/dba/oidc-state', 'POST', { state: begun.state, ttl_seconds: STATE_TTL_SECONDS });
  if (!stored.ok) return json({ error: 'link_failed', message: 'Could not start linking' }, 500);
  return json({ url: begun.url, expires_in: STATE_TTL_SECONDS });
}

/**
 * The HashBin user whose link to this DBA account is no longer real: their profile no
 * longer names it, or the account was deleted or moved. Such a link may be taken over.
 */
async function staleOwner(env, account, ownerId) {
  const response = await profileCall(env, ownerId, '/profile');
  if (response.status === 404) return true;
  if (!response.ok) return false;
  const owner = await response.json();
  return owner.dba_link?.account !== account || Boolean(owner.deleted_at) || Boolean(owner.migrated_to);
}

/**
 * POST /api/auth/dba/link/finish with { code, state } (or { error, state }) from the callback.
 */
export async function handleFinishDbaLink(request, env) {
  const { user } = await authenticate(request, env);
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json({ error: 'invalid_request', message: 'Body must be JSON with code and state' }, 400);
  }
  const params = {};
  for (const name of ['code', 'state', 'error']) {
    if (body?.[name] === undefined) continue;
    if (typeof body[name] !== 'string' || body[name].length > 2048) return json({ error: 'invalid_request', message: `${name} must be a string` }, 400);
    params[name] = body[name];
  }
  if (!params.state || (!params.code && !params.error)) return json({ error: 'invalid_request', message: 'code and state are required' }, 400);

  const oidc = dbaOidcClient(env, request);
  if (!oidc) return notConfigured();

  // Single use: whatever happens next, this state cannot finish another link.
  const taken = await profileCall(env, user.userId, '/dba/oidc-state/take', 'POST', {});
  if (!taken.ok) return json({ error: 'no_pending_link', message: 'No link is in progress, or it expired. Start again.' }, 400);
  const saved = await taken.json();

  let claims;
  try {
    claims = await oidc.finish(new URLSearchParams(params), saved);
  } catch (error) {
    if (!error.code) return unavailable(error);
    return json({ error: 'link_failed', dba_error: error.code, message: error.message }, 400);
  }
  const account = claims.acct || claims.sub;
  if (typeof account !== 'string' || !ACCOUNT_PATTERN.test(account)) {
    return json({ error: 'link_failed', message: 'devicebasedauth.org did not name an account' }, 400);
  }

  const current = await profileCall(env, user.userId, '/dba/link');
  const previous = current.ok ? (await current.json()).link?.account : null;

  // Index first, then the profile: authentication needs both, so a failure between the
  // two leaves the account unlinked rather than half-linked.
  let claimed = await claimDbaLink(env, account, user.userId);
  if (claimed.status === 409) {
    const ownerId = await linkedUserId(env, account);
    if (ownerId && ownerId !== user.userId && await staleOwner(env, account, ownerId)) {
      claimed = await claimDbaLink(env, account, user.userId, ownerId);
    }
  }
  if (claimed.status === 409) {
    return json({ error: 'dba_account_linked_elsewhere', message: 'This devicebasedauth.org account is already linked to another HashBin account. Unlink it there first.' }, 409);
  }
  if (!claimed.ok) return json({ error: 'link_failed', message: 'Could not record the link' }, 500);
  const { linked_at: linkedAt } = await claimed.json();

  const updated = await profileCall(env, user.userId, '/dba/link', 'PUT', { account, linked_at: linkedAt });
  if (!updated.ok) {
    await releaseDbaLink(env, account, user.userId);
    return json(await updated.json().catch(() => ({ error: 'link_failed' })), updated.status);
  }
  if (previous && previous !== account) await releaseDbaLink(env, previous, user.userId);
  return json({ linked: true, account, linked_at: linkedAt, issuer: dbaIssuer(env) });
}

/**
 * DELETE /api/auth/dba/link: device credentials from the DBA account stop working here at once.
 */
export async function handleUnlinkDba(request, env) {
  const { user } = await authenticate(request, env);
  const response = await profileCall(env, user.userId, '/dba/link', 'DELETE', {});
  if (!response.ok) return json(await response.json().catch(() => ({ error: 'unlink_failed' })), response.status);
  const { unlinked } = await response.json();
  if (unlinked) await releaseDbaLink(env, unlinked, user.userId);
  return json({ linked: false, unlinked });
}

/**
 * GET /api/auth/dba/credentials: { credentials: [...] }, the linked account's credentials
 * this account has seen (last use, scopes, month's spend, expiry, download caps). Revoking one
 * happens at devicebasedauth.org.
 */
export async function handleListDbaCredentials(request, env) {
  const { user } = await authenticate(request, env);
  const response = await profileCall(env, user.userId, '/dba/credentials');
  if (!response.ok) return json({ credentials: [] });
  return json(await response.json());
}
