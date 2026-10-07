# HashBin.org Master Implementation Plan

> **Current status lives in [`STATUS.md`](../STATUS.md).** This document covers vision,
> architecture, and decisions. Phase status below was last synced with STATUS.md on 2026-10-07.

## Project Overview

HashBin.org is a content distribution platform using 256t hash-based content addressing. Users can publish content that others can retrieve using cryptographic hashes. The system operates on a pay-to-publish, free-to-download model with time-based retention and a content contestation mechanism.

### Core Value Proposition
- **Permanent, verifiable content addressing** using 256t specification
- **Free public access** to all published content
- **Transparent operation** with public records and open source
- **Fair contestation process** for copyright disputes
- **Pay-per-retention model** ensures sustainability

## Technical Foundation

### 256t Specification Summary
- **Identifier format:** 8-char length prefix + 86-char hash/content
- **Hash algorithm:** SHA-512 encoded in Base64URL (RFC 4648)
- **Content ≤ 64 bytes:** Direct Base64URL encoding (no hash)
- **Content > 64 bytes:** SHA-512 hash in Base64URL
- **Total identifier length:** Maximum 94 characters (URL-safe)
- **Immutability:** Content-addressed storage ensures integrity

### Infrastructure Stack
- **Hosting:** Cloudflare (CDN, DDoS protection, edge computing)
- **Storage:** Cloudflare R2 (S3-compatible object storage)
- **Database:** Cloudflare Durable Objects (distributed, edge-optimized, transactional)
- **Deployment:** GitHub Actions (CI/CD pipeline)
- **Repository:** Public source code in github.com/curtcox/hashbin.org
- **Domain:** hashbin.org

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (Web UI)                    │
│  - Content upload interface                                  │
│  - Content retrieval/search                                  │
│  - Payment processing                                        │
│  - Contest submission                                        │
│  - Public records viewer                                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                    API Layer (Cloudflare Workers)            │
│  - Authentication & Authorization                            │
│  - Content upload/download                                   │
│  - Payment processing                                        │
│  - Contest management                                        │
│  - Retention management                                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬─────────────┐
      │            │            │             │
┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐ ┌────▼──────┐
│ R2 Storage│ │ Durable│ │ Payment  │ │  Public   │
│  (Content)│ │ Objects│ │Gateway(s)│ │  Records  │
└───────────┘ └────────┘ └──────────┘ └───────────┘
```

### Data Models

#### Content Record
- `hash_256t`: string (94 chars max) - Primary key
- `size_bytes`: integer
- `upload_timestamp`: datetime
- `expiration_timestamp`: datetime
- `uploader_id`: string (anonymized or user ID)
- `retention_payments`: array of payment records
- `contested`: boolean
- `contest_records`: array of contest IDs
- `status`: enum (active, contested, deleted)

#### Payment Record
- `payment_id`: uuid
- `payer_id`: string
- `hash_256t`: string (null for upload, set for retention extension)
- `amount`: decimal
- `currency`: string
- `timestamp`: datetime
- `retention_time_purchased`: duration
- `payment_provider`: string
- `transaction_reference`: string

#### Contest Record
- `contest_id`: uuid
- `hash_256t`: string
- `submitter_id`: string
- `submission_timestamp`: datetime
- `claim_type`: enum (copyright, illegal, abuse)
- `evidence`: text/documents
- `status`: enum (pending, under_review, upheld, denied)
- `resolution_timestamp`: datetime
- `resolution_notes`: text
- `public`: boolean (anonymize if needed)

#### User Record
- `user_id`: uuid
- `auth_providers`: array of auth provider IDs
- `email`: string (optional)
- `registration_timestamp`: datetime
- `payment_history`: array of payment IDs
- `upload_history`: array of hash_256t
- `contest_history`: array of contest IDs

## Implementation Phases

### Phase 1: Foundation & Infrastructure ✅ COMPLETE
**Goal:** Set up core infrastructure and development pipeline
**Status:** Complete - January 2026

**Deliverables:**
- ✅ Cloudflare account and domain configuration
- ✅ R2 bucket creation and configuration
- ✅ Durable Objects setup and configuration
- ⏳ **Backup and disaster recovery** (not yet implemented — STATUS.md L10):
  - Event sourcing: Log all state changes to R2
  - Daily snapshots: Full Durable Objects state to R2
  - Multi-region replication evaluation
- ✅ GitHub Actions CI/CD pipeline
- ✅ Development and production environments (staging optional)
- ✅ Basic monitoring and logging
- ✅ Cost tracking and alerting

**Sub-Plans:**
- `done/site_creation.md` - Infrastructure setup and deployment (COMPLETE)

**Technologies:**
- Cloudflare Workers (API layer)
- Cloudflare R2 (content storage and backups)
- Cloudflare Durable Objects (metadata storage)
- GitHub Actions (deployment)
- Cloudflare Pages (frontend hosting)

### Phase 2: Core Content Operations ✅ COMPLETE
**Goal:** Implement basic upload and download functionality
**Status:** Complete. Upload limit is 90 MB (STATUS.md L9); larger uploads are backlog B6

**Deliverables:**
- 256t hash generation and validation library (JavaScript)
- Content upload API endpoint (Workers)
- Content download API endpoint (Workers)
- R2 storage integration (S3-compatible API)
- Content metadata storage in Durable Objects
- Hash verification on upload
- Content integrity checking
- Basic error handling and validation
- Maximum file size: 90 MB (Workers request limit; multipart is backlog B6)

**Sub-Plans:**
- `done/upload.md` - Upload implementation with 256t hash generation ✅
- `done/download.md` - Download implementation ✅
- `done/download_extended.md` - Info page and contested content (451) handling ✅

**No search/discovery features** - Hash-only access as per architectural decision #12

### Phase 3: Authentication & Authorization ✅ COMPLETE
**Goal:** Implement secure user authentication with multiple providers
**Status:** Complete - January 2026

**Deliverables:**
- ✅ **Clerk integration** for unified OAuth (see Decision #17)
  - Google
  - Apple
  - Microsoft
  - GitHub
- ✅ Clerk JavaScript SDK in frontend
- ✅ Clerk API integration in Cloudflare Workers
- ✅ Session management (handled by Clerk)
- ✅ JWT token generation and validation (handled by Clerk)
- ✅ API key generation for programmatic access
- ✅ User profile storage in Durable Objects (sync from Clerk)
- ✅ Rate limiting (100/min anonymous, 1000/min user, 500/min per-key)

**Sub-Plans:**
- `done/user_authorization.md` - Multi-provider authentication system (COMPLETE)
- `done/api_keys.md` - API key management system (COMPLETE)

**Technologies:**
- Clerk (authentication provider)
- Cloudflare Workers (API integration)
- Durable Objects (user profile storage)

**Note:** No email/password auth - OAuth only for security and simplicity

### Phase 4: Payment System ✅ COMPLETE
**Goal:** Integrate payment processing for uploads and retention
**Status:** Complete - January 2026

**Deliverables:**
- ✅ **Stripe integration** (see Decisions #16, #18)
  - Credit/debit cards
  - Apple Pay, Google Pay
  - ACH transfers
  - Cryptocurrency support (via Stripe Crypto partners)
- ✅ **Pricing implementation:** `Cost = Size (GB) × Duration (months) × $0.03`
  - $1.00 minimum payment
  - Display payment processing fees separately when possible
  - Show breakdown: Storage cost + Processing fee = Total
- ✅ Stripe Checkout for payment flow
- ✅ Stripe Webhooks for payment confirmation
- ✅ Receipt generation and email delivery
- ✅ Payment history storage and accounting in Durable Objects
- ✅ Financial analytics (revenue, costs, profit/loss)
- ✅ **No refunds** - All payments final (see Decision #13)

**Sub-Plans:**
- `done/payments.md` - Stripe payment integration (COMPLETE)

**Technologies:**
- Stripe (payment processor)
- Stripe Checkout (payment UI)
- Cloudflare Workers (webhook handlers)
- Durable Objects (payment records)

### Phase 5: Retention & Expiration Management ✅ COMPLETE
**Goal:** Automate content lifecycle management
**Status:** Complete. Follow-up: R2 cleanup of soft-deleted content (STATUS.md S1)

**Deliverables:**
- ✅ Retention extension API endpoint
- ✅ Retention payment tracking
- ✅ Scheduled job for expiration checks (Cloudflare Cron Triggers)
- ✅ Content deletion process (R2 + Durable Objects cleanup)
- ✅ Public deletion records
- **No grace period** - Immediate deletion when job runs (see Decision #8)
- **No expiration notifications** - Users responsible for tracking

**Sub-Plans:**
- `done/content_lifecycle.md` - Planning and foundation ✅
- `done/content_lifecycle_complete.md` - Cron jobs, deletion, public records ✅

**Implementation:** Use Cloudflare Workers Cron Triggers (runs daily at 2 AM UTC)

### Phase 6: Contestation System 🚧 IN PROGRESS
**Goal:** Implement transparent content dispute resolution
**Status:** Dispute/deletion backend and admin API done. Public reporting UI is a launch blocker (STATUS.md L8). Messaging, appeals, and tiered review are backlog (B1, B2)

**Deliverables:**
- Contest submission form and API
- **Hybrid review workflow** (see Decision #5):
  - Automated checks (hash matching, file type validation)
  - Manual review for copyright claims
- Evidence upload and storage (R2)
- **Evidence-based removal** (see Decision #20):
  - Contesters provide compelling evidence
  - **Evidence immediately visible** to moderators and payers upon filing
  - Removal only when evidence is sufficiently compelling
- Status tracking and notifications
- Content takedown process (R2 deletion + metadata update)
- Appeals process
- Public contest record publication
- **Built-in messaging system** (see Decision #19):
  - Message threads tied to contest records
  - Payers can contact contesters
  - Messages stored in Durable Objects
  - Messaging UI in user dashboard
  - **Email notifications** for new messages
  - **Message limits** (character count, message count)
  - **Admin moderation service** where users pay for admin review/moderation of message threads
- DMCA compliance (24-48 hour response time)

**Sub-Plans:**
- `todo/content_dispute_resolution.md` - Tiered escalation workflow (backlog)
- `todo/content_moderation.md` - Review and moderation tools, messaging limits, admin pricing

**Technologies:**
- Cloudflare Workers (contest API, email notifications)
- Durable Objects (contest records, messages)
- R2 (evidence storage)

### Phase 7: Public Records & Transparency 🚧 PARTIAL
**Goal:** Provide public visibility into system operations
**Status:** Public deletion records API and `/public-records.html` done; public dispute list ships with L8

**Deliverables:**
- Public records database/API
- Contest history viewer
- Deletion history viewer
- System statistics dashboard
- API for data access
- Data export functionality
- Archive/historical records

**Sub-Plans:**
- (no separate plan; see `done/content_lifecycle_complete.md` and `todo/content_moderation.md`)

### Phase 8: Frontend Development ✅ COMPLETE
**Goal:** Create user-friendly web interface

**Deliverables:**
- **Plain HTML/CSS/JavaScript** implementation (see Decision #11)
- Responsive web design
- Upload interface with drag-and-drop
- Content retrieval interface (hash input only)
- Payment flow integration
- User dashboard (uploads, payments, contests)
- Public records viewer
- Documentation and help system
- API documentation
- **No search/discovery UI** (hash-only access)
- **No analytics tracking** (financial only)

**Sub-Plans:**
- `done/frontend_ui.md` - Web interface implementation ✅
- `docs/API.md`, `frontend/docs/` - API documentation ✅

**Technologies:**
- Vanilla JavaScript (ES6+)
- CSS Grid/Flexbox
- Web Components (if needed)
- Cloudflare Pages (hosting)

### Phase 9: Testing & Quality Assurance 🚧 PARTIAL
**Goal:** Ensure system reliability and security
**Status:** Unit, local API, and Playwright E2E suites exist and run in CI. Load testing and an external security audit have not been done

**Deliverables:**
- Unit test suite
- Integration tests
- End-to-end tests
- Load testing and performance optimization
- Security audit and penetration testing
- Accessibility compliance
- Browser compatibility testing

**Sub-Plans:**
- `done/add_missing_tests_to_ci.md`, `done/local_API_tests.md` ✅
- Security audit plan: not yet written

### Phase 10: Legal & Compliance ⬜ NOT STARTED
**Goal:** Ensure legal compliance and protect all parties
**Status:** Launch blockers STATUS.md L5 (Terms), L6 (Privacy), L7 (DMCA agent)

**Deliverables:**
- Terms of Service
- Privacy Policy
- DMCA compliance process
- Data retention policies
- User rights and responsibilities
- Liability limitations
- Jurisdiction and governing law
- Cookie policy
- GDPR compliance (if applicable)

**Sub-Plans:**
- Tracked in STATUS.md (L5–L7); no separate plan yet

### Phase 11: Launch & Operations 🚧 IN PROGRESS
**Goal:** Production launch and ongoing maintenance
**Status:** Deployed to production; launch blockers tracked in STATUS.md

**Deliverables:**
- Production deployment
- Monitoring and alerting setup
- Backup and disaster recovery
- Incident response plan
- User support system
- Performance monitoring
- Cost monitoring and optimization
- Documentation for operators

**Sub-Plans:**
- `todo/clerk_remaining.md`, `todo/deployment_checklist.md`, `todo/manual_testing_guide.md`
- `done/system_management.md` - Admin stats, alerts, audit log ✅

## Architectural Decisions

The following key decisions have been made to guide implementation:

### 1. Database: Cloudflare Durable Objects
**Decision:** Use Cloudflare Durable Objects for metadata storage.

**Rationale:**
- Distributed, edge-optimized storage
- Strong consistency and transactional support
- Native integration with Cloudflare Workers
- Global distribution for low latency
- Ideal for coordinating state (payment processing, expiration tracking)

**Implementation notes:**
- Each content hash can have its own Durable Object instance
- Payment processing requires transactional guarantees
- Schema migrations need careful planning

---

### 2. Pricing Model: Size × Duration × Constant
**Decision:** Pricing formula: `Cost = Size (GB) × Duration (months) × Constant`

**Rationale:**
- Simple, transparent calculation
- Fair pricing based on actual resource usage
- Easy for users to estimate costs
- Scales linearly with storage needs

**Open sub-question:** What should the constant multiplier be?
- R2 storage cost: $0.015/GB/month
- Need to add operational overhead, payment processing fees, profit margin
- Suggested range: $0.02-$0.05/GB/month (33%-233% markup)

---

### 3. Authentication: Multi-Provider OAuth
**Decision:** Support Google, Apple, Microsoft, and GitHub via a unified auth provider service.

**Rationale:**
- Broad user coverage across platforms
- Avoid implementing custom password management
- Security handled by trusted providers
- Single integration point for multiple providers

**Implementation approach:**
- Use an authentication service (Auth0, Clerk, WorkOS, or similar)
- Provides unified API for all OAuth providers
- Handles session management and JWT tokens
- Add API key generation for programmatic access

**Open sub-question:** Which unified auth provider should we use?

---

### 4. Payment Processing: Multi-Method via Provider
**Decision:** Support multiple payment methods through a provider that aggregates payment options.

**Rationale:**
- Maximize user accessibility
- Single integration for multiple payment types
- Provider handles compliance and fraud detection
- Reduce implementation complexity

**Payment methods to support:**
- Credit/debit cards
- Apple Pay, Google Pay
- ACH/bank transfers
- Cryptocurrency (if supported by provider)

**Implementation approach:**
- Stripe (supports cards, wallets, ACH, crypto via Stripe Crypto)
- Alternative: PayPal for additional coverage
- Webhook handling for async payment confirmation

**Open sub-question:** Should we prioritize Stripe, or integrate multiple providers?

---

### 5. Content Contestation: Hybrid Approach
**Decision:** Combine automated checks with manual review for content disputes.

**Rationale:**
- Automated filtering catches obvious violations quickly
- Manual review handles nuanced cases fairly
- Balances response time with accuracy
- Meets DMCA requirements (typically 24-48 hour response)

**Implementation approach:**
1. **Automated checks:**
   - File hash matching against known databases (e.g., PhotoDNA for CSAM)
   - File type validation
   - Size and metadata checks

2. **Manual review:**
   - Human moderators for copyright claims
   - Evidence evaluation and decision making
   - Appeals process

3. **Workflow:**
   - Contest submitted → Automated screening → Manual review (if needed) → Resolution

---

### 6. User Anonymity: Minimal Public Information
**Decision:** Do not publish personal user information publicly, except where needed for contestation.

**Rationale:**
- Protect user privacy
- Reduce harassment and abuse vectors
- Comply with privacy regulations (GDPR, CCPA)
- Maintain transparency without exposing individuals

**Public information:**
- Content: hash, size, upload date, expiration date, contest status
- Contests: hash, claim type, submission date, resolution, reasoning
- NO public user identifiers, emails, or auth provider details

**Exception:** Users who paid for content can access contact information for contesters to enable communication and resolution.

**Open sub-question:** What does "anonymity: none" mean - fully public usernames, or pseudonymous IDs?

---

### 7. Content Limits: 256TB Maximum (R2 Limited for MVP)
**Decision:** Theoretical maximum of 256TB per file (256t specification limit). Practical limit follows R2 constraints.

**Rationale:**
- 256t supports up to 256 terabytes (2^48 bytes)
- R2 maximum object size: 5TB
- Start with R2 limits for MVP, support multipart for larger files later

**Implementation approach:**
- Phase 1 (MVP): Single object upload, max 5TB
- Phase 2: Multipart upload support for files up to 256TB
- No file type restrictions (content-agnostic platform)
- Rate limiting via R2's built-in request limiting

**No restrictions on:**
- File types (allow all)
- Content categories (handled via contestation)
- Per-user storage quotas (pay-per-use model)

---

### 8. Grace Period: None
**Decision:** Content is deleted as soon as the expiration processing job identifies it as expired.

**Rationale:**
- Simple, transparent behavior
- Reduces storage costs
- Users can extend retention before expiration
- Clear expectation: pay for what you need

**Implementation:**
- Scheduled job runs periodically (hourly or daily)
- Identifies expired content
- Deletes from R2 and updates metadata
- Public record of deletion is maintained

**Note:** No soft-delete or recovery mechanism. Deletion is permanent.

---

### 9. Public Records: Full Content Metadata, Minimal User Data
**Decision:** Publish comprehensive records about content and contests, with minimal user information.

**Information included:**
- **Per content item:**
  - 256t hash
  - Size in bytes
  - Upload timestamp
  - Expiration timestamp
  - Current status (active, contested, deleted)
  - Contest history (if any)

- **Per contest:**
  - Content hash
  - Claim type (copyright, illegal content, abuse)
  - Submission timestamp
  - Resolution (upheld, denied, pending)
  - Resolution reasoning (without personal details)

- **Per deletion:**
  - Content hash
  - Deletion timestamp
  - Reason (expired, contested and upheld)

- **Aggregate statistics:**
  - Total content count
  - Total storage usage
  - Contest filing rate
  - Average resolution time

**NOT included:**
- Uploader identification (fully anonymous)
- Contester identification (except to payers - see below)
- User emails or auth provider details
- Payment amounts or transaction details

**Exception for payers:** Users who have paid for a specific piece of content can access contester contact information for that content only.

---

### 10. API Rate Limiting: Deferred to R2
**Decision:** Rely on Cloudflare R2's built-in rate limiting rather than implementing custom limits.

**Rationale:**
- R2 handles request throttling automatically
- Cloudflare Workers have built-in DDoS protection
- Reduces implementation complexity
- Can add custom limits later if needed

**Implementation:**
- Downloads: Open access, R2-limited
- Uploads: Authenticated users only, payment required
- Metadata queries: Open access via Workers
- Can add Cloudflare Rate Limiting rules if abuse occurs

---

### 11. Frontend: Plain HTML/CSS/JavaScript
**Decision:** Build frontend using vanilla JavaScript without frameworks.

**Rationale:**
- Zero build step required
- Minimal dependencies and maintenance
- Fast page loads (no framework overhead)
- Simple deployment to Cloudflare Pages
- Easy for contributors to understand

**Implementation approach:**
- Modern ES6+ JavaScript
- Web Components for reusability (if needed)
- CSS Grid/Flexbox for layout
- Progressive enhancement
- Static site deployed to Cloudflare Pages

---

### 12. Search/Discovery: Hash-Only Access
**Decision:** No search or content discovery features. Access is exclusively via 256t hash.

**Rationale:**
- Aligns with 256t philosophy (content-addressed storage)
- Reduces privacy concerns
- Simpler implementation
- Discourages piracy discovery
- Users share hashes out-of-band

**Implementation:**
- Single retrieval endpoint: `GET /{hash}`
- No browse, search, or recommendation features
- Public records can be downloaded in bulk (for transparency)
- Third parties can build indexes if desired

---

### 13. Refund Policy: No Refunds
**Decision:** All payments are final. No refunds for any reason.

**Rationale:**
- Payment processor fees are non-refundable
- Simplifies financial operations
- Content delivery is immediate
- Users can verify costs before payment
- Prevents abuse (upload, download, refund cycle)

**Exceptions (potential):**
- Technical failures on our end (case-by-case)
- Fraudulent payments (chargebacks handled per provider policy)

**Clear communication:** Terms of Service must clearly state no-refund policy.

---

### 14. Analytics: Financial Tracking Only
**Decision:** Track only financial metrics. No user behavior analytics or tracking.

**Rationale:**
- Privacy-first approach
- Minimal data collection
- GDPR/CCPA compliance by design
- Focus on sustainability metrics

**Metrics to track:**
- Payment volume (total revenue)
- Payment breakdown by method/provider
- Storage costs (R2 usage)
- Operational costs
- Profit/loss

**NOT tracked:**
- Individual user behavior
- Download counts per content
- Geographic distribution
- Referrer information
- Session data

**Implementation:** Simple accounting database, no third-party analytics services.

---

### 15. Backup and Disaster Recovery: Combination Approach
**Decision:** Use a combination of backup strategies for Durable Objects.

**Rationale:**
- Multiple layers of protection for critical metadata
- Balance between cost, complexity, and reliability
- R2 provides 11-nines durability for content
- Durable Objects need explicit backup for metadata

**Implementation approach:**
1. **Event sourcing:** Log all state changes to R2 for point-in-time recovery
2. **Periodic snapshots:** Daily full snapshots of all Durable Objects state to R2
3. **Multi-region consideration:** Evaluate Durable Objects jurisdictional features for replication

**Recovery capabilities:**
- RPO (Recovery Point Objective): 1 hour or less (via event log)
- RTO (Recovery Time Objective): 1-4 hours (replay events or restore snapshot)
- Cost: Minimal (R2 storage for logs and snapshots)

---

### 16. Pricing Structure: $0.03/GB/month with $1.00 Minimum
**Decision:** Pricing constant of $0.03/GB/month (100% markup over R2 costs) with $1.00 minimum payment.

**Formula:** `Cost = Size (GB) × Duration (months) × $0.03`

**Rationale:**
- 100% markup is standard for cloud services
- Covers R2 costs ($0.015/GB/month) plus operational overhead
- Accounts for Durable Objects, Workers, payment fees, moderation costs
- $1.00 minimum covers payment processing fees (typically 2.9% + $0.30)

**Example pricing:**
- 1GB for 1 year: $0.36 → **$1.00 minimum**
- 10GB for 1 year: $3.60
- 100GB for 1 month: $3.00
- 1GB for 1 month: $0.03 → **$1.00 minimum**

**Payment transparency:**
- Display payment processing fees separately when possible
- Show: Storage cost + Processing fee = Total
- Example: $3.00 storage + $0.30 fee = $3.30 total (when itemization supported by provider)

**Edge cases:**
- Retention extensions: Add to existing expiration, no minimum on extensions
- Very small files: Still subject to $1.00 minimum for initial upload

---

### 17. Authentication Provider: Clerk
**Decision:** Use Clerk for unified OAuth authentication.

**Rationale:**
- Excellent Cloudflare Workers integration
- Modern developer experience (very low complexity)
- Supports all required providers (Google, Apple, Microsoft, GitHub)
- Competitive pricing (Free tier → $25+/month)
- Good documentation and community support
- Built-in session management and JWT handling

**Implementation:**
- Clerk JavaScript SDK in frontend
- Clerk API integration in Cloudflare Workers
- OAuth providers: Google, Apple, Microsoft, GitHub
- API key generation for programmatic access
- User profile storage in Durable Objects

**Free tier limits:**
- 10,000 monthly active users
- All authentication features
- Sufficient for launch and early growth

---

### 18. Payment Provider: Stripe Only
**Decision:** Start with Stripe as the sole payment provider.

**Rationale:**
- Single integration reduces complexity
- Supports all required payment methods:
  - Credit/debit cards
  - Apple Pay, Google Pay
  - ACH transfers
  - Cryptocurrency (via Stripe Crypto partner integrations)
- Fast to implement for MVP
- Proven reliability and fraud detection
- Excellent API and documentation
- Can add other providers later based on user demand

**Implementation:**
- Stripe Checkout for payment flow
- Stripe Webhooks for payment confirmation
- Stripe Dashboard for financial reporting
- Display payment processing fees transparently in UI

**Future expansion:**
- Phase 4.5 (optional): Add PayPal if user demand warrants
- Phase 5+ (optional): Add crypto-native providers if needed

---

### 19. Contester Contact: Built-in Messaging System
**Decision:** Implement a built-in platform messaging system for payers to contact contesters.

**Rationale:**
- Protects privacy of both parties
- Prevents harassment via direct email exposure
- Maintains records of communications for dispute resolution
- Integrated with existing authentication and user system
- Better user experience than external email

**Implementation:**
- Message threads tied to specific contest records
- Only payers (users who paid for content) can initiate contact
- Contesters receive notifications of messages
- Messages stored in Durable Objects
- Basic messaging UI in user dashboard
- **Email notifications:** Users receive email when new messages arrive (without revealing addresses)
- **Message limits:** Character and message count limits to prevent abuse (specific limits TBD in Phase 6)
- **Admin moderation service:** Users can pay for admins to moderate/review message threads
  - Helps resolve disputes faster with official intervention
  - Pricing and specific service scope TBD in Phase 6

**Access control:**
- Payers can message contesters about their paid content
- Contesters can respond to payers
- Platform admins can view messages for moderation
- Messages are NOT public (part of contest resolution process)

---

### 20. Contest Resolution: Evidence-Based Removal
**Decision:** Content removal requires compelling evidence supplied by contester, which is visible to affected parties immediately upon filing.

**Rationale:**
- Balances copyright protection with false claim prevention
- Transparency in dispute resolution
- Allows payers to understand and potentially challenge removals
- Immediate visibility enables faster resolution
- Defers detailed resolution procedures until operational experience is gained

**Implementation:**
- Contesters must provide:
  - Claim type (copyright, illegal content, abuse)
  - Evidence (documents, links, explanations)
  - Contact information (for messaging system)
- **Evidence visibility:** Immediately available upon contest filing to:
  - Platform moderators (for review)
  - Payers who paid for the contested content
  - NOT visible publicly (privacy protection)
- Content removed only when evidence is "sufficiently compelling"
- Definition of "sufficiently compelling" will be refined through:
  - Operational experience
  - Legal guidance
  - Community feedback
  - Documented in moderation guidelines (created during Phase 6)

**Detailed procedures to be determined:**
- Specific evidence requirements per claim type
- Review timelines and escalation paths
- Appeals process for wrongful removals
- Counter-claim procedures
- Message size and count limits for messaging system
- Admin moderation service pricing and scope
- Will be documented in `todo/content_moderation.md`

---

### 21. Secrets Management: GitHub as Source of Truth
**Decision:** All API keys, secrets, and application configuration must be stored in GitHub Secrets and Variables, deployed to Cloudflare via CI/CD.

**Rationale:**
- Single source of truth for all environments
- Enables automated deployments without manual intervention
- Audit trail through GitHub's access logs
- Environment-specific configuration (dev vs production)
- Secrets never stored in code or wrangler.toml
- CI/CD workflows can deploy complete, working environments

**Implementation:**
- **GitHub Secrets** (encrypted, for sensitive values):
  - `CLERK_SECRET_KEY` - Clerk backend API authentication
  - `CLERK_PUBLISHABLE_KEY` - Clerk frontend initialization
  - `CLERK_WEBHOOK_SECRET` - Webhook signature verification
  - `STRIPE_SECRET_KEY` - Stripe payment processing
  - `STRIPE_WEBHOOK_SECRET` - Stripe webhook verification
  - `CLOUDFLARE_API_TOKEN` - Cloudflare deployment access
  - `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account identifier

- **GitHub Variables** (non-sensitive configuration):
  - `ENVIRONMENT` - Environment name (development/production)
  - `LOG_LEVEL` - Logging verbosity

- **Deployment workflow:**
  1. CI/CD reads secrets from GitHub
  2. Deploys to Cloudflare with `wrangler secret put` commands
  3. Verifies deployment via health endpoint
  4. Smoke tests validate all integrations

**Benefits:**
- No manual `wrangler secret put` commands needed
- New team members can deploy immediately
- Disaster recovery: redeploy from GitHub
- Environment parity guaranteed

---

## Critical Open Questions

**All architectural decisions have been made.** Implementation can proceed with the following understanding:

- Contest resolution details (Decision #20) will be refined during Phase 6 based on operational needs
- Detailed moderation guidelines will be developed in `todo/content_moderation.md`
- Other implementation details will be worked out in phase-specific sub-plans

No blocking questions remain for beginning implementation.

---

## Success Criteria

### Technical Success
- [ ] 99.9% uptime for content retrieval
- [ ] Sub-second response time for downloads
- [ ] Successful handling of files up to maximum size
- [ ] Zero data loss or corruption
- [ ] Passing security audit
- [ ] API documentation coverage 100%

### Business Success
- [ ] Positive cash flow (revenue > costs)
- [ ] Growing user base
- [ ] Low contest rate (< 1% of content)
- [ ] Fast contest resolution (< 7 days average)
- [ ] Community adoption and engagement

### Operational Success
- [ ] Automated deployment pipeline
- [ ] Effective monitoring and alerting
- [ ] Incident response under X hours
- [ ] Public trust and transparency
- [ ] Legal compliance maintained

## Risk Assessment

### High Risk
- **Legal liability:** Hosting copyrighted or illegal content
  - *Mitigation:* Strong DMCA compliance, clear ToS, responsive takedowns
- **Payment fraud:** Stolen cards, chargebacks
  - *Mitigation:* Fraud detection, payment provider tools, limits
- **Storage costs:** Underestimating actual costs
  - *Mitigation:* Conservative pricing, cost monitoring, caps

### Medium Risk
- **Abuse:** Malware hosting, spam, illegal content
  - *Mitigation:* Content limits, rate limiting, monitoring, contests
- **Performance:** Slow upload/download or outages
  - *Mitigation:* CDN, edge caching, load testing, monitoring
- **Complexity:** Over-engineering the initial version
  - *Mitigation:* Phased approach, MVP first, iterate

### Low Risk
- **Competition:** Similar services already exist
  - *Mitigation:* Focus on transparency, 256t standard, community
- **Adoption:** Users don't find value
  - *Mitigation:* Clear use cases, good UX, community building

## Next Steps

See [`STATUS.md`](../STATUS.md) for launch blockers, post-launch work, and the backlog,
and run `npm run status` for a summary. Completed plans are in `done/`; active plans are in `todo/`.

---

**Document Version:** 4.0
**Last Updated:** 2026-10-07
**Status:** See STATUS.md
