import { authenticate, requireAuth } from '../auth/middleware.js';
import { adminActorId } from '../auth/admin.js';
import { runRunOriginCostMonitor } from '../services/cost-monitor.js';
import { logAuditEntry } from './admin.js';

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

// Bootstrap/recover real safety evidence without waiting for the next UTC hour.
// This never overrides a latched monthly cap or changes a manual brake.
export async function handleRefreshRunCost(request, env) {
  if (!env.RUN_DOMAIN) return Response.json({ error: 'Hosted run domain is not configured' }, { status: 503 });
  try {
    const report = await runRunOriginCostMonitor(env);
    await logAuditEntry(env, { actor_type: 'admin', actor_id: adminActorId(request), action: 'refresh_run_cost',
      resource_type: 'infrastructure_cost', resource_id: 'global', metadata: { period: report.period, requests: report.requests } });
    return Response.json(report);
  } catch (error) {
    return Response.json({ error: 'Run cost refresh failed', message: error.message }, { status: 503 });
  }
}
