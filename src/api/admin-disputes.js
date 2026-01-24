/**
 * Admin Disputes API
 * Admin-only dispute management endpoints
 */

/**
 * Check if user is admin
 */
function isAdmin(request, env) {
  if (!request.user?.userId || !env.ADMIN_USER_ID) {
    return false;
  }
  return request.user.userId === env.ADMIN_USER_ID;
}

/**
 * GET /api/admin/disputes
 * List all disputes (not just open) with full details
 */
export async function handleAdminListDisputes(request, env) {
  try {
    // Check admin authorization
    if (!isAdmin(request, env)) {
      return new Response(JSON.stringify({ 
        error: request.user?.userId ? 'NOT_ADMIN' : 'UNAUTHORIZED' 
      }), {
        status: request.user?.userId ? 403 : 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
            const detailData = await detailResponse.json();
            return detailData.dispute;
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
    // Check admin authorization
    if (!isAdmin(request, env)) {
      return new Response(JSON.stringify({ 
        error: request.user?.userId ? 'NOT_ADMIN' : 'UNAUTHORIZED' 
      }), {
        status: request.user?.userId ? 403 : 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const data = await request.json();

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
    if (data.status.startsWith('closed_') && currentDispute.dispute.status === 'open') {
      const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
      const indexStub = env.DISPUTE_INDEX.get(indexId);

      await indexStub.fetch(new Request('http://internal/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispute_id: currentDispute.dispute.dispute_id
        })
      }));
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
        admin_user_id: request.user.userId,
        action_type: actionType,
        target_cid: cid,
        target_dispute_id: currentDispute.dispute.dispute_id,
        details: {
          old_status: currentDispute.dispute.status,
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

/**
 * GET /api/admin/actions
 * Get admin action log
 */
export async function handleGetAdminActions(request, env) {
  try {
    // Check admin authorization
    if (!isAdmin(request, env)) {
      return new Response(JSON.stringify({ 
        error: request.user?.userId ? 'NOT_ADMIN' : 'UNAUTHORIZED' 
      }), {
        status: request.user?.userId ? 403 : 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
