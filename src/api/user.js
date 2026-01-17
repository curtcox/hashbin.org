/**
 * User API Handlers
 * Endpoints for user-specific data (uploads, profile, etc.)
 */

import { authenticate } from '../auth/middleware.js';
import { isInlineContent } from '../utils/hash256t.js';

/**
 * GET /api/user/uploads
 * Get user's upload history with full metadata
 */
export async function handleGetUserUploads(request, env) {
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const cursor = url.searchParams.get('cursor');
    const sort = url.searchParams.get('sort') || 'uploaded_at_desc';

    const userId = authResult.user.userId;

    // Get upload history from UserProfile DO
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const uploadsResponse = await userProfileStub.fetch(
      new Request('http://internal/uploads')
    );

    if (!uploadsResponse.ok) {
      return uploadsResponse;
    }

    let uploads = await uploadsResponse.json();

    // Enrich each upload with full metadata
    const enrichedUploads = await Promise.all(
      uploads.map(async (upload) => {
        try {
          const cid = upload.content_hash;
          
          // Get content metadata
          const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
          const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
          
          const contentResponse = await contentMetadataStub.fetch(
            new Request('http://internal/content')
          );

          if (!contentResponse.ok) {
            // Content may have been deleted/expired
            return {
              cid: cid,
              size_bytes: upload.size_bytes,
              uploaded_at: upload.uploaded_at,
              expires_at: null,
              is_inline: isInlineContent(cid),
              rate_limit_status: null,
              download_count: 0,
              deleted: true
            };
          }

          const content = await contentResponse.json();

          // Get rate limit status (only for non-inline content)
          let rateLimitStatus = null;
          if (!isInlineContent(cid)) {
            const rateLimitResponse = await contentMetadataStub.fetch(
              new Request('http://internal/rate-limit')
            );

            if (rateLimitResponse.ok) {
              rateLimitStatus = await rateLimitResponse.json();
            }
          }

          return {
            cid: cid,
            size_bytes: content.size_bytes,
            uploaded_at: upload.uploaded_at,
            expires_at: content.expires_at,
            is_inline: isInlineContent(cid),
            rate_limit_status: rateLimitStatus,
            download_count: content.download_count || 0
          };
        } catch (error) {
          console.error(`Error enriching upload ${upload.content_hash}:`, error);
          return {
            cid: upload.content_hash,
            size_bytes: upload.size_bytes,
            uploaded_at: upload.uploaded_at,
            expires_at: null,
            is_inline: isInlineContent(upload.content_hash),
            rate_limit_status: null,
            download_count: 0,
            error: true
          };
        }
      })
    );

    // Filter out deleted/error uploads if desired
    const validUploads = enrichedUploads.filter(u => !u.deleted && !u.error);

    // Apply sorting
    const sortedUploads = sortUploads(validUploads, sort);

    // Apply pagination
    const startIndex = cursor ? parseInt(cursor) : 0;
    const endIndex = startIndex + limit;
    const paginatedUploads = sortedUploads.slice(startIndex, endIndex);
    const hasMore = endIndex < sortedUploads.length;
    const nextCursor = hasMore ? endIndex.toString() : null;

    return new Response(
      JSON.stringify({
        uploads: paginatedUploads,
        total_count: sortedUploads.length,
        has_more: hasMore,
        cursor: nextCursor
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Failed to get user uploads:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get uploads',
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
 * Sort uploads based on specified criteria
 */
function sortUploads(uploads, sortType) {
  const sorted = [...uploads];
  
  switch (sortType) {
    case 'uploaded_at_desc':
      sorted.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
      break;
    case 'uploaded_at_asc':
      sorted.sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at));
      break;
    case 'expires_at_asc':
      sorted.sort((a, b) => {
        if (!a.expires_at) return 1;
        if (!b.expires_at) return -1;
        return new Date(a.expires_at) - new Date(b.expires_at);
      });
      break;
    case 'size_desc':
      sorted.sort((a, b) => b.size_bytes - a.size_bytes);
      break;
    default:
      // Default to uploaded_at_desc
      sorted.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  }
  
  return sorted;
}
