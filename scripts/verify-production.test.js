import { describe, expect, it, vi } from 'vitest';
import { verifyProduction } from './verify-production.mjs';
import { verifyHostedRunOrigin } from './verify-hosted-run-origin.mjs';

const sha = 'a'.repeat(40);
const json = (body, status = 200) => Response.json(body, { status });

function fixture(overrides = {}) {
  const health = {
    status: 'healthy', environment: 'production', gitSha: sha,
    checks: Object.fromEntries(['worker', 'environment', 'clerk', 'stripe', 'durableObjects', 'r2']
      .map(name => [name, { status: 'operational', details: { oauthSigningKeyConfigured: true } }])),
  };
  const fetchImpl = vi.fn(async (url, options) => {
    const path = url.pathname;
    const override = overrides[`${url.hostname}${path}`] || overrides[path];
    if (override) return override(health);
    if (url.hostname === '256t.us') return new Response('OK');
    if (path === '/health') return json(health);
    if (path === '/api/auth/session') return json({ error: options.headers?.Authorization ? 'AUTH_INVALID_FORMAT' : 'AUTH_MISSING' }, 401);
    if (path === '/api/webhooks/clerk') return json({ error: 'Invalid signature' }, 401);
    if (path === '/api/payments/webhook') return json({ error: 'Missing signature' }, 400);
    if (path === '/api/payments/calculate') return json({ cost_cents: 1 });
    if (path === '/api/nonexistent') return json({ error: 'Not found' }, 404);
    return new Response(`<title>HashBin</title><!-- git-sha: ${sha} -->`);
  });
  return { fetchImpl, log: vi.fn(), expectedSha: sha };
}

describe('production checklist', () => {
  it('checks production health, five page commits, content, auth, webhooks and public APIs', async () => {
    const options = fixture();
    await expect(verifyProduction(options)).resolves.toBe(sha);
    expect(options.fetchImpl).toHaveBeenCalledTimes(13);
    for (const [, requestOptions] of options.fetchImpl.mock.calls) {
      expect(requestOptions).toMatchObject({ redirect: 'error', cache: 'no-store' });
      expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
    }
    const webhookCalls = options.fetchImpl.mock.calls.filter(([url]) => url.pathname.includes('webhook'));
    for (const [, requestOptions] of webhookCalls) {
      expect(requestOptions).toMatchObject({ method: 'POST', body: '{}' });
      expect(requestOptions.headers).toBeUndefined();
    }
  });

  it.each([
    ['degraded', { status: 'degraded' }],
    ['unhealthy', { status: 'unhealthy' }],
    ['wrong environment', { environment: 'local' }],
    ['wrong SHA', { gitSha: 'b'.repeat(40) }],
    ['missing SHA', { gitSha: undefined }],
    ['partial health', { checks: {} }],
  ])('rejects %s health', async (_name, fields) => {
    await expect(verifyProduction(fixture({ '/health': health => json({ ...health, ...fields }) })))
      .rejects.toThrow('Production health and commit');
  });

  it('rejects a broken integration even if the overall status claims healthy', async () => {
    const options = fixture({ '/health': health => {
      health.checks.stripe.status = 'down';
      return json(health);
    } });
    await expect(verifyProduction(options)).rejects.toThrow('stripe must be operational');
  });

  it.each([
    ['/health', () => new Response('<html>Error</html>'), 'Production health and commit'],
    ['/upload', () => new Response(`<!-- git-sha: ${'b'.repeat(40)} -->`), 'HTML commit /upload'],
    ['/dashboard', () => new Response('', { status: 500 }), 'HTML commit /dashboard'],
    ['256t.us/health', () => new Response('Unavailable', { status: 503 }), 'Content domain health'],
    ['256t.us/health', () => new Response('<title>Wrong Worker</title>'), 'Content domain health'],
    ['/api/auth/session', () => json({}, 200), 'Missing session credentials'],
    ['/api/auth/session', () => json({ error: 'Wrong refusal' }, 401), 'Expected the documented refusal'],
    ['/api/webhooks/clerk', () => json({ error: 'Secret missing' }, 503), 'Unsigned Clerk webhook'],
    ['/api/payments/webhook', () => json({}, 200), 'Unsigned Stripe webhook'],
    ['/api/payments/calculate', () => json({}, 500), 'Public price calculation'],
    ['/api/nonexistent', () => new Response('Not found', { status: 404 }), 'Unknown API route'],
    ['256t.us/health', () => { throw new Error('Network unavailable'); }, 'Network unavailable'],
  ])('rejects failure at %s', async (path, response, message) => {
    await expect(verifyProduction(fixture({ [path]: response }))).rejects.toThrow(message);
  });

  it('reports independent failures together and still checks the remaining endpoints', async () => {
    const options = fixture({
      '256t.us/health': () => new Response('', { status: 503 }),
      '/api/webhooks/clerk': () => json({}, 503),
    });
    await expect(verifyProduction(options)).rejects.toThrow('failed (2 checks)');
    expect(options.fetchImpl).toHaveBeenCalledTimes(13);
  });

  it('allows scheduled verification to compare pages to the live commit', async () => {
    await expect(verifyProduction({ ...fixture(), expectedSha: undefined })).resolves.toBe(sha);
  });
});

describe('hosted origin checklist', () => {
  function hostedFetch(headerOverrides = {}) {
    return vi.fn(async url => new Response(
      url.endsWith('/health') ? 'Not found' : 'This domain runs code for apps that use HashBin', {
        status: url.endsWith('/health') ? 404 : 200,
        headers: {
          'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
          'cross-origin-resource-policy': 'same-origin',
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'cache-control': 'no-store', ...headerOverrides,
        },
      },
    ));
  }

  it('accepts hardened responses and refuses redirects', async () => {
    const fetchImpl = hostedFetch();
    await verifyHostedRunOrigin({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchImpl.mock.calls) expect(options.redirect).toBe('error');
  });

  it.each([
    { 'set-cookie': 'session=bad' },
    { 'referrer-policy': 'unsafe-url' },
    { 'cross-origin-resource-policy': 'cross-origin' },
  ])('rejects unsafe hosted response headers %j', async headers => {
    await expect(verifyHostedRunOrigin({ fetchImpl: hostedFetch(headers) })).rejects.toThrow();
  });
});
