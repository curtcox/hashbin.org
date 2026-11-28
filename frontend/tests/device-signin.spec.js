import { test, expect } from '@playwright/test';
import { generateKeyPair, signJws, verifyJws, decodeJws, jwkThumbprint, sha256b64u } from '../../src/vendor/devicebasedauth/jose.js';

const ISSUER = 'https://devicebasedauth.org';
const FLAG = 'hashbin-device-session';
const SLOT = 'hashbin-pages';

async function fixture(page, { revoked = false, nonce = false, enroll = false } = {}) {
  const signer = await generateKeyPair(true);
  let credential;
  let publicJwk;
  let clerkRequests = 0;
  const proofs = [];
  await page.route('https://cdn.jsdelivr.net/**', route => { clerkRequests++; return route.abort(); });
  await page.route('**/api/config', route => route.fulfill({ json: { authMode: 'clerk', clerkPublishableKey: 'pk_test_fixture', dba_issuer: ISSUER } }));
  await page.route('**/__device-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Device fixture</body></html>' }));
  await page.goto('/__device-fixture');

  async function issue(jwk) {
    publicJwk = jwk;
    const now = Math.floor(Date.now() / 1000);
    credential = await signJws({ typ: 'dba-device+jwt', kid: 'test' }, {
      iss: ISSUER, aud: ['hashbin.org'], acct: 'acct_fixture', sub: 'dev_FIXTURE123', cid: 'crd_FIXTURE123', jti: 'crd_FIXTURE123.1',
      iat: now, nbf: now, exp: now + 3600, ver: 1, cnf: { jkt: await jwkThumbprint(jwk) },
      device: { name: 'Acceptance browser', kind: 'browser' }, grants: [{ actions: ['hashbin:session'] }],
      status: { status_list: { uri: `${ISSUER}/status/0`, idx: 0 } }
    }, signer.privateKey);
    return credential;
  }

  if (!enroll) {
    const key = await page.evaluate(async ({ issuer, slot }) => {
      const { DBA } = await import('/js/dba-sdk.js');
      const dba = new DBA({ origin: issuer, name: slot });
      const state = await dba.key();
      return { jwk: state.publicJwk, extractable: state.privateKey.extractable };
    }, { issuer: ISSUER, slot: SLOT });
    expect(key.extractable).toBe(false);
    await issue(key.jwk);
    await page.evaluate(async ({ issuer, slot, credential, flag }) => {
      const { DBA } = await import('/js/dba-sdk.js');
      const dba = new DBA({ origin: issuer, name: slot });
      await dba.ready(); dba.state.credential = credential; await dba.save();
      localStorage.setItem(flag, '1');
    }, { issuer: ISSUER, slot: SLOT, credential, flag: FLAG });
  } else {
    await page.route(`${ISSUER}/api/v1/enrollments`, async route => {
      const signed = route.request().postDataJSON().request;
      const { header } = decodeJws(signed);
      const { payload } = await verifyJws(signed, header.jwk);
      expect(header.jwk.d).toBeUndefined();
      expect(payload).toMatchObject({ aud: ['hashbin.org'], grants: [{ actions: ['hashbin:session'] }], device: { key_protection: 'webcrypto-nonextractable' } });
      await issue(header.jwk);
      await route.fulfill({ json: { enrollment_id: 'enr_fixture', approval_url: `${ISSUER}/fixture-approve`, poll_url: `${ISSUER}/fixture-poll`, interval: 0.01 } });
    });
    await page.context().route(`${ISSUER}/fixture-approve`, route => route.fulfill({ contentType: 'text/html', body: 'Test owner approval' }));
    await page.route(`${ISSUER}/fixture-poll`, route => route.fulfill({ json: { status: 'approved', credential } }));
  }

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/config' || new URL(request.url()).origin === ISSUER) return route.fallback();
    expect(request.headers().authorization).toBe(`DBA ${credential}`);
    const { payload } = await verifyJws(request.headers().dpop, publicJwk);
    expect(payload.htm).toBe(request.method());
    expect(payload.htu).toBe(request.url().split('?')[0]);
    expect(payload.ath).toBe(await sha256b64u(credential));
    expect(proofs.map(p => p.jti)).not.toContain(payload.jti);
    proofs.push(payload);
    if (nonce && path === '/api/auth/session' && !payload.nonce) return route.fulfill({ status: 401, headers: { 'DPoP-Nonce': 'server-nonce' }, json: { code: 'use_dpop_nonce' } });
    if (nonce) expect(payload.nonce).toBe('server-nonce');
    if (revoked) return route.fulfill({ status: 401, json: { error: 'AUTH_KEY_REVOKED' } });
    const bodies = {
      '/api/auth/session': { user_id: 'verified_hashbin_user', auth_method: 'dba' },
      '/api/auth/dba/link': { linked: true, account: 'acct_fixture', linked_at: Date.now() },
      '/api/auth/dba/credentials': { credentials: [] }
    };
    return route.fulfill({ json: bodies[path] || { balance_cents: 1234, success: true } });
  });
  return { proofs, clerkRequests: () => clerkRequests };
}

test('a restored device bypasses Clerk, signs each request and answers nonce challenges', async ({ page }) => {
  const f = await fixture(page, { nonce: true });
  await page.goto('/');
  await expect(page.locator('#auth-section')).toContainText('Acceptance browser');
  await expect(page.locator('#balance-display')).toContainText('$12.34');
  expect(f.clerkRequests()).toBe(0);
  await page.evaluate(async () => {
    const { authenticatedFetch } = await import('/js/utils.js');
    const r = await authenticatedFetch('/api/content?test=1', { method: 'POST', body: 'test' });
    if (!r.ok) throw new Error('Device request failed');
  });
  expect(f.proofs.some(p => p.htm === 'POST' && p.htu.endsWith('/api/content'))).toBe(true);
  const refused = await page.evaluate(async () => {
    const { authenticatedFetch } = await import('/js/utils.js');
    try { await authenticatedFetch('https://other.example/api/balance'); return false; } catch { return true; }
  });
  expect(refused).toBe(true);
  await page.reload();
  await expect(page.locator('#balance-display')).toContainText('$12.34');
  expect(f.clerkRequests()).toBe(0);
  await page.goto('/account');
  await expect(page.locator('#dba-link-status')).toContainText('Use regular account sign-in');
  await expect(page.locator('#dba-link')).toBeHidden();
  await expect(page.locator('#dba-unlink')).toBeHidden();
  await page.route('**/api/auth/dba/link', route => route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } }));
  await page.reload();
  await expect(page.locator('#dba-link-status')).toContainText('Could not load');
  await expect(page.locator('#dba-link')).toBeHidden();
  await expect(page.locator('#dba-unlink')).toBeHidden();
});

test('a revoked device stays signed out instead of falling back to a Clerk session', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, { revoked: true });
  await page.goto('/');
  await expect(page.locator('#device-sign-in-btn')).toBeVisible();
  await expect(page.locator('#sign-in-btn')).toBeVisible();
  await expect(page.locator('#sign-out-btn')).toHaveCount(0);
  const state = await page.evaluate(async () => (await import('/js/auth-loader.js')).getAuthState());
  expect(state).toEqual({ authenticated: false, deviceSession: true });
  expect(f.clerkRequests()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('direct sign-in enrolls with the real SDK while Clerk is unavailable, and forgetting deletes the key', async ({ page }) => {
  await fixture(page, { enroll: true });
  await page.goto('/');
  await page.locator('#device-sign-in-btn').click();
  await expect(page.locator('#auth-section')).toContainText('Acceptance browser');
  await expect(page.locator('#balance-display')).toContainText('$12.34');
  const ready = await page.evaluate(async ({ issuer, slot, flag }) => {
    const { forgetDevice } = await import('/js/device-auth.js');
    await forgetDevice();
    const { DBA } = await import('/js/dba-sdk.js');
    return { ready: await new DBA({ origin: issuer, name: slot }).ready(), remembered: localStorage.getItem(flag) };
  }, { issuer: ISSUER, slot: SLOT, flag: FLAG });
  expect(ready).toEqual({ ready: false, remembered: null });
});
