/**
 * Upload size limits
 *
 * Uploads are buffered in Worker memory (128 MB) and Cloudflare rejects request
 * bodies over 100 MB on non-Enterprise plans, so the practical ceiling is well
 * below the 256t format maximum. Keep in sync with frontend/js/upload.js.
 */

export const MAX_UPLOAD_BYTES = 90 * 1024 * 1024; // 90 MB

/**
 * Build the 413 response returned for oversized uploads
 * @param {number} sizeBytes - Size of the rejected upload, if known
 * @returns {Response} 413 Payload Too Large
 */
export function uploadTooLargeResponse(sizeBytes) {
  return new Response(
    JSON.stringify({
      error: 'Payload Too Large',
      message: `Uploads are limited to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
      max_upload_bytes: MAX_UPLOAD_BYTES,
      size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null
    }),
    {
      status: 413,
      headers: { 'content-type': 'application/json' }
    }
  );
}
