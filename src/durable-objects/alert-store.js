import { handleBackupRequest } from '../utils/backup.js';

/**
 * Push a new alert to the operator's webhook (ALERT_WEBHOOK_URL), if configured.
 * The body works with Slack (`text`) and Discord (`content`) incoming webhooks and
 * also carries the structured alert for anything else. Never throws.
 * @returns {Promise<boolean>} True if the webhook accepted it
 */
export async function deliverAlert(env, alert) {
  if (!env?.ALERT_WEBHOOK_URL) return false;
  const summary = `[HashBin ${String(alert.severity).toUpperCase()}] ${alert.title}: ${alert.message}`;
  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: summary, content: summary.slice(0, 2000), alert }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) console.error(`Alert webhook returned HTTP ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('Alert webhook delivery failed:', error);
    return false;
  }
}

/**
 * AlertStore Durable Object
 * Stores and manages system alerts with deduplication
 */

export class AlertStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Create alert
      if (path === '/create' && request.method === 'POST') {
        const body = await request.json();
        return this.createAlert(body);
      }

      // List alerts
      if (path === '/list' && request.method === 'GET') {
        return this.listAlerts(url.searchParams);
      }

      // Acknowledge alert
      if (path.startsWith('/acknowledge/') && request.method === 'POST') {
        const alertId = path.split('/')[2];
        const body = await request.json();
        return this.acknowledgeAlert(alertId, body);
      }

      // Resolve alert
      if (path.startsWith('/resolve/') && request.method === 'POST') {
        const alertId = path.split('/')[2];
        return this.resolveAlert(alertId);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('AlertStore error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Create a new alert with deduplication
   */
  async createAlert(body) {
    const { type, severity, title, message, metadata = {} } = body;

    if (!type || !severity || !title || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate unresolved alerts of the same type
    const alerts = await this.state.storage.list({ prefix: 'alert_' });
    for (const [key, alert] of alerts) {
      if (alert.type === type && !alert.resolved_at) {
        // Check if this is within cooldown period (1 hour)
        const hoursSinceCreation = (Date.now() - new Date(alert.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreation < 1) {
          // Duplicate alert within cooldown, don't create new one
          return new Response(
            JSON.stringify({ alert, duplicate: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Create new alert
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const alert = {
      id: alertId,
      type,
      severity,
      title,
      message,
      metadata,
      created_at: new Date().toISOString(),
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null
    };

    await this.state.storage.put(alertId, alert);
    const delivered = await deliverAlert(this.env, alert);

    return new Response(
      JSON.stringify({ alert, duplicate: false, delivered }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * List alerts with optional filtering
   */
  async listAlerts(searchParams) {
    const severity = searchParams.get('severity');
    const status = searchParams.get('status'); // 'active', 'acknowledged', 'resolved'
    const limit = parseInt(searchParams.get('limit') || '100');

    const alerts = await this.state.storage.list({ prefix: 'alert_' });
    let alertList = Array.from(alerts.values());

    // Filter by severity
    if (severity) {
      alertList = alertList.filter(a => a.severity === severity);
    }

    // Filter by status
    if (status === 'active') {
      alertList = alertList.filter(a => !a.acknowledged_at && !a.resolved_at);
    } else if (status === 'acknowledged') {
      alertList = alertList.filter(a => a.acknowledged_at && !a.resolved_at);
    } else if (status === 'resolved') {
      alertList = alertList.filter(a => a.resolved_at);
    }

    // Sort by creation date (newest first)
    alertList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Apply limit
    alertList = alertList.slice(0, limit);

    return new Response(
      JSON.stringify({ alerts: alertList, count: alertList.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, body) {
    const { acknowledged_by } = body;

    if (!acknowledged_by) {
      return new Response(
        JSON.stringify({ error: 'acknowledged_by required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const alert = await this.state.storage.get(alertId);
    if (!alert) {
      return new Response(
        JSON.stringify({ error: 'Alert not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    alert.acknowledged_at = new Date().toISOString();
    alert.acknowledged_by = acknowledged_by;
    await this.state.storage.put(alertId, alert);

    return new Response(
      JSON.stringify({ alert }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Resolve an alert (auto-resolution for health alerts)
   */
  async resolveAlert(alertId) {
    const alert = await this.state.storage.get(alertId);
    if (!alert) {
      return new Response(
        JSON.stringify({ error: 'Alert not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    alert.resolved_at = new Date().toISOString();
    await this.state.storage.put(alertId, alert);

    return new Response(
      JSON.stringify({ alert }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
