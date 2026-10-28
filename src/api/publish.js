import { authenticate, requireAuth } from '../auth/middleware.js';
import { signOAuthJwt, verifyOAuthJwt } from '../auth/oauth.js';
import { generate256tHash } from '../utils/hash256t.js';
import { calculateRetentionCost } from '../utils/pricing.js';
import { handleUploadContent } from './content.js';

const MAX_BYTES = 5 * 1024 * 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function getPublishApp(env, clientId, redirectUri) {
  const registry = env.APPLICATION_REGISTRY.get(env.APPLICATION_REGISTRY.idFromName('global'));
  const response = await registry.fetch(new Request(`http://internal/apps/${encodeURIComponent(clientId)}`));
  if (!response.ok) return null;
  const app = await response.json();
  return app.status === 'active' && app.redirect_uris.includes(redirectUri) ? app : null;
}

export async function handlePublishApp(request, env) {
  const url = new URL(request.url);
  const app = await getPublishApp(env, url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'));
  return app ? json({ app_id: app.app_id, app_name: app.app_name, redirect_uri: url.searchParams.get('redirect_uri'), origin_warnings: app.origin_warnings || [] }) : json({ error: 'invalid_client' }, 400);
}

export async function handlePublish(request, env) {
  const auth = await authenticate(request, env);
  const denied = requireAuth(auth);
  if (denied) return denied;
  if (!auth.user.session) return json({ error: 'session_required' }, 403);
  const url = new URL(request.url);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: 'invalid_size' }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return json({ error: 'invalid_size' }, 413);
  const cid = await generate256tHash(bytes);
  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  if (contentType.toLowerCase().includes('multipart/form-data')) return json({ error: 'invalid_content_type' }, 400);
  const approval = request.headers.get('x-hashbin-approval');
  if (!approval) {
    const app = await getPublishApp(env, url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'));
    if (!app) return json({ error: 'invalid_client' }, 400);
    const retention = Number(url.searchParams.get('retention_months') || auth.user.profile?.default_retention_months || 1);
    if (!Number.isInteger(retention) || retention < 1 || retention > 120) return json({ error: 'invalid_retention' }, 400);
    const cost = calculateRetentionCost(bytes.byteLength, retention);
    const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(auth.user.userId));
    const balance = await (await profile.fetch(new Request('http://internal/balance'))).json();
    const token = await signOAuthJwt({ token_type: 'publish_approval', user_id: auth.user.userId, app_id: app.app_id, redirect_uri: url.searchParams.get('redirect_uri'), cid, content_type: contentType, retention_months: retention, cost_cents: cost, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 }, env.OAUTH_SIGNING_KEY);
    return json({ cid, size_bytes: bytes.byteLength, retention_months: retention, cost_cents: cost, balance_cents: balance.balance_cents, approval: token });
  }
  let claims;
  try { claims = await verifyOAuthJwt(approval, env.OAUTH_SIGNING_KEY); }
  catch { return json({ error: 'approval_expired' }, 400); }
  if (claims.token_type !== 'publish_approval' || claims.user_id !== auth.user.userId || claims.cid !== cid || claims.content_type !== contentType) return json({ error: 'approval_mismatch' }, 400);
  if (!await getPublishApp(env, claims.app_id, claims.redirect_uri)) return json({ error: 'invalid_client' }, 400);
  if (claims.cost_cents !== calculateRetentionCost(bytes.byteLength, claims.retention_months)) return json({ error: 'price_changed' }, 409);
  const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(auth.user.userId));
  const consumed = await profile.fetch(new Request('http://internal/oauth/codes/redeem', { method: 'POST', body: JSON.stringify({ jti: claims.jti, expires_at: claims.exp }) }));
  if (!consumed.ok) return json({ error: 'approval_used' }, 409);
  const uploadUrl = new URL('/api/content', url);
  uploadUrl.searchParams.set('retention_months', claims.retention_months);
  uploadUrl.searchParams.set('max_cost_cents', claims.cost_cents);
  const headers = new Headers(request.headers);
  headers.delete('x-hashbin-approval');
  return handleUploadContent(new Request(uploadUrl, { method: 'POST', headers, body: bytes }), env, { appId: claims.app_id });
}
