/**
 * Admin moderation page (/admin/disputes.html)
 * Acts as the signed-in admin (ADMIN_USER_ID).
 */

import { escapeHtml } from '/js/html.js';
import { adminHeaders } from '/js/admin-auth.js';
import { NCII_CLAIM_TYPE, claimTypeLabel, formatDisputeDate, isHttpsUrl, statusLabel } from '/js/disputes.js';

const listEl = document.getElementById('dispute-list');
const errorEl = document.getElementById('admin-error');

async function adminFetch(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { ...await adminHeaders(), 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  if (response.status === 401 || response.status === 403) {
    showSignIn();
    throw new Error('unauthorized');
  }
  return response;
}

function showSignIn() {
  document.getElementById('sign-in-card').classList.remove('hidden');
  document.getElementById('admin-content').classList.add('hidden');
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

// Intimate image reports must be decided within 48 hours, so they come first, earliest due first
function byUrgency(a, b) {
  const aNcii = a.claim_type === NCII_CLAIM_TYPE;
  const bNcii = b.claim_type === NCII_CLAIM_TYPE;
  if (aNcii !== bNcii) return aNcii ? -1 : 1;
  if (aNcii) return new Date(a.removal_due_at) - new Date(b.removal_due_at);
  return new Date(b.created_at) - new Date(a.created_at);
}

function renderNcii(dispute) {
  if (dispute.claim_type !== NCII_CLAIM_TYPE) {
    return `<dt>Expires</dt><dd>${escapeHtml(formatDisputeDate(dispute.expires_at))}</dd>`;
  }
  const statement = dispute.ncii_statement || {};
  const due = new Date(dispute.removal_due_at);
  const dueText = Number.isNaN(due.getTime()) ? '—' : due.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return `
    <dt>Decide by</dt><dd><strong>${escapeHtml(dueText)}</strong>${due <= new Date() ? ' <strong>(overdue)</strong>' : ''}</dd>
    <dt>Signed</dt><dd>${escapeHtml(statement.signature || '(missing)')}, ${statement.on_behalf ? 'acting for the person shown' : 'the person shown'}</dd>
  `;
}

function renderDispute(dispute) {
  const contact = dispute.submitter_contact || dispute.contact || {};
  const isNcii = dispute.claim_type === NCII_CLAIM_TYPE;
  const links = (dispute.evidence_urls || []).filter(isHttpsUrl)
    .map(url => `<li><a href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(url)}</a></li>`)
    .join('');
  return `
    <section class="card dispute-detail dispute-banner" style="margin-bottom: 1.5rem;" data-cid="${escapeHtml(dispute.cid)}">
      <div class="dispute-header">
        <h3 style="margin: 0;">${escapeHtml(claimTypeLabel(dispute.claim_type))}</h3>
        <span class="dispute-badge status-${escapeHtml(dispute.status)}">${escapeHtml(statusLabel(dispute.status))}</span>
      </div>
      <dl>
        <dt>CID</dt><dd class="dispute-cid"><a href="/info.html?cid=${encodeURIComponent(dispute.cid)}" target="_blank">${escapeHtml(dispute.cid)}</a></dd>
        <dt>Reference</dt><dd><code>${escapeHtml(dispute.dispute_id)}</code></dd>
        <dt>Filed</dt><dd>${escapeHtml(formatDisputeDate(dispute.created_at))}</dd>
        ${renderNcii(dispute)}
        <dt>Reporter</dt><dd class="admin-contact">${escapeHtml(contact.type || '')}: ${escapeHtml(contact.value || '(none)')}</dd>
      </dl>
      ${isNcii ? '<p class="form-text">Private report: never repeat its details in the resolution reason. Upholding removes every copy, since identical files share this CID.</p>' : ''}
      <div class="dispute-evidence">${escapeHtml(dispute.evidence || '(no explanation given)')}</div>
      ${links ? `<ul>${links}</ul>` : ''}
      <form class="admin-actions" data-claim-type="${escapeHtml(dispute.claim_type)}">
        <input type="text" class="form-input resolution-reason" maxlength="500" placeholder="Resolution reason (shown publicly)">
        ${dispute.status === 'open' ? '<button type="button" class="btn btn-secondary btn-sm" data-action="under_review">Mark under review</button>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-action="closed_denied">Deny (restore content)</button>
        <button type="button" class="btn btn-secondary btn-sm btn-danger" data-action="closed_deleted">Uphold (take down)</button>
      </form>
    </section>
  `;
}

async function resolve(cid, status, reason, claimType) {
  const verb = { under_review: 'mark this dispute under review', closed_denied: 'deny this dispute and restore the content', closed_deleted: 'take this content down permanently' }[status];
  const warning = claimType === NCII_CLAIM_TYPE && status === 'closed_denied'
    ? '\n\nDeny an intimate image report only if it is not a valid request (for example, it is not an intimate image). The content becomes public again.'
    : '';
  if (status !== 'under_review' && !reason) {
    showError('Enter a resolution reason first. It is published with the dispute.');
    return;
  }
  if (!window.confirm(`Really ${verb}?${warning}`)) return;

  const response = await adminFetch(`/api/admin/disputes/${encodeURIComponent(cid)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolution_reason: reason || undefined })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showError(`Update failed: ${data.error || response.status}`);
    return;
  }
  await load();
}

async function loadInfringers() {
  const el = document.getElementById('infringer-list');
  const response = await adminFetch('/api/admin/repeat-infringers');
  const { infringers = [] } = await response.json();
  // eslint-disable-next-line no-unsanitized/property -- API values are escaped
  el.innerHTML = infringers.length === 0
    ? '<p class="dispute-empty">None.</p>'
    : `<ul>${infringers.map(i => `<li><code>${escapeHtml(i.uploader_id)}</code>: ${escapeHtml(i.strikes)} upheld removals (${i.recent_strikes.map(s => escapeHtml(s.cid.slice(0, 12))).join(', ')}…)</li>`).join('')}</ul>`;
}

async function load() {
  errorEl.classList.add('hidden');
  listEl.innerHTML = '<p class="dispute-empty">Loading…</p>';
  try {
    const response = await adminFetch('/api/admin/disputes?limit=100');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const disputes = [...(data.disputes || [])].sort(byUrgency);
    document.getElementById('dispute-count').textContent = `(${data.total ?? disputes.length})`;
    // eslint-disable-next-line no-unsanitized/property -- renderDispute escapes every field
    listEl.innerHTML = disputes.length === 0
      ? '<p class="dispute-empty">No open disputes.</p>'
      : disputes.map(renderDispute).join('');

    for (const card of listEl.querySelectorAll('[data-cid]')) {
      for (const button of card.querySelectorAll('[data-action]')) {
        button.addEventListener('click', () => resolve(
          card.dataset.cid,
          button.dataset.action,
          card.querySelector('.resolution-reason').value.trim(),
          card.querySelector('.admin-actions').dataset.claimType
        ).catch(error => error.message !== 'unauthorized' && showError(error.message)));
      }
    }
    await loadInfringers();
  } catch (error) {
    if (error.message !== 'unauthorized') {
      listEl.innerHTML = '';
      showError(`Could not load disputes: ${error.message}`);
    }
  }
}

function start() {
  document.getElementById('sign-in-card').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');
  load();
}

document.getElementById('refresh').addEventListener('click', load);

start();
