#!/usr/bin/env node
/**
 * Writes the route index in docs/API.md from API_ROUTES in src/index.js, so the reference
 * lists every route and the access it declares. src/docs-api-routes.test.js fails if the
 * index drifts.
 *
 * Usage: node scripts/docs/generate-api-route-index.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRoutes } from '../../src/index.js';

export const API_DOC = fileURLToPath(new URL('../../docs/API.md', import.meta.url));
export const BEGIN = '<!-- BEGIN GENERATED ROUTE INDEX: node scripts/docs/generate-api-route-index.mjs -->';
export const END = '<!-- END GENERATED ROUTE INDEX -->';

const ACCESS_LABELS = { public: 'public', session: 'account session', 'admin-session': 'admin session' };

// A path pattern as readable text: /^\/api\/content\/([^/]+)$/ becomes /api/content/{id}
function pathText(path) {
  if (typeof path === 'string') return path;
  return path.source
    .replace(/^\^|\$$/g, '')
    .replace(/\\\//g, '/')
    .replace(/\(\[\^\/\]\+\)|\[\^\/\]\+/g, '{id}')
    .replace(/\(([^()]+)\)/g, '{$1}');
}

function accessText(access) {
  const scopes = Array.isArray(access) ? access : [access];
  return scopes.map(scope => ACCESS_LABELS[scope] ?? `\`${scope}\``).join(' or ');
}

/**
 * Render the route index table for the given routes.
 * @param {Array<{method: string|string[], path: string|RegExp, access: string|string[]}>} routes - Entries shaped like API_ROUTES
 * @returns {string} Markdown between the BEGIN and END markers
 */
export function renderRouteIndex(routes) {
  const rows = routes.map(route => {
    const methods = Array.isArray(route.method) ? route.method.join(', ') : route.method;
    return `| ${methods} | \`${pathText(route.path).replace(/\|/g, '\\|')}\` | ${accessText(route.access)} |`;
  });
  return [BEGIN, '', '| Method | Path | Access |', '|--------|------|--------|', ...rows, '', END].join('\n');
}

/**
 * Replace the generated section of an API.md text.
 * @param {string} doc - The current docs/API.md text
 * @param {string} index - Output of renderRouteIndex
 * @returns {string} The text with the section between the markers replaced
 */
export function withRouteIndex(doc, index) {
  const start = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);
  if (start < 0 || end < start) throw new Error(`docs/API.md is missing the ${BEGIN} … ${END} markers`);
  return doc.slice(0, start) + index + doc.slice(end + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = readFileSync(API_DOC, 'utf8');
  writeFileSync(API_DOC, withRouteIndex(doc, renderRouteIndex(apiRoutes())));
  console.log(`Wrote ${apiRoutes().length} routes to docs/API.md`);
}
