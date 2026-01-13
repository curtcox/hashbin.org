/**
 * Authentication Utilities
 * Cryptographic functions and validation for API keys
 */

import { AUTH_ERROR_CODES } from './middleware.js';

// API key format constants
const API_KEY_LENGTH = 32; // Random alphanumeric characters
const LIVE_PREFIX = 'hb_live_';
const TEST_PREFIX = 'hb_test_';

/**
 * Generate a cryptographically secure API key
 * Format: hb_live_<32-chars> or hb_test_<32-chars>
 */
export function generateApiKey(environment) {
  const prefix = environment === 'production' ? LIVE_PREFIX : TEST_PREFIX;
  const randomPart = generateRandomString(API_KEY_LENGTH);
  return prefix + randomPart;
}

/**
 * Generate cryptographically secure random string
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

/**
 * Hash API key using SHA-256
 * API keys are never stored in plaintext
 */
export async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Validate API key format
 * Checks prefix, length, and environment match
 */
export function validateApiKeyFormat(apiKey, environment) {
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'API key must be a non-empty string'
    };
  }

  // Check for correct prefix
  const hasLivePrefix = apiKey.startsWith(LIVE_PREFIX);
  const hasTestPrefix = apiKey.startsWith(TEST_PREFIX);

  if (!hasLivePrefix && !hasTestPrefix) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'API key must start with hb_live_ or hb_test_'
    };
  }

  // Check environment match
  if (environment === 'production' && !hasLivePrefix) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_ENV_MISMATCH,
      message: 'Test keys cannot be used in production environment'
    };
  }

  if (environment === 'development' && !hasTestPrefix) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_ENV_MISMATCH,
      message: 'Live keys cannot be used in development environment'
    };
  }

  // Check length
  const prefix = hasLivePrefix ? LIVE_PREFIX : TEST_PREFIX;
  const expectedLength = prefix.length + API_KEY_LENGTH;

  if (apiKey.length !== expectedLength) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: `API key must be exactly ${expectedLength} characters`
    };
  }

  // Check characters (alphanumeric only)
  const keyPart = apiKey.substring(prefix.length);
  const validChars = /^[A-Za-z0-9]+$/;
  if (!validChars.test(keyPart)) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'API key contains invalid characters'
    };
  }

  return {
    valid: true,
    error: null,
    message: null
  };
}

/**
 * Generate a unique key ID (UUID v4)
 */
export function generateKeyId() {
  return crypto.randomUUID();
}

/**
 * Validate key name
 */
export function validateKeyName(name) {
  if (!name || typeof name !== 'string') {
    return {
      valid: false,
      message: 'Key name is required'
    };
  }

  if (name.length > 255) {
    return {
      valid: false,
      message: 'Key name must be 255 characters or less'
    };
  }

  return {
    valid: true,
    message: null
  };
}

/**
 * Validate expiration date
 * Maximum 5 years from now
 */
export function validateExpiration(expiresAt) {
  if (!expiresAt) {
    // Default to 5 years from now
    const fiveYearsFromNow = new Date();
    fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
    return {
      valid: true,
      expiresAt: fiveYearsFromNow.toISOString()
    };
  }

  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const maxExpiration = new Date();
  maxExpiration.setFullYear(maxExpiration.getFullYear() + 5);

  // Check if date is valid
  if (isNaN(expirationDate.getTime())) {
    return {
      valid: false,
      message: 'Invalid expiration date format'
    };
  }

  // Check if already expired
  if (expirationDate <= now) {
    return {
      valid: false,
      message: 'Expiration date must be in the future'
    };
  }

  // Check if beyond 5 years
  if (expirationDate > maxExpiration) {
    return {
      valid: false,
      message: 'Expiration date cannot be more than 5 years in the future'
    };
  }

  return {
    valid: true,
    expiresAt: expirationDate.toISOString()
  };
}
