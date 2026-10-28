import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from './index.js';
import { API_DOC, renderRouteIndex, withRouteIndex } from '../scripts/docs/generate-api-route-index.mjs';

describe('docs/API.md route index', () => {
  it('lists every route in API_ROUTES with its declared access', () => {
    const doc = readFileSync(API_DOC, 'utf8');
    // Run `node scripts/docs/generate-api-route-index.mjs` after changing API_ROUTES.
    expect(withRouteIndex(doc, renderRouteIndex(apiRoutes()))).toBe(doc);
  });

  it('renders pattern paths readably', () => {
    const index = renderRouteIndex([
      { method: ['GET', 'HEAD'], path: '/health', access: 'public' },
      { method: 'DELETE', path: /^\/api\/content\/([^/]+)$/, access: ['content:delete', 'admin:takedown'] },
    ]);
    expect(index).toContain('| GET, HEAD | `/health` | public |');
    expect(index).toContain('| DELETE | `/api/content/{id}` | `content:delete` or `admin:takedown` |');
  });
});
