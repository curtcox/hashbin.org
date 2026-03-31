/**
 * Disputes API
 * Handles content dispute creation, listing, and management
 */

import { hashIP } from '../utils/ip-hash.js';

/**
 * POST /api/disputes
 * Create a new dispute against content
 */
export async function handleCreateDispute(request, env) {
  try {
    const data = await request.json();

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

    // Get IP hash for rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const ipHash = await hashIP(clientIP);

    // TODO: Implement IP-based rate limiting (10 disputes per hour)
    // For now, rate limiting is handled by re-dispute cooldown (30 days) in DisputeRecord

    // Get DisputeRecord for this CID
    const disputeId = env.DISPUTE_RECORD.idFromName(`dispute:${data.cid}`);
    const disputeStub = env.DISPUTE_RECORD.get(disputeId);

    // Check if can create new dispute (re-dispute cooldown)
    const canDisputeResponse = await disputeStub.fetch(new Request('http://internal/can-dispute'));
    const canDisputeData = await canDisputeResponse.json();

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

    await indexStub.fetch(new Request('http://internal/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: data.cid,
        dispute_id: disputeData.dispute.dispute_id,
        claim_type: data.claim_type,
        created_at: disputeData.dispute.created_at,
        expires_at: disputeData.dispute.expires_at
      })
    }));

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
