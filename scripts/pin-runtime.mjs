#!/usr/bin/env node
import { readFile, writeFile, mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { publishFile, DEFAULT_BASE_URL, DEFAULT_CLIENT_ID, mimeTypeFor, keychainRead, keychainStore } from './publish.mjs';
import { computeCID } from '../frontend/sdk/hashbin.js';

// Core files require operator-provided upstream SHA-256 hashes. Package hashes
// may instead come from a separately obtained Pyodide lock file (--lock).
export function expectedHashes(hashes = {}, lock = {}) {
  const result = { ...hashes };
  for (const pkg of Object.values(lock.packages || {})) {
    if (pkg.file_name && pkg.sha256) result[pkg.file_name] ||= pkg.sha256;
  }
  return result;
}

export async function pinRuntime({ name, version, prefix, files, hashes, manifestPath = new URL('../workers/run-origin/runtimes.json', import.meta.url), fetchImpl = fetch, publish = publishFile }) {
  if (!/^[a-z0-9-]+$/.test(name || '') || !/^[a-zA-Z0-9.-]+$/.test(version || '') || !files?.length) throw new Error('Provide a runtime name, version, and files.');
  const base = new URL(prefix.endsWith('/') ? prefix : `${prefix}/`);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('The upstream prefix must be an HTTPS URL.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const versions = Object.hasOwn(manifest, name) ? manifest[name] : {};
  const pinned = Object.hasOwn(versions, version) ? versions[version] : {};
  const entries = [];
  const folder = await mkdtemp(join(tmpdir(), 'hashbin-runtime-'));
  try {
    // Verify ALL downloads before any upload spends operator credit.
    for (const [index, file] of files.entries()) {
      if (!/^[a-zA-Z0-9_./+-]+$/.test(file) || file.split('/').some(part => !part || part === '.' || part === '..') || file.startsWith('/')) throw new Error(`Invalid runtime path: ${file}`);
      const expected = hashes[file];
      if (!/^[0-9a-f]{64}$/i.test(expected || '')) throw new Error(`Provide an upstream SHA-256 hash for ${file}`);
      if (pinned[file]) throw new Error(`Already pinned: ${name}/${version}/${file}. Runtime URLs are immutable.`);
      const response = await fetchImpl(new URL(file, base), { signal: AbortSignal.timeout(60000), redirect: 'error' });
      if (!response.ok) throw new Error(`Download ${file}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== expected.toLowerCase()) throw new Error(`SHA-256 mismatch: ${file}`);
      const path = join(folder, String(index));
      await writeFile(path, bytes);
      entries.push({ file, path, sha256, cid: await computeCID(bytes), type: file.endsWith('.wasm') ? 'application/wasm' : mimeTypeFor(file) });
    }
    for (const entry of entries) {
      const result = await publish({ baseUrl: process.env.HASHBIN_URL || DEFAULT_BASE_URL, clientId: process.env.HASHBIN_CLIENT_ID || DEFAULT_CLIENT_ID,
        keychain: { read: keychainRead, store: keychainStore }, file: entry.path, type: entry.type });
      const cid = result.hash_256t || result.cid;
      if (cid !== entry.cid) throw new Error(`Upload returned the wrong CID for ${entry.file}`);
      // OAuth caveats or the API may shorten retention. Never silently pin a
      // shorter-lived object; report it for the operator to extend explicitly.
      const minimum = new Date();
      minimum.setUTCMonth(minimum.getUTCMonth() + 120);
      if (!Number.isFinite(Date.parse(result.expires_at)) || Date.parse(result.expires_at) < minimum.getTime() - 3600000) throw new Error(`Maximum retention was not granted for ${entry.file}; extend ${cid} before pinning.`);
      pinned[entry.file] = { cid, type: entry.type, sha256: entry.sha256 };
    }
    versions[version] = pinned;
    manifest[name] = versions;
    const temporary = `${manifestPath instanceof URL ? manifestPath.pathname : manifestPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporary, manifestPath);
    return pinned;
  } finally { await rm(folder, { recursive: true, force: true }); }
}

async function main() {
  const [name, version, prefix, ...args] = process.argv.slice(2);
  const files = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (['--hashes', '--lock'].includes(args[i])) options[args[i].slice(2)] = args[++i];
    else files.push(args[i]);
  }
  const read = async path => path ? JSON.parse(await readFile(path, 'utf8')) : {};
  const hashes = expectedHashes(await read(options.hashes), await read(options.lock));
  console.log(JSON.stringify(await pinRuntime({ name, version, prefix, files, hashes }), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
