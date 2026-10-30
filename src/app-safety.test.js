import { describe, expect, it } from 'vitest';
import { analyzePage, checkApp, contentSecurityPolicy, moduleUrls, scriptUrls, isReleasedSdk } from './app-safety.js';
import { readFileSync } from 'node:fs';

const ids = findings => findings.map(item => item.id);

describe('registered-app safety check', () => {
  it('flags a shared origin without a policy, verified cache or sandbox', () => {
    const findings = analyzePage({ url: 'https://someone.github.io/app/', html: '<script>x()</script><script src="a.js"></script>', scripts: { a: 'new Worker("w.js")' }, serviceWorker: 'caches.open("x")' });
    expect(ids(findings)).toEqual(expect.arrayContaining(['shared-origin', 'csp-missing', 'inline-script', 'worker-origin', 'sw-unverified']));
  });

  it('counts a shared origin as a fix only when the page keeps an allowance or an unverified cache there', () => {
    const level = findings => findings.find(item => item.id === 'shared-origin').level;
    const url = 'https://someone.github.io/app/';
    const publishOnly = analyzePage({ url, html: '<script src="a.js"></script>', scripts: { a: 'client.publish(doc); if (storage.getItem(`hashbin:tokens:${id}`)) client.disconnect()' } });
    expect(level(publishOnly)).toBe('info');
    expect(ids(publishOnly)).not.toContain('allowance-on-shared-origin');
    const allowance = analyzePage({ url, html: '<script src="a.js"></script>', scripts: { a: 'await oauth.authorize({ scopes })' } });
    expect(level(allowance)).toBe('warn');
    expect(ids(allowance)).toContain('allowance-on-shared-origin');
    expect(level(analyzePage({ url, html: '', serviceWorker: 'caches.open("x")' }))).toBe('warn');
    expect(level(analyzePage({ url, html: '', serviceWorker: 'HashBinCache.verify' }))).toBe('info');
  });

  it('accepts a pinned current SDK, a strict policy, the sandbox and a verified cache', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-x' blob:; object-src 'none'"><script src="app.js"></script>`;
    const findings = analyzePage({ url: 'https://app.example/', html, scripts: { app: "import('../vendor/hashbin-sdk-v0.4.0.mjs'); sdk.createSandbox({})" }, serviceWorker: 'HashBinCache.verify' });
    expect(findings.filter(item => item.level === 'warn')).toEqual([]);
    expect(ids(findings)).toEqual(expect.arrayContaining(['csp-present', 'sdk-current', 'sandbox', 'sw-verified']));
  });

  it('skips SDK bytes by released SHA-256, but scans an edited SDK regardless of filename', async () => {
    const source = readFileSync(new URL('../frontend/sdk/v0.4.0/hashbin.js', import.meta.url), 'utf8');
    expect(await isReleasedSdk(source)).toBe(true);
    expect(await isReleasedSdk(`${source}\n// modified`)).toBe(false);
    const app = { app_id: 'app_test', redirect_uris: ['https://app.example/'] };
    const scan = script => checkApp(app, [], { fetch: async url => new Response(url.endsWith('renamed.js') ? script : '<script src="renamed.js"></script>') });
    const trusted = await scan(source);
    expect(ids(trusted.pages[0].findings)).not.toContain('sandbox-same-origin');
    const edited = await scan(`${source}\n// modified`);
    expect(ids(edited.pages[0].findings)).toContain('sandbox-same-origin');
  });

  it('reports hosted sandbox CSP and mismatched embedders', () => {
    const appId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
    const app = { app_id: appId, run: { status: 'active' }, redirect_uris: ['https://registered.example/'] };
    const findings = analyzePage({ appId, app, url: 'https://other.example/', html: '<script>createSandbox({origin:"hosted"})</script>', headers: { 'content-security-policy': "default-src 'none'; frame-src https://a1932999d125c4cf6bf56806d6df1fa3a.run.example" }, runDomain: 'run.example' });
    expect(ids(findings)).toEqual(expect.arrayContaining(['sandbox-hosted', 'run-embedder-mismatch']));
    expect(ids(findings)).not.toContain('sandbox');
  });

  it('follows same-origin imports, the app\'s own files before vendored ones', async () => {
    expect(moduleUrls(`import a from './a.js'; export * from "../b.mjs"; import 'lib'; import('/c.js?v=1');
      new URL('w.worker.js', import.meta.url); new URL('pic.png', import.meta.url); import x from 'https://cdn.example/x.js';`, 'https://app.example/src/app.js'))
      .toEqual(['https://app.example/src/a.js', 'https://app.example/b.mjs', 'https://app.example/c.js?v=1', 'https://app.example/src/w.worker.js']);
    const files = {
      '/': '<script type="module" src="src/app.js"></script>',
      '/src/app.js': "import '../vendor/lib.js'; import './run.js';",
      '/src/run.js': "new URL('./py.worker.js', import.meta.url)",
      '/src/py.worker.js': 'await loadPyodide({ indexURL })',
      '/vendor/lib.js': "import './chunk.js'; import('hashbin.org/sdk/v0.3.0/hashbin.js')"
    };
    const requested = [];
    const fetch = async url => { const { pathname } = new URL(url); requested.push(pathname); return pathname in files ? new Response(files[pathname]) : new Response('', { status: 404 }); };
    const { pages } = await checkApp({ app_id: 'app_test', redirect_uris: ['https://app.example/'] }, [], { fetch });
    expect(requested).toEqual(['/', '/src/app.js', '/src/run.js', '/src/py.worker.js', '/vendor/lib.js']);
    const worker = pages[0].findings.find(item => item.id === 'worker-origin');
    expect(worker.message).toMatch(/Pyodide/);
    expect(ids(pages[0].findings)).toContain('sdk-outdated');
  });

  it('ignores the Ace editor\'s own workers and inline scripts a policy hash already allows', () => {
    const url = 'https://app.example/';
    const ace = '(function(){var ACE_NAMESPACE = "ace";new Worker(r)})()';
    expect(ids(analyzePage({ url, html: '', scripts: { ace } }))).not.toContain('worker-origin');
    expect(ids(analyzePage({ url, html: '', scripts: { ace, app: 'new Worker("w.js")' } }))).toContain('worker-origin');
    const inline = '<script type="module">start()</script>';
    expect(ids(analyzePage({ url, html: inline, headers: { 'content-security-policy': "script-src 'self' 'sha256-x'" } }))).not.toContain('inline-script');
    expect(ids(analyzePage({ url, html: inline, headers: { 'content-security-policy': "script-src 'self' 'unsafe-inline'" } }))).toContain('inline-script');
    expect(ids(analyzePage({ url, html: inline, headers: { 'content-security-policy': "object-src 'none'" } }))).toContain('inline-script');
  });

  it('reads policies and same-origin scripts', () => {
    expect(contentSecurityPolicy('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">')).toBe("default-src 'self'");
    expect(scriptUrls('<script src="a.js"></script><script src="https://cdn.example/b.js"></script>', 'https://app.example/x/')).toEqual(['https://app.example/x/a.js']);
    expect(ids(analyzePage({ url: 'https://app.example/', html: "<meta http-equiv='Content-Security-Policy' content=\"script-src 'unsafe-inline' https:\">" }))).toEqual(expect.arrayContaining(['csp-unsafe-inline', 'csp-wildcard']));
  });
});
