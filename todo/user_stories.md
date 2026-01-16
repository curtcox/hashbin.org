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
  - _Paths: API: `GET /`_
- [UI: N/A | API: ✅] **As an anonymous visitor**, I would like to check the platform health status so that I can verify the service is operational.
  - _Paths: API: `GET /health`_

### Content Access
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to download content using its 256t hash so that I can retrieve files without authentication.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}`, `GET /{hash}.{ext}`_
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to see content metadata (size, upload date, expiration) so that I can verify the content before downloading.
  - _Paths: UI: `/info.html` | API: `GET /api/content/{cid}`, `GET /api/content/{cid}/exists`_
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to download content with a file extension hint so that my browser handles the file type correctly.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}.{ext}`_
- [UI: N/A | API: ✅] **As an anonymous user**, I would like to resume interrupted downloads using HTTP Range requests so that I don't have to restart large downloads.
  - _Paths: API: `GET /{hash}` (with Range header)_
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like inline content (≤64 bytes) to be served directly from the hash so that small files load instantly without storage overhead.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}` (inline content auto-detected)_

### Rate Limiting
- [UI: ✅ | API: ✅] **As an anonymous user**, I would like to check content rate limit status so that I know if I can download the content.
  - _Paths: UI: `/info.html` | API: `GET /api/content/{cid}/rate-limit`_
- [UI: 📋 | API: 📋] **As an anonymous user**, I would like clear error messages when rate limited so that I understand when I can retry.
  - _Paths: UI: All pages (planned) | API: HTTP 429 responses (planned)_

---

## Content Publishers

### Account Management
- [UI: ✅ | API: ✅] **As a new user**, I would like to authenticate with Google, Apple, Microsoft, or GitHub so that I can create an account without managing passwords.
  - _Paths: UI: All pages (Clerk widget) | API: Clerk OAuth endpoints_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to link multiple OAuth providers to my account so that I can sign in using different services.
  - _Paths: UI: All pages (Clerk widget) | API: Clerk account linking_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my current session information so that I can verify my authentication status.
  - _Paths: UI: Header auth section | API: `GET /api/auth/session`_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to log out of my session so that I can secure my account when done.
  - _Paths: UI: Header auth section | API: `POST /api/auth/logout`_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to delete my account with 2FA confirmation so that I can remove my data when I no longer need the service.
  - _Paths: UI: `/dashboard/account/` (planned) | API: `DELETE /api/auth/account`_

### Navigation & Discoverability
- [UI: 📋 | API: N/A] **As a user**, I would like to access my dashboard from the navigation menu so that I can easily find my account information.
  - _Paths: UI: Header navigation → `/dashboard.html` (planned link)_
- [UI: 📋 | API: N/A] **As a user**, I would like to navigate to API key management from the dashboard so that I can create and manage my API keys.
  - _Paths: UI: `/dashboard.html` → `/dashboard/api-keys/` (planned)_
- [UI: 📋 | API: N/A] **As a user**, I would like to see all available features in a clear menu structure so that I can discover what the platform offers.
  - _Paths: UI: Dashboard sidebar navigation (planned)_
- [UI: 📋 | API: N/A] **As a user**, I would like consistent navigation across all pages so that I can move between features easily.
  - _Paths: UI: All pages (header/footer/sidebar planned)_
- [UI: 📋 | API: N/A] **As a user**, I would like to view a site map showing all available pages and features so that I can understand the full platform structure.
  - _Paths: UI: `/sitemap.html` or footer link (planned)_
- [UI: 📋 | API: N/A] **As a user**, I would like clear visual indicators of which section I'm currently viewing so that I always know where I am.
  - _Paths: UI: All pages (active nav indicators planned)_
- [UI: 📋 | API: N/A] **As a user**, I would like breadcrumb navigation on nested pages so that I can easily navigate back to parent sections.
  - _Paths: UI: Dashboard subpages (breadcrumbs planned)_

### Balance and Payments
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my current account balance so that I know how much credit I have available.
  - _Paths: UI: `/dashboard.html`, header balance display | API: `GET /api/balance`_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to view my transaction history so that I can track my spending and deposits.
  - _Paths: UI: `/dashboard.html` (basic), `/dashboard/transactions/` (planned) | API: `GET /api/balance/history`_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to deposit funds using credit card, Apple Pay, Google Pay, or ACH so that I can pay for content storage.
  - _Paths: UI: `/deposit.html` | API: `POST /api/balance/deposit`_
- [UI: ✅ | API: ✅] **As a registered user**, I would like to see the deposit amount processed via Stripe Checkout so that I can complete payments securely.
  - _Paths: UI: `/deposit.html` → Stripe Checkout | API: `POST /api/balance/deposit` returns Stripe URL_
- [UI: N/A | API: ✅] **As a registered user**, I would like deposits confirmed via webhook so that my balance updates automatically after payment.
  - _Paths: API: `POST /api/payments/webhook` (Stripe webhook)_
- [UI: ✅ | API: ✅] **As a registered user**, I would like a minimum deposit of $1.00 so that payment processing fees are covered.
  - _Paths: UI: `/deposit.html` (validation) | API: `POST /api/balance/deposit` (enforced)_

### Content Upload
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to upload files up to 5GB so that I can share my content with others.
  - _Paths: UI: `/upload.html` | API: `POST /api/content`_
- [UI: ✅ | API: ✅] **As a content publisher**, I would like my files hashed using the 256t specification (SHA-512 for >64 bytes) so that content is permanently addressable.
  - _Paths: UI: `/upload.html` (client-side hash) | API: `POST /api/content` (server verifies)_
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to select retention duration (minimum 30 days) so that I can control how long content is stored.
  - _Paths: UI: `/upload.html` (duration selector) | API: `POST /api/content` (retention_days param)_
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to see the cost calculation ($0.03/GB/month) before upload so that I know the price before committing.
  - _Paths: UI: `/upload.html` (live cost calculator) | API: Pricing logic in content handler_
- [UI: N/A | API: ✅] **As a content publisher**, I would like my balance automatically deducted on successful upload so that payment is seamless.
  - _Paths: API: `POST /api/content` (deducts balance atomically)_
- [UI: ✅ | API: N/A] **As a content publisher**, I would like to drag and drop files for upload so that uploading is convenient.
  - _Paths: UI: `/upload.html` (drag-drop zone)_
- [UI: ✅ | API: N/A] **As a content publisher**, I would like to see upload progress and be able to cancel so that I can manage long uploads.
  - _Paths: UI: `/upload.html` (progress bar, cancel button)_
- [UI: N/A | API: ✅] **As a content publisher**, I would like duplicate content detection so that I'm not charged twice for the same file.
  - _Paths: API: `POST /api/content` (checks existing hash)_
- [UI: ✅ | API: ✅] **As a content publisher**, I would like the option to extend retention on duplicate content so that I can keep it available longer.
  - _Paths: UI: `/upload.html` (duplicate prompt) | API: `POST /api/content/{cid}/extend`_
- [UI: N/A | API: ✅] **As a content publisher**, I would like failed uploads to not charge my account so that I only pay for successful storage.
  - _Paths: API: `POST /api/content` (atomic transaction)_
- [UI: N/A | API: ✅] **As a content publisher**, I would like inline content (≤64 bytes) to be free so that small files don't incur storage costs.
  - _Paths: API: `POST /api/content` (inline content = $0.00)_

### Content Management
- [UI: ✅ | API: ✅] **As a content publisher**, I would like to view my upload history so that I can track all content I've published.
  - _Paths: UI: `/dashboard.html` (basic list), `/dashboard/uploads/` (planned) | API: UserProfile DO stores upload_history_
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to extend retention before expiration so that I can keep content available longer.
  - _Paths: UI: `/dashboard/uploads/{hash}` (planned) | API: `POST /api/content/{cid}/extend`_
- [UI: 📋 | API: 📋] **As a content publisher**, I would like to see when my content will expire so that I can plan retention extensions.
  - _Paths: UI: `/dashboard/uploads/` (planned) | API: `GET /api/content/{cid}` expiration_timestamp (planned)_
- [UI: 📋 | API: 📋] **As a content publisher**, I would like to view download statistics for my content so that I can understand usage patterns.
  - _Paths: UI: `/dashboard/uploads/{hash}` (planned) | API: Download tracking (planned)_

### Rate Limiting for Content
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to purchase bandwidth (MTBR rate limiting) for my content so that I can control access frequency.
  - _Paths: UI: `/dashboard/uploads/{hash}/rate-limit` (planned) | API: `POST /api/content/rate-limit/purchase`_
- [UI: 📋 | API: ✅] **As a content publisher**, I would like to see rate limit pricing based on file size and request frequency so that I can budget appropriately.
  - _Paths: UI: `/dashboard/uploads/{hash}/rate-limit` (planned) | API: Pricing calculator in rate-limit handler_
- [UI: N/A | API: ✅] **As a content publisher**, I would like rate limits to stack when purchasing multiple times so that I can incrementally increase capacity.
  - _Paths: API: `POST /api/content/rate-limit/purchase` (stacking logic)_
- [UI: N/A | API: ✅] **As a content publisher**, I would like a default 30-day MTBR (minimum time between requests) for 30 days so that my content has basic protection.
  - _Paths: API: `POST /api/content` (default rate limit applied)_
- [UI: N/A | API: ✅] **As a content publisher**, I would like inline content exempted from rate limits so that small files remain freely accessible.
  - _Paths: API: Rate limit check skips inline content_

---

## Content Consumers

### Content Discovery
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to retrieve content using only its 256t hash so that access is simple and direct.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}`_
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to view content information before downloading so that I can verify size and type.
  - _Paths: UI: `/info.html` | API: `GET /api/content/{cid}`_

### Content Download
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to download content for free so that I can access published files without payment.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}`_
- [UI: ✅ | API: ✅] **As a content consumer**, I would like fast downloads via Cloudflare's CDN so that content loads quickly from anywhere.
  - _Paths: UI: `/retrieve.html` | API: `GET /{hash}` (via Cloudflare edge)_
- [UI: N/A | API: ✅] **As a content consumer**, I would like proper MIME types on downloads so that my browser handles files correctly.
  - _Paths: API: `GET /{hash}` (Content-Type header based on extension)_
- [UI: N/A | API: ✅] **As a content consumer**, I would like ETag caching support so that repeated downloads are efficient.
  - _Paths: API: `GET /{hash}` (ETag header)_
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to force download instead of inline preview so that I can save files directly.
  - _Paths: UI: `/retrieve.html` (download parameter) | API: `GET /{hash}?download=true`_
- [UI: N/A | API: ✅] **As a content consumer**, I would like HEAD requests supported so that I can check content metadata without downloading.
  - _Paths: API: `HEAD /{hash}`_

### Rate Limiting
- [UI: ✅ | API: ✅] **As a content consumer**, I would like to see clear rate limit errors so that I know when content is temporarily unavailable.
  - _Paths: UI: `/retrieve.html`, `/info.html` (error display) | API: HTTP 429 with Retry-After_
- [UI: N/A | API: ✅] **As a content consumer**, I would like rate limits enforced fairly (lowest MTBR wins) so that I understand access restrictions.
  - _Paths: API: Rate limit enforcement in content handler_

---

## API Developers

### API Keys
- [UI: 📋 | API: ✅] **As a developer**, I would like to generate API keys so that I can access the platform programmatically.
  - _Paths: UI: `/dashboard/api-keys/create` (planned) | API: `POST /api/auth/apikeys`_
- [UI: 📋 | API: ✅] **As a developer**, I would like to create up to 25 API keys so that I can separate keys by application or environment.
  - _Paths: UI: `/dashboard/api-keys/` (planned) | API: `POST /api/auth/apikeys` (25 key limit enforced)_
- [UI: N/A | API: ✅] **As a developer**, I would like keys with format `hb_live_*` (production) or `hb_test_*` (development) so that I can distinguish environments.
  - _Paths: API: `POST /api/auth/apikeys` (key format based on environment)_
- [UI: N/A | API: ✅] **As a developer**, I would like keys to expire after a maximum of 5 years so that I'm forced to rotate credentials periodically.
  - _Paths: API: `POST /api/auth/apikeys` (max 5-year expiration enforced)_
- [UI: 📋 | API: ✅] **As a developer**, I would like to name my API keys so that I can identify their purpose.
  - _Paths: UI: `/dashboard/api-keys/create` (planned) | API: `POST /api/auth/apikeys` (name parameter)_
- [UI: 📋 | API: N/A] **As a developer**, I would like to see API keys only once at creation so that security is maintained.
  - _Paths: UI: `/dashboard/api-keys/create` (planned, one-time display)_
- [UI: 📋 | API: ✅] **As a developer**, I would like to list my API keys (without plaintext values) so that I can manage active credentials.
  - _Paths: UI: `/dashboard/api-keys/` (planned) | API: `GET /api/auth/apikeys`_
- [UI: 📋 | API: ✅] **As a developer**, I would like to revoke API keys so that I can disable compromised credentials.
  - _Paths: UI: `/dashboard/api-keys/:id` (planned) | API: `DELETE /api/auth/apikeys/:id`_
- [UI: N/A | API: ✅] **As a developer**, I would like keys stored as SHA-256 hashes so that plaintext keys are never exposed in storage.
  - _Paths: API: KeyRegistry DO, UserProfile DO (SHA-256 hashed storage)_
- [UI: 📋 | API: ✅] **As a developer**, I would like to see when keys were last used so that I can identify inactive keys.
  - _Paths: UI: `/dashboard/api-keys/` (planned) | API: `GET /api/auth/apikeys` (last_used_at field)_
- [UI: 📋 | API: ✅] **As a developer**, I would like to reveal an API key with fresh session authentication so that I can recover a key if needed.
  - _Paths: UI: `/dashboard/api-keys/:id` (planned) | API: `POST /api/auth/apikeys/:id/reveal`_

### Rate Limits
- [UI: N/A | API: ✅] **As a developer**, I would like 500 requests/minute per API key so that I can build automated tools.
  - _Paths: API: Rate limiting middleware (500 req/min per key)_
- [UI: N/A | API: ✅] **As a developer**, I would like rate limit headers in responses so that I can implement backoff strategies.
  - _Paths: API: All endpoints (X-RateLimit-* headers)_
- [UI: N/A | API: ✅] **As a developer**, I would like clear rate limit error codes so that my applications can handle limits gracefully.
  - _Paths: API: HTTP 429 with error details_

### API Usage
- [UI: N/A | API: ✅] **As a developer**, I would like to use API keys with `Authorization: ApiKey <key>` or `X-API-Key: <key>` headers so that I have flexible authentication options.
  - _Paths: API: Authentication middleware (both header formats supported)_
- [UI: N/A | API: ✅] **As a developer**, I would like comprehensive API documentation so that I can integrate quickly.
  - _Paths: UI: `/docs/api/` (planned) | API: `docs/API.md` (current)_
- [UI: N/A | API: ✅] **As a developer**, I would like consistent error response formats so that error handling is predictable.
  - _Paths: API: All endpoints (standardized error format)_
- [UI: N/A | API: 📋] **As a developer**, I would like webhooks for content events so that I can build reactive applications.
  - _Paths: API: Webhook system (planned)_
- [UI: N/A | API: 📋] **As a developer**, I would like bulk operations for multiple files so that I can upload/manage content efficiently.
  - _Paths: API: Bulk endpoints (planned)_

---

## Content Donors

### Donation System
- [UI: 📋 | API: ✅] **As a donor**, I would like to donate to specific content by hash so that I can support valuable files.
  - _Paths: UI: `/donate/{hash}` (planned) | API: `POST /api/donate/cid/:cid`_
- [UI: N/A | API: ✅] **As a donor**, I would like donations to extend content retention so that important files stay available longer.
  - _Paths: API: `POST /api/donate/cid/:cid` (extends expiration_timestamp)_
- [UI: N/A | API: ✅] **As a donor**, I would like to donate anonymously or with authentication so that I have privacy options.
  - _Paths: API: `POST /api/donate/cid/:cid` (optional authentication)_
- [UI: 📋 | API: ✅] **As a donor**, I would like to donate via Stripe Checkout so that payment is secure and supports multiple methods.
  - _Paths: UI: `/donate/{hash}` (planned) | API: `POST /api/donate/cid/:cid` returns Stripe URL_
- [UI: 📋 | API: ✅] **As a donor**, I would like to see how my donation extends retention so that I understand the impact.
  - _Paths: UI: `/donate/{hash}` (planned, shows extension calculation) | API: Donation calculator in handler_

---

## Content Contesters

### Contest Submission
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for copyrighted content so that I can protect my intellectual property.
  - _Paths: UI: `/contest/submit` (planned) | API: `POST /api/contest/submit` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for illegal content so that harmful material can be removed.
  - _Paths: UI: `/contest/submit` (planned) | API: `POST /api/contest/submit` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to submit a contest for abusive content so that policy violations are addressed.
  - _Paths: UI: `/contest/submit` (planned) | API: `POST /api/contest/submit` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to upload evidence documents so that my claim is properly supported.
  - _Paths: UI: `/contest/submit` (planned) | API: `POST /api/contest/:id/evidence` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like my evidence immediately visible to moderators and payers so that disputes can be resolved quickly.
  - _Paths: UI: `/admin/contests/:id`, `/contest/:id` (planned) | API: ContestRecord DO with evidence (planned)_

### Communication
- [UI: 📋 | API: 📋] **As a contester**, I would like to receive messages from content payers so that we can resolve disputes directly.
  - _Paths: UI: `/messages/` (planned) | API: `GET /api/messages/:threadId` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like email notifications for new messages so that I don't miss communications.
  - _Paths: UI: N/A | API: Email worker (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like message character and count limits so that conversations stay productive.
  - _Paths: UI: `/messages/:threadId` (planned) | API: Message validation (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to respond to payer messages so that I can provide clarifications or additional evidence.
  - _Paths: UI: `/messages/:threadId` (planned) | API: `POST /api/messages/:threadId` (planned)_

### Contest Resolution
- [UI: 📋 | API: 📋] **As a contester**, I would like automated checks on my contest so that obvious violations are handled quickly.
  - _Paths: UI: N/A | API: Contest validation rules (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like manual review for nuanced cases so that fair decisions are made.
  - _Paths: UI: `/admin/contests/:id` (planned) | API: Contest review workflow (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to see contest status updates so that I know the progress of my claim.
  - _Paths: UI: `/contest/:id` (planned) | API: `GET /api/contest/:id` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like to appeal decisions so that incorrect rulings can be challenged.
  - _Paths: UI: `/contest/:id/appeal` (planned) | API: `POST /api/contest/:id/appeal` (planned)_
- [UI: 📋 | API: 📋] **As a contester**, I would like DMCA-compliant 24-48 hour response times so that legal requirements are met.
  - _Paths: UI: N/A | API: SLA enforcement (planned)_

---

## Platform Administrators

### Content Moderation
- [UI: 📋 | API: 📋] **As an administrator**, I would like to review contest submissions so that I can make fair decisions.
  - _Paths: UI: `/admin/contests/` (planned) | API: `GET /api/admin/contests` (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to see all evidence immediately upon contest filing so that I can assess claims quickly.
  - _Paths: UI: `/admin/contests/:id` (planned) | API: `GET /api/admin/contests/:id` (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like automated rules to filter obvious violations so that I can focus on complex cases.
  - _Paths: UI: `/admin/moderation/` (planned) | API: Auto-moderation rules (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to view message threads between payers and contesters so that I understand dispute context.
  - _Paths: UI: `/admin/contests/:id/messages` (planned) | API: `GET /api/admin/messages/:threadId` (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to offer paid moderation services so that users can request official intervention.
  - _Paths: UI: `/admin/moderation/pricing` (planned) | API: Paid moderation endpoints (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to take down content with compelling evidence so that platform policies are enforced.
  - _Paths: UI: `/admin/contests/:id` (planned) | API: `POST /api/admin/contests/:id/resolve` (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to maintain public records of decisions so that operations are transparent.
  - _Paths: UI: `/public-records/contests/` (planned) | API: `GET /api/public/contests` (planned)_

### System Management
- [UI: N/A | API: ✅] **As an administrator**, I would like to monitor system health across all components so that I can ensure uptime.
  - _Paths: API: `GET /health`, monitoring endpoints_
- [UI: N/A | API: ✅] **As an administrator**, I would like to track financial metrics (revenue, costs, profit) so that the platform is sustainable.
  - _Paths: API: PaymentRecord DO aggregations, balance tracking_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to see aggregate platform statistics so that I can understand usage patterns.
  - _Paths: UI: `/admin/metrics/` (planned) | API: `GET /api/admin/stats` (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like alerts for unusual activity so that I can respond to issues proactively.
  - _Paths: UI: `/admin/` (planned) | API: Alerting system (planned)_
- [UI: 📋 | API: 📋] **As an administrator**, I would like to export data for transparency so that operations remain auditable.
  - _Paths: UI: `/admin/export/` (planned) | API: `GET /api/admin/export` (planned)_

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

**Document Version:** 2.3 (IN PROGRESS)
**Last Updated:** 2026-01-16
**Status:** Comprehensive list with UI/API status, site map, and URL paths

**Changes in v2.3:**
- Added **URL paths** to each user story showing implementation locations
  - UI paths: Pages where feature is accessible (e.g., `/dashboard.html`, `/upload.html`)
  - API paths: Endpoints that implement the feature (e.g., `GET /api/balance`, `POST /api/content`)
  - Format: `_Paths: UI: <path> | API: <endpoint>_` under each story
  - Indicates planned vs implemented paths
  - Completed for 112+ stories (Anonymous Users, Content Publishers, Content Consumers, API Developers, Content Donors, Content Contesters, Platform Administrators)
  - **System Operations section paths IN PROGRESS** (43 stories remaining)

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
