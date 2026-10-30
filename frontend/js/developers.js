import { requireAuth } from '/js/auth-gate.js';
import { authenticatedFetch, showToast } from '/js/utils.js';
import { renderNavHeader } from '/js/nav-header.js';
import { escapeHtml } from '/js/html.js';
import { checkAppResponse, fetchApps, parseRedirectUris } from '/js/developer-apps.js';
import { safetyLabel, safetyState, sortApps, summarizeApps } from '/js/developer-apps-list.js';

renderNavHeader();
await requireAuth();

const form = document.getElementById('app-registration-form');
const statusEl = document.getElementById('registration-status');
const outputEl = document.getElementById('new-app-output');
const summaryEl = document.getElementById('apps-summary');

const RECENT_COUNT = 5;

const manageUrl = app => `/developers/apps#${encodeURIComponent(app.app_id)}`;

// The full list lives on /developers/apps; this page shows counts and the latest changes.
function renderSummary(apps) {
  if (!apps.length) {
    summaryEl.innerHTML = '<p class="developers-list-state">No applications yet. Register one to start integrating OAuth publishing.</p>';
    return;
  }

  const counts = summarizeApps(apps);
  const recent = sortApps(apps, 'updated', 'desc').slice(0, RECENT_COUNT);
  const stat = (value, label, href) => {
    const body = `<strong>${Number(value).toLocaleString()}</strong><span>${label}</span>`;
    return href && value ? `<a class="developers-stat" href="${href}">${body}</a>` : `<div class="developers-stat">${body}</div>`;
  };
  // eslint-disable-next-line no-unsanitized/property -- API values are escaped or passed through Number(); labels and links are constants
  summaryEl.innerHTML = `
    <div class="developers-summary-stats">
      ${stat(counts.total, counts.total === 1 ? 'app' : 'apps', '/developers/apps')}
      ${stat(counts.sandboxActive, 'hosted sandboxes on', '/developers/apps?sandbox=active')}
      ${stat(counts.needFixes, counts.needFixes === 1 ? 'needs safety fixes' : 'need safety fixes', '/developers/apps?safety=fix')}
      ${stat(counts.unchecked, 'never checked', '/developers/apps?safety=unchecked')}
    </div>
    <h3>Recently updated</h3>
    <ul class="developers-recent">
      ${recent.map(app => `<li>
        <a href="${escapeHtml(manageUrl(app))}">${escapeHtml(app.app_name)}</a>
        <span class="developers-badge developers-badge-${safetyState(app.safety)}">${escapeHtml(safetyLabel(app.safety))}</span>
      </li>`).join('')}
    </ul>
    ${apps.length > RECENT_COUNT ? `<p><a href="/developers/apps">See all ${Number(apps.length).toLocaleString()} apps</a></p>` : ''}`;
}

async function loadApps() {
  summaryEl.innerHTML = '<p class="developers-list-state">Loading applications...</p>';
  try {
    renderSummary(await fetchApps());
  } catch (error) {
    summaryEl.innerHTML = `<p class="developers-list-state">${escapeHtml(error.message || 'Unable to load applications.')}</p>`;
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
      <div><a href="${escapeHtml(manageUrl(app))}">Manage this app</a></div>
    `;
    form.reset();
    showToast('Application registered', 'success');
    await loadApps();
  } catch (error) {
    statusEl.textContent = error.message || 'Failed to create application.';
    showToast(statusEl.textContent, 'error', 5000);
  }
});

await loadApps();
