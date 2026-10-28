import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as worker from './index.js';

function boundClasses(config) {
  const toml = readFileSync(new URL(`../${config}`, import.meta.url), 'utf8');
  return [...toml.matchAll(/^class_name = "(\w+)"/gm)].map(match => match[1]).sort();
}

// Durable Object classes are the exported classes; the default export is the fetch/scheduled handler.
const exportedClasses = Object.entries(worker)
  .filter(([name, value]) => name !== 'default' && typeof value === 'function' && /^class\b/.test(value.toString()))
  .map(([name]) => name)
  .sort();

describe('Durable Object bindings', () => {
  it('binds every exported Durable Object class in wrangler.toml', () => {
    expect(boundClasses('wrangler.toml')).toEqual(exportedClasses);
  });

  it('binds the same classes locally as in production', () => {
    expect(boundClasses('wrangler.local.toml')).toEqual(boundClasses('wrangler.toml'));
  });
});
