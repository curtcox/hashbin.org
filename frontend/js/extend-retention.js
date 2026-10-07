/**
 * Extend Retention card on the upload detail page (/dashboard/uploads/{cid})
 * Quotes come from POST /api/payments/calculate so the price always matches the server.
 */

import { authenticatedFetch, formatBalance } from './utils.js';
import { validate256tCID } from './hash256t.js';

const card = document.getElementById('extend-card');
const form = document.getElementById('extend-form');
const monthsSelect = document.getElementById('extend-months');
const costEl = document.getElementById('extend-cost');
const newExpiryEl = document.getElementById('extend-new-expiry');
const button = document.getElementById('extend-btn');
const messageEl = document.getElementById('extend-message');

let content = null;
let quoteCents = null;
let quoteRequest = 0;

/**
 * Add calendar months the same way the server does (clamping to month end)
 * @param {string} isoDate - Current expiration
 * @param {number} months - Months to add
 * @returns {Date} New expiration
 */
export function addMonths(isoDate, months) {
  const date = new Date(isoDate);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0);
  return date;
}

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

async function updateQuote() {
  const months = parseInt(monthsSelect.value, 10);
  const requestId = ++quoteRequest;
  quoteCents = null;
  button.disabled = true;
  costEl.textContent = '…';
  newExpiryEl.textContent = addMonths(content.expires_at, months).toLocaleDateString();

  try {
    const response = await fetch('/api/payments/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size_bytes: content.size_bytes, retention_months: months })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== quoteRequest) return;
    quoteCents = data.cost_cents;
    costEl.textContent = formatBalance(quoteCents);
    button.disabled = false;
  } catch (error) {
    console.error('Failed to price extension:', error);
    if (requestId === quoteRequest) costEl.textContent = 'Unavailable';
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (quoteCents === null) return;

  const months = parseInt(monthsSelect.value, 10);
  const confirmed = window.confirm(
    `Extend retention by ${months} month(s) for ${formatBalance(quoteCents)}? Payments are not refundable.`
  );
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = 'Extending…';
  messageEl.className = 'alert hidden';

  try {
    const response = await authenticatedFetch(`/api/content/${encodeURIComponent(content.cid)}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months_to_add: months })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.error === 'insufficient_balance') {
        showMessage(`${data.message} Add funds on the Deposit page.`, 'warning');
      } else {
        showMessage(data.message || 'The extension failed. Your balance was not charged unless shown below.', 'error');
      }
      return;
    }

    content.expires_at = data.expires_at;
    const expiresEl = document.getElementById('content-expires');
    if (expiresEl) expiresEl.textContent = new Date(data.expires_at).toLocaleString();
    showMessage(
      `Extended. New expiration: ${new Date(data.expires_at).toLocaleString()}. Charged ${formatBalance(data.cost_cents)}; balance ${formatBalance(data.new_balance_cents)}.`,
      'success'
    );
    await updateQuote();
  } catch (error) {
    console.error('Extension failed:', error);
    showMessage(error.message === 'Not authenticated' ? 'Sign in to extend retention.' : 'Network error. Please try again.', 'error');
  } finally {
    button.textContent = 'Extend';
    button.disabled = quoteCents === null;
  }
}

async function init() {
  if (!card) return;
  const cid = cidFromPage();
  if (!cid) return;

  try {
    const response = await fetch(`/api/content/${encodeURIComponent(cid)}`);
    if (!response.ok) return;
    content = { ...(await response.json()), cid };
  } catch (error) {
    console.error('Failed to load content for extension:', error);
    return;
  }

  // Inline content (≤64 bytes) lives in the CID itself and costs nothing to keep
  if (!content.expires_at || content.size_bytes <= 64 || content.deleted_at) return;

  card.style.display = 'block';
  monthsSelect.addEventListener('change', updateQuote);
  form.addEventListener('submit', handleSubmit);
  await updateQuote();
}

init();
