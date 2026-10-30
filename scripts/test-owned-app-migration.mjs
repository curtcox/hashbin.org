/* eslint-env browser */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = await readFile(join(root, 'scripts/owned-apps/migration.js'), 'utf8');
const template = await readFile(join(root, 'scripts/owned-apps/migration.html'), 'utf8');
let slug = 'pages', oldURL, newURL;
const servers = [];
async function server() {
  const instance = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
    if (url.pathname === '/src/domain-migration.js') response.end(moduleSource + `\nbootMigration(${JSON.stringify({ [slug]: { legacy: oldURL, origin: new URL(newURL).origin } })});`);
    else if (url.pathname === '/migration.html') response.end(template.replace('__APP__', slug));
    else response.end('<!doctype html><h1>App</h1><textarea id="editor">Unsaved text</textarea><script type="module" src="src/domain-migration.js"></script>');
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  servers.push(instance);
  return `http://127.0.0.1:${instance.address().port}/`;
}
let browser;
try {
  oldURL = await server(); newURL = await server(); browser = await chromium.launch({ executablePath: process.env.OWNED_CHROMIUM_PATH || chromium.executablePath() });
  for (slug of ['pages', 'python', 'textpad']) {
    const context = await browser.newContext();
    const old = await context.newPage();
    await old.goto(oldURL + '#original-link');
    const key = { pages: 'pagesonline:project', python: 'pythononline:work', textpad: 'hashbin:textpad:migrated-text' }[slug];
    const work = slug === 'pages' ? '{"files":[{"name":"index.md","text":"# Private draft"}],"entry":"index.md"}' : '{"src":"print(42)"}';
    await old.evaluate(({ key, work }) => { localStorage.setItem(key, work); localStorage.setItem('hashbin:tokens:client', 'DO NOT COPY'); localStorage.setItem('pythononline:persistent-home', 'true'); }, { key, work });
    const popup = old.waitForEvent('popup');
    await old.getByRole('button', { name: 'Move saved work', exact: true }).click();
    const moved = await popup;
    await moved.getByRole('button', { name: 'Restore and open app', exact: true }).waitFor();
    await moved.waitForFunction(() => !document.getElementById('migration-restore').disabled);
    await moved.getByRole('button', { name: 'Restore and open app', exact: true }).click();
    await moved.waitForURL(url => url.pathname === '/');
    const restored = await moved.evaluate(({ key, slug }) => ({ work: (slug === 'textpad' ? sessionStorage : localStorage).getItem(key), credential: localStorage.getItem('hashbin:tokens:client'), permission: localStorage.getItem('pythononline:persistent-home') }), { key, slug });
    assert.equal(restored.work, slug === 'textpad' ? 'Unsaved text' : work);
    assert.equal(restored.credential, null);
    if (slug === 'python') assert.equal(restored.permission, 'false');
    assert.equal(await old.evaluate(key => localStorage.getItem(key), key), work);
    if (slug === 'textpad') assert.equal(new URL(moved.url()).hash, '');
    console.log(`PASS ${slug}: real cross-origin popup migration, old draft retained, no credentials copied`);
    await context.close();
  }
} finally {
  await browser?.close();
  await Promise.all(servers.map(instance => new Promise(resolve => instance.close(resolve))));
}
