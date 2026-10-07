import { describe, expect, it } from 'vitest';
import worker from './index.js';

// Mimics the Workers assets binding: "/x.html" redirects to its canonical "/x"
const env = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname.endsWith('.html')) {
        return new Response(null, { status: 307, headers: { location: pathname.slice(0, -5) } });
      }
      if (pathname === '/dashboard/uploads/detail') {
        return new Response('<html><body>Upload detail</body></html>', { headers: { 'content-type': 'text/html' } });
      }
      if (pathname === '/dashboard/suppliers/detail') {
        return new Response('<html><body>Supplier detail</body></html>', { headers: { 'content-type': 'text/html' } });
      }
      return new Response('Not Found', { status: 404 });
    }
  }
};

describe('detail page routes', () => {
  it('serves the upload detail page at /dashboard/uploads/{cid}/ without redirecting', async () => {
    const response = await worker.fetch(new Request('https://hashbin.test/dashboard/uploads/AAAAAAAAabcdef/'), env, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Upload detail');
  });

  it('serves the supplier detail page at /dashboard/suppliers/{id}', async () => {
    const response = await worker.fetch(new Request('https://hashbin.test/dashboard/suppliers/sup_123'), env, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Supplier detail');
  });
});
