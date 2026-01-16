# GitHub Copilot Instructions for hashbin.org

## Project Overview

HashBin.org is a content distribution platform using 256t hash-based addressing, built on Cloudflare's edge computing platform. The project provides decentralized content storage with features for user management, payments, contests, and public records.

## Technology Stack

- **Runtime**: Cloudflare Workers (serverless compute on the edge)
- **State Management**: Cloudflare Durable Objects for coordination
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Language**: JavaScript (ES modules)
- **Deployment**: Automated via GitHub Actions + Wrangler CLI
- **Testing**: Bash-based verification scripts

## Project Structure

```
.
├── src/
│   ├── index.js                      # Main Worker entry point
│   └── durable-objects/              # Stateful coordination objects
│       ├── content-metadata.js       # Content hash records
│       ├── user-profile.js           # User accounts
│       ├── payment-record.js         # Payment tracking
│       ├── contest-record.js         # Content contests
│       └── message-thread.js         # User messaging
├── scripts/
│   └── verify-deployment.sh          # Deployment verification
├── .github/workflows/
│   └── deploy.yml                    # CI/CD pipeline
├── wrangler.toml                     # Cloudflare configuration
└── docs/                             # Deployment guides
```

## Code Style and Conventions

### General Guidelines

- Use ES modules syntax (`import`/`export`)
- Use JSDoc comments for functions and classes
- Follow async/await patterns (no raw promises or callbacks)
- Prefer descriptive variable names over abbreviations
- Use TODO comments for incomplete functionality

### Naming Conventions

- **Classes**: PascalCase (e.g., `ContentMetadata`, `UserProfile`)
- **Functions**: camelCase (e.g., `handleRoot`, `validateHash`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `LOG_LEVEL`, `ENVIRONMENT`)
- **Files**: kebab-case (e.g., `content-metadata.js`, `user-profile.js`)
- **Durable Objects**: Descriptive nouns (e.g., `ContentMetadata`, `PaymentRecord`)

### File Structure

All JavaScript files should follow this structure:

```javascript
/**
 * Module description
 * Brief explanation of purpose
 */

// Imports first
import { something } from './somewhere.js';

// Constants
const CONFIG = {};

// Classes
export class MyClass {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request) {
    // Implementation
  }
}

// Helper functions last
function helperFunction() {
  // Implementation
}
```

### Error Handling

- Always return proper HTTP status codes
- Use try-catch blocks for async operations
- Log errors with appropriate detail level (debug/warn/error)
- Return JSON error responses with structure: `{ error: "message", details: {} }`

## Cloudflare Workers Patterns

### Worker Entry Point

```javascript
export default {
  async fetch(request, env, ctx) {
    // Handle HTTP requests
  },
  
  async scheduled(event, env, ctx) {
    // Handle scheduled/cron jobs
  }
};
```

### Durable Objects

- Each Durable Object handles a specific coordination concern
- State is persistent and strongly consistent
- Access via bindings in `wrangler.toml`
- Always export the class from the main worker file

```javascript
export class MyDurableObject {
  constructor(state, env) {
    this.state = state;  // Persistent storage
    this.env = env;      // Environment bindings
  }
  
  async fetch(request) {
    // Handle requests to this object
  }
}
```

### R2 Storage

- Access via `env.CONTENT_BUCKET` and `env.BACKUP_BUCKET`
- Use for large content storage (not metadata)
- Keys should be content hashes (256t format)

## Environment Configuration

### Development vs Production

- **Production**: Branch `main`, worker `hashbin-worker`
- Single production environment configuration in `wrangler.toml`

### Environment Variables

Available via `env` parameter:
- `env.ENVIRONMENT`: "production" (for logging purposes)
- `env.LOG_LEVEL`: "warn" for production
- `env.CONTENT_BUCKET`: R2 bucket binding
- `env.BACKUP_BUCKET`: R2 bucket binding
- `env.CONTENT_METADATA`: Durable Object binding
- `env.USER_PROFILES`: Durable Object binding
- `env.PAYMENT_RECORDS`: Durable Object binding
- `env.CONTEST_RECORDS`: Durable Object binding
- `env.MESSAGE_THREADS`: Durable Object binding

## Building and Testing

### Local Development

```bash
# Start local development server
npm run dev

# Deploy to production
npm run deploy
```

### Verification

After any deployment:

```bash
# Verify production deployment
npm run verify -- <account-id>

# Verify production deployment
npm run verify:prod -- <account-id>

# Verify custom domain
npm run verify:custom
```

All verification tests must pass before considering a deployment successful.

### Testing Guidelines

- No formal test framework is currently set up (`npm test` is a placeholder)
- Use the verification scripts in `scripts/` for deployment testing
- Manual testing via curl or browser for new features
- Always test both success and error cases

## API Conventions

### Endpoints

- Root `/`: Service information
- Health `/health`: System health check with service status
- 404 for undefined routes

### Response Format

All responses should be JSON (except static content):

```javascript
// Success
return new Response(JSON.stringify({ 
  data: result,
  timestamp: new Date().toISOString()
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

// Error
return new Response(JSON.stringify({ 
  error: "Error message",
  details: {}
}), {
  status: 400,
  headers: { 'Content-Type': 'application/json' }
});
```

### Health Check Response

Standard format for `/health` endpoint:

```javascript
{
  status: "healthy" | "degraded" | "unhealthy",
  timestamp: "ISO 8601 timestamp",
  environment: "production",
  services: {
    worker: "operational" | "degraded" | "down",
    durableObjects: "operational" | "degraded" | "down",
    r2: "operational" | "degraded" | "down"
  }
}
```

## Deployment and CI/CD

### GitHub Actions Workflow

- Automated deployment via `.github/workflows/deploy.yml`
- Triggered on push to `develop` (dev) or `main` (prod)
- Requires secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Includes automated verification after deployment

### Deployment Process

1. Code is pushed to `develop` or `main` branch
2. GitHub Actions runs Wrangler deployment
3. Verification script tests all endpoints
4. Deployment marked as success/failure

### Manual Deployment

Can be performed locally with Wrangler CLI if needed (see `DEPLOYMENT_SETUP.md`).

## 256t Hash System

### Overview

Content is addressed using 256t hashes (to be implemented):
- 256-bit hashes for content addressing
- Content-addressable storage pattern
- Deduplication through hash-based lookup

### Implementation Notes (TODO)

- Hash generation library needs to be implemented
- Use for R2 storage keys
- Store in ContentMetadata Durable Object

## Common Patterns

### Request Routing

```javascript
const url = new URL(request.url);

if (url.pathname === '/endpoint') {
  return handleEndpoint(request, env);
}

return new Response('Not Found', { status: 404 });
```

### Accessing Durable Objects

```javascript
// Get a Durable Object instance
const id = env.CONTENT_METADATA.idFromName(contentHash);
const stub = env.CONTENT_METADATA.get(id);
const response = await stub.fetch(request);
```

### R2 Operations

```javascript
// Put object
await env.CONTENT_BUCKET.put(key, value, {
  httpMetadata: { contentType: 'application/octet-stream' }
});

// Get object
const object = await env.CONTENT_BUCKET.get(key);
if (object === null) {
  return new Response('Not Found', { status: 404 });
}
```

## Documentation

- **DEPLOYMENT_SETUP.md**: GitHub Actions secrets and Cloudflare setup
- **docs/deployment.md**: Complete deployment guide for forks
- **scripts/README.md**: Verification script documentation
- **todo/master_plan.md**: Development phases and milestones

## Important Notes

### Security

- Never commit secrets or API tokens to the repository
- Use GitHub Secrets for sensitive configuration
- Validate all user input before processing
- Use HTTPS for all external communications

### Performance

- Workers have CPU time limits (50ms per request on free, 50s on paid)
- Minimize Durable Object access (use caching where possible)
- R2 has no egress fees but consider read/write operations

### Limitations

- Cloudflare Workers Paid plan required ($5/month) for Durable Objects and R2
- Durable Objects are strongly consistent but geographically distributed
- R2 is eventually consistent across regions

## TODO Items

When implementing new features, consider:
- Adding JSDoc comments
- Updating health check endpoint if adding new services
- Adding verification tests in `scripts/verify-deployment.sh`
- Documenting new endpoints in this file
- Testing locally before production deployment

## Future Phases

See `todo/master_plan.md` for the complete development roadmap:
- Phase 1: Basic infrastructure (completed)
- Phase 2: Content operations (hash generation, upload/download)
- Phase 3: User authentication
- Phase 4: Payment processing
- Phase 5: Contest system
- Phase 6: Public records and governance
