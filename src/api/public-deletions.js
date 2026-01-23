/**
 * Public Deletion Records API
 * Public endpoints for deletion transparency
 */

/**
 * Get list of deletions with pagination and filtering
 * GET /api/public/deletions?limit=50&offset=0&reason=expired
 */
export async function handleListDeletions(request, env) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const reason = url.searchParams.get('reason') || null;

    // Get the global DeletionRecord instance
    const deletionRecordId = env.DELETION_RECORD.idFromName('global');
    const deletionRecordStub = env.DELETION_RECORD.get(deletionRecordId);

    // Build query string
    let queryString = `limit=${limit}&offset=${offset}`;
    if (reason) {
      queryString += `&reason=${reason}`;
    }

    const response = await deletionRecordStub.fetch(
      new Request(`https://dummy/records?${queryString}`, {
        method: 'GET'
      })
    );

    return response;
  } catch (error) {
    console.error('Error listing deletions:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'Failed to retrieve deletion records'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Get specific deletion record by hash
 * GET /api/public/deletions/{hash}
 */
export async function handleGetDeletion(request, env, hash) {
  try {
    // Get the global DeletionRecord instance
    const deletionRecordId = env.DELETION_RECORD.idFromName('global');
    const deletionRecordStub = env.DELETION_RECORD.get(deletionRecordId);

    const response = await deletionRecordStub.fetch(
      new Request(`https://dummy/record/${hash}`, {
        method: 'GET'
      })
    );

    return response;
  } catch (error) {
    console.error('Error getting deletion record:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'Failed to retrieve deletion record'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Get deletion statistics
 * GET /api/public/deletions/stats
 */
export async function handleGetDeletionStats(request, env) {
  try {
    // Get the global DeletionRecord instance
    const deletionRecordId = env.DELETION_RECORD.idFromName('global');
    const deletionRecordStub = env.DELETION_RECORD.get(deletionRecordId);

    const response = await deletionRecordStub.fetch(
      new Request('https://dummy/stats', {
        method: 'GET'
      })
    );

    return response;
  } catch (error) {
    console.error('Error getting deletion stats:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'Failed to retrieve deletion statistics'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
