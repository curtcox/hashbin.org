/**
 * UserProfile Durable Object
 * Stores user profile data synced from Clerk authentication
 */

import { handleDownloadBudget, flushDownloadOutbox } from './download-budget.js';
import { pruneDownloadLeases } from './download-leases.js';
import { COST_POLICY } from '../utils/cost-policy.js';
import { handleBackupRequest, registerForBackup } from '../utils/backup.js';
import { handlePersonalAliases, maintainPersonalAliases, countAliasChange } from './personal-aliases.js';
import { keyMethods } from './user-profile-keys.js';
import { oauthMethods } from './user-profile-oauth.js';
import { balanceMethods } from './user-profile-balance.js';
import { dbaMethods } from './user-profile-dba.js';

export class UserProfile {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.profileQueue = Promise.resolve();
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) {
      if (request.method === 'POST' && backupResponse.ok) await this.state.storage.setAlarm?.(Date.now() + 1000);
      return backupResponse;
    }

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
        let aliasAlarm = null;
        try { aliasAlarm = await maintainPersonalAliases(this); }
        catch (error) { maintenanceFailed = true; console.error('Alias maintenance retry', error.message); }
        try { pendingAccounting = await flushDownloadOutbox(this); }
        catch (error) { maintenanceFailed = true; console.error('Download accounting retry', error.message); }
        const now = new Date();
        let receiptAlarm = null;
        try { receiptAlarm = await pruneDownloadLeases(this.state.storage, now.getTime()); }
        catch (error) { maintenanceFailed = true; console.error('Download receipt cleanup retry', error.message); }
        await this.state.storage.setAlarm(Math.min(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          receiptAlarm || Infinity, pendingAccounting ? now.getTime() + 1000 : Infinity,
          aliasAlarm || Infinity,
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
      if ((url.pathname === '/aliases' || url.pathname.startsWith('/aliases/')) &&
        !['/aliases/index', '/aliases/count-change', '/aliases/purchase-limit', '/aliases/close', '/aliases/can-act', '/aliases/move'].includes(url.pathname)) return await handlePersonalAliases(this, request);
      if (url.pathname === '/aliases/move' && method === 'POST') {
        const profile = await this.state.storage.get('profile');
        const { to } = await request.json();
        if (!profile || !profile.aliases_closing || !to || (profile.alias_move_to && profile.alias_move_to !== to)) return Response.json({ error: 'invalid_move' }, { status: 409 });
        profile.alias_move_to = to;
        await this.state.storage.put('profile', profile);
        return Response.json({ frozen: true });
      }
      if (url.pathname === '/aliases/can-act' && method === 'POST') {
        const profile = await this.state.storage.get('profile');
        return profile && !profile.deleted_at && !profile.aliases_closing ? Response.json({ allowed: true })
          : Response.json({ error: 'account_closed' }, { status: 403 });
      }
      if (url.pathname === '/aliases/close' && method === 'POST') {
        const profile = await this.state.storage.get('profile');
        if (!profile) return Response.json({ closed: true });
        profile.aliases_closing = true;
        await this.state.storage.put('profile', profile);
        return Response.json({ closed: true });
      }
      if (url.pathname.startsWith('/download/')) return await handleDownloadBudget(this, request);
      if (url.pathname.startsWith('/dba/')) return await this.handleDba(url.pathname, method, request);
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
      if (url.pathname === '/balance/receipt' && method === 'POST') {
        const data = await request.json();
        const key = `balance-receipt:${data.request_id}`;
        let receipt = await this.state.storage.get(key);
        if (!receipt && data.cancel_if_missing) {
          receipt = { cancelled: true, until: Date.now() + 31 * 86400000 };
          const alarm = await this.state.storage.getAlarm();
          if (alarm === null || alarm > receipt.until) await this.state.storage.setAlarm(receipt.until);
          await this.state.storage.put(key, receipt);
        }
        return Response.json(receipt || null);
      }
      if (url.pathname === '/balance/ack' && method === 'POST') {
        const data = await request.json();
        const moving = await this.state.storage.get('profile');
        if (moving?.alias_move_to && !moving.migrated_to) return Response.json({ error: 'account_moving' }, { status: 503 });
        if (moving?.migrated_to) {
          const forwarded = await this.env.USER_PROFILES.get(this.env.USER_PROFILES.idFromName(moving.migrated_to))
            .fetch(new Request('https://internal/balance/ack', { method: 'POST', body: JSON.stringify(data) }));
          if (!forwarded.ok) return forwarded;
        }
        const key = `balance-receipt:${data.request_id}`;
        const receipt = await this.state.storage.get(key);
        if (!receipt) return Response.json({ acknowledged: true });
        if (!receipt.consumed && receipt.requires_ack) {
          const profile = await this.state.storage.get('profile');
          if (profile) {
            profile.alias_receipts_pending = Math.max(0, (profile.alias_receipts_pending || 0) - 1);
            await this.state.storage.put({ profile, [key]: { ...receipt, consumed: true } });
            return Response.json({ acknowledged: true });
          }
        }
        await this.state.storage.put(key, { ...receipt, consumed: true });
        return Response.json({ acknowledged: true });
      }
      if (url.pathname === '/aliases/index' && method === 'POST') {
        const data = await request.json();
        const key = `${data.kind === 'offer' ? 'alias-offer' : 'global-alias'}:${data.name}`;
        if (data.remove) await this.state.storage.delete(key);
        else await this.state.storage.put(key, { name: data.name, ...data.value });
        return Response.json({ updated: true });
      }
      if (url.pathname === '/aliases/count-change' && method === 'POST') {
        return await countAliasChange(this, await request.json());
      }
      if (url.pathname === '/aliases/purchase-limit' && method === 'POST') {
        return await countAliasChange(this, await request.json(), true);
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

    const personalAliases = await this.state.storage.list({ prefix: 'personal-alias:' });
    const aliasKeys = [...personalAliases.keys()];
    for (let i = 0; i < aliasKeys.length; i += 128) await this.state.storage.delete(aliasKeys.slice(i, i + 128));

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

// Methods kept in sibling modules, installed so `this` and method names are unchanged.
Object.assign(UserProfile.prototype, keyMethods, oauthMethods, balanceMethods, dbaMethods);
