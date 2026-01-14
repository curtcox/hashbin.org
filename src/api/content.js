/**
 * Content API Handlers
 * Endpoints for content upload, download, and metadata
 */

import { authenticate } from '../auth/middleware.js';
import { 
  calculateRetentionCost, 
  generateInsufficientBalanceMessage,
  checkBalanceSufficient,
  formatCents
} from '../utils/pricing.js';

/**
 * POST /api/content
 * Upload content with payment from balance
 */
export async function handleUploadContent(request, env) {
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
    const formData = await request.formData();
    const file = formData.get('content');
    const retention_months = parseInt(formData.get('retention_months') || '1');

    if (!file) {
      return new Response(
        JSON.stringify({
          error: 'Missing content',
          message: 'Content file is required'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (retention_months < 1) {
      return new Response(
        JSON.stringify({
          error: 'Invalid retention',
          message: 'Minimum retention is 1 month (30 days)'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const size_bytes = file.size;
    const userId = authResult.user.userId;

    // Calculate cost
    const cost_cents = calculateRetentionCost(size_bytes, retention_months);

    // Check balance
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const balanceResponse = await userProfileStub.fetch(
      new Request('http://internal/balance')
    );
    const balanceData = await balanceResponse.json();
    const balance_cents = balanceData.balance_cents;

    // Check if balance is sufficient
    const balanceCheck = checkBalanceSufficient(balance_cents, size_bytes, retention_months);
    
    if (!balanceCheck.sufficient) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_balance',
          message: generateInsufficientBalanceMessage(balance_cents, balanceCheck.required),
          required_cents: balanceCheck.required,
          balance_cents: balance_cents,
          shortfall_cents: balanceCheck.shortfall,
          deposit_url: '/balance/deposit'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // TODO: Calculate actual content hash (256t)
    // SECURITY NOTE: This placeholder is NOT suitable for production
    // - It's predictable and doesn't detect identical content with different names
    // - A proper implementation should use 256t hash of actual content bytes
    // - Hash should be calculated before balance check to avoid wasting user funds
    // For now, use a placeholder based on file name and size
    const hash_256t = `hash_${file.name}_${size_bytes}`;

    // Check if content already exists
    const contentMetadataId = env.CONTENT_METADATA.idFromName(hash_256t);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const existsResponse = await contentMetadataStub.fetch(
      new Request('http://internal/exists')
    );
    const existsData = await existsResponse.json();

    if (existsData.exists) {
      // Content already exists - extend retention by minimum 30 days
      const minRetention = Math.max(retention_months, 1);
      const extensionCost = calculateRetentionCost(size_bytes, minRetention);

      // Check balance for extension
      const extensionCheck = checkBalanceSufficient(balance_cents, size_bytes, minRetention);
      if (!extensionCheck.sufficient) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_balance',
            message: generateInsufficientBalanceMessage(balance_cents, extensionCheck.required),
            required_cents: extensionCheck.required,
            balance_cents: balance_cents,
            shortfall_cents: extensionCheck.shortfall,
            deposit_url: '/balance/deposit'
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' }
          }
        );
      }

      // Debit balance for extension
      const debitResponse = await userProfileStub.fetch(
        new Request('http://internal/balance/debit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount_cents: extensionCost })
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

      // Extend retention
      const transactionId = crypto.randomUUID();
      await contentMetadataStub.fetch(
        new Request('http://internal/extend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            months_to_add: minRetention,
            amount_cents: extensionCost,
            payer_id: userId,
            payment_id: transactionId
          })
        })
      );

      // Record transaction
      const paymentRecordId = env.PAYMENT_RECORDS.idFromName(userId);
      const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

      await paymentRecordStub.fetch(
        new Request('http://internal/transaction', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            transaction_id: transactionId,
            type: 'cid_extension',
            user_id: userId,
            amount_cents: -extensionCost,
            balance_before_cents: debitData.balance_before_cents,
            balance_after_cents: debitData.balance_after_cents,
            cid: hash_256t,
            retention_months: minRetention
          })
        })
      );

      return new Response(
        JSON.stringify({
          cid: hash_256t,
          size_bytes: size_bytes,
          expires_at: existsData.expires_at,
          cost_cents: extensionCost,
          new_balance_cents: debitData.balance_after_cents,
          message: `Retention extended for ${minRetention} month(s). You can add more at /content/${hash_256t}`
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Debit balance
    const debitResponse = await userProfileStub.fetch(
      new Request('http://internal/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: cost_cents })
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

    // Store content in R2
    const contentData = await file.arrayBuffer();
    await env.CONTENT_BUCKET.put(hash_256t, contentData, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream'
      }
    });

    // Create content metadata
    const transactionId = crypto.randomUUID();
    const metadataResponse = await contentMetadataStub.fetch(
      new Request('http://internal/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t: hash_256t,
          size_bytes: size_bytes,
          uploader_id: userId,
          retention_months: retention_months,
          amount_cents: cost_cents,
          payment_id: transactionId
        })
      })
    );

    const metadata = await metadataResponse.json();

    // Record transaction
    const paymentRecordId = env.PAYMENT_RECORDS.idFromName(userId);
    const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

    await paymentRecordStub.fetch(
      new Request('http://internal/transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          type: 'upload_payment',
          user_id: userId,
          amount_cents: -cost_cents,
          balance_before_cents: debitData.balance_before_cents,
          balance_after_cents: debitData.balance_after_cents,
          cid: hash_256t,
          retention_months: retention_months
        })
      })
    );

    // Add to user's upload history
    await userProfileStub.fetch(
      new Request('http://internal/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content_hash: hash_256t,
          size_bytes: size_bytes,
          payment_id: transactionId
        })
      })
    );

    return new Response(
      JSON.stringify({
        cid: hash_256t,
        size_bytes: size_bytes,
        expires_at: metadata.expires_at,
        cost_cents: cost_cents,
        new_balance_cents: debitData.balance_after_cents
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Upload failed',
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
 * GET /api/content/:cid
 * Get content metadata
 */
export async function handleGetContent(request, env, cid) {
  try {
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const response = await contentMetadataStub.fetch(
      new Request('http://internal/content')
    );
    
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to get content',
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
 * GET /api/content/:cid/exists
 * Check if content exists
 */
export async function handleCheckContentExists(request, env, cid) {
  try {
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const response = await contentMetadataStub.fetch(
      new Request('http://internal/exists')
    );
    
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to check content',
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
 * POST /api/content/:cid/extend
 * Extend content retention (self-donation)
 */
export async function handleExtendContent(request, env, cid) {
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
    const months_to_add = parseInt(data.months_to_add || '1');

    if (months_to_add < 1) {
      return new Response(
        JSON.stringify({
          error: 'Invalid retention',
          message: 'Minimum extension is 1 month'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const userId = authResult.user.userId;

    // Get content metadata to find size
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const contentResponse = await contentMetadataStub.fetch(
      new Request('http://internal/content')
    );

    if (!contentResponse.ok) {
      return contentResponse;
    }

    const content = await contentResponse.json();
    const size_bytes = content.size_bytes;

    // Calculate cost
    const cost_cents = calculateRetentionCost(size_bytes, months_to_add);

    // Check balance
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const balanceResponse = await userProfileStub.fetch(
      new Request('http://internal/balance')
    );
    const balanceData = await balanceResponse.json();
    const balance_cents = balanceData.balance_cents;

    // Check if balance is sufficient
    const balanceCheck = checkBalanceSufficient(balance_cents, size_bytes, months_to_add);
    
    if (!balanceCheck.sufficient) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_balance',
          message: generateInsufficientBalanceMessage(balance_cents, balanceCheck.required),
          required_cents: balanceCheck.required,
          balance_cents: balance_cents,
          shortfall_cents: balanceCheck.shortfall,
          deposit_url: '/balance/deposit'
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
        body: JSON.stringify({ amount_cents: cost_cents })
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

    // Extend retention
    const transactionId = crypto.randomUUID();
    const extendResponse = await contentMetadataStub.fetch(
      new Request('http://internal/extend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          months_to_add: months_to_add,
          amount_cents: cost_cents,
          payer_id: userId,
          payment_id: transactionId
        })
      })
    );

    const extendData = await extendResponse.json();

    // Record transaction
    const paymentRecordId = env.PAYMENT_RECORDS.idFromName(userId);
    const paymentRecordStub = env.PAYMENT_RECORDS.get(paymentRecordId);

    await paymentRecordStub.fetch(
      new Request('http://internal/transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          type: 'cid_extension',
          user_id: userId,
          amount_cents: -cost_cents,
          balance_before_cents: debitData.balance_before_cents,
          balance_after_cents: debitData.balance_after_cents,
          cid: cid,
          retention_months: months_to_add
        })
      })
    );

    return new Response(
      JSON.stringify({
        cid: cid,
        expires_at: extendData.expires_at,
        months_added: months_to_add,
        cost_cents: cost_cents,
        new_balance_cents: debitData.balance_after_cents
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Extension failed',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
