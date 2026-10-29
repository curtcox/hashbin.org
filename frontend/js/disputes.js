/**
 * Dispute helpers shared by the dispute pages
 * Pure functions (no DOM access) so they can be unit tested
 */

export const EVIDENCE_MIN = 50;
export const EVIDENCE_MAX = 10000;
export const MAX_EVIDENCE_URLS = 10;

const CID_PATTERN = /^[A-Za-z0-9_-]{8,94}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CLAIM_TYPE_LABELS = {
  copyright: 'Copyright',
  illegal: 'Illegal content',
  privacy: 'Privacy violation',
  harassment: 'Harassment',
  malware: 'Malware',
  ncii: 'Intimate image shared without consent',
  other: 'Other'
};

// Reports under the TAKE IT DOWN Act: private, never expire, decided within 48 hours
export const NCII_CLAIM_TYPE = 'ncii';
export const NCII_SIGNATURE_MAX = 200;

export const STATUS_LABELS = {
  open: 'Open',
  under_review: 'Under review',
  closed_denied: 'Denied',
  closed_deleted: 'Content removed',
  closed_expired: 'Expired',
  closed_superseded: 'Replaced by a later report',
  closed_withdrawn: 'Withdrawn'
};

/**
 * Escape text for safe insertion into HTML
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} type - Claim type key
 * @returns {string} Human-readable label
 */
export function claimTypeLabel(type) {
  return CLAIM_TYPE_LABELS[type] || type || 'Unknown';
}

/**
 * @param {string} status - Dispute status key
 * @returns {string} Human-readable label
 */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Unknown';
}

/**
 * Whether a dispute is still active (blocks the content)
 * @param {string} status - Dispute status key
 * @returns {boolean} True for open or under review
 */
export function isActiveStatus(status) {
  return status === 'open' || status === 'under_review';
}

/**
 * @param {string} url - Candidate URL
 * @returns {boolean} True if it parses as an https: URL
 */
export function isHttpsUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate dispute form input and build the POST /api/disputes body
 * @param {Object} input - Raw form values
 * @param {string} input.cid - Content ID
 * @param {string} input.claimType - Claim type key
 * @param {string} input.evidence - Explanation text
 * @param {string[]} input.evidenceUrls - Supporting URLs (blank entries ignored)
 * @param {string} input.contactType - 'email' or 'url'
 * @param {string} input.contactValue - Email address or URL
 * @param {boolean} input.goodFaith - Good-faith acknowledgment
 * @param {string} [input.signature] - Intimate image reports: the reporter's typed full name
 * @param {string} [input.reporterRole] - Intimate image reports: 'self' or 'on_behalf'
 * @param {boolean} [input.nciiStatement] - Intimate image reports: good-faith belief of no consent
 * @returns {{errors: string[], payload: Object|null}} Validation errors, or the request body
 */
export function validateDisputeForm(input) {
  const errors = [];
  const cid = (input.cid || '').trim();
  const evidence = (input.evidence || '').trim();
  const evidenceUrls = (input.evidenceUrls || []).map(u => u.trim()).filter(Boolean);
  const contactValue = (input.contactValue || '').trim();
  const isNcii = input.claimType === NCII_CLAIM_TYPE;
  const signature = (input.signature || '').trim();

  if (!CID_PATTERN.test(cid)) {
    errors.push('Enter a valid content ID (8–94 letters, digits, "-" or "_").');
  }
  if (!CLAIM_TYPE_LABELS[input.claimType]) {
    errors.push('Choose a reason for the report.');
  }
  // An intimate image report needs no explanation: the CID, statement and signature suffice
  if (evidence.length < EVIDENCE_MIN && !isNcii) {
    errors.push(`The explanation must be at least ${EVIDENCE_MIN} characters.`);
  } else if (evidence.length > EVIDENCE_MAX) {
    errors.push(`The explanation must be at most ${EVIDENCE_MAX.toLocaleString('en-US')} characters.`);
  }
  if (evidenceUrls.length > MAX_EVIDENCE_URLS) {
    errors.push(`Add at most ${MAX_EVIDENCE_URLS} supporting links.`);
  }
  if (evidenceUrls.some(u => !isHttpsUrl(u))) {
    errors.push('Supporting links must be HTTPS URLs.');
  }
  if (input.contactType === 'email') {
    if (!EMAIL_PATTERN.test(contactValue)) errors.push('Enter a valid email address.');
  } else if (input.contactType === 'url') {
    if (!isHttpsUrl(contactValue)) errors.push('Enter a valid HTTPS contact URL.');
  } else {
    errors.push('Choose how we can contact you.');
  }
  if (!input.goodFaith) {
    errors.push('Confirm that the report is made in good faith.');
  }
  if (isNcii) {
    if (input.reporterRole !== 'self' && input.reporterRole !== 'on_behalf') {
      errors.push('Say whether you are the person shown or acting for them.');
    }
    if (!input.nciiStatement) {
      errors.push('Confirm that the image was shared without consent.');
    }
    if (signature.length < 2 || signature.length > NCII_SIGNATURE_MAX) {
      errors.push('Type your full name as your signature.');
    }
  }

  if (errors.length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      cid,
      claim_type: input.claimType,
      evidence,
      evidence_urls: evidenceUrls,
      contact: { type: input.contactType, value: contactValue },
      ...(isNcii ? { ncii: { signature, on_behalf: input.reporterRole === 'on_behalf', good_faith: true } } : {})
    }
  };
}

/**
 * Turn an API error response into a message for the reporter
 * @param {number} status - HTTP status
 * @param {Object} body - Parsed JSON body (may be empty)
 * @returns {string} Message
 */
export function describeDisputeError(status, body = {}) {
  switch (body.error) {
    case 'CID_NOT_FOUND':
      return 'No content with that ID is stored on HashBin.org.';
    case 'CID_DELETED':
      return 'That content has already been deleted.';
    case 'DISPUTE_EXISTS':
      return 'This content already has an open dispute. It is blocked while that dispute is reviewed.';
    case 'SIGNATURE_REQUIRED':
      return 'Type your full name as your signature.';
    case 'NCII_STATEMENT_REQUIRED':
      return 'Confirm that the image was shared without consent.';
    case 'REDISPUTE_TOO_SOON':
      return body.days_remaining
        ? `A dispute for this content was closed recently. You can file a new one in ${Math.ceil(body.days_remaining)} day(s).`
        : 'A dispute for this content was closed recently. Please wait 30 days before filing again.';
    case 'RATE_LIMITED':
      return body.retry_after_seconds
        ? `Too many reports from your network. Try again in ${Math.ceil(body.retry_after_seconds / 60)} minute(s).`
        : 'Too many reports from your network. Please try again later.';
    case 'EVIDENCE_TOO_SHORT':
      return `The explanation must be at least ${EVIDENCE_MIN} characters.`;
    case 'EVIDENCE_TOO_LONG':
      return `The explanation must be at most ${EVIDENCE_MAX.toLocaleString('en-US')} characters.`;
    case 'INVALID_EVIDENCE_URL':
      return 'One of the supporting links was rejected. Links must be public HTTPS URLs.';
    case 'TOO_MANY_EVIDENCE_URLS':
      return `Add at most ${MAX_EVIDENCE_URLS} supporting links.`;
    case 'INVALID_CLAIM_TYPE':
      return 'Choose a reason for the report.';
    case 'CONTACT_REQUIRED':
    case 'INVALID_CONTACT_TYPE':
      return 'Provide an email address or HTTPS URL where we can reach you.';
    default:
      if (status === 429) return 'Too many requests. Please try again later.';
      return 'The report could not be submitted. Please try again.';
  }
}

/**
 * @param {string} dateString - ISO date
 * @returns {string} Short local date, or an em dash when missing
 */
export function formatDisputeDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * When an open dispute ends on its own: intimate image reports never expire
 * @param {Object} dispute - Dispute with expires_at and/or removal_due_at
 * @returns {string} e.g. "Expires Oct 30, 2026" or "Decision due Oct 30, 2026; does not expire"
 */
export function disputeDeadlineText(dispute) {
  if (dispute?.claim_type === NCII_CLAIM_TYPE || (!dispute?.expires_at && dispute?.removal_due_at)) {
    return dispute.removal_due_at
      ? `Decision due ${formatDisputeDate(dispute.removal_due_at)}; does not expire`
      : 'Does not expire';
  }
  return `Expires ${formatDisputeDate(dispute?.expires_at)}`;
}

/**
 * Shorten a CID for display: first 8 + last 8 characters
 * @param {string} cid - Content ID
 * @returns {string} Shortened CID
 */
export function truncateCid(cid) {
  if (!cid || cid.length <= 20) return cid || '';
  return `${cid.slice(0, 8)}…${cid.slice(-8)}`;
}
