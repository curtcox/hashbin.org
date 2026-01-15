/**
 * MIME Type Resolution Utility
 * Maps file extensions to MIME types for content download
 */

/**
 * Common MIME type mappings (~60 types)
 */
const MIME_TYPES = {
  // Text
  'txt': 'text/plain',
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'csv': 'text/csv',
  'xml': 'text/xml',
  'md': 'text/markdown',
  
  // Application
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'json': 'application/json',
  'pdf': 'application/pdf',
  'zip': 'application/zip',
  'gz': 'application/gzip',
  'gzip': 'application/gzip',
  'tar': 'application/x-tar',
  '7z': 'application/x-7z-compressed',
  'rar': 'application/vnd.rar',
  'wasm': 'application/wasm',
  
  // Fonts
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'otf': 'font/otf',
  
  // Images
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
  'avif': 'image/avif',
  
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  'flac': 'audio/flac',
  'aac': 'audio/aac',
  
  // Video
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogv': 'video/ogg',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'mkv': 'video/x-matroska',
  
  // Documents
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'odt': 'application/vnd.oasis.opendocument.text',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'epub': 'application/epub+zip',
  
  // Other
  'bin': 'application/octet-stream',
  'exe': 'application/octet-stream',
  'dll': 'application/octet-stream',
  'iso': 'application/octet-stream',
  'dmg': 'application/octet-stream'
};

/**
 * Default MIME type for unknown extensions
 */
const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Get MIME type from file extension
 * @param {string} extension - File extension (with or without leading dot)
 * @returns {string} MIME type
 */
export function getMimeType(extension) {
  if (!extension) {
    return DEFAULT_MIME_TYPE;
  }
  
  // Remove leading dot and convert to lowercase
  const ext = extension.replace(/^\./, '').toLowerCase();
  
  return MIME_TYPES[ext] || DEFAULT_MIME_TYPE;
}

/**
 * Extract extension from filename or URL
 * @param {string} filename - Filename or URL
 * @returns {string|null} Extension without dot, or null if none
 */
export function extractExtension(filename) {
  if (!filename) {
    return null;
  }
  
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Get MIME type from filename
 * @param {string} filename - Filename or URL
 * @returns {string} MIME type
 */
export function getMimeTypeFromFilename(filename) {
  const extension = extractExtension(filename);
  return getMimeType(extension);
}
