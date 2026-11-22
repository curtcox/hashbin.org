/**
 * Content metadata, existence checks and extensions. Uploads are in content-upload.js;
 * local-development downloads are in content-download.js.
 */

import { authenticate } from '../auth/middleware.js';
import { checkCaveats, spenderOf } from '../auth/scopes.js';
import { COST_POLICY, retentionWithinCap } from '../utils/cost-policy.js';
import { calculateRetentionCost, generateInsufficientBalanceMessage, checkBalanceSufficient } from '../utils/pricing.js';
import { buildContentUrl, getContentDomain } from '../utils/content-domain.js';

export async function undoDebit(profile, amount, spender) {
  if (!amount) return;
  const response = await profile.fetch(new Request('http://internal/balance/deposit', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_cents: amount, spender })
  }));
  if (!response.ok) throw new Error('Failed to restore balance after rejected retention change');
}

/**
 * Content metadata as shown to anyone: no uploader or payer identities
 * (Decision #9), and no internal bookkeeping fields
 * @param {Object} content - Stored ContentMetadata record
 * @returns {Object} Public fields
 */
export function publicContentView(content) {
  const {
    uploader_id: _uploaderId,
    retention_payments: retentionPayments = [],
    rate_limit_records: rateLimitRecords = [],
    pending_r2_deletion: _pendingR2Deletion,
    deletion_reason: _deletionReason,
    availability_version: _availabilityVersion,
    r2_meta_version: _r2MetaVersion,
    ...rest
  } = content;
  return {
    ...rest,
    retention_payment_count: retentionPayments.length,
    rate_limit_records: rateLimitRecords.map(({ payer_id: _payerId, ...record }) => record)
  };
}

/**
 * 410 for uploads, extensions, or donations targeting deleted content
 */
export function contentDeletedResponse() {
  return new Response(
    JSON.stringify({
      error: 'content_deleted',
      message: 'This content was deleted and can no longer be uploaded, extended, or funded'
    }),
    { status: 410, headers: { 'content-type': 'application/json' } }
  );
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
    
    if (!response.ok) {
      return response;
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        ...publicContentView(data),
        is_owner: Boolean(request.user?.userId && request.user.userId === data.uploader_id),
        url: buildContentUrl(env, cid, null, request),
        download_domain: getContentDomain(env, request)
      }),
      {
        status: response.status,
        headers: { 'content-type': 'application/json' }
      }
    );
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
    const rawMonths = data.months_to_add ?? data.additional_months;

    if (rawMonths === undefined || rawMonths === null) {
      return new Response(
        JSON.stringify({
          error: 'Invalid retention',
          message: 'Extension requires additional_months'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const months_to_add = Number(rawMonths);

    if (!Number.isInteger(months_to_add) || months_to_add < 1 || months_to_add > COST_POLICY.maxRetentionMonths) {
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

    const caveatDenied = checkCaveats(authResult, { cid, retention_months: months_to_add });
    if (caveatDenied) return caveatDenied;
    const spender = spenderOf(authResult);

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
    if (content.deleted_at) {
      return contentDeletedResponse();
    }
    const size_bytes = content.size_bytes;
    if (!retentionWithinCap(content.expires_at, months_to_add)) {
      return Response.json({ error: 'retention_cap', message: 'Prepaid retention cannot exceed 10 years' }, { status: 400 });
    }

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

    // Debit balance if needed
    let debitData = { balance_after_cents: balance_cents, balance_before_cents: balance_cents };

    if (cost_cents > 0) {
      const debitResponse = await userProfileStub.fetch(
        new Request('http://internal/balance/debit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount_cents: cost_cents, spender })
        })
      );

      if (!debitResponse.ok) {
        const error = await debitResponse.json();
        return new Response(JSON.stringify(error), {
          status: debitResponse.status,
          headers: { 'content-type': 'application/json' }
        });
      }

      debitData = await debitResponse.json();
    }

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

    if (!extendResponse.ok) {
      if (extendResponse.status < 500) await undoDebit(userProfileStub, cost_cents, spender);
      return extendResponse;
    }
    const extendData = await extendResponse.json();

    // Update ExpirationIndex with new expiration date
    if (content.expires_at && extendData.expires_at) {
      try {
        const expirationIndexId = env.EXPIRATION_INDEX.idFromName('global');
        const expirationIndexStub = env.EXPIRATION_INDEX.get(expirationIndexId);
        
        await expirationIndexStub.fetch(
          new Request('http://internal/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              hash_256t: cid,
              old_expires_at: content.expires_at,
              new_expires_at: extendData.expires_at
            })
          })
        );
      } catch (error) {
        // Log error but don't fail the extension
        console.error('Failed to update ExpirationIndex:', error);
      }
    }

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
        new_balance_cents: debitData.balance_after_cents,
        url: buildContentUrl(env, cid, null, request)
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
