/**
 * Rate Limit API Handlers
 * Endpoints for purchasing and querying rate limits
 */

import { authenticate } from '../auth/middleware.js';
import { 
  calculateRateLimitPrice, 
  validateRateLimitPurchase,
  formatCents 
} from '../utils/rate-limit-pricing.js';

/**
 * POST /api/content/rate-limit/purchase
 * Purchase rate limit bandwidth for content
 */
export async function handlePurchaseRateLimit(request, env) {
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
    const data = await request.json();
    const { cid, min_time_between_requests_ms, duration_seconds } = data;

    if (!cid) {
      return new Response(
        JSON.stringify({
          error: 'Missing parameter',
          message: 'cid is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!min_time_between_requests_ms) {
      return new Response(
        JSON.stringify({
          error: 'Missing parameter',
          message: 'min_time_between_requests_ms is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!duration_seconds) {
      return new Response(
        JSON.stringify({
          error: 'Missing parameter',
          message: 'duration_seconds is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const userId = authResult.user.userId;

    // Get content metadata
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const contentResponse = await contentMetadataStub.fetch(
      new Request('http://internal/content')
    );

    if (!contentResponse.ok) {
      if (contentResponse.status === 404) {
        return new Response(
          JSON.stringify({
            error: 'Content not found',
            message: 'The specified CID does not exist'
          }),
          {
            status: 404,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return contentResponse;
    }

    const content = await contentResponse.json();

    // Check if content is inline
    if (content.size_bytes <= 64) {
      return new Response(
        JSON.stringify({
          error: 'Invalid content',
          message: 'Cannot purchase rate limits for inline content (≤64 bytes). Inline content has no rate limits.'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Validate purchase parameters
    const validation = validateRateLimitPurchase(
      min_time_between_requests_ms,
      duration_seconds,
      content.expires_at
    );

    if (!validation.valid) {
      if (validation.error === 'duration_exceeds_retention') {
        const remainingSeconds = Math.floor(
          (new Date(validation.content_expires_at).getTime() - Date.now()) / 1000
        );
        const remainingDays = Math.floor(remainingSeconds / 86400);
        
        return new Response(
          JSON.stringify({
            error: 'duration_exceeds_retention',
            message: `Cannot purchase rate limit beyond content retention. Content expires in ${remainingDays} days.`,
            cid: cid,
            content_expires_at: validation.content_expires_at,
            max_duration_seconds: validation.max_duration_seconds
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Invalid parameters',
          message: validation.error
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate price
    const pricing = calculateRateLimitPrice(
      content.size_bytes,
      min_time_between_requests_ms,
      duration_seconds
    );

    // Check user balance
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const balanceResponse = await userProfileStub.fetch(
      new Request('http://internal/balance')
    );
    const balanceData = await balanceResponse.json();
    const balance_cents = balanceData.balance_cents;

    if (balance_cents < pricing.priceCents) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_balance',
          message: `Insufficient balance. Required: ${formatCents(pricing.priceCents)}, Available: ${formatCents(balance_cents)}`,
          required_cents: pricing.priceCents,
          available_cents: balance_cents
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Debit balance
    const debitResponse = await userProfileStub.fetch(
      new Request('http://internal/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: pricing.priceCents })
      })
    );

    if (!debitResponse.ok) {
      const error = await debitResponse.json();
      return new Response(JSON.stringify(error), {
        status: debitResponse.status,
        headers: { 'content-type': 'application/json' }
      });
    }

    const debitData = await debitResponse.json();

    // Create rate limit record
    const recordId = crypto.randomUUID();
    const purchaseResponse = await contentMetadataStub.fetch(
      new Request('http://internal/rate-limit/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          record_id: recordId,
          payer_id: userId,
          min_time_between_requests_ms: min_time_between_requests_ms,
          duration_seconds: duration_seconds,
          max_requests: pricing.maxRequests,
          max_bytes: pricing.maxBytes,
          price_cents: pricing.priceCents
        })
      })
    );

    if (!purchaseResponse.ok) {
      // Rollback balance debit (credit it back)
      await userProfileStub.fetch(
        new Request('http://internal/balance/credit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount_cents: pricing.priceCents })
        })
      );

      return purchaseResponse;
    }

    const purchaseData = await purchaseResponse.json();

    // Record transaction
    const paymentRecordId = env.PAYMENT_RECORDS.idFromName(userId);
    const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

    await paymentRecordStub.fetch(
      new Request('http://internal/transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transaction_id: recordId,
          type: 'rate_limit_purchase',
          user_id: userId,
          amount_cents: -pricing.priceCents,
          balance_before_cents: debitData.balance_before_cents,
          balance_after_cents: debitData.balance_after_cents,
          cid: cid,
          min_time_between_requests_ms: min_time_between_requests_ms,
          duration_seconds: duration_seconds,
          max_requests: pricing.maxRequests,
          max_bytes: pricing.maxBytes
        })
      })
    );

    return new Response(
      JSON.stringify({
        purchase_id: recordId,
        cid: cid,
        size_bytes: content.size_bytes,
        min_time_between_requests_ms: min_time_between_requests_ms,
        duration_seconds: duration_seconds,
        max_requests: pricing.maxRequests,
        max_bytes: pricing.maxBytes,
        price_cents: pricing.priceCents,
        starts_at: purchaseData.starts_at,
        expires_at: purchaseData.expires_at
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Purchase failed',
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
 * GET /api/content/:cid/rate-limit
 * Get rate limit status for content
 */
export async function handleGetRateLimit(request, env, cid) {
  try {
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const response = await contentMetadataStub.fetch(
      new Request('http://internal/rate-limit')
    );
    
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to get rate limit',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
