#!/bin/bash
# Inject the build revision without depending on GNU/BSD sed differences.
set -euo pipefail
GIT_SHA="${1:-$(git rev-parse HEAD)}"
node --input-type=module - "$GIT_SHA" <<'JS'
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const sha = process.argv[2];
if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new Error('Expected a 7–40 digit hexadecimal git SHA');
const comment = `<!-- git-sha: ${sha} -->`;
async function inject(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await inject(path); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const original = await readFile(path, 'utf8');
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    // Remove stale/duplicate build comments before inserting exactly one.
    const content = original.replace(/<!-- git-sha:[\s\S]*?-->[\t ]*(?:\r?\n)?/g, '');
    const doctype = /<!doctype[^>]*>/i.exec(content);
    const position = doctype ? doctype.index + doctype[0].length : 0;
    const updated = doctype
      ? content.slice(0, position) + newline + comment + content.slice(position)
      : comment + newline + content;
    await writeFile(path, updated);
    console.log(`Processing: ${path}`);
  }
}
await inject('frontend');
console.log(`Git SHA injection complete: ${sha}`);
JS
