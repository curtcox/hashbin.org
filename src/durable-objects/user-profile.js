/**
 * UserProfile Durable Object
 * Stores user profile data synced from Clerk authentication
 */

// Maximum API keys per user
const MAX_API_KEYS = 25;

export class UserProfile {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
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

      if (url.pathname.startsWith('/apikeys/') && url.pathname.endsWith('/reveal') && method === 'POST') {
        const keyId = url.pathname.split('/')[2];
        return await this.revealApiKey(keyId);
      }

      // Note: Internal route uses '/update' suffix for clarity and consistency with '/reveal' pattern
      if (url.pathname.startsWith('/apikeys/') && url.pathname.endsWith('/update') && method === 'PATCH') {
        const keyId = url.pathname.split('/')[2];
        return await this.updateApiKeyName(keyId, request);
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

      if (url.pathname === '/oauth/grants' && method === 'GET') {
        return await this.listOAuthGrants();
      }

      if (url.pathname === '/oauth/grants' && method === 'POST') {
        const data = await request.json();
        return await this.upsertOAuthGrant(data);
      }

      if (url.pathname === '/oauth/refresh-tokens' && method === 'POST') {
        const data = await request.json();
        return await this.storeOAuthRefreshToken(data);
      }

      if (url.pathname === '/oauth/refresh-tokens/rotate' && method === 'POST') {
        const data = await request.json();
        return await this.rotateOAuthRefreshToken(data);
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
      key_encrypted: data.key_encrypted, // AES-256-GCM encrypted key for reveal
      name: data.name,
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
      last_used_at: null,
      usage_count: 0,
      revoked_at: null,
      reveal_timestamps: [] // Track last 3 reveal times for rate limiting
    };

    profile.api_keys.push(apiKey);
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    return new Response(
      JSON.stringify({
        key_id: apiKey.key_id,
        name: apiKey.name,
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

    // Return keys without hashes
    const keys = profile.api_keys.map(key => ({
      key_id: key.key_id,
      name: key.name,
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
   * Reveal an API key (with rate limiting)
   * Returns encrypted key data if within rate limits
   */
  async revealApiKey(keyId) {
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

    // Check if key is revoked
    if (apiKey.revoked_at) {
      return new Response(
        JSON.stringify({
          error: 'KEY_REVOKED',
          message: 'Cannot reveal a revoked API key'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check rate limiting (3 reveals per hour)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Initialize reveal_timestamps if not present (backward compatibility)
    if (!apiKey.reveal_timestamps) {
      apiKey.reveal_timestamps = [];
    }

    // Filter to only recent reveals (within last hour)
    const recentReveals = apiKey.reveal_timestamps
      .map(ts => new Date(ts))
      .filter(ts => ts > oneHourAgo);

    if (recentReveals.length >= 3) {
      // Calculate when the oldest reveal will be outside the window
      const oldestReveal = recentReveals.sort((a, b) => a - b)[0];
      const resetTime = new Date(oldestReveal.getTime() + 60 * 60 * 1000);
      const retryAfterSeconds = Math.ceil((resetTime.getTime() - now.getTime()) / 1000);

      return new Response(
        JSON.stringify({
          error: 'REVEAL_RATE_LIMITED',
          message: 'Maximum 3 reveals per hour exceeded',
          retry_after_seconds: retryAfterSeconds
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    // Record this reveal
    apiKey.reveal_timestamps.push(now.toISOString());
    
    // Keep only last 3 timestamps (sliding window)
    if (apiKey.reveal_timestamps.length > 3) {
      apiKey.reveal_timestamps = apiKey.reveal_timestamps.slice(-3);
    }

    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    // Return encrypted key data (decryption happens in API handler with encryption key)
    return new Response(
      JSON.stringify({
        key_id: apiKey.key_id,
        key_encrypted: apiKey.key_encrypted,
        name: apiKey.name,
        created_at: apiKey.created_at,
        expires_at: apiKey.expires_at,
        last_used_at: apiKey.last_used_at
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
   * Update API key name
   * @param {string} keyId
   * @param {Request} request
   * @returns {Response}
   */
  async updateApiKeyName(keyId, request) {
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

    // Find the API key
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

    // Check if key is revoked
    if (apiKey.revoked_at) {
      return new Response(
        JSON.stringify({
          error: 'KEY_REVOKED',
          message: 'Cannot update a revoked API key'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check if key is expired
    const now = new Date();
    const expiresAt = new Date(apiKey.expires_at);
    if (expiresAt < now) {
      return new Response(
        JSON.stringify({
          error: 'KEY_EXPIRED',
          message: 'Cannot update an expired API key'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const { name } = body;

    // Validate name (same validation as in auth handler for consistency)
    if (!name || typeof name !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'Invalid name',
          message: 'Name is required and must be a string'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (name.length < 1 || name.length > 100) {
      return new Response(
        JSON.stringify({
          error: 'Invalid name length',
          message: 'Name must be between 1 and 100 characters'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Update the name
    apiKey.name = name;
    profile.updated_at = new Date().toISOString();

    await this.state.storage.put('profile', profile);

    // Return updated key metadata (without sensitive fields)
    return new Response(
      JSON.stringify({
        key_id: apiKey.key_id,
        name: apiKey.name,
        created_at: apiKey.created_at,
        expires_at: apiKey.expires_at,
        last_used_at: apiKey.last_used_at,
        usage_count: apiKey.usage_count || 0,
        revoked: !!apiKey.revoked_at
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
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

  normalizeOAuthCollections(profile) {
    if (!profile.oauth_grants) {
      profile.oauth_grants = [];
    }
    if (!profile.oauth_refresh_tokens) {
      profile.oauth_refresh_tokens = [];
    }
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
    if (!Number.isInteger(value) || value < 1) {
      return new Response(JSON.stringify({
        error: 'invalid_settings',
        message: 'default_retention_months must be an integer >= 1'
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

  async upsertOAuthGrant(data) {
    const profile = await this.state.storage.get('profile');

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    this.normalizeOAuthCollections(profile);
    let grant = profile.oauth_grants.find((entry) => entry.app_id === data.app_id && !entry.revoked_at);

    if (!grant) {
      grant = {
        grant_id: `grant_${crypto.randomUUID()}`,
        user_id: profile.user_id,
        app_id: data.app_id,
        scopes: data.scopes || [],
        spending_limit: data.spending_limit ?? null,
        spending_used: 0,
        spending_reset: this.nextMonthlyReset(),
        created_at: new Date().toISOString(),
        revoked_at: null
      };
      profile.oauth_grants.push(grant);
    } else {
      grant.scopes = data.scopes || grant.scopes;
      grant.spending_limit = data.spending_limit ?? grant.spending_limit ?? null;
      if (!grant.spending_reset) {
        grant.spending_reset = this.nextMonthlyReset();
      }
    }

    profile.updated_at = new Date().toISOString();
    await this.state.storage.put('profile', profile);

    return new Response(JSON.stringify(grant), {
      headers: { 'content-type': 'application/json' }
    });
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
      authorizations: profile.oauth_grants.filter((grant) => !grant.revoked_at)
    }), {
      headers: { 'content-type': 'application/json' }
    });
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
    const token = profile.oauth_refresh_tokens.find((entry) => entry.token_hash === data.current_token_hash && !entry.revoked_at);
    if (!token || new Date(token.expires_at) <= new Date()) {
      return new Response(JSON.stringify({ error: 'Refresh token not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    token.revoked_at = new Date().toISOString();
    const grant = profile.oauth_grants.find((entry) => entry.grant_id === token.grant_id && !entry.revoked_at);
    const replacement = {
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
      scopes: grant?.scopes || []
    }), {
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

    if (data.oauth_grant_id) {
      const grant = profile.oauth_grants.find((entry) => entry.grant_id === data.oauth_grant_id && !entry.revoked_at);
      if (!grant) {
        return new Response(JSON.stringify({
          error: 'invalid_grant',
          message: 'OAuth grant not found'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (grant.spending_reset && new Date(grant.spending_reset) <= new Date()) {
        grant.spending_used = 0;
        grant.spending_reset = this.nextMonthlyReset();
      }

      if (grant.spending_limit !== null && grant.spending_limit !== undefined) {
        const proposedSpend = (grant.spending_used || 0) + (amount_cents / 100);
        if (proposedSpend > grant.spending_limit) {
          return new Response(JSON.stringify({
            error: 'spending_limit_exceeded',
            message: 'This app would exceed its monthly spending limit'
          }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
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
    if (data.oauth_grant_id) {
      const grant = profile.oauth_grants.find((entry) => entry.grant_id === data.oauth_grant_id && !entry.revoked_at);
      if (grant) {
        grant.spending_used = (grant.spending_used || 0) + (amount_cents / 100);
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
