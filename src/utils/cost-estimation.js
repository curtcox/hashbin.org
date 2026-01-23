/**
 * Cost Estimation Utility
 * Calculates infrastructure costs for Cloudflare services and Stripe fees
 * Based on the pricing analysis in todo/track_and_predict_expenses.md
 */

// Cloudflare Workers pricing
export const WORKER_COST_PER_MILLION = 0.50; // $0.50 per million requests

// Cloudflare R2 pricing
export const R2_STORAGE_COST_PER_GB_MONTH = 0.015; // $0.015 per GB per month
export const R2_BANDWIDTH_COST_PER_GB = 0.015; // $0.015 per GB downloaded

// Cloudflare Durable Objects pricing
export const DURABLE_OBJECTS_COST_PER_MILLION = 0.15; // $0.15 per million requests

// Stripe pricing
export const STRIPE_FEE_PERCENTAGE = 0.029; // 2.9%
export const STRIPE_FEE_FIXED_CENTS = 30; // $0.30 = 30 cents

/**
 * Calculate Worker request cost
 * @param {number} requests - Number of Worker requests
 * @returns {number} Cost in cents
 */
export function calculateWorkerCost(requests) {
  if (requests < 0) {
    throw new Error('Requests must be non-negative');
  }
  const dollars = (requests / 1_000_000) * WORKER_COST_PER_MILLION;
  return dollars * 100; // Convert to cents
}

/**
 * Calculate R2 storage cost
 * @param {number} gigabytes - Storage size in GB
 * @param {number} months - Number of months stored
 * @returns {number} Cost in cents
 */
export function calculateR2StorageCost(gigabytes, months) {
  if (gigabytes < 0) {
    throw new Error('Gigabytes must be non-negative');
  }
  if (months < 0) {
    throw new Error('Months must be non-negative');
  }
  const dollars = gigabytes * months * R2_STORAGE_COST_PER_GB_MONTH;
  return dollars * 100; // Convert to cents
}

/**
 * Calculate R2 bandwidth cost
 * @param {number} gigabytes - Bandwidth in GB
 * @returns {number} Cost in cents
 */
export function calculateR2BandwidthCost(gigabytes) {
  if (gigabytes < 0) {
    throw new Error('Gigabytes must be non-negative');
  }
  const dollars = gigabytes * R2_BANDWIDTH_COST_PER_GB;
  return dollars * 100; // Convert to cents
}

/**
 * Calculate Durable Objects request cost
 * @param {number} operations - Number of DO operations
 * @returns {number} Cost in cents
 */
export function calculateDurableObjectCost(operations) {
  if (operations < 0) {
    throw new Error('Operations must be non-negative');
  }
  const dollars = (operations / 1_000_000) * DURABLE_OBJECTS_COST_PER_MILLION;
  return dollars * 100; // Convert to cents
}

/**
 * Calculate Stripe fee for a deposit amount
 * Fee = (amount × 2.9%) + $0.30
 * This is the fee Stripe charges, which we pass on to the user
 * @param {number} depositCents - Amount user wants to deposit (in cents)
 * @returns {number} Stripe fee in cents (rounded up)
 */
export function calculateStripeFee(depositCents) {
  if (depositCents < 0) {
    throw new Error('Deposit amount must be non-negative');
  }
  const percentageFee = depositCents * STRIPE_FEE_PERCENTAGE;
  const totalFee = percentageFee + STRIPE_FEE_FIXED_CENTS;
  return Math.ceil(totalFee); // Round up to nearest cent
}

/**
 * Calculate total amount user needs to pay (deposit + Stripe fee)
 * @param {number} depositCents - Amount user wants to deposit (in cents)
 * @returns {object} { depositCents, stripeFee, totalCharged }
 */
export function calculateChargeAmount(depositCents) {
  const stripeFee = calculateStripeFee(depositCents);
  return {
    depositCents,
    stripeFee,
    totalCharged: depositCents + stripeFee
  };
}

/**
 * Calculate total cost for an upload operation
 * @param {object} params - Upload parameters
 * @param {number} params.sizeBytes - File size in bytes
 * @param {number} params.sizeGB - File size in GB (optional, calculated if not provided)
 * @param {number} params.months - Number of months to store
 * @param {number} params.workerRequests - Number of worker requests (default: 5)
 * @param {number} params.durableObjectOps - Number of DO operations (default: 3)
 * @returns {object} Cost breakdown in cents
 */
export function calculateUploadCost(params) {
  const { sizeBytes, sizeGB, months, workerRequests = 5, durableObjectOps = 3 } = params;

  // Calculate size in GB
  let gigabytes = sizeGB;
  if (gigabytes === undefined) {
    if (sizeBytes === undefined) {
      throw new Error('Either sizeBytes or sizeGB must be provided');
    }
    gigabytes = sizeBytes / (1024 * 1024 * 1024);
  }

  const workerCents = calculateWorkerCost(workerRequests);
  const durableObjectsCents = calculateDurableObjectCost(durableObjectOps);
  
  // Inline content (≤64 bytes) is not stored in R2
  const isInline = sizeBytes !== undefined && sizeBytes <= 64;
  const storageCents = isInline ? 0 : calculateR2StorageCost(gigabytes, months);

  return {
    worker_cents: workerCents,
    storage_cents: storageCents,
    durable_objects_cents: durableObjectsCents,
    total_cents: workerCents + storageCents + durableObjectsCents
  };
}

/**
 * Calculate total cost for a download operation
 * @param {object} params - Download parameters
 * @param {number} params.sizeGB - File size in GB
 * @param {number} params.workerRequests - Number of worker requests (default: 3)
 * @returns {object} Cost breakdown in cents
 */
export function calculateDownloadCost(params) {
  const { sizeGB, workerRequests = 3 } = params;

  if (sizeGB === undefined) {
    throw new Error('sizeGB must be provided');
  }

  const workerCents = calculateWorkerCost(workerRequests);
  const bandwidthCents = calculateR2BandwidthCost(sizeGB);

  return {
    worker_cents: workerCents,
    bandwidth_cents: bandwidthCents,
    total_cents: workerCents + bandwidthCents
  };
}

/**
 * Calculate revenue from upload payment
 * @param {object} params - Upload parameters
 * @param {number} params.sizeBytes - File size in bytes
 * @param {number} params.sizeGB - File size in GB (optional)
 * @param {number} params.months - Number of months
 * @param {number} params.pricePerGBMonth - Price per GB per month (default: 0.03)
 * @returns {number} Revenue in cents
 */
export function calculateUploadRevenue(params) {
  const { sizeBytes, sizeGB, months, pricePerGBMonth = 0.03 } = params;

  // Inline content is free
  if (sizeBytes !== undefined && sizeBytes <= 64) {
    return 0;
  }

  // Calculate size in GB
  let gigabytes = sizeGB;
  if (gigabytes === undefined) {
    if (sizeBytes === undefined) {
      throw new Error('Either sizeBytes or sizeGB must be provided');
    }
    gigabytes = sizeBytes / (1024 * 1024 * 1024);
  }

  const dollars = gigabytes * months * pricePerGBMonth;
  return dollars * 100; // Convert to cents
}

/**
 * Calculate user lifetime revenue
 * @param {object} user - User activity data
 * @param {object} user.uploads - Upload data
 * @param {number} user.uploads.sizeGB - Total GB uploaded
 * @param {number} user.uploads.months - Average retention months
 * @param {object} user.downloads - Download data
 * @param {number} user.downloads.count - Number of downloads
 * @param {number} user.downloads.avgSizeGB - Average size per download
 * @param {object} user.rateLimits - Rate limit purchases
 * @param {number} user.rateLimits.count - Number of rate limit purchases
 * @param {number} user.rateLimits.avgSizeGB - Average size per purchase (default: 1)
 * @param {number} user.donations - Donation revenue in cents
 * @returns {number} Total revenue in cents
 */
export function calculateUserRevenue(user) {
  let totalRevenue = 0;

  // Upload revenue
  if (user.uploads) {
    totalRevenue += calculateUploadRevenue({
      sizeGB: user.uploads.sizeGB,
      months: user.uploads.months
    });
  }

  // Rate limit revenue
  if (user.rateLimits) {
    const avgSizeGB = user.rateLimits.avgSizeGB || 1;
    const rateLimitPricePerGB = 0.02; // $0.02/GB
    totalRevenue += user.rateLimits.count * avgSizeGB * rateLimitPricePerGB * 100;
  }

  // Donation revenue
  if (user.donations) {
    totalRevenue += user.donations;
  }

  return totalRevenue;
}

/**
 * Calculate user lifetime costs
 * @param {object} user - User activity data
 * @param {object} user.uploads - Upload data
 * @param {number} user.uploads.sizeGB - Total GB uploaded
 * @param {number} user.uploads.months - Average retention months
 * @param {object} user.downloads - Download data (optional)
 * @param {number} user.downloads.count - Number of downloads (optional)
 * @param {number} user.downloads.avgSizeGB - Average size per download (optional)
 * @param {number} user.downloads.sizeGB - Total GB downloaded (optional)
 * @returns {number} Total costs in cents
 */
export function calculateUserCosts(user) {
  let totalCosts = 0;

  // Upload costs
  if (user.uploads) {
    const uploadCost = calculateUploadCost({
      sizeGB: user.uploads.sizeGB,
      months: user.uploads.months
    });
    totalCosts += uploadCost.total_cents;
  }

  // Download costs
  if (user.downloads) {
    const totalDownloadGB = user.downloads.sizeGB || 
                           (user.downloads.count * (user.downloads.avgSizeGB || 1));
    const downloadCost = calculateDownloadCost({
      sizeGB: totalDownloadGB
    });
    totalCosts += downloadCost.total_cents;
  }

  return totalCosts;
}

/**
 * Calculate content lifetime revenue
 * @param {object} content - Content activity data
 * @param {number} content.sizeGB - Content size in GB
 * @param {number} content.months - Storage months
 * @param {number} content.downloads - Number of downloads
 * @param {number} content.rateLimitCoverage - Percentage of downloads with rate limits (0-1)
 * @returns {number} Total revenue in cents
 */
export function calculateContentRevenue(content) {
  let totalRevenue = 0;

  // Storage revenue
  totalRevenue += calculateUploadRevenue({
    sizeGB: content.sizeGB,
    months: content.months
  });

  // Rate limit revenue
  if (content.downloads && content.rateLimitCoverage) {
    const rateLimitPricePerGB = 0.02; // $0.02/GB
    const rateLimitDownloads = content.downloads * content.rateLimitCoverage;
    totalRevenue += rateLimitDownloads * content.sizeGB * rateLimitPricePerGB * 100;
  }

  return totalRevenue;
}

/**
 * Calculate content lifetime costs
 * @param {object} content - Content activity data
 * @param {number} content.sizeGB - Content size in GB
 * @param {number} content.months - Storage months
 * @param {number} content.downloads - Number of downloads
 * @returns {number} Total costs in cents
 */
export function calculateContentCosts(content) {
  let totalCosts = 0;

  // Storage costs
  const uploadCost = calculateUploadCost({
    sizeGB: content.sizeGB,
    months: content.months
  });
  totalCosts += uploadCost.total_cents;

  // Download bandwidth costs
  if (content.downloads) {
    const totalBandwidthGB = content.downloads * content.sizeGB;
    const downloadCost = calculateDownloadCost({
      sizeGB: totalBandwidthGB
    });
    totalCosts += downloadCost.total_cents;
  }

  return totalCosts;
}

/**
 * Calculate break-even storage price
 * @returns {number} Minimum price per GB per month in dollars
 */
export function calculateBreakEvenStoragePrice() {
  return R2_STORAGE_COST_PER_GB_MONTH;
}

/**
 * Calculate break-even rate limit price
 * @returns {number} Minimum price per GB in dollars
 */
export function calculateBreakEvenRateLimitPrice() {
  return R2_BANDWIDTH_COST_PER_GB;
}
