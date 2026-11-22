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
/** zlib (RFC 1950) decompress, stopping as soon as the output passes maxBytes. */
export async function inflate(bytes, maxBytes = 16 * 1024 * 1024) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error('status list too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

/**
 * Read one status bit (1 = revoked). Indexes beyond the list are 0 (valid). Plain arithmetic
 * rather than `>>`/`&`, which would truncate the index to 32 bits and read the wrong bit.
 */
export function getBit(bytes, index) {
  if (!Number.isSafeInteger(index) || index < 0) return 0;
  const byte = bytes[Math.floor(index / 8)];
  return byte === undefined ? 0 : (byte >> (index % 8)) & 1;
}

/** Set one status bit in place, growing the array when needed. Returns the (possibly new) array. */
export function setBit(bytes, index, value = 1) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 2 ** 31 - 1) throw new RangeError('status index out of range');
  const at = Math.floor(index / 8); const mask = 1 << (index % 8);
  let out = bytes;
  if (at >= out.length) { out = new Uint8Array(Math.max(at + 1, out.length * 2)); out.set(bytes); }
  if (value) out[at] |= mask; else out[at] &= ~mask;
  return out;
}

/** Encode bytes as a status_list claim. */
export async function encodeStatusList(bytes) { return { bits: 1, lst: b64u(await deflate(bytes)) }; }

/** Decode a status_list claim to bytes. */
export async function decodeStatusList(claim) {
  if (!claim || claim.bits !== 1 || typeof claim.lst !== 'string') throw new Error('unsupported status list');
  return inflate(unb64u(claim.lst));
}
