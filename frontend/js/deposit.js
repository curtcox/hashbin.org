/**
 * Deposit Page Logic
 * Handles deposit form, fee calculation, and Stripe checkout
 */

import { authenticatedFetch, formatBalance, showToast, handleApiError } from './utils.js';

// Constants
const MINIMUM_DEPOSIT_DOLLARS = 1.00;
const STRIPE_FEE_PERCENTAGE = 0.029;
const STRIPE_FEE_FIXED_CENTS = 30;

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

/**
 * Initialize deposit page
 */
function init() {
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

  // Check for status in URL (success/cancel redirects)
  handleUrlStatus();

  // Set up event listeners
  amountInput.addEventListener('input', handleAmountChange);
  depositForm.addEventListener('submit', handleFormSubmit);

  console.log('Deposit page initialized');
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
  
  // Validate amount
  if (isNaN(amountDollars) || amountDollars < MINIMUM_DEPOSIT_DOLLARS) {
    feeBreakdown.classList.add('hidden');
    submitBtn.disabled = true;
    
    if (amountDollars > 0) {
      showError(`Minimum deposit is $${MINIMUM_DEPOSIT_DOLLARS.toFixed(2)}`);
    }
    return;
  }

  // Calculate fees
  const amountCents = Math.round(amountDollars * 100);
  const fees = calculateFees(amountCents);
  
  // Update breakdown display
  creditAmountSpan.textContent = formatDollars(fees.creditCents);
  feeAmountSpan.textContent = formatDollars(fees.feeCents);
  totalAmountSpan.textContent = formatDollars(fees.totalChargeCents);
  
  // Show breakdown
  feeBreakdown.classList.remove('hidden');
  
  // Enable submit button
  submitBtn.disabled = false;
}

/**
 * Calculate fees for a desired credit amount
 * User pays fees on top of the credit they want
 * 
 * NOTE: This calculation is duplicated in the backend (src/utils/pricing.js)
 * for API validation. Frontend duplication provides instant feedback without
 * requiring an API call. If fee structure changes, update both locations.
 */
function calculateFees(creditCents) {
  const feeCents = Math.round(creditCents * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED_CENTS);
  const totalChargeCents = creditCents + feeCents;
  
  return {
    creditCents,
    feeCents,
    totalChargeCents
  };
}

/**
 * Format cents as dollars
 */
function formatDollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
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
  if (isNaN(amountCents) || amountCents < 100) {
    showError('Please enter a valid amount (minimum $1.00)');
    return;
  }

  // Disable form
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating checkout session...';
  submitBtn.classList.add('loading');

  try {
    // Call API to create checkout session
    const response = await authenticatedFetch('/api/balance/deposit', {
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

    // Redirect to Stripe checkout
    window.location.href = data.checkout_url;
  } catch (error) {
    console.error('Deposit failed:', error);
    showError(error.message || 'Failed to create checkout session');
    
    // Re-enable form
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Funds via Stripe';
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
