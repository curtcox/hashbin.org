export const CID_PATTERN = /^([A-Za-z0-9_-]{8,94})(?:\.([a-zA-Z0-9]+))?$/;
const INLINE_CONTENT_THRESHOLD = 64;
export function base64UrlDecode(str) {
  const padding = (4 - (str.length % 4)) % 4;
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeLengthPrefix(prefix) {
  const bytes = base64UrlDecode(prefix);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const high = view.getUint16(0, false);
  const low = view.getUint32(2, false);
  return high * 0x100000000 + low;
}

export function isInlineContent(cid) {
  return decodeLengthPrefix(cid.slice(0, 8)) <= INLINE_CONTENT_THRESHOLD;
}

export function extractInlineContent(cid) {
  const size = decodeLengthPrefix(cid.slice(0, 8));
  const bytes = base64UrlDecode(cid.slice(8));
  if (bytes.length !== size) {
    throw new Error('Inline CID payload size mismatch');
  }
  return bytes;
}

