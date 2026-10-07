/**
 * Open disputes list page (/disputes/index.html)
 */

import {
  claimTypeLabel,
  escapeHtml,
  formatDisputeDate,
  statusLabel,
  truncateCid
} from './disputes.js';

const PAGE_SIZE = 50;

const listEl = document.getElementById('dispute-list');
const errorEl = document.getElementById('dispute-error');
const totalEl = document.getElementById('dispute-total');
const loadMoreButton = document.getElementById('load-more');
const claimFilter = document.getElementById('claim-filter');

let offset = 0;
let loaded = 0;

function renderDispute(dispute) {
  const cid = dispute.cid || '';
  const status = dispute.status || 'open';
  const viewUrl = `/disputes/view.html?cid=${encodeURIComponent(cid)}`;
  return `
    <article class="dispute-item">
      <div>
        <div><a class="dispute-cid" href="${viewUrl}" title="${escapeHtml(cid)}">${escapeHtml(truncateCid(cid))}</a></div>
        <div class="dispute-meta">
          <span>${escapeHtml(claimTypeLabel(dispute.claim_type))}</span>
          <span>Filed ${escapeHtml(formatDisputeDate(dispute.created_at))}</span>
          <span>Expires ${escapeHtml(formatDisputeDate(dispute.expires_at))}</span>
        </div>
      </div>
      <div>
        <span class="dispute-badge status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
        <a class="btn btn-secondary btn-sm" href="${viewUrl}">View details</a>
      </div>
    </article>
  `;
}

async function loadPage(reset) {
  if (reset) {
    offset = 0;
    loaded = 0;
    listEl.innerHTML = '<p class="dispute-empty">Loading disputes…</p>';
  }
  errorEl.classList.add('hidden');
  loadMoreButton.disabled = true;

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (claimFilter.value) params.set('claim_type', claimFilter.value);

  try {
    const response = await fetch(`/api/disputes?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const disputes = data.disputes || [];

    if (reset) listEl.innerHTML = '';
    if (reset && disputes.length === 0) {
      listEl.innerHTML = '<p class="dispute-empty">There are no open disputes.</p>';
    } else {
      listEl.insertAdjacentHTML('beforeend', disputes.map(renderDispute).join(''));
    }

    loaded += disputes.length;
    offset += disputes.length;
    const total = Number(data.total) || loaded;
    totalEl.textContent = `${total.toLocaleString('en-US')} open`;
    loadMoreButton.classList.toggle('hidden', loaded >= total || disputes.length === 0);
  } catch (error) {
    console.error('Failed to load disputes:', error);
    if (reset) listEl.innerHTML = '';
    errorEl.textContent = 'Unable to load disputes right now. Please try again later.';
    errorEl.classList.remove('hidden');
  } finally {
    loadMoreButton.disabled = false;
  }
}

claimFilter.addEventListener('change', () => loadPage(true));
loadMoreButton.addEventListener('click', () => loadPage(false));
loadPage(true);
