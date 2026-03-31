/**
 * Utility Functions
 * Shared helper functions for the frontend
 */

let appConfigPromise = null;

/**
 * Format balance from cents to dollars
 * @param {number} cents Balance in cents
 * @returns {string} Formatted balance (e.g., "$12.50")
 */
export function formatBalance(cents) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Fetch with authentication
 * Wrapper around fetch that automatically adds auth token
 * @param {string} url Request URL
 * @param {Object} options Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  // Import dynamically to avoid circular dependency
  const { getAuthHeaders } = await import('./auth-loader.js');
  const authHeaders = await getAuthHeaders();
  
  if (!authHeaders) {
    throw new Error('Not authenticated');
  }

  const headers = {
    ...options.headers,
    ...authHeaders
  };

  return fetch(url, { ...options, headers });
}

export async function getAppConfig() {
  if (!appConfigPromise) {
    appConfigPromise = fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Config request failed with ${response.status}`);
        }
        return response.json();
      })
      .catch((error) => {
        console.warn('Falling back to default app config.', error);
        return {
          content_domain: '256t.us'
        };
      });
  }

  return appConfigPromise;
}

export async function contentUrl(cid, ext = null) {
  const config = await getAppConfig();
  const domain = config.content_domain || '256t.us';
  const baseUrl = /^https?:\/\//i.test(domain) ? domain.replace(/\/$/, '') : `https://${domain}`;
  const suffix = ext ? `.${String(ext).replace(/^\./, '')}` : '';
  return `${baseUrl}/${cid}${suffix}`;
}

/**
 * Show element
 * @param {HTMLElement|string} element Element or selector
 */
export function showElement(element) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (el) {
    el.classList.remove('hidden');
  }
}

/**
 * Hide element
 * @param {HTMLElement|string} element Element or selector
 */
export function hideElement(element) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (el) {
    el.classList.add('hidden');
  }
}

/**
 * Set element loading state
 * @param {HTMLElement|string} element Element or selector
 * @param {boolean} loading Whether to add or remove loading state
 */
export function setLoading(element, loading) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (el) {
    if (loading) {
      el.classList.add('loading');
    } else {
      el.classList.remove('loading');
    }
  }
}

/**
 * Get current page redirect URL for auth
 * @returns {string} Current page URL for return after auth
 */
export function getCurrentPageUrl() {
  return window.location.pathname + window.location.search;
}

/**
 * Redirect with return URL
 * @param {string} destination Destination URL
 * @param {string} returnUrl Optional return URL (defaults to current page)
 */
export function redirectWithReturn(destination, returnUrl = null) {
  const returnTo = returnUrl || getCurrentPageUrl();
  const url = new URL(destination, window.location.origin);
  url.searchParams.set('return', returnTo);
  window.location.href = url.toString();
}

/**
 * Get return URL from query params
 * @returns {string|null} Return URL or null
 */
export function getReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('return');
}

/**
 * Debounce function
 * @param {Function} func Function to debounce
 * @param {number} wait Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create spinner element
 * @param {string} size Size class (sm, md, lg)
 * @returns {HTMLElement} Spinner element
 */
export function createSpinner(size = 'md') {
  const spinner = document.createElement('div');
  spinner.className = `spinner spinner-${size}`;
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', 'Loading');
  return spinner;
}

/**
 * Show toast message (simple implementation)
 * @param {string} message Message to display
 * @param {string} type Type of message (info, success, warning, error)
 * @param {number} duration Duration in ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  // Remove any existing toasts
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 24px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  `;

  // Set color based on type
  const colors = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444'
  };
  toast.style.borderLeft = `4px solid ${colors[type]}`;

  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Handle API errors
 * @param {Response} response Fetch response
 * @returns {Promise<Object>} Parsed error or throws
 */
export async function handleApiError(response) {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'Unknown error', message: response.statusText };
    }
    
    const error = new Error(errorData.message || errorData.error || 'Request failed');
    error.status = response.status;
    error.data = errorData;
    throw error;
  }
  
  return response;
}
