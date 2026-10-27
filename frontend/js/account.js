import { downloadApi, browseWithBudget, mountCapForm } from '/js/download-budget-ui.js';
import { requireAuth } from '/js/auth-gate.js';
import { escapeHtml } from '/js/html.js';
import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';

renderNavHeader();
await requireAuth();

const retentionForm = document.getElementById('retention-form');
const retentionSelect = document.getElementById('default-retention-months');
const retentionStatus = document.getElementById('retention-status');
const authorizationsList = document.getElementById('authorizations-list');
const refreshButton = document.getElementById('refresh-authorizations');

function describeLimits(caveats = {}) {
  const limits = [];
  limits.push(caveats.monthly_spend_limit_cents === undefined
    ? 'No monthly spending limit'
    : `$${(caveats.monthly_spend_limit_cents / 100).toFixed(2)} monthly spending limit`);
  if (caveats.max_retention_months) limits.push(`retention up to ${caveats.max_retention_months} months`);
  if (caveats.max_upload_bytes) limits.push(`uploads up to ${caveats.max_upload_bytes} bytes`);
  if (caveats.content_types) limits.push(`only ${caveats.content_types.join(', ')}`);
  if (caveats.cids) limits.push(`only ${caveats.cids.length} listed CID${caveats.cids.length === 1 ? '' : 's'}`);
  limits.push(caveats.expires_at ? `expires ${new Date(caveats.expires_at).toLocaleDateString()}` : 'no expiry');
  return limits.join(' · ');
}

async function updateAuthorization(grantId, update) {
  const response = await authenticatedFetch(`/api/account/authorizations/${encodeURIComponent(grantId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  });
  await handleApiError(response);
  return response.json();
}

function renderAuthorizations(authorizations) {
  if (!authorizations.length) {
    authorizationsList.innerHTML = `
      <div class="account-empty-state">
        No third-party apps are currently authorized to publish with your account.
      </div>
    `;
    return;
  }

  authorizationsList.innerHTML = `
    <div class="account-authorizations-grid">
      ${authorizations.map((authorization) => `
        <article class="account-authorization-card">
          <h3>${escapeHtml(authorization.app_name)}</h3>
          <p>${escapeHtml(describeLimits(authorization.caveats))}</p>
          <p class="account-muted">Approved ${escapeHtml(new Date(authorization.created_at).toLocaleDateString())}</p>
          <div class="account-chip-row">
            ${(authorization.scopes || []).map((scope) => `<label class="account-chip"><input type="checkbox" class="grant-scope" value="${escapeHtml(scope)}" checked> ${escapeHtml(scope)}</label>`).join('')}
          </div>
          <div class="account-narrow-row">
            <button class="btn btn-secondary narrow-scopes" type="button" data-grant-id="${escapeHtml(authorization.grant_id)}">Remove unchecked permissions</button>
            <label>Lower monthly limit ($)
              <input class="grant-limit" type="number" min="0.01" step="0.01"${authorization.caveats?.monthly_spend_limit_cents === undefined ? '' : ` max="${authorization.caveats.monthly_spend_limit_cents / 100}"`}>
            </label>
            <button class="btn btn-secondary lower-limit" type="button" data-grant-id="${escapeHtml(authorization.grant_id)}">Set limit</button>
          </div>
          ${authorization.redirect_uris?.length ? `
            <ul class="account-authorization-list">
              ${authorization.redirect_uris.map((uri) => `<li><code>${escapeHtml(uri)}</code></li>`).join('')}
            </ul>
          ` : ''}
          ${(authorization.scopes || []).includes('downloads:spend') ? `<div class="grant-download-caps" data-grant-id="${escapeHtml(authorization.grant_id)}"></div>` : ''}
          <button class="btn btn-secondary revoke-authorization" type="button" data-grant-id="${escapeHtml(authorization.grant_id)}">
            Revoke access
          </button>
        </article>
      `).join('')}
    </div>
  `;

  for (const [index, container] of [...authorizationsList.querySelectorAll('.grant-download-caps')].entries()) {
    const id = container.dataset.grantId;
    mountCapForm(container, `grant-download-${index}`, downloadBudgetData?.keys?.[id], caps => downloadApi(`/api/oauth/grants/${encodeURIComponent(id)}/download-budget`, 'PUT', { caps }));
  }
  const byGrant = Object.fromEntries(authorizations.map((authorization) => [authorization.grant_id, authorization]));
  for (const button of authorizationsList.querySelectorAll('.narrow-scopes')) {
    button.addEventListener('click', async () => {
      const card = button.closest('.account-authorization-card');
      const scopes = [...card.querySelectorAll('.grant-scope:checked')].map((box) => box.value);
      if (!scopes.length) {
        showToast('Keep at least one permission, or revoke the app instead', 'error');
        return;
      }
      try {
        await updateAuthorization(button.dataset.grantId, { scopes });
        showToast('App permissions narrowed', 'success');
        await loadAuthorizations();
      } catch (error) {
        showToast(error.message || 'Failed to change app permissions', 'error', 5000);
      }
    });
  }
  for (const button of authorizationsList.querySelectorAll('.lower-limit')) {
    button.addEventListener('click', async () => {
      const card = button.closest('.account-authorization-card');
      const dollars = Number(card.querySelector('.grant-limit').value);
      if (!(dollars > 0)) {
        showToast('Enter a positive dollar amount', 'error');
        return;
      }
      const caveats = { ...(byGrant[button.dataset.grantId]?.caveats || {}), monthly_spend_limit_cents: Math.round(dollars * 100) };
      try {
        await updateAuthorization(button.dataset.grantId, { caveats });
        showToast('Monthly limit lowered', 'success');
        await loadAuthorizations();
      } catch (error) {
        showToast(error.message || 'Failed to lower the limit', 'error', 5000);
      }
    });
  }
  for (const button of authorizationsList.querySelectorAll('.revoke-authorization')) {
    button.addEventListener('click', async () => {
      const grantId = button.getAttribute('data-grant-id');
      if (!grantId) return;

      if (!window.confirm('Revoke this app? It will immediately lose access until you authorize it again.')) {
        return;
      }

      button.disabled = true;
      try {
        const response = await authenticatedFetch(`/api/account/authorizations/${encodeURIComponent(grantId)}`, {
          method: 'DELETE'
        });
        await handleApiError(response);
        showToast('App authorization revoked', 'success');
        await loadAuthorizations();
      } catch (error) {
        button.disabled = false;
        showToast(error.message || 'Failed to revoke app authorization', 'error', 5000);
      }
    });
  }
}

async function loadSettings() {
  try {
    const response = await authenticatedFetch('/api/account/settings');
    await handleApiError(response);
    const settings = await response.json();
    retentionSelect.value = String(settings.default_retention_months || 1);
  } catch (error) {
    retentionStatus.textContent = error.message || 'Unable to load account settings.';
  }
}

async function loadAuthorizations() {
  authorizationsList.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem;">
      <div class="spinner"></div>
      <span>Loading authorized apps...</span>
    </div>
  `;

  try {
    const response = await authenticatedFetch('/api/account/authorizations');
    await handleApiError(response);
    const data = await response.json();
    renderAuthorizations(data.authorizations || []);
  } catch (error) {
    authorizationsList.innerHTML = `
      <div class="account-empty-state">${error.message || 'Unable to load authorized apps.'}</div>
    `;
  }
}

retentionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  retentionStatus.textContent = 'Saving default retention...';

  try {
    const response = await authenticatedFetch('/api/account/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        default_retention_months: parseInt(retentionSelect.value, 10)
      })
    });
    await handleApiError(response);
    retentionStatus.textContent = 'Default retention saved.';
    showToast('Default retention updated', 'success');
  } catch (error) {
    retentionStatus.textContent = error.message || 'Unable to save default retention.';
    showToast(retentionStatus.textContent, 'error', 5000);
  }
});

refreshButton.addEventListener('click', () => {
  loadAuthorizations();
});

let downloadBudgetData;
async function loadDownloadBudget() {
  const status = document.getElementById('download-budget-usage');
  try {
    downloadBudgetData = await downloadApi('/api/downloads/budget');
    mountCapForm(document.getElementById('download-account-caps'), 'account-download', downloadBudgetData.account, account => downloadApi('/api/downloads/budget', 'PUT', { account }));
    const b = downloadBudgetData;
    status.textContent = `Spent today: $${(b.spend.account.day_uc / 1e8).toFixed(6)}. This month: $${(b.spend.account.month_uc / 1e8).toFixed(6)}. Spending credit: $${(b.float_uc / 1e8).toFixed(6)}.`;
    await loadDownloadSessions();
  } catch (error) { status.textContent = error.message; }
}
async function loadDownloadSessions() {
  const data = await downloadApi('/api/downloads/sessions');
  const container = document.getElementById('download-sessions');
  container.replaceChildren();
  for (const session of data.sessions) {
    const row = document.createElement('p');
    row.textContent = `${session.created_at} — ${session.revoked_at ? 'Revoked' : session.expires_at <= Date.now() ? 'Expired' : session.active ? 'Active' : 'Pending handshake'} `;
    if (!session.revoked_at) {
      const button = document.createElement('button'); button.className = 'btn btn-secondary'; button.textContent = 'Revoke';
      button.addEventListener('click', async () => {
        try { await downloadApi('/api/downloads/sessions', 'DELETE', { session_id: session.session_id }); await loadDownloadSessions(); }
        catch (error) { showToast(error.message, 'error'); }
      });
      row.append(button);
    }
    container.append(row);
  }
  if (!data.sessions.length) container.textContent = 'No download sessions.';
}
document.getElementById('download-browser-enable').addEventListener('click', async () => {
  try { await browseWithBudget(); } catch (error) { showToast(error.message, 'error'); }
});
await loadDownloadBudget();
await Promise.all([loadSettings(), loadAuthorizations()]);
