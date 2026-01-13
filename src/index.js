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

// Configuration constants
const VALID_ENVIRONMENTS = ['development', 'production'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const HEALTH_CHECK_ID = 'health-check';

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
 * Health check endpoint with comprehensive validation
 */
async function handleHealth(env) {
  const checks = {
    worker: await checkWorker(env),
    environment: await checkEnvironment(env),
    durableObjects: await checkDurableObjects(env),
    r2: await checkR2Buckets(env)
  };

  // Determine overall status
  const allOperational = Object.values(checks).every(check => check.status === 'operational');
  const anyDegraded = Object.values(checks).some(check => check.status === 'degraded');
  const anyDown = Object.values(checks).some(check => check.status === 'down');

  let overallStatus = 'healthy';
  if (anyDown) {
    overallStatus = 'unhealthy';
  } else if (anyDegraded) {
    overallStatus = 'degraded';
  }

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'unknown',
    checks: checks,
    summary: {
      total: Object.keys(checks).length,
      operational: Object.values(checks).filter(c => c.status === 'operational').length,
      degraded: Object.values(checks).filter(c => c.status === 'degraded').length,
      down: Object.values(checks).filter(c => c.status === 'down').length
    }
  };

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*'
    }
  });
}

/**
 * Check worker configuration and basic functionality
 */
async function checkWorker(env) {
  try {
    return {
      status: 'operational',
      message: 'Worker is responding',
      details: {
        hasEnvironment: !!env.ENVIRONMENT,
        hasLogLevel: !!env.LOG_LEVEL
      }
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Worker check failed',
      error: error.message
    };
  }
}

/**
 * Check environment configuration
 */
async function checkEnvironment(env) {
  try {
    const envName = env.ENVIRONMENT || 'unknown';
    const logLevel = env.LOG_LEVEL || 'unknown';
    
    const envValid = VALID_ENVIRONMENTS.includes(envName);
    const logLevelValid = VALID_LOG_LEVELS.includes(logLevel);
    
    const allValid = envValid && logLevelValid;
    
    return {
      status: allValid ? 'operational' : 'degraded',
      message: allValid ? 'Environment configuration valid' : 'Environment configuration issues detected',
      details: {
        environment: envName,
        environmentValid: envValid,
        logLevel: logLevel,
        logLevelValid: logLevelValid
      }
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Environment check failed',
      error: error.message
    };
  }
}

/**
 * Check Durable Objects bindings and accessibility
 */
async function checkDurableObjects(env) {
  const doTypes = [
    { name: 'CONTENT_METADATA', binding: env.CONTENT_METADATA },
    { name: 'USER_PROFILES', binding: env.USER_PROFILES },
    { name: 'PAYMENT_RECORDS', binding: env.PAYMENT_RECORDS },
    { name: 'CONTEST_RECORDS', binding: env.CONTEST_RECORDS },
    { name: 'MESSAGE_THREADS', binding: env.MESSAGE_THREADS }
  ];

  const results = {};
  let allOperational = true;
  let anyAccessible = false;

  for (const doType of doTypes) {
    try {
      if (!doType.binding) {
        results[doType.name] = {
          available: false,
          accessible: false,
          error: 'Binding not found'
        };
        allOperational = false;
      } else {
        // Try to get an ID and stub - this validates the binding works
        const id = doType.binding.idFromName(HEALTH_CHECK_ID);
        const stub = doType.binding.get(id);
        results[doType.name] = {
          available: true,
          accessible: !!stub,
          error: null
        };
        anyAccessible = true;
      }
    } catch (error) {
      results[doType.name] = {
        available: !!doType.binding,
        accessible: false,
        error: error.message
      };
      allOperational = false;
    }
  }

  return {
    status: allOperational ? 'operational' : (anyAccessible ? 'degraded' : 'down'),
    message: allOperational ? 'All Durable Objects accessible' : 'Some Durable Objects unavailable',
    details: results
  };
}

/**
 * Check R2 bucket accessibility
 */
async function checkR2Buckets(env) {
  const buckets = [
    { name: 'CONTENT_BUCKET', binding: env.CONTENT_BUCKET },
    { name: 'BACKUP_BUCKET', binding: env.BACKUP_BUCKET }
  ];

  const results = {};
  let allOperational = true;
  let anyAccessible = false;

  for (const bucket of buckets) {
    try {
      if (!bucket.binding) {
        results[bucket.name] = {
          available: false,
          accessible: false,
          error: 'Binding not found'
        };
        allOperational = false;
      } else {
        // Try to list with limit 1 to verify bucket is accessible
        await bucket.binding.list({ limit: 1 });
        results[bucket.name] = {
          available: true,
          accessible: true,
          error: null
        };
        anyAccessible = true;
      }
    } catch (error) {
      results[bucket.name] = {
        available: !!bucket.binding,
        accessible: false,
        error: error.message
      };
      allOperational = false;
    }
  }

  return {
    status: allOperational ? 'operational' : (anyAccessible ? 'degraded' : 'down'),
    message: allOperational ? 'All R2 buckets accessible' : 'Some R2 buckets unavailable',
    details: results
  };
}
