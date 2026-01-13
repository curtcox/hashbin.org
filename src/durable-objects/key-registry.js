/**
 * KeyRegistry Durable Object
 * Maps API key hashes to user IDs for efficient lookup
 * Uses a singleton instance to maintain a global registry
 */
export class KeyRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Register a new API key
      if (url.pathname === '/register' && method === 'POST') {
        const data = await request.json();
        return await this.registerKey(data);
      }

      // Lookup an API key
      if (url.pathname === '/lookup' && method === 'POST') {
        const data = await request.json();
        return await this.lookupKey(data);
      }

      // Revoke an API key
      if (url.pathname === '/revoke' && method === 'POST') {
        const data = await request.json();
        return await this.revokeKey(data);
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
   * Register a new API key in the registry
   * Maps key_hash -> { user_id, key_id, created_at }
   */
  async registerKey(data) {
    const { key_hash, user_id, key_id } = data;

    if (!key_hash || !user_id || !key_id) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          message: 'key_hash, user_id, and key_id are required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Store the mapping
    const entry = {
      user_id,
      key_id,
      created_at: new Date().toISOString()
    };

    await this.state.storage.put(`key:${key_hash}`, entry);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Key registered successfully'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Lookup an API key by its hash
   * Returns user_id and key_id if found
   */
  async lookupKey(data) {
    const { key_hash } = data;

    if (!key_hash) {
      return new Response(
        JSON.stringify({
          error: 'Missing required field',
          message: 'key_hash is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const entry = await this.state.storage.get(`key:${key_hash}`);

    if (!entry) {
      return new Response(
        JSON.stringify({
          error: 'Key not found',
          message: 'No key found with this hash'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(entry), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Revoke an API key from the registry
   * Removes the mapping so the key can no longer be looked up
   */
  async revokeKey(data) {
    const { key_hash } = data;

    if (!key_hash) {
      return new Response(
        JSON.stringify({
          error: 'Missing required field',
          message: 'key_hash is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    await this.state.storage.delete(`key:${key_hash}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Key revoked successfully'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
