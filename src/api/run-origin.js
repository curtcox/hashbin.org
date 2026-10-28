import { authenticate, requireAuth } from '../auth/middleware.js';
import { adminActorId } from '../auth/admin.js';

const registry = env => env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));

export async function handleDeveloperRun(request, env, appId) {
  const auth = await authenticate(request, env);
  const error = requireAuth(auth);
  if (error) return error;
  const path = `https://internal/apps/${encodeURIComponent(appId)}/run`;
  if (request.method === 'GET') return registry(env).fetch(new Request(`${path}?owner_user_id=${encodeURIComponent(auth.user.userId)}`));
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  return registry(env).fetch(new Request(path, { method: 'PUT', body: JSON.stringify({ status: body?.status, allow_local: body?.allow_local, owner_user_id: auth.user.userId }) }));
}

// The route dispatcher requires admin:takedown before invoking this handler.
export async function handleAdminRun(request, env, appId, action) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  return registry(env).fetch(new Request(`https://internal/apps/${encodeURIComponent(appId)}/run/${action}`, {
    method: 'POST', body: JSON.stringify({ reason: body?.reason, actor: adminActorId(request) })
  }));
}
