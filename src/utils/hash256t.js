/**
 * 256t Hash Generation Utility (Server-side)
 * Implements 256t specification for content-addressable storage
 * 
 * Format: 8-char length prefix + up to 86-char hash/content
 * - Content ≤ 64 bytes: Direct Base64URL encoding (inline content)
 * - Content > 64 bytes: SHA-512 hash
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const INLINE_CONTENT_THRESHOLD = 64; // bytes

/**
 * Generate 256t hash for content
 * @param {ArrayBuffer|Uint8Array} content - Content to hash
 * @returns {Promise<string>} 256t hash identifier
 */
export async function generate256tHash(content) {
  // Convert to Uint8Array if needed
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  
  // Check size limit
  if (bytes.length > MAX_FILE_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_FILE_SIZE} bytes (5GB)`);
  }

  // Generate length prefix (8 chars)
  const lengthPrefix = generateLengthPrefix(bytes.length);

  // For content ≤ 64 bytes, encode directly (inline content)
  if (bytes.length <= INLINE_CONTENT_THRESHOLD) {
    const contentEncoded = base64UrlEncode(bytes);
    return lengthPrefix + contentEncoded;
  }

  // For content > 64 bytes, use SHA-512 hash
  const hashBuffer = await crypto.subtle.digest('SHA-512', bytes);
  const hashEncoded = base64UrlEncode(new Uint8Array(hashBuffer));
  
  return lengthPrefix + hashEncoded;
}

/**
 * Generate 8-character length prefix
 * Encodes size as 6-byte big-endian integer, then Base64URL encodes
 * @param {number} size - Content size in bytes
 * @returns {string} 8-character prefix
 */
function generateLengthPrefix(size) {
  // Create 6-byte buffer for size (supports up to ~281TB)
  const buffer = new ArrayBuffer(6);
  const view = new DataView(buffer);
  
  // Store size as big-endian 48-bit integer
  // JavaScript numbers are safe up to 2^53, so 6 bytes (2^48) is fine
  const high = Math.floor(size / 0x100000000); // upper 16 bits
  const low = size >>> 0; // lower 32 bits
  
  view.setUint16(0, high, false); // big-endian
  view.setUint32(2, low, false); // big-endian
  
  // Base64URL encode (6 bytes -> 8 chars)
  return base64UrlEncode(new Uint8Array(buffer));
}

/**
 * Decode length prefix to get content size
 * @param {string} prefix - 8-character length prefix
 * @returns {number} Content size in bytes
 */
export function decodeLengthPrefix(prefix) {
  if (prefix.length !== 8) {
    throw new Error('Length prefix must be exactly 8 characters');
  }
  
  const bytes = base64UrlDecode(prefix);
  const view = new DataView(bytes.buffer);
  
  const high = view.getUint16(0, false); // big-endian
  const low = view.getUint32(2, false); // big-endian
  
  return high * 0x100000000 + low;
}

/**
 * Check if CID represents inline content
 * @param {string} cid - 256t content identifier
 * @returns {boolean} True if inline content
 */
export function isInlineContent(cid) {
  if (cid.length < 8) {
    throw new Error('Invalid CID: too short');
  }
  
  const prefix = cid.substring(0, 8);
  const size = decodeLengthPrefix(prefix);
  
  return size <= INLINE_CONTENT_THRESHOLD;
}

/**
 * Get content size from CID
 * @param {string} cid - 256t content identifier
 * @returns {number} Content size in bytes
 */
export function getContentSize(cid) {
  if (cid.length < 8) {
    throw new Error('Invalid CID: too short');
  }
  
  const prefix = cid.substring(0, 8);
  return decodeLengthPrefix(prefix);
}

/**
 * Extract content from inline CID
 * @param {string} cid - 256t content identifier
 * @returns {Uint8Array} Original content
 */
export function extractInlineContent(cid) {
  if (cid.length < 8) {
    throw new Error('Invalid CID: too short');
  }
  
  const prefix = cid.substring(0, 8);
  const size = decodeLengthPrefix(prefix);
  
  if (size > INLINE_CONTENT_THRESHOLD) {
    throw new Error('CID does not contain inline content');
  }
  
  const contentPart = cid.substring(8);
  const decoded = base64UrlDecode(contentPart);
  
  // Validate that decoded content matches expected size from prefix
  if (decoded.length !== size) {
    throw new Error(
      `Content size mismatch: expected ${size} bytes, got ${decoded.length} bytes`
    );
  }
  
  return decoded;
}

/**
 * Validate 256t CID format
 * @param {string} cid - Content identifier to validate
 * @returns {boolean} True if valid
 */
export function validate256tCID(cid) {
  // Check length (8-char prefix + up to 86-char hash/content)
  if (cid.length < 8 || cid.length > 94) {
    return false;
  }
  
  // Check characters (Base64URL: A-Za-z0-9_-)
  if (!/^[A-Za-z0-9_-]+$/.test(cid)) {
    return false;
  }
  
  try {
    // Try to decode length prefix
    const prefix = cid.substring(0, 8);
    const size = decodeLengthPrefix(prefix);
    
    // Size should be reasonable
    if (size < 0 || size > MAX_FILE_SIZE) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verify content matches CID
 * @param {ArrayBuffer|Uint8Array} content - Content to verify
 * @param {string} cid - Expected CID
 * @returns {Promise<boolean>} True if content matches CID
 */
export async function verifyContent(content, cid) {
  try {
    const computedCID = await generate256tHash(content);
    return computedCID === cid;
  } catch (error) {
    return false;
  }
}

/**
 * Base64URL encode (no padding)
 * @param {Uint8Array} bytes - Bytes to encode
 * @returns {string} Base64URL encoded string
 */
function base64UrlEncode(bytes) {
  // Convert bytes to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  
  // Convert to Base64URL (replace +/= with -_)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 * @param {string} str - Base64URL encoded string
 * @returns {Uint8Array} Decoded bytes
 */
function base64UrlDecode(str) {
  // Convert Base64URL to base64
  let base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  
  // Decode base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Get content size from CID without retrieving content
 * @param {string} cid - 256t content identifier
 * @returns {number} Content size in bytes
 */
export function getContentSize(cid) {
  if (cid.length < 8) {
    throw new Error('Invalid CID: too short');
  }
  
  const prefix = cid.substring(0, 8);
  return decodeLengthPrefix(prefix);
}
