/**
 * IETF OAuth Token Status List (1 bit per credential): bit i lives in byte floor(i/8) at
 * position i % 8, least significant bit first; the byte array is zlib-compressed and base64url.
 */
import { b64u, unb64u } from './jose.js';

async function pipe(bytes, stream) {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** zlib (RFC 1950) compress. */
export function deflate(bytes) { return pipe(bytes, new CompressionStream('deflate')); }
/** zlib (RFC 1950) decompress, bounded so a hostile list cannot exhaust memory. */
export async function inflate(bytes, maxBytes = 16 * 1024 * 1024) {
  const out = await pipe(bytes, new DecompressionStream('deflate'));
  if (out.length > maxBytes) throw new Error('status list too large');
  return out;
}

/** Read one status bit (1 = revoked). Indexes beyond the list are 0 (valid). */
export function getBit(bytes, index) {
  const byte = bytes[index >> 3];
  return byte === undefined ? 0 : (byte >> (index & 7)) & 1;
}

/** Set one status bit in place, growing the array when needed. Returns the (possibly new) array. */
export function setBit(bytes, index, value = 1) {
  let out = bytes;
  if ((index >> 3) >= out.length) { out = new Uint8Array(Math.max((index >> 3) + 1, out.length * 2)); out.set(bytes); }
  if (value) out[index >> 3] |= 1 << (index & 7); else out[index >> 3] &= ~(1 << (index & 7));
  return out;
}

/** Encode bytes as a status_list claim. */
export async function encodeStatusList(bytes) { return { bits: 1, lst: b64u(await deflate(bytes)) }; }

/** Decode a status_list claim to bytes. */
export async function decodeStatusList(claim) {
  if (!claim || claim.bits !== 1 || typeof claim.lst !== 'string') throw new Error('unsupported status list');
  return inflate(unb64u(claim.lst));
}
