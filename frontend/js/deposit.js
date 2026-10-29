/**
 * Deposit Page Logic
 * Handles deposit form, fee calculation, and Stripe checkout
 */

import { authenticatedFetch, showToast, handleApiError } from './utils.js';
import { depositBreakdown, formatCents } from './deposit-math.js';

// Constants
const MINIMUM_DEPOSIT_DOLLARS = 1.00;
const LOCAL_MINIMUM_DEPOSIT_DOLLARS = 0.01;

// DOM elements
let amountInput;
let submitBtn;
let feeBreakdown;
let creditAmountSpan;
let feeAmountSpan;
let totalAmountSpan;
let depositForm;
let successMessage;
let cancelMessage;
let errorMessage;
let isLocalMode = false;

/**
 * Initialize deposit page
 */
async function init() {
  // Get DOM elements
  amountInput = document.getElementById('amount');
  submitBtn = document.getElementById('submit-btn');
  feeBreakdown = document.getElementById('fee-breakdown');
  creditAmountSpan = document.getElementById('credit-amount');
  feeAmountSpan = document.getElementById('fee-amount');
  totalAmountSpan = document.getElementById('total-amount');
  depositForm = document.getElementById('deposit-form');
  successMessage = document.getElementById('success-message');
  cancelMessage = document.getElementById('cancel-message');
  errorMessage = document.getElementById('error-message');

  if (!depositForm) {
    console.error('Deposit form not found');
    return;
  }

  await detectLocalMode();
  updateModeUI();

  // Check for status in URL (success/cancel redirects)
  handleUrlStatus();

  // Set up event listeners
  amountInput.addEventListener('input', handleAmountChange);
  depositForm.addEventListener('submit', handleFormSubmit);

  console.log('Deposit page initialized');
}

async function detectLocalMode() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return;
    }
    const config = await response.json();
    isLocalMode = Boolean(config.isLocalMode || config.authMode === 'local');
  } catch (error) {
    console.warn('Unable to detect local mode:', error);
  }
}

function updateModeUI() {
  if (!isLocalMode) {
    return;
  }

  const heading = document.querySelector('.card-title');
  const description = document.querySelector('.card p');

  if (heading) {
    heading.textContent = 'Add Funds (Local Mode)';
  }

  if (description) {
    description.textContent = 'Add test funds directly to your local account balance.';
  }

  const successParagraph = successMessage?.querySelector('p');
  if (successParagraph) {
    successParagraph.textContent = 'Your balance has been updated.';
  }

  const helperText = document.querySelector('.form-text');
  if (helperText) {
    helperText.textContent = `Minimum: $${LOCAL_MINIMUM_DEPOSIT_DOLLARS.toFixed(2)}`;
  }

  submitBtn.textContent = 'Add Funds';
  feeBreakdown.classList.add('hidden');
}

/**
 * Handle URL status parameters (after Stripe redirect)
 */
function handleUrlStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const sessionId = params.get('session_id');

  if (status === 'success' && sessionId) {
    // Show success message
    successMessage.classList.remove('hidden');
    
    // Redirect to dashboard after 2 seconds
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 2000);
  } else if (status === 'cancel') {
    // Show cancel message
    cancelMessage.classList.remove('hidden');
    
    // Clear URL parameters
    window.history.replaceState({}, '', '/deposit');
  }
}

/**
 * Handle amount input change
 */
function handleAmountChange() {
  const value = amountInput.value.trim();
  
  // Clear previous error
  errorMessage.classList.add('hidden');
  
  // If empty, hide breakdown and disable button
  if (!value) {
    feeBreakdown.classList.add('hidden');
    submitBtn.disabled = true;
    return;
  }

  const amountDollars = parseFloat(value);
  const minimumDeposit = isLocalMode ? LOCAL_MINIMUM_DEPOSIT_DOLLARS : MINIMUM_DEPOSIT_DOLLARS;
  
  // Validate amount
  if (isNaN(amountDollars) || amountDollars < minimumDeposit) {
    feeBreakdown.classList.add('hidden');
    submitBtn.disabled = true;
    
    if (amountDollars > 0) {
      showError(`Minimum deposit is $${minimumDeposit.toFixed(2)}`);
    }
    return;
  }

  if (!isLocalMode) {
    // Calculate fees
    const amountCents = Math.round(amountDollars * 100);
    const fees = depositBreakdown(amountCents);
    
    // Update breakdown display
    creditAmountSpan.textContent = formatCents(fees.creditCents);
    feeAmountSpan.textContent = formatCents(fees.cardCostCents);
    totalAmountSpan.textContent = formatCents(fees.totalChargeCents);
    
    // Show breakdown
    feeBreakdown.classList.remove('hidden');
  }
  
  // Enable submit button
  submitBtn.disabled = false;
}

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
  event.preventDefault();
  
  // Clear previous errors
  errorMessage.classList.add('hidden');
  
  const amountDollars = parseFloat(amountInput.value);
  const amountCents = Math.round(amountDollars * 100);
  
  // Validate
  const minimumCents = Math.round((isLocalMode ? LOCAL_MINIMUM_DEPOSIT_DOLLARS : MINIMUM_DEPOSIT_DOLLARS) * 100);
  if (isNaN(amountCents) || amountCents < minimumCents) {
    showError(`Please enter a valid amount (minimum $${(minimumCents / 100).toFixed(2)})`);
    return;
  }

  // Disable form
  submitBtn.disabled = true;
  submitBtn.textContent = isLocalMode ? 'Adding funds...' : 'Creating checkout session...';
  submitBtn.classList.add('loading');

  try {
    const endpoint = isLocalMode ? '/api/balance/dev-deposit' : '/api/balance/deposit';
    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount_cents: amountCents
      })
    });

    await handleApiError(response);
    const data = await response.json();

    if (isLocalMode) {
      successMessage.classList.remove('hidden');
      showToast(`Added ${formatCents(data.amount_cents)} to your balance.`, 'success');
      submitBtn.textContent = 'Add Funds';
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      return;
    }

    // Redirect to Stripe checkout
    window.location.href = data.checkout_url;
  } catch (error) {
    console.error('Deposit failed:', error);
    showError(error.message || 'Failed to create checkout session');
    
    // Re-enable form
    submitBtn.disabled = false;
    submitBtn.textContent = isLocalMode ? 'Add Funds' : 'Add Funds via Stripe';
    submitBtn.classList.remove('loading');
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
