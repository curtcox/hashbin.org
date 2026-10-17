import { test, expect } from '@playwright/test';
import { generate256tHash } from '../js/hash256t.js';

const file = (name, text = name.repeat(30)) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

async function openUpload(page, balance = 100) {
  await page.addInitScript(() => {
    localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId: 'bulk-upload-e2e' }));
  });
  await page.route('**/api/balance', route => route.fulfill({ json: { balance_cents: balance } }));
  await page.route('**/api/content/*/exists', route => route.fulfill({ json: { exists: false } }));
  await page.goto('/upload');
  await expect(page.locator('#current-balance')).toHaveText(`$${(balance / 100).toFixed(2)}`);
}

async function uploadData(request) {
  const form = await new Request(request.url(), {
    method: 'POST', headers: request.headers(), body: request.postDataBuffer()
  }).formData();
  return { file: form.get('content'), months: form.get('retention_months') };
}

async function success(route, upload) {
  const cid = await generate256tHash(upload.file);
  await route.fulfill({ json: {
    cid, cost_cents: upload.file.size <= 64 ? 0 : 1,
    expires_at: new Date(Date.now() + Number(upload.months) * 30 * 86400000).toISOString()
  } });
}

async function ready(page, count) {
  await expect(page.locator('#hashing-progress')).toBeHidden();
  await expect(page.locator('.file-row')).toHaveCount(count);
}

test('multiple selection shares retention, sums per-file costs, and uploads identical content once', async ({ page }) => {
  const uploads = [];
  await openUpload(page);
  await page.route('**/api/content', async route => {
    const upload = await uploadData(route.request());
    uploads.push({ name: upload.file.name, months: upload.months });
    await success(route, upload);
  });
  await expect(page.locator('#file-input')).toHaveAttribute('multiple');
  await page.locator('#file-input').setInputFiles([
    file('first.txt'), file('second.txt'), file('copy.txt', 'first.txt'.repeat(30)), file('inline.txt', 'tiny')
  ]);
  await ready(page, 4);
  await expect(page.locator('#cost-amount')).toHaveText('$0.02');
  await expect(page.locator('.file-row').nth(2)).toContainText('Identical content');
  await page.getByRole('button', { name: '5 years', exact: true }).click();
  await page.getByRole('button', { name: 'Upload 3 Files', exact: true }).click();
  await expect(page.locator('#upload-results')).toContainText('4 of 4 files uploaded');
  expect(uploads).toEqual([
    { name: 'first.txt', months: '60' }, { name: 'second.txt', months: '60' }, { name: 'inline.txt', months: '60' }
  ]);
  await expect(page.getByRole('link', { name: 'View content', exact: true })).toHaveCount(4);
  await expect(page.locator('.file-row').last()).toContainText('Available indefinitely');
  await expect(page.locator('#upload-button')).toBeDisabled();
  await expect(page).toHaveURL(/\/upload$/);
});

test('the whole group must fit the balance, and removing a file updates the total', async ({ page }) => {
  await openUpload(page, 1);
  await page.locator('#file-input').setInputFiles([file('first.txt'), file('second.txt')]);
  await ready(page, 2);
  await expect(page.locator('#cost-amount')).toHaveText('$0.02');
  await expect(page.locator('#balance-status')).toContainText('Need $0.01 more');
  await expect(page.locator('#upload-button')).toBeDisabled();
  await page.getByRole('button', { name: 'Remove first.txt', exact: true }).click();
  await expect(page.locator('#cost-amount')).toHaveText('$0.01');
  await expect(page.locator('#upload-button')).toBeEnabled();
  await page.getByRole('button', { name: 'Remove second.txt', exact: true }).click();
  await expect(page.locator('#upload-section')).toBeHidden();
});

test('dragging a group adds all files and rejects oversized and empty files individually', async ({ page }) => {
  await openUpload(page, 0);
  await page.locator('#drop-zone').evaluate(dropZone => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['small'], '<safe-name>.txt', { type: 'text/plain' }));
    transfer.items.add(new File([], 'empty.txt'));
    const oversized = new File(['large'], 'oversized.txt');
    Object.defineProperty(oversized, 'size', { value: 90 * 1024 * 1024 + 1 });
    transfer.items.add(oversized);
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await ready(page, 3);
  await expect(page.locator('.file-row').nth(0)).toContainText('<safe-name>.txt');
  await expect(page.locator('.file-row').nth(1)).toContainText('Empty files cannot be uploaded');
  await expect(page.locator('.file-row').nth(2)).toContainText('Maximum size is 90 MB per file');
  await expect(page.locator('#cost-amount')).toHaveText('$0.00');
  await expect(page.locator('#upload-button')).toHaveText('Upload 1 File');
  await expect(page.locator('#upload-button')).toBeEnabled();
  // A later picker selection adds to the group.
  await page.locator('#file-input').setInputFiles(file('another.txt', 'also small'));
  await ready(page, 4);
  await expect(page.locator('#upload-button')).toHaveText('Upload 2 Files');
});

test('a failed file does not block later uploads and retry skips completed files', async ({ page }) => {
  const uploads = [];
  await openUpload(page);
  await page.route('**/api/content', async route => {
    const upload = await uploadData(route.request());
    uploads.push(upload.file.name);
    if (upload.file.name === 'second.txt' && uploads.length === 2) {
      await route.fulfill({ status: 500, json: { message: 'Storage temporarily unavailable' } });
    } else {
      await success(route, upload);
    }
  });
  await page.locator('#file-input').setInputFiles([file('first.txt'), file('second.txt'), file('third.txt')]);
  await ready(page, 3);
  await page.locator('#upload-button').click();
  await expect(page.locator('#upload-results')).toContainText('2 of 3 files uploaded');
  await expect(page.locator('.file-row').nth(1)).toContainText('Storage temporarily unavailable');
  await expect(page.locator('#cost-amount')).toHaveText('$0.01');
  await page.getByRole('button', { name: 'Retry Remaining Files', exact: true }).click();
  await expect(page.locator('#upload-results')).toContainText('3 of 3 files uploaded');
  expect(uploads).toEqual(['first.txt', 'second.txt', 'third.txt', 'second.txt']);
});

test('stopping uploads preserves successes, stops the queue, and unlocks controls after cancellation', async ({ page }) => {
  const uploads = [];
  let release;
  const paused = new Promise(resolve => { release = resolve; });
  await openUpload(page);
  await page.route('**/api/content', async route => {
    const upload = await uploadData(route.request());
    uploads.push(upload.file.name);
    if (uploads.length === 2) await paused;
    await success(route, upload);
  });
  await page.locator('#file-input').setInputFiles([file('first.txt'), file('second.txt'), file('third.txt')]);
  await ready(page, 3);
  await page.locator('#upload-button').click();
  await expect(page.locator('#upload-progress-text')).toContainText('Uploading 2 of 3');
  await expect(page.locator('#file-input')).toBeDisabled();
  await expect(page.locator('#retention-slider')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove first.txt', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop Uploads', exact: true }).click();
  await expect(page.locator('#upload-results')).toContainText('1 of 3 files uploaded. Uploads stopped.');
  expect(uploads).toEqual(['first.txt', 'second.txt']);
  await expect(page.locator('#retention-slider')).toBeEnabled();
  await expect(page.locator('.file-row').nth(1)).toContainText('may have reached the server');
  release();
  await page.getByRole('button', { name: 'Retry Remaining Files', exact: true }).click();
  await expect(page.locator('#upload-results')).toContainText('3 of 3 files uploaded');
  expect(uploads).toEqual(['first.txt', 'second.txt', 'second.txt', 'third.txt']);
});

test('existing content explains retention extension and single-file upload still redirects', async ({ page }) => {
  await openUpload(page);
  await page.route('**/api/content/*/exists', route => route.fulfill({ json: {
    exists: true, expires_at: '2030-01-01T00:00:00.000Z'
  } }));
  await page.route('**/api/content', async route => success(route, await uploadData(route.request())));
  await page.locator('#file-input').setInputFiles(file('single.txt'));
  await ready(page, 1);
  await expect(page.locator('.file-row')).toContainText('Already stored');
  await page.locator('#upload-button').click();
  await expect(page).toHaveURL(/\/info(?:\.html)?\?cid=.+&uploaded=1/);
});

test('a real group of inline files uploads through the local API', async ({ page }) => {
  await openUpload(page, 0);
  await page.locator('#file-input').setInputFiles([file('one.txt', 'bulk-one'), file('two.txt', 'bulk-two')]);
  await ready(page, 2);
  await page.getByRole('button', { name: '1 year', exact: true }).click();
  await page.locator('#upload-button').click();
  await expect(page.locator('#upload-results')).toContainText('2 of 2 files uploaded');
  for (const link of await page.getByRole('link', { name: 'View content', exact: true }).all()) {
    const cid = new URL(await link.getAttribute('href'), 'http://localhost').searchParams.get('cid');
    const response = await page.request.get(`/${cid}`);
    expect(response.ok()).toBeTruthy();
    expect(['bulk-one', 'bulk-two']).toContain(await response.text());
  }
});

test('stored files receive the same retention duration through the real API', async ({ page }) => {
  const userId = `bulk-paid-${Date.now()}`;
  await page.addInitScript(id => {
    localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId: id }));
  }, userId);
  await page.goto('/upload');
  const balance = await page.request.get('/api/balance', { headers: { Authorization: `LocalDev ${userId}` } });
  const startingBalance = (await balance.json()).balance_cents;
  await expect(page.locator('#current-balance')).toHaveText(`$${(startingBalance / 100).toFixed(2)}`);
  const deposit = await page.request.post('/api/balance/dev-deposit', {
    headers: { Authorization: `LocalDev ${userId}` }, data: { amount_cents: 10 }
  });
  expect(deposit.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('#current-balance')).toHaveText(`$${((startingBalance + 10) / 100).toFixed(2)}`);
  const selected = [file('first.txt', `first ${userId}`.repeat(5)), file('second.txt', `second ${userId}`.repeat(5))];
  await page.locator('#file-input').setInputFiles(selected);
  await ready(page, 2);
  await page.getByRole('button', { name: '1 year', exact: true }).click();
  await page.locator('#upload-button').click();
  await expect(page.locator('#upload-results')).toContainText('2 of 2 files uploaded');
  await expect(page.locator('#current-balance')).toHaveText(`$${((startingBalance + 8) / 100).toFixed(2)}`);
  for (const selectedFile of selected) {
    const cid = await generate256tHash(new Blob([selectedFile.buffer]));
    const response = await page.request.get(`/api/content/${cid}/exists`);
    const data = await response.json();
    expect(data.exists).toBeTruthy();
    const metadataResponse = await page.request.get(`/api/content/${cid}`);
    const metadata = await metadataResponse.json();
    expect(metadata.retention_months).toBe(12);
    const expectedExpiration = new Date(metadata.created_at);
    expectedExpiration.setUTCMonth(expectedExpiration.getUTCMonth() + 12);
    expect(metadata.expires_at).toBe(expectedExpiration.toISOString());
    const download = await page.request.get(`/${cid}`);
    expect(await download.text()).toBe(selectedFile.buffer.toString());
  }
});

test('bulk upload controls and long filenames fit a mobile screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openUpload(page);
  await page.locator('#file-input').setInputFiles([
    file('a-very-long-filename-for-the-first-document-in-this-group.txt'), file('second-document.txt')
  ]);
  await ready(page, 2);
  await expect(page.locator('#upload-button')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath('bulk-upload-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('bulk-upload-desktop.png'), fullPage: true });
});
