/**
 * Platform Statistics Helper
 * Utility functions for incrementing platform statistics
 */

/**
 * Increment a platform statistics counter
 * @param {object} env - Environment bindings
 * @param {string} counter - Counter name
 * @param {number} value - Value to increment by (default: 1)
 */
export async function incrementPlatformStat(env, counter, value = 1) {
  try {
    const statsId = env.PLATFORM_STATS.idFromName('global');
    const statsStub = env.PLATFORM_STATS.get(statsId);
    
    await statsStub.fetch(
      new Request('https://dummy/increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter, value })
      })
    );
  } catch (error) {
    // Don't fail the request if stat increment fails
    console.error(`Failed to increment stat ${counter}:`, error);
  }
}

/**
 * Record content upload in platform stats
 */
export async function recordContentUpload(env, sizeBytes, isInline = false) {
  await Promise.all([
    incrementPlatformStat(env, 'total_uploads', 1),
    incrementPlatformStat(env, 'total_uploads_bytes', sizeBytes),
    isInline ? incrementPlatformStat(env, 'inline_content_count', 1) : Promise.resolve()
  ]);
}

/**
 * Record content download in platform stats
 */
export async function recordContentDownload(env) {
  await incrementPlatformStat(env, 'total_downloads', 1);
}

/**
 * Record deposit in platform stats
 */
export async function recordDeposit(env, amountCents) {
  await Promise.all([
    incrementPlatformStat(env, 'total_deposits', 1),
    incrementPlatformStat(env, 'total_deposits_cents', amountCents)
  ]);
}

/**
 * Record user creation in platform stats
 */
export async function recordUserCreation(env) {
  await incrementPlatformStat(env, 'total_users', 1);
}

/**
 * Record payment in platform stats
 */
export async function recordPayment(env, type, amountCents) {
  const typeCounters = {
    'upload_payment': ['upload_payment_count', 'upload_payment_total'],
    'cid_extension': ['extension_count', 'extension_total'],
    'donation_received': ['donation_count', 'donation_total'],
    'rate_limit_purchase': ['rate_limit_purchases', 'rate_limit_revenue_cents']
  };

  const counters = typeCounters[type];
  if (counters) {
    await Promise.all([
      incrementPlatformStat(env, counters[0], 1),
      incrementPlatformStat(env, counters[1], amountCents),
      incrementPlatformStat(env, 'total_revenue_cents', amountCents)
    ]);
  }
}

/**
 * Record API key creation in platform stats
 */
export async function recordApiKeyCreation(env) {
  await incrementPlatformStat(env, 'total_api_keys', 1);
}

/**
 * Record dispute in platform stats
 */
export async function recordDispute(env) {
  await incrementPlatformStat(env, 'total_disputes', 1);
}
