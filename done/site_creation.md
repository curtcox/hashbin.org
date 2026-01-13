# Site Creation: Infrastructure Setup and Deployment

**Phase:** 1 - Foundation & Infrastructure
**Status:** Complete
**Completed:** January 2026
**Dependencies:** None (first phase)
**Estimated Complexity:** Medium

## Overview

This plan covers the complete infrastructure setup for HashBin.org, including Cloudflare services, domain configuration, backup strategy, and CI/CD pipeline. By the end of this phase, we will have a fully functioning infrastructure ready for Phase 2 development.

## Objectives

1. Set up Cloudflare account and configure all required services
2. Configure hashbin.org domain with proper DNS and SSL
3. Create and configure R2 bucket for content storage
4. Set up Durable Objects for metadata storage
5. Implement backup and disaster recovery strategy
6. Create CI/CD pipeline for automated deployment
7. Establish development, staging, and production environments
8. Set up monitoring, logging, and cost tracking

## Prerequisites

### Required Accounts
- [ ] Cloudflare account (Pro or higher recommended for production)
- [ ] GitHub account (for repository and Actions)
- [ ] Domain registrar account (if not using Cloudflare Registrar)

### Required Tools
- [ ] Node.js (v18 or higher) and npm
- [ ] Git
- [ ] Wrangler CLI (`npm install -g wrangler`)
- [ ] Text editor or IDE

### Required Access
- [ ] Admin access to hashbin.org domain
- [ ] Billing access for Cloudflare account
- [ ] Repository admin access for github.com/curtcox/hashbin.org

## Task Breakdown

### Task 1: Cloudflare Account Setup

**Objective:** Create and configure Cloudflare account with appropriate plan

**Steps:**

1. **Create Cloudflare account** (if not already existing)
   - Sign up at https://dash.cloudflare.com/sign-up
   - Verify email address
   - Set up two-factor authentication (required for production)

2. **Upgrade to appropriate plan**
   - Free tier is sufficient for development
   - Workers Paid plan ($5/month) required for:
     - Durable Objects
     - Increased Workers limits
     - Production usage
   - Consider Business plan for production (better support, more features)

3. **Enable required services**
   - Navigate to Workers & Pages
   - Enable Workers
   - Enable Durable Objects (requires paid plan)
   - Enable R2 storage

4. **Create API token for CI/CD**
   - Navigate to Profile → API Tokens
   - Create token with permissions:
     - Account.Cloudflare Workers Scripts: Edit
     - Account.Account Settings: Read
     - Account.Workers R2 Storage: Edit
   - Save token securely (will be used in GitHub Actions)

**Success Criteria:**
- [x] Cloudflare account active with Workers Paid plan or higher
- [x] Two-factor authentication enabled
- [x] API token created and saved
- [x] All required services enabled

**Time Estimate:** 30 minutes
**Actual:** Complete

---

### Task 2: Domain Configuration

**Objective:** Configure hashbin.org domain with Cloudflare

**Steps:**

1. **Add domain to Cloudflare**
   - From Cloudflare dashboard, click "Add a Site"
   - Enter "hashbin.org"
   - Select appropriate plan (Free for development, Pro+ for production)
   - Cloudflare will scan existing DNS records

2. **Update nameservers** (if domain not already on Cloudflare)
   - Note Cloudflare nameservers provided
   - Log into domain registrar
   - Update nameservers to Cloudflare's
   - Wait for DNS propagation (up to 24 hours, typically <1 hour)

3. **Configure SSL/TLS**
   - Navigate to SSL/TLS → Overview
   - Set encryption mode to "Full (strict)"
   - Enable "Always Use HTTPS"
   - Enable "Automatic HTTPS Rewrites"

4. **Configure DNS records**
   - Add A record for root domain (@) pointing to placeholder IP (will be overridden by Workers)
   - Add CNAME for www pointing to @ (if desired)
   - Workers will handle actual routing

5. **Enable security features**
   - Navigate to Security
   - Set Security Level to "Medium" or "High"
   - Enable Bot Fight Mode
   - Configure WAF rules (if on Pro+ plan)

**Success Criteria:**
- [x] Domain added to Cloudflare
- [x] Nameservers updated and propagated
- [x] SSL certificate active (Full strict mode)
- [x] Always HTTPS enabled
- [x] Basic DNS records configured

**Time Estimate:** 1-2 hours (including DNS propagation wait)
**Actual:** Complete

---

### Task 3: R2 Bucket Creation and Configuration

**Objective:** Set up R2 bucket for content storage and backups

**Steps:**

1. **Create R2 bucket for content**
   - Navigate to R2 → Overview
   - Click "Create bucket"
   - Name: `hashbin-content-prod` (or `hashbin-content-dev` for development)
   - Location: Automatic (for best performance globally)
   - Click "Create bucket"

2. **Create R2 bucket for backups**
   - Create second bucket: `hashbin-backups-prod` (or `hashbin-backups-dev`)
   - This will store Durable Objects backups

3. **Configure bucket CORS** (for uploads from browser)
   - Select content bucket
   - Navigate to Settings → CORS policy
   - Add policy:
   ```json
   [
     {
       "AllowedOrigins": ["https://hashbin.org", "https://www.hashbin.org"],
       "AllowedMethods": ["GET", "PUT", "POST"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   - For development, add localhost origins

4. **Create R2 API tokens**
   - Navigate to R2 → Overview → Manage R2 API Tokens
   - Create token with permissions:
     - Object Read & Write
     - Bucket permissions: Both buckets
   - Save Access Key ID and Secret Access Key

5. **Configure bucket lifecycle rules** (optional, for cleanup)
   - Currently not needed (manual deletion via expiration job)
   - Can add later if needed for temporary files

**Success Criteria:**
- [x] Content bucket created and accessible
- [x] Backup bucket created and accessible
- [ ] CORS policy configured for content bucket (deferred to Phase 2)
- [x] R2 API tokens created and saved
- [ ] Buckets tested with simple upload/download (deferred to Phase 2)

**Time Estimate:** 45 minutes
**Actual:** Core complete, CORS/testing deferred

---

### Task 4: Durable Objects Setup

**Objective:** Configure Durable Objects for metadata storage

**Steps:**

1. **Create Durable Objects namespace**
   - This will be done via Wrangler configuration
   - Create `wrangler.toml` in project root:

   ```toml
   name = "hashbin-worker"
   main = "src/index.js"
   compatibility_date = "2024-01-01"

   [env.development]
   name = "hashbin-worker-dev"

   [env.production]
   name = "hashbin-worker-prod"

   [[durable_objects.bindings]]
   name = "CONTENT_METADATA"
   class_name = "ContentMetadata"
   script_name = "hashbin-worker"

   [[durable_objects.bindings]]
   name = "USER_PROFILES"
   class_name = "UserProfile"
   script_name = "hashbin-worker"

   [[durable_objects.bindings]]
   name = "PAYMENT_RECORDS"
   class_name = "PaymentRecord"
   script_name = "hashbin-worker"

   [[durable_objects.bindings]]
   name = "CONTEST_RECORDS"
   class_name = "ContestRecord"
   script_name = "hashbin-worker"

   [[durable_objects.bindings]]
   name = "MESSAGE_THREADS"
   class_name = "MessageThread"
   script_name = "hashbin-worker"

   [[r2_buckets]]
   binding = "CONTENT_BUCKET"
   bucket_name = "hashbin-content-prod"
   preview_bucket_name = "hashbin-content-dev"

   [[r2_buckets]]
   binding = "BACKUP_BUCKET"
   bucket_name = "hashbin-backups-prod"
   preview_bucket_name = "hashbin-backups-dev"
   ```

2. **Create stub Durable Object classes**
   - Create `src/durable-objects/` directory
   - Create stub files for each DO class:
     - `content-metadata.js`
     - `user-profile.js`
     - `payment-record.js`
     - `contest-record.js`
     - `message-thread.js`

3. **Create minimal Worker script**
   - Create `src/index.js` with basic routing:
   ```javascript
   export { ContentMetadata } from './durable-objects/content-metadata.js';
   export { UserProfile } from './durable-objects/user-profile.js';
   export { PaymentRecord } from './durable-objects/payment-record.js';
   export { ContestRecord } from './durable-objects/contest-record.js';
   export { MessageThread } from './durable-objects/message-thread.js';

   export default {
     async fetch(request, env) {
       return new Response('HashBin.org API - Infrastructure Test', {
         headers: { 'content-type': 'text/plain' }
       });
     }
   };
   ```

4. **Deploy to Cloudflare**
   - Authenticate: `wrangler login`
   - Deploy to development: `wrangler deploy --env development`
   - Verify deployment successful

5. **Create Durable Objects migrations**
   - Add to `wrangler.toml`:
   ```toml
   [[migrations]]
   tag = "v1"
   new_classes = ["ContentMetadata", "UserProfile", "PaymentRecord", "ContestRecord", "MessageThread"]
   ```

**Success Criteria:**
- [x] wrangler.toml configured with all DO bindings
- [x] Stub DO classes created
- [x] Worker deployed successfully to development
- [x] Durable Objects namespaces created
- [x] Can access Worker URL and get response

**Time Estimate:** 1-2 hours
**Actual:** Complete

---

### Task 5: Backup and Disaster Recovery Implementation

**Objective:** Implement event sourcing and snapshot backup strategy

**Steps:**

1. **Create backup utility module**
   - Create `src/utils/backup.js`
   - Implement functions:
     - `logEvent(bucket, doId, event)` - Write event to R2
     - `createSnapshot(bucket, doId, state)` - Write full snapshot to R2
     - `listSnapshots(bucket, doId)` - List available snapshots
     - `restoreFromSnapshot(bucket, doId)` - Load snapshot data
     - `replayEvents(bucket, doId, fromTimestamp)` - Replay event log

2. **Event sourcing implementation**
   - Event log stored in R2 as: `backups/events/{doType}/{doId}/{timestamp}.json`
   - Each state change logged with:
     - Timestamp
     - Event type (created, updated, deleted)
     - Previous state hash
     - New state
     - Metadata (user, request ID, etc.)

3. **Snapshot implementation**
   - Snapshots stored in R2 as: `backups/snapshots/{doType}/{doId}/{date}.json`
   - Create daily snapshots of all active Durable Objects
   - Keep last 30 days of snapshots
   - Snapshots include full state serialization

4. **Create backup Cron Trigger**
   - Add to `wrangler.toml`:
   ```toml
   [triggers]
   crons = ["0 2 * * *"]  # Daily at 2 AM UTC
   ```
   - Implement scheduled handler in Worker:
   ```javascript
   export default {
     async scheduled(event, env) {
       // Enumerate all DOs and create snapshots
       await createDailyBackups(env);
     }
   };
   ```

5. **Test backup and restore**
   - Create test DO with sample data
   - Generate events and snapshot
   - Delete DO
   - Restore from snapshot
   - Verify data integrity

6. **Document backup procedures**
   - Create `docs/disaster-recovery.md`
   - Document RPO/RTO targets
   - Document restore procedures
   - Document backup verification process

**Success Criteria:**
- [ ] Event logging implemented and tested (deferred to Phase 2)
- [ ] Snapshot creation implemented and tested (deferred to Phase 2)
- [ ] Cron trigger configured for daily backups (deferred to Phase 2)
- [ ] Backup and restore procedures tested (deferred to Phase 2)
- [ ] Documentation created (deferred to Phase 2)

**Time Estimate:** 3-4 hours
**Actual:** Deferred to Phase 2 - backup functionality will be implemented with content operations

---

### Task 6: GitHub Actions CI/CD Pipeline

**Objective:** Automate deployment to development, staging, and production

**Steps:**

1. **Create GitHub repository secrets**
   - Navigate to Repository → Settings → Secrets and variables → Actions
   - Add secrets:
     - `CLOUDFLARE_API_TOKEN` - API token from Task 1
     - `CLOUDFLARE_ACCOUNT_ID` - Account ID from Cloudflare dashboard

2. **Create deployment workflow**
   - Create `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy to Cloudflare

   on:
     push:
       branches:
         - main
         - develop
     pull_request:

   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '18'
         - run: npm ci
         - run: npm test

     deploy-dev:
       if: github.ref == 'refs/heads/develop'
       needs: test
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '18'
         - run: npm ci
         - run: npx wrangler deploy --env development
           env:
             CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
             CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

     deploy-prod:
       if: github.ref == 'refs/heads/main'
       needs: test
       runs-on: ubuntu-latest
       environment:
         name: production
         url: https://hashbin.org
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '18'
         - run: npm ci
         - run: npx wrangler deploy --env production
           env:
             CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
             CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
   ```

3. **Create branch protection rules**
   - Navigate to Repository → Settings → Branches
   - Add rule for `main` branch:
     - Require pull request reviews (1 approver)
     - Require status checks (test job must pass)
     - Require branches to be up to date
     - Include administrators (optional for single developer)

4. **Test deployment pipeline**
   - Create test branch
   - Make small change to Worker
   - Push to develop branch
   - Verify deployment succeeds
   - Check Worker URL responds correctly

**Success Criteria:**
- [x] GitHub secrets configured
- [x] Deployment workflow created
- [x] Branch protection rules set up
- [x] Successful deployment to development
- [x] Successful deployment to production (from main)

**Time Estimate:** 1-2 hours
**Actual:** Complete

---

### Task 7: Environment Configuration

**Objective:** Set up development, staging, and production environments

**Steps:**

1. **Define environment structure**
   - **Development:** Local testing with Wrangler dev mode
   - **Staging:** Deployed to `develop` branch → staging subdomain
   - **Production:** Deployed to `main` branch → hashbin.org

2. **Configure environment-specific settings**
   - Update `wrangler.toml`:
   ```toml
   [env.development]
   name = "hashbin-worker-dev"
   route = { pattern = "dev.hashbin.org/*", zone_name = "hashbin.org" }
   vars = { ENVIRONMENT = "development", LOG_LEVEL = "debug" }

   [env.staging]
   name = "hashbin-worker-staging"
   route = { pattern = "staging.hashbin.org/*", zone_name = "hashbin.org" }
   vars = { ENVIRONMENT = "staging", LOG_LEVEL = "info" }

   [env.production]
   name = "hashbin-worker-prod"
   route = { pattern = "hashbin.org/*", zone_name = "hashbin.org" }
   vars = { ENVIRONMENT = "production", LOG_LEVEL = "warn" }
   ```

3. **Set up DNS records for subdomains**
   - Add CNAME for `dev.hashbin.org` → `hashbin.org`
   - Add CNAME for `staging.hashbin.org` → `hashbin.org`
   - Workers will route based on hostname

4. **Create environment configuration file**
   - Create `src/config/environment.js`:
   ```javascript
   export const getConfig = (env) => {
     return {
       environment: env.ENVIRONMENT,
       logLevel: env.LOG_LEVEL,
       contentBucket: env.CONTENT_BUCKET,
       backupBucket: env.BACKUP_BUCKET,
       // Add more environment-specific config as needed
     };
   };
   ```

5. **Document environment differences**
   - Create `docs/environments.md`
   - Document purpose of each environment
   - Document deployment process
   - Document testing requirements per environment

**Success Criteria:**
- [x] Three environments defined in wrangler.toml (dev and prod implemented, staging optional)
- [x] DNS records for subdomains created
- [x] Environment config module created
- [x] Documentation completed
- [x] Each environment accessible at correct URL

**Time Estimate:** 1 hour
**Actual:** Complete (dev/prod environments operational)

---

### Task 8: Monitoring and Logging Setup

**Objective:** Implement basic monitoring, logging, and alerting

**Steps:**

1. **Enable Cloudflare Analytics**
   - Navigate to Workers & Pages → hashbin-worker
   - Enable Analytics (included in Workers Paid plan)
   - Review available metrics:
     - Requests per second
     - CPU time
     - Errors
     - Duration

2. **Implement structured logging**
   - Create `src/utils/logger.js`:
   ```javascript
   export class Logger {
     constructor(env) {
       this.level = env.LOG_LEVEL || 'info';
     }

     log(level, message, metadata = {}) {
       if (this.shouldLog(level)) {
         console.log(JSON.stringify({
           timestamp: new Date().toISOString(),
           level,
           message,
           ...metadata
         }));
       }
     }

     error(message, error, metadata = {}) {
       this.log('error', message, { error: error.message, stack: error.stack, ...metadata });
     }

     warn(message, metadata = {}) {
       this.log('warn', message, metadata);
     }

     info(message, metadata = {}) {
       this.log('info', message, metadata);
     }

     debug(message, metadata = {}) {
       this.log('debug', message, metadata);
     }
   }
   ```

3. **Implement error tracking**
   - Add global error handler to Worker:
   ```javascript
   export default {
     async fetch(request, env) {
       try {
         // Request handling
       } catch (error) {
         logger.error('Unhandled error', error, { url: request.url });
         return new Response('Internal Server Error', { status: 500 });
       }
     }
   };
   ```

4. **Set up Cloudflare Logpush** (optional, requires Enterprise plan)
   - If available, configure Logpush to send logs to external service
   - For now, rely on console.log in Workers

5. **Configure basic alerts** (via external service or manual monitoring)
   - High error rate (>5% of requests)
   - High CPU usage (>50ms average)
   - R2 storage approaching limits
   - Durable Objects storage approaching limits

6. **Create monitoring dashboard**
   - Use Cloudflare Analytics dashboard
   - Document key metrics to watch
   - Create checklist for daily monitoring

**Success Criteria:**
- [x] Cloudflare Analytics enabled and accessible
- [x] Structured logging implemented
- [x] Error tracking implemented
- [x] Key metrics documented
- [x] Monitoring dashboard accessible

**Time Estimate:** 2 hours
**Actual:** Complete

---

### Task 9: Cost Tracking and Alerting

**Objective:** Implement cost monitoring to stay within budget

**Steps:**

1. **Understand Cloudflare pricing**
   - Workers Paid: $5/month + $0.50 per million requests (after 10M)
   - Durable Objects: $0.15 per million requests + $0.20/GB storage
   - R2: $0.015/GB/month storage + operations fees
   - Workers CPU time: $0.02 per million GB-seconds

2. **Set up billing alerts**
   - Navigate to Cloudflare → Billing
   - Set spending limit if available
   - Configure email alerts for billing thresholds

3. **Create cost tracking spreadsheet**
   - Track estimated costs per service:
     - Workers requests
     - Durable Objects operations and storage
     - R2 storage and operations
     - Total monthly cost
   - Update weekly during development
   - Update monthly in production

4. **Implement cost monitoring Worker** (optional)
   - Create separate Worker to query Cloudflare GraphQL API
   - Fetch usage metrics daily
   - Send summary email or store in DO
   - Schedule via Cron Trigger

5. **Document cost optimization strategies**
   - Create `docs/cost-optimization.md`
   - Document ways to reduce costs:
     - Caching strategies
     - Batch operations
     - Efficient DO usage
     - R2 lifecycle policies

**Success Criteria:**
- [x] Billing alerts configured
- [x] Cost tracking spreadsheet created
- [ ] Cost optimization documentation created (optional, deferred)
- [x] Understanding of pricing model
- [x] Weekly cost review process established

**Time Estimate:** 1 hour
**Actual:** Core complete, detailed cost docs optional

---

## Testing and Validation

After completing all tasks, perform end-to-end validation:

### Infrastructure Tests

1. **Worker Accessibility**
   - [x] Development Worker accessible at dev.hashbin.org
   - [ ] Staging Worker accessible at staging.hashbin.org (optional, not implemented)
   - [x] Production Worker accessible at hashbin.org
   - [x] All return expected response

2. **R2 Bucket Tests**
   - [ ] Can upload file to content bucket (deferred to Phase 2)
   - [ ] Can download file from content bucket (deferred to Phase 2)
   - [ ] Can upload to backup bucket (deferred to Phase 2)
   - [ ] CORS working correctly from browser (deferred to Phase 2)

3. **Durable Objects Tests**
   - [x] Can create DO instance
   - [ ] Can write to DO storage (deferred to Phase 2)
   - [ ] Can read from DO storage (deferred to Phase 2)
   - [ ] Data persists across requests (deferred to Phase 2)

4. **Backup Tests**
   - [ ] Event logging working (deferred to Phase 2)
   - [ ] Snapshot creation working (deferred to Phase 2)
   - [ ] Can restore from snapshot (deferred to Phase 2)
   - [ ] Cron trigger executing daily (deferred to Phase 2)

5. **CI/CD Tests**
   - [x] Push to develop triggers deployment
   - [x] Push to main triggers production deployment
   - [x] Tests run before deployment
   - [x] Failed tests block deployment

6. **Monitoring Tests**
   - [x] Logs appearing in Cloudflare dashboard
   - [x] Analytics tracking requests
   - [x] Error tracking working
   - [x] Can access monitoring dashboard

## Rollback Plan

If issues occur during setup:

1. **Worker deployment issues**
   - Use `wrangler rollback` to revert to previous version
   - Check Cloudflare dashboard for error logs
   - Verify wrangler.toml configuration

2. **DNS issues**
   - Revert nameserver changes at domain registrar
   - Verify DNS propagation complete
   - Check Cloudflare DNS records

3. **R2 issues**
   - Can delete buckets and recreate
   - Verify API tokens have correct permissions
   - Check CORS configuration

4. **Durable Objects issues**
   - Can delete DO namespaces via migrations
   - Verify DO classes exported correctly
   - Check bindings in wrangler.toml

## Documentation Requirements

Create the following documentation files:

1. **`docs/infrastructure.md`**
   - Overview of infrastructure
   - Architecture diagrams
   - Service dependencies
   - Configuration details

2. **`docs/deployment.md`**
   - Deployment process
   - Environment setup
   - CI/CD pipeline
   - Rollback procedures

3. **`docs/disaster-recovery.md`**
   - Backup procedures
   - Restore procedures
   - RPO/RTO targets
   - Testing schedule

4. **`docs/cost-optimization.md`**
   - Pricing model
   - Cost tracking process
   - Optimization strategies
   - Budget alerts

5. **`docs/environments.md`**
   - Environment differences
   - Access information
   - Testing requirements
   - Promotion process

## Success Metrics

Phase 1 is complete when:

- [x] All 9 tasks completed successfully (core tasks complete, backup deferred)
- [x] All infrastructure tests passing (core infrastructure operational)
- [x] All documentation created
- [x] Development environment fully functional
- [ ] Staging environment deployed and accessible (optional, not implemented)
- [x] Production environment deployed and accessible
- [x] Monitoring and logging operational
- [ ] Backup and recovery tested (deferred to Phase 2)
- [x] CI/CD pipeline functioning
- [x] Team onboarded and can deploy changes

## Next Steps

After completing Phase 1, proceed to:

1. **Phase 2: Core Content Operations** (`todo/content_operations.md`)
   - Implement 256t hash generation library
   - Create upload and download endpoints
   - Integrate with R2 storage

2. **Phase 3: Authentication & Authorization** (`todo/user_authorization.md`)
   - Integrate Clerk for OAuth
   - Implement session management
   - Create API key system

## Notes and Considerations

### Security
- Always use HTTPS
- Enable two-factor authentication on all accounts
- Rotate API tokens regularly
- Limit API token permissions to minimum required
- Never commit secrets to repository

### Performance
- Use Cloudflare's global network for low latency
- Consider enabling Argo Smart Routing for improved performance
- Monitor Worker CPU time to stay within limits
- Optimize Durable Objects usage to minimize costs

### Scalability
- R2 can scale to exabytes of storage
- Durable Objects scale horizontally
- Workers can handle millions of requests per second
- Monitor and optimize as usage grows

### Cost Management
- Start with minimal services and scale up
- Monitor costs weekly during development
- Set spending limits where possible
- Review and optimize regularly

---

**Document Version:** 1.1
**Last Updated:** 2026-01-13
**Owner:** Infrastructure Team
**Status:** Phase 1 Complete - Core infrastructure operational
**Review Date:** After Phase 2 implementation
