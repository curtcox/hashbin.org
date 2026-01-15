/**
 * 256t Hash Generation Utility (Client-side)
 * Implements 256t specification for content-addressable storage
 * 
 * Format: 8-char length prefix + up to 86-char hash/content
 * - Content ≤ 64 bytes: Direct Base64URL encoding (inline content)
 * - Content > 64 bytes: SHA-512 hash
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const INLINE_CONTENT_THRESHOLD = 64; // bytes

/**
 * Generate 256t hash for a File or Blob
 * Uses Web Worker for large files to avoid blocking UI
 * @param {File|Blob} file - File or Blob to hash
 * @param {Function} onProgress - Optional progress callback (percent: number) => void
 * @returns {Promise<string>} 256t hash identifier
 */
export async function generate256tHash(file, onProgress = null) {
  // Check size limit
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes (5GB)`);
  }

  // For small files (≤ 1MB) or inline content, hash directly
  if (file.size <= 1024 * 1024 || file.size <= INLINE_CONTENT_THRESHOLD) {
    return hashDirect(file, onProgress);
  }

  // For large files, use Web Worker
  return hashWithWorker(file, onProgress);
}

/**
 * Hash file directly (for small files)
 * @param {File|Blob} file - File to hash
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<string>} 256t hash identifier
 */
async function hashDirect(file, onProgress) {
  if (onProgress) onProgress(0);
  
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  if (onProgress) onProgress(50);
  
  // Generate length prefix
  const lengthPrefix = generateLengthPrefix(bytes.length);

  // For content ≤ 64 bytes, encode directly (inline content)
  if (bytes.length <= INLINE_CONTENT_THRESHOLD) {
    const contentEncoded = base64UrlEncode(bytes);
    if (onProgress) onProgress(100);
    return lengthPrefix + contentEncoded;
  }

  // For content > 64 bytes, use SHA-512 hash
  const hashBuffer = await crypto.subtle.digest('SHA-512', bytes);
  const hashEncoded = base64UrlEncode(new Uint8Array(hashBuffer));
  
  if (onProgress) onProgress(100);
  return lengthPrefix + hashEncoded;
}

/**
 * Hash file using Web Worker (for large files)
 * @param {File|Blob} file - File to hash
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<string>} 256t hash identifier
 */
async function hashWithWorker(file, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/js/hash-worker.js');
    
    worker.onmessage = (event) => {
      const { type, data, error, progress } = event.data;
      
      if (type === 'progress' && onProgress) {
        onProgress(progress);
      } else if (type === 'complete') {
        worker.terminate();
        resolve(data.cid);
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(error));
      }
    };
    
    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };
    
    // Send file to worker
    worker.postMessage({ file });
  });
}

/**
 * Generate 8-character length prefix
 * Encodes size as 6-byte big-endian integer, then Base64URL encodes
 * @param {number} size - Content size in bytes
 * @returns {string} 8-character prefix
 */
function generateLengthPrefix(size) {
  // Create 6-byte buffer for size
  const buffer = new ArrayBuffer(6);
  const view = new DataView(buffer);
  
  // Store size as big-endian 48-bit integer
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
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes === 1) return '1 byte';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  if (i === 0) return bytes + ' bytes';
  
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + units[i];
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
