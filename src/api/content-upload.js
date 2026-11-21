/**
 * POST /api/content/upload: hashes, prices and stores content, debiting the uploader's
 * balance (or the credential's spend limit). Re-uploading existing bytes extends them.
 */
import { authenticate } from '../auth/middleware.js';
import { checkCaveats, spenderOf } from '../auth/scopes.js';
import { COST_POLICY, retentionWithinCap } from '../utils/cost-policy.js';
import { MAX_UPLOAD_BYTES, uploadTooLargeResponse } from '../utils/upload-limits.js';
import { calculateRetentionCost, generateInsufficientBalanceMessage, checkBalanceSufficient } from '../utils/pricing.js';
import { generate256tHash, isInlineContent } from '../utils/hash256t.js';
import { recordContentUpload, recordPayment } from '../utils/platform-stats.js';
import { buildContentUrl } from '../utils/content-domain.js';
import { undoDebit, contentDeletedResponse } from './content.js';

/**
 * POST /api/content
 * Upload content with payment from balance
 */
export async function handleUploadContent(request, env, publishContext = null) {
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
    const requestContentType = request.headers.get('content-type') || '';
    const isOAuthPublish = authResult.user.authMethod === 'oauth';
    const caveats = authResult.user.caveats || {};
    const spender = spenderOf(authResult);

    let retention_months = isOAuthPublish
      ? Number(authResult.user.profile?.default_retention_months || '1')
      : Number(url.searchParams.get('retention_months') || '1');
    let contentData;
    let size_bytes;
    let contentType = requestContentType.split(';')[0] || 'application/octet-stream';

    // Reject oversized uploads before buffering the body. Multipart bodies carry a
    // little framing overhead, which the post-parse check below allows for.
    const declaredLength = parseInt(request.headers.get('content-length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      return uploadTooLargeResponse(declaredLength);
    }
    if (caveats.max_upload_bytes && Number.isFinite(declaredLength) && declaredLength > caveats.max_upload_bytes + 64 * 1024) {
      return checkCaveats(authResult, { bytes: declaredLength });
    }

    if (requestContentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('content');
      if (!isOAuthPublish) {
        retention_months = Number(formData.get('retention_months') || retention_months.toString());
      }

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

      size_bytes = file.size;
      if (size_bytes > MAX_UPLOAD_BYTES) {
        return uploadTooLargeResponse(size_bytes);
      }
      contentData = await file.arrayBuffer();
      contentType = file.type || contentType;
    } else {
      contentData = await request.arrayBuffer();
      size_bytes = contentData.byteLength;
      if (size_bytes > MAX_UPLOAD_BYTES) {
        return uploadTooLargeResponse(size_bytes);
      }
    }

    if (!contentData || size_bytes === 0) {
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

    if (!Number.isInteger(retention_months) || retention_months < 1 || retention_months > COST_POLICY.maxRetentionMonths) {
      return new Response(
        JSON.stringify({
          error: 'Invalid retention',
          message: 'Retention must be 1–120 whole months'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Apps publish with the account's default retention, held to their retention cap
    if (isOAuthPublish && caveats.max_retention_months) {
      retention_months = Math.min(retention_months, caveats.max_retention_months);
    }
    const caveatDenied = checkCaveats(authResult, { bytes: size_bytes, retention_months, content_type: contentType });
    if (caveatDenied) return caveatDenied;

    const userId = authResult.user.userId;

    // Calculate actual 256t hash
    const hash_256t = await generate256tHash(contentData);
    
    // Check if this is inline content (≤64 bytes)
    const isInline = isInlineContent(hash_256t);
    
    const rawMaxCost = url.searchParams.get('max_cost_cents');
    const maxCost = rawMaxCost === null ? null : Number(rawMaxCost);
    if (rawMaxCost !== null && (!/^\d+$/.test(rawMaxCost) || !Number.isSafeInteger(maxCost))) {
      return Response.json({ error: 'invalid_max_cost', message: 'max_cost_cents must be a non-negative integer' }, { status: 400 });
    }

    // Calculate cost (inline content is free)
    const cost_cents = isInline ? 0 : calculateRetentionCost(size_bytes, retention_months);
    if (maxCost !== null && cost_cents > maxCost) {
      return Response.json({ error: 'max_cost_exceeded', cost_cents, max_cost_cents: maxCost }, { status: 409 });
    }
    if (isInline) {
      const profile = env.USER_PROFILES.get(env.USER_PROFILES.idFromName(authResult.user.userId));
      const limited = await profile.fetch(new Request('http://internal/inline-upload', { method: 'POST' }));
      if (!limited.ok) return limited;
    }

    // Check balance (skip for inline content which is free)
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const balanceResponse = await userProfileStub.fetch(
      new Request('http://internal/balance')
    );
    const balanceData = await balanceResponse.json();
    const balance_cents = balanceData.balance_cents;

    // Check if balance is sufficient (inline content doesn't need balance)
    if (!isInline) {
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
    }

    // Check if content already exists
    const contentMetadataId = env.CONTENT_METADATA.idFromName(hash_256t);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const existsResponse = await contentMetadataStub.fetch(
      new Request('http://internal/exists')
    );
    const existsData = await existsResponse.json();

    // Deleted content stays deleted (it may have been taken down); don't charge for it
    if (existsData.deleted) {
      return contentDeletedResponse();
    }

    if (existsData.exists && !retentionWithinCap(existsData.expires_at, retention_months)) {
      return Response.json({ error: 'retention_cap', message: 'Prepaid retention cannot exceed 10 years' }, { status: 400 });
    }
    if (existsData.exists) {
      // Content already exists - extend retention by minimum 30 days
      const minRetention = Math.max(retention_months, 1);
      const extensionCost = isInline ? 0 : calculateRetentionCost(size_bytes, minRetention);

      // Check balance for extension (skip for inline content)
      if (!isInline) {
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
      }

      // Debit balance for extension (only if not inline content)
      let debitData = { balance_after_cents: balance_cents, balance_before_cents: balance_cents };
      
      if (!isInline && extensionCost > 0) {
        const debitResponse = await userProfileStub.fetch(
          new Request('http://internal/balance/debit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ amount_cents: extensionCost, spender })
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
            months_to_add: minRetention,
            amount_cents: extensionCost,
            payer_id: userId,
            payment_id: transactionId
          })
        })
      );
      if (!extendResponse.ok) {
        if (extendResponse.status < 500) await undoDebit(userProfileStub, extensionCost, spender);
        return extendResponse;
      }
      const extendData = await extendResponse.json();

      // Record transaction (only if cost > 0)
      if (!isInline && extensionCost > 0) {
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
      }

      // Add to user's upload history
      await userProfileStub.fetch(
        new Request('http://internal/uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content_hash: hash_256t,
            app_id: authResult.user.oauth?.appId || publishContext?.appId || null,
            grant_id: authResult.user.oauth?.grantId || null,
            size_bytes: size_bytes,
            payment_id: transactionId
          })
        })
      );

      return new Response(
        JSON.stringify({
          cid: hash_256t,
          size_bytes: size_bytes,
          expires_at: extendData.expires_at || existsData.expires_at,
          cost_cents: extensionCost,
          new_balance_cents: debitData.balance_after_cents,
          url: buildContentUrl(env, hash_256t, null, request),
          message: `Retention extended for ${minRetention} month(s). You can add more at /content/${hash_256t}`
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Debit balance (only if not inline content)
    let debitData = { balance_after_cents: balance_cents, balance_before_cents: balance_cents };
    
    if (!isInline && cost_cents > 0) {
      const debitResponse = await userProfileStub.fetch(
        new Request('http://internal/balance/debit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            amount_cents: cost_cents,
            spender
          })
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

    // Store content in R2 (only if not inline content)
    if (!isInline) {
      await env.CONTENT_BUCKET.put(hash_256t, contentData, {
        httpMetadata: {
          contentType: contentType || 'application/octet-stream'
        }
      });
    }
    // For inline content, no R2 storage needed - content is in the CID itself

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
          payment_id: transactionId,
          content_type: contentType || 'application/octet-stream'
        })
      })
    );

    if (!metadataResponse.ok) {
      if (metadataResponse.status < 500) await undoDebit(userProfileStub, cost_cents, spender);
      return metadataResponse;
    }
    const metadata = await metadataResponse.json();

    // Record transaction (only if cost > 0)
    if (!isInline && cost_cents > 0) {
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
    }

    // Add to user's upload history
    await userProfileStub.fetch(
      new Request('http://internal/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content_hash: hash_256t,
          app_id: authResult.user.oauth?.appId || publishContext?.appId || null,
          grant_id: authResult.user.oauth?.grantId || null,
          size_bytes: size_bytes,
          payment_id: transactionId
        })
      })
    );

    // Record platform statistics
    await recordContentUpload(env, size_bytes, isInline);
    if (!isInline && cost_cents > 0) {
      await recordPayment(env, 'upload_payment', cost_cents);
    }

    // Register with ExpirationIndex for expiration tracking (skip inline content)
    if (!isInline && metadata.expires_at) {
      try {
        const expirationIndexId = env.EXPIRATION_INDEX.idFromName('global');
        const expirationIndexStub = env.EXPIRATION_INDEX.get(expirationIndexId);
        
        await expirationIndexStub.fetch(
          new Request('http://internal/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              hash_256t: hash_256t,
              expires_at: metadata.expires_at
            })
          })
        );
      } catch (error) {
        // Log error but don't fail the upload
        console.error('Failed to register with ExpirationIndex:', error);
      }
    }

    return new Response(
      JSON.stringify({
        cid: hash_256t,
        size_bytes: size_bytes,
        expires_at: metadata.expires_at,
        cost_cents: cost_cents,
        new_balance_cents: debitData.balance_after_cents,
        url: buildContentUrl(env, hash_256t, null, request)
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
