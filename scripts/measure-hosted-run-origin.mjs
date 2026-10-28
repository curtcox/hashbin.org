import { createServer } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';

// H5 Phase 0. Real browser profiles, real cross-site frames, no privacy overrides.
// Optional executable overrides let operators test installed browser builds.
const engines = { chromium, firefox, webkit };
const selected = (process.env.H5_BROWSERS || 'chromium,webkit,firefox').split(',');
for (const name of selected) if (!engines[name]) throw new Error(`Unknown browser: ${name}`);
const results = [];
const token = randomUUID();
const database = `hashbin-h5-${token}`;

function frameScript() {
  // Also used verbatim inside a blob worker: persistence must work where code runs.
  async function storage({ database, value }) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('values', value === undefined ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('values');
        const request = value === undefined ? store.get('probe') : store.put(value, 'probe');
        transaction.oncomplete = () => resolve(value === undefined ? request.result ?? null : value);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }
  async function worker(script, type = 'classic') {
    const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
    let instance;
    try {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { instance?.terminate(); reject(new Error('Worker timed out')); }, 5000);
        instance = new Worker(url, { type });
        instance.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        instance.onerror = event => { clearTimeout(timeout); reject(new Error(event.message || 'Worker failed')); };
      });
    } finally { instance?.terminate(); URL.revokeObjectURL(url); }
  }
  async function run(command) {
    if (command.op === 'info') return { origin: location.origin, secure: isSecureContext };
    if (command.op === 'idb') return storage(command);
    if (command.op === 'worker-idb') return worker(`(${storage})(${JSON.stringify(command)}).then(value=>postMessage({value}),error=>postMessage({error:error.name+': '+error.message}))`);
    if (command.op === 'module') return worker('export {}; postMessage({ origin: self.location.origin });', 'module');
    if (command.op === 'sw') {
      await navigator.serviceWorker.register('/sw.js');
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker activation timed out')), 5000))
      ]);
      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => reject(new Error('Service worker message timed out')), 5000);
        channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
        registration.active.postMessage('probe', [channel.port2]);
      });
    }
    throw new Error('Unknown operation');
  }
  addEventListener('message', event => {
    if (event.source !== parent || !event.ports[0]) return;
    const port = event.ports[0];
    run(event.data).then(value => port.postMessage({ ok: true, value }), error => port.postMessage({ ok: false, error: `${error.name}: ${error.message}` }));
  });
  parent.postMessage({ type: 'h5:ready', origin: location.origin }, '*');
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/probe.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`(${frameScript})();`);
  } else if (url.pathname === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>e.ports[0].postMessage('service-worker-ok'));");
  } else if (url.pathname === '/frame') {
    response.setHeader('Content-Type', 'text/html');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https:; img-src 'self' blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${url.searchParams.get('deny') ? "'none'" : '*'} `);
    response.end('<!doctype html><meta charset="utf-8"><script src="/probe.js"></script>');
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><meta charset="utf-8"><title>H5 local measurement</title><body>H5 local measurement</body>');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '::', resolve); });
const port = server.address().port;
const embedderA = `http://127.0.0.1:${port}`;
const embedderB = `http://[::1]:${port}`;

async function attach(page, embedder, frameOrigin, deny = false) {
  await page.goto(embedder);
  return page.evaluate(({ frameOrigin, deny }) => new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.sandbox = 'allow-scripts allow-same-origin';
    frame.src = `${frameOrigin}/frame${deny ? '?deny=1' : ''}`;
    window.h5Frame = frame;
    const timeout = setTimeout(() => { removeEventListener('message', ready); resolve(false); }, 4000);
    function ready(event) {
      if (event.source !== frame.contentWindow || event.origin !== frameOrigin || event.data?.type !== 'h5:ready') return;
      clearTimeout(timeout); removeEventListener('message', ready); resolve(true);
    }
    addEventListener('message', ready);
    document.body.append(frame);
  }), { frameOrigin, deny });
}

async function probe(page, command) {
  return page.evaluate(command => new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve({ ok: false, error: 'Probe timed out' }); }, 8000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
    window.h5Frame.contentWindow.postMessage(command, new URL(window.h5Frame.src).origin, [channel.port2]);
  }), { database, ...command });
}

try {
  for (const name of selected) {
    const profile = await mkdtemp(join(await realpath(tmpdir()), `hashbin-h5-${name}-`));
    const executablePath = process.env[`H5_${name.toUpperCase()}_PATH`] || engines[name].executablePath();
    // WebKit does not resolve *.localhost on every platform. localhost is still
    // a different secure-context site from either loopback-IP embedder.
    const frameOrigin = `http://${name === 'webkit' ? 'localhost' : 'h5-run.localhost'}:${port}`;
    const result = { browser: name, frame: frameOrigin, embedders: [embedderA, embedderB] };
    let context;
    const launch = () => engines[name].launchPersistentContext(profile, {
      headless: true, executablePath,
      // Playwright 1.57 disables ThirdPartyStoragePartitioning by default. The
      // last switch wins in Chromium; restore browser defaults for this probe.
      ...(name === 'chromium' ? { args: ['--disable-features='] } : {})
    });
    try {
      context = await launch();
      result.version = context.browser()?.version() || 'unknown';
      let page = await context.newPage();
      result.frame_loaded = await attach(page, embedderA, frameOrigin);
      if (!result.frame_loaded) throw new Error('Cross-site frame did not load; persistence was not measured');
      result.info = await probe(page, { op: 'info' });
      result.write = await probe(page, { op: 'idb', value: token });
      result.worker_read = await probe(page, { op: 'worker-idb' });
      result.reload_loaded = await attach(page, embedderA, frameOrigin);
      result.reload_read = await probe(page, { op: 'idb' });
      result.module_worker = await probe(page, { op: 'module' });
      result.service_worker = await probe(page, { op: 'sw' });
      result.other_site_loaded = await attach(page, embedderB, frameOrigin);
      result.other_site_read = await probe(page, { op: 'idb' });
      result.other_site_write = await probe(page, { op: 'idb', value: 'embedder-b' });
      result.return_loaded = await attach(page, embedderA, frameOrigin);
      result.return_read = await probe(page, { op: 'idb' });
      const cspErrors = [];
      page.on('console', message => { if (/frame-ancestors/i.test(message.text())) cspErrors.push(message.text()); });
      result.denied_frame_loaded = await attach(page, embedderA, frameOrigin, true);
      result.csp_errors = cspErrors;
      // A clean shutdown and reopening the SAME profile is essential: a new
      // incognito context cannot measure persistence across a browser restart.
      await context.close();
      context = await launch();
      page = await context.newPage();
      result.restart_loaded = await attach(page, embedderA, frameOrigin);
      result.restart_read = await probe(page, { op: 'idb' });
      result.restart_worker_read = await probe(page, { op: 'worker-idb' });
      result.persistence_passed = result.write.ok && result.write.value === token &&
        result.reload_read.ok && result.reload_read.value === token &&
        result.worker_read.ok && result.worker_read.value?.value === token &&
        result.restart_read.ok && result.restart_read.value === token &&
        result.restart_worker_read.ok && result.restart_worker_read.value?.value === token;
      result.partitioning_passed = result.other_site_read.ok && result.other_site_read.value === null &&
        result.other_site_write.ok && result.other_site_write.value === 'embedder-b' &&
        result.return_read.ok && result.return_read.value === token;
      result.frame_ancestors_passed = !result.denied_frame_loaded && cspErrors.length > 0;
    } catch (error) {
      result.error = error.message;
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
} finally { await new Promise(resolve => server.close(resolve)); }

const report = {
  measured_at: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}`,
  privacy_settings: 'Browser defaults; persistent profiles; no storage-access grant or privacy overrides',
  safari_seven_day_retention: 'Not measured. Requires a separate manual Safari/ITP test.',
  results
};
if (process.env.H5_REPORT) await writeFile(resolve(process.env.H5_REPORT), `${JSON.stringify(report, null, 2)}\n`);
// Failure to launch is inconclusive, not evidence that browser persistence fails.
process.exitCode = results.some(result => result.error) ? 2 : results.every(result => result.persistence_passed) ? 0 : 1;
