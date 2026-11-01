/**
 * Admin Disputes API
 * Admin-only dispute management endpoints
 */

import { adminActorId } from '../auth/admin.js';
import { handleDeleteContent } from './content-deletion.js';
import { hasScope } from '../auth/scopes.js';
import { normalizeAliasName } from '../utils/alias-names.js';

/**
 * GET /api/admin/disputes
 * List all disputes (not just open) with full details
 */
export async function handleAdminListDisputes(request, env) {
  try {

    const url = new URL(request.url);
    
    // Get query parameters
    const status = url.searchParams.get('status') || 'all';
    const claimType = url.searchParams.get('claim_type');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get DisputeIndex
    const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
    const indexStub = env.DISPUTE_INDEX.get(indexId);

    // For admin, we need to fetch disputes from index with status filter
    const queryParams = new URLSearchParams();
    if (status !== 'all') queryParams.set('status', status);
    if (claimType) queryParams.set('claim_type', claimType);
    queryParams.set('limit', limit.toString());
    queryParams.set('offset', offset.toString());

    // Note: DisputeIndex currently only tracks open disputes
    // For a full admin view, we would need to iterate through all CIDs
    // For now, return open disputes from index
    const listResponse = await indexStub.fetch(
      new Request(`http://internal/list?${queryParams.toString()}`)
    );

    const listData = await listResponse.json();

    // Fetch full dispute details including contact info for each
    const disputesWithDetails = await Promise.all(
      listData.disputes.map(async (dispute) => {
        try {
          const disputeRecordId = env.DISPUTE_RECORD.idFromName(`dispute:${dispute.cid}`);
          const disputeRecordStub = env.DISPUTE_RECORD.get(disputeRecordId);

          const detailResponse = await disputeRecordStub.fetch(
            new Request('http://internal/dispute')
          );

          if (detailResponse.ok) {
            // GET /dispute returns the dispute object itself (not wrapped)
            return await detailResponse.json();
          }

          return dispute;
        } catch (error) {
          console.error(`Error fetching details for dispute ${dispute.dispute_id}:`, error);
          return dispute;
        }
      })
    );

    return new Response(JSON.stringify({
      disputes: disputesWithDetails,
      total: listData.total,
      limit,
      offset
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error listing admin disputes:', error);
    return new Response(JSON.stringify({ 
      error: 'INTERNAL_ERROR', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * PATCH /api/admin/disputes/{dispute_id}
 * Update dispute status (admin only)
 * Note: dispute_id is in format like "disp_xxx", we need CID to look it up
 */
export async function handleAdminUpdateDispute(request, env, cid) {
  try {

    // Parse request body
    const data = await request.json();
    if (cid.startsWith('@') || cid.toLowerCase().startsWith('%40')) return updateAliasDispute(request, env, decodeURIComponent(cid).slice(1), data);

    if (data.action === 'counter_notice' || data.action === 'court_action') {
      return recordCounterNoticeStep(request, env, cid, data);
    }

    // Validation
    const validStatuses = ['open', 'under_review', 'closed_deleted', 'closed_denied', 'closed_expired'];
    if (!data.status || !validStatuses.includes(data.status)) {
      return new Response(JSON.stringify({ 
        error: 'INVALID_STATUS',
        valid_statuses: validStatuses
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upholding a dispute means taking the content down: run the full deletion flow,
    // which soft-deletes the content, closes the dispute, and logs the action
    if (data.status === 'closed_deleted') {
      const takedown = new Request(request.url, {
        method: 'DELETE',
        headers: request.headers,
        body: JSON.stringify({ reason: data.resolution_reason || 'Dispute upheld' })
      });
      takedown.user = request.user;
      takedown.isAdmin = true;
      return handleDeleteContent(takedown, env, cid);
    }

    // Get DisputeRecord for this CID
    const disputeId = env.DISPUTE_RECORD.idFromName(`dispute:${cid}`);
    const disputeStub = env.DISPUTE_RECORD.get(disputeId);

    // Get current dispute
    const currentDisputeResponse = await disputeStub.fetch(
      new Request('http://internal/dispute')
    );

    if (!currentDisputeResponse.ok) {
      return new Response(JSON.stringify({ error: 'DISPUTE_NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DisputeRecord returns the active dispute object itself (not wrapped)
    const currentDispute = await currentDisputeResponse.json();

    // Update dispute status
    const updateResponse = await disputeStub.fetch(new Request('http://internal/dispute', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: data.status,
        resolution: data.status.startsWith('closed_') ? data.status.replace('closed_', '') : null,
        resolution_reason: data.resolution_reason || null,
        resolved_by: 'admin'
      })
    }));

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      return new Response(JSON.stringify(error), {
        status: updateResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updatedDispute = await updateResponse.json();

    // If status changed to closed, update DisputeIndex
    if (data.status.startsWith('closed_') && ['open', 'under_review'].includes(currentDispute.status)) {
      const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
      const indexStub = env.DISPUTE_INDEX.get(indexId);

      await indexStub.fetch(new Request('http://internal/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispute_id: currentDispute.dispute_id
        })
      }));
    }

    const availability = env.CONTENT_METADATA.get(env.CONTENT_METADATA.idFromName(cid));
    const availabilityResponse = await availability.fetch(new Request('http://internal/availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disputed: data.status === 'open' || data.status === 'under_review' })
    }));
    if (!availabilityResponse.ok) throw new Error('Failed to publish content availability');

    try {
      if (data.status === 'open' || data.status === 'under_review') {
        await env.CONTENT_BUCKET.put(`${cid}.disputed`, JSON.stringify({
          dispute_id: currentDispute.dispute_id,
          status: data.status,
          updated_at: new Date().toISOString()
        }), {
          httpMetadata: {
            contentType: 'application/json'
          }
        });
      } else {
        await env.CONTENT_BUCKET.delete(`${cid}.disputed`);
      }
    } catch (markerError) {
      console.error('Error updating dispute marker:', markerError);
    }

    // Log admin action
    const adminLogId = env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global');
    const adminLogStub = env.ADMIN_ACTION_LOG.get(adminLogId);

    let actionType = 'dispute_status_changed';
    if (data.status === 'closed_denied') {
      actionType = 'dispute_denied';
    } else if (data.status === 'closed_deleted') {
      actionType = 'dispute_approved';
    }

    await adminLogStub.fetch(new Request('http://internal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: adminActorId(request),
        action_type: actionType,
        target_cid: cid,
        target_dispute_id: currentDispute.dispute_id,
        details: {
          old_status: currentDispute.status,
          new_status: data.status,
          resolution_reason: data.resolution_reason
        }
      })
    }));

    return new Response(JSON.stringify({
      success: true,
      dispute: updatedDispute.dispute
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating dispute:', error);
    return new Response(JSON.stringify({ 
      error: 'INTERNAL_ERROR', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function updateAliasDispute(request, env, input, data) {
  const name = normalizeAliasName(input);
  if (!name || !['under_review', 'closed_denied', 'closed_deleted'].includes(data.status)) return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
  const stub = env.DISPUTE_RECORD.get(env.DISPUTE_RECORD.idFromName(`dispute:@${name}`));
  const current = await stub.fetch(new Request('https://internal/dispute'));
  if (!current.ok) return current;
  const dispute = await current.json();
  if (dispute.target_type !== 'alias') return Response.json({ error: 'INVALID_TARGET' }, { status: 400 });
  if (data.status === 'closed_deleted') {
    if (!hasScope(request.auth, 'admin:takedown')) return Response.json({ error: 'insufficient_scope' }, { status: 403 });
    const action = data.alias_action === 'reclaim' ? 'reclaim' : 'suspend';
    if (dispute.claim_type === 'trademark' && action !== 'suspend') return Response.json({ error: 'trademark_suspension_only' }, { status: 400 });
    const moderated = await env.ALIAS_RECORDS.get(env.ALIAS_RECORDS.idFromName(`alias:${name}`)).fetch(new Request(`https://internal/${action}`, {
      method: 'POST', body: JSON.stringify({ name, admin: true, request_id: `dispute-${dispute.dispute_id}-${action}` })
    }));
    if (!moderated.ok) return moderated;
  }
  const result = await stub.fetch(new Request('https://internal/dispute', { method: 'PATCH', body: JSON.stringify({
    status: data.status, resolution: data.status.replace('closed_', ''), resolution_reason: data.resolution_reason || null, resolved_by: adminActorId(request)
  }) }));
  if (result.ok && data.status.startsWith('closed_')) await env.DISPUTE_INDEX.get(env.DISPUTE_INDEX.idFromName('dispute-index:global'))
    .fetch(new Request('https://internal/remove', { method: 'POST', body: JSON.stringify({ dispute_id: dispute.dispute_id }) }));
  return result;
}

/**
 * Record a DMCA counter-notice (schedules the content's return) or a reported court action
 * (cancels it) on an open copyright dispute. The content stays blocked either way.
 * Body: { action: 'counter_notice', received_at?: ISO date } or { action: 'court_action' }
 */
async function recordCounterNoticeStep(request, env, cid, data) {
  const disputeStub = env.DISPUTE_RECORD.get(env.DISPUTE_RECORD.idFromName(`dispute:${cid}`));
  const update = data.action === 'counter_notice'
    ? { counter_notice: { received_at: data.received_at || undefined } }
    : { court_action: true };
  const response = await disputeStub.fetch(new Request('http://internal/dispute', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  }));
  const body = await response.json();
  if (!response.ok) {
    const status = body.error === 'NO_ACTIVE_DISPUTE' ? 404 : response.status;
    return Response.json(body.error === 'NO_ACTIVE_DISPUTE' ? { error: 'DISPUTE_NOT_FOUND' } : body, { status });
  }

  const adminLog = env.ADMIN_ACTION_LOG.get(env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global'));
  await adminLog.fetch(new Request('http://internal/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admin_user_id: adminActorId(request),
      action_type: data.action === 'counter_notice' ? 'dispute_counter_notice' : 'dispute_court_action',
      target_cid: cid,
      target_dispute_id: body.dispute.dispute_id,
      details: {
        counter_notice_received_at: body.dispute.counter_notice_received_at || null,
        restore_after: body.dispute.restore_after || null
      }
    })
  }));

  return Response.json({ success: true, dispute: body.dispute });
}

/**
 * GET /api/admin/actions
 * Get admin action log
 */
export async function handleGetAdminActions(request, env) {
  try {

    const url = new URL(request.url);
    
    // Build query string
    const queryParams = new URLSearchParams();
    const actionType = url.searchParams.get('action_type');
    const limit = url.searchParams.get('limit') || '50';
    const offset = url.searchParams.get('offset') || '0';

    if (actionType) queryParams.set('action_type', actionType);
    queryParams.set('limit', limit);
    queryParams.set('offset', offset);

    // Get AdminActionLog
    const adminLogId = env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global');
    const adminLogStub = env.ADMIN_ACTION_LOG.get(adminLogId);

    const actionsResponse = await adminLogStub.fetch(
      new Request(`http://internal/actions?${queryParams.toString()}`)
    );

    const actionsData = await actionsResponse.json();

    return new Response(JSON.stringify(actionsData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error getting admin actions:', error);
    return new Response(JSON.stringify({ 
      error: 'INTERNAL_ERROR', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Repeat-infringer policy defaults; keep in sync with frontend/dmca.html section 5
export const REPEAT_INFRINGER_THRESHOLD = 3;
export const REPEAT_INFRINGER_WINDOW_DAYS = 365;

/**
 * Uploaders at or over the repeat-infringer threshold
 * @param {Object} env - Environment bindings
 * @param {number} min - Minimum upheld copyright removals
 * @param {number} days - Look-back window in days
 * @returns {Promise<Object>} { min, since, infringers: [{ uploader_id, strikes, recent_strikes }] }
 */
export async function getRepeatInfringers(env, min = REPEAT_INFRINGER_THRESHOLD, days = REPEAT_INFRINGER_WINDOW_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const log = env.ADMIN_ACTION_LOG.get(env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global'));
  const response = await log.fetch(new Request(`http://internal/repeat-infringers?min=${min}&since=${encodeURIComponent(since)}`));
  return response.json();
}

/**
 * GET /api/admin/repeat-infringers?min=3&days=365
 * Accounts with repeated upheld copyright removals (admin only)
 */
export async function handleGetRepeatInfringers(request, env) {
  const url = new URL(request.url);
  const min = Math.max(1, parseInt(url.searchParams.get('min') || String(REPEAT_INFRINGER_THRESHOLD)));
  const days = Math.max(1, parseInt(url.searchParams.get('days') || String(REPEAT_INFRINGER_WINDOW_DAYS)));
  return Response.json(await getRepeatInfringers(env, min, days));
}
