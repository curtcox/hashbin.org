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
            <label><input type="checkbox" class="edit-origin-ack"> I acknowledge the <a href="/docs/browser-client-safety">shared-origin storage risk</a>.</label>
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" class="btn btn-secondary btn-sm cancel-edit">Cancel</button>
          </form>
          <section class="developers-safety" aria-live="polite"><p class="developers-safety-state">Safety check: loading…</p></section>
          <div class="developers-app-actions">
            <button type="button" class="btn btn-secondary btn-sm check-safety">Check safety</button>
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
        redirect_uris: parseRedirectUris(editForm.querySelector('.edit-uris').value),
        shared_origin_acknowledged: editForm.querySelector('.edit-origin-ack').checked
      });
    });
    card.querySelector('.delete-app').addEventListener('click', () => deleteApp(appId));
    card.querySelector('.check-safety').addEventListener('click', () => loadSafety(card, 'POST'));
    loadSafety(card, 'GET');
  }
}

const SAFETY_LABELS = { warn: 'Fix', info: 'Consider', ok: 'OK' };

// HashBin reads each published redirect page and reports problems from the security notes.
async function loadSafety(card, method) {
  const section = card.querySelector('.developers-safety');
  const button = card.querySelector('.check-safety');
  if (method === 'POST') { button.disabled = true; section.innerHTML = '<p class="developers-safety-state">Checking your published pages…</p>'; }
  try {
    const response = await authenticatedFetch(`/api/developers/apps/${encodeURIComponent(card.dataset.appId)}/safety`, { method });
    const result = await checkAppResponse(response);
    renderSafety(section, result);
  } catch (error) {
    section.innerHTML = `<p class="developers-safety-state">${escapeHtml(error.message || 'Safety check failed.')}</p>`;
  } finally { button.disabled = false; }
}

function renderSafety(section, result) {
  if (!result.checked_at) { section.innerHTML = '<p class="developers-safety-state">Safety check: not run yet. HashBin also checks registered apps nightly.</p>'; return; }
  const order = { warn: 0, info: 1, ok: 2 };
  section.innerHTML = `
    <h4>Safety check <small>${escapeHtml(new Date(result.checked_at).toLocaleString())}${result.throttled ? ' (checked within the last minute)' : ''}</small></h4>
    ${result.pages.map(page => `
      <p><code>${escapeHtml(page.url)}</code></p>
      ${page.error ? `<p>${escapeHtml(page.error)}</p>` : `<ul>${[...page.findings].sort((a, b) => order[a.level] - order[b.level]).map(item => `
        <li><strong>${SAFETY_LABELS[item.level] || ''}:</strong> ${escapeHtml(item.message)} <a href="${escapeHtml(item.link)}">Details</a></li>`).join('')}</ul>`}
    `).join('')}
    ${result.skipped?.length ? `<p>Not checked (local or non-HTTPS): ${result.skipped.map(uri => `<code>${escapeHtml(uri)}</code>`).join(', ')}</p>` : ''}
    <p><a href="/docs/security/">Security notes</a></p>`;
}

async function checkAppResponse(response) {
  if (!response.ok) {
    const data = await response.clone().json().catch(() => ({}));
    if (data.error === 'shared_origin_acknowledgement_required') {
      const origins = (data.warnings || []).map(warning => `${warning.origin} (${warning.apps.length} other registered apps${warning.apps.length ? ': ' + warning.apps.map(app => app.app_name).join(', ') : ''})`).join('; ');
      throw new Error(`${data.message} Origins: ${origins}`);
    }
  }
  return handleApiError(response);
}

async function updateApp(appId, changes) {
  try {
    const response = await authenticatedFetch(`/api/developers/apps/${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes)
    });
    await checkAppResponse(response);
    showToast('Application updated', 'success');
    await loadApps();
  } catch (error) {
    showToast(error.message || 'Failed to update application.', 'error', 5000);
  }
}

async function deleteApp(appId) {
  const confirmed = window.confirm(
    'Delete this application? Users can no longer authorize it, existing tokens stop refreshing, and access tokens expire within 15 minutes. This cannot be undone.'
  );
  if (!confirmed) return;
  try {
    const response = await authenticatedFetch(`/api/developers/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' });
    await checkAppResponse(response);
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
    await checkAppResponse(response);
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
        redirect_uris: redirectUris,
        shared_origin_acknowledged: document.getElementById('shared-origin-ack').checked
      })
    });
    await checkAppResponse(response);

    const app = await response.json();
    statusEl.textContent = 'Application created.';
    outputEl.classList.remove('hidden');
    outputEl.innerHTML = `
      <strong>${escapeHtml(app.app_name)}</strong>
      <div>Client ID <code>${escapeHtml(app.client_id)}</code></div>
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
