import { authenticate, requireAuth } from '../auth/middleware.js';
import { checkApp } from '../app-safety.js';

const registry = env => env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
const store = (env, result) => registry(env).fetch(new Request(`http://internal/apps/${encodeURIComponent(result.app_id)}/safety`, { method: 'PUT', body: JSON.stringify(result) }));

/** GET returns the latest safety check of an owned app; POST runs a new one (at most once a minute). */
export async function handleDeveloperAppSafety(request, env, appId) {
  const authResult = await authenticate(request, env);
  const authError = requireAuth(authResult);
  if (authError) return authError;
  const response = await registry(env).fetch(new Request(`http://internal/apps/${encodeURIComponent(appId)}/safety?owner_user_id=${encodeURIComponent(authResult.user.userId)}`));
  if (!response.ok) return response;
  const { app, apps, last } = await response.json();
  if (request.method === 'GET') return Response.json(last || { app_id: appId, pages: [], checked_at: null });
  if (last && Date.now() - Date.parse(last.checked_at) < 60000) return Response.json({ ...last, throttled: true });
  const result = await checkApp(app, apps);
  await store(env, result);
  return Response.json(result);
}

/** Nightly: re-check the least recently checked apps so regressions are noticed without a visit. */
export async function runAppSafetyChecks(env, { limit = 20 } = {}) {
  const { apps, due } = await (await registry(env).fetch(new Request(`http://internal/safety/due?limit=${limit}`))).json();
  for (const app of due) {
    try { await store(env, await checkApp(app, apps)); } catch (error) { console.error('App safety check failed:', app.app_id, error); }
  }
  return due.length;
}
