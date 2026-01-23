/**
 * Admin API Handlers
 * Endpoints for system management and monitoring
 */

import { requireAdmin } from '../auth/admin.js';

/**
 * Get aggregate platform statistics
 * GET /api/admin/stats
 */
export async function handleGetStats(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    // Get PlatformStats Durable Object
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    const response = await statsStub.fetch(new Request('https://dummy/stats?type=all'));
    const stats = await response.json();

    // Log audit entry
    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_stats',
      resource_type: 'platform_stats',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve statistics' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get financial statistics
 * GET /api/admin/stats/financial
 */
export async function handleGetFinancialStats(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    const response = await statsStub.fetch(new Request('https://dummy/stats?type=financial'));
    const stats = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_financial_stats',
      resource_type: 'platform_stats',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting financial stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve financial statistics' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get content statistics
 * GET /api/admin/stats/content
 */
export async function handleGetContentStats(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    const response = await statsStub.fetch(new Request('https://dummy/stats?type=content'));
    const stats = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_content_stats',
      resource_type: 'platform_stats',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting content stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve content statistics' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get user statistics
 * GET /api/admin/stats/users
 */
export async function handleGetUserStats(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    const response = await statsStub.fetch(new Request('https://dummy/stats?type=users'));
    const stats = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_user_stats',
      resource_type: 'platform_stats',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve user statistics' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get extended health check with metrics
 * GET /api/admin/health
 */
export async function handleGetAdminHealth(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const startTime = Date.now();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT || 'unknown',
      services: {},
      response_times: {}
    };

    // Test worker
    const workerStart = Date.now();
    health.services.worker = 'operational';
    health.response_times.worker_ms = Date.now() - workerStart;

    // Test Durable Objects
    const doStart = Date.now();
    try {
      const testId = env.PLATFORM_STATS.idFromName('health-check');
      const testStub = env.PLATFORM_STATS.get(testId);
      await testStub.fetch(new Request('https://dummy/stats?type=all'));
      health.services.durable_objects = 'operational';
    } catch (error) {
      health.services.durable_objects = 'degraded';
      health.status = 'degraded';
    }
    health.response_times.durable_objects_ms = Date.now() - doStart;

    // Test R2
    const r2Start = Date.now();
    try {
      await env.CONTENT_BUCKET.head('health-check');
      health.services.r2 = 'operational';
    } catch (error) {
      // Head operation returns null for missing objects, which is fine
      health.services.r2 = 'operational';
    }
    health.response_times.r2_ms = Date.now() - r2Start;

    // Test Clerk
    if (env.CLERK_SECRET_KEY) {
      health.services.clerk = 'configured';
    } else {
      health.services.clerk = 'not_configured';
    }

    // Test Stripe
    if (env.STRIPE_SECRET_KEY) {
      health.services.stripe = 'configured';
    } else {
      health.services.stripe = 'not_configured';
    }

    health.response_times.total_ms = Date.now() - startTime;

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_health',
      resource_type: 'system',
      resource_id: 'health'
    });

    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in admin health check:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        error: error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get alerts
 * GET /api/admin/alerts
 */
export async function handleGetAlerts(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const severity = url.searchParams.get('severity');
    const status = url.searchParams.get('status');
    const limit = url.searchParams.get('limit') || '100';

    const alertId = env.ALERT_STORE.idFromName('global');
    const alertStub = env.ALERT_STORE.get(alertId);
    
    const alertUrl = `https://dummy/list?severity=${severity || ''}&status=${status || ''}&limit=${limit}`;
    const response = await alertStub.fetch(new Request(alertUrl));
    const data = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_alerts',
      resource_type: 'alerts',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve alerts' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Acknowledge an alert
 * POST /api/admin/alerts/:id/acknowledge
 */
export async function handleAcknowledgeAlert(request, env, alertId) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const alertStoreId = env.ALERT_STORE.idFromName('global');
    const alertStub = env.ALERT_STORE.get(alertStoreId);
    
    const response = await alertStub.fetch(
      new Request(`https://dummy/acknowledge/${alertId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged_by: 'admin' })
      })
    );

    const data = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'acknowledge_alert',
      resource_type: 'alert',
      resource_id: alertId
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to acknowledge alert' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get audit log entries
 * GET /api/admin/audit-log
 */
export async function handleGetAuditLog(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const params = new URLSearchParams();
    
    // Forward query parameters
    ['actor_type', 'actor_id', 'action', 'resource_type', 'start_date', 'end_date', 'limit', 'offset'].forEach(param => {
      const value = url.searchParams.get(param);
      if (value) params.append(param, value);
    });

    const auditId = env.AUDIT_LOG.idFromName('global');
    const auditStub = env.AUDIT_LOG.get(auditId);
    
    const response = await auditStub.fetch(new Request(`https://dummy/list?${params.toString()}`));
    const data = await response.json();

    // Don't log this audit entry to avoid recursion
    // (viewing audit log creates an audit entry creates an audit entry...)

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting audit log:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve audit log' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Export platform data
 * GET /api/admin/export?type=transactions|users|content|audit
 */
export async function handleExportData(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const exportType = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '1000');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!exportType || !['transactions', 'users', 'content', 'audit'].includes(exportType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid export type. Must be: transactions, users, content, or audit' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: Check last export time
    // TODO: Implement proper rate limiting (1 export per minute)

    let csvData;
    if (exportType === 'audit') {
      csvData = await exportAuditLog(env, limit, offset);
    } else {
      // For other types, return a placeholder
      csvData = `type,id,timestamp\n${exportType},placeholder,${new Date().toISOString()}\n`;
    }

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'export_data',
      resource_type: 'export',
      resource_id: exportType,
      metadata: { limit, offset }
    });

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${exportType}-${Date.now()}.csv"`
      }
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to export data' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Helper: Export audit log to CSV
 */
async function exportAuditLog(env, limit, offset) {
  const auditId = env.AUDIT_LOG.idFromName('global');
  const auditStub = env.AUDIT_LOG.get(auditId);
  
  const response = await auditStub.fetch(
    new Request(`https://dummy/list?limit=${limit}&offset=${offset}`)
  );
  const data = await response.json();

  // Build CSV
  let csv = 'id,timestamp,actor_type,actor_id,action,resource_type,resource_id,ip_address\n';
  for (const entry of data.entries) {
    csv += `"${entry.id}","${entry.timestamp}","${entry.actor_type}","${entry.actor_id}","${entry.action}","${entry.resource_type || ''}","${entry.resource_id || ''}","${entry.ip_address || ''}"\n`;
  }

  return csv;
}

/**
 * Helper: Log audit entry
 */
async function logAuditEntry(env, entry) {
  try {
    const auditId = env.AUDIT_LOG.idFromName('global');
    const auditStub = env.AUDIT_LOG.get(auditId);
    
    await auditStub.fetch(
      new Request('https://dummy/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
    );
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't fail the request if audit logging fails
  }
}

/**
 * Get infrastructure costs
 * GET /api/admin/costs
 */
export async function handleGetCosts(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'all_time';

    // Get InfrastructureCost Durable Object
    const costId = env.INFRASTRUCTURE_COST.idFromName('global');
    const costStub = env.INFRASTRUCTURE_COST.get(costId);
    
    const response = await costStub.fetch(
      new Request(`https://dummy/summary?period=${period}`)
    );
    const costs = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_costs',
      resource_type: 'infrastructure_cost',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(costs), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting costs:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve costs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get costs by service
 * GET /api/admin/costs/by-service
 */
export async function handleGetCostsByService(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'all_time';

    const costId = env.INFRASTRUCTURE_COST.idFromName('global');
    const costStub = env.INFRASTRUCTURE_COST.get(costId);
    
    const response = await costStub.fetch(
      new Request(`https://dummy/by-service?period=${period}`)
    );
    const breakdown = await response.json();

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_costs_by_service',
      resource_type: 'infrastructure_cost',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(breakdown), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting costs by service:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve cost breakdown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get profitability overview (revenue vs costs)
 * GET /api/admin/profitability
 */
export async function handleGetProfitability(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'all_time';

    // Get costs
    const costId = env.INFRASTRUCTURE_COST.idFromName('global');
    const costStub = env.INFRASTRUCTURE_COST.get(costId);
    
    const costResponse = await costStub.fetch(
      new Request(`https://dummy/summary?period=${period}`)
    );
    const costData = await costResponse.json();

    // Get revenue from PlatformStats
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    const statsResponse = await statsStub.fetch(
      new Request('https://dummy/stats?type=financial')
    );
    const statsData = await statsResponse.json();

    // Calculate profitability metrics
    const totalCosts = costData.costs.total;
    const totalRevenue = statsData.revenue.total_cents;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    const profitability = {
      period,
      revenue_cents: totalRevenue,
      revenue_dollars: totalRevenue / 100,
      costs_cents: totalCosts,
      costs_dollars: totalCosts / 100,
      profit_cents: profit,
      profit_dollars: profit / 100,
      margin_percentage: margin,
      status: profit >= 0 ? 'profitable' : 'unprofitable',
      timestamp: new Date().toISOString()
    };

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'view_profitability',
      resource_type: 'profitability',
      resource_id: 'global'
    });

    return new Response(JSON.stringify(profitability), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting profitability:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to calculate profitability' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Record infrastructure cost
 * POST /api/admin/costs/record
 */
export async function handleRecordCost(request, env) {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  try {
    const data = await request.json();

    const costId = env.INFRASTRUCTURE_COST.idFromName('global');
    const costStub = env.INFRASTRUCTURE_COST.get(costId);
    
    const response = await costStub.fetch(
      new Request('https://dummy/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    );

    await logAuditEntry(env, {
      actor_type: 'admin',
      actor_id: 'admin',
      action: 'record_cost',
      resource_type: 'infrastructure_cost',
      resource_id: 'global',
      metadata: { service: data.service, cost_cents: data.cost_cents }
    });

    return response;
  } catch (error) {
    console.error('Error recording cost:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to record cost' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
