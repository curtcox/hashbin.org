/**
 * Content API Handlers
 * Endpoints for content upload, download, and metadata
 */

import { authenticate } from '../auth/middleware.js';
import { hasOAuthScope, insufficientScopeResponse, isOAuthAuth, oauthNotAllowedResponse } from '../auth/oauth-access.js';
import { 
  calculateRetentionCost, 
  generateInsufficientBalanceMessage,
  checkBalanceSufficient
} from '../utils/pricing.js';
import { 
  generate256tHash, 
  isInlineContent, 
  validate256tCID,
  extractInlineContent
} from '../utils/hash256t.js';
import { getMimeType } from '../utils/mime-types.js';
import { recordContentUpload, recordContentDownload, recordPayment } from '../utils/platform-stats.js';
import { tryAlternateSuppliers } from '../utils/supplier-fallback.js';

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
    const url = new URL(request.url);
    const requestContentType = request.headers.get('content-type') || '';
    const isOAuthPublish = isOAuthAuth(authResult);
    if (isOAuthPublish && !hasOAuthScope(authResult, 'content:write')) {
      return insufficientScopeResponse('content:write');
    }

    let retention_months = isOAuthPublish
      ? parseInt(authResult.user.profile?.default_retention_months || '1')
      : parseInt(url.searchParams.get('retention_months') || '1');
    let contentData;
    let size_bytes;
    let contentType = requestContentType.split(';')[0] || 'application/octet-stream';

    if (requestContentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('content');
      if (!isOAuthPublish) {
        retention_months = parseInt(formData.get('retention_months') || retention_months.toString());
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
      contentData = await file.arrayBuffer();
      contentType = file.type || contentType;
    } else {
      contentData = await request.arrayBuffer();
      size_bytes = contentData.byteLength;
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

    if (!Number.isInteger(retention_months) || retention_months < 1) {
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

    const userId = authResult.user.userId;

    // Calculate actual 256t hash
    const hash_256t = await generate256tHash(contentData);
    
    // Check if this is inline content (≤64 bytes)
    const isInline = isInlineContent(hash_256t);
    
    // Calculate cost (inline content is free)
    const cost_cents = isInline ? 0 : calculateRetentionCost(size_bytes, retention_months);

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

        debitData = await debitResponse.json();
      }

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
            size_bytes: size_bytes,
            payment_id: transactionId
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

    // Debit balance (only if not inline content)
    let debitData = { balance_after_cents: balance_cents, balance_before_cents: balance_cents };
    
    if (!isInline && cost_cents > 0) {
      const debitResponse = await userProfileStub.fetch(
        new Request('http://internal/balance/debit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            amount_cents: cost_cents,
            oauth_grant_id: isOAuthPublish ? authResult.user.oauth?.grantId : undefined
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

  if (isOAuthAuth(authResult)) {
    return oauthNotAllowedResponse();
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

    const months_to_add = parseInt(rawMonths);

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

    // Debit balance if needed
    let debitData = { balance_after_cents: balance_cents, balance_before_cents: balance_cents };

    if (cost_cents > 0) {
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

/**
 * GET /{cid} or /{cid}.{ext}
 * Download content (public, no authentication required)
 */
export async function handleDownloadContent(request, env, cid, extension = null) {
  try {
    const url = new URL(request.url);
    const method = request.method;
    
    // Validate CID format
    if (!validate256tCID(cid)) {
      return new Response(
        JSON.stringify({
          error: 'invalid_cid',
          message: 'The provided CID is not a valid 256t identifier'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const isInline = isInlineContent(cid);

    // Fetch metadata to validate existence/expiration and capture content type
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    const metadataResponse = await contentMetadataStub.fetch(
      new Request('http://internal/content')
    );

    if (!metadataResponse.ok) {
      if (metadataResponse.status === 404) {
        return new Response(
          JSON.stringify({
            error: 'not_found',
            message: 'Content not found'
          }),
          {
            status: 404,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return metadataResponse;
    }

    const metadata = await metadataResponse.json();

    // Check if content is expired
    const expiresAt = new Date(metadata.expires_at);
    if (expiresAt < new Date()) {
      // Content expired, try alternate suppliers
      const alternateResponse = await tryAlternateSuppliers(env, cid, request, extension);
      
      if (alternateResponse) {
        return alternateResponse;
      }

      // No alternates available
      return new Response(
        JSON.stringify({
          error: 'not_found',
          message: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Determine MIME type from extension or stored metadata
    const mimeType = extension ? getMimeType(extension) : (metadata.content_type || 'application/octet-stream');

    // Build base headers
    const headers = {
      'Content-Type': mimeType,
      'ETag': `"${cid}"`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    };

    // Check If-None-Match header for conditional requests
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch) {
      // Normalize ETags by removing quotes and weak prefix for comparison
      const etags = ifNoneMatch.split(',').map(tag => 
        tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
      );
      
      // Check if any ETag matches our CID
      if (etags.includes(cid)) {
        return new Response(null, {
          status: 304,
          headers: headers
        });
      }
    }

    // Check if this is inline content
    if (isInline) {
      // Inline content has no rate limit - serve immediately
      // Extract content from CID itself
      const contentBytes = extractInlineContent(cid);

      // Inline content is immutable and can be aggressively cached
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      headers['Content-Length'] = contentBytes.length.toString();
      
      // Add Content-Disposition if ?download=true
      const forceDownload = url.searchParams.get('download') === 'true';
      if (forceDownload) {
        const filename = extension ? `${cid}.${extension}` : cid;
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
      }

      // For HEAD requests, return headers only
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: headers
        });
      }

      // Return inline content immediately - no rate limit applies to inline content
      return new Response(contentBytes, {
        status: 200,
        headers: headers
      });
    }

    // Check rate limit before serving content
    const rateLimitResponse = await contentMetadataStub.fetch(
      new Request('http://internal/rate-limit/check', {
        method: 'POST'
      })
    );

    if (!rateLimitResponse.ok) {
      // Rate limit exceeded (429) or other error
      if (rateLimitResponse.status === 429) {
        // Return the rate limit error response as-is
        return rateLimitResponse;
      }
      // Other errors (404, 500, etc.)
      return rateLimitResponse;
    }

    // Rate limit check passed, get the rate limit info for headers
    const rateLimitData = await rateLimitResponse.json();

    // Check if content is contested (HTTP 451 - Unavailable For Legal Reasons)
    if (metadata.contested) {
      return new Response(
        JSON.stringify({
          error: 'unavailable_for_legal_reasons',
          message: metadata.contested_reason || 'This content is unavailable due to legal reasons',
          details: 'This content has been removed or restricted due to legal process.'
        }),
        {
          status: 451,
          headers: { 
            'content-type': 'application/json',
            'Link': '<https://hashbin.org/legal/contested>; rel="blocked-by"'
          }
        }
      );
    }

    // Fetch content from R2
    const rangeHeader = request.headers.get('Range');
    let r2Object;
    
    if (rangeHeader) {
      // Parse Range header (format: "bytes=start-end" or "bytes=start-")
      // Note: Only single ranges are supported. Multiple ranges (RFC 7233) are not implemented
      // as they are rarely used and add significant complexity. Clients needing multiple ranges
      // can make separate requests.
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2]) : undefined;
        
        // Validate range
        if (end !== undefined && start > end) {
          return new Response(
            JSON.stringify({
              error: 'invalid_range',
              message: 'Invalid range: start must be less than or equal to end'
            }),
            {
              status: 416, // Range Not Satisfiable
              headers: { 'content-type': 'application/json' }
            }
          );
        }
        
        // R2 expects a range object with offset and optional length
        const rangeOptions = { offset: start };
        if (end !== undefined) {
          rangeOptions.length = end - start + 1;
        }
        
        r2Object = await env.CONTENT_BUCKET.get(cid, { range: rangeOptions });
      } else {
        // Invalid range format, fetch full object
        r2Object = await env.CONTENT_BUCKET.get(cid);
      }
    } else {
      r2Object = await env.CONTENT_BUCKET.get(cid);
    }

    if (!r2Object) {
      // Content not in R2, try alternate suppliers
      const alternateResponse = await tryAlternateSuppliers(env, cid, request, extension);
      
      if (alternateResponse) {
        return alternateResponse;
      }

      // No alternates available or all failed
      return new Response(
        JSON.stringify({
          error: 'not_found',
          message: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Set Content-Length header
    if (r2Object.size) {
      headers['Content-Length'] = r2Object.size.toString();
    }

    // Add rate limit headers
    if (rateLimitData.next_available_at) {
      const nextAvailableTimestamp = Math.floor(new Date(rateLimitData.next_available_at).getTime() / 1000);
      headers['X-RateLimit-Content-Reset'] = nextAvailableTimestamp.toString();
    }
    if (rateLimitData.effective_mtbr_ms) {
      headers['X-RateLimit-Content-MTBR-Ms'] = rateLimitData.effective_mtbr_ms.toString();
    }

    // Handle range response
    if (r2Object.range) {
      const rangeStart = r2Object.range.offset;
      const rangeLength = r2Object.range.length || (metadata.size_bytes - rangeStart);
      const rangeEnd = rangeStart + rangeLength - 1;
      
      headers['Content-Range'] = `bytes ${rangeStart}-${rangeEnd}/${metadata.size_bytes}`;
      headers['Content-Length'] = rangeLength.toString();
    }

    // Add Content-Disposition if ?download=true
    const forceDownload = url.searchParams.get('download') === 'true';
    if (forceDownload) {
      const filename = extension ? `${cid}.${extension}` : cid;
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    // For HEAD requests, return headers only
    if (method === 'HEAD') {
      return new Response(null, {
        status: rangeHeader ? 206 : 200,
        headers: headers
      });
    }

    // Increment download count (fire and forget - intentionally async for performance)
    // Note: This is not awaited to avoid blocking the response. The download count
    // is aggregate analytics only and small inconsistencies are acceptable.
    // Race conditions are handled by the Durable Object's transactional storage.
    // Errors are logged but don't cause memory leaks - failed increments are ignored.
    incrementDownloadCount(env, cid).catch(err => {
      console.error('Failed to increment download count:', err);
    });
    
    // Record platform statistics
    recordContentDownload(env).catch(err => {
      console.error('Failed to record platform download stat:', err);
    });

    // Stream content
    return new Response(r2Object.body, {
      status: rangeHeader ? 206 : 200,
      headers: headers
    });
  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({
        error: 'Download failed',
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
 * Increment download count for content
 * @param {Object} env - Environment bindings
 * @param {string} cid - Content ID
 */
async function incrementDownloadCount(env, cid) {
  try {
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    await contentMetadataStub.fetch(
      new Request('http://internal/increment-download', {
        method: 'POST'
      })
    );
  } catch (error) {
    // Ignore errors - download count is not critical
    console.error('Error incrementing download count:', error);
  }
}
