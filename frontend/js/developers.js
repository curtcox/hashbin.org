import { requireAuth } from '/js/auth-gate.js';
import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';
import { escapeHtml } from '/js/html.js';

renderNavHeader();
await requireAuth();

const form = document.getElementById('app-registration-form');
const statusEl = document.getElementById('registration-status');
const outputEl = document.getElementById('new-app-output');
const appsListEl = document.getElementById('apps-list');
const refreshButton = document.getElementById('refresh-apps');

function parseRedirectUris(rawValue) {
  return rawValue
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

function renderAppList(apps) {
  if (!apps.length) {
    appsListEl.innerHTML = '<p class="developers-list-state">No applications yet. Register one to start integrating OAuth publishing.</p>';
    return;
  }

  appsListEl.innerHTML = `
    <div class="developers-app-list">
      ${apps.map((app) => `
        <article class="developers-app-card" data-app-id="${escapeHtml(app.app_id)}">
          <h3>${escapeHtml(app.app_name)}</h3>
          <p><strong>Client ID:</strong> <code>${escapeHtml(app.client_id)}</code></p>
          <p><strong>Status:</strong> ${escapeHtml(app.status)}</p>
          <ul>
            ${app.redirect_uris.map((redirectUri) => `<li><code>${escapeHtml(redirectUri)}</code></li>`).join('')}
          </ul>
          <form class="developers-edit-form hidden">
            <label class="form-label">App name <input class="form-input edit-name" maxlength="100" value="${escapeHtml(app.app_name)}"></label>
            <label class="form-label">Redirect URIs (one per line)
              <textarea class="form-input edit-uris" rows="3">${escapeHtml(app.redirect_uris.join('\n'))}</textarea>
            </label>
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" class="btn btn-secondary btn-sm cancel-edit">Cancel</button>
          </form>
          <div class="developers-app-actions">
            <button type="button" class="btn btn-secondary btn-sm edit-app">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm delete-app">Delete</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  for (const card of appsListEl.querySelectorAll('.developers-app-card')) {
    const appId = card.dataset.appId;
    const editForm = card.querySelector('.developers-edit-form');
    card.querySelector('.edit-app').addEventListener('click', () => editForm.classList.remove('hidden'));
    card.querySelector('.cancel-edit').addEventListener('click', () => editForm.classList.add('hidden'));
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      updateApp(appId, {
        app_name: editForm.querySelector('.edit-name').value.trim(),
        redirect_uris: parseRedirectUris(editForm.querySelector('.edit-uris').value)
      });
    });
    card.querySelector('.delete-app').addEventListener('click', () => deleteApp(appId));
  }
}

async function updateApp(appId, changes) {
  try {
    const response = await authenticatedFetch(`/api/developers/apps/${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes)
    });
    await handleApiError(response);
    showToast('Application updated', 'success');
    await loadApps();
  } catch (error) {
    showToast(error.message || 'Failed to update application.', 'error', 5000);
  }
}

async function deleteApp(appId) {
  const confirmed = window.confirm(
    'Delete this application? Users can no longer authorize it, existing tokens stop refreshing, and access tokens expire within an hour. This cannot be undone.'
  );
  if (!confirmed) return;
  try {
    const response = await authenticatedFetch(`/api/developers/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' });
    await handleApiError(response);
    showToast('Application deleted', 'success');
    await loadApps();
  } catch (error) {
    showToast(error.message || 'Failed to delete application.', 'error', 5000);
  }
}

async function loadApps() {
  appsListEl.innerHTML = '<p class="developers-list-state">Loading applications...</p>';

  try {
    const response = await authenticatedFetch('/api/developers/apps');
    await handleApiError(response);
    const data = await response.json();
    renderAppList(data.apps || []);
  } catch (error) {
    appsListEl.innerHTML = `<p class="developers-list-state">${escapeHtml(error.message || 'Unable to load applications.')}</p>`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Creating application...';
  outputEl.classList.add('hidden');
  outputEl.innerHTML = '';

  const redirectUris = parseRedirectUris(document.getElementById('redirect-uris').value);

  try {
    const response = await authenticatedFetch('/api/developers/apps', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        app_name: document.getElementById('app-name').value.trim(),
        redirect_uris: redirectUris
      })
    });
    await handleApiError(response);

    const app = await response.json();
    statusEl.textContent = 'Application created. Copy the client secret now.';
    outputEl.classList.remove('hidden');
    outputEl.innerHTML = `
      <strong>${escapeHtml(app.app_name)}</strong>
      <div>Client ID <code>${escapeHtml(app.client_id)}</code></div>
      <div>Client Secret <code>${escapeHtml(app.client_secret)}</code></div>
    `;
    form.reset();
    showToast('Application registered', 'success');
    await loadApps();
  } catch (error) {
    statusEl.textContent = error.message || 'Failed to create application.';
    showToast(statusEl.textContent, 'error', 5000);
  }
});

refreshButton.addEventListener('click', () => {
  loadApps();
});

await loadApps();
