/**
 * Balance API Handlers
 * Endpoints for managing user account balance
 */

import { authenticate } from '../auth/middleware.js';

/**
 * GET /api/balance
 * Get current user's balance
 */
export async function handleGetBalance(request, env) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const userId = authResult.user.userId;
    const id = env.USER_PROFILES.idFromName(userId);
    const stub = env.USER_PROFILES.get(id);
    
    // If profile doesn't exist yet, create it (handles first login)
    if (authResult.user.profileExists === false) {
      await stub.fetch(
        new Request('http://internal/profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            providers: []
          })
        })
      );
    }
    
    const response = await stub.fetch(new Request('http://internal/balance'));
    return response;
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
 * GET /api/balance/history
 * Get transaction history for current user
 */
export async function handleGetBalanceHistory(request, env) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || '20';
    const offset = url.searchParams.get('offset') || '0';
    const type = url.searchParams.get('type');

    const userId = authResult.user.userId;
    const id = env.PAYMENT_RECORDS.idFromName(userId);
    const stub = env.PAYMENT_RECORDS.get(id);
    
    const queryParams = new URLSearchParams({ limit, offset });
    if (type) queryParams.set('type', type);
    
    const response = await stub.fetch(
      new Request(`http://internal/transactions?${queryParams.toString()}`)
    );
    return response;
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
