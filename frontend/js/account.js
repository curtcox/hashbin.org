import { requireAuth } from '/js/auth-gate.js';
import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';

renderNavHeader();
await requireAuth();

const retentionForm = document.getElementById('retention-form');
const retentionSelect = document.getElementById('default-retention-months');
const retentionStatus = document.getElementById('retention-status');
const authorizationsList = document.getElementById('authorizations-list');
const refreshButton = document.getElementById('refresh-authorizations');

function formatMoneyLimit(limit) {
  if (limit === null || limit === undefined) {
    return 'Unlimited monthly spend';
  }
  return `$${Number(limit).toFixed(2)} monthly spend cap`;
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
          <h3>${authorization.app_name}</h3>
          <p>${formatMoneyLimit(authorization.spending_limit)}</p>
          <div class="account-chip-row">
            ${(authorization.scopes || []).map((scope) => `<span class="account-chip">${scope}</span>`).join('')}
          </div>
          ${authorization.redirect_uris?.length ? `
            <ul class="account-authorization-list">
              ${authorization.redirect_uris.map((uri) => `<li><code>${uri}</code></li>`).join('')}
            </ul>
          ` : ''}
          <button class="btn btn-secondary revoke-authorization" type="button" data-app-id="${authorization.app_id}">
            Revoke access
          </button>
        </article>
      `).join('')}
    </div>
  `;

  for (const button of authorizationsList.querySelectorAll('.revoke-authorization')) {
    button.addEventListener('click', async () => {
      const appId = button.getAttribute('data-app-id');
      if (!appId) return;

      if (!window.confirm('Revoke this app? It will immediately lose publishing access until the user authorizes it again.')) {
        return;
      }

      button.disabled = true;
      try {
        const response = await authenticatedFetch(`/api/account/authorizations/${encodeURIComponent(appId)}`, {
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

await Promise.all([loadSettings(), loadAuthorizations()]);
