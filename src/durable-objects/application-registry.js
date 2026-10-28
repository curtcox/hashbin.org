import { originWarnings } from '../auth/shared-origins.js';
import { handleBackupRequest } from '../utils/backup.js';

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
    updated_at: app.updated_at || null
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
      return this.createApplication(await request.json());
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
      return this.updateApplication(url.pathname.split('/')[2], await request.json());
    }

    if (url.pathname.startsWith('/apps/') && request.method === 'DELETE') {
      return this.deleteApplication(url.pathname.split('/')[2], url.searchParams.get('owner_user_id'));
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
}
