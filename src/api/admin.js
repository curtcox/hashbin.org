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
