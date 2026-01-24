/**
 * IP Address Hashing Utility
 * Provides one-way hashing of IP addresses for privacy
 */

/**
 * Hash an IP address using SHA-256
 * @param {string} ip - IP address to hash
 * @returns {Promise<string>} - Hex-encoded hash
 */
export async function hashIP(ip) {
  if (!ip || ip === 'unknown') {
    return 'unknown';
  }

  // Use Web Crypto API to hash the IP
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
