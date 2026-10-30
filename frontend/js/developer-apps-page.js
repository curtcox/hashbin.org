import { requireAuth } from '/js/auth-gate.js';
import { renderNavHeader } from '/js/nav-header.js';
import { escapeHtml } from '/js/html.js';
import { fetchApps, renderAppDetails } from '/js/developer-apps.js';
import {
  SAFETY_FILTERS, SANDBOX_FILTERS, DEFAULT_LIST_STATE,
  filterApps, sortApps, safetyState, safetyLabel, sandboxStatus, updatedAt, readListState, writeListState
} from '/js/developer-apps-list.js';

renderNavHeader();
await requireAuth();

const listEl = document.getElementById('apps-table');
const countEl = document.getElementById('apps-count');
const controls = {
  q: document.getElementById('apps-search'),
  sandbox: document.getElementById('apps-sandbox'),
  safety: document.getElementById('apps-safety'),
  sort: document.getElementById('apps-sort')
};
const dirButton = document.getElementById('apps-dir');

let apps = [];
let state = readListState(location.search);
// Rows stay open across re-renders (filtering, sorting, saving an edit).
const expanded = new Set();

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: null, label: 'Client ID', className: 'col-secondary' },
  { key: 'sandbox', label: 'Hosted sandbox' },
  { key: 'safety', label: 'Safety' },
  { key: 'created', label: 'Created', className: 'col-secondary' },
  { key: 'updated', label: 'Updated' }
];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function redirectHint(app) {
  const [first, ...rest] = app.redirect_uris || [];
  return first ? `${first}${rest.length ? ` +${rest.length} more` : ''}` : '';
}

function syncControls() {
  // Only write changed values so typing in the search box keeps its caret.
  for (const [name, control] of Object.entries(controls)) if (control.value !== state[name]) control.value = state[name];
  dirButton.textContent = state.dir === 'asc' ? '↑ Ascending' : '↓ Descending';
  dirButton.setAttribute('aria-label', `Sort direction: ${state.dir === 'asc' ? 'ascending' : 'descending'}`);
  history.replaceState(null, '', `${location.pathname}${writeListState(state)}${location.hash}`);
}

function setState(changes) {
  state = { ...state, ...changes };
  syncControls();
  render();
}

function summaryCells(app) {
  const sandbox = sandboxStatus(app);
  const safety = safetyState(app.safety);
  return `
    <td><span class="developers-badge developers-badge-${escapeHtml(sandbox)}">${escapeHtml(SANDBOX_FILTERS[sandbox] || sandbox)}</span></td>
    <td><span class="developers-badge developers-badge-${safety}">${escapeHtml(safetyLabel(app.safety))}</span>
      ${app.safety?.checked_at ? `<small title="${escapeHtml(new Date(app.safety.checked_at).toLocaleString())}">checked ${escapeHtml(formatDate(app.safety.checked_at))}</small>` : ''}</td>`;
}

function render() {
  if (!apps.length) {
    countEl.textContent = '';
    listEl.innerHTML = '<p class="developers-list-state">No applications yet. <a href="/developers#register">Register one</a> to start integrating OAuth publishing.</p>';
    return;
  }

  const shown = sortApps(filterApps(apps, state), state.sort, state.dir);
  countEl.textContent = shown.length === apps.length
    ? `${apps.length} app${apps.length === 1 ? '' : 's'}`
    : `Showing ${shown.length} of ${apps.length} apps`;

  if (!shown.length) {
    listEl.innerHTML = '<p class="developers-list-state">No apps match these filters. <button type="button" class="btn btn-secondary btn-sm" id="clear-filters">Clear filters</button></p>';
    document.getElementById('clear-filters').addEventListener('click', () => setState({ q: '', sandbox: '', safety: '' }));
    return;
  }

  const ariaSort = key => (key === state.sort ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  // eslint-disable-next-line no-unsanitized/property -- every API value below is escaped; column labels are constants
  listEl.innerHTML = `
    <table class="developers-apps-table">
      <thead><tr>
        ${COLUMNS.map(column => `<th scope="col" class="${column.className || ''}"${column.key ? ` aria-sort="${ariaSort(column.key)}"` : ''}>
          ${column.key ? `<button type="button" class="developers-sort" data-sort="${column.key}">${column.label}</button>` : column.label}</th>`).join('')}
      </tr></thead>
      ${shown.map(app => {
        const open = expanded.has(app.app_id);
        return `<tbody data-app-id="${escapeHtml(app.app_id)}">
          <tr class="developers-app-row" id="${escapeHtml(app.app_id)}">
            <td>
              <button type="button" class="developers-app-toggle" aria-expanded="${open}" aria-controls="details-${escapeHtml(app.app_id)}">${escapeHtml(app.app_name)}</button>
              <small class="developers-app-hint">${escapeHtml(redirectHint(app))}</small>
            </td>
            <td class="col-secondary"><code>${escapeHtml(app.client_id)}</code></td>
            ${summaryCells(app)}
            <td class="col-secondary col-date" title="${escapeHtml(app.created_at || '')}">${escapeHtml(formatDate(app.created_at))}</td>
            <td class="col-date" data-label="Updated" title="${escapeHtml(updatedAt(app))}">${escapeHtml(formatDate(updatedAt(app)))}</td>
          </tr>
          <tr class="developers-app-details"${open ? '' : ' hidden'}><td colspan="${COLUMNS.length}"><div id="details-${escapeHtml(app.app_id)}"></div></td></tr>
        </tbody>`;
      }).join('')}
    </table>`;

  for (const group of listEl.querySelectorAll('tbody[data-app-id]')) {
    const app = apps.find(entry => entry.app_id === group.dataset.appId);
    const toggle = group.querySelector('.developers-app-toggle');
    toggle.addEventListener('click', () => setExpanded(group, app, !expanded.has(app.app_id)));
    if (expanded.has(app.app_id)) renderAppDetails(group.querySelector('.developers-app-details div'), app, { onChange: loadApps });
  }
  for (const button of listEl.querySelectorAll('.developers-sort')) {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      // Dates start newest first; text and status start at the top of their order.
      const firstDir = ['created', 'updated'].includes(key) ? 'desc' : 'asc';
      setState({ sort: key, dir: key === state.sort ? (state.dir === 'asc' ? 'desc' : 'asc') : firstDir });
    });
  }
}

function setExpanded(group, app, open) {
  const details = group.querySelector('.developers-app-details');
  group.querySelector('.developers-app-toggle').setAttribute('aria-expanded', String(open));
  details.hidden = !open;
  if (open) {
    expanded.add(app.app_id);
    // Sandbox and safety details load only when a row is opened, not once per app.
    renderAppDetails(details.querySelector('div'), app, { onChange: loadApps });
  } else {
    expanded.delete(app.app_id);
  }
}

// A save or check inside an open panel changes that row's badges; refresh the list data
// and redraw only those cells so the open panel (and anything typed in it) survives.
async function refreshRow(event) {
  const group = event.target.closest('tbody[data-app-id]');
  if (!group) return;
  try {
    apps = await fetchApps();
  } catch { return; }
  const app = apps.find(entry => entry.app_id === group.dataset.appId);
  const row = group.querySelector('.developers-app-row');
  if (!app || !row) return;
  const cells = row.querySelectorAll('td');
  const template = document.createElement('tr');
  // eslint-disable-next-line no-unsanitized/property -- summaryCells escapes every API value
  template.innerHTML = summaryCells(app);
  cells[2].replaceWith(template.children[0]);
  cells[3].replaceWith(template.children[0]);
}

async function loadApps() {
  if (!apps.length) listEl.innerHTML = '<p class="developers-list-state">Loading applications...</p>';
  try {
    apps = await fetchApps();
    const ids = new Set(apps.map(app => app.app_id));
    for (const id of expanded) if (!ids.has(id)) expanded.delete(id);
    render();
  } catch (error) {
    listEl.innerHTML = `<p class="developers-list-state">${escapeHtml(error.message || 'Unable to load applications.')}</p>`;
  }
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const group = id && [...listEl.querySelectorAll('tbody[data-app-id]')].find(entry => entry.dataset.appId === id);
  if (!group) return;
  if (!expanded.has(id)) setExpanded(group, apps.find(app => app.app_id === id), true);
  group.scrollIntoView({ block: 'start' });
  group.querySelector('.developers-app-toggle').focus({ preventScroll: true });
}

function fillOptions(select, labels, allLabel) {
  select.append(new Option(allLabel, ''), ...Object.entries(labels).map(([value, label]) => new Option(label, value)));
}

fillOptions(controls.sandbox, SANDBOX_FILTERS, 'Any sandbox status');
fillOptions(controls.safety, SAFETY_FILTERS, 'Any safety result');
document.getElementById('apps-toolbar').addEventListener('submit', event => event.preventDefault());
controls.q.addEventListener('input', () => setState({ q: controls.q.value }));
for (const name of ['sandbox', 'safety', 'sort']) controls[name].addEventListener('change', () => setState({ [name]: controls[name].value }));
dirButton.addEventListener('click', () => setState({ dir: state.dir === 'asc' ? 'desc' : 'asc' }));
document.getElementById('refresh-apps').addEventListener('click', loadApps);
document.getElementById('reset-view').addEventListener('click', () => setState({ ...DEFAULT_LIST_STATE }));
listEl.addEventListener('app-safety-change', refreshRow);
listEl.addEventListener('app-run-change', refreshRow);
window.addEventListener('hashchange', openFromHash);

syncControls();
await loadApps();
openFromHash();
