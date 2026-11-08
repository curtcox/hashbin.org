import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const CHUNK_BYTES = 20 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Split only verified locked VM files; browser URLs and full-file hashes stay unchanged. */
export async function splitRuntimeAssets(assets, lock, chunkBytes = CHUNK_BYTES) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CHUNK_BYTES) throw new Error('Invalid runtime chunk size.');
  const base = 'runtime/' + lock.commit + '/';
  const raw = await readFile(join(assets, base, 'runtime.json'));
  if (digest(raw) !== lock.manifestSha256) throw new Error('Runtime manifest checksum mismatch.');
  const manifest = JSON.parse(raw);
  if (manifest.commit !== lock.commit) throw new Error('Runtime commit mismatch.');
  const files = {};
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!name || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-zA-Z0-9_./-]+$/.test(name)) throw new Error('Unsafe runtime path.');
    const path = base + name, bytes = await readFile(join(assets, path));
    if (bytes.length !== expected.size || digest(bytes) !== expected.sha256) throw new Error('Runtime checksum mismatch: ' + name);
    if (bytes.length <= chunkBytes) continue;
    const chunks = [];
    for (let start = 0; start < bytes.length; start += chunkBytes) {
      const piece = bytes.subarray(start, start + chunkBytes), part = '__runtime_chunks/' + expected.sha256 + '/' + chunks.length;
      await mkdir(join(assets, part, '..'), { recursive: true });
      await writeFile(join(assets, part), piece);
      chunks.push({ path: '/' + part, size: piece.length });
    }
    files['/' + path] = { size: expected.size, sha256: expected.sha256, chunks };
    await rm(join(assets, path));
  }
  return files;
}
