import { authenticate, requireAuth } from '../auth/middleware.js';
import { checkApp } from '../app-safety.js';

const registry = env => env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
const store = (env, result) => registry(env).fetch(new Request(`http://internal/apps/${encodeURIComponent(result.app_id)}/safety`, { method: 'PUT', body: JSON.stringify(result) }));

/** The hosts of this Worker's routes in wrangler.toml. */
export const SITE_HOSTS = ['hashbin.org', 'www.hashbin.org'];
const MAX_REDIRECTS = 5;

/**
 * A fetch for the safety check that reads this site's own pages from static assets. The routes
 * have no origin server, so a Worker subrequest to them answers 522 instead of reaching the
 * Worker. Asset responses carry the `_headers` rules, as visitors see them.
 */
export function safetyFetch(env, fetchImpl = fetch) {
  return async (input, init = {}) => {
    let url = new URL(input);
    for (let redirects = 0; env.ASSETS && SITE_HOSTS.includes(url.hostname); redirects++) {
      const response = await env.ASSETS.fetch(new Request(url, { headers: init.headers }));
      const location = response.headers.get('location');
      if (response.status < 300 || response.status > 399 || !location || redirects === MAX_REDIRECTS) return response;
      url = new URL(location, url);
    }
    return fetchImpl(url.href, init);
  };
}

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
  const result = await checkApp(app, apps, { runDomain: env.RUN_DOMAIN, fetch: safetyFetch(env) });
  await store(env, result);
  return Response.json(result);
}

/** Nightly: re-check the least recently checked apps so regressions are noticed without a visit. */
export async function runAppSafetyChecks(env, { limit = 20 } = {}) {
  const { apps, due } = await (await registry(env).fetch(new Request(`http://internal/safety/due?limit=${limit}`))).json();
  for (const app of due) {
    try { await store(env, await checkApp(app, apps, { runDomain: env.RUN_DOMAIN, fetch: safetyFetch(env) })); } catch (error) { console.error('App safety check failed:', app.app_id, error); }
  }
  return due.length;
}
