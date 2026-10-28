/**
 * UserProfile Durable Object
 * Stores user profile data synced from Clerk authentication
 */

import { downloadBudget, validDownloadCaps } from '../utils/download-budget.js';
import { findSpender, migrateGrantSpending, recordSpend, rollSpend, spendRoomCents } from '../utils/credential-spend.js';
import { caveatsNarrower } from '../auth/scopes.js';
import { handleDownloadBudget, flushDownloadOutbox } from './download-budget.js';
import { pruneDownloadLeases } from './download-leases.js';
import { COST_POLICY } from '../utils/cost-policy.js';
import { handleBackupRequest, registerForBackup } from '../utils/backup.js';

// Maximum API keys per user
const MAX_API_KEYS = 25;

/**
 * Keys from before scopes existed acted as the whole account; revoke them on sight.
 * Returns true when the profile changed and needs saving.
 */
function retireUnscopedKeys(profile) {
  let changed = false;
  for (const key of profile.api_keys || []) {
    if (!key.revoked_at && !Array.isArray(key.scopes)) {
      key.revoked_at = new Date().toISOString();
      changed = true;
    }
  }
  return changed;
}

export class UserProfile {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.profileQueue = Promise.resolve();
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const operation = this.profileQueue.then(() => this.handleRequest(request));
    this.profileQueue = operation.catch(() => {});
    const response = await operation;
    await this.ensureBackupRegistration();
    return response;
  }

  /**
   * Name this object was created with, once its data identifies it
   */
  async backupName() {
    const profile = await this.state.storage.get('profile');
    return profile?.user_id;
  }

  /**
   * Register with the BackupIndex (once per object; see src/utils/backup.js)
   */
  async ensureBackupRegistration() {
    if (this.backupRegistered) return;
    const name = await this.backupName();
    if (!name) return;
    this.backupRegistered = await registerForBackup(this.state, this.env, 'USER_PROFILES', name);
  }

  async alarm() {
    try {
      const operation = this.profileQueue.then(async () => {
        const profile = await this.state.storage.get('profile');
        if (profile?.download_budget) await handleDownloadBudget(this, new Request('https://internal/download/budget'));
        let pendingAccounting = false;
        let maintenanceFailed = false;
        try { pendingAccounting = await flushDownloadOutbox(this); }
        catch (error) { maintenanceFailed = true; console.error('Download accounting retry', error.message); }
        const now = new Date();
        let receiptAlarm = null;
        try { receiptAlarm = await pruneDownloadLeases(this.state.storage, now.getTime()); }
        catch (error) { maintenanceFailed = true; console.error('Download receipt cleanup retry', error.message); }
        await this.state.storage.setAlarm(Math.min(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          receiptAlarm || Infinity, pendingAccounting ? now.getTime() + 1000 : Infinity,
          maintenanceFailed ? now.getTime() + 60000 : Infinity));
      });
      this.profileQueue = operation.catch(() => {});
      await operation;
    }
    catch (error) {
      console.error('Download accounting retry', error.message);
      await this.state.storage.setAlarm(Date.now() + 60000);
    }
  }

  async handleRequest(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname.startsWith('/download/')) return await handleDownloadBudget(this, request);
      if (url.pathname === '/inline-upload' && method === 'POST') {
        return await this.state.blockConcurrencyWhile(async () => {
          const hour = Math.floor(Date.now() / 3600000);
          const previous = await this.state.storage.get('inline-upload-window');
          const count = previous?.hour === hour ? previous.count : 0;
          if (count >= COST_POLICY.inlineUploadsPerHour) {
            return Response.json({ error: 'inline_upload_limit' }, { status: 429,
              headers: { 'Retry-After': String(3600 - Math.floor(Date.now() / 1000) % 3600) } });
          }
          await this.state.storage.put('inline-upload-window', { hour, count: count + 1 });
          return Response.json({ remaining: COST_POLICY.inlineUploadsPerHour - count - 1 });
        });
      }
      // Route to appropriate handler
      if (url.pathname === '/profile' && method === 'GET') {
        return await this.getProfile();
      }

      if (url.pathname === '/profile' && method === 'POST') {
        const data = await request.json();
        return await this.createProfile(data);
      }

      if (url.pathname === '/profile' && method === 'PUT') {
        const data = await request.json();
        return await this.updateProfile(data);
      }

      if (url.pathname === '/settings' && method === 'GET') {
        return await this.getSettings();
      }

      if (url.pathname === '/settings' && method === 'PATCH') {
        const data = await request.json();
        return await this.updateSettings(data);
      }

      if (url.pathname === '/profile' && method === 'DELETE') {
        return await this.deleteProfile();
      }

      if (url.pathname === '/apikeys' && method === 'POST') {
        const data = await request.json();
        return await this.createApiKey(data);
      }

      if (url.pathname === '/apikeys' && method === 'GET') {
        return await this.listApiKeys();
      }

      if (url.pathname.startsWith('/apikeys/') && method === 'DELETE') {
        const keyId = url.pathname.split('/')[2];
        return await this.revokeApiKey(keyId);
      }

      if (url.pathname.startsWith('/apikeys/') && method === 'GET') {
        const keyId = url.pathname.split('/')[2];
        return await this.getApiKey(keyId);
      }

      if (url.pathname === '/uploads' && method === 'POST') {
        const data = await request.json();
        return await this.addUpload(data);
      }

      if (url.pathname === '/uploads' && method === 'GET') {
        return await this.getUploads();
      }

      if (url.pathname.startsWith('/apikeys/') && url.pathname.endsWith('/use') && method === 'POST') {
        const keyId = url.pathname.split('/')[2];
        return await this.updateLastUsed(keyId);
      }

      if (url.pathname.startsWith('/apikeys/') && url.pathname.endsWith('/update') && method === 'PATCH') {
        const keyId = url.pathname.split('/')[2];
        return await this.updateApiKey(keyId, request);
      }

      if (url.pathname === '/balance' && method === 'GET') {
        return await this.getBalance();
      }

      if (url.pathname === '/balance/deposit' && method === 'POST') {
        const data = await request.json();
        return await this.depositBalance(data);
      }

      if (url.pathname === '/balance/debit' && method === 'POST') {
        const data = await request.json();
        return await this.debitBalance(data);
      }

      if (url.pathname === '/oauth/grants' && method === 'DELETE') return await this.revokeAllOAuthGrants();
      if (url.pathname.startsWith('/oauth/activity/') && method === 'POST') return await this.useOAuthGrant(url.pathname.split('/')[3]);
      if (url.pathname === '/oauth/grants' && method === 'GET') {
        return await this.listOAuthGrants();
      }

      if (url.pathname === '/oauth/grants' && method === 'POST') {
        const data = await request.json();
        return await this.createOAuthGrant(data);
      }

      if (url.pathname.startsWith('/oauth/grants/') && method === 'PATCH') {
        const grantId = url.pathname.split('/')[3];
        return await this.narrowOAuthGrant(grantId, await request.json());
      }

      if (url.pathname === '/admin-keys' && method === 'POST') {
        return await this.createAdminKey(await request.json());
      }

      if (url.pathname === '/admin-keys' && method === 'GET') {
        return await this.listAdminKeys();
      }

      const adminKeyMatch = url.pathname.match(/^\/admin-keys\/([^/]+)(\/use)?$/);
      if (adminKeyMatch && method === 'GET') {
        return await this.getAdminKey(adminKeyMatch[1]);
      }
      if (adminKeyMatch && method === 'DELETE') {
        return await this.revokeAdminKey(adminKeyMatch[1]);
      }
      if (adminKeyMatch?.[2] && method === 'POST') {
        return await this.recordAdminKeyUse(adminKeyMatch[1]);
      }

      if (url.pathname === '/oauth/codes/redeem' && method === 'POST') {
        return await this.redeemOAuthCode(await request.json());
      }

      if (url.pathname.startsWith('/oauth/grants/') && method === 'GET') {
        const grantId = url.pathname.split('/')[3];
        return await this.getOAuthGrant(grantId);
      }

      if (url.pathname.startsWith('/oauth/grants/') && method === 'DELETE') {
        // A grant ID revokes that grant; an app ID revokes every grant the app holds
        const id = url.pathname.split('/')[3];
        return id.startsWith('grant_') ? await this.revokeOAuthGrantById(id) : await this.revokeOAuthGrantByApp(id);
      }

      if (url.pathname.startsWith('/oauth/grants-by-id/') && method === 'POST') {
        const grantId = url.pathname.split('/')[3];
        return await this.revokeOAuthGrantById(grantId);
      }

      if (url.pathname === '/oauth/refresh-tokens' && method === 'POST') {
        const data = await request.json();
        return await this.storeOAuthRefreshToken(data);
      }

      if (url.pathname === '/oauth/refresh-tokens/rotate' && method === 'POST') {
        const data = await request.json();
        return await this.rotateOAuthRefreshToken(data);
      }

      if (url.pathname === '/oauth/refresh-tokens/revoke' && method === 'POST') {
        const data = await request.json();
        return await this.revokeOAuthRefreshToken(data);
      }

      if (url.pathname === '/suppliers/add' && method === 'POST') {
        const data = await request.json();
        return await this.addSupplier(data);
      }

      if (url.pathname === '/suppliers/remove' && method === 'POST') {
        const data = await request.json();
        return await this.removeSupplier(data);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Internal error',
          message: error.message
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  }

  /**
   * Get user profile
   */
  async getProfile() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Create new user profile
   */
  async createProfile(data) {
    const existingProfile = await this.state.storage.get('profile');

    if (existingProfile) {
      return new Response(
        JSON.stringify({
          error: 'Profile already exists'
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const initialBalance = Number.isInteger(data.initial_balance_cents) && data.initial_balance_cents > 0
      ? data.initial_balance_cents
      : 0;

    const profile = {
      user_id: data.user_id,
      providers: data.providers || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      api_keys: [],
      uploads: [],
      balance_cents: initialBalance,
      total_deposited_cents: initialBalance,
      total_spent_cents: 0,
      supplier_ids: [],
      supplier_count: 0,
      default_retention_months: Number.isInteger(data.default_retention_months) ? data.default_retention_months : null,
      oauth_grants: [],
      oauth_refresh_tokens: []
    };

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(profile), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Update allowed fields
    if (data.providers) {
      profile.providers = data.providers;
    }

    if (data.default_retention_months !== undefined) {
      profile.default_retention_months = data.default_retention_months;
    }

    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Delete user profile (soft delete)
   */
  async deleteProfile() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Soft delete - mark as deleted but retain payment records
    profile.deleted_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();

    // Clear sensitive data but keep payment history
    profile.api_keys = [];
    profile.uploads = [];

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Profile deleted successfully'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Create a new API key
   */
  async createApiKey(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check if user is deleted
    if (profile.deleted_at) {
      return new Response(
        JSON.stringify({
          error: 'AUTH_USER_DELETED',
          message: 'User account has been deleted'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    retireUnscopedKeys(profile);

    // Check API key limit
    const activeKeys = profile.api_keys.filter(key => !key.revoked_at);
    if (activeKeys.length >= MAX_API_KEYS) {
      return new Response(
        JSON.stringify({
          error: 'AUTH_KEY_LIMIT',
          message: `Maximum of ${MAX_API_KEYS} API keys allowed`
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const apiKey = {
      key_id: data.key_id,
      key_hash: data.key_hash,
      name: data.name,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      caveats: data.caveats || {},
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
      last_used_at: null,
      usage_count: 0,
      revoked_at: null
    };

    if (data.download_budget !== undefined && !validDownloadCaps(data.download_budget)) return Response.json({ error: 'Invalid download caps' }, { status: 400 });
    if (data.download_budget) downloadBudget(profile).keys[apiKey.key_id] = data.download_budget;
    profile.api_keys.push(apiKey);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        key_id: apiKey.key_id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        caveats: apiKey.caveats,
        created_at: apiKey.created_at,
        expires_at: apiKey.expires_at
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * List all API keys (without key values)
   */
  async listApiKeys() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (retireUnscopedKeys(profile)) await this.state.storage.put('profile', profile);

    // Return keys without hashes
    const keys = profile.api_keys.map(key => ({
      key_id: key.key_id,
      name: key.name,
      scopes: key.scopes || [],
      caveats: key.caveats || {},
      created_at: key.created_at,
      expires_at: key.expires_at,
      last_used_at: key.last_used_at,
      usage_count: key.usage_count || 0,
      revoked: !!key.revoked_at
    }));

    return new Response(JSON.stringify(keys), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get specific API key by ID
   */
  async getApiKey(keyId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (retireUnscopedKeys(profile)) await this.state.storage.put('profile', profile);

    const apiKey = profile.api_keys.find(key => key.key_id === keyId);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'API key not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(apiKey), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const apiKey = profile.api_keys.find(key => key.key_id === keyId);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'API key not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (apiKey.revoked_at) {
      // Idempotent - already revoked, return success
      return new Response(
        JSON.stringify({
          success: true,
          message: 'API key already revoked',
          revoked_at: apiKey.revoked_at
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    apiKey.revoked_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'API key revoked successfully'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Add an upload to user's history
   */
  async addUpload(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const upload = {
      content_hash: data.content_hash,
      app_id: data.app_id || null,
      grant_id: data.grant_id || null,
      uploaded_at: new Date().toISOString(),
      size_bytes: data.size_bytes,
      payment_id: data.payment_id || null
    };

    profile.uploads.push(upload);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(upload), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get user's upload history
   */
  async getUploads() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(profile.uploads || []), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Update last_used_at timestamp for an API key
   */
  async updateLastUsed(keyId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const apiKey = profile.api_keys.find(key => key.key_id === keyId);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'API key not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    apiKey.last_used_at = new Date().toISOString();
    
    // Increment usage count (initialize to 0 if not present for backward compatibility)
    apiKey.usage_count = (apiKey.usage_count || 0) + 1;
    
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Rename an API key or narrow its scopes and caveats; neither may ever be loosened.
   * @param {string} keyId
   * @param {Request} request - body { name?, scopes?, caveats? }, validated by the API handler
   * @returns {Response}
   */
  async updateApiKey(keyId, request) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const apiKey = profile.api_keys.find(key => key.key_id === keyId);
    if (!apiKey) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }
    if (apiKey.revoked_at) {
      return Response.json({ error: 'KEY_REVOKED', message: 'Cannot update a revoked API key' }, { status: 400 });
    }
    if (new Date(apiKey.expires_at) < new Date()) {
      return Response.json({ error: 'KEY_EXPIRED', message: 'Cannot update an expired API key' }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch (_error) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.scopes !== undefined) {
      const current = apiKey.scopes || [];
      if (!Array.isArray(body.scopes) || body.scopes.length === 0 || body.scopes.some(scope => !current.includes(scope))) {
        return Response.json({
          error: 'SCOPE_WIDENING',
          message: 'A key\'s scopes can only be narrowed; create a new key for more access'
        }, { status: 400 });
      }
      apiKey.scopes = [...new Set(body.scopes)];
    }
    if (body.caveats !== undefined) {
      if (!caveatsNarrower(apiKey.caveats || {}, body.caveats)) {
        return Response.json({
          error: 'CAVEAT_WIDENING',
          message: 'A key\'s limits can only be tightened; create a new key for looser ones'
        }, { status: 400 });
      }
      apiKey.caveats = body.caveats;
    }
    if (body.name !== undefined) {
      apiKey.name = body.name;
    }
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    // Return updated key metadata (without sensitive fields)
    return Response.json({
      key_id: apiKey.key_id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      caveats: apiKey.caveats || {},
      created_at: apiKey.created_at,
      expires_at: apiKey.expires_at,
      last_used_at: apiKey.last_used_at,
      usage_count: apiKey.usage_count || 0,
      revoked: !!apiKey.revoked_at
    });
  }

  /**
   * Get balance information
   */
  async getBalance() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        balance_cents: profile.balance_cents || 0,
        total_deposited_cents: profile.total_deposited_cents || 0,
        total_spent_cents: profile.total_spent_cents || 0
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  securityEvent(profile, type, grantId) {
    if (type === 'grant_spend_80_percent') {
      const grant = profile.oauth_grants?.find(entry => entry.grant_id === grantId);
      if (grant?.spend_notice_reset === grant?.spend_reset) return;
      if (grant) grant.spend_notice_reset = grant.spend_reset;
    }
    profile.security_events = [...(profile.security_events || []), {
      id: crypto.randomUUID(), type, grant_id: grantId, created_at: new Date().toISOString()
    }].slice(-100);
  }

  async useOAuthGrant(grantId) {
    const profile = await this.state.storage.get('profile');
    const grant = profile?.oauth_grants?.find(entry => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) return Response.json({ error: 'Grant not found' }, { status: 404 });
    if (!grant.last_used_at) this.securityEvent(profile, 'grant_first_use', grantId);
    grant.last_used_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    return Response.json({ success: true });
  }

  async revokeAllOAuthGrants() {
    const profile = await this.state.storage.get('profile');
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    this.normalizeOAuthCollections(profile);
    const grants = profile.oauth_grants.filter(entry => !entry.revoked_at);
    this.revokeGrants(profile, grants);
    await this.state.storage.put('profile', profile);
    return Response.json({ revoked: grants.length });
  }

  normalizeOAuthCollections(profile) {
    if (!profile.oauth_grants) {
      profile.oauth_grants = [];
    }
    if (!profile.oauth_refresh_tokens) {
      profile.oauth_refresh_tokens = [];
    }
    profile.oauth_grants.forEach(migrateGrantSpending);
  }

  async getSettings() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      default_retention_months: profile.default_retention_months || null
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  async updateSettings(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    const value = data.default_retention_months;
    if (!Number.isInteger(value) || value < 1 || value > COST_POLICY.maxRetentionMonths) {
      return new Response(JSON.stringify({
        error: 'invalid_settings',
        message: 'default_retention_months must be an integer from 1 to 120'
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    profile.default_retention_months = value;
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify({
      default_retention_months: profile.default_retention_months
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  nextMonthlyReset(fromDate = new Date()) {
    const next = new Date(fromDate);
    next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  }

  async createOAuthGrant(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = {
      grant_id: `grant_${crypto.randomUUID()}`,
      user_id: profile.user_id,
      app_id: data.app_id,
      scopes: data.scopes || [],
      caveats: data.caveats || {},
      spend_used_cents: 0,
      spend_reset: this.nextMonthlyReset(),
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_grants.push(grant);

    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(grant), {
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Narrow a grant's scopes or caveats; neither may be loosened.
   * Body { scopes?, caveats? }, already parsed by the API handler.
   */
  async narrowOAuthGrant(grantId, data) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) {
      return Response.json({ error: 'Grant not found' }, { status: 404 });
    }
    if (data.scopes !== undefined && (data.scopes.length === 0 || data.scopes.some((scope) => !grant.scopes.includes(scope)))) {
      return Response.json({ error: 'SCOPE_WIDENING', message: 'An app\'s access can only be narrowed' }, { status: 400 });
    }
    if (data.caveats !== undefined && !caveatsNarrower(grant.caveats || {}, data.caveats)) {
      return Response.json({ error: 'CAVEAT_WIDENING', message: 'An app\'s limits can only be tightened' }, { status: 400 });
    }

    if (data.scopes !== undefined) grant.scopes = data.scopes;
    if (data.caveats !== undefined) grant.caveats = data.caveats;
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    return Response.json(grant);
  }

  /**
   * Admin keys live in the admin's own profile, stored as hashes only.
   * Body { key_id, key_hash, name, scopes, expires_at }, validated by the API handler.
   */
  async createAdminKey(data) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    const keys = profile.admin_keys ||= [];
    if (keys.filter((key) => !key.revoked_at && new Date(key.expires_at) > new Date()).length >= MAX_API_KEYS) {
      return Response.json({ error: 'AUTH_KEY_LIMIT', message: `Maximum of ${MAX_API_KEYS} admin keys allowed` }, { status: 400 });
    }
    const key = {
      key_id: data.key_id,
      key_hash: data.key_hash,
      name: data.name,
      scopes: data.scopes,
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
      last_used_at: null,
      usage_count: 0,
      revoked_at: null
    };
    keys.push(key);
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    const { key_hash: _hash, ...visible } = key;
    return Response.json(visible, { status: 201 });
  }

  async listAdminKeys() {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json((profile.admin_keys || []).map(({ key_hash: _hash, ...visible }) => visible));
  }

  async getAdminKey(keyId) {
    const profile = await this.state.storage.get('profile');
    const key = profile?.admin_keys?.find((entry) => entry.key_id === keyId);
    return key ? Response.json(key) : Response.json({ error: 'Admin key not found' }, { status: 404 });
  }

  async revokeAdminKey(keyId) {
    const profile = await this.state.storage.get('profile');
    const key = profile?.admin_keys?.find((entry) => entry.key_id === keyId);
    if (!key) {
      return Response.json({ error: 'Admin key not found' }, { status: 404 });
    }
    key.revoked_at ||= new Date().toISOString();
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);
    return Response.json({ success: true, revoked_at: key.revoked_at });
  }

  async recordAdminKeyUse(keyId) {
    const profile = await this.state.storage.get('profile');
    const key = profile?.admin_keys?.find((entry) => entry.key_id === keyId);
    if (!key) {
      return Response.json({ error: 'Admin key not found' }, { status: 404 });
    }
    key.last_used_at = new Date().toISOString();
    key.usage_count = (key.usage_count || 0) + 1;
    await this.state.storage.put('profile', profile);
    return Response.json({ success: true });
  }

  /**
   * Record a used authorization code; a second use fails. Entries are kept until the code expires.
   */
  async redeemOAuthCode(data) {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const now = Math.floor(Date.now() / 1000);
    const used = (profile.oauth_used_codes || []).filter((entry) => entry.expires_at > now);
    if (typeof data.jti !== 'string' || used.some((entry) => entry.jti === data.jti)) {
      return Response.json({ error: 'Code already used' }, { status: 409 });
    }
    used.push({ jti: data.jti, expires_at: Number(data.expires_at) || now + 600 });
    profile.oauth_used_codes = used;
    await this.state.storage.put('profile', profile);
    return Response.json({ redeemed: true });
  }

  async listOAuthGrants() {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);

    return new Response(JSON.stringify({
      security_events: profile.security_events || [],
      authorizations: profile.oauth_grants.filter((grant) => !grant.revoked_at).map(grant => ({
        ...grant,
        spend_used_cents: new Date(grant.spend_reset) <= new Date() ? 0 : grant.spend_used_cents,
        uploads: (profile.uploads || []).filter(upload => upload.grant_id === grant.grant_id).slice(-20)
      }))
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  async getOAuthGrant(grantId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId);
    if (!grant) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(grant), {
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Revoke grants, with their refresh tokens
   */
  revokeGrants(profile, grants) {
    const revokedAt = new Date().toISOString();
    for (const grant of grants) {
      grant.revoked_at = revokedAt;
      for (const token of profile.oauth_refresh_tokens) {
        if (token.grant_id === grant.grant_id && !token.revoked_at) {
          token.revoked_at = revokedAt;
        }
      }
    }
    profile.updated_at = revokedAt;
    return revokedAt;
  }

  async revokeOAuthGrantByApp(appId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grants = profile.oauth_grants.filter((entry) => entry.app_id === appId && !entry.revoked_at);
    if (grants.length === 0) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    const revokedAt = this.revokeGrants(profile, grants);
    await this.state.storage.put('profile', profile);

    return Response.json({ success: true, app_id: appId, revoked: grants.length, revoked_at: revokedAt });
  }

  async revokeOAuthGrantById(grantId) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === grantId && !entry.revoked_at);
    if (!grant) {
      return new Response(JSON.stringify({ error: 'Grant not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    const revokedAt = this.revokeGrants(profile, [grant]);
    await this.state.storage.put('profile', profile);

    return Response.json({ success: true, grant_id: grantId, app_id: grant.app_id, revoked_at: revokedAt });
  }

  async storeOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);

    const refreshToken = {
      token_hash: data.token_hash,
      dpop_jkt: data.dpop_jkt || null,
      grant_id: data.grant_id,
      app_id: data.app_id,
      user_id: profile.user_id,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_refresh_tokens.push(refreshToken);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(refreshToken), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  async rotateOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    const token = profile.oauth_refresh_tokens.find((entry) => entry.token_hash === data.current_token_hash);
    // Check client/key binding before reuse handling: another client cannot revoke this grant.
    if (!token || token.app_id !== data.client_id || (token.dpop_jkt && token.dpop_jkt !== data.dpop_jkt)) {
      return Response.json({ error: 'Refresh token not found' }, { status: 404 });
    }
    if (token.rotated_at) {
      const grant = profile.oauth_grants.find(entry => entry.grant_id === token.grant_id);
      if (grant && !grant.revoked_at) {
        this.revokeGrants(profile, [grant]);
        this.securityEvent(profile, 'refresh_token_reuse', grant.grant_id);
        await this.state.storage.put('profile', profile);
      }
      return Response.json({ error: 'Refresh token reused' }, { status: 404 });
    }
    if (token.revoked_at || new Date(token.expires_at) <= new Date() || Date.now() - new Date(token.family_created_at || token.created_at).getTime() >= 90 * 86400000) {
      return new Response(JSON.stringify({ error: 'Refresh token not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    // A revoked or expired grant cannot mint more tokens, and a client may only narrow its scopes
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === token.grant_id && !entry.revoked_at);
    if (!grant || (grant.caveats?.expires_at && new Date(grant.caveats.expires_at) <= new Date())) {
      return Response.json({ error: 'Grant not active' }, { status: 404 });
    }
    if (Array.isArray(data.requested_scopes) && data.requested_scopes.some((scope) => !grant.scopes.includes(scope))) {
      return Response.json({ error: 'invalid_scope' }, { status: 422 });
    }

    token.revoked_at = new Date().toISOString();
    token.rotated_at = token.revoked_at;
    const replacement = {
      family_created_at: token.family_created_at || token.created_at,
      dpop_jkt: token.dpop_jkt || null,
      token_hash: data.new_token_hash,
      grant_id: token.grant_id,
      app_id: token.app_id,
      user_id: profile.user_id,
      expires_at: data.new_expires_at,
      created_at: new Date().toISOString(),
      revoked_at: null
    };
    profile.oauth_refresh_tokens.push(replacement);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify({
      grant_id: token.grant_id,
      app_id: token.app_id,
      user_id: profile.user_id,
      scopes: grant.scopes,
      dpop_jkt: token.dpop_jkt || null
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  async revokeOAuthRefreshToken(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    // A stale client may disconnect after another tab rotated this token.
    // Possession still identifies the family that must be revoked.
    const token = profile.oauth_refresh_tokens.find((entry) => entry.token_hash === data.token_hash);
    if (!token) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    const grant = profile.oauth_grants.find(entry => entry.grant_id === token.grant_id && !entry.revoked_at);
    if (grant) this.revokeGrants(profile, [grant]);
    token.revoked_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Deposit to balance (credit)
   * This should only be called after successful Stripe payment
   */
  async depositBalance(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const amount_cents = data.amount_cents;
    if (!amount_cents || amount_cents <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const balance_before = profile.balance_cents || 0;
    const balance_after = balance_before + amount_cents;

    profile.balance_cents = balance_after;
    profile.total_deposited_cents = (profile.total_deposited_cents || 0) + amount_cents;
    // A refund of a key's or app's debit also returns its monthly spending room
    const spender = data.spender ? findSpender(profile, data.spender) : null;
    if (spender) recordSpend(spender, -amount_cents);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        balance_before_cents: balance_before,
        balance_after_cents: balance_after,
        amount_cents: amount_cents
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Debit from balance (payment)
   * Returns error if insufficient balance
   */
  async debitBalance(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    this.normalizeOAuthCollections(profile);
    const amount_cents = data.amount_cents;
    if (!amount_cents || amount_cents <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // A key or app grant spends within its own monthly limit
    const spender = data.spender ? findSpender(profile, data.spender) : null;
    if (data.spender && !spender) {
      return Response.json({ error: 'invalid_credential', message: 'The key or app authorization is no longer valid' }, { status: 400 });
    }
    if (spender) {
      rollSpend(spender, new Date(), this.nextMonthlyReset());
      if (amount_cents > spendRoomCents(spender)) {
        return Response.json({
          error: 'spending_limit_exceeded',
          message: 'This would exceed the monthly spending limit set for this key or app'
        }, { status: 400 });
      }
    }

    const balance_before = profile.balance_cents || 0;
    
    // Check for sufficient balance
    if (balance_before < amount_cents) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_balance',
          message: 'Insufficient balance for this transaction',
          balance_cents: balance_before,
          required_cents: amount_cents,
          shortfall_cents: amount_cents - balance_before
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const balance_after = balance_before - amount_cents;

    profile.balance_cents = balance_after;
    profile.total_spent_cents = (profile.total_spent_cents || 0) + amount_cents;
    if (spender) {
      const before = spender.spend_used_cents || 0;
      recordSpend(spender, amount_cents);
      const limit = spender.caveats?.monthly_spend_limit_cents;
      if (spender.grant_id && limit && before < limit * 0.8 && spender.spend_used_cents >= limit * 0.8) {
        this.securityEvent(profile, 'grant_spend_80_percent', spender.grant_id);
      }
    }
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        balance_before_cents: balance_before,
        balance_after_cents: balance_after,
        amount_cents: amount_cents
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Add supplier to user profile
   */
  async addSupplier(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const supplierId = data.supplier_id;
    
    // Initialize supplier arrays if needed
    if (!profile.supplier_ids) {
      profile.supplier_ids = [];
    }
    if (!profile.supplier_count) {
      profile.supplier_count = 0;
    }

    // Check if already added
    if (profile.supplier_ids.includes(supplierId)) {
      return new Response(
        JSON.stringify({
          error: 'Supplier already added'
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Add supplier
    profile.supplier_ids.push(supplierId);
    profile.supplier_count = profile.supplier_ids.length;
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        success: true,
        supplier_count: profile.supplier_count
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Remove supplier from user profile
   */
  async removeSupplier(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Profile not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const supplierId = data.supplier_id;
    
    // Initialize supplier arrays if needed
    if (!profile.supplier_ids) {
      profile.supplier_ids = [];
    }
    if (!profile.supplier_count) {
      profile.supplier_count = 0;
    }

    // Remove supplier
    profile.supplier_ids = profile.supplier_ids.filter(id => id !== supplierId);
    profile.supplier_count = profile.supplier_ids.length;
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        success: true,
        supplier_count: profile.supplier_count
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
