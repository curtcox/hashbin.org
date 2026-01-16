# HashBin.org User Stories

This document contains user stories for the HashBin.org platform, organized by user type and feature area. Each story shows separate status for Web UI and API implementation:
- **UI**: Web interface status (✅ complete, 📋 planned, N/A not applicable)
- **API**: Backend API status (✅ complete, 📋 planned, N/A not applicable)

## Table of Contents

1. [Anonymous Users (Public Access)](#anonymous-users-public-access)
2. [Content Publishers](#content-publishers)
3. [Content Consumers](#content-consumers)
4. [API Developers](#api-developers)
5. [Content Donors](#content-donors)
6. [Content Contesters](#content-contesters)
7. [Platform Administrators](#platform-administrators)
8. [System Operations](#system-operations)

---

## Anonymous Users (Public Access)

### Service Discovery
- [UI: N/A | API: ✅] **As an anonymous visitor**, I would like to view the service information so that I can understand what HashBin.org offers.
- [UI: N/A | API: ✅] **As an anonymous visitor**, I would like to check the platform health status so that I can verify the service is operational.

### Content Access
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to download content using its 256t hash so that I can retrieve files without authentication.
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to see content metadata (size, upload date, expiration) so that I can verify the content before downloading.
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to download content with a file extension hint so that my browser handles the file type correctly.
- [UI: N/A | API: ✅] **As an anonymous user**, I would like to resume interrupted downloads using HTTP Range requests so that I don't have to restart large downloads.
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like inline content (≤64 bytes) to be served directly from the hash so that small files load instantly without storage overhead.

### Rate Limiting
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to check content rate limit status so that I know if I can download the content.
- [UI: 📋 | API: 📋] **As an anonymous user**, I would like clear error messages when rate limited so that I understand when I can retry.

---

## Content Publishers

### Account Management
- [UI: ✅ | API: ✅] **As a new user**, I would like to authenticate with Google, Apple, Microsoft, or GitHub so that I can create an account without managing passwords.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to link multiple OAuth providers to my account so that I can sign in using different services.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my current session information so that I can verify my authentication status.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to log out of my session so that I can secure my account when done.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to delete my account with 2FA confirmation so that I can remove my data when I no longer need the service.

### Navigation & Discoverability
- [UI: 📋 | API: N/A] **As a user**, I would like to access my dashboard from the navigation menu so that I can easily find my account information.
- [UI: 📋 | API: N/A] **As a user**, I would like to navigate to API key management from the dashboard so that I can create and manage my API keys.
- [UI: 📋 | API: N/A] **As a user**, I would like to see all available features in a clear menu structure so that I can discover what the platform offers.
- [UI: 📋 | API: N/A] **As a user**, I would like consistent navigation across all pages so that I can move between features easily.
- [UI: 📋 | API: N/A] **As a user**, I would like to view a site map showing all available pages and features so that I can understand the full platform structure.
- [UI: 📋 | API: N/A] **As a user**, I would like clear visual indicators of which section I'm currently viewing so that I always know where I am.
- [UI: 📋 | API: N/A] **As a user**, I would like breadcrumb navigation on nested pages so that I can easily navigate back to parent sections.

### Balance and Payments
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my current account balance so that I know how much credit I have available.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my transaction history so that I can track my spending and deposits.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to deposit funds using credit card, Apple Pay, Google Pay, or ACH so that I can pay for content storage.
- [UI: ✅ | API: ✅] **As a registered user**, I would like to see the deposit amount processed via Stripe Checkout so that I can complete payments securely.
- [UI: N/A | API: ✅] **As a registered user**, I would like deposits confirmed via webhook so that my balance updates automatically after payment.
- [UI: ✅ | API: ✅] **As a registered user**, I would like a minimum deposit of $1.00 so that payment processing fees are covered.

### Content Upload
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to upload files up to 5GB so that I can share my content with others.
- [UI: ✅ | API: ✅] **As a content publisher**, I would like my files hashed using the 256t specification (SHA-512 for >64 bytes) so that content is permanently addressable.
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to select retention duration (minimum 30 days) so that I can control how long content is stored.
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to see the cost calculation ($0.03/GB/month) before upload so that I know the price before committing.
- [UI: N/A | API: ✅] **As a content publisher**, I would like my balance automatically deducted on successful upload so that payment is seamless.
- [UI: ✅ | API: N/A] **As a content publisher**, I would like to drag and drop files for upload so that uploading is convenient.
- [UI: ✅ | API: N/A] **As a content publisher**, I would like to see upload progress and be able to cancel so that I can manage long uploads.
- [UI: N/A | API: ✅] **As a content publisher**, I would like duplicate content detection so that I'm not charged twice for the same file.
- [UI: ✅ | API: ✅] **As a content publisher**, I would like the option to extend retention on duplicate content so that I can keep it available longer.
- [UI: N/A | API: ✅] **As a content publisher**, I would like failed uploads to not charge my account so that I only pay for successful storage.
- [UI: N/A | API: ✅] **As a content publisher**, I would like inline content (≤64 bytes) to be free so that small files don't incur storage costs.

### Content Management
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to view my upload history so that I can track all content I've published.
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to extend retention before expiration so that I can keep content available longer.
- [UI: 📋 | API: 📋] **As a content publisher**, I would like to see when my content will expire so that I can plan retention extensions.
- [UI: 📋 | API: 📋] **As a content publisher**, I would like to view download statistics for my content so that I can understand usage patterns.

### Rate Limiting for Content
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to purchase bandwidth (MTBR rate limiting) for my content so that I can control access frequency.
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to see rate limit pricing based on file size and request frequency so that I can budget appropriately.
- [UI: N/A | API: ✅] **As a content publisher**, I would like rate limits to stack when purchasing multiple times so that I can incrementally increase capacity.
- [UI: N/A | API: ✅] **As a content publisher**, I would like a default 30-day MTBR (minimum time between requests) for 30 days so that my content has basic protection.
- [UI: N/A | API: ✅] **As a content publisher**, I would like inline content exempted from rate limits so that small files remain freely accessible.

---

## Content Consumers

### Content Discovery
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to retrieve content using only its 256t hash so that access is simple and direct.
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to view content information before downloading so that I can verify size and type.

### Content Download
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to download content for free so that I can access published files without payment.
- [UI: ✅ | API: ✅] **As a content consumer**, I would like fast downloads via Cloudflare's CDN so that content loads quickly from anywhere.
- [UI: N/A | API: ✅] **As a content consumer**, I would like proper MIME types on downloads so that my browser handles files correctly.
- [UI: N/A | API: ✅] **As a content consumer**, I would like ETag caching support so that repeated downloads are efficient.
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to force download instead of inline preview so that I can save files directly.
- [UI: N/A | API: ✅] **As a content consumer**, I would like HEAD requests supported so that I can check content metadata without downloading.

### Rate Limiting
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to see clear rate limit errors so that I know when content is temporarily unavailable.
- [UI: N/A | API: ✅] **As a content consumer**, I would like rate limits enforced fairly (lowest MTBR wins) so that I understand access restrictions.

---

## API Developers

### API Keys
- [UI: 📋 | API: ✅] **As a developer**, I would like to generate API keys so that I can access the platform programmatically.
- [UI: 📋 | API: ✅] **As a developer**, I would like to create up to 25 API keys so that I can separate keys by application or environment.
- [UI: N/A | API: ✅] **As a developer**, I would like keys with format `hb_live_*` (production) or `hb_test_*` (development) so that I can distinguish environments.
- [UI: N/A | API: ✅] **As a developer**, I would like keys to expire after a maximum of 5 years so that I'm forced to rotate credentials periodically.
- [UI: 📋 | API: ✅] **As a developer**, I would like to name my API keys so that I can identify their purpose.
- [UI: 📋 | API: N/A] **As a developer**, I would like to see API keys only once at creation so that security is maintained.
- [UI: 📋 | API: ✅] **As a developer**, I would like to list my API keys (without plaintext values) so that I can manage active credentials.
- [UI: 📋 | API: ✅] **As a developer**, I would like to revoke API keys so that I can disable compromised credentials.
- [UI: N/A | API: ✅] **As a developer**, I would like keys stored as SHA-256 hashes so that plaintext keys are never exposed in storage.
- [UI: 📋 | API: ✅] **As a developer**, I would like to see when keys were last used so that I can identify inactive keys.
- [UI: 📋 | API: ✅] **As a developer**, I would like to reveal an API key with fresh session authentication so that I can recover a key if needed.

### Rate Limits
- [UI: N/A | API: ✅] **As a developer**, I would like 500 requests/minute per API key so that I can build automated tools.
- [UI: N/A | API: ✅] **As a developer**, I would like rate limit headers in responses so that I can implement backoff strategies.
- [UI: N/A | API: ✅] **As a developer**, I would like clear rate limit error codes so that my applications can handle limits gracefully.

### API Usage
- [UI: N/A | API: ✅] **As a developer**, I would like to use API keys with `Authorization: ApiKey <key>` or `X-API-Key: <key>` headers so that I have flexible authentication options.
- [UI: N/A | API: ✅] **As a developer**, I would like comprehensive API documentation so that I can integrate quickly.
- [UI: N/A | API: ✅] **As a developer**, I would like consistent error response formats so that error handling is predictable.
- [UI: N/A | API: 📋] **As a developer**, I would like webhooks for content events so that I can build reactive applications.
- [UI: N/A | API: 📋] **As a developer**, I would like bulk operations for multiple files so that I can upload/manage content efficiently.

---

## Content Donors

### Donation System
- [UI: 📋 | API: ✅] **As a donor**, I would like to donate to specific content by hash so that I can support valuable files.
- [UI: N/A | API: ✅] **As a donor**, I would like donations to extend content retention so that important files stay available longer.
- [UI: N/A | API: ✅] **As a donor**, I would like to donate anonymously or with authentication so that I have privacy options.
- [UI: 📋 | API: ✅] **As a donor**, I would like to donate via Stripe Checkout so that payment is secure and supports multiple methods.
- [UI: 📋 | API: ✅] **As a donor**, I would like to see how my donation extends retention so that I understand the impact.

---

## Content Contesters

### Contest Submission
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for copyrighted content so that I can protect my intellectual property.
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for illegal content so that harmful material can be removed.
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for abusive content so that policy violations are addressed.
- [UI: 📋 | API: 📋] **As a contester**, I would like to upload evidence documents so that my claim is properly supported.
- [UI: 📋 | API: 📋] **As a contester**, I would like my evidence immediately visible to moderators and payers so that disputes can be resolved quickly.

### Communication
- [UI: 📋 | API: 📋] **As a contester**, I would like to receive messages from content payers so that we can resolve disputes directly.
- [UI: 📋 | API: 📋] **As a contester**, I would like email notifications for new messages so that I don't miss communications.
- [UI: 📋 | API: 📋] **As a contester**, I would like message character and count limits so that conversations stay productive.
- [UI: 📋 | API: 📋] **As a contester**, I would like to respond to payer messages so that I can provide clarifications or additional evidence.

### Contest Resolution
- [UI: 📋 | API: 📋] **As a contester**, I would like automated checks on my contest so that obvious violations are handled quickly.
- [UI: 📋 | API: 📋] **As a contester**, I would like manual review for nuanced cases so that fair decisions are made.
- [UI: 📋 | API: 📋] **As a contester**, I would like to see contest status updates so that I know the progress of my claim.
- [UI: 📋 | API: 📋] **As a contester**, I would like to appeal decisions so that incorrect rulings can be challenged.
- [UI: 📋 | API: 📋] **As a contester**, I would like DMCA-compliant 24-48 hour response times so that legal requirements are met.

---

## Platform Administrators

### Content Moderation
- [UI: 📋 | API: 📋] **As an administrator**, I would like to review contest submissions so that I can make fair decisions.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to see all evidence immediately upon contest filing so that I can assess claims quickly.
- [UI: 📋 | API: 📋] **As an administrator**, I would like automated rules to filter obvious violations so that I can focus on complex cases.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to view message threads between payers and contesters so that I understand dispute context.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to offer paid moderation services so that users can request official intervention.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to take down content with compelling evidence so that platform policies are enforced.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to maintain public records of decisions so that operations are transparent.

### System Management
- [UI: N/A | API: ✅] **As an administrator**, I would like to monitor system health across all components so that I can ensure uptime.
- [UI: N/A | API: ✅] **As an administrator**, I would like to track financial metrics (revenue, costs, profit) so that the platform is sustainable.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to see aggregate platform statistics so that I can understand usage patterns.
- [UI: 📋 | API: 📋] **As an administrator**, I would like alerts for unusual activity so that I can respond to issues proactively.
- [UI: 📋 | API: 📋] **As an administrator**, I would like to export data for transparency so that operations remain auditable.

---

## System Operations

### Infrastructure
- [UI: N/A | API: ✅] **As the system**, I would like to store content in Cloudflare R2 so that files are durable and globally accessible.
- [UI: N/A | API: ✅] **As the system**, I would like to store metadata in Durable Objects so that data is consistent and transactional.
- [UI: N/A | API: ✅] **As the system**, I would like to run on Cloudflare Workers so that requests are fast at the edge.
- [UI: N/A | API: ✅] **As the system**, I would like to deploy via GitHub Actions so that deployments are automated and reliable.
- [UI: N/A | API: ✅] **As the system**, I would like environment-specific configurations so that development and production are isolated.

### Authentication & Security
- [UI: N/A | API: ✅] **As the system**, I would like to validate Clerk JWT tokens so that user sessions are secure.
- [UI: N/A | API: ✅] **As the system**, I would like to hash API keys with SHA-256 so that credentials are protected at rest.
- [UI: N/A | API: ✅] **As the system**, I would like to enforce rate limits per user, key, and IP so that abuse is prevented.
- [UI: N/A | API: ✅] **As the system**, I would like to require 2FA for account deletion so that destructive actions are protected.
- [UI: N/A | API: ✅] **As the system**, I would like to soft-delete accounts so that audit trails are maintained.

### Content Lifecycle
- [UI: N/A | API: ✅] **As the system**, I would like to generate 256t hashes deterministically so that content addressing is reliable.
- [UI: N/A | API: ✅] **As the system**, I would like to store inline content (≤64 bytes) in the hash itself so that small files are efficient.
- [UI: N/A | API: ✅] **As the system**, I would like to detect duplicate uploads so that storage is optimized.
- [UI: N/A | API: ✅] **As the system**, I would like to track content expiration timestamps so that retention is enforced.
- [UI: N/A | API: 📋] **As the system**, I would like to run scheduled expiration jobs so that expired content is automatically removed.
- [UI: N/A | API: 📋] **As the system**, I would like to delete content immediately on expiration so that storage costs are minimized.
- [UI: N/A | API: 📋] **As the system**, I would like to maintain public deletion records so that operations are transparent.

### Payment Processing
- [UI: N/A | API: ✅] **As the system**, I would like to integrate with Stripe for payments so that multiple payment methods are supported.
- [UI: N/A | API: ✅] **As the system**, I would like to verify webhook signatures so that payment confirmations are authentic.
- [UI: N/A | API: ✅] **As the system**, I would like to update balances atomically so that financial operations are consistent.
- [UI: N/A | API: ✅] **As the system**, I would like to track all transactions so that financial records are complete.
- [UI: N/A | API: ✅] **As the system**, I would like to enforce minimum payments ($1.00) so that processing fees are covered.
- [UI: N/A | API: ✅] **As the system**, I would like to calculate pricing as Size × Duration × $0.03 so that costs are transparent.

### Rate Limiting System
- [UI: N/A | API: ✅] **As the system**, I would like to enforce MTBR (minimum time between requests) so that content access is controlled.
- [UI: N/A | API: ✅] **As the system**, I would like to allow rate limit stacking so that publishers can incrementally increase capacity.
- [UI: N/A | API: ✅] **As the system**, I would like to exempt inline content from rate limits so that small files remain freely accessible.
- [UI: N/A | API: ✅] **As the system**, I would like to return rate limit status in API responses so that clients can handle limits appropriately.
- [UI: N/A | API: ✅] **As the system**, I would like to price rate limits as Size × Max Requests × Rate Per Byte so that costs scale fairly.

### Monitoring & Observability
- [UI: N/A | API: ✅] **As the system**, I would like to log authentication failures so that security issues can be investigated.
- [UI: N/A | API: ✅] **As the system**, I would like to track API key last-used timestamps so that inactive keys can be identified.
- [UI: N/A | API: ✅] **As the system**, I would like to expose health check endpoints so that monitoring systems can verify status.
- [UI: N/A | API: 📋] **As the system**, I would like to emit metrics for all operations so that performance can be analyzed.
- [UI: N/A | API: 📋] **As the system**, I would like to alert on anomalies so that issues can be addressed promptly.

### Transparency & Records
- [UI: 📋 | API: 📋] **As the system**, I would like to publish content metadata publicly so that operations are transparent.
- [UI: 📋 | API: 📋] **As the system**, I would like to publish contest records publicly so that decisions are accountable.
- [UI: 📋 | API: 📋] **As the system**, I would like to publish deletion records publicly so that content lifecycle is visible.
- [UI: 📋 | API: 📋] **As the system**, I would like to provide aggregate statistics so that platform health is observable.
- [UI: 📋 | API: 📋] **As the system**, I would like to support data export so that records can be archived and audited.

### Future Enhancements
- [UI: 📋 | API: 📋] **As the system**, I would like to support multipart uploads for files >5GB so that larger content can be stored.
- [UI: 📋 | API: 📋] **As the system**, I would like to implement backup and disaster recovery so that data is protected.
- [UI: 📋 | API: 📋] **As the system**, I would like to support content verification checksums so that integrity can be validated.
- [UI: 📋 | API: 📋] **As the system**, I would like to implement edge caching strategies so that popular content loads faster.
- [UI: 📋 | API: 📋] **As the system**, I would like to support bulk operations so that API efficiency is improved.

---

## Summary Statistics

### By Implementation Channel

#### Web UI Status
- **UI Complete (✅)**: 55 stories
- **UI Planned (📋)**: 35 stories
- **UI Not Applicable (N/A)**: 65 stories

#### API Status
- **API Complete (✅)**: 96 stories
- **API Planned (📋)**: 47 stories
- **API Not Applicable (N/A)**: 12 stories

### By User Type

#### Anonymous Users (8 stories)
- UI Complete: 5 | API Complete: 7
- UI Planned: 1 | API Planned: 1
- UI N/A: 2 | API N/A: 0

#### Content Publishers (39 stories)
- UI Complete: 19 | API Complete: 28
- UI Planned: 10 | API Planned: 2
- UI N/A: 10 | API N/A: 9

#### Content Consumers (10 stories)
- UI Complete: 6 | API Complete: 10
- UI Planned: 0 | API Planned: 0
- UI N/A: 4 | API N/A: 0

#### API Developers (18 stories)
- UI Complete: 0 | API Complete: 15
- UI Planned: 7 | API Planned: 2
- UI N/A: 11 | API N/A: 1

#### Content Donors (5 stories)
- UI Complete: 0 | API Complete: 5
- UI Planned: 3 | API Planned: 0
- UI N/A: 2 | API N/A: 0

#### Content Contesters (14 stories)
- UI Complete: 0 | API Complete: 0
- UI Planned: 14 | API Planned: 14
- UI N/A: 0 | API N/A: 0

#### Platform Administrators (12 stories)
- UI Complete: 0 | API Complete: 2
- UI Planned: 9 | API Planned: 10
- UI N/A: 3 | API N/A: 0

#### System Operations (50 stories)
- UI Complete: 0 | API Complete: 29
- UI Planned: 8 | API Planned: 18
- UI N/A: 42 | API N/A: 3

### Total User Stories: 155

### Overall Progress
- **Fully Complete (UI ✅ & API ✅)**: 55 stories (35%)
- **Partially Complete (UI ✅ or API ✅)**: 41 stories (26%)
- **Fully Planned (UI 📋 & API 📋)**: 48 stories (31%)
- **Mixed Status**: 11 stories (7%)

---

## Site Map

This section shows the current and planned page structure for HashBin.org.

### Public Pages (No Authentication Required)

**Implemented ✅**
- `/` - Landing page with service information
- `/retrieve.html` - Content retrieval/download interface
- `/info.html` - Content information viewer
- `/{hash}` - Direct content download (API endpoint, works in browser)
- `/{hash}.{ext}` - Download with file extension hint

**Planned 📋**
- `/docs/` - Documentation hub
- `/docs/api/` - API documentation
- `/docs/getting-started/` - Getting started guide
- `/public-records/` - Public transparency records viewer
- `/public-records/contests/` - Contest history
- `/public-records/deletions/` - Deletion history
- `/stats/` - Platform statistics dashboard

### Authenticated Pages (Login Required)

**Implemented ✅**
- `/dashboard.html` - User dashboard with balance and quick actions
- `/upload.html` - Content upload interface
- `/deposit.html` - Add funds / deposit interface

**Planned 📋**
- `/dashboard/api-keys/` - API key management
- `/dashboard/api-keys/create` - Create new API key
- `/dashboard/api-keys/:id` - View/manage specific key
- `/dashboard/uploads/` - Upload history and management
- `/dashboard/uploads/:hash` - Manage specific upload
- `/dashboard/transactions/` - Full transaction history
- `/dashboard/balance/` - Detailed balance information
- `/dashboard/account/` - Account settings
- `/dashboard/account/providers` - Linked OAuth providers
- `/dashboard/account/security` - Security settings (2FA, etc.)
- `/donate/:hash` - Donation flow for specific content
- `/contest/submit` - Submit content contest
- `/contest/:id` - View contest status
- `/messages/` - Message inbox (for contest communications)
- `/messages/:threadId` - Specific message thread

### Admin Pages (Admin Role Required)

**Planned 📋**
- `/admin/` - Admin dashboard
- `/admin/contests/` - Contest review queue
- `/admin/contests/:id` - Review specific contest
- `/admin/moderation/` - Moderation tools
- `/admin/users/` - User management
- `/admin/metrics/` - Platform metrics and analytics

### Navigation Structure

```
HashBin (Logo) → /
├── Upload → /upload.html [Auth Required]
├── Retrieve → /retrieve.html [Public]
├── Docs → /docs/ [Public]
└── Dashboard → /dashboard.html [Auth Required]
    ├── Overview (default view)
    ├── API Keys → /dashboard/api-keys/ [Planned]
    ├── Uploads → /dashboard/uploads/ [Planned]
    ├── Transactions → /dashboard/transactions/ [Planned]
    ├── Balance → /dashboard/balance/ [Planned]
    ├── Messages → /messages/ [Planned]
    └── Account Settings → /dashboard/account/ [Planned]
```

### Current Implementation Status

**Pages Implemented**: 6
- Landing (/)
- Retrieve
- Info
- Dashboard
- Upload
- Deposit

**Pages Planned**: 23+
- API key management (3 pages)
- Upload management (2 pages)
- Account settings (3 pages)
- Transaction history (1 page)
- Donation flow (1 page)
- Contest system (2 pages)
- Messaging (2 pages)
- Documentation (3 pages)
- Public records (3 pages)
- Admin interface (5 pages)

**Navigation Implementation**
- ✅ Header with logo and main links
- ✅ Auth section in header (sign in/out, user info)
- ✅ Footer with links
- 📋 Dashboard sidebar navigation
- 📋 Breadcrumb navigation
- 📋 Active page indicators
- 📋 Responsive mobile menu

---

## Notes

### Architectural Principles
1. **Hash-only access**: No search or discovery features (by design)
2. **Pay-to-publish, free-to-download**: Sustainable and open model
3. **No refunds**: All payments are final
4. **No grace period**: Immediate deletion on expiration
5. **Transparency first**: Public records for all operations
6. **Privacy-preserving**: Minimal user data collection
7. **Content-agnostic**: No file type restrictions
8. **Evidence-based moderation**: Removal requires compelling evidence

### Implementation Phases
- **Phase 1**: Foundation & Infrastructure ✅
- **Phase 2**: Core Content Operations (Partially Complete)
- **Phase 3**: Authentication & Authorization ✅
- **Phase 4**: Payment System ✅
- **Phase 5**: Retention & Expiration Management 📋
- **Phase 6**: Contestation System 📋
- **Phase 7**: Frontend Login UI ✅
- **Phase 8**: Public Records & Transparency 📋
- **Phase 9-11**: Testing, Legal, Operations 📋

---

**Document Version:** 2.2
**Last Updated:** 2026-01-16
**Status:** Comprehensive list with separate UI/API status tracking and site map

**Changes in v2.2:**
- Added comprehensive **Site Map** section showing all current and planned pages
  - Public pages: 5 implemented, 7 planned
  - Authenticated pages: 3 implemented, 14 planned
  - Admin pages: 5 planned
  - Navigation structure diagram
  - Implementation status breakdown (6 pages done, 23+ planned)
- Added 3 new "Navigation & Discoverability" stories:
  - View site map
  - Visual indicators for current section
  - Breadcrumb navigation
- Updated summary: 155 total stories (was 152)
- Updated stats: UI 35 planned (was 32), Content Publishers 39 stories (was 36)

**Changes in v2.1:**
- Corrected API key management stories: UI is 📋 (planned), not ✅ (complete)
- Added 4 new "Navigation & Discoverability" stories under Content Publishers
- Added 1 new story: reveal API key with fresh session authentication
- Updated summary: 152 total stories (was 148)
- Updated stats: UI 55 complete (was 61), UI 32 planned (was 21)

**Changes in v2.0:**
- Added separate status indicators for Web UI and API implementation
- Each story now shows [UI: status | API: status] format
- Updated summary statistics to break down by UI/API completion
- Added overall progress metrics showing fully/partially complete stories
