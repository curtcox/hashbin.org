import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Run once per release. Never overwrite an already-published version.
const version = process.argv[2];
if (!/^v\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Usage: node scripts/release-browser-sdk.mjs vMAJOR.MINOR.PATCH');
const root = new URL('../frontend/sdk/', import.meta.url);
const source = await readFile(new URL('hashbin.js', root));
const folder = new URL(`${version}/`, root);
await mkdir(folder); // Fails on existing versions before changing any release files.
await writeFile(new URL('hashbin.js', folder), source, { flag: 'wx' });
const integrity = `sha384-${createHash('sha384').update(source).digest('base64')}`;
await writeFile(new URL('integrity.json', folder), JSON.stringify({ version, file: 'hashbin.js', integrity }, null, 2) + '\n', { flag: 'wx' });
console.log(`${new URL('hashbin.js', folder).pathname}\n${integrity}`);
