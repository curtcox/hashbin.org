import { test, expect } from '@playwright/test';

const clientId = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
const runHost = 'a1932999d125c4cf6bf56806d6df1fa3a.localhost:8790';
const runOrigin = `http://${runHost}`;
test.beforeEach(async ({ page, context, browserName }) => {
  if (browserName === 'webkit') {
    // WebKit needs help resolving *.localhost on macOS. Preserve the original
    // URL/origin and response headers while transporting over loopback.
    await context.route('http://*.localhost:8790/**', async route => {
      const url = new URL(route.request().url());
      const response = await context.request.get(`http://127.0.0.1:8790${url.pathname}${url.search}`, { headers: { ...route.request().headers(), host: url.host } });
      await route.fulfill({ response });
    });
  }
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('embedding-secret', 'private'); });
});

async function run(page, source, options = {}) {
  return page.evaluate(async ({ source, options, clientId }) => {
    const { createSandbox } = await import('/sdk.js');
    return new Promise((resolve, reject) => {
      const sandbox = createSandbox({ source, origin: 'hosted', clientId, runDomain: 'localhost:8790', timeout: 5000, ...options });
      sandbox.onerror = error => { sandbox.terminate(); reject(new Error(`${error.code}: ${error.message}`)); };
      sandbox.onmessage = event => { sandbox.terminate(); resolve(event.data); };
    });
  }, { source, options, clientId });
}

test('reports the hosted origin and starts module workers', async ({ page }) => {
  expect(await run(page, 'export {}; postMessage(hashbinSandbox.origin)', { workerType: 'module' })).toBe(runOrigin);
});

const storageSource = (write, value = 'persisted') => `(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('h5-sdk-e2e', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise((resolve, reject) => {
      const transaction = db.transaction('data', '${write ? 'readwrite' : 'readonly'}');
      const store = transaction.objectStore('data');
      const request = ${write ? `store.put(${JSON.stringify(value)}, 'value')` : "store.get('value')"};
      transaction.oncomplete = () => resolve(${write ? "'written'" : 'request.result'});
      transaction.onabort = () => reject(transaction.error);
    });
    db.close(); postMessage(value);
  })().catch(error => postMessage({ error: String(error) }));`;

test('persists IndexedDB across separate sandboxes and page reloads', async ({ page }) => {
  expect(await run(page, storageSource(true))).toBe('written');
  expect(await run(page, storageSource(false))).toBe('persisted');
  await page.reload();
  expect(await run(page, storageSource(false))).toBe('persisted');
});

test('different app labels cannot read or overwrite each other IndexedDB', async ({ page }) => {
  const second = { clientId: 'app_2eabd9ad-8b90-4635-accd-7583e5241f96' };
  expect(await run(page, storageSource(true, 'first app'))).toBe('written');
  expect(await run(page, storageSource(false), second)).toBeUndefined();
  expect(await run(page, storageSource(true, 'second app'), second)).toBe('written');
  expect(await run(page, storageSource(false))).toBe('first app');
  expect(await run(page, storageSource(false), second)).toBe('second app');
});

test('prevents the embedding page and run frame reading each other storage', async ({ page }) => {
  const result = await run(page, "postMessage({ origin: hashbinSandbox.origin, document: typeof document, localStorage: typeof localStorage })");
  expect(result).toEqual({ origin: runOrigin, document: 'undefined', localStorage: 'undefined' });
  const blocked = await page.evaluate(async ({ clientId }) => {
    const { createSandbox } = await import('/sdk.js');
    const sandbox = createSandbox({ source: 'postMessage(1)', origin: 'hosted', clientId, runDomain: 'localhost:8790' });
    // Before navigation, a new iframe's about:blank document inherits its
    // parent's origin. Check the running hosted document, after its handshake.
    await new Promise((resolve, reject) => { sandbox.onmessage = resolve; sandbox.onerror = reject; });
    try { return sandbox.frame.contentWindow.localStorage.getItem('embedding-secret'); }
    catch (error) { return error.name; }
    finally { sandbox.terminate(); }
  }, { clientId });
  expect(blocked).toBe('SecurityError');
  expect(await page.evaluate(() => localStorage.getItem('embedding-secret'))).toBe('private');
});

test('refuses an unregistered embedder with sandbox_unavailable', async ({ page }) => {
  await page.goto('http://localhost:8789/');
  await expect(run(page, 'postMessage("should never run")', { timeout: 700 })).rejects.toThrow('sandbox_unavailable');
});

test('the bootstrap rejects unregistered parents even without frame-ancestors', async ({ page, context }) => {
  // Isolate the bootstrap's origin check from the browser's CSP enforcement.
  await context.route(`${runOrigin}/frame/v0.4.0`, async route => {
    const response = await context.request.get('http://127.0.0.1:8790/frame/v0.4.0', { headers: { host: runHost } });
    const headers = { ...response.headers() };
    delete headers['content-security-policy'];
    await route.fulfill({ status: 200, headers, body: await response.body() });
  });
  await page.goto('http://localhost:8789/');
  await expect(run(page, 'postMessage("should never run")', { timeout: 700 })).rejects.toThrow('sandbox_unavailable');
});

test('opaque mode still reports null', async ({ page }) => {
  expect(await run(page, 'postMessage(hashbinSandbox.origin)', { origin: 'opaque' })).toBe('null');
});

test('developer panel renders settings and persists the owner toggle', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId: 'test' })));
  await page.goto(`/developers/apps#${clientId}`);
  const panel = page.locator('.developers-run');
  await expect(panel).toContainText(runOrigin);
  await expect(panel).toContainText(`frame-src ${runOrigin}`);
  await expect(panel).toContainText('20,000');
  await expect(panel.getByLabel('Enable hosted sandbox')).toBeChecked();
  await expect(panel).not.toContainText('undefined');
  await panel.getByLabel('Enable hosted sandbox').uncheck();
  await panel.getByRole('button', { name: 'Save hosted sandbox settings' }).click();
  await expect(panel.locator('strong').first()).toHaveText('off');
  await page.reload();
  await expect(panel.getByLabel('Enable hosted sandbox')).not.toBeChecked();
  await panel.getByLabel('Enable hosted sandbox').check();
  await panel.getByRole('button', { name: 'Save hosted sandbox settings' }).click();
  await expect(panel.locator('strong').first()).toHaveText('active');
});
