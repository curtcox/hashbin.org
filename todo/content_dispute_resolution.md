# Content Dispute Resolution Plan

## Overview

This document covers the content dispute resolution system for HashBin.org, including the escalation system for handling contests and DMCA takedown requests. For core authentication, see [user_authorization.md](./user_authorization.md).

---

## Implementation Status

**Status:** Not Started (Planned for Phase 6)

- [ ] Implement escalation state machine
- [ ] Build Tier 1 automated rules engine
- [ ] Integrate AI for Tier 2 review
- [ ] Build owner notification system
- [ ] Create escalation tracking and logging
- [ ] Contest submission form and API
- [ ] DMCA submission form and API

---

## Architecture

### Escalation Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Request   │───▶│  Automated  │───▶│     AI      │───▶│    Owner    │
│   Received  │    │  (No AI)    │    │   Review    │    │   Review    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                         │                  │                  │
                         ▼                  ▼                  ▼
                    Auto-resolve       AI-resolve        Manual decision
```

---

## Escalation System

The escalation system handles contests and DMCA requests without requiring admin users.

### Tier 1: Automated (No AI)

- Pattern matching for obvious cases (exact hash matches, known bad actors)
- Validation of required fields (valid email, proper format)
- Auto-reject malformed or incomplete requests
- Auto-approve clear-cut cases matching predefined rules

### Tier 2: AI Review

- Cases that don't match Tier 1 patterns are reviewed by AI
- AI evaluates evidence, compares claims, assesses validity
- AI can approve, reject, or escalate to owner
- All AI decisions are logged with reasoning

### Tier 3: Owner Review

- Complex cases requiring human judgment
- Edge cases where AI confidence is low
- Appeals of Tier 1 or Tier 2 decisions
- Owner receives notification and makes final decision

### Escalation States

| State | Description |
|-------|-------------|
| `PENDING_TIER1` | Awaiting automated processing |
| `PENDING_TIER2` | Awaiting AI review |
| `PENDING_TIER3` | Awaiting owner review |
| `APPROVED` | Request approved, action taken |
| `REJECTED` | Request rejected with reason |
| `EXPIRED` | No response within SLA, default action taken |

---

## Escalation Triggers

### Tier 1 → Tier 2

All conditions trigger escalation:
- No pattern match in rule set
- Confidence score below 80%
- Specific content types flagged for AI review

### Tier 2 → Tier 3

All conditions trigger escalation:
- AI confidence below 70%
- AI explicitly flags "needs human review"
- Content value above $50
- User requests human review

### Thresholds (Configurable)

| Threshold | Default Value | Description |
|-----------|---------------|-------------|
| Tier 1 confidence | 80% | Automated rules must have 80%+ confidence |
| Tier 2 confidence | 70% | AI must have 70%+ confidence |
| Content value | $50 | Auto-escalate high-value content to owner |

---

## SLAs and Timeouts

| Tier | SLA | Behavior on Expiry |
|------|-----|-------------------|
| Tier 1 | Immediate | N/A (milliseconds) |
| Tier 2 | 4 hours | Escalate to Tier 3 |
| Tier 3 | 7 days | No action taken |

**Note:** If owner doesn't respond within 7 days, no action is taken and content status remains unchanged. Same policy applies to DMCA requests.

---

## Appeals

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Appeal process | **Next tier** | One appeal allowed per decision; appeals escalate to next tier |
| Tier 3 appeals | **Final** | Owner decisions cannot be appealed |

---

## Owner Notifications

### Webhook Configuration

- **Method:** Webhook only (no backup notification)
- **Retry:** None (single attempt)
- **Environment Variable:** `OWNER_WEBHOOK_URL`

### Webhook Payload

```json
{
  "event_type": "escalation_tier3",
  "escalation_id": "esc_xxx",
  "request_type": "contest | dmca",
  "content_hash": "256t_xxx",
  "content_value": 75.00,
  "submitter_email": "user@example.com",
  "submission_timestamp": "2026-01-13T10:00:00Z",
  "tier1_result": { "action": "escalated", "reason": "no_pattern_match" },
  "tier2_result": { "action": "escalated", "confidence": 0.65, "reasoning": "..." },
  "evidence": { ... },
  "action_url": "https://hashbin.org/admin/escalation/esc_xxx"
}
```

---

## AI Service Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Service | OpenRouter | Unified API for multiple models |
| Default model | `anthropic/claude-3-sonnet` | Configurable via `OPENROUTER_MODEL` |
| Environment variable | `OPENROUTER_API_KEY` | API key for OpenRouter |

---

## API Endpoints

### Contest Submission

```
GET /contest
  - Public web form for submitting content contests
  - No authentication required
  - Collects: content_hash, claimant_email, evidence, reason

POST /api/contest
  - API endpoint for programmatic contest submission
  - No authentication required
  - Request: { content_hash, claimant_email, evidence, reason }
  - Response: { escalation_id, status, created_at }
```

### DMCA Submission

```
GET /dmca
  - Public web form for DMCA takedown requests
  - No authentication required
  - Collects: content_hash, claimant_email, claimant_name, sworn_statement

POST /api/dmca
  - API endpoint for programmatic DMCA submission
  - No authentication required
  - Request: { content_hash, claimant_email, claimant_name, sworn_statement, signature }
  - Response: { escalation_id, status, created_at }
```

---

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contest moderation | **Automated escalation: No-AI → AI → Owner** | Three-tier system handles disputes without permanent admins |
| DMCA handling | **Automated escalation: No-AI → AI → Owner** | Same three-tier escalation for legal compliance |
| Abuse/spam handling | **Rate limiting only** | Content is hash-only access (low discoverability); rate limits prevent abuse |
| Configuration storage | **Well-named constants** | Thresholds and SLAs stored as named constants; change requires redeployment |
| Submission methods | **Public form + API endpoint** | Both web form and programmatic API access |

---

## Test Plan

### Escalation System Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| ESC-01 | Malformed contest auto-rejected at Tier 1 | Missing required fields | State: `REJECTED`, reason logged |
| ESC-02 | Clear-cut contest auto-approved at Tier 1 | Exact hash match, valid claim | State: `APPROVED` |
| ESC-03 | Ambiguous contest escalates to Tier 2 | No pattern match | State: `PENDING_TIER2` |
| ESC-04 | AI approves contest at Tier 2 | AI confidence high, approve | State: `APPROVED`, AI reasoning logged |
| ESC-05 | AI rejects contest at Tier 2 | AI confidence high, reject | State: `REJECTED`, AI reasoning logged |
| ESC-06 | AI escalates to Tier 3 | AI confidence low | State: `PENDING_TIER3` |
| ESC-07 | Owner approves at Tier 3 | Owner clicks approve | State: `APPROVED` |
| ESC-08 | Owner rejects at Tier 3 | Owner clicks reject | State: `REJECTED` |
| ESC-09 | DMCA auto-validated at Tier 1 | Valid format, verified email | Proceeds to Tier 2 |
| ESC-10 | DMCA missing required fields rejected | Incomplete request | State: `REJECTED` |
| ESC-11 | DMCA escalates to owner | AI uncertain | State: `PENDING_TIER3` |
| ESC-12 | Escalation timeout defaults action | No response in SLA | State: `EXPIRED`, default action |
| ESC-13 | Appeal triggers re-review | User appeals Tier 1 decision | Re-enters at Tier 2 |
| ESC-14 | All escalation decisions logged | Any state transition | Full audit trail stored |

### Submission Endpoint Tests

| Test ID | Test Case | Input | Expected Output |
|---------|-----------|-------|-----------------|
| SUB-01 | Valid contest submission via API | Complete contest data | 201 Created, escalation_id returned |
| SUB-02 | Valid DMCA submission via API | Complete DMCA data with signature | 201 Created, escalation_id returned |
| SUB-03 | Contest missing content_hash | No content_hash field | 400 Bad Request |
| SUB-04 | Contest missing claimant_email | No email field | 400 Bad Request |
| SUB-05 | Contest with invalid email format | `not-an-email` | 400 Bad Request |
| SUB-06 | Contest with non-existent content_hash | Unknown hash | 404 Not Found |
| SUB-07 | DMCA missing sworn_statement | No sworn statement | 400 Bad Request |
| SUB-08 | DMCA missing signature | No signature field | 400 Bad Request |
| SUB-09 | DMCA missing claimant_name | No name field | 400 Bad Request |
| SUB-10 | Contest form renders correctly | GET /contest | 200 OK, HTML form returned |
| SUB-11 | DMCA form renders correctly | GET /dmca | 200 OK, HTML form returned |
| SUB-12 | Contest form submission creates escalation | POST form data | Redirect to confirmation, escalation created |
| SUB-13 | DMCA form submission creates escalation | POST form data | Redirect to confirmation, escalation created |
| SUB-14 | Submission rate limiting enforced | 100+ submissions/hour from same IP | 429 Too Many Requests |
| SUB-15 | Duplicate contest for same hash rejected | Same hash within 24h | 409 Conflict |
| SUB-16 | Duplicate DMCA for same hash rejected | Same hash within 24h | 409 Conflict |
| SUB-17 | Evidence field accepts large text | 10KB evidence text | 201 Created |
| SUB-18 | Evidence field rejects oversized text | 1MB evidence text | 400 Bad Request (too large) |
| SUB-19 | XSS in evidence field sanitized | `<script>alert(1)</script>` | Stored escaped, no XSS |
| SUB-20 | SQL injection in email field blocked | `'; DROP TABLE--` | 400 Bad Request or safely escaped |

### Related Integration Tests

| Test ID | Test Case | Steps | Expected Outcome |
|---------|-----------|-------|------------------|
| INT-13 | Full escalation flow - contest | 1. Submit contest 2. Tier 1 processes 3. Escalates 4. Owner decides | Contest resolved |
| INT-14 | Full escalation flow - DMCA | 1. Submit DMCA 2. Auto-validate 3. AI review 4. Content action | DMCA processed |

### Related Edge Case Tests

| Test ID | Test Case | Scenario | Expected Behavior |
|---------|-----------|----------|-------------------|
| EDGE-14 | Escalation during system maintenance | Submit while AI unavailable | Queued, processed when available |
| EDGE-15 | Owner unavailable for Tier 3 | Owner doesn't respond | SLA expires, default action taken |

### Related Security Tests

| Test ID | Test Case | Attack Vector | Expected Protection |
|---------|-----------|---------------|---------------------|
| SEC-13 | Fake DMCA submission | Fraudulent takedown request | Email verification, audit trail |
| SEC-14 | Escalation manipulation | Try to skip tiers | Tier progression enforced |

---

## Dependencies

- **Phase 2 (Content Operations)**: Content must exist for disputes
- **AI Service**: OpenRouter API for Tier 2 escalation
- **Environment Variables**:
  - `OPENROUTER_API_KEY` (for Tier 2)
  - `OPENROUTER_MODEL` (configurable model ID)
  - `OWNER_WEBHOOK_URL` (for Tier 3 notifications)

---

## Success Criteria

1. Contests can be submitted via web form and API
2. DMCA requests can be submitted via web form and API
3. Tier 1 auto-resolves clear-cut cases
4. Tier 2 AI review processes ambiguous cases
5. Tier 3 owner notification works via webhook
6. SLAs are enforced with appropriate default actions
7. Appeals escalate to next tier
8. All decisions are logged with audit trail
9. All tests pass
10. Security audit reveals no critical vulnerabilities

---

## Related Documents

- [User Authorization](./user_authorization.md) - Core authentication, API keys, rate limiting
- [Account Management](./account_management.md) - Account linking, deletion, orphaned accounts

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-13 | Claude | Initial version (split from user_authorization.md) |
