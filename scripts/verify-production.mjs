import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHostedRunOrigin } from './verify-hosted-run-origin.mjs';

/** Verify the automated post-deploy checklist without credentials or state changes. */
export async function verifyProduction({
  baseUrl = 'https://hashbin.org',
  contentUrl = 'https://256t.us',
  expectedSha,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const request = async (origin, path, options = {}) => {
    const response = await fetchImpl(new URL(path, origin), {
      ...options,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    return response;
  };
  const failures = [];
  const check = async (name, action) => {
    try {
      await action();
      log(`PASS ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      log(`FAIL ${name}: ${error.message}`);
    }
  };
  let deployedSha;
  await check('Production health and commit', async () => {
    const response = await request(baseUrl, '/health');
    assert.equal(response.status, 200, 'Health must return 200');
    const health = await response.json();
    assert.equal(health.status, 'healthy', 'Overall health must be healthy');
    assert.equal(health.environment, 'production', 'Environment must be production');
    for (const name of ['worker', 'environment', 'clerk', 'stripe', 'durableObjects', 'r2']) {
      assert.equal(health.checks?.[name]?.status, 'operational', `${name} must be operational`);
    }
    assert.equal(health.checks.environment.details?.oauthSigningKeyConfigured, true, 'OAuth signing key must be configured');
    assert.match(health.gitSha || '', /^[a-f0-9]{40}$/, 'Health must contain a full commit SHA');
    if (expectedSha) assert.equal(health.gitSha, expectedSha, 'Deployed commit must match the expected SHA');
    deployedSha = health.gitSha;
  });
  // Workers Assets redirects .html URLs to these canonical page paths.
  for (const path of ['/', '/upload', '/dashboard', '/api-keys', '/info']) {
    await check(`HTML commit ${path}`, async () => {
      assert.ok(deployedSha, 'Cannot verify HTML without healthy deployment commit');
      const response = await request(baseUrl, path);
      assert.equal(response.status, 200, 'Page must return 200');
      const html = await response.text();
      assert.ok(html.includes(`<!-- git-sha: ${deployedSha} -->`), 'HTML must match the deployed commit');
      if (path === '/') assert.match(html, /<title>[^<]*HashBin/);
    });
  }
  await check('Content domain health', async () => {
    const response = await request(contentUrl, '/health');
    assert.equal(response.status, 200, 'Content health must return 200');
    assert.equal(await response.text(), 'OK', 'Content health must be the dedicated Worker');
  });
  for (const [name, path, options, status, error] of [
    ['Missing session credentials', '/api/auth/session', {}, 401, 'AUTH_MISSING'],
    ['Invalid session credentials', '/api/auth/session', { headers: { Authorization: 'Invalid' } }, 401, 'AUTH_INVALID_FORMAT'],
    ['Unsigned Clerk webhook', '/api/webhooks/clerk', { method: 'POST', body: '{}' }, 401, 'Invalid signature'],
    ['Unsigned Stripe webhook', '/api/payments/webhook', { method: 'POST', body: '{}' }, 400, 'Missing signature'],
  ]) {
    await check(name, async () => {
      const response = await request(baseUrl, path, options);
      assert.equal(response.status, status, `Expected HTTP ${status}`);
      assert.equal((await response.json()).error, error, 'Expected the documented refusal');
    });
  }
  await check('Unknown API route', async () => {
    const response = await request(baseUrl, '/api/nonexistent');
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, 'string');
  });
  await check('Public price calculation', async () => {
    const response = await request(baseUrl, '/api/payments/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size_bytes: 1048576, retention_months: 1 }),
    });
    assert.equal(response.status, 200);
    await response.json();
  });
  if (failures.length) throw new Error(`Production verification failed (${failures.length} checks):\n${failures.join('\n')}`);
  return deployedSha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.slice(2).every(arg => arg === '--skip-run-origin'), 'Only --skip-run-origin is supported');
    await verifyProduction({ expectedSha: process.env.EXPECTED_GIT_SHA });
    if (!process.argv.includes('--skip-run-origin')) await verifyHostedRunOrigin();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
