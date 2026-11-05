import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { splitRuntimeAssets } from './apptron-assets.mjs';
import { chunkResponse } from './chunk-response.js';
const sha = data => createHash('sha256').update(data).digest('hex');

describe('locked Apptron runtime static delivery', () => {
  it('reconstructs the exact pinned bytes, hides chunks, and preserves HTTP metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'apptron-chunks-'));
    try {
      const bytes = Buffer.from('original runtime bytes'), path = '/runtime/abc/sys.tar.gz';
      const manifest = JSON.stringify({ commit: 'abc', files: { 'sys.tar.gz': { size: bytes.length, sha256: sha(bytes) } } });
      await mkdir(join(directory, 'runtime/abc'), { recursive: true });
      await writeFile(join(directory, path), bytes);
      await writeFile(join(directory, 'runtime/abc/runtime.json'), manifest);
      const files = await splitRuntimeAssets(directory, { commit: 'abc', manifestSha256: sha(manifest) }, 7);
      await expect(readFile(join(directory, path))).rejects.toThrow();
      let reads = 0;
      const assets = { fetch: async request => {
        reads++;
        return new Response(await readFile(join(directory, new URL(request.url || request).pathname)));
      } };
      const response = await chunkResponse(new Request('https://editor.test' + path, { headers: { Range: 'bytes=1-3' } }), assets, files);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Length')).toBe(String(bytes.length));
      expect(response.headers.get('ETag')).toBe('"' + sha(bytes) + '"');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(reads).toBe(4);
      const head = await chunkResponse(new Request('https://editor.test' + path, { method: 'HEAD' }), assets, files);
      expect(await head.text()).toBe(''); expect(reads).toBe(4);
      const unchanged = await chunkResponse(new Request('https://editor.test' + path, { headers: { 'If-None-Match': response.headers.get('ETag') } }), assets, files);
      expect(unchanged.status).toBe(304); expect(reads).toBe(4);
      expect((await chunkResponse(new Request('https://editor.test/__runtime_chunks/private/0'), assets, files)).status).toBe(404);
      expect((await chunkResponse(new Request('https://editor.test' + path, { method: 'POST' }), assets, files)).status).toBe(405);
      const forged = { commit: 'abc', files: { 'sys.tar.gz': { size: bytes.length, sha256: sha('tampered') } } };
      const forgedRaw = JSON.stringify(forged);
      await writeFile(join(directory, 'runtime/abc/runtime.json'), forgedRaw);
      await writeFile(join(directory, path), bytes);
      await expect(splitRuntimeAssets(directory, { commit: 'abc', manifestSha256: sha(forgedRaw) }, 7)).rejects.toThrow('Runtime checksum mismatch');
      await expect(splitRuntimeAssets(directory, { commit: 'abc', manifestSha256: 'wrong' })).rejects.toThrow('manifest checksum');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('refuses missing or truncated chunks and delegates ordinary assets', async () => {
    const files = { '/runtime/a/sys.tar.gz': { size: 8, sha256: 'pinned', chunks: [{ path: '/__runtime_chunks/pinned/0', size: 8 }] } };
    for (const result of [new Response('missing', { status: 404 }), new Response('short')]) {
      const response = await chunkResponse(new Request('https://editor.test/runtime/a/sys.tar.gz'), { fetch: async () => result }, files);
      await expect(response.arrayBuffer()).rejects.toThrow();
    }
    const response = await chunkResponse(new Request('https://editor.test/index.html'), { fetch: async () => new Response('editor') }, files);
    expect(await response.text()).toBe('editor');
  });
});
