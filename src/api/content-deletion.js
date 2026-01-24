/**
 * Content Deletion API
 * Handles uploader and admin content deletion with dispute management
 */

/**
 * DELETE /api/content/{cid}
 * Delete content (uploader or admin only)
 */
export async function handleDeleteContent(request, env, cid) {
  try {
    // Authentication required
    if (!request.user?.userId) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = request.user.userId;
    const isAdmin = env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID;

    // Get content metadata
    const contentId = env.CONTENT_METADATA.idFromName(cid);
    const contentStub = env.CONTENT_METADATA.get(contentId);
    const contentResponse = await contentStub.fetch(new Request('http://internal/content'));

    if (!contentResponse.ok) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const metadata = await contentResponse.json();

    // Check if already deleted
    if (metadata.deleted_at) {
      return new Response(JSON.stringify({ error: 'ALREADY_DELETED' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Authorization: Must be uploader or admin
    if (!isAdmin && metadata.uploader_id !== userId) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse optional request body
    let reason = 'User request';
    try {
      const body = await request.json();
      if (body.reason) {
        reason = body.reason;
      }
    } catch (e) {
      // No body or invalid JSON - use default reason
    }

    // Determine deleted_by
    const deletedBy = isAdmin ? 'admin' : 'uploader';

    // 1. Soft delete content in ContentMetadata
    const deleteResponse = await contentStub.fetch(new Request('http://internal/soft-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleted_by: deletedBy,
        deletion_reason: reason
      })
    }));

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      return new Response(JSON.stringify(error), {
        status: deleteResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Close any open disputes for this CID
    const disputeId = env.DISPUTE_RECORD.idFromName(`dispute:${cid}`);
    const disputeStub = env.DISPUTE_RECORD.get(disputeId);

    // Get active dispute if any
    const activeDisputeResponse = await disputeStub.fetch(new Request('http://internal/dispute'));
    let disputeToClose = null;

    if (activeDisputeResponse.ok) {
      const disputeData = await activeDisputeResponse.json();
      // Close dispute if it's open or under review
      if (disputeData.dispute && (disputeData.dispute.status === 'open' || disputeData.dispute.status === 'under_review')) {
        disputeToClose = disputeData.dispute;

        // Update dispute status to closed_deleted
        await disputeStub.fetch(new Request('http://internal/dispute', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'closed_deleted',
            resolution: 'deleted',
            resolution_reason: `Content deleted by ${deletedBy}`,
            resolved_by: deletedBy
          })
        }));

        // Remove from DisputeIndex
        const indexId = env.DISPUTE_INDEX.idFromName('dispute-index:global');
        const indexStub = env.DISPUTE_INDEX.get(indexId);

        await indexStub.fetch(new Request('http://internal/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dispute_id: disputeToClose.dispute_id
          })
        }));
      }
    }

    // 3. Create content_deletion transaction in PaymentRecord (amount: 0)
    const paymentId = env.PAYMENT_RECORD.idFromName(userId);
    const paymentStub = env.PAYMENT_RECORD.get(paymentId);

    // Get current balance
    const balanceResponse = await paymentStub.fetch(new Request('http://internal/transactions?limit=1'));
    const balanceData = await balanceResponse.json();
    const currentBalance = balanceData.transactions?.[0]?.balance_after_cents || 0;

    await paymentStub.fetch(new Request('http://internal/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: `txn_del_${crypto.randomUUID()}`,
        type: 'content_deletion',
        user_id: userId,
        amount_cents: 0,
        balance_before_cents: currentBalance,
        balance_after_cents: currentBalance,
        cid: cid,
        content_size: metadata.size_bytes,
        deletion_reason: reason,
        dispute_id: disputeToClose?.dispute_id || null,
        timestamp: new Date().toISOString()
      })
    }));

    // 4. Create DeletionRecord entry
    const deletionRecordId = env.DELETION_RECORD.idFromName('global');
    const deletionRecordStub = env.DELETION_RECORD.get(deletionRecordId);

    await deletionRecordStub.fetch(new Request('http://internal/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash_256t: cid,
        reason: deletedBy === 'admin' ? 'admin_action' : 'user_request',
        uploader_id: metadata.uploader_id,
        size_bytes: metadata.size_bytes,
        content_type: metadata.content_type
      })
    }));

    // 5. Log admin action if deleted by admin
    if (isAdmin) {
      const adminLogId = env.ADMIN_ACTION_LOG.idFromName('admin-action-log:global');
      const adminLogStub = env.ADMIN_ACTION_LOG.get(adminLogId);

      await adminLogStub.fetch(new Request('http://internal/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: userId,
          action_type: 'content_deleted',
          target_cid: cid,
          target_dispute_id: disputeToClose?.dispute_id || null,
          details: {
            reason: reason
          }
        })
      }));
    }

    const deletedAt = new Date().toISOString();

    return new Response(JSON.stringify({
      success: true,
      deleted: {
        cid: cid,
        deleted_at: deletedAt,
        deleted_by: deletedBy,
        dispute_closed: !!disputeToClose
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting content:', error);
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
 * POST /api/admin/content/{cid}/delete
 * Admin-only deletion with additional options
 */
export async function handleAdminDeleteContent(request, env, cid) {
  try {
    // Authentication required
    if (!request.user?.userId) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = request.user.userId;
    const isAdmin = env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID;

    // Check if user is admin
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'NOT_ADMIN' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const data = await request.json();
    const reason = data.reason || 'Admin action';
    const disputeId = data.dispute_id || null;

    // Create a modified request with reason in body
    const modifiedRequest = new Request(request.url, {
      method: 'DELETE',
      headers: request.headers,
      body: JSON.stringify({ reason })
    });
    modifiedRequest.user = request.user;

    // Call standard delete handler
    return await handleDeleteContent(modifiedRequest, env, cid);

  } catch (error) {
    console.error('Error in admin delete:', error);
    return new Response(JSON.stringify({ 
      error: 'INTERNAL_ERROR', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
