# HashBin.org Master Implementation Plan

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
│ R2 Storage│ │Database│ │ Payment  │ │  Public   │
│  (Content)│ │(Metadata)│Gateway(s)│ │  Records  │
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

### Phase 1: Foundation & Infrastructure
**Goal:** Set up core infrastructure and development pipeline

**Deliverables:**
- Cloudflare account and domain configuration
- R2 bucket creation and configuration
- Database selection and setup
- GitHub Actions CI/CD pipeline
- Development, staging, and production environments
- Basic monitoring and logging

**Sub-Plans:**
- `todo/site_creation.md` - Infrastructure setup and deployment

### Phase 2: Core Content Operations
**Goal:** Implement basic upload and download functionality

**Deliverables:**
- 256t hash generation and validation library
- Content upload API endpoint
- Content download API endpoint
- R2 storage integration
- Content metadata storage
- Basic error handling and validation

**Sub-Plans:**
- `todo/content_operations.md` - Upload/download implementation
- `todo/256t_integration.md` - Hash generation and validation

### Phase 3: Authentication & Authorization
**Goal:** Implement secure user authentication with multiple providers

**Deliverables:**
- OAuth integration (Google, GitHub, etc.)
- Email/password authentication
- Session management
- JWT token generation and validation
- API key generation for programmatic access
- Rate limiting and abuse prevention

**Sub-Plans:**
- `todo/user_authorization.md` - Multi-provider authentication system

### Phase 4: Payment System
**Goal:** Integrate multiple payment providers for uploads and retention

**Deliverables:**
- Payment provider integrations (Stripe, PayPal, crypto, etc.)
- Pricing calculator (storage + time)
- Payment webhook handlers
- Receipt generation
- Refund handling (if applicable)
- Payment history and accounting

**Sub-Plans:**
- `todo/payments.md` - Multi-provider payment integration
- `todo/pricing_model.md` - Storage pricing and calculations

### Phase 5: Retention & Expiration Management
**Goal:** Automate content lifecycle management

**Deliverables:**
- Scheduled job for expiration checks
- Content deletion process
- Retention extension API
- Expiration notification system (optional)
- Grace period handling (if applicable)
- Retention payment tracking

**Sub-Plans:**
- `todo/retention_system.md` - Content lifecycle management

### Phase 6: Contestation System
**Goal:** Implement transparent content dispute resolution

**Deliverables:**
- Contest submission form and API
- Contest review workflow
- Evidence upload and storage
- Status tracking and notifications
- Content takedown process
- Appeals process (if needed)
- Public contest record publication

**Sub-Plans:**
- `todo/contestation_system.md` - Dispute resolution workflow
- `todo/content_moderation.md` - Review and moderation tools

### Phase 7: Public Records & Transparency
**Goal:** Provide public visibility into system operations

**Deliverables:**
- Public records database/API
- Contest history viewer
- Deletion history viewer
- System statistics dashboard
- API for data access
- Data export functionality
- Archive/historical records

**Sub-Plans:**
- `todo/public_records.md` - Transparency and reporting system

### Phase 8: Frontend Development
**Goal:** Create user-friendly web interface

**Deliverables:**
- Responsive web design
- Upload interface with drag-and-drop
- Content retrieval/search interface
- Payment flow integration
- User dashboard (uploads, payments, contests)
- Public records viewer
- Documentation and help system
- API documentation

**Sub-Plans:**
- `todo/frontend_ui.md` - Web interface implementation
- `todo/api_documentation.md` - Public API docs

### Phase 9: Testing & Quality Assurance
**Goal:** Ensure system reliability and security

**Deliverables:**
- Unit test suite
- Integration tests
- End-to-end tests
- Load testing and performance optimization
- Security audit and penetration testing
- Accessibility compliance
- Browser compatibility testing

**Sub-Plans:**
- `todo/testing_strategy.md` - Comprehensive test plan
- `todo/security_audit.md` - Security review and hardening

### Phase 10: Legal & Compliance
**Goal:** Ensure legal compliance and protect all parties

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
- `todo/legal_compliance.md` - Terms, policies, and compliance

### Phase 11: Launch & Operations
**Goal:** Production launch and ongoing maintenance

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
- `todo/operations.md` - Production operations and maintenance
- `todo/monitoring.md` - System monitoring and alerting

## Critical Open Questions

### 1. Database Selection
**Question:** Which database should we use for metadata storage?

**Options:**
- **Cloudflare D1** (SQLite, serverless, integrated)
- **Cloudflare Durable Objects** (distributed, edge-optimized)
- **External database** (PostgreSQL, MySQL via connection pooling)
- **Cloudflare KV** (key-value store, simple but limited querying)

**Considerations:**
- Query complexity (especially for public records, search)
- Transaction support (for payment processing)
- Scalability and cost
- Geographic distribution and latency
- Backup and disaster recovery

**Decision needed by:** Phase 1

---

### 2. Payment Pricing Model
**Question:** How should we price storage and retention?

**Options:**
- Flat rate per GB per month
- Tiered pricing (discounts for larger/longer)
- Pay-per-year with discounts
- Minimum payment amount
- Free tier for small files

**Considerations:**
- Competitive pricing with similar services
- R2 costs plus operational overhead
- Sustainability and profitability
- User accessibility
- Payment processor fees

**Example pricing to evaluate:**
- $0.015/GB/month (R2 cost) + markup
- Minimum $1 payment = ~67GB for 1 month or 1GB for ~5.5 years
- Small files (<1MB) = minimum $0.10?

**Decision needed by:** Phase 4

---

### 3. Authentication Providers
**Question:** Which authentication providers should we support?

**Options:**
- OAuth providers: Google, GitHub, Microsoft, Facebook, Twitter/X
- Email/password (requires password reset, verification)
- Magic links (email-based, no password)
- Web3 wallet (MetaMask, WalletConnect)
- API keys (for programmatic access)

**Considerations:**
- User convenience and adoption
- Implementation complexity
- Security implications
- Provider reliability and costs
- Privacy implications

**Decision needed by:** Phase 3

---

### 4. Payment Providers
**Question:** Which payment providers should we integrate?

**Options:**
- **Credit card processors:** Stripe, Square, PayPal
- **Cryptocurrency:** Bitcoin, Ethereum, stablecoins
- **Other:** Apple Pay, Google Pay, ACH, wire transfer

**Considerations:**
- Transaction fees
- Geographic availability
- User preferences
- Integration complexity
- Compliance requirements (KYC, AML)
- Anonymity vs. accountability

**Decision needed by:** Phase 4

---

### 5. Content Contestation Process
**Question:** How should contest review and resolution work?

**Options:**
- **Manual review:** Designated moderators/admins review each case
- **Community voting:** Users vote on contests
- **Automated checks:** Content matching against known databases
- **Legal process required:** Require DMCA takedown or court order
- **Hybrid approach:** Automated + manual for complex cases

**Considerations:**
- Legal liability and compliance
- Response time requirements (DMCA = 24-48 hours typical)
- Staffing and operational costs
- Fairness and transparency
- False positives vs. false negatives
- Appeals process

**Decision needed by:** Phase 6

---

### 6. Anonymity vs. Accountability
**Question:** How much user information should be public?

**Options for uploader identification:**
- Fully anonymous (no identification)
- Pseudonymous (user ID but not personally identifiable)
- Semi-public (show auth provider but not details)
- Fully public (show uploader identity)

**Options for contest submitters:**
- Anonymous contests allowed
- Verified identity required for valid contests
- Public attribution for all contests

**Considerations:**
- Legal requirements (DMCA requires contact info)
- Privacy concerns
- Abuse prevention
- Transparency goals
- User trust

**Decision needed by:** Phase 3 & 6

---

### 7. Content Limits and Restrictions
**Question:** Should there be limits on content size, type, or quantity?

**Limits to consider:**
- Maximum file size (100MB? 1GB? 10GB? None?)
- File type restrictions (block executables? Allow all?)
- Rate limiting (uploads per user per day)
- Total storage per user
- Prohibited content types

**Considerations:**
- Abuse prevention (malware, spam)
- Cost management
- Use cases (what are users trying to accomplish?)
- Legal requirements
- Performance implications

**Decision needed by:** Phase 2

---

### 8. Grace Period and Deletion
**Question:** What happens when retention expires?

**Options:**
- Immediate deletion on expiration
- Grace period (7 days? 30 days?) before deletion
- Soft delete with recovery option
- Tiered deletion (mark as expired, then delete later)

**Considerations:**
- User experience (accidental expiration)
- Storage costs
- Transparency (when exactly is content deleted?)
- Recovery mechanisms

**Decision needed by:** Phase 5

---

### 9. Public Records Granularity
**Question:** What level of detail should public records include?

**Information to potentially publish:**
- Contest: hash, claim type, date, resolution, reasoning
- Deletion: hash, deletion date, reason (expired vs. contested)
- Statistics: Total content, total storage, contests filed, etc.

**Considerations:**
- Privacy of users
- Transparency goals
- Legal requirements
- Potential for harassment or abuse
- Data volume and storage

**Decision needed by:** Phase 7

---

### 10. API Access and Rate Limiting
**Question:** How should API access be controlled and limited?

**Options:**
- Open API (no authentication for downloads)
- API key required for all operations
- Free tier with rate limits
- Paid API access for higher limits
- Different limits for authenticated vs. anonymous

**Rate limit tiers:**
- Anonymous: X requests/day
- Free authenticated: Y requests/day
- Paid tier 1: Z requests/day
- Paid tier 2: Unlimited?

**Considerations:**
- Abuse prevention
- Server costs
- Revenue opportunities
- User needs (hobbyists vs. enterprises)

**Decision needed by:** Phase 3 & 8

---

### 11. Frontend Framework
**Question:** What technology should we use for the frontend?

**Options:**
- React + Next.js (popular, SEO-friendly, server-side rendering)
- Vue.js + Nuxt (simpler learning curve)
- Svelte/SvelteKit (modern, performant)
- Plain HTML/CSS/JS (simplest, no build step)
- Cloudflare Pages with framework of choice

**Considerations:**
- Development speed
- Performance and bundle size
- SEO requirements
- Team expertise
- Integration with Cloudflare Workers
- Maintenance and long-term support

**Decision needed by:** Phase 8

---

### 12. Search and Discovery
**Question:** Should users be able to search or discover content?

**Options:**
- Hash-only access (no search or discovery)
- Metadata search (if users opt-in to make content discoverable)
- Tag system (user-provided tags)
- Full-text search of content
- Browse by category/date

**Considerations:**
- Privacy implications
- Cost and complexity
- Use cases (is discovery needed?)
- 256t philosophy (content-addressed, not searchable)
- Potential for abuse (piracy discovery)

**Decision needed by:** Phase 2 or 8

---

### 13. Backup and Disaster Recovery
**Question:** How should we handle backups and disaster recovery?

**Options:**
- R2 replication (multiple regions)
- Periodic backups to separate storage
- Database backup strategy
- Point-in-time recovery capability
- Geographic redundancy

**Considerations:**
- Data durability requirements
- Recovery time objective (RTO)
- Recovery point objective (RPO)
- Cost of redundancy
- Cloudflare R2 built-in durability (11 nines?)

**Decision needed by:** Phase 1 & 11

---

### 14. Refund Policy
**Question:** Should refunds be available for uploaded content?

**Options:**
- No refunds (all sales final)
- Refunds within X days if content is deleted (by user or admin)
- Refunds for technical failures
- Pro-rated refunds for early deletion
- Refunds for contested content takedowns

**Considerations:**
- Payment processor fees (non-refundable)
- Operational complexity
- User expectations
- Legal requirements
- Abuse potential (upload/download/refund)

**Decision needed by:** Phase 4

---

### 15. Analytics and Privacy
**Question:** What analytics should we collect, and how do we respect privacy?

**Metrics to consider:**
- Upload/download counts
- Storage usage over time
- Payment volume
- User retention
- Geographic distribution
- Error rates

**Privacy considerations:**
- GDPR compliance
- Cookie consent
- Anonymous analytics
- User tracking (or lack thereof)
- Third-party analytics services

**Decision needed by:** Phase 8 & 10

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

1. **Review and refine this master plan** - Iterate on open questions
2. **Make key architectural decisions** - Database, pricing, auth providers
3. **Create detailed sub-plans** - Start with `todo/site_creation.md`
4. **Set up project tracking** - GitHub Projects or similar
5. **Begin Phase 1** - Infrastructure foundation

## Sub-Plans to Create

The following detailed implementation plans should be created as we answer the open questions:

1. `todo/site_creation.md` - Cloudflare setup, domain, R2, deployment
2. `todo/user_authorization.md` - Multi-provider authentication
3. `todo/payments.md` - Payment integration and processing
4. `todo/content_operations.md` - Upload and download implementation
5. `todo/256t_integration.md` - Hash generation and validation library
6. `todo/pricing_model.md` - Storage pricing and calculations
7. `todo/retention_system.md` - Content lifecycle and expiration
8. `todo/contestation_system.md` - Dispute resolution workflow
9. `todo/content_moderation.md` - Review and moderation tools
10. `todo/public_records.md` - Transparency and reporting
11. `todo/frontend_ui.md` - Web interface implementation
12. `todo/api_documentation.md` - Public API documentation
13. `todo/testing_strategy.md` - Comprehensive testing plan
14. `todo/security_audit.md` - Security review and hardening
15. `todo/legal_compliance.md` - Terms of Service, Privacy Policy, DMCA
16. `todo/operations.md` - Production operations and monitoring
17. `todo/monitoring.md` - System monitoring and alerting

---

**Document Version:** 1.0
**Last Updated:** 2026-01-12
**Status:** Draft - Awaiting review and open question resolution
