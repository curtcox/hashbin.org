/**
 * Rate Limit Utilities
 * Helper functions for rate limit display and pricing
 */

/**
 * Format MTBR (minimum time between requests) to human-readable text
 * @param {number} mtbrMs MTBR in milliseconds
 * @returns {string} Formatted text (e.g., "1 request/second")
 */
export function formatMTBR(mtbrMs) {
  if (mtbrMs === null || mtbrMs === Infinity) {
    return 'Blocked';
  }

  // If less than 1 second, show requests per second
  if (mtbrMs < 1000) {
    const requestsPerSecond = Math.floor(1000 / mtbrMs);
    return `${requestsPerSecond} request${requestsPerSecond > 1 ? 's' : ''}/second`;
  }

  // Convert to seconds
  const seconds = mtbrMs / 1000;

  // Less than 1 minute - show as "X requests/minute" or "1 request/N seconds"
  if (seconds < 60) {
    if (seconds === 1) {
      return '1 request/second';
    } else if (60 % seconds === 0) {
      // Show as requests per minute if it divides evenly
      const requestsPerMinute = 60 / seconds;
      return `${requestsPerMinute} request${requestsPerMinute > 1 ? 's' : ''}/minute`;
    } else {
      return `1 request/${seconds} seconds`;
    }
  }

  const minutes = seconds / 60;

  // Less than 1 hour
  if (minutes < 60) {
    if (minutes === 1) {
      return '1 request/minute';
    } else if (60 % minutes === 0) {
      const requestsPerHour = 60 / minutes;
      return `${requestsPerHour} request${requestsPerHour > 1 ? 's' : ''}/hour`;
    } else {
      return `1 request/${minutes} minutes`;
    }
  }

  const hours = minutes / 60;

  // Less than 1 day
  if (hours < 24) {
    if (hours === 1) {
      return '1 request/hour';
    } else if (24 % hours === 0) {
      const requestsPerDay = 24 / hours;
      return `${requestsPerDay} request${requestsPerDay > 1 ? 's' : ''}/day`;
    } else {
      return `1 request/${hours} hours`;
    }
  }

  const days = hours / 24;

  if (days === 1) {
    return '1 request/day';
  } else {
    return `1 request/${Math.floor(days)} days`;
  }
}

/**
 * Calculate rate limit pricing
 * @param {number} sizeBytes Content size in bytes
 * @param {number} mtbrMs Minimum time between requests in milliseconds
 * @param {number} durationSeconds Duration in seconds
 * @returns {Object} Pricing details
 */
export function calculateRateLimitPrice(sizeBytes, mtbrMs, durationSeconds) {
  const mtbrSeconds = mtbrMs / 1000;
  const maxRequests = Math.floor(durationSeconds / mtbrSeconds);
  const maxBytes = sizeBytes * maxRequests;
  
  // Pricing formula: $0.02 per GB (updated from $0.01 for profitability)
  // Price = (total_GB_transferred) * $0.02 * 100 cents
  const pricePerGB = 0.02; // $0.02 per GB
  const bytesPerGB = 1024 * 1024 * 1024;
  const totalGB = (sizeBytes * maxRequests) / bytesPerGB;
  const priceCents = Math.ceil(totalGB * pricePerGB * 100);
  
  // Minimum price is $0.01
  const finalPriceCents = Math.max(priceCents, 1);
  
  return {
    maxRequests,
    maxBytes,
    priceCents: finalPriceCents
  };
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes Size in bytes
 * @returns {string} Formatted size (e.g., "1.5 GB")
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format price in cents to dollar string
 * @param {number} cents Price in cents
 * @returns {string} Formatted price (e.g., "$12.50")
 */
export function formatPrice(cents) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format large numbers with commas
 * @param {number} num Number to format
 * @returns {string} Formatted number (e.g., "1,234,567")
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * Get rate limit status badge info
 * @param {Object} rateLimitStatus Rate limit status from API
 * @returns {Object} Badge info with text, class, and icon
 */
export function getRateLimitBadge(rateLimitStatus) {
  if (!rateLimitStatus) {
    return { text: 'Unknown', class: 'badge-secondary', icon: '❓' };
  }

  if (rateLimitStatus.is_inline) {
    return { text: 'Unlimited', class: 'badge-success', icon: '♾️' };
  }

  if (rateLimitStatus.is_rate_limited) {
    return { text: 'Blocked', class: 'badge-error', icon: '🚫' };
  }

  if (rateLimitStatus.next_available_at) {
    const nextAvailable = new Date(rateLimitStatus.next_available_at);
    if (nextAvailable > new Date()) {
      return { text: 'Rate Limited', class: 'badge-warning', icon: '⏱️' };
    }
  }

  return { text: 'Available', class: 'badge-success', icon: '✅' };
}

/**
 * Format time until next available
 * @param {string} nextAvailableAt ISO date string
 * @returns {string} Formatted time (e.g., "5 minutes")
 */
export function formatTimeUntil(nextAvailableAt) {
  if (!nextAvailableAt) {
    return 'Never (purchase required)';
  }

  const now = new Date();
  const next = new Date(nextAvailableAt);
  const diffMs = next - now;

  if (diffMs <= 0) {
    return 'Now';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
}

/**
 * MTBR presets for slider (in milliseconds)
 */
export const MTBR_PRESETS = [
  { value: 100, label: '100ms' },
  { value: 1000, label: '1s' },
  { value: 10000, label: '10s' },
  { value: 60000, label: '1min' },
  { value: 3600000, label: '1hr' },
  { value: 86400000, label: '1day' }
];

/**
 * Convert slider position (0-100) to MTBR value (logarithmic scale)
 * @param {number} position Slider position (0-100)
 * @returns {number} MTBR in milliseconds
 */
export function sliderToMTBR(position) {
  // Logarithmic scale between presets
  const minLog = Math.log(MTBR_PRESETS[0].value);
  const maxLog = Math.log(MTBR_PRESETS[MTBR_PRESETS.length - 1].value);
  const scale = (maxLog - minLog) / 100;
  
  const logValue = minLog + (position * scale);
  const mtbr = Math.round(Math.exp(logValue));
  
  // Ensure minimum
  return Math.max(mtbr, 100);
}

/**
 * Convert MTBR value to slider position (0-100)
 * @param {number} mtbr MTBR in milliseconds
 * @returns {number} Slider position (0-100)
 */
export function mtbrToSlider(mtbr) {
  const minLog = Math.log(MTBR_PRESETS[0].value);
  const maxLog = Math.log(MTBR_PRESETS[MTBR_PRESETS.length - 1].value);
  const scale = (maxLog - minLog) / 100;
  
  const logValue = Math.log(Math.max(mtbr, 100));
  const position = (logValue - minLog) / scale;
  
  return Math.max(0, Math.min(100, position));
}

/**
 * Format duration in seconds to human-readable text
 * @param {number} seconds Duration in seconds
 * @returns {string} Formatted duration (e.g., "30 days")
 */
export function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    if (hours > 0) {
      return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    if (minutes > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
}

/**
 * Calculate remaining retention time
 * @param {string} expiresAt ISO date string
 * @returns {number} Remaining seconds
 */
export function getRemainingRetention(expiresAt) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires - now;
  
  return Math.max(0, Math.floor(diffMs / 1000));
}
