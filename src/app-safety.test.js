import { describe, expect, it } from 'vitest';
import { analyzePage, contentSecurityPolicy, scriptUrls } from './app-safety.js';

const ids = findings => findings.map(item => item.id);

describe('registered-app safety check', () => {
  it('flags a shared origin without a policy, verified cache or sandbox', () => {
    const findings = analyzePage({ url: 'https://someone.github.io/app/', html: '<script>x()</script><script src="a.js"></script>', scripts: { a: 'new Worker("w.js")' }, serviceWorker: 'caches.open("x")' });
    expect(ids(findings)).toEqual(expect.arrayContaining(['shared-origin', 'csp-missing', 'inline-script', 'worker-origin', 'sw-unverified']));
  });

  it('accepts a pinned current SDK, a strict policy, the sandbox and a verified cache', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-x' blob:; object-src 'none'"><script src="app.js"></script>`;
    const findings = analyzePage({ url: 'https://app.example/', html, scripts: { app: "import('../vendor/hashbin-sdk-v0.3.0.mjs'); sdk.createSandbox({})" }, serviceWorker: 'HashBinCache.verify' });
    expect(findings.filter(item => item.level === 'warn')).toEqual([]);
    expect(ids(findings)).toEqual(expect.arrayContaining(['csp-present', 'sdk-current', 'sandbox', 'sw-verified']));
  });

  it('reads policies and same-origin scripts', () => {
    expect(contentSecurityPolicy('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">')).toBe("default-src 'self'");
    expect(scriptUrls('<script src="a.js"></script><script src="https://cdn.example/b.js"></script>', 'https://app.example/x/')).toEqual(['https://app.example/x/a.js']);
    expect(ids(analyzePage({ url: 'https://app.example/', html: "<meta http-equiv='Content-Security-Policy' content=\"script-src 'unsafe-inline' https:\">" }))).toEqual(expect.arrayContaining(['csp-unsafe-inline', 'csp-wildcard']));
  });
});
