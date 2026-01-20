/**
 * Rate Limit Purchase Form Logic
 * Handles the UI and purchase flow for rate limit bandwidth
 */

import { requireAuth } from './auth-gate.js';
import { authenticatedFetch, handleApiError, formatBalance } from './utils.js';
import { formatFileSize, validate256tCID } from './hash256t.js';
import {
  formatMTBR,
  getRateLimitBadge,
  formatTimeUntil,
  calculateRateLimitPrice,
  formatBytes,
  formatPrice,
  formatNumber,
  formatDuration,
  getRemainingRetention,
  sliderToMTBR,
  mtbrToSlider,
  MTBR_PRESETS
} from './rate-limit-utils.js';

// State
let contentData = null;
let rateLimitStatus = null;
let userBalance = 0;
let currentMTBR = 1000; // Default 1 second
let currentDuration = 30 * 24 * 60 * 60; // Default 30 days in seconds
let maxDuration = 30 * 24 * 60 * 60; // Will be updated based on content expiration

// Initialize
(async function init() {
  // Require authentication
  await requireAuth();
  
  // Extract CID from URL
  const cid = extractCIDFromURL();
  
  if (!cid) {
    showError('Invalid URL - no content ID found');
    return;
  }
  
  // Load data
  await Promise.all([
    loadContentData(cid),
    loadRateLimitStatus(cid),
    loadUserBalance()
  ]);
  
  // Initialize form
  initializeForm();
  
  // Show content
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content-management').style.display = 'block';
})();

/**
 * Extract CID from URL path
 * Supports paths like /dashboard/uploads/CID/ or /dashboard/uploads/detail.html?cid=CID
 */
function extractCIDFromURL() {
  // Try query parameter first
  const params = new URLSearchParams(window.location.search);
  const cidParam = params.get('cid');
  if (cidParam && validate256tCID(cidParam)) return cidParam;
  
  // Try path parameter
  const pathParts = window.location.pathname.split('/').filter(p => p);
  // Path should be: dashboard/uploads/CID or dashboard/uploads/CID/
  if (pathParts.length >= 3 && pathParts[0] === 'dashboard' && pathParts[1] === 'uploads') {
    const candidate = pathParts[2];
    if (!candidate || candidate === 'detail' || candidate === 'detail.html' || candidate.endsWith('.html')) {
      return null;
    }
    if (validate256tCID(candidate)) {
      return candidate;
    }
  }
  
  return null;
}

/**
 * Load content metadata
 */
async function loadContentData(cid) {
  try {
    const response = await fetch(`/api/content/${cid}`);
    
    if (!response.ok) {
      throw new Error('Content not found');
    }
    
    contentData = await response.json();
    
    // Display content info
    document.getElementById('header-cid').textContent = cid;
    document.getElementById('content-size').textContent = formatFileSize(contentData.size_bytes);
    document.getElementById('content-expires').textContent = new Date(contentData.expires_at).toLocaleString();
    document.getElementById('content-downloads').textContent = formatNumber(contentData.download_count || 0);
    
    // Set links
    document.getElementById('view-link').href = `/${cid}`;
    document.getElementById('download-link').href = `/${cid}`;
    
    // Calculate max duration based on content expiration
    maxDuration = getRemainingRetention(contentData.expires_at);
    
    // Check if inline content
    if (contentData.size_bytes <= 64) {
      document.getElementById('purchase-form-card').style.display = 'none';
      document.getElementById('inline-notice').style.display = 'block';
    }
    
  } catch (error) {
    console.error('Failed to load content:', error);
    showError(error.message);
    throw error;
  }
}

/**
 * Load rate limit status
 */
async function loadRateLimitStatus(cid) {
  try {
    const response = await fetch(`/api/content/${cid}/rate-limit`);
    
    if (!response.ok) {
      throw new Error('Failed to load rate limit status');
    }
    
    rateLimitStatus = await response.json();
    displayRateLimitStatus(rateLimitStatus);
    
  } catch (error) {
    console.error('Failed to load rate limit status:', error);
    document.getElementById('current-rate-limit-status').innerHTML = `
      <p style="color: var(--color-text-light);">Unable to load rate limit status</p>
    `;
  }
}

/**
 * Display current rate limit status
 */
function displayRateLimitStatus(status) {
  const container = document.getElementById('current-rate-limit-status');
  const badge = getRateLimitBadge(status);
  
  let html = `
    <div class="info-row">
      <span class="info-label">Status</span>
      <span class="info-value">
        <span class="badge ${badge.class}">${badge.icon} ${badge.text}</span>
      </span>
    </div>
  `;
  
  if (!status.is_inline && status.effective_mtbr_ms !== null) {
    html += `
      <div class="info-row">
        <span class="info-label">Current Frequency</span>
        <span class="info-value">${formatMTBR(status.effective_mtbr_ms)}</span>
      </div>
    `;
  }
  
  if (status.next_available_at) {
    const nextAvailable = new Date(status.next_available_at);
    if (nextAvailable > new Date()) {
      html += `
        <div class="info-row">
          <span class="info-label">Next Available In</span>
          <span class="info-value">${formatTimeUntil(status.next_available_at)}</span>
        </div>
      `;
    }
  }
  
  if (status.active_rate_limits && status.active_rate_limits.length > 0) {
    html += `
      <div class="info-row">
        <span class="info-label">Active Purchases</span>
        <span class="info-value">${status.active_rate_limits.length}</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

/**
 * Load user balance
 */
async function loadUserBalance() {
  try {
    const response = await authenticatedFetch('/api/balance');
    await handleApiError(response);
    
    const data = await response.json();
    userBalance = data.balance_cents;
    
    updateBalanceDisplay();
    
  } catch (error) {
    console.error('Failed to load balance:', error);
    // Don't block the form, just hide balance
  }
}

/**
 * Initialize form controls
 */
function initializeForm() {
  const mtbrSlider = document.getElementById('mtbr-slider');
  const durationSlider = document.getElementById('duration-slider');
  const customMTBRToggle = document.getElementById('custom-mtbr-toggle');
  const customMTBRInput = document.getElementById('custom-mtbr-input');
  const customMTBRField = document.getElementById('custom-mtbr-field');
  const form = document.getElementById('purchase-form');
  
  // MTBR slider
  mtbrSlider.addEventListener('input', (e) => {
    if (!customMTBRToggle.checked) {
      currentMTBR = sliderToMTBR(parseFloat(e.target.value));
      updateMTBRDisplay();
      updatePricing();
    }
  });
  
  // Custom MTBR toggle
  customMTBRToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      customMTBRField.classList.add('active');
      customMTBRInput.value = currentMTBR;
      customMTBRInput.focus();
    } else {
      customMTBRField.classList.remove('active');
      currentMTBR = sliderToMTBR(parseFloat(mtbrSlider.value));
      updateMTBRDisplay();
      updatePricing();
    }
  });
  
  // Custom MTBR input
  customMTBRInput.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (value >= 100) {
      currentMTBR = value;
      // Update slider to match
      mtbrSlider.value = mtbrToSlider(value);
      updateMTBRDisplay();
      updatePricing();
    }
  });
  
  // Duration slider
  durationSlider.addEventListener('input', (e) => {
    const position = parseFloat(e.target.value);
    // Linear scale from MTBR to maxDuration
    const minDuration = currentMTBR / 1000; // Convert MTBR to seconds
    currentDuration = minDuration + (position / 100) * (maxDuration - minDuration);
    currentDuration = Math.max(minDuration, Math.min(maxDuration, currentDuration));
    updateDurationDisplay();
    updatePricing();
  });
  
  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handlePurchase();
  });
  
  // Initial updates
  currentMTBR = sliderToMTBR(parseFloat(mtbrSlider.value));
  updateMTBRDisplay();
  updateDurationDisplay();
  updatePricing();
}

/**
 * Update MTBR display
 */
function updateMTBRDisplay() {
  document.getElementById('mtbr-display').textContent = formatMTBR(currentMTBR);
}

/**
 * Update duration display
 */
function updateDurationDisplay() {
  document.getElementById('duration-display').textContent = formatDuration(Math.floor(currentDuration));
  
  // Update help text
  const remainingDays = Math.floor(maxDuration / 86400);
  document.getElementById('duration-help').textContent = 
    `How long should this rate limit last? (Content expires in ${remainingDays} days)`;
  
  // Update slider labels
  document.getElementById('duration-min-label').textContent = formatDuration(Math.floor(currentMTBR / 1000));
  document.getElementById('duration-max-label').textContent = formatDuration(maxDuration);
}

/**
 * Update pricing display
 */
function updatePricing() {
  if (!contentData) return;
  
  const pricing = calculateRateLimitPrice(
    contentData.size_bytes,
    currentMTBR,
    Math.floor(currentDuration)
  );
  
  document.getElementById('calc-size').textContent = formatFileSize(contentData.size_bytes);
  document.getElementById('calc-requests').textContent = formatNumber(pricing.maxRequests);
  document.getElementById('calc-bandwidth').textContent = formatBytes(pricing.maxBytes);
  document.getElementById('calc-price').textContent = formatPrice(pricing.priceCents);
  
  updateBalanceDisplay(pricing.priceCents);
  updatePurchaseButton(pricing.priceCents);
}

/**
 * Update balance display
 */
function updateBalanceDisplay(requiredCents = 0) {
  const balanceDisplay = document.getElementById('balance-display');
  const balanceAmount = document.getElementById('balance-amount');
  const balanceStatus = document.getElementById('balance-status');
  
  if (userBalance !== null) {
    balanceDisplay.style.display = 'block';
    balanceAmount.textContent = formatBalance(userBalance);
    
    if (requiredCents > 0) {
      if (userBalance >= requiredCents) {
        balanceStatus.textContent = '✓ Sufficient balance';
        balanceStatus.className = 'balance-status sufficient';
      } else {
        const needed = requiredCents - userBalance;
        balanceStatus.textContent = `⚠️ Insufficient balance (need ${formatBalance(needed)} more)`;
        balanceStatus.className = 'balance-status insufficient';
      }
    } else {
      balanceStatus.textContent = '';
    }
  }
}

/**
 * Update purchase button state
 */
function updatePurchaseButton(requiredCents) {
  const btn = document.getElementById('purchase-btn');
  
  // Validation checks
  const hasBalance = userBalance >= requiredCents;
  const validMTBR = currentMTBR >= 100;
  const validDuration = currentDuration >= (currentMTBR / 1000);
  
  btn.disabled = !hasBalance || !validMTBR || !validDuration;
}

/**
 * Handle purchase submission
 */
async function handlePurchase() {
  const btn = document.getElementById('purchase-btn');
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    const cid = extractCIDFromURL();
    
    const response = await authenticatedFetch('/api/content/rate-limit/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: cid,
        min_time_between_requests_ms: currentMTBR,
        duration_seconds: Math.floor(currentDuration)
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Purchase failed');
    }
    
    const result = await response.json();
    
    // Redirect to info page with success message
    window.location.href = `/info.html?cid=${cid}&purchase_success=1&purchase_id=${result.purchase_id}`;
    
  } catch (error) {
    console.error('Purchase failed:', error);
    alert(`Purchase failed: ${error.message}`);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * Show error state
 */
function showError(message) {
  document.getElementById('error-message').textContent = message;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'block';
}
