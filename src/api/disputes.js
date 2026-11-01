/**
 * Disputes API
 * Handles content dispute creation, listing, and management
 */

import { hashIP } from '../utils/ip-hash.js';
import { NCII_CLAIM_TYPE } from '../durable-objects/dispute-record.js';
import { normalizeAliasName } from '../utils/alias-names.js';

// Intimate-image reports are seen only by administrators: the explanation, links and
// statement can identify the person shown, and the uploader must not learn who reported
const NCII_PRIVATE_FIELDS = ['evidence', 'evidence_urls', 'ncii_statement', 'submitter_contact'];

/**
 * POST /api/disputes
 * Create a new dispute against content
 */
export async function handleCreateDispute(request, env) {
  try {
    const data = await request.json();

    // Get IP hash for rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const ipHash = await hashIP(clientIP);

    // Per-IP limit: 10 submissions per hour
    const indexStubForRate = env.DISPUTE_INDEX.get(env.DISPUTE_INDEX.idFromName('dispute-index:global'));
    const rateResponse = await indexStubForRate.fetch(new Request('http://internal/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_hash: ipHash })
    }));
    const rate = await rateResponse.json();
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: 'RATE_LIMITED', retry_after_seconds: rate.retry_after_seconds }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retry_after_seconds) }
      });
    }

    if (data.target_type === 'alias') return createAliasDispute(data, env, ipHash);

    // Validate CID
    if (!data.cid) {
      return new Response(JSON.stringify({ error: 'CID_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if content exists
    const contentId = env.CONTENT_METADATA.idFromName(data.cid);
    const contentStub = env.CONTENT_METADATA.get(contentId);
    const contentResponse = await contentStub.fetch(new Request('http://internal/content'));
    
    if (!contentResponse.ok) {
      return new Response(JSON.stringify({ error: 'CID_NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const contentMetadata = await contentResponse.json();

    // Check if content is already deleted
    if (contentMetadata.deleted_at) {
      return new Response(JSON.stringify({ error: 'CID_DELETED' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get DisputeRecord for this CID
    const disputeId = env.DISPUTE_RECORD.idFromName(`dispute:${data.cid}`);
    const disputeStub = env.DISPUTE_RECORD.get(disputeId);

    const isNcii = data.claim_type === NCII_CLAIM_TYPE;

    // Check if can create new dispute (re-dispute cooldown). An intimate-image report skips
    // this: it is never delayed and replaces another open dispute (see DisputeRecord).
    const canDisputeData = isNcii
      ? { can_dispute: true }
      : await (await disputeStub.fetch(new Request('http://internal/can-dispute'))).json();

    if (!canDisputeData.can_dispute) {
      if (canDisputeData.reason === 'DISPUTE_EXISTS') {
        return new Response(JSON.stringify({ error: 'DISPUTE_EXISTS' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (canDisputeData.reason === 'REDISPUTE_TOO_SOON') {
        return new Response(JSON.stringify({ 
          error: 'REDISPUTE_TOO_SOON',
          days_remaining: canDisputeData.days_remaining
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create dispute
    const disputeRequest = new Request('http://internal/dispute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: data.cid,
        claim_type: data.claim_type,
        evidence: data.evidence,
        evidence_urls: data.evidence_urls || [],
        contact: data.contact,
        ncii: data.ncii,
        submitter_ip_hash: ipHash
      })
    });

    const disputeResponse = await disputeStub.fetch(disputeRequest);

    if (!disputeResponse.ok) {
      const error = await disputeResponse.json();
      return new Response(JSON.stringify(error), {
        status: disputeResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const disputeData = await disputeResponse.json();

    // Add to DisputeIndex
    const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
    const indexStub = env.DISPUTE_INDEX.get(indexId);

    if (disputeData.superseded_dispute_id) {
      await indexStub.fetch(new Request('http://internal/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispute_id: disputeData.superseded_dispute_id })
      }));
    }

    await indexStub.fetch(new Request('http://internal/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: data.cid,
        dispute_id: disputeData.dispute.dispute_id,
        claim_type: data.claim_type,
        created_at: disputeData.dispute.created_at,
        expires_at: disputeData.dispute.expires_at,
        removal_due_at: disputeData.dispute.removal_due_at
      })
    }));

    const availability = env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(data.cid));
    const availabilityResponse = await availability.fetch(new Request('http://internal/availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disputed: true })
    }));
    if (!availabilityResponse.ok) throw new Error('Failed to publish content availability');

    try {
      await env.CONTENT_BUCKET.put(`${data.cid}.disputed`, JSON.stringify({
        dispute_id: disputeData.dispute.dispute_id,
        created_at: disputeData.dispute.created_at
      }), {
        httpMetadata: {
          contentType: 'application/json'
        }
      });
    } catch (markerError) {
      console.error('Error writing dispute marker:', markerError);
    }

    if (isNcii) await alertNciiReport(env, data.cid, disputeData.dispute);

    return new Response(JSON.stringify(disputeData), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating dispute:', error);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function createAliasDispute(data, env, ipHash) {
  const name = normalizeAliasName(data.name || data.alias_name);
  if (!name) return Response.json({ error: 'invalid_name' }, { status: 400 });
  if (!['trademark', 'impersonation', 'abuse', 'other'].includes(data.claim_type)) return Response.json({ error: 'INVALID_CLAIM_TYPE' }, { status: 400 });
  const info = await env.ALIAS_RECORDS.get(env.ALIAS_RECORDS.idFromName(`alias:${name}`)).fetch(new Request('https://internal/info', {
    method: 'POST', body: JSON.stringify({ name })
  }));
  if (!info.ok || ['free', 'reserved'].includes((await info.json()).status)) return Response.json({ error: 'alias_not_found' }, { status: 404 });
  const stub = env.DISPUTE_RECORD.get(env.DISPUTE_RECORD.idFromName(`dispute:@${name}`));
  const response = await stub.fetch(new Request('https://internal/dispute', { method: 'POST', body: JSON.stringify({
    ...data, cid: `@${name}`, target_type: 'alias', alias_name: name, submitter_ip_hash: ipHash
  }) }));
  if (!response.ok) return response;
  const result = await response.json();
  const indexed = await env.DISPUTE_INDEX.get(env.DISPUTE_INDEX.idFromName('dispute-index:global')).fetch(new Request('https://internal/add', {
    method: 'POST', body: JSON.stringify({ cid: `@${name}`, target_type: 'alias', alias_name: name,
      dispute_id: result.dispute.dispute_id, claim_type: data.claim_type, created_at: result.dispute.created_at, expires_at: result.dispute.expires_at })
  }));
  if (!indexed.ok && indexed.status !== 409) throw new Error('Could not index alias report');
  return Response.json(result, { status: 201 });
}

/**
 * Tell the operator about a new intimate-image report: it needs a decision within 48 hours.
 * The alert names only the CID, so the webhook destination never sees the report itself.
 * Never throws; the report already stands and the hourly deadline check repeats the alert.
 * @param {Object} env - Environment bindings
 * @param {string} cid - Reported content
 * @param {Object} dispute - The created dispute ({ dispute_id, removal_due_at })
 */
async function alertNciiReport(env, cid, dispute) {
  try {
    const alertStore = env.ALERT_STORE.get(env.ALERT_STORE.idFromName('global'));
    await alertStore.fetch(new Request('https://dummy/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ncii_report',
        severity: 'critical',
        title: 'Intimate image report: decide within 48 hours',
        message: `Content ${cid} is blocked. Uphold or deny it at /admin/disputes.html before ${dispute.removal_due_at}.`,
        metadata: { cid, dispute_id: dispute.dispute_id, removal_due_at: dispute.removal_due_at }
      })
    }));
  } catch (error) {
    console.error('Error raising intimate image report alert:', error);
  }
}

/**
 * GET /api/disputes
 * List open disputes with caching
 */
export async function handleListDisputes(request, env) {
  try {
    const url = new URL(request.url);
    
    // Get DisputeIndex
    const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
    const indexStub = env.DISPUTE_INDEX.get(indexId);

    // Build query string
    const queryParams = new URLSearchParams();
    const claimType = url.searchParams.get('claim_type');
    const limit = url.searchParams.get('limit') || '50';
    const offset = url.searchParams.get('offset') || '0';

    if (claimType) queryParams.set('claim_type', claimType);
    queryParams.set('limit', limit);
    queryParams.set('offset', offset);

    // Fetch from index
    const listResponse = await indexStub.fetch(
      new Request(`http://internal/list?${queryParams.toString()}`)
    );

    const listData = await listResponse.json();

    // Return with caching headers
    return new Response(JSON.stringify(listData), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Last-Modified': listData.cache_info.last_modified,
        'Cache-Control': 'public, max-age=300' // 5 minutes
      }
    });

  } catch (error) {
    console.error('Error listing disputes:', error);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/disputes/{dispute_id}
 * Get details of a specific dispute
 */
export async function handleGetDispute(request, env, disputeId, userId = null) {
  try {
    // Parse CID from dispute_id if it follows pattern dispute:cid
    // For now, we'll need to find the dispute by scanning or using a different approach
    // Since we can't easily reverse-lookup, we'll require passing the CID
    
    // This is a limitation - we need the CID to look up the dispute
    // We'll return an error for now and recommend using GET /api/content/{cid}/disputes
    return new Response(JSON.stringify({ 
      error: 'NOT_IMPLEMENTED',
      message: 'Use GET /api/content/{cid}/disputes instead'
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error getting dispute:', error);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/content/{cid}/disputes
 * Get all disputes for a specific CID
 */
export async function handleGetContentDisputes(request, env, cid, userId = null) {
  try {
    // Get DisputeRecord for this CID
    const disputeId = env.DISPUTE_RECORD.idFromName(`dispute:${cid}`);
    const disputeStub = env.DISPUTE_RECORD.get(disputeId);

    // Get dispute history
    const historyResponse = await disputeStub.fetch(new Request('http://internal/history'));
    const historyData = await historyResponse.json();

    // Filter contact info based on authentication
    const disputes = historyData.disputes.map(dispute => {
      const filtered = { ...dispute };
      delete filtered.submitter_ip_hash;

      if (dispute.claim_type === NCII_CLAIM_TYPE) {
        for (const field of NCII_PRIVATE_FIELDS) delete filtered[field];
      }

      // Only show contact info to authenticated users
      if (!userId) {
        delete filtered.submitter_contact;
      }
      
      return filtered;
    });

    return new Response(JSON.stringify({ 
      cid,
      disputes,
      total: disputes.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error getting content disputes:', error);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/** Public alias reports use their own target key, never a content metadata record. */
export async function handleGetAliasDisputes(request, env, match) {
  const name = normalizeAliasName(match[1]);
  if (!name) return Response.json({ error: 'invalid_name' }, { status: 404 });
  return handleGetContentDisputes(request, env, `@${name}`);
}
