/**
 * Alternate Supplier Fallback Utilities
 * Handles fetching content from alternate suppliers when unavailable on hashbin.org
 */

import { generate256tHash, getContentSize } from './hash256t.js';
import { getMimeType } from './mime-types.js';

// Configuration constants
const ROLLING_WINDOW_SIZE = 100; // Rolling window size for statistics
const SUCCESS_RATE_THRESHOLD = 0.95; // 95% success rate required for redirect
const WARMUP_REQUEST_COUNT = 100; // Requests before redirect is allowed
const PERIODIC_PROXY_INTERVAL = 100; // Proxy every Nth request for verification

/**
 * Fisher-Yates shuffle for uniform random distribution
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (in-place)
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Decide whether to proxy or redirect based on supplier statistics
 * @param {Object} stats - Supplier statistics
 * @returns {string} 'proxy' or 'redirect'
 */
export function decideProxyOrRedirect(stats) {
  // Warmup period: first N requests must be proxied
  if (stats.total_requests < WARMUP_REQUEST_COUNT) {
    return 'proxy';
  }

  // Low success rate: proxy for verification
  const recentTotal = stats.recent_success_count + stats.recent_failure_count;
  const recentSuccessRate = recentTotal > 0 ? stats.recent_success_count / recentTotal : 0;
  
  if (recentSuccessRate < SUCCESS_RATE_THRESHOLD) {
    return 'proxy';
  }

  // Periodic verification: every Nth request
  if (stats.requests_since_last_proxy >= PERIODIC_PROXY_INTERVAL) {
    return 'proxy';
  }

  // All conditions met: use redirect
  return 'redirect';
}

/**
 * Fetch content from alternate supplier (proxy mode)
 * @param {string} supplierUrl - Full URL to content
 * @param {string} cid - Expected CID for verification
 * @param {Object} request - Original request (for Range header)
 * @returns {Promise<{success: boolean, content?: ArrayBuffer, headers?: Object, error?: string}>}
 */
export async function fetchFromAlternate(supplierUrl, cid, request) {
  try {
    const startTime = Date.now();
    
    // Build headers for alternate request
    const fetchHeaders = new Headers();
    
    // Forward Range header if present (with validation)
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      // Validate Range header format (basic validation)
      if (/^bytes=\d+-\d*$/.test(rangeHeader) || /^bytes=\d+-$/.test(rangeHeader)) {
        fetchHeaders.set('Range', rangeHeader);
      }
    }

    // Fetch from alternate
    const response = await fetch(supplierUrl, {
      headers: fetchHeaders
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        response_time_ms: Date.now() - startTime
      };
    }

    const content = await response.arrayBuffer();
    const responseTimeMs = Date.now() - startTime;

    // For full content (not range), verify hash
    const isPartialContent = response.status === 206;
    
    if (!isPartialContent) {
      // Verify size
      const expectedSize = getContentSize(cid);
      if (content.byteLength !== expectedSize) {
        return {
          success: false,
          error: `Size mismatch: got ${content.byteLength} bytes, expected ${expectedSize} bytes`,
          response_time_ms: responseTimeMs,
          verification_failed: true
        };
      }

      // Verify hash
      const computedHash = await generate256tHash(content);
      if (computedHash !== cid) {
        return {
          success: false,
          error: 'Content hash does not match CID',
          response_time_ms: responseTimeMs,
          verification_failed: true
        };
      }
    }

    // Extract relevant response headers
    const headers = {};
    if (response.headers.has('Content-Type')) {
      headers['Content-Type'] = response.headers.get('Content-Type');
    }
    if (response.headers.has('Content-Length')) {
      headers['Content-Length'] = response.headers.get('Content-Length');
    }
    if (response.headers.has('Content-Range')) {
      headers['Content-Range'] = response.headers.get('Content-Range');
    }
    if (response.headers.has('Accept-Ranges')) {
      headers['Accept-Ranges'] = response.headers.get('Accept-Ranges');
    }

    return {
      success: true,
      content,
      headers,
      response_time_ms: responseTimeMs,
      is_partial: isPartialContent
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Try fetching content from alternate suppliers
 * @param {Object} env - Environment bindings
 * @param {string} cid - Content identifier
 * @param {Object} request - Original request
 * @param {string} extension - Optional file extension for MIME type
 * @returns {Promise<Response|null>} Response or null if no alternates work
 */
export async function tryAlternateSuppliers(env, cid, request, extension = null) {
  try {
    // Get alternate suppliers for this CID
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const suppliersResponse = await contentMetadataStub.fetch(
      new Request('http://internal/suppliers')
    );

    if (!suppliersResponse.ok) {
      return null;
    }

    const suppliersData = await suppliersResponse.json();
    const alternateSuppliers = suppliersData.alternate_suppliers || [];

    if (alternateSuppliers.length === 0) {
      return null;
    }

    // Use Fisher-Yates shuffle for uniform random distribution
    const shuffled = shuffleArray([...alternateSuppliers]);

    // Try each supplier
    for (const supplier of shuffled) {
      try {
        // Get supplier details and statistics
        const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplier.supplier_id);
        const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
        
        const supplierResponse = await supplierRegistryStub.fetch(
          new Request('http://internal/supplier')
        );

        if (!supplierResponse.ok) {
          continue;
        }

        const supplierData = await supplierResponse.json();

        // Skip inactive suppliers
        if (!supplierData.is_active) {
          continue;
        }

        // Get statistics
        const statsResponse = await supplierRegistryStub.fetch(
          new Request('http://internal/stats')
        );

        let stats = null;
        if (statsResponse.ok) {
          stats = await statsResponse.json();
        }

        // Decide proxy or redirect
        const mode = stats ? decideProxyOrRedirect(stats) : 'proxy';

        if (mode === 'redirect') {
          // Record redirect (no verification possible)
          await supplierRegistryStub.fetch(
            new Request('http://internal/stats/record', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                success: true, // Assume success for redirects
                was_proxy: false
              })
            })
          );

          // Increment download count
          await contentMetadataStub.fetch(
            new Request('http://internal/increment-download', {
              method: 'POST'
            })
          );

          // Return redirect response
          return new Response(null, {
            status: 302,
            headers: {
              'Location': supplier.supplier_url,
              'X-HashBin-Source': 'redirect',
              'X-HashBin-Supplier': supplierData.name,
              'Cache-Control': 'no-cache'
            }
          });
        } else {
          // Proxy mode
          const result = await fetchFromAlternate(supplier.supplier_url, cid, request);

          // Record statistics
          await supplierRegistryStub.fetch(
            new Request('http://internal/stats/record', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                success: result.success,
                response_time_ms: result.response_time_ms,
                was_proxy: true,
                verification_failed: result.verification_failed || false
              })
            })
          );

          if (result.success) {
            // Increment download count
            await contentMetadataStub.fetch(
              new Request('http://internal/increment-download', {
                method: 'POST'
              })
            );

            // Determine MIME type
            const mimeType = extension ? getMimeType(extension) : 
                            (result.headers['Content-Type'] || 'application/octet-stream');

            // Build response headers
            const headers = {
              'Content-Type': mimeType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'ETag': `"${cid}"`,
              'Accept-Ranges': result.headers['Accept-Ranges'] || 'bytes',
              'Access-Control-Allow-Origin': '*',
              'X-Content-Type-Options': 'nosniff',
              'X-HashBin-Source': 'alternate',
              'X-HashBin-Supplier': supplierData.name,
              'X-HashBin-Supplier-URL': supplier.supplier_url
            };

            if (result.headers['Content-Length']) {
              headers['Content-Length'] = result.headers['Content-Length'];
            }

            if (result.headers['Content-Range']) {
              headers['Content-Range'] = result.headers['Content-Range'];
            }

            const status = result.is_partial ? 206 : 200;

            return new Response(result.content, {
              status,
              headers
            });
          }
          
          // This supplier failed, try next one
          continue;
        }
      } catch (error) {
        console.error(`Error trying supplier ${supplier.supplier_id}:`, error);
        continue;
      }
    }

    // All suppliers failed
    return null;
  } catch (error) {
    console.error('Error in tryAlternateSuppliers:', error);
    return null;
  }
}
