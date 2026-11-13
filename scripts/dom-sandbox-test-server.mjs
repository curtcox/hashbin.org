// Static fixtures for DOM sandbox and verified offline delivery acceptance.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DOM_SANDBOX_BOOTSTRAP_HASH, SANDBOX_BOOTSTRAP_HASH } from '../frontend/sdk/hashbin.js';

const policy = `default-src 'none'; script-src 'self' blob: '${DOM_SANDBOX_BOOTSTRAP_HASH}' '${SANDBOX_BOOTSTRAP_HASH}'; worker-src 'self' blob:; connect-src 'self'; frame-src 'self' blob:; base-uri 'none'; form-action 'none'`;
const assets = {
  '/index.html': { type: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>DOM sandbox test</title><body>DOM sandbox test</body>' },
  '/sdk.js': { type: 'text/javascript', body: await readFile(new URL('../frontend/sdk/hashbin.js', import.meta.url), 'utf8') },
  '/cache.js': { type: 'text/javascript', body: await readFile(new URL('../frontend/sdk/hashbin-cache.js', import.meta.url), 'utf8') },
  '/module.js': { type: 'text/javascript', body: "document.body.textContent = 'offline DOM module'; export const value = 42;" }
};
const hashes = Object.fromEntries(Object.entries(assets).map(([path, asset]) => [path, createHash('sha256').update(asset.body).digest('hex')]));
const sw = `importScripts('/cache.js');
const hashes = ${JSON.stringify(hashes)};
const cache = HashBinCache.create({ cacheName: 'hashbin-dom-test-v1', hashFor: url => hashes[new URL(url).pathname] });
addEventListener('install', event => event.waitUntil(cache.download(Object.keys(hashes).map(path => new URL(path, location.origin).href)).then(() => skipWaiting())));
addEventListener('activate', event => event.waitUntil(clients.claim()));
addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const path = new URL(event.request.url).pathname;
    if (!hashes[path]) return fetch(event.request);
    const response = await cache.match(event.request.url) || await cache.put(event.request.url, await fetch(event.request));
    if (!response) throw new Error('Unverified fixture');
    // Verified cache rebuilds content types. Preserve the test's restrictive CSP.
    const headers = new Headers(response.headers); headers.set('Content-Security-Policy', ${JSON.stringify(policy)});
    return new Response(await response.arrayBuffer(), { headers });
  })());
});`;
assets['/sw.js'] = { type: 'text/javascript', body: sw };
let offline = false;
const server = createServer((req, res) => {
  if (req.url === '/__offline' || req.url === '/__online') {
    offline = req.url === '/__offline';
    res.writeHead(200).end(); return;
  }
  if (offline) { req.socket.destroy(); return; }
  const asset = assets[new URL(req.url, 'http://127.0.0.1').pathname];
  if (!asset) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': asset.type, 'Content-Security-Policy': policy, 'Cache-Control': 'no-store' });
  res.end(asset.body);
});
server.listen(8792, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
