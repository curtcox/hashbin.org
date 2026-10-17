/**
 * Upload a group of files with one shared retention period.
 * Each unique CID uses the existing single-file API and is charged once.
 */
import { generate256tHash, formatFileSize, isInlineContent } from './hash256t.js';
import { authenticatedFetch } from './utils.js';
import { getAuthHeaders } from './auth-loader.js';

// Keep in sync with MAX_UPLOAD_BYTES in src/utils/upload-limits.js.
const MAX_FILE_SIZE = 90 * 1024 * 1024;
const BASE_RATE_PER_GB_PER_MONTH = 0.03;
let files = [];
let busy = false;
let currentBalance = null;
let uploadAbortController = null;

async function init() {
  const input = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  input.addEventListener('change', async () => {
    const selected = Array.from(input.files);
    input.value = '';
    await addFiles(selected);
  });
  dropZone.addEventListener('click', () => { if (!busy) input.click(); });
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!busy) input.click();
    }
  });
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!busy) dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
    if (!busy) addFiles(Array.from(event.dataTransfer.files));
  });
  document.getElementById('upload-form').addEventListener('submit', handleUpload);
  document.getElementById('cancel-upload').addEventListener('click', handleCancel);
  document.getElementById('retention-slider').addEventListener('input', updateCostDisplay);
  document.querySelectorAll('[data-retention]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('retention-slider').value = button.dataset.retention;
      updateCostDisplay();
    });
  });
  updateCostDisplay();
  await loadBalance();
}

async function loadBalance() {
  try {
    const response = await authenticatedFetch('/api/balance');
    if (response.ok) {
      const data = await response.json();
      currentBalance = data.balance_cents;
      document.getElementById('current-balance').textContent = formatCents(currentBalance);
      updateCostDisplay();
    } else {
      document.getElementById('current-balance').textContent = 'Unavailable';
    }
  } catch (error) {
    console.error('Failed to load balance:', error);
    document.getElementById('current-balance').textContent = 'Unavailable';
  }
}

// Entries with identical content share their upload state, even under different names.
function uniqueContents() {
  return [...new Set(files.map(entry => entry.content).filter(content => content.cid))];
}

function pendingContents() {
  return uniqueContents().filter(content => content.status !== 'uploaded');
}

async function addFiles(selected) {
  if (busy || selected.length === 0) return;
  setBusy(true);
  document.getElementById('error-message').style.display = 'none';
  document.getElementById('upload-results').style.display = 'none';
  document.getElementById('hashing-progress').style.display = 'block';
  document.getElementById('hash-progress-bar').style.width = '0%';
  document.getElementById('hash-progress-text').textContent = '0%';
  const added = selected.map(file => ({ file, content: { status: 'waiting' } }));
  files.push(...added);
  renderFiles();

  for (const [index, entry] of added.entries()) {
    const { file } = entry;
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      entry.content = {
        status: 'invalid',
        message: file.size === 0 ? 'Empty files cannot be uploaded.' : 'File too large. Maximum size is 90 MB per file.'
      };
      renderFiles();
      continue;
    }
    entry.content.status = 'hashing';
    renderFiles();
    try {
      const cid = await generate256tHash(file, percent => {
        const total = (index + percent / 100) / added.length * 100;
        document.getElementById('hash-progress-bar').style.width = `${total}%`;
        document.getElementById('hash-progress-text').textContent = `${index + 1} of ${added.length} files — ${Math.round(total)}%`;
      });
      const matching = uniqueContents().find(content => content.cid === cid);
      if (matching) {
        entry.content = matching;
      } else {
        entry.content = { file, cid, status: 'ready', exists: false };
        try {
          const response = await fetch(`/api/content/${cid}/exists`);
          if (response.ok) {
            const data = await response.json();
            entry.content.exists = data.exists;
            entry.content.expiresAt = data.expires_at;
          }
        } catch {
          // Duplicate detection is advisory; the upload API also checks it.
        }
      }
    } catch (error) {
      entry.content = { status: 'invalid', message: `Failed to calculate hash: ${error.message}` };
    }
    renderFiles();
  }
  document.getElementById('hashing-progress').style.display = 'none';
  setBusy(false);
  renderFiles();
}

function renderFiles() {
  const list = document.getElementById('file-list');
  list.replaceChildren();
  document.getElementById('file-info').style.display = files.length ? 'block' : 'none';
  document.getElementById('upload-section').style.display = files.length ? 'block' : 'none';
  const size = files.reduce((sum, entry) => sum + entry.file.size, 0);
  document.getElementById('file-summary').textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected · ${formatFileSize(size)}`;
  const seen = new Set();
  files.forEach((entry) => {
    const { file, content } = entry;
    const row = document.createElement('li');
    row.className = `file-row file-${content.status}`;
    const details = document.createElement('div');
    details.className = 'file-details';
    const name = document.createElement('strong');
    name.textContent = file.name;
    const sizeLabel = document.createElement('span');
    sizeLabel.textContent = formatFileSize(file.size);
    const status = document.createElement('p');
    status.className = 'file-status';
    const labels = {
      waiting: 'Waiting to prepare', hashing: 'Calculating hash...', ready: 'Ready',
      uploading: 'Uploading...', uploaded: 'Uploaded', failed: 'Upload failed', cancelled: 'Stopped', invalid: 'Cannot upload'
    };
    status.textContent = content.message || labels[content.status];
    if (content.status === 'ready' && content.exists) {
      status.textContent = 'Already stored — uploading adds the selected retention period.';
      if (content.expiresAt) status.textContent += ` Current expiration: ${new Date(content.expiresAt).toLocaleString()}`;
    }
    if (content.cid && isInlineContent(content.cid)) status.textContent += ' Free inline storage.';
    if (content.cid && seen.has(content)) status.textContent += ' Identical content — uploaded once for this group.';
    seen.add(content);
    details.append(name, sizeLabel, status);
    if (content.cid) {
      const cid = document.createElement('code');
      cid.className = 'file-cid';
      cid.textContent = content.cid;
      details.append(cid);
      if (content.status === 'cancelled' || content.status === 'failed') {
        const check = document.createElement('a');
        check.href = `/info.html?cid=${encodeURIComponent(content.cid)}`;
        check.textContent = 'Check content before retrying';
        details.append(check);
      }
    }
    if (content.result) {
      const result = document.createElement('p');
      const link = document.createElement('a');
      link.href = `/info.html?cid=${encodeURIComponent(content.result.cid)}&uploaded=1`;
      link.textContent = 'View content';
      result.append(link);
      result.append(isInlineContent(content.cid) ? ' · Available indefinitely' : ` · Retained until ${new Date(content.result.expires_at).toLocaleString()}`);
      details.append(result);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-secondary btn-small';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      files = files.filter(item => item !== entry);
      document.getElementById('upload-results').style.display = 'none';
      renderFiles();
    });
    row.append(details, remove);
    list.append(row);
  });
  updateCostDisplay();
}

function getRetentionMonths() {
  return Math.min(120, Math.max(1, parseInt(document.getElementById('retention-slider').value, 10) || 1));
}

function updateCostDisplay() {
  const months = getRetentionMonths();
  document.getElementById('retention-value').textContent = formatRetentionLabel(months);
  document.getElementById('retention-subtext').textContent = `About ${months * 30} days`;
  const pending = pendingContents();
  // Round each file's charge before summing, just as the API does.
  const costCents = pending.reduce((sum, content) => sum + calculateCost(content.file.size, months), 0);
  document.getElementById('cost-amount').textContent = formatCents(costCents);
  document.getElementById('cost-breakdown').textContent = `${pending.length} unique file${pending.length === 1 ? '' : 's'} remaining × ${formatRetentionLabel(months)} @ $${BASE_RATE_PER_GB_PER_MONTH}/GB/month. Each file's charge is rounded up to a whole cent.`;
  document.getElementById('inline-notice').style.display = uniqueContents().some(content => isInlineContent(content.cid)) ? 'block' : 'none';
  const sufficient = costCents === 0 || (currentBalance !== null && currentBalance >= costCents);
  const balanceStatus = document.getElementById('balance-status');
  balanceStatus.className = `balance-status ${sufficient ? 'sufficient' : 'insufficient'}`;
  balanceStatus.replaceChildren();
  if (sufficient) {
    balanceStatus.textContent = '✓ Sufficient balance';
  } else if (currentBalance === null) {
    balanceStatus.textContent = 'Balance unavailable. Reload the page to check your balance before uploading.';
  } else {
    balanceStatus.textContent = `⚠ Need ${formatCents(costCents - currentBalance)} more. `;
    const link = document.createElement('a');
    link.href = '/deposit.html';
    link.textContent = 'Add funds';
    balanceStatus.append(link);
  }
  const button = document.getElementById('upload-button');
  button.disabled = busy || !pending.length || !sufficient;
  const retrying = pending.some(content => ['failed', 'cancelled'].includes(content.status));
  button.textContent = retrying ? 'Retry Remaining Files' : `Upload ${pending.length} File${pending.length === 1 ? '' : 's'}`;
}

function calculateCost(sizeBytes, months) {
  if (sizeBytes <= 64) return 0;
  const costDollars = sizeBytes / (1024 * 1024 * 1024) * months * BASE_RATE_PER_GB_PER_MONTH;
  return Math.max(1, Math.ceil(costDollars * 100 - 1e-9));
}

function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function formatRetentionLabel(months) {
  if (months === 1) return '1 month';
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? '' : 's'} (${months} months)`;
  }
  return `${months} months`;
}

function setBusy(value) {
  busy = value;
  document.getElementById('file-input').disabled = value;
  document.getElementById('drop-zone').setAttribute('aria-disabled', String(value));
  document.getElementById('retention-slider').disabled = value;
  document.querySelectorAll('[data-retention]').forEach(button => { button.disabled = value; });
  updateCostDisplay();
}

async function handleUpload(event) {
  event.preventDefault();
  if (busy || document.getElementById('upload-button').disabled) return;
  const pending = pendingContents();
  if (!pending.length) return;
  // Capture once so every request in this group uses the same duration.
  const months = getRetentionMonths();
  const controller = new AbortController();
  uploadAbortController = controller;
  setBusy(true);
  renderFiles();
  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('upload-form').style.display = 'none';
  document.getElementById('upload-results').style.display = 'none';
  document.getElementById('cancel-upload').disabled = false;

  try {
    for (const [index, content] of pending.entries()) {
      if (controller.signal.aborted) break;
      content.status = 'uploading';
      content.message = '';
      renderFiles();
      document.getElementById('upload-progress-text').textContent = `Uploading ${index + 1} of ${pending.length}: ${content.file.name}`;
      try {
        const authHeaders = await getAuthHeaders();
        if (!authHeaders) throw new Error('Not authenticated. Please sign in again.');
        if (controller.signal.aborted) break;
        const formData = new FormData();
        formData.append('content', content.file);
        formData.append('retention_months', months);
        const response = await fetch('/api/content', {
          method: 'POST', body: formData, headers: authHeaders, signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || 'Upload failed');
        content.result = data;
        content.status = 'uploaded';
        if (currentBalance !== null) {
          currentBalance = Math.max(0, currentBalance - data.cost_cents);
          document.getElementById('current-balance').textContent = formatCents(currentBalance);
        }
      } catch (error) {
        content.status = controller.signal.aborted ? 'cancelled' : 'failed';
        content.message = controller.signal.aborted
          ? 'Stopped. This file may have reached the server; check its content page before retrying.'
          : `Upload failed: ${error.message}`;
      }
      renderFiles();
    }
  } finally {
    // Cancellation while waiting for authentication has not sent a request.
    pending.filter(content => content.status === 'uploading').forEach(content => { content.status = 'ready'; });
    uploadAbortController = null;
    await loadBalance();
    setBusy(false);
    renderFiles();
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('upload-form').style.display = 'block';
    const completed = files.filter(entry => entry.content.status === 'uploaded').length;
    const results = document.getElementById('upload-results');
    results.textContent = `${completed} of ${files.length} files uploaded. ${controller.signal.aborted ? 'Uploads stopped. ' : ''}See the file list for individual results. Successful files will not be uploaded again when retrying.`;
    results.style.display = 'block';
  }
  if (files.length === 1 && files[0].content.status === 'uploaded') {
    window.location.href = `/info.html?cid=${encodeURIComponent(files[0].content.result.cid)}&uploaded=1`;
  }
}

function handleCancel() {
  uploadAbortController?.abort();
  document.getElementById('cancel-upload').disabled = true;
  document.getElementById('upload-progress-text').textContent = 'Stopping uploads...';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
