/**
 * API Keys Client Module
 * Handles all API key operations
 */

import { authenticatedFetch, handleApiError } from './utils.js';

/**
 * List all API keys for the current user
 * @returns {Promise<Array>} Array of API key objects
 */
export async function listApiKeys() {
  const response = await authenticatedFetch('/api/auth/apikeys');
  await handleApiError(response);
  return response.json();
}

/**
 * Create a new API key
 * @param {Object} data API key data
 * @param {string} data.name Key name (1-100 characters)
 * @param {string} data.environment 'live' or 'test'
 * @param {string} data.expiresAt ISO 8601 timestamp
 * @returns {Promise<Object>} Created API key with full key value
 */
export async function createApiKey(data) {
  const response = await authenticatedFetch('/api/auth/apikeys', {
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
 * Update API key name (requires fresh authentication)
 * @param {string} keyId API key ID
 * @param {string} name New name (1-100 characters)
 * @returns {Promise<Object>} Updated API key
 */
export async function updateApiKeyName(keyId, name) {
  const response = await authenticatedFetch(`/api/auth/apikeys/${keyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });
  await handleApiError(response);
  return response.json();
}

/**
 * Reveal API key (requires fresh authentication)
 * @param {string} keyId API key ID
 * @returns {Promise<Object>} Object with full key value
 */
export async function revealApiKey(keyId) {
  const response = await authenticatedFetch(`/api/auth/apikeys/${keyId}/reveal`, {
    method: 'POST'
  });
  await handleApiError(response);
  return response.json();
}

/**
 * Revoke API key
 * @param {string} keyId API key ID
 * @returns {Promise<void>}
 */
export async function revokeApiKey(keyId) {
  const response = await authenticatedFetch(`/api/auth/apikeys/${keyId}`, {
    method: 'DELETE'
  });
  await handleApiError(response);
}

/**
 * Format usage count with K/M notation
 * @param {number} count Usage count
 * @returns {string} Formatted count (e.g., "1.2K", "3.4M")
 */
export function formatUsageCount(count) {
  if (count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 1000000) return (count / 1000).toFixed(1) + 'K';
  return (count / 1000000).toFixed(1) + 'M';
}

/**
 * Format relative time
 * @param {string|null} timestamp ISO 8601 timestamp or null
 * @returns {string} Relative time (e.g., "2 hours ago", "Never")
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  if (seconds < 2592000) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  
  // Format as date for older timestamps
  return date.toLocaleDateString();
}

/**
 * Get days until expiration
 * @param {string} expiresAt ISO 8601 timestamp
 * @returns {number} Days until expiration (negative if expired)
 */
export function getDaysUntilExpiration(expiresAt) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires - now;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if key is expiring soon (within 30 days)
 * @param {string} expiresAt ISO 8601 timestamp
 * @returns {boolean} True if expiring within 30 days
 */
export function isExpiringSoon(expiresAt) {
  const days = getDaysUntilExpiration(expiresAt);
  return days >= 0 && days <= 30;
}

/**
 * Check if key is expired
 * @param {string} expiresAt ISO 8601 timestamp
 * @returns {boolean} True if expired
 */
export function isExpired(expiresAt) {
  return getDaysUntilExpiration(expiresAt) < 0;
}

/**
 * Get key prefix (first 12 chars + ellipsis)
 * @param {string} key Full API key or key_id
 * @returns {string} Key prefix (e.g., "hb_live_abc...")
 */
export function getKeyPrefix(key) {
  if (!key) return '';
  if (key.length <= 15) return key;
  return key.substring(0, 12) + '...';
}

/**
 * Copy text to clipboard
 * @param {string} text Text to copy
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
