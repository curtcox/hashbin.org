import { describe, expect, it } from 'vitest';
import worker from './index.js';

describe('SDK route', () => {
  it('serves the hosted sdk asset', async () => {
    const env = {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === '/sdk/hashbin.js') {
            return new Response('window.hashbin = {};', {
              headers: { 'content-type': 'application/javascript' }
            });
          }
          return new Response('Not Found', { status: 404 });
        }
      }
    };

    const response = await worker.fetch(new Request('https://hashbin.test/sdk/hashbin.js'), env, {});

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/javascript');
  });
});
