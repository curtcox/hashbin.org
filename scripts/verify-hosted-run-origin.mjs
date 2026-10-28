import assert from 'node:assert/strict';

const domain = process.env.RUN_DOMAIN || 'hashbin.app';
const apex = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(15000) });
assert.equal(apex.status, 200, 'Run apex must respond successfully');
assert.match(await apex.text(), /This domain runs code for apps that use HashBin/);
for (const response of [apex, await fetch(`https://a00000000000000000000000000000000.${domain}/health`, { signal: AbortSignal.timeout(15000) })]) {
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
