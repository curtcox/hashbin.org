/* eslint-env browser */
/* global pagesApp, Project, PythonOnline */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { OWNED_APPS, ownedAppOrigin } from './owned-apps.mjs';

const browser = await chromium.launch({ executablePath: process.env.OWNED_CHROMIUM_PATH || chromium.executablePath() });
const evidence = [];
try {
  for (const slug of Object.keys(OWNED_APPS)) {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      const response = await page.goto(ownedAppOrigin(slug) + '/');
      assert.equal(response.status(), 200, slug);
      assert.match(response.headers()['strict-transport-security'] || '', /includeSubDomains/);
      if (slug === 'pages') {
        await page.waitForFunction(() => window.pagesApp);
        await page.evaluate(() => pagesApp.setProject(Project.single('<h1>Domain verification</h1><script>console.log("preview eval",eval("1+2"));</script>')));
        const preview = page.frameLocator('#preview').frameLocator('#preview-content');
        assert.equal(await preview.locator('h1').textContent(), 'Domain verification');
        assert.equal(new URL(await page.locator('#preview').getAttribute('src')).origin, 'https://pages.hashbin.us');
        assert.equal(await preview.locator('h1').evaluate(() => self.origin), 'null');
        await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'globalThis.injected=true'; document.head.append(script); });
        assert.equal(await page.evaluate(() => globalThis.injected), undefined);
        await page.waitForFunction(() => document.getElementById('offline-status').textContent === 'Available offline');
        await context.setOffline(true); await page.reload(); await page.waitForFunction(() => window.pagesApp);
        assert.equal(await preview.locator('h1').textContent(), 'Domain verification');
        assert.equal(new URL(await page.locator('#preview').getAttribute('src')).origin, ownedAppOrigin('pages'));
        await context.setOffline(false);
      } else if (slug === 'gnuplot') {
        await page.waitForFunction(() => /^Rendered in/.test(document.getElementById('status').textContent));
        assert.ok(await page.locator('#preview svg').count());
      } else if (slug === 'python') {
        await page.waitForFunction(() => globalThis.PythonOnline);
        await page.evaluate(() => { PythonOnline.editor.setValue('print("new domain works")', -1); PythonOnline.run(); });
        await page.waitForFunction(() => document.getElementById('output').textContent.includes('new domain works'), null, { timeout: 90000 });
      } else if (slug === 'manim') {
        await page.locator('#review svg').waitFor();
      } else if (slug === 'modl' || slug === 'diagram') {
        await page.locator('#svg').waitFor();
        await page.locator('#svg g').first().waitFor();
      } else if (slug === 'sheets') {
        await page.locator('#preview').waitFor();
        await page.waitForFunction(() => document.getElementById('preview').textContent.trim().length > 0);
      } else if (slug === 'textpad') {
        await page.waitForFunction(() => document.getElementById('account').textContent.includes('Not connected'));
        await page.locator('#editor').fill('New domain text');
        assert.equal(await page.locator('#save').isEnabled(), true);
      } else if (slug === 'upload') {
        assert.equal(await page.locator('#client-id').inputValue(), OWNED_APPS.upload.appId);
      }
      evidence.push({ app: slug, origin: ownedAppOrigin(slug), title: await page.title(), status: 'passed' });
      console.log(`PASS ${slug}: HTTPS and live app rendering`);
    } catch (error) {
      evidence.push({ app: slug, origin: ownedAppOrigin(slug), status: 'failed', error: error.message });
      console.error(`FAIL ${slug}: ${error.message}`); process.exitCode = 1;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await mkdir('build-reports/owned-apps', { recursive: true });
  await writeFile('build-reports/owned-apps/live-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), apps: evidence }, null, 2));
}
