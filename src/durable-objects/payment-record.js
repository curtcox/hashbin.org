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
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/transaction' && method === 'POST') {
        const data = await request.json();
        return await this.createTransaction(data);
      }

      if (url.pathname === '/transactions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const type = url.searchParams.get('type');
        return await this.getTransactions(limit, offset, type);
      }

      if (url.pathname.startsWith('/transaction/') && method === 'GET') {
        const transactionId = url.pathname.split('/')[2];
        return await this.getTransaction(transactionId);
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
    const transaction = {
      transaction_id: data.transaction_id,
      type: data.type, // deposit | upload_payment | cid_extension | donation_received
      user_id: data.user_id,
      amount_cents: data.amount_cents,
      balance_before_cents: data.balance_before_cents,
      balance_after_cents: data.balance_after_cents,
      stripe_session_id: data.stripe_session_id || null,
      stripe_payment_intent: data.stripe_payment_intent || null,
      cid: data.cid || null,
      retention_months: data.retention_months || null,
      created_at: new Date().toISOString()
    };

    // Store transaction with transaction_id as key
    await this.state.storage.put(`tx:${transaction.transaction_id}`, transaction);

    // Also add to chronological list for easy retrieval
    const allTransactions = await this.state.storage.get('transactions') || [];
    allTransactions.unshift(transaction.transaction_id); // newest first
    await this.state.storage.put('transactions', allTransactions);

    return new Response(JSON.stringify(transaction), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get transaction history with pagination and filtering
   */
  async getTransactions(limit, offset, typeFilter) {
    const allTransactionIds = await this.state.storage.get('transactions') || [];
    
    // Get transactions in the requested range
    const requestedIds = allTransactionIds.slice(offset, offset + limit);
    
    // Fetch full transaction objects
    const transactions = [];
    for (const txId of requestedIds) {
      const tx = await this.state.storage.get(`tx:${txId}`);
      if (tx) {
        // Apply type filter if specified
        if (!typeFilter || tx.type === typeFilter) {
          transactions.push(tx);
        }
      }
    }

    return new Response(
      JSON.stringify({
        transactions: transactions,
        total: allTransactionIds.length,
        limit: limit,
        offset: offset
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
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

    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}
