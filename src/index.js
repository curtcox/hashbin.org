/**
 * HashBin.org - Main Worker Entry Point
 * Content distribution platform using 256t hash-based addressing
 */

// Export Durable Object classes
export { ContentMetadata } from './durable-objects/content-metadata.js';
export { UserProfile } from './durable-objects/user-profile.js';
export { PaymentRecord } from './durable-objects/payment-record.js';
export { ContestRecord } from './durable-objects/contest-record.js';
export { MessageThread } from './durable-objects/message-thread.js';

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Basic routing
    if (url.pathname === '/') {
      return handleRoot(env);
    }

    if (url.pathname === '/health') {
      return handleHealth(env);
    }

    // TODO: Add API routes for:
    // - Content upload/download
    // - Authentication
    // - Payments
    // - Contests
    // - Public records

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Scheduled handler for cron jobs
   * Used for daily backups and expiration checks
   */
  async scheduled(event, env, ctx) {
    // TODO: Implement scheduled tasks
    // - Daily Durable Objects snapshots
    // - Content expiration checks
    // - Deletion processing

    console.log('Scheduled job executed:', new Date().toISOString());
  }
};

/**
 * Root endpoint - Basic info
 */
function handleRoot(env) {
  const info = {
    service: 'HashBin.org API',
    version: '0.1.0',
    environment: env.ENVIRONMENT || 'unknown',
    status: 'operational',
    phase: 'Phase 1 - Infrastructure Setup',
    endpoints: {
      health: '/health',
      // More endpoints will be added in future phases
    }
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*'
    }
  });
}

/**
 * Health check endpoint
 */
function handleHealth(env) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'unknown',
    services: {
      worker: 'operational',
      durableObjects: 'operational',
      r2: 'operational'
    }
  };

  return new Response(JSON.stringify(health, null, 2), {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*'
    }
  });
}
