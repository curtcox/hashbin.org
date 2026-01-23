/**
 * Suppliers Client Module
 * Handles all supplier operations
 */

import { authenticatedFetch, handleApiError } from './utils.js';

/**
 * List all suppliers for the current user
 * @param {Object} options Pagination options
 * @param {number} options.limit Items per page (default: 20)
 * @param {number} options.offset Offset for pagination (default: 0)
 * @returns {Promise<Object>} Object with suppliers array and pagination info
 */
export async function listSuppliers(options = {}) {
  const { limit = 20, offset = 0 } = options;
  const params = new URLSearchParams({ limit, offset });
  
  const response = await authenticatedFetch(`/api/suppliers?${params}`);
  await handleApiError(response);
  return response.json();
}

/**
 * Get details of a specific supplier
 * @param {string} supplierId Supplier ID
 * @returns {Promise<Object>} Supplier details
 */
export async function getSupplier(supplierId) {
  const response = await authenticatedFetch(`/api/suppliers/${supplierId}`);
  await handleApiError(response);
  return response.json();
}

/**
 * Create a new supplier
 * @param {Object} data Supplier data
 * @param {string} data.name Display name
 * @param {string} data.supplier_type "SINGLE_CID" or "CID_GROUP"
 * @param {string} data.base_url Base URL for the supplier
 * @param {string} [data.single_cid] CID (required for SINGLE_CID type)
 * @returns {Promise<Object>} Created supplier
 */
export async function createSupplier(data) {
  const response = await authenticatedFetch('/api/suppliers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  await handleApiError(response);
  return response.json();
}

/**
 * Update supplier (name or active status)
 * @param {string} supplierId Supplier ID
 * @param {Object} data Update data
 * @param {string} [data.name] New name
 * @param {boolean} [data.is_active] Active status
 * @returns {Promise<Object>} Updated supplier
 */
export async function updateSupplier(supplierId, data) {
  const response = await authenticatedFetch(`/api/suppliers/${supplierId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  await handleApiError(response);
  return response.json();
}

/**
 * Delete a supplier
 * @param {string} supplierId Supplier ID
 * @returns {Promise<void>}
 */
export async function deleteSupplier(supplierId) {
  const response = await authenticatedFetch(`/api/suppliers/${supplierId}`, {
    method: 'DELETE'
  });
  await handleApiError(response);
}

/**
 * Request a rescan of a supplier
 * @param {string} supplierId Supplier ID
 * @returns {Promise<Object>} Scan status
 */
export async function rescanSupplier(supplierId) {
  const response = await authenticatedFetch(`/api/suppliers/${supplierId}/scan`, {
    method: 'POST'
  });
  await handleApiError(response);
  return response.json();
}

/**
 * Get alternate suppliers for a CID
 * @param {string} cid Content ID
 * @returns {Promise<Array>} Array of supplier objects
 */
export async function getCIDSuppliers(cid) {
  const response = await fetch(`/api/content/${cid}/suppliers`);
  await handleApiError(response);
  return response.json();
}

/**
 * Format supplier type for display
 * @param {string} type Supplier type
 * @returns {string} Formatted type
 */
export function formatSupplierType(type) {
  if (type === 'SINGLE_CID') return 'Single CID';
  if (type === 'CID_GROUP') return 'CID Group';
  return type;
}

/**
 * Format scan status for display
 * @param {string} status Scan status
 * @returns {Object} Object with text and CSS class
 */
export function formatScanStatus(status) {
  const statusMap = {
    'pending': { text: 'Pending', class: 'badge-secondary' },
    'scanning': { text: 'Scanning...', class: 'badge-warning' },
    'completed': { text: 'Completed', class: 'badge-success' },
    'failed': { text: 'Failed', class: 'badge-error' }
  };
  return statusMap[status] || { text: status, class: 'badge-secondary' };
}

/**
 * Format success rate percentage
 * @param {Object} stats Supplier statistics
 * @returns {string} Formatted percentage
 */
export function formatSuccessRate(stats) {
  if (!stats || stats.total_requests === 0) {
    return 'N/A';
  }
  
  const rate = (stats.successful_requests / stats.total_requests) * 100;
  return `${rate.toFixed(1)}%`;
}

/**
 * Format response time
 * @param {number} timeMs Time in milliseconds
 * @returns {string} Formatted time
 */
export function formatResponseTime(timeMs) {
  if (timeMs === null || timeMs === undefined) {
    return 'N/A';
  }
  return `${timeMs.toFixed(0)}ms`;
}

/**
 * Format timestamp as relative time
 * @param {string|null} timestamp ISO 8601 timestamp
 * @returns {string} Relative time (e.g., "2 hours ago", "Never")
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Check if rescan is available (respects 1-hour cooldown)
 * @param {string} lastScannedAt Last scan timestamp
 * @returns {boolean} True if rescan is available
 */
export function canRescan(lastScannedAt) {
  if (!lastScannedAt) return true;
  
  const now = Date.now();
  const lastScan = new Date(lastScannedAt).getTime();
  const diffMs = now - lastScan;
  const oneHourMs = 60 * 60 * 1000;
  
  return diffMs >= oneHourMs;
}

/**
 * Get time until rescan is available
 * @param {string} lastScannedAt Last scan timestamp
 * @returns {string} Time remaining (e.g., "45 minutes")
 */
export function getRescanCooldown(lastScannedAt) {
  if (!lastScannedAt) return null;
  
  const now = Date.now();
  const lastScan = new Date(lastScannedAt).getTime();
  const diffMs = now - lastScan;
  const oneHourMs = 60 * 60 * 1000;
  
  if (diffMs >= oneHourMs) return null;
  
  const remainingMs = oneHourMs - diffMs;
  const remainingMin = Math.ceil(remainingMs / 60000);
  
  return `${remainingMin} minute${remainingMin !== 1 ? 's' : ''}`;
}

/**
 * Validate supplier form data
 * @param {Object} data Form data
 * @returns {Object} Validation result with { valid, errors }
 */
export function validateSupplierForm(data) {
  const errors = [];
  
  // Validate name
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  } else if (data.name.length > 100) {
    errors.push('Name must be 100 characters or less');
  }
  
  // Validate supplier type
  if (!data.supplier_type) {
    errors.push('Supplier type is required');
  } else if (!['SINGLE_CID', 'CID_GROUP'].includes(data.supplier_type)) {
    errors.push('Invalid supplier type');
  }
  
  // Validate base URL
  if (!data.base_url || data.base_url.trim().length === 0) {
    errors.push('Base URL is required');
  } else {
    try {
      const url = new URL(data.base_url);
      if (url.protocol !== 'https:') {
        errors.push('Base URL must use HTTPS');
      }
    } catch (e) {
      errors.push('Base URL is not a valid URL');
    }
  }
  
  // Validate single_cid for SINGLE_CID type
  if (data.supplier_type === 'SINGLE_CID') {
    if (!data.single_cid || data.single_cid.trim().length === 0) {
      errors.push('CID is required for Single CID suppliers');
    } else if (!/^[A-Za-z0-9_-]{8,94}$/.test(data.single_cid)) {
      errors.push('CID format is invalid (8-94 characters, Base64URL)');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
