/**
 * Content downloads for local development only. Production downloads are served by the
 * 256t.us Worker (workers/256t-content/); change download behavior there.
 */
import { isInlineContent, validate256tCID, extractInlineContent } from '../utils/hash256t.js';
import { getMimeType } from '../utils/mime-types.js';
import { recordContentDownload } from '../utils/platform-stats.js';
import { tryAlternateSuppliers } from '../utils/supplier-fallback.js';

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

    // Mirror the 256t.us content worker: deleted content is gone, disputed content is blocked
    if (metadata.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'not_found', message: 'Content not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }
    if (env.CONTENT_BUCKET && await env.CONTENT_BUCKET.head(`${cid}.disputed`)) {
      return new Response(
        JSON.stringify({
          error: 'unavailable_for_legal_reasons',
          message: 'This content is blocked while a dispute is reviewed'
        }),
        { status: 451, headers: { 'content-type': 'application/json' } }
      );
    }

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
