/**
 * UserProfile methods for API keys and admin keys. Installed on UserProfile.prototype
 * (user-profile.js), so `this` is the Durable Object.
 */
import { downloadBudget, validDownloadCaps } from '../utils/download-budget.js';
import { caveatsNarrower } from '../auth/scopes.js';

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

export const keyMethods = {
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
  async listAdminKeys() {
    const profile = await this.state.storage.get('profile');
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json((profile.admin_keys || []).map(({ key_hash: _hash, ...visible }) => visible));
  },
  async getAdminKey(keyId) {
    const profile = await this.state.storage.get('profile');
    const key = profile?.admin_keys?.find((entry) => entry.key_id === keyId);
    return key ? Response.json(key) : Response.json({ error: 'Admin key not found' }, { status: 404 });
  },
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
  },
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
  },
};
