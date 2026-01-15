/**
 * Web Worker for 256t Hash Calculation
 * Performs hash calculation in background to avoid blocking UI
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const INLINE_CONTENT_THRESHOLD = 64; // bytes

// Listen for messages from main thread
self.onmessage = async function(event) {
  const { file } = event.data;
  
  try {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      postMessage({
        type: 'error',
        error: `File exceeds maximum size of ${MAX_FILE_SIZE} bytes (5GB)`
      });
      return;
    }

    // Generate hash
    const cid = await generateHash(file);
    
    postMessage({
      type: 'complete',
      data: { cid }
    });
  } catch (error) {
    postMessage({
      type: 'error',
      error: error.message
    });
  }
};

/**
 * Generate 256t hash for file
 * @param {File|Blob} file - File to hash
 * @returns {Promise<string>} 256t hash identifier
 */
async function generateHash(file) {
  // Report initial progress
  postMessage({ type: 'progress', progress: 0 });

  // Read file content
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  postMessage({ type: 'progress', progress: 30 });

  // Generate length prefix
  const lengthPrefix = generateLengthPrefix(bytes.length);

  // For content ≤ 64 bytes, encode directly (inline content)
  if (bytes.length <= INLINE_CONTENT_THRESHOLD) {
    const contentEncoded = base64UrlEncode(bytes);
    postMessage({ type: 'progress', progress: 100 });
    return lengthPrefix + contentEncoded;
  }

  postMessage({ type: 'progress', progress: 50 });

  // For content > 64 bytes, use SHA-512 hash
  const hashBuffer = await crypto.subtle.digest('SHA-512', bytes);
  const hashEncoded = base64UrlEncode(new Uint8Array(hashBuffer));
  
  postMessage({ type: 'progress', progress: 100 });
  return lengthPrefix + hashEncoded;
}

/**
 * Generate 8-character length prefix
 * @param {number} size - Content size in bytes
 * @returns {string} 8-character prefix
 */
function generateLengthPrefix(size) {
  const buffer = new ArrayBuffer(6);
  const view = new DataView(buffer);
  
  const high = Math.floor(size / 0x100000000);
  const low = size >>> 0;
  
  view.setUint16(0, high, false);
  view.setUint32(2, low, false);
  
  return base64UrlEncode(new Uint8Array(buffer));
}

/**
 * Base64URL encode (no padding)
 * @param {Uint8Array} bytes - Bytes to encode
 * @returns {string} Base64URL encoded string
 */
function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
