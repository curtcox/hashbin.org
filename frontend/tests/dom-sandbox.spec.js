import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    localStorage.setItem('embedding-secret', 'private');
    document.cookie = 'embedding-secret=private; SameSite=Strict';
  });
});

async function run(page, source, options = {}) {
  return page.evaluate(async ({ source, options }) => {
    const { createSandbox } = await import('/sdk.js');
    return new Promise((resolve, reject) => {
      const sandbox = createSandbox({ source, execution: 'frame', timeout: 5000, ...options });
      sandbox.onerror = error => { sandbox.terminate(); reject(new Error(error.message)); };
      sandbox.onmessage = ({ data }) => {
        const flags = sandbox.frame.getAttribute('sandbox');
        const hidden = sandbox.frame.getAttribute('aria-hidden');
        sandbox.terminate();
        resolve({ data, flags, hidden });
      };
    });
  }, { source, options });
}

test('renders in a visible DOM while retaining an opaque origin', async ({ page }) => {
  const result = await run(page, `document.body.innerHTML = '<h1>Hello from the sandbox</h1>';
    postMessage({ text: document.querySelector('h1').textContent, origin: self.origin, window: typeof window });`);
  expect(result).toEqual({ data: { text: 'Hello from the sandbox', origin: 'null', window: 'object' }, flags: 'allow-scripts', hidden: null });
});

test('blocks parent DOM, storage, cookies and top navigation', async ({ page }) => {
  const result = await run(page, `const checks = {};
    for (const [name, check] of Object.entries({ parent: () => parent.document.body, storage: () => localStorage.getItem('embedding-secret'), top: () => { top.location.href = 'https://example.invalid/escape'; } })) {
      try { check(); checks[name] = 'allowed'; } catch (error) { checks[name] = error.name; }
    }
    try { checks.cookie = document.cookie; } catch (error) { checks.cookie = error.name; }
    postMessage(checks);`);
  expect(result.data).toMatchObject({ parent: 'SecurityError', storage: 'SecurityError', top: 'SecurityError' });
  expect(['', 'SecurityError']).toContain(result.data.cookie);
  expect(await page.evaluate(() => localStorage.getItem('embedding-secret'))).toBe('private');
  expect(page.url()).toContain('/index.html');
});

test('delivers messages queued before module initialization', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { createSandbox } = await import('/sdk.js');
    return new Promise((resolve, reject) => {
      const sandbox = createSandbox({ execution: 'frame', source: `onmessage = event => postMessage(event.data);`, timeout: 5000 });
      sandbox.onerror = error => { sandbox.terminate(); reject(new Error(error.message)); };
      sandbox.onmessage = event => { sandbox.terminate(); resolve(event.data); };
      sandbox.postMessage({ queued: true });
    });
  })).toEqual({ queued: true });
});

test('accepts private-port messages and ignores global window messages after boot', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { createSandbox } = await import('/sdk.js');
    return new Promise((resolve, reject) => {
      const sandbox = createSandbox({ execution: 'frame', source: `onmessage = event => postMessage(event.data); postMessage('ready');`, timeout: 5000 });
      sandbox.onerror = error => { sandbox.terminate(); reject(new Error(error.message)); };
      sandbox.onmessage = ({ data }) => {
        if (data === 'ready') {
          sandbox.frame.contentWindow.postMessage({ forged: true }, '*');
          setTimeout(() => sandbox.postMessage({ authenticated: true }), 50);
        } else { sandbox.terminate(); resolve(data); }
      };
    });
  })).toEqual({ authenticated: true });
});

test('imports module bytes through the parent verified service worker fully offline', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  // Refuse real HTTP connections: WebKit's network-offline emulation can also
  // disable its service worker transport. No fixture can fall back to HTTP.
  await context.request.post('/__offline');
  try {
    await page.reload();
    const result = await run(page, `const module = await hashbinSandbox.import('/module.js');
    let controlled = false; try { controlled = Boolean(navigator.serviceWorker.controller); } catch { /* Opaque origins cannot access service workers. */ }
    postMessage({ value: module.value, text: document.body.textContent, controlled });`,
  { base: 'http://127.0.0.1:8792/', proxy: ['http://127.0.0.1:8792/module.js'] });
    expect(result.data).toEqual({ value: 42, text: 'offline DOM module', controlled: false });
  } finally {
    await context.request.post('/__online');
  }
});

test('preserves opaque worker execution by default', async ({ page }) => {
  const result = await run(page, `postMessage({ document: typeof document, origin: self.origin });`, { execution: 'worker' });
  expect(result).toEqual({ data: { document: 'undefined', origin: 'null' }, flags: 'allow-scripts', hidden: 'true' });
});

test('reports module exceptions and removes the failed frame', async ({ page }) => {
  await expect(run(page, `throw new Error('frame failed intentionally');`)).rejects.toThrow(/frame failed intentionally|failed to start/);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(run(page, `Promise.reject(new Error('frame rejected intentionally'));`)).rejects.toThrow(/frame rejected intentionally/);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('queues messages across top-level await', async ({ page }) => {
  test.setTimeout(3000);
  expect(await page.evaluate(async () => {
    const { createSandbox } = await import('/sdk.js');
    return new Promise((resolve, reject) => {
      const sandbox = createSandbox({ execution: 'frame', timeout: 500,
        source: `await new Promise(resolve => setTimeout(resolve, 100)); onmessage = event => postMessage(event.data);` });
      sandbox.onerror = error => { sandbox.terminate(); reject(new Error(error.message)); };
      sandbox.onmessage = event => { sandbox.terminate(); resolve(event.data); };
      sandbox.postMessage({ queuedBeforeAwait: true });
    });
  })).toEqual({ queuedBeforeAwait: true });
});

test('times out module evaluation that never completes', async ({ page }) => {
  test.setTimeout(3000);
  await expect(run(page, `await new Promise(() => {});`, { timeout: 100 })).rejects.toThrow('Sandbox frame timed out.');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('preserves null bodies for proxied 204, 205 and 304 responses', async ({ page }) => {
  const result = await run(page, `const results = [];
    for (const status of [204, 205, 304]) {
      const response = await fetch('http://127.0.0.1:8792/empty/' + status);
      results.push({ status: response.status, nullBody: response.body === null, text: await response.text() });
    }
    postMessage(results);`, { proxy: ['http://127.0.0.1:8792/empty/'] });
  expect(result.data).toEqual([204, 205, 304].map(status => ({ status, nullBody: true, text: '' })));
});
