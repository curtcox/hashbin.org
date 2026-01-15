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
 * Uses rejection sampling to avoid modulo bias
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  
  // Use rejection sampling to avoid modulo bias
  // Generate enough random bytes to avoid bias
  const maxValidValue = 256 - (256 % charsLength);
  
  let result = '';
  let bytesNeeded = length;
  
  while (bytesNeeded > 0) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(bytesNeeded * 2));
    
    for (let i = 0; i < randomBytes.length && result.length < length; i++) {
      // Reject bytes that would cause bias
      if (randomBytes[i] < maxValidValue) {
        result += chars[randomBytes[i] % charsLength];
      }
    }
    
    bytesNeeded = length - result.length;
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

/**
 * Encrypt API key using AES-256-GCM
 * Returns base64-encoded ciphertext with IV prepended
 * Format: <12-byte IV><ciphertext><16-byte auth tag>
 */
export async function encryptApiKey(apiKey, encryptionKey) {
  // Convert encryption key from base64 to CryptoKey
  const keyData = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the API key
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext
  );

  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Return base64-encoded result
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt API key using AES-256-GCM
 * Expects base64-encoded ciphertext with IV prepended
 */
export async function decryptApiKey(encryptedKey, encryptionKey) {
  // Convert encryption key from base64 to CryptoKey
  const keyData = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));

  // Extract IV (first 12 bytes)
  const iv = combined.slice(0, 12);

  // Extract ciphertext (remaining bytes)
  const ciphertext = combined.slice(12);

  // Decrypt
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    throw new Error('Decryption failed: Invalid key or corrupted data');
  }
}

/**
 * Check if a Clerk session is "fresh" (authenticated within threshold minutes)
 * Used for sensitive operations like key reveal
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
