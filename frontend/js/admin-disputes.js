/**
 * Admin moderation page (/admin/disputes.html)
 * Uses the X-Admin-Token admin API; the token lives only in sessionStorage.
 */

import { escapeHtml } from '/js/html.js';
import { claimTypeLabel, formatDisputeDate, isHttpsUrl, statusLabel } from '/js/disputes.js';

const TOKEN_KEY = 'hashbin.adminToken';
const listEl = document.getElementById('dispute-list');
const errorEl = document.getElementById('admin-error');

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the token lasts until reload
  }
  memoryToken = token;
}

let memoryToken = getToken();

async function adminFetch(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { 'X-Admin-Token': memoryToken || '', 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  if (response.status === 401 || response.status === 403) {
    setToken(null);
    showTokenForm('That token was rejected.');
    throw new Error('unauthorized');
  }
  return response;
}

function showTokenForm(message) {
  document.getElementById('token-card').classList.remove('hidden');
  document.getElementById('admin-content').classList.add('hidden');
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    document.getElementById('token-card').prepend(errorEl);
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function renderDispute(dispute) {
  const contact = dispute.submitter_contact || dispute.contact || {};
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
        <dt>Expires</dt><dd>${escapeHtml(formatDisputeDate(dispute.expires_at))}</dd>
        <dt>Reporter</dt><dd class="admin-contact">${escapeHtml(contact.type || '')}: ${escapeHtml(contact.value || '(none)')}</dd>
      </dl>
      <div class="dispute-evidence">${escapeHtml(dispute.evidence)}</div>
      ${links ? `<ul>${links}</ul>` : ''}
      <form class="admin-actions">
        <input type="text" class="form-input resolution-reason" maxlength="500" placeholder="Resolution reason (shown publicly)">
        ${dispute.status === 'open' ? '<button type="button" class="btn btn-secondary btn-sm" data-action="under_review">Mark under review</button>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-action="closed_denied">Deny (restore content)</button>
        <button type="button" class="btn btn-secondary btn-sm btn-danger" data-action="closed_deleted">Uphold (take down)</button>
      </form>
    </section>
  `;
}

async function resolve(cid, status, reason) {
  const verb = { under_review: 'mark this dispute under review', closed_denied: 'deny this dispute and restore the content', closed_deleted: 'take this content down permanently' }[status];
  if (status !== 'under_review' && !reason) {
    showError('Enter a resolution reason first. It is published with the dispute.');
    return;
  }
  if (!window.confirm(`Really ${verb}?`)) return;

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
  el.innerHTML = infringers.length === 0
    ? '<p class="dispute-empty">None.</p>'
    : `<ul>${infringers.map(i => `<li><code>${escapeHtml(i.uploader_id)}</code>: ${i.strikes} upheld removals (${i.recent_strikes.map(s => escapeHtml(s.cid.slice(0, 12))).join(', ')}…)</li>`).join('')}</ul>`;
}

async function load() {
  errorEl.classList.add('hidden');
  listEl.innerHTML = '<p class="dispute-empty">Loading…</p>';
  try {
    const response = await adminFetch('/api/admin/disputes?limit=100');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const disputes = data.disputes || [];
    document.getElementById('dispute-count').textContent = `(${data.total ?? disputes.length})`;
    listEl.innerHTML = disputes.length === 0
      ? '<p class="dispute-empty">No open disputes.</p>'
      : disputes.map(renderDispute).join('');

    for (const card of listEl.querySelectorAll('[data-cid]')) {
      for (const button of card.querySelectorAll('[data-action]')) {
        button.addEventListener('click', () => resolve(
          card.dataset.cid,
          button.dataset.action,
          card.querySelector('.resolution-reason').value.trim()
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
  document.getElementById('token-card').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');
  document.getElementById('admin-content').prepend(errorEl);
  load();
}

document.getElementById('token-form').addEventListener('submit', event => {
  event.preventDefault();
  setToken(document.getElementById('token-input').value.trim());
  start();
});
document.getElementById('refresh').addEventListener('click', load);
document.getElementById('sign-out').addEventListener('click', () => {
  setToken(null);
  showTokenForm();
});

if (memoryToken) start();
