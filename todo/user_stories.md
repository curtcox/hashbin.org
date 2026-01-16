# HashBin.org User Stories

This document contains user stories for the HashBin.org platform, organized by user type and feature area. Stories marked with ✅ are complete, while those marked with 📋 are planned for future implementation.

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
- ✅ **As an anonymous visitor**, I would like to view the service information so that I can understand what HashBin.org offers.
- ✅ **As an anonymous visitor**, I would like to check the platform health status so that I can verify the service is operational.

### Content Access
- ✅ **As an anonymous user**, I would like to download content using its 256t hash so that I can retrieve files without authentication.
- ✅ **As an anonymous user**, I would like to see content metadata (size, upload date, expiration) so that I can verify the content before downloading.
- ✅ **As an anonymous user**, I would like to download content with a file extension hint so that my browser handles the file type correctly.
- ✅ **As an anonymous user**, I would like to resume interrupted downloads using HTTP Range requests so that I don't have to restart large downloads.
- ✅ **As an anonymous user**, I would like inline content (≤64 bytes) to be served directly from the hash so that small files load instantly without storage overhead.

### Rate Limiting
- ✅ **As an anonymous user**, I would like to check content rate limit status so that I know if I can download the content.
- 📋 **As an anonymous user**, I would like clear error messages when rate limited so that I understand when I can retry.

---

## Content Publishers

### Account Management
- ✅ **As a new user**, I would like to authenticate with Google, Apple, Microsoft, or GitHub so that I can create an account without managing passwords.
- ✅ **As a registered user**, I would like to link multiple OAuth providers to my account so that I can sign in using different services.
- ✅ **As a registered user**, I would like to view my current session information so that I can verify my authentication status.
- ✅ **As a registered user**, I would like to log out of my session so that I can secure my account when done.
- ✅ **As a registered user**, I would like to delete my account with 2FA confirmation so that I can remove my data when I no longer need the service.

### Balance and Payments
- ✅ **As a registered user**, I would like to view my current account balance so that I know how much credit I have available.
- ✅ **As a registered user**, I would like to view my transaction history so that I can track my spending and deposits.
- ✅ **As a registered user**, I would like to deposit funds using credit card, Apple Pay, Google Pay, or ACH so that I can pay for content storage.
- ✅ **As a registered user**, I would like to see the deposit amount processed via Stripe Checkout so that I can complete payments securely.
- ✅ **As a registered user**, I would like deposits confirmed via webhook so that my balance updates automatically after payment.
- ✅ **As a registered user**, I would like a minimum deposit of $1.00 so that payment processing fees are covered.

### Content Upload
- ✅ **As a content publisher**, I would like to upload files up to 5GB so that I can share my content with others.
- ✅ **As a content publisher**, I would like my files hashed using the 256t specification (SHA-512 for >64 bytes) so that content is permanently addressable.
- ✅ **As a content publisher**, I would like to select retention duration (minimum 30 days) so that I can control how long content is stored.
- ✅ **As a content publisher**, I would like to see the cost calculation ($0.03/GB/month) before upload so that I know the price before committing.
- ✅ **As a content publisher**, I would like my balance automatically deducted on successful upload so that payment is seamless.
- ✅ **As a content publisher**, I would like to drag and drop files for upload so that uploading is convenient.
- ✅ **As a content publisher**, I would like to see upload progress and be able to cancel so that I can manage long uploads.
- ✅ **As a content publisher**, I would like duplicate content detection so that I'm not charged twice for the same file.
- ✅ **As a content publisher**, I would like the option to extend retention on duplicate content so that I can keep it available longer.
- ✅ **As a content publisher**, I would like failed uploads to not charge my account so that I only pay for successful storage.
- ✅ **As a content publisher**, I would like inline content (≤64 bytes) to be free so that small files don't incur storage costs.

### Content Management
- ✅ **As a content publisher**, I would like to view my upload history so that I can track all content I've published.
- ✅ **As a content publisher**, I would like to extend retention before expiration so that I can keep content available longer.
- 📋 **As a content publisher**, I would like to see when my content will expire so that I can plan retention extensions.
- 📋 **As a content publisher**, I would like to view download statistics for my content so that I can understand usage patterns.

### Rate Limiting for Content
- ✅ **As a content publisher**, I would like to purchase bandwidth (MTBR rate limiting) for my content so that I can control access frequency.
- ✅ **As a content publisher**, I would like to see rate limit pricing based on file size and request frequency so that I can budget appropriately.
- ✅ **As a content publisher**, I would like rate limits to stack when purchasing multiple times so that I can incrementally increase capacity.
- ✅ **As a content publisher**, I would like a default 30-day MTBR (minimum time between requests) for 30 days so that my content has basic protection.
- ✅ **As a content publisher**, I would like inline content exempted from rate limits so that small files remain freely accessible.

---

## Content Consumers

### Content Discovery
- ✅ **As a content consumer**, I would like to retrieve content using only its 256t hash so that access is simple and direct.
- ✅ **As a content consumer**, I would like to view content information before downloading so that I can verify size and type.

### Content Download
- ✅ **As a content consumer**, I would like to download content for free so that I can access published files without payment.
- ✅ **As a content consumer**, I would like fast downloads via Cloudflare's CDN so that content loads quickly from anywhere.
- ✅ **As a content consumer**, I would like proper MIME types on downloads so that my browser handles files correctly.
- ✅ **As a content consumer**, I would like ETag caching support so that repeated downloads are efficient.
- ✅ **As a content consumer**, I would like to force download instead of inline preview so that I can save files directly.
- ✅ **As a content consumer**, I would like HEAD requests supported so that I can check content metadata without downloading.

### Rate Limiting
- ✅ **As a content consumer**, I would like to see clear rate limit errors so that I know when content is temporarily unavailable.
- ✅ **As a content consumer**, I would like rate limits enforced fairly (lowest MTBR wins) so that I understand access restrictions.

---

## API Developers

### API Keys
- ✅ **As a developer**, I would like to generate API keys so that I can access the platform programmatically.
- ✅ **As a developer**, I would like to create up to 25 API keys so that I can separate keys by application or environment.
- ✅ **As a developer**, I would like keys with format `hb_live_*` (production) or `hb_test_*` (development) so that I can distinguish environments.
- ✅ **As a developer**, I would like keys to expire after a maximum of 5 years so that I'm forced to rotate credentials periodically.
- ✅ **As a developer**, I would like to name my API keys so that I can identify their purpose.
- ✅ **As a developer**, I would like to see API keys only once at creation so that security is maintained.
- ✅ **As a developer**, I would like to list my API keys (without plaintext values) so that I can manage active credentials.
- ✅ **As a developer**, I would like to revoke API keys so that I can disable compromised credentials.
- ✅ **As a developer**, I would like keys stored as SHA-256 hashes so that plaintext keys are never exposed in storage.
- ✅ **As a developer**, I would like to track when keys were last used so that I can identify inactive keys.

### Rate Limits
- ✅ **As a developer**, I would like 500 requests/minute per API key so that I can build automated tools.
- ✅ **As a developer**, I would like rate limit headers in responses so that I can implement backoff strategies.
- ✅ **As a developer**, I would like clear rate limit error codes so that my applications can handle limits gracefully.

### API Usage
- ✅ **As a developer**, I would like to use API keys with `Authorization: ApiKey <key>` or `X-API-Key: <key>` headers so that I have flexible authentication options.
- ✅ **As a developer**, I would like comprehensive API documentation so that I can integrate quickly.
- ✅ **As a developer**, I would like consistent error response formats so that error handling is predictable.
- 📋 **As a developer**, I would like webhooks for content events so that I can build reactive applications.
- 📋 **As a developer**, I would like bulk operations for multiple files so that I can upload/manage content efficiently.

---

## Content Donors

### Donation System
- ✅ **As a donor**, I would like to donate to specific content by hash so that I can support valuable files.
- ✅ **As a donor**, I would like donations to extend content retention so that important files stay available longer.
- ✅ **As a donor**, I would like to donate anonymously or with authentication so that I have privacy options.
- ✅ **As a donor**, I would like to donate via Stripe Checkout so that payment is secure and supports multiple methods.
- ✅ **As a donor**, I would like to see how my donation extends retention so that I understand the impact.

---

## Content Contesters

### Contest Submission
- 📋 **As a contester**, I would like to submit a contest for copyrighted content so that I can protect my intellectual property.
- 📋 **As a contester**, I would like to submit a contest for illegal content so that harmful material can be removed.
- 📋 **As a contester**, I would like to submit a contest for abusive content so that policy violations are addressed.
- 📋 **As a contester**, I would like to upload evidence documents so that my claim is properly supported.
- 📋 **As a contester**, I would like my evidence immediately visible to moderators and payers so that disputes can be resolved quickly.

### Communication
- 📋 **As a contester**, I would like to receive messages from content payers so that we can resolve disputes directly.
- 📋 **As a contester**, I would like email notifications for new messages so that I don't miss communications.
- 📋 **As a contester**, I would like message character and count limits so that conversations stay productive.
- 📋 **As a contester**, I would like to respond to payer messages so that I can provide clarifications or additional evidence.

### Contest Resolution
- 📋 **As a contester**, I would like automated checks on my contest so that obvious violations are handled quickly.
- 📋 **As a contester**, I would like manual review for nuanced cases so that fair decisions are made.
- 📋 **As a contester**, I would like to see contest status updates so that I know the progress of my claim.
- 📋 **As a contester**, I would like to appeal decisions so that incorrect rulings can be challenged.
- 📋 **As a contester**, I would like DMCA-compliant 24-48 hour response times so that legal requirements are met.

---

## Platform Administrators

### Content Moderation
- 📋 **As an administrator**, I would like to review contest submissions so that I can make fair decisions.
- 📋 **As an administrator**, I would like to see all evidence immediately upon contest filing so that I can assess claims quickly.
- 📋 **As an administrator**, I would like automated rules to filter obvious violations so that I can focus on complex cases.
- 📋 **As an administrator**, I would like to view message threads between payers and contesters so that I understand dispute context.
- 📋 **As an administrator**, I would like to offer paid moderation services so that users can request official intervention.
- 📋 **As an administrator**, I would like to take down content with compelling evidence so that platform policies are enforced.
- 📋 **As an administrator**, I would like to maintain public records of decisions so that operations are transparent.

### System Management
- ✅ **As an administrator**, I would like to monitor system health across all components so that I can ensure uptime.
- ✅ **As an administrator**, I would like to track financial metrics (revenue, costs, profit) so that the platform is sustainable.
- 📋 **As an administrator**, I would like to see aggregate platform statistics so that I can understand usage patterns.
- 📋 **As an administrator**, I would like alerts for unusual activity so that I can respond to issues proactively.
- 📋 **As an administrator**, I would like to export data for transparency so that operations remain auditable.

---

## System Operations

### Infrastructure
- ✅ **As the system**, I would like to store content in Cloudflare R2 so that files are durable and globally accessible.
- ✅ **As the system**, I would like to store metadata in Durable Objects so that data is consistent and transactional.
- ✅ **As the system**, I would like to run on Cloudflare Workers so that requests are fast at the edge.
- ✅ **As the system**, I would like to deploy via GitHub Actions so that deployments are automated and reliable.
- ✅ **As the system**, I would like environment-specific configurations so that development and production are isolated.

### Authentication & Security
- ✅ **As the system**, I would like to validate Clerk JWT tokens so that user sessions are secure.
- ✅ **As the system**, I would like to hash API keys with SHA-256 so that credentials are protected at rest.
- ✅ **As the system**, I would like to enforce rate limits per user, key, and IP so that abuse is prevented.
- ✅ **As the system**, I would like to require 2FA for account deletion so that destructive actions are protected.
- ✅ **As the system**, I would like to soft-delete accounts so that audit trails are maintained.

### Content Lifecycle
- ✅ **As the system**, I would like to generate 256t hashes deterministically so that content addressing is reliable.
- ✅ **As the system**, I would like to store inline content (≤64 bytes) in the hash itself so that small files are efficient.
- ✅ **As the system**, I would like to detect duplicate uploads so that storage is optimized.
- ✅ **As the system**, I would like to track content expiration timestamps so that retention is enforced.
- 📋 **As the system**, I would like to run scheduled expiration jobs so that expired content is automatically removed.
- 📋 **As the system**, I would like to delete content immediately on expiration so that storage costs are minimized.
- 📋 **As the system**, I would like to maintain public deletion records so that operations are transparent.

### Payment Processing
- ✅ **As the system**, I would like to integrate with Stripe for payments so that multiple payment methods are supported.
- ✅ **As the system**, I would like to verify webhook signatures so that payment confirmations are authentic.
- ✅ **As the system**, I would like to update balances atomically so that financial operations are consistent.
- ✅ **As the system**, I would like to track all transactions so that financial records are complete.
- ✅ **As the system**, I would like to enforce minimum payments ($1.00) so that processing fees are covered.
- ✅ **As the system**, I would like to calculate pricing as Size × Duration × $0.03 so that costs are transparent.

### Rate Limiting System
- ✅ **As the system**, I would like to enforce MTBR (minimum time between requests) so that content access is controlled.
- ✅ **As the system**, I would like to allow rate limit stacking so that publishers can incrementally increase capacity.
- ✅ **As the system**, I would like to exempt inline content from rate limits so that small files remain freely accessible.
- ✅ **As the system**, I would like to return rate limit status in API responses so that clients can handle limits appropriately.
- ✅ **As the system**, I would like to price rate limits as Size × Max Requests × Rate Per Byte so that costs scale fairly.

### Monitoring & Observability
- ✅ **As the system**, I would like to log authentication failures so that security issues can be investigated.
- ✅ **As the system**, I would like to track API key last-used timestamps so that inactive keys can be identified.
- ✅ **As the system**, I would like to expose health check endpoints so that monitoring systems can verify status.
- 📋 **As the system**, I would like to emit metrics for all operations so that performance can be analyzed.
- 📋 **As the system**, I would like to alert on anomalies so that issues can be addressed promptly.

### Transparency & Records
- 📋 **As the system**, I would like to publish content metadata publicly so that operations are transparent.
- 📋 **As the system**, I would like to publish contest records publicly so that decisions are accountable.
- 📋 **As the system**, I would like to publish deletion records publicly so that content lifecycle is visible.
- 📋 **As the system**, I would like to provide aggregate statistics so that platform health is observable.
- 📋 **As the system**, I would like to support data export so that records can be archived and audited.

### Future Enhancements
- 📋 **As the system**, I would like to support multipart uploads for files >5GB so that larger content can be stored.
- 📋 **As the system**, I would like to implement backup and disaster recovery so that data is protected.
- 📋 **As the system**, I would like to support content verification checksums so that integrity can be validated.
- 📋 **As the system**, I would like to implement edge caching strategies so that popular content loads faster.
- 📋 **As the system**, I would like to support bulk operations so that API efficiency is improved.

---

## Summary Statistics

### Completed Stories: ✅ 103
- Anonymous Users: 7
- Content Publishers: 30
- Content Consumers: 8
- API Developers: 14
- Content Donors: 5
- Content Contesters: 0
- Platform Administrators: 2
- System Operations: 37

### Planned Stories: 📋  45
- Anonymous Users: 1
- Content Publishers: 2
- Content Consumers: 0
- API Developers: 2
- Content Donors: 0
- Content Contesters: 14
- Platform Administrators: 9
- System Operations: 17

### Total User Stories: 148

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

**Document Version:** 1.0
**Last Updated:** 2026-01-16
**Status:** Comprehensive list covering all planned features
