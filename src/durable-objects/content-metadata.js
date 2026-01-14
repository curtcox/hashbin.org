/**
 * ContentMetadata Durable Object
 * Stores metadata for uploaded content including hash, size, expiration, and contest status
 */
export class ContentMetadata {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Create or update content record
      if (url.pathname === '/content' && method === 'POST') {
        const data = await request.json();
        return await this.createContent(data);
      }

      // Get content metadata
      if (url.pathname === '/content' && method === 'GET') {
        return await this.getContent();
      }

      // Check if content exists
      if (url.pathname === '/exists' && method === 'GET') {
        return await this.checkExists();
      }

      // Extend content retention
      if (url.pathname === '/extend' && method === 'POST') {
        const data = await request.json();
        return await this.extendRetention(data);
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
   * Create content record
   */
  async createContent(data) {
    const existingContent = await this.state.storage.get('content');

    if (existingContent) {
      // Content already exists, extend retention instead
      return new Response(
        JSON.stringify({
          error: 'Content already exists',
          message: 'This content has already been uploaded',
          content: existingContent
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate expiration date
    const created_at = new Date();
    const expires_at = new Date(created_at);
    expires_at.setMonth(expires_at.getMonth() + data.retention_months);

    const content = {
      hash_256t: data.hash_256t,
      size_bytes: data.size_bytes,
      uploader_id: data.uploader_id,
      created_at: created_at.toISOString(),
      expires_at: expires_at.toISOString(),
      retention_payments: [
        {
          payment_id: data.payment_id || null,
          amount_cents: data.amount_cents,
          months_added: data.retention_months,
          payer_id: data.uploader_id,
          created_at: created_at.toISOString()
        }
      ]
    };

    await this.state.storage.put('content', content);

    return new Response(JSON.stringify(content), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get content metadata
   */
  async getContent() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(content), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Check if content exists
   */
  async checkExists() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          exists: false
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        exists: true,
        size_bytes: content.size_bytes,
        expires_at: content.expires_at
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Extend content retention
   */
  async extendRetention(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate new expiration
    const current_expires_at = new Date(content.expires_at);
    const new_expires_at = new Date(current_expires_at);
    new_expires_at.setMonth(new_expires_at.getMonth() + data.months_to_add);

    // Add payment record
    const payment = {
      payment_id: data.payment_id || null,
      amount_cents: data.amount_cents,
      months_added: data.months_to_add,
      payer_id: data.payer_id || null,
      created_at: new Date().toISOString()
    };

    content.expires_at = new_expires_at.toISOString();
    content.retention_payments.push(payment);

    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({
        expires_at: content.expires_at,
        months_added: data.months_to_add,
        total_payments: content.retention_payments.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
