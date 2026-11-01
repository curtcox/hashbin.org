import { applyRateLimit } from '../auth/middleware.js';
import { checkCaveats, spenderOf, hasScope, isSessionAuth, insufficientScopeResponse } from '../auth/scopes.js';
import { normalizeAliasName } from '../utils/alias-names.js';
import { aliasSafety, sampleAliasResolution, resolveGlobalAlias, resolvePersonalAlias } from '../utils/alias-resolution.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function ensureAliasProfile(env, auth) {
  const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(auth.user.userId));
  if (auth.user.profileExists === false) {
    const response = await profile.fetch(new Request('https://internal/profile', { method: 'POST',
      body: JSON.stringify({ user_id: auth.user.userId, providers: [] }) }));
    if (!response.ok && response.status !== 409) throw new Error('Profile creation unavailable');
  }
  return profile;
}

/** Forward authorized personal-alias requests; identity and spender come from auth only. */
export async function handleUserAliases(request, env) {
  const limited = applyRateLimit(request, request.auth);
  if (limited) return limited;
  const url = new URL(request.url), method = request.method;
  let body;
  if (!['GET', 'DELETE'].includes(method)) {
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400);
    if (method === 'PATCH' && body.auto_renew === true && !isSessionAuth(request.auth) && !hasScope(request.auth, 'aliases:purchase')) return insufficientScopeResponse('aliases:purchase');
    const denied = checkCaveats(request.auth, { cid: body.cid, retention_months: method === 'POST' ? body.months ?? 12 : undefined });
    if (denied) return denied;
    body = { ...body, spender: spenderOf(request.auth) };
  }
  const name = url.pathname.match(/\/personal\/([^/]+)/)?.[1];
  let profile;
  try { profile = await ensureAliasProfile(env, request.auth); }
  catch { return json({ error: 'profile_unavailable' }, 503); }
  // Renew/delete/settings also act on the stored CID, which a caller cannot
  // replace with an allowed CID in a fabricated request body.
  if (name && request.user.caveats?.cids) {
    const response = await profile.fetch(new Request('https://internal/aliases'));
    if (!response.ok) return response;
    const alias = (await response.json()).personal.find(a => a.name === normalizeAliasName(name));
    if (alias) {
      const denied = checkCaveats(request.auth, { cid: alias.cid });
      if (denied) return denied;
    }
  }
  const response = await profile.fetch(new Request(`https://internal${url.pathname.replace('/api/user', '')}`, {
    method, ...(body ? { body: JSON.stringify(body) } : {})
  }));
  if (method === 'GET' && response.ok && request.user.caveats?.cids) {
    const result = await response.json(), allowed = a => request.user.caveats.cids.includes(a.cid);
    return json({ ...result, personal: result.personal.filter(allowed), global: result.global.filter(allowed), offers: [] });
  }
  return response;
}

/** Resolve private aliases using optional auth, respecting the brake and read scope. */
export async function handleResolveAlias(request, env, match) {
  const limited = applyRateLimit(request, request.auth);
  if (limited) { sampleAliasResolution(env, match[1], limited.status); return limited; }
  let response;
  try {
    const safety = await aliasSafety(env);
    if (safety.hard_stop || safety.brake) {
      response = json({ error: safety.hard_stop ? 'hard_stop' : 'cost_brake' }, safety.hard_stop ? 503 : 429);
      response.headers.set('Retry-After', '60');
    } else {
      const name = normalizeAliasName(match[1]);
      const auth = request.auth;
      if (!name) response = json({ error: 'invalid_name' }, 404);
      else if (!auth?.authenticated) {
        if (request.headers.has('Authorization') || request.headers.has('X-API-Key')) response = json({ error: 'invalid_identity' }, 401);
        else {
          const global = await resolveGlobalAlias(env, name);
          response = json(global.cid ? { cid: global.cid, source: 'global' } : { error: global.error }, global.status);
        }
      } else if (!isSessionAuth(auth) && !hasScope(auth, 'aliases:read')) response = insufficientScopeResponse('aliases:read');
      else {
        await ensureAliasProfile(env, auth);
        const alias = await resolvePersonalAlias(env, { u: auth.user.userId, kind: 'api' }, name, true);
        if (alias?.invalid) response = json({ error: 'invalid_identity' }, 401);
        else {
          if (alias) response = checkCaveats(auth, { cid: alias.cid }) || json({ cid: alias.cid, source: 'personal' });
          else {
            const global = await resolveGlobalAlias(env, name);
            response = global.cid ? checkCaveats(auth, { cid: global.cid }) || json({ cid: global.cid, source: 'global' }) : json({ error: global.error }, global.status);
          }
        }
      }
    }
  } catch { response = json({ error: 'alias_resolution_unavailable' }, 503); }
  response.headers.set('Cache-Control', 'private, no-store');
  sampleAliasResolution(env, match[1], response.status === 200 ? 302 : response.status);
  return response;
}

/** Global namespace API. Only dispatcher-verified auth can supply ownership/admin fields. */
export async function handleGlobalAlias(request, env, match) {
  const limited = applyRateLimit(request, request.auth);
  if (limited) return limited;
  const name = normalizeAliasName(match[1]);
  if (!name) return json({ error: 'invalid_name' }, 400);
  let data = {};
  if (!['GET', 'DELETE'].includes(request.method)) {
    try { data = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'invalid_request' }, 400);
  }
  const url = new URL(request.url), parts = url.pathname.split('/');
  let action = parts[parts.length - 1];
  if (url.pathname.startsWith('/api/admin/')) action = parts[5];
  else if (parts.length === 4) action = request.method === 'GET' ? 'info' : 'settings';
  else if (action === 'offers') action = request.method === 'GET' ? 'offers-list' : 'offer';
  else if (parts.includes('offers') && request.method === 'DELETE') action = 'withdraw';
  else if (action === 'listing' && request.method === 'DELETE') action = 'unlist';
  const auth = request.auth;
  const user = auth?.authenticated ? auth.user : null;
  if (action === 'settings' && data.auto_renew === true && !isSessionAuth(auth) && !hasScope(auth, 'aliases:purchase')) return insufficientScopeResponse('aliases:purchase');
  // Public information accepts session identity only; delegated credentials must
  // never learn whether a third-party app's user owns a name through a public route.
  const publicInfo = action === 'info';
  const body = { ...data, name, user_id: publicInfo && !isSessionAuth(auth) ? undefined : user?.userId,
    admin: url.pathname.startsWith('/api/admin/') && hasScope(auth, 'admin:takedown'),
    spender: spenderOf(auth), caveats: user?.caveats || {},
    offer_id: parts.includes('offers') ? parts[5] : undefined };
  try {
    if (!publicInfo && auth?.authenticated) await ensureAliasProfile(env, auth);
    const response = await env.ALIAS_RECORDS.get(env.ALIAS_RECORDS.idFromName(`alias:${name}`))
      .fetch(new Request(`https://internal/${action}`, { method: 'POST', body: JSON.stringify(body) }));
    const headers = new Headers(response.headers); headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
  } catch { return json({ error: 'alias_unavailable' }, 503); }
}
