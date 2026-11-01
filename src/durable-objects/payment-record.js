import { handleBackupRequest } from '../utils/backup.js';

/**
 * PaymentRecord Durable Object
 * Stores payment transactions and financial records
 * 
 * One instance per user_id to store all their transactions
 */
export class PaymentRecord {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/transaction' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.createTransaction(data));
      }

      if (url.pathname === '/transactions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const type = url.searchParams.get('type');
        return await this.state.blockConcurrencyWhile(() => this.getTransactions(limit, offset, type));
      }

      if (url.pathname.startsWith('/transaction/') && method === 'GET') {
        const transactionId = url.pathname.split('/')[2];
        return await this.getTransaction(transactionId);
      }

      if (url.pathname === '/session/exists' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id');
        return await this.checkSessionExists(sessionId);
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
   * Create a new transaction record
   */
  async createTransaction(data) {
    await this.ensureTransactionIndex();
    const existing = await this.state.storage.get(`tx:${data.transaction_id}`);
    if (existing) return Response.json(existing);
    const transaction = {
      id: data.transaction_id,
      transaction_id: data.transaction_id,
      type: data.type, // deposit | upload_payment | cid_extension | donation_received | rate_limit_purchase | content_deletion
      user_id: data.user_id,
      amount_cents: data.amount_cents,
      balance_before_cents: data.balance_before_cents,
      balance_after_cents: data.balance_after_cents,
      stripe_session_id: data.stripe_session_id || null,
      stripe_payment_intent: data.stripe_payment_intent || null,
      stripe_fee_cents: data.stripe_fee_cents || null, // Deposits: card payment cost added to the credit
      tax_cents: data.tax_cents || null, // Sales tax Stripe collected on the payment, if any
      cid: data.cid || null,
      retention_months: data.retention_months || null,
      alias_names: data.alias_names || null,
      alias_months: data.alias_months || null,
      auto_renew: data.auto_renew || false,
      price_cents: data.price_cents ?? null,
      fee_cents: data.fee_cents ?? null,
      from_offer: data.from_offer || false,
      // Rate limit purchase fields
      min_time_between_requests_ms: data.min_time_between_requests_ms || null,
      duration_seconds: data.duration_seconds || null,
      max_requests: data.max_requests || null,
      max_bytes: data.max_bytes || null,
      // Content deletion fields
      content_size: data.content_size || null,
      deletion_reason: data.deletion_reason || null,
      dispute_id: data.dispute_id || null,
      // Failed transaction tracking
      status: data.status || 'success',  // "success" | "failed"
      failure_reason: data.failure_reason || null,
      created_at: new Date().toISOString()
    };

    // Commit the receipt and chronological index together. A delivery retried
    // after a crash must never find a receipt absent from the history page.
    await this.state.storage.transaction(async storage => {
      const sequence = ((await storage.get('transaction-count')) || 0) + 1;
      const recent = await storage.get('transactions') || [];
      recent.unshift(transaction.transaction_id);
      await storage.put(`tx:${transaction.transaction_id}`, transaction);
      if (transaction.stripe_session_id) await storage.put(`session:${transaction.stripe_session_id}`, transaction.transaction_id);
      await storage.put(`tx-index:${String(sequence).padStart(16, '0')}`, transaction.transaction_id);
      await storage.put(`tx-type:${encodeURIComponent(transaction.type)}:${String(sequence).padStart(16, '0')}`, transaction.transaction_id);
      const types = await storage.get('transaction-types') || {};
      types[transaction.type] = (types[transaction.type] || 0) + 1;
      await storage.put('transaction-types', types);
      await storage.put('transaction-count', sequence);
      // Retain the legacy recent-ID view for old readers without growing one
      // value past SQLite DO's 128 KiB per-value limit.
      await storage.put('transactions', recent.slice(0, 100));
    });

    return new Response(JSON.stringify(transaction), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get transaction history with pagination and filtering
   */
  async getTransactions(limit, offset, typeFilter) {
    await this.ensureTransactionIndex();
    limit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 20;
    offset = Number.isSafeInteger(offset) ? Math.max(0, offset) : 0;
    const total = typeFilter ? ((await this.state.storage.get('transaction-types')) || {})[typeFilter] || 0
      : (await this.state.storage.get('transaction-count')) || 0;
    const prefix = typeFilter ? `tx-type:${encodeURIComponent(typeFilter)}:` : 'tx-index:';
    let end = typeFilter ? undefined : `tx-index:${String(Math.max(0, total - offset + 1)).padStart(16, '0')}`;
    if (typeFilter && offset >= total) return Response.json({ transactions: [], total, limit, offset });
    let remaining = typeFilter ? offset : 0;
    while (remaining > 0) {
      const skip = await this.state.storage.list({ prefix, ...(end ? { end } : {}), reverse: true, limit: Math.min(128, remaining) });
      if (!skip.size) break;
      end = [...skip.keys()].at(-1); remaining -= skip.size;
    }
    const rows = await this.state.storage.list({ prefix, ...(end ? { end } : {}), reverse: true, limit });
    const requestedIds = [...rows.values()];
    
    // Fetch full transaction objects
    const transactions = [];
    for (const txId of requestedIds) {
      const tx = await this.state.storage.get(`tx:${txId}`);
      if (tx) {
        if (!tx.id) {
          tx.id = tx.transaction_id;
        }
        // Apply type filter if specified
        if (!typeFilter || tx.type === typeFilter) {
          transactions.push(tx);
        }
      }
    }

    return new Response(
      JSON.stringify({
        transactions: transactions,
        total,
        limit: limit,
        offset: offset
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  async ensureTransactionIndex() {
    if (await this.state.storage.get('transaction-index-version') === 2) return;
    const count = await this.state.storage.get('transaction-count');
    const ids = (await this.state.storage.get('transactions')) || [];
    await this.state.storage.transaction(async storage => {
      const ordered = count === undefined ? ids.slice().reverse() : [...(await storage.list({ prefix: 'tx-index:' })).values()];
      let entries = {}; const types = {};
      for (const [index, id] of ordered.entries()) {
        const sequence = String(index + 1).padStart(16, '0');
        entries[`tx-index:${sequence}`] = id;
        const transaction = await storage.get(`tx:${id}`);
        if (transaction) {
          entries[`tx-type:${encodeURIComponent(transaction.type)}:${sequence}`] = id;
          types[transaction.type] = (types[transaction.type] || 0) + 1;
        }
        if (Object.keys(entries).length >= 126) { await storage.put(entries); entries = {}; }
      }
      if (Object.keys(entries).length) await storage.put(entries);
      await storage.put('transaction-count', ordered.length);
      await storage.put('transaction-types', types);
      await storage.put('transaction-index-version', 2);
      await storage.put('transactions', ids.slice(0, 100));
    });
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(transactionId) {
    const transaction = await this.state.storage.get(`tx:${transactionId}`);

    if (!transaction) {
      return new Response(
        JSON.stringify({
          error: 'Transaction not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!transaction.id) {
      transaction.id = transaction.transaction_id;
    }

    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Check if a Stripe session has already been processed
   */
  async checkSessionExists(sessionId) {
    if (!sessionId) {
      return new Response(
        JSON.stringify({
          error: 'Missing session_id parameter'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const transactionId = await this.state.storage.get(`session:${sessionId}`);
    
    return new Response(
      JSON.stringify({
        exists: !!transactionId,
        transaction_id: transactionId || null
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
