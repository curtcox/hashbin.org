import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_HOSTS, safetyFetch } from './app-safety.js';

describe('app safety check fetch', () => {
  it('reads this site\'s pages from static assets, following their redirects', async () => {
    const seen = [];
    const env = { ASSETS: { fetch: async request => {
      seen.push(request.url);
      return request.url.endsWith('.html')
        ? new Response(null, { status: 307, headers: { location: '/docs/textpad/app' } })
        : new Response('<html>', { headers: { 'content-security-policy': "script-src 'self'" } });
    } } };
    const network = async () => { throw new Error('a site page went to the network'); };
    const response = await safetyFetch(env, network)('https://www.hashbin.org/docs/textpad/app.html', { headers: { accept: 'text/html' } });
    expect(await response.text()).toBe('<html>');
    expect(response.headers.get('content-security-policy')).toBe("script-src 'self'");
    expect(seen).toEqual(['https://www.hashbin.org/docs/textpad/app.html', 'https://www.hashbin.org/docs/textpad/app']);
  });

  it('fetches other sites over the network', async () => {
    const calls = [];
    const env = { ASSETS: { fetch: async () => { throw new Error('assets used for another site'); } } };
    await safetyFetch(env, async (url, init) => { calls.push([url, init.redirect]); return new Response('ok'); })('https://someone.github.io/app/', { redirect: 'follow' });
    expect(calls).toEqual([['https://someone.github.io/app/', 'follow']]);
  });

  it('knows every host the Worker is routed on', () => {
    const routes = [...readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8').matchAll(/pattern\s*=\s*"([^/"]+)\/\*"/g)].map(match => match[1]);
    expect(SITE_HOSTS).toEqual(routes);
  });
});
