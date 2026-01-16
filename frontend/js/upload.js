/**
 * Upload Page Logic
 * Handles file upload with 256t hashing, duplicate detection, and payment
 */

import { generate256tHash, getContentSize, formatFileSize, isInlineContent } from './hash256t.js';
import { authenticatedFetch } from './utils.js';
import { getSessionToken } from './auth.js';

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const BASE_RATE_PER_GB_PER_MONTH = 0.03;

// State
let selectedFile = null;
let calculatedCID = null;
let uploadAbortController = null;
let currentBalance = 0;

/**
 * Initialize upload page
 */
async function init() {
  // Get DOM elements
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const uploadForm = document.getElementById('upload-form');
  const cancelButton = document.getElementById('cancel-upload');
  
  // Set up file input
  fileInput.addEventListener('change', handleFileSelect);
  
  // Set up drag and drop
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', handleDragOver);
  dropZone.addEventListener('dragleave', handleDragLeave);
  dropZone.addEventListener('drop', handleDrop);
  
  // Set up form submission
  uploadForm.addEventListener('submit', handleUpload);
  
  // Set up cancel button
  cancelButton.addEventListener('click', handleCancel);
  
  // Set up retention picker
  const retentionSelect = document.getElementById('retention-preset');
  const customRetentionInput = document.getElementById('custom-retention');
  
  retentionSelect.addEventListener('change', handleRetentionChange);
  customRetentionInput.addEventListener('input', handleRetentionChange);
  
  // Load user balance
  await loadBalance();
}

/**
 * Load user balance
 */
async function loadBalance() {
  try {
    const response = await authenticatedFetch('/api/balance');
    
    if (response.ok) {
      const data = await response.json();
      currentBalance = data.balance_cents;
      updateBalanceDisplay();
    }
  } catch (error) {
    console.error('Failed to load balance:', error);
  }
}

/**
 * Update balance display
 */
function updateBalanceDisplay() {
  const balanceElement = document.getElementById('current-balance');
  if (balanceElement) {
    balanceElement.textContent = formatCents(currentBalance);
  }
}

/**
 * Handle file selection
 */
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    await processFile(file);
  }
}

/**
 * Handle drag over
 */
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drag-over');
}

/**
 * Handle drag leave
 */
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
}

/**
 * Handle drop
 */
async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
  
  const files = event.dataTransfer.files;
  
  if (files.length === 0) {
    return;
  }
  
  if (files.length > 1) {
    showError('Please drop only one file at a time');
    return;
  }
  
  await processFile(files[0]);
}

/**
 * Process selected file
 */
async function processFile(file) {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    showError(`File too large. Maximum size is 5GB. Your file is ${formatFileSize(file.size)}.`);
    return;
  }
  
  selectedFile = file;
  calculatedCID = null;
  
  // Update UI
  document.getElementById('file-info').style.display = 'block';
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatFileSize(file.size);
  
  // Show hashing progress
  showHashingProgress();
  
  try {
    // Calculate hash
    const cid = await generate256tHash(file, (progress) => {
      updateHashProgress(progress);
    });
    
    calculatedCID = cid;
    
    // Hide hashing progress
    hideHashingProgress();
    
    // Show CID
    document.getElementById('calculated-cid').textContent = cid;
    document.getElementById('cid-display').style.display = 'block';
    
    // Check if content already exists
    await checkDuplicate(cid);
    
    // Update cost display
    updateCostDisplay();
    
    // Enable upload button
    document.getElementById('upload-button').disabled = false;
    
  } catch (error) {
    hideHashingProgress();
    showError(`Failed to calculate hash: ${error.message}`);
  }
}

/**
 * Show hashing progress
 */
function showHashingProgress() {
  document.getElementById('hashing-progress').style.display = 'block';
  document.getElementById('upload-section').style.display = 'none';
}

/**
 * Update hash progress
 */
function updateHashProgress(percent) {
  const progressBar = document.getElementById('hash-progress-bar');
  const progressText = document.getElementById('hash-progress-text');
  
  progressBar.style.width = percent + '%';
  progressText.textContent = Math.round(percent) + '%';
}

/**
 * Hide hashing progress
 */
function hideHashingProgress() {
  document.getElementById('hashing-progress').style.display = 'none';
  document.getElementById('upload-section').style.display = 'block';
}

/**
 * Check if content is duplicate
 */
async function checkDuplicate(cid) {
  try {
    const response = await fetch(`/api/content/${cid}/exists`);
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.exists) {
        // Show duplicate message
        document.getElementById('duplicate-message').style.display = 'block';
        document.getElementById('duplicate-cid').textContent = cid;
        document.getElementById('duplicate-expires').textContent = new Date(data.expires_at).toLocaleString();
      } else {
        document.getElementById('duplicate-message').style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Failed to check duplicate:', error);
    // Continue with upload on error
  }
}

/**
 * Handle retention change
 */
function handleRetentionChange() {
  updateCostDisplay();
}

/**
 * Get selected retention months
 */
function getRetentionMonths() {
  const preset = document.getElementById('retention-preset').value;
  
  if (preset === 'custom') {
    const custom = parseInt(document.getElementById('custom-retention').value);
    return custom > 0 ? custom : 1;
  }
  
  return parseInt(preset);
}

/**
 * Update cost display
 */
function updateCostDisplay() {
  if (!selectedFile) return;
  
  const months = getRetentionMonths();
  const costCents = calculateCost(selectedFile.size, months);
  
  // Update cost display
  document.getElementById('cost-amount').textContent = formatCents(costCents);
  document.getElementById('cost-breakdown').textContent = 
    `${formatFileSize(selectedFile.size)} × ${months} month(s) @ $${BASE_RATE_PER_GB_PER_MONTH}/GB/month`;
  
  // Check if inline content (free)
  if (calculatedCID && isInlineContent(calculatedCID)) {
    document.getElementById('inline-notice').style.display = 'block';
    document.getElementById('cost-amount').textContent = '$0.00 (Free)';
  } else {
    document.getElementById('inline-notice').style.display = 'none';
  }
  
  // Check balance sufficiency
  const sufficient = currentBalance >= costCents;
  const balanceStatus = document.getElementById('balance-status');
  
  if (sufficient) {
    balanceStatus.className = 'balance-status sufficient';
    balanceStatus.innerHTML = '✓ Sufficient balance';
    document.getElementById('upload-button').disabled = false;
  } else {
    const shortfall = costCents - currentBalance;
    balanceStatus.className = 'balance-status insufficient';
    balanceStatus.innerHTML = `⚠ Need ${formatCents(shortfall)} more. <a href="/deposit.html">Add funds</a>`;
    document.getElementById('upload-button').disabled = true;
  }
}

/**
 * Calculate upload cost
 */
function calculateCost(sizeBytes, months) {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);
  const costDollars = sizeGB * months * BASE_RATE_PER_GB_PER_MONTH;
  return Math.round(costDollars * 100);
}

/**
 * Format cents as dollars
 */
function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

/**
 * Handle upload
 */
async function handleUpload(event) {
  event.preventDefault();
  
  if (!selectedFile || !calculatedCID) {
    showError('Please select a file first');
    return;
  }
  
  // Show upload progress
  showUploadProgress();
  
  try {
    // Create form data
    const formData = new FormData();
    formData.append('content', selectedFile);
    formData.append('retention_months', getRetentionMonths());
    
    // Create abort controller
    uploadAbortController = new AbortController();
    
    // Get auth token
    const token = await getSessionToken();
    if (!token) {
      hideUploadProgress();
      showError('Not authenticated. Please sign in again.');
      return;
    }
    
    // Upload
    const response = await fetch('/api/content', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: uploadAbortController.signal
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Redirect to info page
      window.location.href = `/info.html?cid=${data.cid}`;
    } else {
      const error = await response.json();
      hideUploadProgress();
      
      if (error.error === 'insufficient_balance') {
        showError(`Insufficient balance. ${error.message}`);
      } else {
        showError(error.message || 'Upload failed');
      }
    }
  } catch (error) {
    hideUploadProgress();
    
    if (error.name === 'AbortError') {
      showError('Upload cancelled');
    } else {
      showError(`Upload failed: ${error.message}`);
    }
  }
}

/**
 * Handle cancel
 */
function handleCancel() {
  if (uploadAbortController) {
    uploadAbortController.abort();
    uploadAbortController = null;
  }
  
  hideUploadProgress();
}

/**
 * Show upload progress
 */
function showUploadProgress() {
  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('upload-form').style.display = 'none';
}

/**
 * Hide upload progress
 */
function hideUploadProgress() {
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('upload-form').style.display = 'block';
}

/**
 * Show error message
 */
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  
  // Hide after 10 seconds
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 10000);
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
