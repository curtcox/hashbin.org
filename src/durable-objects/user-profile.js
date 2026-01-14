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

    const profile = {
      user_id: data.user_id,
      providers: data.providers || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      api_keys: [],
      uploads: [],
      balance_cents: 0,
      total_deposited_cents: 0,
      total_spent_cents: 0
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
      name: data.name,
      created_at: new Date().toISOString(),
      expires_at: data.expires_at,
      last_used_at: null,
      revoked_at: null
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
      return new Response(
        JSON.stringify({
          error: 'API key already revoked'
        }),
        {
          status: 400,
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
}
