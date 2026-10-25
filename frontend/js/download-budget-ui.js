import { authenticatedFetch, handleApiError } from './utils.js';

export function readDownloadCaps(prefix) {
  if (!document.getElementById(`${prefix}-enabled`).checked) return null;
  const caps = Object.fromEntries(['daily', 'monthly'].map(window => {
    const raw = document.getElementById(`${prefix}-${window}`).value;
    const dollars = Number(raw), cents = Math.round(dollars * 100);
    if (!raw || !Number.isFinite(dollars) || dollars < 0 || !Number.isSafeInteger(cents) || cents > 100000000 || Math.abs(dollars * 100 - cents) > 0.00001) throw new Error('Enter daily and monthly limits in dollars, with at most two decimal places.');
    return [`${window}_cap_cents`, cents];
  }));
  return caps;
}
export function fillDownloadCaps(prefix, caps) {
  document.getElementById(`${prefix}-enabled`).checked = Boolean(caps);
  for (const window of ['daily', 'monthly']) document.getElementById(`${prefix}-${window}`).value = caps ? (caps[`${window}_cap_cents`] / 100).toFixed(2) : '';
}
export async function downloadApi(path, method = 'GET', body) {
  const response = await authenticatedFetch(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  await handleApiError(response);
  return response.json();
}
export async function browseWithBudget(cid) {
  const result = await downloadApi('/api/downloads/session', 'POST', cid ? { cid } : {});
  window.location.assign(result.url);
}
export function capsFields(prefix) {
  return `<label class="form-label"><input type="checkbox" id="${prefix}-enabled"> Enable download spending</label>
    <label class="form-label" for="${prefix}-daily">Daily cap (USD, UTC)</label>
    <input class="form-input" type="number" min="0" max="1000000" step="0.01" id="${prefix}-daily">
    <label class="form-label" for="${prefix}-monthly">Monthly cap (USD, UTC)</label>
    <input class="form-input" type="number" min="0" max="1000000" step="0.01" id="${prefix}-monthly">`;
}
export function mountCapForm(container, prefix, caps, save) {
  // Prefixes and this markup are constants owned by the caller.
  container.innerHTML = `<form>${capsFields(prefix)}<button class="btn btn-primary" type="submit">Save download caps</button><p role="status" aria-live="polite"></p></form>`;
  fillDownloadCaps(prefix, caps);
  container.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = container.querySelector('[role=status]'), button = container.querySelector('button');
    button.disabled = true;
    try { await save(readDownloadCaps(prefix)); status.textContent = 'Download caps saved. Changes apply within 60 seconds.'; }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
