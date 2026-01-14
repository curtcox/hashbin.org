# HashBin.org

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

### ✅ Phase 1: Foundation & Infrastructure (Complete)
- Cloudflare infrastructure setup
- GitHub Actions CI/CD pipeline
- Development and production environments
- Health monitoring and logging

### ✅ Phase 3: Authentication & Authorization (Complete)
- Clerk OAuth integration (Google, Apple, Microsoft, GitHub)
- Session management (Clerk JWT validation)
- API key generation and management
- Rate limiting (anonymous, authenticated, per-key)
- Account management (creation, deletion, linking)
- Webhook handlers for user lifecycle events
- **15/15 tests passing** ✅

### ✅ Phase 7: Frontend Login UI (Complete)
- Landing page with navigation and auth header
- User authentication UI (Sign In/Sign Out)
- Balance display in header
- Protected pages (upload, dashboard, deposit)
- Public retrieve page
- Session persistence and auth gate
- **Frontend deployed with Worker** ✅

### 🚧 Phase 2: Core Content Operations (Planned)
- 256t hash generation and validation
- Content upload/download endpoints
- R2 storage integration
- Content metadata in Durable Objects

### 📋 Phase 4-6: Future Features
- Payment system (Stripe integration)
- Retention management and expiration
- Content contestation and dispute resolution

See [todo/master_plan.md](todo/master_plan.md) for the complete roadmap.

## Quick Start

### Prerequisites

- Node.js 18+ and npm
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

### Available Scripts

- `npm run dev` - Start local development server
- `npm run deploy:dev` - Deploy to development environment
- `npm run deploy:prod` - Deploy to production environment
- `npm run verify:dev` - Verify development deployment
- `npm run verify:prod` - Verify production deployment
- `npm test` - Run test suite

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Cloudflare Workers)            │
│  - Authentication & Authorization (✅ Complete)              │
│  - Content upload/download (🚧 Planned)                      │
│  - Payment processing (📋 Planned)                           │
│  - Contest management (📋 Planned)                           │
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
   - Format: `hb_live_<32-chars>` (production) or `hb_test_<32-chars>` (development)

### Core Endpoints

#### Public Endpoints (No Authentication)
- `GET /` - Service information
- `GET /health` - Health check with component status
- `GET /api/content/{hash}` - Download content (🚧 Planned)

#### Authentication Endpoints
- `GET /api/auth/session` - Get current session info
- `POST /api/auth/logout` - Invalidate Clerk session
- `POST /api/auth/apikeys` - Create new API key
- `GET /api/auth/apikeys` - List user's API keys
- `DELETE /api/auth/apikeys/{key_id}` - Revoke API key
- `DELETE /api/auth/account` - Delete user account (requires 2FA)

#### Webhook Endpoints
- `POST /api/webhooks/clerk` - Clerk user lifecycle webhooks

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

See [todo/user_authorization.md#security-considerations](todo/user_authorization.md#security-considerations) for details.

## Production Deployment

### Prerequisites
1. Cloudflare account with Workers paid plan ($5/month minimum)
2. Clerk account with OAuth providers configured
3. GitHub repository secrets configured

### Deployment Steps

See [todo/user_authorization.md#production-deployment-checklist](todo/user_authorization.md#production-deployment-checklist) for the complete deployment checklist.

Quick summary:
1. Configure OAuth providers in Clerk Dashboard
2. Set up Clerk webhook for user lifecycle events
3. Add secrets to Cloudflare: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
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

Current test coverage: **15/15 tests passing** ✅

Test categories:
- Anonymous access to public endpoints
- Authentication rejection on protected endpoints
- API key format validation
- Environment-specific key validation
- Webhook signature verification
- Session management endpoints
- Durable Objects health checks

### Manual Testing

See [todo/manual_testing_guide.md](todo/manual_testing_guide.md) for comprehensive manual testing procedures.

## Documentation

- **[API Reference](docs/API.md)** - Complete API endpoint documentation with examples ✨
- **[Frontend Deployment](docs/frontend-deployment.md)** - Frontend setup and Clerk configuration ✨
- **[Master Plan](todo/master_plan.md)** - Complete implementation roadmap
- **[User Authorization](todo/user_authorization.md)** - Authentication system (Phase 3) ✅
- **[Login Implementation](todo/login.md)** - Frontend login functionality ✅
- **[Account Management](todo/account_management.md)** - Account linking and deletion
- **[Content Dispute Resolution](todo/content_dispute_resolution.md)** - Contest system (Phase 6)
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
