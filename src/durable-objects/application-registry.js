import { originWarnings } from '../auth/shared-origins.js';
import { handleBackupRequest } from '../utils/backup.js';
import { DEFAULT_RUN, runEmbedders, runOrigin } from '../utils/run-origin.js';

const MAX_APP_NAME = 100;
const MAX_REDIRECT_URIS = 10;

/**
 * Validate the optional fields of a create/update request
 * @returns {Response|null} 400 response, or null when valid
 */
function validateAppFields(data) {
  const fail = message => Response.json({ error: 'invalid_request', message }, { status: 400 });

  if (data.app_name !== undefined) {
    if (typeof data.app_name !== 'string' || !data.app_name.trim() || data.app_name.length > MAX_APP_NAME) {
      return fail(`app_name must be 1-${MAX_APP_NAME} characters`);
    }
  }
  if (data.redirect_uris !== undefined) {
    if (!Array.isArray(data.redirect_uris) || data.redirect_uris.length > MAX_REDIRECT_URIS) {
      return fail(`Provide 1-${MAX_REDIRECT_URIS} redirect_uris`);
    }
    for (const uri of data.redirect_uris) {
      if (!isAllowedRedirectUri(uri)) {
        return fail(`Invalid redirect_uri: must be an https URL, http://localhost, or a native app scheme such as org.example.app:/oauth, without a fragment`);
      }
    }
  }
  for (const field of ['logo_url', 'website_url']) {
    if (data[field] !== undefined && data[field] !== null && !isHttpsUrl(data[field])) {
      return fail(`${field} must be an https URL`);
    }
  }
  return null;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Native apps (iOS, Android, desktop) can't receive a redirect to an https
// page, so they register a private-use URI scheme named after a domain they
// control, in reverse order: "org.example.app:/oauth" (RFC 8252 section 7.1).
// Requiring a dot keeps out schemes such as javascript:, data: and file:.
const PRIVATE_USE_SCHEME = /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/;

function isAllowedRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return PRIVATE_USE_SCHEME.test(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

// The web origin a redirect URI belongs to, for CORS. Native app schemes have
// none: their URL origin is the string "null", which is also the Origin that
// sandboxed iframes and file: pages send, so it must never be trusted.
function webOrigin(redirectUri) {
  try {
    const url = new URL(redirectUri);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function publicApp(app) {
  return {
    app_id: app.app_id,
    client_id: app.app_id,
    app_name: app.app_name,
    redirect_uris: app.redirect_uris,
    logo_url: app.logo_url || null,
    website_url: app.website_url || null,
    status: app.status,
    created_at: app.created_at,
    updated_at: app.updated_at || null,
    run: { ...DEFAULT_RUN, ...app.run }
  };
}

export class ApplicationRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const url = new URL(request.url);
    const byRun = url.pathname.match(/^\/run\/by-app\/([^/]+)$/);
    if (byRun && request.method === 'GET') return this.getRun(byRun[1]);
    const run = url.pathname.match(/^\/apps\/([^/]+)\/run(?:\/(suspend|restore))?$/);
    if (run && request.method === 'GET' && !run[2]) return this.getOwnedRun(run[1], url.searchParams.get('owner_user_id'));
    if (run && ['PUT', 'POST'].includes(request.method)) {
      const data = await request.json();
      return this.serializeRun(() => this.updateRun(run[1], data, run[2]));
    }
    if (url.pathname === '/run/usage' && request.method === 'POST') {
      const data = await request.json();
      return this.serializeRun(() => this.recordRunUsage(data));
    }
    if (url.pathname === '/run/reserve' && request.method === 'POST') {
      const data = await request.json();
      return this.serializeRun(() => this.reserveRun(data));
    }
    if (url.pathname === '/dpop/consume' && request.method === 'POST') {
      const consume = async () => {
        const data = await request.json();
        const seen = (await this.state.storage.get('dpop-proofs') || []).filter(entry => entry.expires_at > Date.now());
        if (seen.some(entry => entry.jti === data.jti)) return new Response(null, { status: 409 });
        seen.push(data);
        await this.state.storage.put('dpop-proofs', seen);
        await this.state.storage.setAlarm?.(Date.now() + 120000);
        return new Response(null, { status: 204 });
      };
      return this.state.blockConcurrencyWhile ? this.state.blockConcurrencyWhile(consume) : consume();
    }

    if (url.pathname === '/apps' && request.method === 'POST') {
      const data = await request.json();
      return this.serializeRun(() => this.createApplication(data));
    }

    if (url.pathname === '/apps' && request.method === 'GET') {
      return this.listApplications(url.searchParams.get('owner_user_id'));
    }

    const safety = url.pathname.match(/^\/apps\/([^/]+)\/safety$/);
    if (safety && request.method === 'GET') return this.getSafety(safety[1], url.searchParams.get('owner_user_id'));
    if (safety && request.method === 'PUT') return this.putSafety(safety[1], await request.json());
    if (url.pathname === '/safety/due' && request.method === 'GET') return this.dueSafety(Number(url.searchParams.get('limit')) || 20);

    if (url.pathname.startsWith('/apps/') && request.method === 'GET') {
      return this.getApplication(url.pathname.split('/')[2]);
    }

    if (url.pathname.startsWith('/apps/') && request.method === 'PATCH') {
      const data = await request.json();
      return this.serializeRun(() => this.updateApplication(url.pathname.split('/')[2], data));
    }

    if (url.pathname.startsWith('/apps/') && request.method === 'DELETE') {
      return this.serializeRun(() => this.deleteApplication(url.pathname.split('/')[2], url.searchParams.get('owner_user_id')));
    }

    if (url.pathname === '/origins/check' && request.method === 'GET') {
      return this.checkOrigin(url.searchParams.get('origin'));
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm() { await this.state.storage.delete('dpop-proofs'); }

  async loadApplications() {
    const apps = (await this.state.storage.get('apps')) || [];
    // Apps are public PKCE clients; secrets from before that was settled are dropped
    for (const app of apps) delete app.client_secret_hash;
    return apps;
  }

  async saveApplications(apps) {
    await this.state.storage.put('apps', apps);
  }

  async createApplication(data) {
    if (!data?.app_name || !Array.isArray(data.redirect_uris) || data.redirect_uris.length === 0 || !data.owner_user_id) {
      return new Response(JSON.stringify({
        error: 'invalid_request',
        message: 'app_name, owner_user_id, and at least one redirect_uri are required'
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }
    const invalid = validateAppFields(data);
    if (invalid) return invalid;

    const apps = await this.loadApplications();
    const warnings = originWarnings(data.redirect_uris, apps);
    if (warnings.length && data.shared_origin_acknowledged !== true) {
      return Response.json({ error: 'shared_origin_acknowledgement_required', message: 'Other apps on these origins can read your app storage. Review the browser client safety guide and acknowledge this risk.', warnings, guide: '/docs/browser-client-safety' }, { status: 400 });
    }
    const app = {
      shared_origin_acknowledged: data.shared_origin_acknowledged === true,
      app_id: `app_${crypto.randomUUID()}`,
      app_name: data.app_name,
      owner_user_id: data.owner_user_id,
      redirect_uris: data.redirect_uris,
      logo_url: data.logo_url || null,
      website_url: data.website_url || null,
      status: 'active',
      run: { ...DEFAULT_RUN },
      created_at: new Date().toISOString()
    };

    apps.push(app);
    await this.saveApplications(apps);

    return new Response(JSON.stringify({
      app_id: app.app_id,
      client_id: app.app_id,
      app_name: app.app_name,
      redirect_uris: app.redirect_uris,
      created_at: app.created_at
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Find an app the caller owns, or the error response to return
   */
  async findOwnedApplication(appId, ownerUserId) {
    const apps = await this.loadApplications();
    const index = apps.findIndex((app) => app.app_id === appId && app.status !== 'deleted');
    if (index === -1 || !ownerUserId || apps[index].owner_user_id !== ownerUserId) {
      // Same answer for "missing" and "not yours", so app IDs can't be probed
      return { error: Response.json({ error: 'not_found', message: 'Application not found' }, { status: 404 }) };
    }
    return { apps, index };
  }

  async updateApplication(appId, data) {
    const { apps, index, error } = await this.findOwnedApplication(appId, data?.owner_user_id);
    if (error) return error;

    const invalid = validateAppFields(data);
    if (invalid) return invalid;
    if (data.redirect_uris !== undefined && (!Array.isArray(data.redirect_uris) || data.redirect_uris.length === 0)) {
      return Response.json({ error: 'invalid_request', message: 'At least one redirect_uri is required' }, { status: 400 });
    }

    const app = apps[index];
    if (data.redirect_uris) {
      const warnings = originWarnings(data.redirect_uris, apps, appId);
      if (warnings.length && data.shared_origin_acknowledged !== true) {
        return Response.json({ error: 'shared_origin_acknowledgement_required', message: 'Acknowledge the shared-origin storage risk before saving redirect URIs.', warnings, guide: '/docs/browser-client-safety' }, { status: 400 });
      }
      app.shared_origin_acknowledged = data.shared_origin_acknowledged === true;
    }
    for (const field of ['app_name', 'redirect_uris', 'logo_url', 'website_url']) {
      if (data[field] !== undefined) app[field] = data[field];
    }
    app.updated_at = new Date().toISOString();
    await this.saveApplications(apps);
    return Response.json(publicApp(app));
  }

  /**
   * Soft-delete: the app can no longer authorize users or refresh tokens, and its
   * origins lose CORS access. Access tokens already issued expire within an hour.
   */
  async deleteApplication(appId, ownerUserId) {
    const { apps, index, error } = await this.findOwnedApplication(appId, ownerUserId);
    if (error) return error;

    apps[index].status = 'deleted';
    apps[index].run = { ...DEFAULT_RUN, ...apps[index].run, status: 'off' };
    apps[index].deleted_at = new Date().toISOString();
    await this.saveApplications(apps);
    return Response.json({ deleted: true, app_id: appId });
  }

  async listApplications(ownerUserId) {
    const apps = (await this.loadApplications()).filter((app) => app.status !== 'deleted');
    const filtered = ownerUserId ? apps.filter((app) => app.owner_user_id === ownerUserId) : apps;

    return new Response(JSON.stringify({
      apps: filtered.map(publicApp)
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  async getApplication(appId) {
    const apps = await this.loadApplications();
    const app = apps.find((entry) => entry.app_id === appId);

    if (!app) {
      return new Response(JSON.stringify({
        error: 'not_found',
        message: 'Application not found'
      }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ...app, origin_warnings: originWarnings(app.redirect_uris, apps, appId) }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  // Safety check results (H4). The check itself runs in the Worker; this stores the latest result.
  async getSafety(appId, ownerUserId) {
    const { apps, index, error } = await this.findOwnedApplication(appId, ownerUserId);
    if (error) return error;
    return Response.json({ app: apps[index], apps: apps.filter(app => app.status === 'active'), last: await this.state.storage.get(`safety:${appId}`) || null });
  }

  async putSafety(appId, result) {
    await this.state.storage.put(`safety:${appId}`, result);
    return new Response(null, { status: 204 });
  }

  /** Active apps, least recently checked first, for the nightly run. */
  async dueSafety(limit) {
    const apps = (await this.loadApplications()).filter(app => app.status === 'active');
    const checked = await Promise.all(apps.map(async app => (await this.state.storage.get(`safety:${app.app_id}`))?.checked_at || ''));
    const due = apps.map((app, index) => ({ app, at: checked[index] })).sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit).map(entry => entry.app);
    return Response.json({ apps, due });
  }

  async checkOrigin(origin) {
    if (!origin) {
      return new Response(JSON.stringify({ allowed: false }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const apps = await this.loadApplications();
    const allowed = apps.some((app) => {
      if (app.status !== 'active') {
        return false;
      }

      return app.redirect_uris.some((redirectUri) => webOrigin(redirectUri) === origin);
    });

    return new Response(JSON.stringify({ allowed }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  serializeRun(operation) {
    return this.state.blockConcurrencyWhile ? this.state.blockConcurrencyWhile(operation) : operation();
  }

  async getRun(appId) {
    const app = (await this.loadApplications()).find(app => app.app_id === appId && app.status === 'active');
    if (!app) return Response.json({ status: 'off', embedders: [] }, { status: 404 });
    return Response.json({ status: app.run?.status || 'off', embedders: runEmbedders(app), daily_request_cap: app.run?.daily_request_cap ?? DEFAULT_RUN.daily_request_cap });
  }

  async getOwnedRun(appId, ownerUserId) {
    const { apps, index, error } = await this.findOwnedApplication(appId, ownerUserId);
    if (error) return error;
    const app = apps[index];
    const today = new Date().toISOString().slice(0, 10);
    const days = await this.state.storage.get(`run:days:${appId}`) || [];
    const usage = Object.fromEntries(await Promise.all(days.map(async day => [day, await this.state.storage.get(`run:usage:${appId}:${day}`) || {}])));
    const origin = runOrigin(appId, this.env.RUN_DOMAIN);
    return Response.json({ ...DEFAULT_RUN, ...app.run, origin, embedders: runEmbedders(app),
      requests_today: usage[today]?.requests || 0,
      requests_month: Object.entries(usage).filter(([day]) => day.startsWith(today.slice(0, 7))).reduce((sum, [, value]) => sum + (value.requests || 0), 0),
      csp: origin ? `frame-src ${origin}` : null,
      warnings: originWarnings(app.redirect_uris, apps, appId) });
  }

  async updateRun(appId, data, action) {
    let apps, index;
    if (action) {
      apps = await this.loadApplications();
      index = apps.findIndex(app => app.app_id === appId && app.status === 'active');
      if (index < 0) return Response.json({ error: 'not_found' }, { status: 404 });
    } else {
      const owned = await this.findOwnedApplication(appId, data?.owner_user_id);
      if (owned.error) return owned.error;
      ({ apps, index } = owned);
      if (apps[index].status !== 'active') return Response.json({ error: 'Application is inactive' }, { status: 403 });
      if (!data || !['active', 'off'].includes(data.status) || (data.allow_local !== undefined && typeof data.allow_local !== 'boolean')) {
        return Response.json({ error: 'invalid_request', message: 'status must be active or off; allow_local must be boolean' }, { status: 400 });
      }
      if (apps[index].run?.status === 'suspended') return Response.json({ error: 'suspended', message: 'Only an administrator can restore this origin.' }, { status: 403 });
      if (data.status === 'active' && !this.env.RUN_DOMAIN) return Response.json({ error: 'run_unavailable', message: 'The hosted run domain is not configured.' }, { status: 503 });
    }
    const app = apps[index];
    const run = { ...DEFAULT_RUN, ...app.run };
    if (action === 'suspend') {
      if (typeof data?.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000) return Response.json({ error: 'A reason (1–1000 characters) is required' }, { status: 400 });
      Object.assign(run, { status: 'suspended', suspended_at: new Date().toISOString(), suspended_reason: data.reason.trim() });
    } else if (action === 'restore') {
      // Restore permission to opt in; do not enable a previously suspended app automatically.
      Object.assign(run, { status: 'off', suspended_at: null, suspended_reason: null });
    } else {
      run.status = data.status;
      if (data.allow_local !== undefined) run.allow_local = data.allow_local;
      if (run.status === 'active') run.enabled_at ||= new Date().toISOString();
    }
    app.run = run;
    app.updated_at = new Date().toISOString();
    if (action) {
      const log = this.env.ADMIN_ACTION_LOG.get(this.env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global'));
      const logged = await log.fetch(new Request('https://internal/log', { method: 'POST', body: JSON.stringify({
        admin_user_id: data.actor, action_type: `run_${action === 'suspend' ? 'suspended' : 'restored'}`,
        details: { app_id: appId, status: run.status, reason: data.reason || null }
      }) }));
      if (!logged.ok) return Response.json({ error: 'Audit log unavailable' }, { status: 503 });
    }
    await this.saveApplications(apps);
    return Response.json(run);
  }

  async runUsage(appId, day) {
    const today = new Date().toISOString().slice(0, 10);
    const at = Date.parse(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day || day > today || at < Date.parse(`${today}T00:00:00Z`) - 34 * 86400000) return null;
    const days = await this.state.storage.get(`run:days:${appId}`) || [];
    const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 34 * 86400000).toISOString().slice(0, 10);
    for (const expired of days.filter(day => day < cutoff)) await this.state.storage.delete(`run:usage:${appId}:${expired}`);
    const retained = days.filter(day => day >= cutoff);
    if (!retained.includes(day)) retained.push(day);
    await this.state.storage.put(`run:days:${appId}`, retained);
    return await this.state.storage.get(`run:usage:${appId}:${day}`) || { requests: 0, reserved: 0, leases: {} };
  }

  async reserveRun({ app_id, day }) {
    if (day !== new Date().toISOString().slice(0, 10)) return Response.json({ error: 'Invalid day' }, { status: 400 });
    const config = await this.getRun(app_id);
    if (!config.ok) return config;
    const run = await config.json();
    if (run.status !== 'active') return Response.json({ error: run.status }, { status: run.status === 'suspended' ? 403 : 404 });
    const usage = await this.runUsage(app_id, day);
    // Durable reservations bound the fleet's total, even if isolates disappear.
    const count = Math.min(120, Math.max(0, run.daily_request_cap - usage.reserved));
    const lease_id = crypto.randomUUID();
    if (count) {
      usage.reserved += count;
      usage.leases[lease_id] = { reserved: count, requests: 0 };
      await this.state.storage.put(`run:usage:${app_id}:${day}`, usage);
    }
    return Response.json({ count, lease_id });
  }

  async recordRunUsage({ app_id, day, requests, lease_id }) {
    if (!(await this.loadApplications()).some(app => app.app_id === app_id)) return Response.json({ error: 'not_found' }, { status: 404 });
    const usage = await this.runUsage(app_id, day);
    const lease = usage && typeof lease_id === 'string' && Object.hasOwn(usage.leases, lease_id) && usage.leases[lease_id];
    if (!lease || !Number.isSafeInteger(requests) || requests < 1 || requests > lease.reserved) return Response.json({ error: 'Invalid usage' }, { status: 400 });
    // Report a cumulative count per reservation. Retries and out-of-order flushes
    // cannot double count, and only ~167 lease records/day are needed at the cap.
    const delta = Math.max(0, requests - lease.requests);
    if (delta) {
      usage.requests += delta;
      lease.requests = requests;
      await this.state.storage.put(`run:usage:${app_id}:${day}`, usage);
    }
    return Response.json({ requests: usage.requests });
  }

}
