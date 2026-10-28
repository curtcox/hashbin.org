import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expectedHashes, pinRuntime } from './pin-runtime.mjs';
import { computeCID } from '../frontend/sdk/hashbin.js';

describe('operator runtime pinning', () => {
  let folder, manifestPath;
  beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'hashbin-pin-test-')); manifestPath = join(folder, 'runtimes.json'); await writeFile(manifestPath, '{}\n'); });
  afterEach(async () => { await rm(folder, { recursive: true, force: true }); });
  const hash = data => createHash('sha256').update(data).digest('hex');

  it('pins verified bytes by CID with maximum retention and refuses overwrites', async () => {
    const bytes = 'runtime'.repeat(100);
    const cid = await computeCID(bytes);
    const publish = vi.fn(async options => {
      expect(await readFile(options.file, 'utf8')).toBe(bytes);
      return { cid, expires_at: '2099-01-01T00:00:00Z' };
    });
    const options = { name: 'test', version: '1.0', prefix: 'https://upstream.example/v1/', files: ['runtime.js'], hashes: { 'runtime.js': hash(bytes) }, manifestPath, publish, fetchImpl: async () => new Response(bytes) };
    await pinRuntime(options);
    expect(JSON.parse(await readFile(manifestPath, 'utf8')).test['1.0']['runtime.js']).toEqual({ cid, sha256: hash(bytes), type: 'text/javascript' });
    await expect(pinRuntime(options)).rejects.toThrow('immutable');
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('verifies all bytes before spending on any uploads', async () => {
    const publish = vi.fn();
    const options = { name: 'test', version: '1', prefix: 'https://upstream.example/', files: ['good.js', 'bad.js'], hashes: { 'good.js': hash('good'), 'bad.js': hash('expected') }, manifestPath, publish,
      fetchImpl: async url => new Response(url.pathname.includes('good') ? 'good' : 'tampered') };
    await expect(pinRuntime(options)).rejects.toThrow('SHA-256 mismatch');
    expect(publish).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual({});
    await expect(pinRuntime({ ...options, files: ['../bad.js'] })).rejects.toThrow('Invalid runtime path');
    await expect(pinRuntime({ ...options, hashes: {} })).rejects.toThrow('upstream SHA-256');
  });

  it('refuses shorter retention and wrong CIDs without writing pins', async () => {
    const cid = await computeCID('runtime');
    const options = { name: 'test', version: '1', prefix: 'https://upstream.example/', files: ['runtime.js'], hashes: { 'runtime.js': hash('runtime') }, manifestPath, fetchImpl: async () => new Response('runtime') };
    await expect(pinRuntime({ ...options, publish: async () => ({ cid, expires_at: new Date().toISOString() }) })).rejects.toThrow('Maximum retention');
    await expect(pinRuntime({ ...options, publish: async () => ({ cid: 'wrong', expires_at: '2099-01-01' }) })).rejects.toThrow('wrong CID');
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual({});
    expect(expectedHashes({ 'core.js': 'core' }, { packages: { pkg: { file_name: 'pkg.whl', sha256: 'package' } } })).toEqual({ 'core.js': 'core', 'pkg.whl': 'package' });
  });
});
