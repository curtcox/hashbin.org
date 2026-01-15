/**
 * Retrieve page functionality
 * Handles content retrieval and download
 */

import { validate256tCID, isInlineContent, getContentSize, formatFileSize } from './hash256t.js';

/**
 * Initialize retrieve page
 */
export function initRetrievePage() {
  const form = document.getElementById('retrieve-form');
  const cidInput = document.getElementById('content-hash');
  const resultDiv = document.getElementById('retrieve-result');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const cid = cidInput.value.trim();
    
    // Validate CID format
    if (!validate256tCID(cid)) {
      showError('Invalid CID format. Please enter a valid 256t hash.');
      return;
    }

    // Show loading state
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<div class="alert alert-info">Loading content information...</div>';

    try {
      // Check if inline content
      const isInline = isInlineContent(cid);
      
      if (isInline) {
        // For inline content, we can show info immediately
        const size = getContentSize(cid);
        showInlineContentInfo(cid, size);
      } else {
        // For regular content, fetch metadata
        await fetchAndShowContentInfo(cid);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    }
  });
}

/**
 * Show inline content information
 */
function showInlineContentInfo(cid, size) {
  const resultDiv = document.getElementById('retrieve-result');
  
  resultDiv.innerHTML = `
    <div class="card">
      <h3 class="card-title">Content Information</h3>
      
      <div style="margin-bottom: 1.5rem;">
        <div class="info-row">
          <span class="info-label">CID:</span>
          <code class="info-value" style="word-break: break-all;">${cid}</code>
        </div>
        
        <div class="info-row">
          <span class="info-label">Type:</span>
          <span class="info-value">Inline Content (self-contained)</span>
        </div>
        
        <div class="info-row">
          <span class="info-label">Size:</span>
          <span class="info-value">${formatFileSize(size)}</span>
        </div>
        
        <div class="info-row">
          <span class="info-label">Expiration:</span>
          <span class="info-value">Never (inline content is permanent)</span>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <a href="/${cid}" class="btn btn-primary" download>
          Download Content
        </a>
        
        <button class="btn btn-secondary show-ext-picker" data-cid="${cid}">
          Download with Extension
        </button>
      </div>
    </div>
  `;
  
  // Add event listener for extension picker button
  const extPickerBtn = resultDiv.querySelector('.show-ext-picker');
  if (extPickerBtn) {
    extPickerBtn.addEventListener('click', () => {
      showExtensionPicker(extPickerBtn.dataset.cid);
    });
  }
}

/**
 * Fetch and show content information from API
 */
async function fetchAndShowContentInfo(cid) {
  const resultDiv = document.getElementById('retrieve-result');
  
  try {
    const response = await fetch(`/api/content/${cid}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        showError('Content not found. It may have expired or never existed.');
        return;
      }
      throw new Error(`Failed to fetch content info: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check if expired
    const expiresAt = new Date(data.expires_at);
    const isExpired = expiresAt < new Date();
    
    if (isExpired) {
      showError('This content has expired and is no longer available.');
      return;
    }

    // Show content info
    const daysUntilExpiration = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    resultDiv.innerHTML = `
      <div class="card">
        <h3 class="card-title">Content Information</h3>
        
        <div style="margin-bottom: 1.5rem;">
          <div class="info-row">
            <span class="info-label">CID:</span>
            <code class="info-value" style="word-break: break-all;">${cid}</code>
          </div>
          
          <div class="info-row">
            <span class="info-label">Size:</span>
            <span class="info-value">${formatFileSize(data.size_bytes)}</span>
          </div>
          
          <div class="info-row">
            <span class="info-label">Expiration:</span>
            <span class="info-value">
              ${expiresAt.toLocaleDateString()} (${daysUntilExpiration} days remaining)
            </span>
          </div>
          
          ${data.download_count ? `
            <div class="info-row">
              <span class="info-label">Downloads:</span>
              <span class="info-value">${data.download_count.toLocaleString()}</span>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="/${cid}" class="btn btn-primary" download>
            Download Content
          </a>
          
          <button class="btn btn-secondary show-ext-picker" data-cid="${cid}">
            Download with Extension
          </button>
        </div>
      </div>
    `;
    
    // Add event listener for extension picker button
    const extPickerBtn = resultDiv.querySelector('.show-ext-picker');
    if (extPickerBtn) {
      extPickerBtn.addEventListener('click', () => {
        showExtensionPicker(extPickerBtn.dataset.cid);
      });
    }
  } catch (error) {
    showError(`Error fetching content info: ${error.message}`);
  }
}

/**
 * Show extension picker modal
 */
function showExtensionPicker(cid) {
  const resultDiv = document.getElementById('retrieve-result');
  
  const commonExtensions = [
    { ext: 'txt', name: 'Text File' },
    { ext: 'json', name: 'JSON' },
    { ext: 'html', name: 'HTML' },
    { ext: 'pdf', name: 'PDF Document' },
    { ext: 'png', name: 'PNG Image' },
    { ext: 'jpg', name: 'JPEG Image' },
    { ext: 'mp4', name: 'MP4 Video' },
    { ext: 'mp3', name: 'MP3 Audio' },
    { ext: 'zip', name: 'ZIP Archive' }
  ];

  const extensionButtons = commonExtensions.map(({ ext, name }) => `
    <a href="/${cid}.${ext}" class="btn btn-secondary" download style="width: 100%;">
      ${name} (.${ext})
    </a>
  `).join('');

  const existingCard = resultDiv.querySelector('.card');
  existingCard.insertAdjacentHTML('afterend', `
    <div class="card extension-picker" style="margin-top: 1rem;">
      <h3 class="card-title">Download with Extension</h3>
      <p style="color: var(--color-text-light); margin-bottom: 1rem;">
        Choose a file extension to set the appropriate MIME type:
      </p>
      
      <div style="display: grid; gap: 0.5rem;">
        ${extensionButtons}
      </div>
      
      <div style="margin-top: 1rem;">
        <label for="custom-extension" class="form-label">Or enter custom extension:</label>
        <div style="display: flex; gap: 0.5rem;">
          <input 
            type="text" 
            id="custom-extension" 
            class="form-input" 
            placeholder="e.g., xml, csv"
            style="flex: 1;"
            data-cid="${cid}"
          >
          <button class="btn btn-primary custom-ext-btn">
            Download
          </button>
        </div>
      </div>
    </div>
  `);
  
  // Add event listener for custom extension button
  const customExtBtn = document.querySelector('.custom-ext-btn');
  if (customExtBtn) {
    customExtBtn.addEventListener('click', downloadWithCustomExtension);
  }
}

/**
 * Download with custom extension
 */
function downloadWithCustomExtension() {
  const input = document.getElementById('custom-extension');
  const cid = input.dataset.cid;
  const ext = input.value.trim().replace(/^\./, '');
  
  // Clear any previous error
  const existingError = document.querySelector('.extension-error');
  if (existingError) {
    existingError.remove();
  }
  
  if (!ext) {
    showExtensionError(input, 'Please enter a file extension');
    return;
  }
  
  // Validate extension format
  // Note: We only allow alphanumeric characters to prevent potential security issues
  // and ensure MIME type mapping works correctly. Complex extensions like "tar.gz"
  // are handled at the server level where the last extension (.gz) is extracted.
  if (!/^[a-zA-Z0-9]+$/.test(ext)) {
    showExtensionError(input, 'Invalid extension. Use only letters and numbers.');
    return;
  }
  
  window.location.href = `/${cid}.${ext}`;
}

/**
 * Show extension input error
 */
function showExtensionError(inputElement, message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'alert alert-error extension-error';
  errorDiv.style.marginTop = '0.5rem';
  errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
  
  inputElement.parentElement.parentElement.appendChild(errorDiv);
  
  // Clear error after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.remove();
    }
  }, 5000);
}

/**
 * Show error message
 */
function showError(message) {
  const resultDiv = document.getElementById('retrieve-result');
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <div class="alert alert-error">
      <strong>Error:</strong> ${message}
    </div>
  `;
}

// Auto-initialize if on retrieve page
if (document.getElementById('retrieve-form')) {
  initRetrievePage();
}
