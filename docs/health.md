# HashBin.org Health Endpoint Documentation

## Overview

The `/health` endpoint provides comprehensive validation of HashBin.org's infrastructure and services. It performs active checks on all critical components and returns a detailed status report, making it ideal for monitoring, deployment verification, and troubleshooting.

## Endpoint

```
GET /health
```

## Response Format

### Success Response (200 OK or 503 Service Unavailable)

The endpoint returns HTTP 200 when healthy or degraded, and HTTP 503 when unhealthy.

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2026-01-13T18:00:00.000Z",
  "environment": "development" | "production",
  "checks": {
    "worker": { ... },
    "environment": { ... },
    "durableObjects": { ... },
    "r2": { ... }
  },
  "summary": {
    "total": 4,
    "operational": 4,
    "degraded": 0,
    "down": 0
  }
}
```

### Overall Status Values

- **healthy**: All services operational
- **degraded**: One or more services degraded but functioning
- **unhealthy**: One or more critical services down

### HTTP Status Codes

- **200 OK**: System is healthy or degraded
- **503 Service Unavailable**: System is unhealthy (one or more services down)

## Check Details

### 1. Worker Check

Validates that the Worker is properly configured and responding.

```json
{
  "status": "operational" | "degraded" | "down",
  "message": "Worker is responding",
  "details": {
    "hasEnvironment": true,
    "hasLogLevel": true
  }
}
```

**What it validates:**
- Worker is executing
- Environment variables are configured
- Basic worker functionality

**Maps to site_creation.md:**
- Task 1: Cloudflare Account Setup (services enabled)
- Task 4: Durable Objects Setup (Worker deployed)
- Task 7: Environment Configuration (Worker accessible)

### 2. Environment Check

Validates environment configuration and variables.

```json
{
  "status": "operational" | "degraded" | "down",
  "message": "Environment configuration valid",
  "details": {
    "environment": "production",
    "environmentValid": true,
    "logLevel": "warn",
    "logLevelValid": true
  }
}
```

**What it validates:**
- `ENVIRONMENT` variable is set and valid ("development" or "production")
- `LOG_LEVEL` variable is set and valid ("debug", "info", "warn", or "error")
- Configuration matches expected environment

**Maps to site_creation.md:**
- Task 7: Environment Configuration (environment variables set)
- Task 8: Monitoring and Logging (structured logging available)

**Status Criteria:**
- `operational`: All environment variables valid
- `degraded`: Environment variables present but invalid values
- `down`: Unable to check environment

### 3. Durable Objects Check

Validates all five Durable Objects types are bound and accessible.

```json
{
  "status": "operational" | "degraded" | "down",
  "message": "All Durable Objects accessible",
  "details": {
    "CONTENT_METADATA": {
      "available": true,
      "accessible": true,
      "error": null
    },
    "USER_PROFILES": {
      "available": true,
      "accessible": true,
      "error": null
    },
    "PAYMENT_RECORDS": {
      "available": true,
      "accessible": true,
      "error": null
    },
    "CONTEST_RECORDS": {
      "available": true,
      "accessible": true,
      "error": null
    },
    "MESSAGE_THREADS": {
      "available": true,
      "accessible": true,
      "error": null
    }
  }
}
```

**What it validates:**
- All five Durable Objects bindings are configured
- Each binding can create an ID and get a stub
- Durable Objects namespace is properly initialized

**Maps to site_creation.md:**
- Task 4: Durable Objects Setup (DO namespaces created, bindings work)
- Infrastructure Tests: Durable Objects (Can instantiate DO)

**Status Criteria:**
- `operational`: All 5 Durable Objects accessible
- `degraded`: Some Durable Objects accessible but not all
- `down`: No Durable Objects accessible

**Note**: This check validates that bindings work and stubs can be created, but does not perform actual read/write operations (deferred to Phase 2).

### 4. R2 Buckets Check

Validates R2 storage buckets are bound and accessible.

```json
{
  "status": "operational" | "degraded" | "down",
  "message": "All R2 buckets accessible",
  "details": {
    "CONTENT_BUCKET": {
      "available": true,
      "accessible": true,
      "error": null
    },
    "BACKUP_BUCKET": {
      "available": true,
      "accessible": true,
      "error": null
    }
  }
}
```

**What it validates:**
- Both R2 bucket bindings are configured (CONTENT_BUCKET and BACKUP_BUCKET)
- Each bucket can be accessed via list operation
- R2 service is operational

**Maps to site_creation.md:**
- Task 3: R2 Bucket Creation (buckets accessible)
- Infrastructure Tests: R2 Bucket Tests (Can access buckets)

**Status Criteria:**
- `operational`: Both R2 buckets accessible
- `degraded`: One R2 bucket accessible but not both
- `down`: No R2 buckets accessible

**Note**: This check performs a list operation with limit=1 to verify bucket access, but does not test actual upload/download functionality (deferred to Phase 2).

## Usage Examples

### Basic Health Check

```bash
curl https://hashbin.org/health
```

### Development Environment Check

```bash
curl https://hashbin-worker-dev.<account-id>.workers.dev/health
```

### Production Environment Check

```bash
curl https://hashbin-worker-prod.<account-id>.workers.dev/health
```

### Pretty Print with jq

```bash
curl -s https://hashbin.org/health | jq .
```

### Check Specific Service

```bash
# Check just Durable Objects status
curl -s https://hashbin.org/health | jq '.checks.durableObjects'

# Check just R2 status
curl -s https://hashbin.org/health | jq '.checks.r2'

# Get overall status
curl -s https://hashbin.org/health | jq '.status'
```

### Monitoring Script

```bash
#!/bin/bash
# Simple monitoring script

RESPONSE=$(curl -s https://hashbin.org/health)
STATUS=$(echo "$RESPONSE" | jq -r '.status')

if [ "$STATUS" = "healthy" ]; then
  echo "✅ System healthy"
  exit 0
elif [ "$STATUS" = "degraded" ]; then
  echo "⚠️  System degraded"
  echo "$RESPONSE" | jq '.checks'
  exit 1
else
  echo "❌ System unhealthy"
  echo "$RESPONSE" | jq '.checks'
  exit 2
fi
```

## Interpreting Results

### All Green (Healthy)

```json
{
  "status": "healthy",
  "summary": {
    "total": 4,
    "operational": 4,
    "degraded": 0,
    "down": 0
  }
}
```

✅ **Meaning**: All infrastructure components are properly configured and operational. The deployment from site_creation.md tasks 1-4, 7, and 8 is successful.

### Partially Green (Degraded)

```json
{
  "status": "degraded",
  "summary": {
    "total": 4,
    "operational": 3,
    "degraded": 1,
    "down": 0
  }
}
```

⚠️ **Meaning**: Most infrastructure is working, but one or more components have issues. Check the `checks` object for details. Common causes:
- Missing R2 bucket binding
- Invalid environment variables
- Some Durable Objects not bound

### Red (Unhealthy)

```json
{
  "status": "unhealthy",
  "summary": {
    "total": 4,
    "operational": 2,
    "degraded": 0,
    "down": 2
  }
}
```

❌ **Meaning**: Critical infrastructure components are not working. Check the `checks` object for error messages. Common causes:
- R2 buckets not created
- Durable Objects not enabled (need Workers Paid plan)
- Wrangler.toml misconfiguration

## Troubleshooting

### "Binding not found" errors

**Problem**: Durable Objects or R2 bucket binding not found

**Solution**:
1. Check `wrangler.toml` has correct bindings
2. Verify environment matches (development vs production)
3. Redeploy with `wrangler deploy --env <environment>`

### "accessible: false" with available: true

**Problem**: Binding exists but cannot be accessed

**Solution**:
1. For R2: Verify buckets exist in Cloudflare dashboard
2. For Durable Objects: Ensure migrations are applied
3. Check API token has correct permissions
4. Verify Workers Paid plan is active

### Environment variables invalid

**Problem**: `environmentValid: false` or `logLevelValid: false`

**Solution**:
1. Check `wrangler.toml` environment variables
2. Valid environments: "development", "production"
3. Valid log levels: "debug", "info", "warn", "error"
4. Update wrangler.toml and redeploy

## Validation Coverage

### What /health CAN validate (✅)

These items from site_creation.md are directly validated:

1. **Worker operational** - Worker is deployed and responding
2. **Environment configuration** - Environment variables set correctly
3. **Durable Objects bindings** - All 5 DO types bound and accessible
4. **R2 buckets accessible** - Both content and backup buckets accessible
5. **Basic infrastructure** - Core Cloudflare services operational

### What /health CANNOT validate (❌)

These items from site_creation.md require manual validation:

1. **DNS configuration** - Nameservers, custom domain routing
2. **SSL/TLS settings** - Certificate, encryption mode
3. **Cloudflare Dashboard settings** - Analytics, security features
4. **Cost tracking** - Billing alerts, usage monitoring
5. **CI/CD pipeline** - GitHub Actions workflow, secrets

### What is deferred to Phase 2 (⏳)

These validations require functionality not yet implemented:

1. **R2 upload/download** - Actual file operations
2. **Durable Objects read/write** - Storage operations
3. **CORS functionality** - Browser-based testing
4. **Backup/restore** - Event logging and snapshots
5. **Cron jobs** - Scheduled task execution

## Integration with Deployment Verification

The health endpoint is used by:

1. **GitHub Actions** - Post-deployment verification
2. **verify-deployment.sh** - Manual verification script
3. **Monitoring tools** - Continuous health monitoring

See also:
- `scripts/verify-deployment.sh` - Automated deployment verification
- `docs/deployment.md` - Full deployment guide
- `todo/health.md` - Validation coverage mapping

## Response Time

Expected response times:

- **Healthy system**: 50-200ms
- **Degraded system**: 100-500ms
- **Unhealthy system**: 100-1000ms (includes timeout attempts)

Slow response times (>1s) may indicate:
- R2 bucket access issues
- Durable Objects initialization problems
- Network connectivity problems

## Future Enhancements

Planned for Phase 2 and beyond:

1. **Content validation** - Verify upload/download functionality
2. **Performance metrics** - Response times, CPU usage
3. **Storage metrics** - R2 bucket sizes, object counts
4. **DO metrics** - Active instances, storage usage
5. **Cost tracking** - Current month usage and estimated costs
6. **Security checks** - Rate limiting, authentication status
7. **Backup status** - Last backup time, backup size

## See Also

- [Deployment Guide](deployment.md) - Complete deployment instructions
- [Health Validation Mapping](../done/health_validation.md) - Detailed validation coverage
- [Site Creation Plan](../done/site_creation.md) - Infrastructure setup tasks (complete)
- [Verification Script](../scripts/verify-deployment.sh) - Automated testing

---

**Last Updated**: January 2026  
**Version**: 0.1.0 (Phase 1 - Infrastructure Setup)
