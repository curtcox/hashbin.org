/**
 * Rate Limit Pricing Utility
 * Calculates costs for rate limit bandwidth purchases
 */

// Rate per byte: $0.02 per GB (updated from $0.01 for profitability)
export const RATE_PER_BYTE = 0.02 / (1024 * 1024 * 1024); // $0.00000000001863 per byte

// Minimum time between requests: 100ms
export const MINIMUM_MTBR_MS = 100;

/**
 * Calculate rate limit purchase price
 * @param {number} sizeBytes - Content size in bytes
 * @param {number} mtbrMs - Minimum time between requests in milliseconds
 * @param {number} durationSeconds - Duration in seconds
 * @returns {object} { maxRequests, maxBytes, priceCents }
 */
export function calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds) {
  if (sizeBytes <= 0) {
    throw new Error('Content size must be positive');
  }

  if (mtbrMs < MINIMUM_MTBR_MS) {
    throw new Error(`Minimum MTBR is ${MINIMUM_MTBR_MS}ms`);
  }

  if (durationSeconds <= 0) {
    throw new Error('Duration must be positive');
  }

  const mtbrSeconds = mtbrMs / 1000;
  const maxRequests = Math.floor(durationSeconds / mtbrSeconds);

  if (maxRequests < 1) {
    throw new Error('Duration must be at least equal to MTBR');
  }

  const maxBytes = sizeBytes * maxRequests;
  const priceExact = maxBytes * RATE_PER_BYTE;
  const priceCents = Math.ceil(priceExact * 100); // Round up to nearest cent

  return {
    maxRequests,
    maxBytes,
    priceCents
  };
}

/**
 * Validate rate limit purchase parameters
 * @param {number} mtbrMs - Minimum time between requests in milliseconds
 * @param {number} durationSeconds - Duration in seconds
 * @param {number} contentExpiresAt - Content expiration date (ISO string or Date)
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateRateLimitPurchase(mtbrMs, durationSeconds, contentExpiresAt) {
  // Validate MTBR
  if (mtbrMs < MINIMUM_MTBR_MS) {
    return {
      valid: false,
      error: `min_time_between_requests_ms must be at least ${MINIMUM_MTBR_MS}ms`
    };
  }

  // Validate duration
  if (durationSeconds <= 0) {
    return {
      valid: false,
      error: 'duration_seconds must be positive'
    };
  }

  // Validate that MTBR fits within duration at least once
  const mtbrSeconds = mtbrMs / 1000;
  if (durationSeconds < mtbrSeconds) {
    return {
      valid: false,
      error: 'duration_seconds must be at least equal to MTBR in seconds'
    };
  }

  // Validate that purchase doesn't exceed content retention
  const expiresAt = new Date(contentExpiresAt);
  const now = new Date();
  const maxDurationSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

  if (durationSeconds > maxDurationSeconds) {
    return {
      valid: false,
      error: 'duration_exceeds_retention',
      content_expires_at: expiresAt.toISOString(),
      max_duration_seconds: maxDurationSeconds
    };
  }

  return { valid: true };
}

/**
 * Format cents as dollar string
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted dollar amount (e.g., "$1.50")
 */
export function formatCents(cents) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
