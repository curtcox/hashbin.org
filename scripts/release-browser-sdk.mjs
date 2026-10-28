import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Run once per release. Never overwrite an already-published version.
const version = process.argv[2];
if (!/^v\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Usage: node scripts/release-browser-sdk.mjs vMAJOR.MINOR.PATCH');
const root = new URL('../frontend/sdk/', import.meta.url);
const folder = new URL(`${version}/`, root);
await mkdir(folder); // Fails on existing versions before changing any release files.
// hashbin.js is the page module; hashbin-cache.js is the classic script for service workers.
const files = {};
for (const file of ['hashbin.js', 'hashbin-cache.js']) {
  const source = await readFile(new URL(file, root));
  await writeFile(new URL(file, folder), source, { flag: 'wx' });
  files[file] = { integrity: `sha384-${createHash('sha384').update(source).digest('base64')}`, sha256: createHash('sha256').update(source).digest('hex') };
  console.log(`${new URL(file, folder).pathname}\n${files[file].integrity}`);
}
await writeFile(new URL('integrity.json', folder), JSON.stringify({ version, file: 'hashbin.js', integrity: files['hashbin.js'].integrity, files }, null, 2) + '\n', { flag: 'wx' });
