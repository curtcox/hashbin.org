import { generateOAuthSecret, sha256Hex } from '../auth/oauth.js';
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
        return fail(`Invalid redirect_uri: must be an https URL (or http://localhost) without a fragment`);
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

function isAllowedRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
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

    if (url.pathname === '/apps' && request.method === 'POST') {
      return this.createApplication(await request.json());
    }

    if (url.pathname === '/apps' && request.method === 'GET') {
      return this.listApplications(url.searchParams.get('owner_user_id'));
    }

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

  async loadApplications() {
    return (await this.state.storage.get('apps')) || [];
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
    const clientSecret = generateOAuthSecret('hbs_');
    const app = {
      app_id: `app_${crypto.randomUUID()}`,
      app_name: data.app_name,
      owner_user_id: data.owner_user_id,
      client_secret_hash: await sha256Hex(clientSecret),
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
      client_secret: clientSecret,
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

    return new Response(JSON.stringify(app), {
      headers: { 'content-type': 'application/json' }
    });
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

      return app.redirect_uris.some((redirectUri) => {
        try {
          return new URL(redirectUri).origin === origin;
        } catch (_error) {
          return false;
        }
      });
    });

    return new Response(JSON.stringify({ allowed }), {
      headers: { 'content-type': 'application/json' }
    });
  }
}
