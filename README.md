# HashBin.org

<p align="center">
  <img src="frontend/img/hashbin-logo.png" alt="HashBin logo" width="256">
</p>

**Content distribution platform using 256t hash-based addressing**

[![Deploy Status](https://github.com/curtcox/hashbin.org/actions/workflows/deploy.yml/badge.svg)](https://github.com/curtcox/hashbin.org/actions/workflows/deploy.yml)

## Overview

HashBin.org is a content distribution platform built on Cloudflare's edge computing infrastructure. Users can publish content that others can retrieve using cryptographic hashes. The system operates on a pay-to-publish, free-to-download model with time-based retention and a fair content contestation mechanism.

### Key Features

- **256t Content Addressing**: Permanent, verifiable content addressing using 256t specification
- **Free Public Access**: All published content is freely accessible to everyone
- **Multi-Provider OAuth**: Authenticate with Google, Apple, Microsoft, or GitHub (via Clerk)
- **API Key Management**: Generate up to 25 API keys for programmatic access
- **Transparent Operation**: Public records and open source codebase
- **Pay-per-Retention**: Sustainable model with $0.03/GB/month storage cost

## Technology Stack

- **Runtime**: Cloudflare Workers (serverless edge computing)
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Database**: Cloudflare Durable Objects (distributed, transactional)
- **Authentication**: Clerk (OAuth provider management)
- **Frontend**: Vanilla HTML/CSS/JavaScript (ES6 modules, no build step)
- **Language**: JavaScript (ES modules)
- **Deployment**: GitHub Actions + Wrangler CLI

## Project Status

**See [STATUS.md](STATUS.md)** — the single source of truth for what's done, what blocks launch, and what's next.
Run `npm run status` for a one-screen summary.

In short: the MVP feature set (upload/download, auth, API keys, payments, expiration, disputes backend,
OAuth third-party publishing) is implemented and deployed. The site is **not yet accepting customers**;
the remaining launch blockers are production credentials, legal pages, the content-reporting UI, and a few
reliability items.

## Quick Start

### Prerequisites

- Node.js 22+ and npm (wrangler 4 requires it)
- Cloudflare account (paid plan for Durable Objects and R2)
- Clerk account (for OAuth authentication)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/curtcox/hashbin.org.git
   cd hashbin.org
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Run tests**
   ```bash
   # Run all tests
   npm test
   
   # Run auth system tests (requires dev server running)
   ./scripts/test-auth-system.sh
   ```

The development server runs at `http://localhost:8787`

### Local-Only Development (No External Services)

Use the fully local mode to run without Clerk or Stripe:

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start local mode**
   ```bash
   npm run dev:local
   ```

3. **Sign in locally**
   - Click **Sign In** in the UI and enter a username, or
   - Send requests with `Authorization: LocalDev <user_id>`.

For full details, see [docs/local-development.md](docs/local-development.md).

### Available Scripts

- `npm run dev` - Start local development server
- `npm run dev:local` - Start local development with local auth/payments
- `npm run deploy` - Deploy to production
- `npm run verify` - Verify production deployment
- `npm test` - Run test suite

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Cloudflare Workers)            │
│  - Authentication & Authorization                            │
│  - Content upload (downloads served from 256t.us)            │
│  - Payment processing (Stripe)                               │
│  - Dispute management                                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬─────────────┐
      │            │            │             │
┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐ ┌────▼──────┐
│ R2 Storage│ │ Durable│ │ Clerk    │ │  GitHub   │
│ (Content) │ │ Objects│ │ (Auth)   │ │ (CI/CD)   │
└───────────┘ └────────┘ └──────────┘ └───────────┘
```

### Durable Objects

1. **ContentMetadata** - Content hash records and metadata
2. **UserProfile** - User accounts, API keys, upload history
3. **KeyRegistry** - Fast API key lookups (hash → user mapping)
4. **PaymentRecord** - Payment tracking and history
5. **ContestRecord** - Content dispute tracking
6. **MessageThread** - User-to-contester communication

## API Documentation

### Authentication

HashBin.org supports two authentication methods:

1. **Clerk OAuth Session** (for web applications)
   - Use Clerk frontend SDK to obtain session token
   - Include in `Authorization: Bearer <token>` header

2. **API Keys** (for programmatic access)
   - Create via `/api/auth/apikeys` endpoint (requires Clerk session)
   - Include in `Authorization: ApiKey <key>` or `X-API-Key: <key>` header
   - Format: `hb_live_<32-chars>`

### Core Endpoints

#### Public Endpoints (No Authentication)
- `GET /` - Service information
- `GET /health` - Health check with component status
- `GET /api/content/{hash}` - Content metadata
- `GET https://256t.us/{hash}` - Download content (separate origin)

#### Authentication Endpoints
- `GET /api/auth/session` - Get current session info
- `POST /api/auth/logout` - Invalidate Clerk session
- `POST /api/auth/apikeys` - Create new API key
- `GET /api/auth/apikeys` - List user's API keys
- `DELETE /api/auth/apikeys/{key_id}` - Revoke API key
- `DELETE /api/auth/account` - Delete user account (requires 2FA)

See [docs/API.md](docs/API.md) for complete API reference documentation.

## Rate Limits

- **Anonymous**: 100 requests/minute
- **Authenticated**: 1,000 requests/minute
- **Per API Key**: 500 requests/minute (within user's total limit)

## Security

- **API Key Storage**: Keys are hashed with SHA-256 before storage
- **Session Security**: Clerk handles JWT validation and CSRF protection
- **Rate Limiting**: Per-user and per-key limits prevent abuse
- **Key Expiration**: Maximum 5-year expiration on all API keys
- **Account Deletion**: Requires 2FA confirmation

See [done/user_authorization.md#security-considerations](done/user_authorization.md#security-considerations) for details.

## Production Deployment

### Prerequisites
1. Cloudflare account with Workers paid plan ($5/month minimum)
2. Clerk account with OAuth providers configured
3. GitHub repository secrets configured

### Deployment Steps

See [done/user_authorization.md#production-deployment-checklist](done/user_authorization.md#production-deployment-checklist) for the complete deployment checklist.

Quick summary:
1. Configure OAuth providers in Clerk Dashboard
2. Generate an OAuth signing key: `./scripts/generate-oauth-signing-key.sh`
3. Add secrets to GitHub Actions and Cloudflare: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `OAUTH_SIGNING_KEY`
4. Deploy: `npm run deploy:prod`
5. Verify: `npm run verify:prod`

## Testing

### Automated Tests

```bash
# Start dev server (in one terminal)
npm run dev

# Run tests (in another terminal)
./scripts/test-auth-system.sh
```

Unit tests: `npm run test:unit`. Browser tests: `npm run test:e2e` (starts `npm run dev:local` if
needed). Full suite: `npm test` (its supplier checks call the API, so run `npm run dev:local` first).
Local API suites: `npm run test:api` against `npm run dev:local`.

Test categories:
- Anonymous access to public endpoints
- Authentication rejection on protected endpoints
- API key format validation
- Environment-specific key validation
- Session management endpoints
- Durable Objects health checks

### Manual Testing

See [todo/manual_testing_guide.md](todo/manual_testing_guide.md) for comprehensive manual testing procedures.

## Documentation

- **[API Reference](docs/API.md)** - Complete API endpoint documentation with examples ✨
- **[Frontend Deployment](docs/frontend-deployment.md)** - Frontend setup and Clerk configuration ✨
- **[Project Status](STATUS.md)** - Launch readiness and current work
- **[Master Plan](todo/master_plan.md)** - Vision, architecture, and decisions
- **[User Authorization](done/user_authorization.md)** - Authentication system (Phase 3) ✅
- **[Login Implementation](done/login.md)** - Frontend login functionality ✅
- **[Account Management](done/account_management.md)** - Account linking and deletion
- **[Content Moderation](todo/content_moderation.md)** - Disputes and deletion (Phase 6)
- **[Deployment Guide](docs/deployment.md)** - Production deployment instructions
- **[Health Check](docs/health.md)** - Health endpoint documentation

## Contributing

This is an open-source project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/curtcox/hashbin.org/issues)
- **Documentation**: [todo/](todo/) directory
- **Email**: Contact via GitHub

## Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Clerk](https://clerk.com/) for authentication
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) for deployment
- [GitHub Actions](https://github.com/features/actions) for CI/CD
