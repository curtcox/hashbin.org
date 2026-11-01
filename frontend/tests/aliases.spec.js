import { test, expect } from '@playwright/test';

test('personal aliases show quotes, preserve CID edits, renew and delete without refund', async ({ page }) => {
  const user = `aliases-ui-${Date.now()}-${test.info().workerIndex}`;
  const cid = 'AAAAAAABAQ', nextCid = 'AAAAAAABAg';
  await page.addInitScript(userId => localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId })), user);
  await page.goto('/dashboard/aliases');
  await expect(page.locator('#alias-price')).toContainText('$0.12');
  await page.locator('#alias-name').fill('my-document'); await page.locator('#alias-cid').fill(cid);
  await page.locator('#alias-months').fill('1');
  await expect(page.locator('#alias-price')).toContainText('$0.01 from balance');
  await page.locator('#alias-submit').click();
  const card = page.locator('#alias-list article').filter({ hasText: '@my-document' });
  await expect(card).toBeVisible(); await expect(card).toContainText(cid);
  await card.getByRole('button', { name: 'Change CID' }).click();
  await expect(page.locator('#alias-current')).toContainText(cid);
  await page.locator('#alias-cid').fill(nextCid); await page.locator('#alias-submit').click();
  await expect(card).toContainText(nextCid);
  await card.getByRole('button', { name: 'Renew', exact: true }).click();
  await page.locator('#alias-months').fill('1'); await page.locator('#alias-submit').click();
  await expect(page.locator('#alias-message')).toContainText('Saved');
  await expect(card).toContainText(nextCid);
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#alias-list')).toContainText('No personal aliases yet.');
  await page.goto('/transactions.html');
  await expect(page.locator('main')).toContainText('Personal Alias');
  const uploaded = await page.request.post('/api/content', { headers: { Authorization: `LocalDev ${user}`, 'Content-Type': 'text/plain' }, data: `Alias upload ${user} ${'x'.repeat(100)}` });
  expect(uploaded.status()).toBe(201);
  const uploadedCid = (await uploaded.json()).cid;
  await page.goto(`/dashboard/uploads/${uploadedCid}/`);
  await expect(page.locator('#add-alias')).toHaveAttribute('href', `/dashboard/aliases/?cid=${uploadedCid}`);
  await page.locator('#add-alias').click();
  await expect(page.locator('#alias-cid')).toHaveValue(uploadedCid);
});

test('global alias claim, listing and buy-now work from the public page', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${test.info().workerIndex}`, name = `browser-${stamp}`;
  await page.addInitScript(userId => localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId })), `seller-${stamp}`);
  await page.goto(`/aliases/view.html?name=${name}&cid=AAAAAAABAQ`);
  await expect(page.locator('#alias-actions')).toContainText('$1.00 from balance');
  await page.getByRole('button', { name: 'Claim alias', exact: true }).click();
  await expect(page.locator('#alias-info')).toContainText('Status: owned');
  await page.goto('/dashboard/aliases/');
  const card = page.locator('#global-alias-list article').filter({ hasText: `@${name}` });
  page.once('dialog', dialog => dialog.accept('200'));
  await card.getByRole('button', { name: 'List for sale', exact: true }).click();
  await expect(card).toContainText('Change listing ($2.00)');
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    await context.addInitScript(userId => localStorage.setItem('hashbin.localAuthUser', JSON.stringify({ userId })), `buyer-${stamp}`);
    const buyer = await context.newPage();
    await buyer.goto(`/aliases/view.html?name=${name}`);
    await expect(buyer.locator('#alias-actions')).toContainText('Buy now for $2.00');
    await buyer.getByRole('button', { name: 'Buy alias', exact: true }).click();
    await expect(buyer.locator('#alias-actions')).toContainText('Change CID, renewal settings');
    await buyer.goto('/dashboard/aliases/');
    await expect(buyer.locator('#global-alias-list')).toContainText(`@${name}`);
  } finally { await context.close(); }
});
