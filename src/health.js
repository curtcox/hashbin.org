/**
 * Public status endpoints: /api/config for the frontend and /health with its checks.
 */
import { MAX_UPLOAD_BYTES } from './utils/upload-limits.js';
import { getContentDomain } from './utils/content-domain.js';
import { USER_SCOPES } from './auth/scopes.js';
import { gitShaInfo } from './build-info.js';

// Configuration constants
const VALID_ENVIRONMENTS = ['development', 'production', 'local'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const HEALTH_CHECK_ID = 'health-check';

/**
 * Public configuration endpoint
 * Returns non-secret configuration needed by the frontend
 */
export function handleConfig(env) {
  const isLocalMode = env.ENVIRONMENT === 'local';
  const config = {
    clerkPublishableKey: isLocalMode ? null : (env.CLERK_PUBLISHABLE_KEY || null),
    isLocalMode,
    authMode: isLocalMode ? 'local' : 'clerk',
    content_domain: getContentDomain(env),
    max_upload_bytes: MAX_UPLOAD_BYTES,
    api_key_scopes: USER_SCOPES
  };

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  });
}

/**
 * Health check endpoint with comprehensive validation
 */
export async function handleHealth(env) {
  const checks = {
    worker: await checkWorker(env),
    environment: await checkEnvironment(env),
    durableObjects: await checkDurableObjects(env),
    r2: await checkR2Buckets(env),
    clerk: await checkClerk(env),
    stripe: await checkStripe(env)
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

  // Create alerts for degraded or unhealthy components
  try {
    if (anyDown || anyDegraded) {
      const alertStoreId = env.ALERT_STORE.idFromName('global');
      const alertStoreStub = env.ALERT_STORE.get(alertStoreId);
      
      for (const [componentName, check] of Object.entries(checks)) {
        if (check.status === 'down') {
          await alertStoreStub.fetch(new Request('https://dummy/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'health_unhealthy',
              severity: 'critical',
              title: `Component Down: ${componentName}`,
              message: `${componentName} health check failed: ${check.error || 'Unknown error'}`,
              metadata: {
                component: componentName,
                error: check.error || null,
                timestamp: new Date().toISOString()
              }
            })
          }));
        } else if (check.status === 'degraded') {
          await alertStoreStub.fetch(new Request('https://dummy/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'health_degraded',
              severity: 'warning',
              title: `Component Degraded: ${componentName}`,
              message: `${componentName} health check shows degraded performance`,
              metadata: {
                component: componentName,
                timestamp: new Date().toISOString()
              }
            })
          }));
        }
      }
      
      // Auto-resolve alerts if all components are now healthy
      if (allOperational && !anyDown && !anyDegraded) {
        // Resolve health_degraded and health_unhealthy alerts
        const alertsResponse = await alertStoreStub.fetch(new Request('https://dummy/list'));
        const alertsData = await alertsResponse.json();
        
        for (const alert of alertsData.alerts || []) {
          if ((alert.type === 'health_degraded' || alert.type === 'health_unhealthy') && !alert.resolved_at) {
            await alertStoreStub.fetch(new Request(`https://dummy/resolve/${alert.id}`, {
              method: 'POST'
            }));
          }
        }
      }
    }
  } catch (alertError) {
    console.error('Error creating health alerts:', alertError);
    // Don't fail the health check if alert creation fails
  }

  const { sha: effectiveGitSha, present: gitShaPresent } = gitShaInfo(env);

  if (!gitShaPresent) {
    console.warn('Health check: Neither BUNDLED_GIT_SHA nor GIT_SHA secret is configured.');
  }

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'unknown',
    gitSha: effectiveGitSha,
    gitShaPresent,
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
      'access-control-allow-origin': '*',
      'x-git-sha': effectiveGitSha,
      'x-git-sha-present': String(gitShaPresent)
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
    const oauthSigningKeyConfigured = envName === 'local' ? true : !!env.OAUTH_SIGNING_KEY;
    
    const allValid = envValid && logLevelValid && oauthSigningKeyConfigured;
    
    return {
      status: allValid ? 'operational' : 'degraded',
      message: allValid ? 'Environment configuration valid' : 'Environment configuration issues detected',
      details: {
        environment: envName,
        environmentValid: envValid,
        logLevel: logLevel,
        logLevelValid: logLevelValid,
        oauthSigningKeyConfigured
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

/**
 * Check Clerk integration health
 */
export async function checkClerk(env) {
  if (env.ENVIRONMENT === 'local') {
    return {
      status: 'operational',
      message: 'Clerk disabled in local mode',
      details: {
        secretKeyConfigured: false,
        publishableKeyConfigured: false
      }
    };
  }

  const checks = {
    secretKeyConfigured: false,
    publishableKeyConfigured: false,
    usingTestKeysInProduction: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.CLERK_SECRET_KEY;
    checks.publishableKeyConfigured = !!env.CLERK_PUBLISHABLE_KEY;
    checks.usingTestKeysInProduction = env.ENVIRONMENT === 'production' && (
      (env.CLERK_SECRET_KEY || '').startsWith('sk_test_') ||
      (env.CLERK_PUBLISHABLE_KEY || '').startsWith('pk_test_')
    );

    const allConfigured = checks.secretKeyConfigured &&
                          checks.publishableKeyConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.publishableKeyConfigured;
    const healthy = allConfigured && !checks.usingTestKeysInProduction;

    return {
      status: healthy ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: healthy
        ? 'Clerk secrets configured'
        : (checks.usingTestKeysInProduction
            ? 'Clerk is using test keys in production'
            : (someConfigured ? 'Some Clerk secrets missing' : 'Clerk not configured')),
      details: checks
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Clerk check failed',
      error: error.message,
      details: checks
    };
  }
}

/**
 * Check Stripe integration health
 */
export async function checkStripe(env) {
  if (env.ENVIRONMENT === 'local') {
    return {
      status: 'operational',
      message: 'Stripe disabled in local mode',
      details: {
        secretKeyConfigured: false,
        webhookSecretConfigured: false
      }
    };
  }

  const checks = {
    secretKeyConfigured: false,
    webhookSecretConfigured: false,
    usingTestKeysInProduction: false
  };

  try {
    // Check required secrets are configured
    checks.secretKeyConfigured = !!env.STRIPE_SECRET_KEY;
    checks.webhookSecretConfigured = !!env.STRIPE_WEBHOOK_SECRET;
    // Standard (sk_) and restricted (rk_) keys both carry a _test_ marker in test mode
    checks.usingTestKeysInProduction = env.ENVIRONMENT === 'production' &&
      /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '');

    const allConfigured = checks.secretKeyConfigured &&
                          checks.webhookSecretConfigured;
    const someConfigured = checks.secretKeyConfigured ||
                           checks.webhookSecretConfigured;
    const healthy = allConfigured && !checks.usingTestKeysInProduction;

    return {
      status: healthy ? 'operational' : (someConfigured ? 'degraded' : 'down'),
      message: healthy
        ? 'Stripe secrets configured'
        : (checks.usingTestKeysInProduction
            ? 'Stripe is using test keys in production'
            : (someConfigured ? 'Some Stripe secrets missing' : 'Stripe not configured')),
      details: checks
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Stripe check failed',
      error: error.message,
      details: checks
    };
  }
}
