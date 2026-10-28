import { test, expect } from '@playwright/test';

const hashbinOrigin = 'http://localhost:8787';
const clientOrigin = 'http://127.0.0.1:8787';
const redirectUri = `${clientOrigin}/safety-callback`;
let clientId;

test.beforeEach(async ({ page, request, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['local-network-access']);
  page.on('pageerror', error => console.log('CLIENT ERROR:', error.message));
  page.on('console', message => { if (message.type() === 'error') console.log('CLIENT CONSOLE:', message.text()); });
  const response = await request.post(`${hashbinOrigin}/api/developers/apps`, {
    headers: { Authorization: 'LocalDev safety_e2e_developer' },
    data: { app_name: 'Safety browser test', redirect_uris: [redirectUri], shared_origin_acknowledged: true }
  });
  expect(response.status()).toBe(201);
  clientId = (await response.json()).client_id;
  await context.addInitScript(() => {
    if (location.origin === 'http://localhost:8787') localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId: 'safety_e2e_user' }));
  });
  await context.addInitScript(({ clientOrigin, hashbinOrigin, clientId, redirectUri }) => {
    if (location.origin !== clientOrigin || location.pathname !== '/safety-callback') return;
    window.addEventListener('DOMContentLoaded', async () => {
      document.body.innerHTML = '<h1>Callback</h1><output id="result"></output>';
      const { createClient } = await import(hashbinOrigin + '/sdk/hashbin.js');
      const client = createClient({ clientId, redirectUri, baseUrl: hashbinOrigin, contentBaseUrl: hashbinOrigin });
      try {
        const result = location.hash.includes('hashbin_publish') ? await client.handlePublishCallback() : await client.handleCallback({ postMessageToOpener: true, closeWindow: true });
        document.getElementById('result').textContent = JSON.stringify(result);
      } catch (error) { document.getElementById('result').textContent = error.message; }
    });
  }, { clientOrigin, hashbinOrigin, clientId, redirectUri });
  const clientHtml = `<!doctype html><h1>Client on a separate origin</h1><button id="save">Save</button><button id="redirect">Redirect save</button><button id="allowance">Allow silent saves</button><output id="result"></output><script type="module">
    import { createClient } from '${hashbinOrigin}/sdk/hashbin.js';
    const client = createClient({ clientId: '${clientId}', redirectUri: '${redirectUri}', baseUrl: '${hashbinOrigin}', contentBaseUrl: '${hashbinOrigin}' });
    const output = document.getElementById('result');
    document.getElementById('save').onclick = () => client.publish('<script>alert(1)</' + 'script>', { contentType: 'text/html' }).then(result => output.textContent = result.cid).catch(error => output.textContent = error.message);
    document.getElementById('redirect').onclick = () => client.publish('redirect document', { mode: 'redirect', clientState: { draft: 'unsaved state' } }).catch(error => output.textContent = error.message);
    document.getElementById('allowance').onclick = async () => {
      try {
        await client.authorize({ mode: 'popup' });
        const balance = await client.getBalance();
        const result = await client.save('silent document', { maxCostCents: 0 });
        const type = client.getTokens().tokenType;
        await client.disconnect();
        output.textContent = JSON.stringify({ type, cid: result.cid, balance: balance.balance_cents, disconnected: client.getTokens() === null });
      } catch (error) { output.textContent = error.message; }
    };
  </script>`;
  // A real initial navigation preserves the loopback address space in Chromium.
  // Fulfilling the top-level document through routing makes it appear public.
  await page.goto(clientOrigin);
  await page.setContent(clientHtml);
  await expect.poll(() => page.evaluate(() => typeof document.getElementById('save').onclick)).toBe('function');
});

test('approves a cross-origin popup save without giving the client tokens or executing its HTML', async ({ page }) => {
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#save').click();
  const popup = await popupPromise;
  await expect(popup.locator('#preview')).toContainText('<script>alert(1)</script>');
  await popup.locator('#review').click();
  await expect(popup.locator('#quote')).toContainText('Exact price: $0.00');
  await popup.screenshot({ path: '/tmp/hashbin-publish-safety.png', fullPage: true });
  await popup.locator('#approve').click();
  await expect(page.locator('#result')).toHaveText(/^[A-Za-z0-9_-]{8,94}$/);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('hashbin:tokens:')))).toBe(false);
});

test('verifies a fragment redirect result and returns saved client state', async ({ page }) => {
  await page.locator('#redirect').click();
  await expect(page.locator('#preview')).toHaveText('redirect document');
  await page.reload(); // Simulate a social-sign-in return after the fragment was removed.
  await expect(page.locator('#preview')).toHaveText('redirect document');
  await page.locator('#review').click();
  await expect(page.locator('#approve')).toBeEnabled();
  await page.locator('#approve').click();
  await expect(page.locator('#result')).toContainText('unsaved state');
  await expect(page.locator('#result')).toContainText('cid');
});

test('sets up an allowance, uses browser-bound tokens for save and balance, and revokes on disconnect', async ({ page }) => {
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#allowance').click();
  const popup = await popupPromise;
  await popup.locator('#allowance-link').click();
  await expect(popup.locator('#grant-spend')).toHaveValue('1');
  await expect(popup.locator('#grant-upload')).toHaveValue('1048576');
  await expect(popup.locator('#grant-expiry')).toHaveValue('30');
  await popup.locator('#approve-button').click();
  await expect(page.locator('#result')).toContainText('"type":"DPoP"');
  await expect(page.locator('#result')).toContainText('"disconnected":true');
});

test('serves the approval page with clickjacking protection', async ({ request }) => {
  const response = await request.get(`${hashbinOrigin}/publish?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=test`);
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});


test('loads the immutable SDK with its documented SRI hash and cross-origin headers', async ({ page, request }) => {
  const response = await request.get(`${hashbinOrigin}/sdk/v0.2.0/hashbin.js`);
  expect(response.headers()['cache-control']).toContain('immutable');
  expect(response.headers()['access-control-allow-origin']).toBe('*');
  const manifest = await (await request.get(`${hashbinOrigin}/sdk/v0.2.0/integrity.json`)).json();
  const loaded = await page.evaluate(async ({ url, integrity }) => {
    delete window.hashbin;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module'; script.src = url; script.integrity = integrity; script.crossOrigin = 'anonymous';
      script.onload = resolve; script.onerror = () => reject(new Error('SRI-pinned SDK failed to load'));
      document.head.append(script);
    });
    return typeof window.hashbin.verifyCID;
  }, { url: `${hashbinOrigin}/sdk/v0.2.0/hashbin.js`, integrity: manifest.integrity });
  expect(loaded).toBe('function');
});
