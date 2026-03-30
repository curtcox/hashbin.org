import { requireAuth } from '/js/auth-gate.js';
import { authenticatedFetch, handleApiError, showToast } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';

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
        <article class="developers-app-card">
          <h3>${app.app_name}</h3>
          <p><strong>Client ID:</strong> <code>${app.client_id}</code></p>
          <p><strong>Status:</strong> ${app.status}</p>
          <ul>
            ${app.redirect_uris.map((redirectUri) => `<li><code>${redirectUri}</code></li>`).join('')}
          </ul>
        </article>
      `).join('')}
    </div>
  `;
}

async function loadApps() {
  appsListEl.innerHTML = '<p class="developers-list-state">Loading applications...</p>';

  try {
    const response = await authenticatedFetch('/api/developers/apps');
    await handleApiError(response);
    const data = await response.json();
    renderAppList(data.apps || []);
  } catch (error) {
    appsListEl.innerHTML = `<p class="developers-list-state">${error.message || 'Unable to load applications.'}</p>`;
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
      <strong>${app.app_name}</strong>
      <div>Client ID <code>${app.client_id}</code></div>
      <div>Client Secret <code>${app.client_secret}</code></div>
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
