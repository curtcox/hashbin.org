/**
 * Supplier Scanning Utilities
 * Handles verification of content from alternate suppliers
 */

import { generate256tHash, validate256tCID, getContentSize } from './hash256t.js';

const FETCH_TIMEOUT_MS = 30000; // 30 seconds
const MAX_SCAN_CIDS = 10000; // Maximum CIDs to scan from a group supplier

/**
 * Scan a single CID supplier
 * @param {string} baseUrl - Base URL of the supplier
 * @param {string} cid - CID to verify
 * @returns {Promise<{success: boolean, error?: string, size_bytes?: number}>}
 */
export async function scanSingleCID(baseUrl, cid) {
  try {
    // Construct URL
    const url = `${baseUrl}/${cid}`;
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      // First try HEAD request to check availability
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!headResponse.ok) {
        return {
          success: false,
          error: `HTTP ${headResponse.status}: ${headResponse.statusText}`
        };
      }
      
      // Now fetch full content to verify hash
      const getResponse = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      
      if (!getResponse.ok) {
        return {
          success: false,
          error: `HTTP ${getResponse.status}: ${getResponse.statusText}`
        };
      }
      
      const content = await getResponse.arrayBuffer();
      const sizeBytes = content.byteLength;
      
      // Verify size matches CID
      const expectedSize = getContentSize(cid);
      if (sizeBytes !== expectedSize) {
        return {
          success: false,
          error: `Size mismatch: got ${sizeBytes} bytes, expected ${expectedSize} bytes`
        };
      }
      
      // Verify hash
      const computedHash = await generate256tHash(content);
      if (computedHash !== cid) {
        return {
          success: false,
          error: 'Content hash does not match CID'
        };
      }
      
      return {
        success: true,
        size_bytes: sizeBytes
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout'
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Scan a GitHub repository for CIDs
 * @param {string} repoUrl - Base URL like https://raw.githubusercontent.com/user/repo/branch/path
 * @param {string} githubToken - GitHub service token for API access
 * @returns {Promise<{success: boolean, cids: string[], error?: string}>}
 */
export async function scanGitHubRepository(repoUrl, githubToken) {
  try {
    // Parse the GitHub raw URL to get API URL
    // Example: https://raw.githubusercontent.com/user/repo/refs/heads/main/cids
    // To API: https://api.github.com/repos/user/repo/contents/cids?ref=main
    
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:refs\/heads\/)?([^\/]+)(?:\/(.*))?/);
    if (!match) {
      return {
        success: false,
        cids: [],
        error: 'Invalid GitHub URL format'
      };
    }
    
    const [, owner, repo, branch, path] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path || ''}?ref=${branch}`;
    
    // Fetch directory listing from GitHub API
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': githubToken ? `Bearer ${githubToken}` : undefined,
        'User-Agent': 'HashBin.org'
      }
    });
    
    if (!response.ok) {
      return {
        success: false,
        cids: [],
        error: `GitHub API error: ${response.status} ${response.statusText}`
      };
    }
    
    const files = await response.json();
    
    if (!Array.isArray(files)) {
      return {
        success: false,
        cids: [],
        error: 'Expected array of files from GitHub API'
      };
    }
    
    // Filter files that look like CIDs
    const potentialCIDs = files
      .filter(file => file.type === 'file')
      .map(file => file.name)
      .filter(name => validate256tCID(name))
      .slice(0, MAX_SCAN_CIDS); // Limit number of CIDs
    
    // Verify each CID
    const verifiedCIDs = [];
    const baseRawUrl = repoUrl.replace(/\/$/, ''); // Remove trailing slash
    
    for (const cid of potentialCIDs) {
      const result = await scanSingleCID(baseRawUrl, cid);
      if (result.success) {
        verifiedCIDs.push(cid);
      }
    }
    
    return {
      success: true,
      cids: verifiedCIDs
    };
  } catch (error) {
    return {
      success: false,
      cids: [],
      error: error.message
    };
  }
}

/**
 * Scan a web directory for CIDs
 * @param {string} baseUrl - Base URL of the directory
 * @returns {Promise<{success: boolean, cids: string[], error?: string}>}
 */
export async function scanWebDirectory(baseUrl) {
  try {
    // Fetch directory listing page
    const response = await fetch(baseUrl);
    
    if (!response.ok) {
      return {
        success: false,
        cids: [],
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    const html = await response.text();
    
    // Extract links that look like CIDs
    // Match href="..." patterns
    const hrefPattern = /href=["']([^"']+)["']/gi;
    const matches = [...html.matchAll(hrefPattern)];
    
    const potentialCIDs = matches
      .map(match => {
        const href = match[1];
        // Get filename from href
        const parts = href.split('/');
        return parts[parts.length - 1];
      })
      .filter(name => validate256tCID(name))
      .slice(0, MAX_SCAN_CIDS); // Limit number of CIDs
    
    // Verify each CID
    const verifiedCIDs = [];
    const baseUrlClean = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    for (const cid of potentialCIDs) {
      const result = await scanSingleCID(baseUrlClean, cid);
      if (result.success) {
        verifiedCIDs.push(cid);
      }
    }
    
    return {
      success: true,
      cids: verifiedCIDs
    };
  } catch (error) {
    return {
      success: false,
      cids: [],
      error: error.message
    };
  }
}

/**
 * Perform a supplier scan based on type
 * @param {Object} supplier - Supplier object with type, base_url, and single_cid
 * @param {string} githubToken - GitHub service token (optional)
 * @returns {Promise<{success: boolean, cids: string[], error?: string}>}
 */
export async function scanSupplier(supplier, githubToken = null) {
  if (supplier.supplier_type === 'SINGLE_CID') {
    const result = await scanSingleCID(supplier.base_url, supplier.single_cid);
    return {
      success: result.success,
      cids: result.success ? [supplier.single_cid] : [],
      error: result.error
    };
  } else if (supplier.supplier_type === 'CID_GROUP') {
    // Check if it's a GitHub URL
    if (supplier.base_url.includes('github.com')) {
      return await scanGitHubRepository(supplier.base_url, githubToken);
    } else {
      return await scanWebDirectory(supplier.base_url);
    }
  } else {
    return {
      success: false,
      cids: [],
      error: `Unknown supplier type: ${supplier.supplier_type}`
    };
  }
}
