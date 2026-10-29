import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Verify the hosted origin's security headers and refusal of unknown apps. */
export async function verifyHostedRunOrigin({ domain = process.env.RUN_DOMAIN || 'hashbin.app', fetchImpl = fetch } = {}) {
  const options = { redirect: 'error', signal: AbortSignal.timeout(15000) };
  const apex = await fetchImpl(`https://${domain}/`, options);
  assert.equal(apex.status, 200, 'Run apex must respond successfully');
  assert.match(await apex.text(), /This domain runs code for apps that use HashBin/);
  for (const response of [apex, await fetchImpl(`https://a00000000000000000000000000000000.${domain}/health`, { ...options, signal: AbortSignal.timeout(15000) })]) {
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('strict-transport-security') || '', /includeSubDomains/);
    if (response !== apex) {
      assert.equal(response.status, 404, 'An unknown app must be disabled');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  console.log(`Verified https://${domain}: apex, security headers, cookie absence and unknown-app refusal`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyHostedRunOrigin();
}
