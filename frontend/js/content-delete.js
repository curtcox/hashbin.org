/**
 * Delete Content card on the upload detail page, shown only to the uploader
 */

import { authenticatedFetch } from './utils.js';
import { validate256tCID } from './hash256t.js';

const card = document.getElementById('delete-card');
const form = document.getElementById('delete-form');
const button = document.getElementById('delete-btn');
const messageEl = document.getElementById('delete-message');

function cidFromPage() {
  const fromQuery = new URLSearchParams(window.location.search).get('cid');
  if (fromQuery && validate256tCID(fromQuery)) return fromQuery;
  const parts = window.location.pathname.split('/').filter(Boolean);
  const candidate = parts[0] === 'dashboard' && parts[1] === 'uploads' ? parts[2] : null;
  return candidate && !candidate.endsWith('.html') && validate256tCID(candidate) ? candidate : null;
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `alert alert-${type}`;
}

async function handleSubmit(cid, event) {
  event.preventDefault();
  const confirmed = window.confirm(
    'Delete this content permanently? It will stop being served immediately. This cannot be undone and is not refunded.'
  );
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Deleting…';
  try {
    const reason = document.getElementById('delete-reason').value.trim();
    const response = await authenticatedFetch(`/api/content/${encodeURIComponent(cid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showMessage(data.error === 'ALREADY_DELETED' ? 'This content was already deleted.' : 'Deletion failed. Please try again.', 'error');
      button.disabled = false;
      return;
    }
    form.classList.add('hidden');
    const extendCard = document.getElementById('extend-card');
    if (extendCard) extendCard.style.display = 'none';
    showMessage('Deleted. The content is no longer served, and the deletion is now in the public records.', 'success');
  } catch (error) {
    console.error('Delete failed:', error);
    showMessage('Network error. Please try again.', 'error');
    button.disabled = false;
  } finally {
    button.textContent = 'Delete permanently';
  }
}

async function init() {
  const cid = cidFromPage();
  if (!card || !cid) return;
  try {
    // Authenticated, so the response says whether the signed-in user uploaded it
    const response = await authenticatedFetch(`/api/content/${encodeURIComponent(cid)}`);
    if (!response.ok) return;
    const content = await response.json();
    if (!content.is_owner || content.deleted_at) return;
    card.style.display = 'block';
    form.addEventListener('submit', event => handleSubmit(cid, event));
  } catch {
    // Not signed in: nothing to show
  }
}

init();
