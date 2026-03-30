import { describe, expect, it } from 'vitest';
import worker from './index.js';

describe('Developers route', () => {
  it('serves developers index for /developers', async () => {
    const env = {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === '/developers/index.html') {
            return new Response('<html><body>Developers Console</body></html>', {
              headers: { 'content-type': 'text/html' }
            });
          }
          return new Response('Not Found', { status: 404 });
        }
      }
    };

    const response = await worker.fetch(new Request('https://hashbin.test/developers'), env, {});

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Developers Console');
  });
});
