/**
 * Supplier Validation Utilities
 * Provides validation for supplier URLs, CIDs, and SSRF protection
 */

/**
 * Validate supplier URL for security and format
 * @param {string} url - URL to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateSupplierURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  if (url.trim() === '') {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Parse URL
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return { valid: false, error: 'Malformed URL' };
  }

  // Only HTTPS allowed
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Check for SSRF attempts - block internal/private IPs
  const hostname = parsed.hostname.toLowerCase();
  
  // Block localhost variations
  if (hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname.startsWith('127.') ||
      hostname === '::1' ||
      hostname === '0.0.0.0') {
    return { valid: false, error: 'Localhost URLs are not allowed' };
  }

  // Block private IP ranges (IPv4)
  // 10.0.0.0/8
  if (hostname.startsWith('10.')) {
    return { valid: false, error: 'Private IP addresses are not allowed' };
  }

  // 172.16.0.0/12
  const parts = hostname.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) {
      return { valid: false, error: 'Private IP addresses are not allowed' };
    }
  }

  // 192.168.0.0/16
  if (hostname.startsWith('192.168.')) {
    return { valid: false, error: 'Private IP addresses are not allowed' };
  }

  // Block AWS metadata endpoint
  if (hostname === '169.254.169.254') {
    return { valid: false, error: 'Cloud metadata endpoints are not allowed' };
  }

  // Block link-local addresses
  if (hostname.startsWith('169.254.')) {
    return { valid: false, error: 'Link-local addresses are not allowed' };
  }

  // Block .local domains (internal DNS)
  if (hostname.endsWith('.local')) {
    return { valid: false, error: 'Internal DNS domains are not allowed' };
  }

  return { valid: true };
}

/**
 * Validate supplier type
 * @param {string} type - Supplier type
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateSupplierType(type) {
  const validTypes = ['SINGLE_CID', 'CID_GROUP'];
  
  if (!type) {
    return { valid: false, error: 'Supplier type is required' };
  }

  if (!validTypes.includes(type)) {
    return { valid: false, error: `Supplier type must be one of: ${validTypes.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Validate supplier name
 * @param {string} name - Supplier name
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateSupplierName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Supplier name is required' };
  }

  if (name.trim() === '') {
    return { valid: false, error: 'Supplier name cannot be empty' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Supplier name must be 100 characters or less' };
  }

  return { valid: true };
}

/**
 * Sanitize supplier name for safe display (prevent XSS)
 * @param {string} name - Supplier name
 * @returns {string} Sanitized name
 */
export function sanitizeSupplierName(name) {
  // Basic HTML entity encoding to prevent XSS
  return name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
