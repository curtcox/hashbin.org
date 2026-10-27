/**
 * Authentication Utilities
 * Cryptographic functions and validation for API keys
 */

import { API_KEY_PATTERN } from './download-tokens.js';
import { AUTH_ERROR_CODES } from './middleware.js';

// API keys last 90 days unless the creator picks a date, and never more than a year.
const DEFAULT_KEY_LIFETIME_DAYS = 90;
const MAX_KEY_LIFETIME_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Validate API key format: hbk_<route>.<random>.<tag>
 */
export function validateApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'API key must be a non-empty string'
    };
  }

  if (!API_KEY_PATTERN.test(apiKey)) {
    return {
      valid: false,
      error: AUTH_ERROR_CODES.AUTH_INVALID_FORMAT,
      message: 'API key must have the form hbk_<route>.<random>.<tag>'
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
 * Empty names are allowed (will use smart default)
 */
export function validateKeyName(name) {
  // Empty name is allowed - will use smart default
  if (!name || name.trim() === '') {
    return {
      valid: true,
      message: null
    };
  }
  
  if (typeof name !== 'string') {
    return {
      valid: false,
      message: 'Key name must be a string'
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
 * Defaults to 90 days from now; at most one year from now
 */
export function validateExpiration(expiresAt) {
  const now = new Date();
  if (!expiresAt) {
    return {
      valid: true,
      expiresAt: new Date(now.getTime() + DEFAULT_KEY_LIFETIME_DAYS * DAY_MS).toISOString()
    };
  }

  const expirationDate = new Date(expiresAt);

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

  if (expirationDate.getTime() > now.getTime() + MAX_KEY_LIFETIME_DAYS * DAY_MS) {
    return {
      valid: false,
      message: 'Expiration date cannot be more than one year in the future'
    };
  }

  return {
    valid: true,
    expiresAt: expirationDate.toISOString()
  };
}

/**
 * Check if a Clerk session is "fresh" (authenticated within threshold minutes)
 * Used for sensitive operations like changing a key
 * @param {Object} session - Clerk session object with 'iat' (issued at) timestamp
 * @param {number} thresholdMinutes - Maximum age in minutes (default: 5)
 * @returns {boolean} True if session is fresh
 */
export function isSessionFresh(session, thresholdMinutes = 5) {
  if (!session || !session.iat) {
    return false;
  }

  // session.iat is Unix timestamp in seconds
  const issuedAt = new Date(session.iat * 1000);
  const now = new Date();
  const thresholdMs = thresholdMinutes * 60 * 1000;
  const ageMs = now.getTime() - issuedAt.getTime();

  // Must be strictly less than threshold (not equal)
  return ageMs < thresholdMs;
}
