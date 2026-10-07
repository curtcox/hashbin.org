/**
 * "Keep this content available" donation card on /info.html
 * Anyone can pay by card (via Stripe) to extend any content's retention.
 */

// Mirror src/utils/pricing.js (calculateDonationMonths)
const RATE_PER_GB_PER_MONTH = 0.03;
const MAX_DONATION_MONTHS = 1200;
export const MIN_DONATION_CENTS = 100;

/**
 * Whole months a donation buys for content of this size
 * @param {number} amountCents - Donation in cents
 * @param {number} sizeBytes - Content size
 * @returns {number} Months (0 if too small)
 */
export function donationMonths(amountCents, sizeBytes) {
  if (!(amountCents > 0) || sizeBytes <= 64) return 0;
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);
  const months = Math.floor(amountCents / 100 / (sizeGB * RATE_PER_GB_PER_MONTH) + 1e-9);
  return Math.min(months, MAX_DONATION_MONTHS);
}

/**
 * @param {number} months - Months to add
 * @returns {string} e.g. "2 years 3 months"
 */
export function describeMonths(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 months';
}

async function authHeaders() {
  try {
    const { getAuthHeaders } = await import('./auth-loader.js');
    return (await getAuthHeaders()) || {};
  } catch {
    return {};
  }
}

export function initDonationCard(cid, content) {
  const card = document.getElementById('donate-card');
  if (!card || content.size_bytes <= 64 || content.deleted_at) return;

  const amountInput = document.getElementById('donate-amount');
  const preview = document.getElementById('donate-preview');
  const button = document.getElementById('donate-btn');
  const messageEl = document.getElementById('donate-message');

  const show = (text, type) => {
    messageEl.textContent = text;
    messageEl.className = `alert alert-${type}`;
  };

  const update = () => {
    const cents = Math.round(parseFloat(amountInput.value || '0') * 100);
    const months = donationMonths(cents, content.size_bytes);
    if (cents < MIN_DONATION_CENTS) {
      preview.textContent = 'Minimum donation is $1.00.';
      button.disabled = true;
    } else if (months < 1) {
      preview.textContent = 'This amount buys less than a month for a file this size.';
      button.disabled = true;
    } else {
      preview.textContent = `Adds ${describeMonths(months)}${months === MAX_DONATION_MONTHS ? ' (the maximum per donation)' : ''}.`;
      button.disabled = false;
    }
    return cents;
  };

  card.style.display = 'block';
  amountInput.addEventListener('input', update);
  update();

  const params = new URLSearchParams(window.location.search);
  if (params.get('donation') === 'success') {
    show('Thank you! Your donation was received. The new expiration date appears once the payment is confirmed, usually within a minute.', 'success');
  } else if (params.get('donation') === 'cancel') {
    show('Donation cancelled. You were not charged.', 'info');
  }

  card.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const cents = update();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Opening checkout…';
    try {
      const response = await fetch(`/api/donate/cid/${encodeURIComponent(cid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ amount_cents: cents })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      show(data.message || 'Donations are unavailable right now. Please try again later.', 'error');
    } catch (error) {
      console.error('Donation failed:', error);
      show('Network error. Please try again.', 'error');
    }
    button.disabled = false;
    button.textContent = 'Donate with card';
  });
}
