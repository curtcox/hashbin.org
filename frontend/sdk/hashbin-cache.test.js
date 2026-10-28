import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

await import('./hashbin-cache.js');
const { HashBinCache } = globalThis;
const sha = text => createHash('sha256').update(text).digest('hex');

describe('HashBin verified cache', () => {
  it('serves only bytes matching the pinned hash, with headers rebuilt from the extension', async () => {
    const good = await HashBinCache.verify(new Response('code', { headers: { 'Content-Type': 'text/html' } }), sha('code'), 'https://app.example/a.js');
    expect(await good.text()).toBe('code');
    expect(good.headers.get('content-type')).toBe('text/javascript');
    expect(await HashBinCache.verify(new Response('altered'), sha('code'), 'https://app.example/a.js')).toBeNull();
    expect(await HashBinCache.verify(new Response('code'), undefined, 'https://app.example/a.js')).toBeNull();
    expect(await HashBinCache.verify(new Response('code', { status: 404 }), sha('code'), 'https://app.example/a.js')).toBeNull();
  });

  it('finds hashes by absolute URL or scope-relative path', () => {
    const hashFor = HashBinCache.lookup({ 'src/a.js': '1', 'https://cdn.example/b.js': '2' }, 'https://app.example/app/');
    expect(hashFor('https://app.example/app/src/a.js')).toBe('1');
    expect(hashFor('https://cdn.example/b.js')).toBe('2');
    expect(hashFor('https://other.example/app/src/a.js')).toBeUndefined();
  });

  it('reads package hashes from a lockfile', async () => {
    const hashes = await HashBinCache.lockfileHashes(new Response(JSON.stringify({ packages: { numpy: { file_name: 'numpy.whl', sha256: 'abc' }, broken: { file_name: 'x.whl' } } })), 'https://cdn.example/full/');
    expect([...hashes]).toEqual([['https://cdn.example/full/numpy.whl', 'abc']]);
  });
});
