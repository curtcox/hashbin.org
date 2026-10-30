/**
 * Filtering, sorting and summarizing a developer's registered apps. Pure functions,
 * shared by /developers (summary) and /developers/apps (the full table).
 */

/** Worst first, so sorting by safety brings the apps that need attention to the top. */
const SAFETY_RANK = { fix: 0, unreadable: 1, consider: 2, unchecked: 3, clear: 4 };

export const SAFETY_FILTERS = {
  fix: 'Needs fixes',
  unreadable: 'Page unreadable',
  consider: 'Has suggestions',
  clear: 'All clear',
  unchecked: 'Never checked'
};

export const SANDBOX_FILTERS = { active: 'Active', off: 'Off', suspended: 'Suspended' };

export const SORT_KEYS = ['name', 'sandbox', 'safety', 'created', 'updated'];

export const DEFAULT_LIST_STATE = Object.freeze({ q: '', sandbox: '', safety: '', sort: 'updated', dir: 'desc' });

/**
 * The single state that best describes an app's latest safety check.
 * @param {{fix:number, consider:number, unreadable:number}|null} summary From GET /api/developers/apps
 * @returns {'fix'|'unreadable'|'consider'|'clear'|'unchecked'}
 */
export function safetyState(summary) {
  if (!summary) return 'unchecked';
  if (summary.fix) return 'fix';
  if (summary.unreadable) return 'unreadable';
  if (summary.consider) return 'consider';
  return 'clear';
}

/**
 * Short text for the safety column.
 * @param {{fix:number, consider:number, unreadable:number}|null} summary From GET /api/developers/apps
 * @returns {string}
 */
export function safetyLabel(summary) {
  switch (safetyState(summary)) {
    case 'fix': return `${summary.fix} to fix`;
    case 'unreadable': return `${summary.unreadable} page${summary.unreadable === 1 ? '' : 's'} unreadable`;
    case 'consider': return `${summary.consider} to consider`;
    case 'clear': return 'All clear';
    default: return 'Not checked';
  }
}

/** @param {object} app @returns {string} 'active', 'off' or 'suspended' */
export function sandboxStatus(app) {
  return app.run?.status || 'off';
}

/** @param {object} app @returns {string} ISO time of the last change, falling back to creation */
export function updatedAt(app) {
  return app.updated_at || app.created_at || '';
}

/**
 * Apps matching every filter that is set. The text search matches name, client ID and redirect URIs.
 * @param {object[]} apps From GET /api/developers/apps
 * @param {{q?:string, sandbox?:string, safety?:string}} filters Empty values match everything
 * @returns {object[]}
 */
export function filterApps(apps, { q = '', sandbox = '', safety = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return apps.filter(app =>
    (!needle || [app.app_name, app.client_id, ...(app.redirect_uris || [])].some(value => String(value).toLowerCase().includes(needle))) &&
    (!sandbox || sandboxStatus(app) === sandbox) &&
    (!safety || safetyState(app.safety) === safety));
}

function compareBy(key) {
  switch (key) {
    case 'name': return (a, b) => a.app_name.localeCompare(b.app_name, undefined, { sensitivity: 'base', numeric: true });
    case 'sandbox': return (a, b) => sandboxStatus(a).localeCompare(sandboxStatus(b));
    // More findings sort as worse within the same state.
    case 'safety': return (a, b) => SAFETY_RANK[safetyState(a.safety)] - SAFETY_RANK[safetyState(b.safety)] ||
      ((b.safety?.fix || 0) - (a.safety?.fix || 0)) || ((b.safety?.consider || 0) - (a.safety?.consider || 0));
    case 'created': return (a, b) => (a.created_at || '').localeCompare(b.created_at || '');
    default: return (a, b) => updatedAt(a).localeCompare(updatedAt(b));
  }
}

/**
 * A sorted copy. Ties fall back to name so the order is stable across reloads.
 * @param {object[]} apps From GET /api/developers/apps
 * @param {string} key One of SORT_KEYS
 * @param {'asc'|'desc'} dir Direction for the key; the name tie-break is always A–Z
 * @returns {object[]}
 */
export function sortApps(apps, key, dir = 'asc') {
  const primary = compareBy(key);
  const byName = compareBy('name');
  const sign = dir === 'desc' ? -1 : 1;
  return [...apps].sort((a, b) => sign * primary(a, b) || byName(a, b));
}

/**
 * Counts for the summary on /developers.
 * @param {object[]} apps From GET /api/developers/apps
 * @returns {{total:number, sandboxActive:number, needFixes:number, unchecked:number}}
 */
export function summarizeApps(apps) {
  return {
    total: apps.length,
    sandboxActive: apps.filter(app => sandboxStatus(app) === 'active').length,
    needFixes: apps.filter(app => safetyState(app.safety) === 'fix').length,
    unchecked: apps.filter(app => safetyState(app.safety) === 'unchecked').length
  };
}

/**
 * List state from a query string, ignoring values the page doesn't offer.
 * @param {string} search location.search
 * @returns {{q:string, sandbox:string, safety:string, sort:string, dir:'asc'|'desc'}}
 */
export function readListState(search) {
  const params = new URLSearchParams(search);
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : DEFAULT_LIST_STATE[name]);
  return {
    q: params.get('q') || '',
    sandbox: pick('sandbox', Object.keys(SANDBOX_FILTERS)),
    safety: pick('safety', Object.keys(SAFETY_FILTERS)),
    sort: pick('sort', SORT_KEYS),
    dir: pick('dir', ['asc', 'desc'])
  };
}

/**
 * Query string for a list state, leaving out defaults so plain /developers/apps stays clean.
 * @param {object} state As returned by readListState
 * @returns {string} '' or '?…'
 */
export function writeListState(state) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(state)) {
    if (value && value !== DEFAULT_LIST_STATE[name]) params.set(name, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
