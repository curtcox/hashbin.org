import { authenticate, requireAuth } from '../auth/middleware.js';
import { signDownloadToken } from '../auth/download-tokens.js';
import { getContentBaseUrl } from '../utils/content-domain.js';
import { validate256tCID } from '../utils/hash256t.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleDownloads(request, env) {
  const response = await routeDownloads(request, env);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
async function routeDownloads(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const auth = await authenticate(request, env);
  const error = requireAuth(auth); if (error) return error;
  const user = auth.user;
  const owner = user.authMethod === 'clerk' || (env.ENVIRONMENT === 'local' && user.authMethod === 'local');
  const minting = path === '/api/downloads/sign';
  if (!owner && !minting) return json({ error: 'Account session required to manage download budgets' }, 403);
  if (user.authMethod === 'oauth' && !user.oauth.scopes.includes('downloads:spend')) return json({ error: 'insufficient_scope' }, 403);
  const stub = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(user.userId));
  const call = (route, verb = method, data) => stub.fetch(new Request(`https://internal${route}`, { method: verb,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) }));
  try {
    const data = ['PUT', 'POST', 'DELETE'].includes(method) ? await request.json() : {};
    if (path === '/api/downloads/budget' && ['GET', 'PUT'].includes(method)) return call('/download/budget', method, method === 'PUT' ? data : undefined);
    const key = path.match(/^\/api\/(auth\/apikeys|oauth\/grants)\/([^/]+)\/download-budget$/);
    if (key && method === 'PUT') return call('/download/key-budget', 'PUT', { key_id: key[2], kind: key[1] === 'oauth/grants' ? 'oauth' : 'key', caps: data.caps });
    if (path === '/api/downloads/sessions' && ['GET', 'DELETE'].includes(method)) return call('/download/sessions', method, method === 'DELETE' ? { sid: data.session_id } : undefined);
    if (minting && method === 'POST') {
      if (!env.DOWNLOAD_TOKEN_SECRET) return json({ error: 'Download signing is not configured' }, 503);
      if (!Array.isArray(data.cids) || !data.cids.length || data.cids.length > 100 || data.cids.some(cid => typeof cid !== 'string' || !validate256tCID(cid))) return json({ error: 'Supply 1–100 valid CIDs' }, 400);
      const seconds = data.expires_in ?? 3600;
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 7 * 86400) return json({ error: 'expires_in must be 1–604800 seconds' }, 400);
      const iat = Math.floor(Date.now() / 1000);
      // Account URLs use a revocable browser session as their spending identity.
      let identity;
      if (user.keyId) identity = { u: user.userId, k: user.keyId, kind: 'key' };
      else if (user.oauth) identity = { u: user.userId, k: user.oauth.grantId, kind: 'oauth', app_id: user.oauth.appId };
      else {
        const created = await call('/download/sessions', 'POST', {});
        if (!created.ok) return created;
        const { sid } = await created.json();
        const activated = await call('/download/session/activate', 'POST', { sid });
        if (!activated.ok) return activated;
        identity = { u: user.userId, sid, kind: 'session' };
      }
      const urls = await Promise.all(data.cids.map(async cid => ({ cid,
        url: `${getContentBaseUrl(env, request)}/s/${await signDownloadToken({ ...identity, cid, type: 'url', iat, exp: iat + seconds }, env.DOWNLOAD_TOKEN_SECRET)}/${cid}` })));
      return json({ urls, expires_at: new Date((iat + seconds) * 1000).toISOString() });
    }
    if (path === '/api/downloads/session' && method === 'POST') {
      if (!env.DOWNLOAD_TOKEN_SECRET) return json({ error: 'Download signing is not configured' }, 503);
      if (data.cid !== undefined && (typeof data.cid !== 'string' || !validate256tCID(data.cid))) return json({ error: 'Invalid CID' }, 400);
      const created = await call('/download/sessions', 'POST', {});
      if (!created.ok) return created;
      const { sid } = await created.json();
      const iat = Math.floor(Date.now() / 1000);
      const token = await signDownloadToken({ u: user.userId, sid, cid: data.cid, type: 'handshake', iat, exp: iat + 60 }, env.DOWNLOAD_TOKEN_SECRET);
      return json({ url: `${getContentBaseUrl(env, request)}/_/session?t=${token}` });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'Invalid JSON' : 'Downloads temporarily unavailable' }, error instanceof SyntaxError ? 400 : 503);
  }
}
