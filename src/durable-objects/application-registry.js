import { generateOAuthSecret, sha256Hex } from '../auth/oauth.js';

export class ApplicationRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
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

  async listApplications(ownerUserId) {
    const apps = await this.loadApplications();
    const filtered = ownerUserId ? apps.filter((app) => app.owner_user_id === ownerUserId) : apps;

    return new Response(JSON.stringify({
      apps: filtered.map((app) => ({
        app_id: app.app_id,
        client_id: app.app_id,
        app_name: app.app_name,
        redirect_uris: app.redirect_uris,
        status: app.status,
        created_at: app.created_at
      }))
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
