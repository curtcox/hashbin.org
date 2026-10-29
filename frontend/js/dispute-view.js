/**
 * Dispute detail page (/disputes/view.html?cid=...)
 * Shows every dispute filed against one CID, newest first
 */

import {
  NCII_CLAIM_TYPE,
  claimTypeLabel,
  escapeHtml,
  formatDisputeDate,
  isActiveStatus,
  isHttpsUrl,
  statusLabel
} from './disputes.js';

const cid = new URLSearchParams(window.location.search).get('cid') || '';
const historyEl = document.getElementById('dispute-history');
const errorEl = document.getElementById('view-error');

function showError(message) {
  historyEl.innerHTML = '';
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function renderEvidenceLinks(urls) {
  const safe = (urls || []).filter(isHttpsUrl);
  if (safe.length === 0) return '';
  const items = safe
    .map(url => `<li><a href="${escapeHtml(url)}" rel="nofollow noopener noreferrer ugc" target="_blank">${escapeHtml(url)}</a></li>`)
    .join('');
  return `<h4>Supporting links</h4><ul>${items}</ul>`;
}

function renderDispute(dispute) {
  const status = dispute.status || 'open';
  const resolution = dispute.resolution_reason
    ? `<dt>Resolution</dt><dd>${escapeHtml(dispute.resolution_reason)}</dd>`
    : '';
  const closed = dispute.closed_at
    ? `<dt>Closed</dt><dd>${escapeHtml(formatDisputeDate(dispute.closed_at))}</dd>`
    : dispute.claim_type === NCII_CLAIM_TYPE
      ? `<dt>Decision due</dt><dd>${escapeHtml(formatDisputeDate(dispute.removal_due_at))} (does not expire)</dd>`
      : `<dt>Expires</dt><dd>${escapeHtml(formatDisputeDate(dispute.expires_at))}</dd>`;
  // The API withholds intimate image reports' details from everyone but administrators
  const details = dispute.claim_type === NCII_CLAIM_TYPE
    ? '<p class="dispute-evidence">The details of intimate image reports are private. See <a href="/take-it-down.html">how these reports are handled</a>.</p>'
    : `<h4>Reporter's explanation</h4>
      <div class="dispute-evidence">${escapeHtml(dispute.evidence)}</div>
      ${renderEvidenceLinks(dispute.evidence_urls)}`;

  return `
    <section class="card dispute-detail ${isActiveStatus(status) ? 'dispute-banner' : ''}" style="margin-bottom: 1.5rem;">
      <div class="dispute-header">
        <h2 style="margin: 0;">${escapeHtml(claimTypeLabel(dispute.claim_type))}</h2>
        <span class="dispute-badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
      </div>
      <dl>
        <dt>Reference</dt><dd><code>${escapeHtml(dispute.dispute_id)}</code></dd>
        <dt>Filed</dt><dd>${escapeHtml(formatDisputeDate(dispute.created_at))}</dd>
        ${closed}
        ${resolution}
      </dl>
      ${details}
    </section>
  `;
}

async function load() {
  if (!/^[A-Za-z0-9_-]{8,94}$/.test(cid)) {
    showError('No valid content ID was provided.');
    return;
  }

  document.getElementById('cid-display').textContent = cid;
  document.getElementById('content-info-link').href = `/info.html?cid=${encodeURIComponent(cid)}`;

  try {
    const response = await fetch(`/api/content/${encodeURIComponent(cid)}/disputes`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const disputes = [...(data.disputes || [])]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const hasActive = disputes.some(d => isActiveStatus(d.status));
    const reportLink = document.getElementById('report-link');
    reportLink.href = `/disputes/submit.html?cid=${encodeURIComponent(cid)}`;
    reportLink.classList.toggle('hidden', hasActive);
    // An intimate image report replaces any other open dispute, so it is always available
    const nciiLink = document.getElementById('ncii-report-link');
    nciiLink.href = `/disputes/submit.html?cid=${encodeURIComponent(cid)}&reason=${NCII_CLAIM_TYPE}`;
    nciiLink.classList.toggle('hidden', disputes.some(d => isActiveStatus(d.status) && d.claim_type === NCII_CLAIM_TYPE));

    // eslint-disable-next-line no-unsanitized/property -- renderDispute escapes every field
    historyEl.innerHTML = disputes.length === 0
      ? '<p class="dispute-empty">No disputes have been filed for this content.</p>'
      : disputes.map(renderDispute).join('');
  } catch (error) {
    console.error('Failed to load disputes:', error);
    showError('Unable to load disputes for this content right now.');
  }
}

load();
