import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(`../frontend/${path}`, import.meta.url));
const sri = source => `sha384-${createHash('sha384').update(source).digest('base64')}`;

describe('immutable browser SDK releases', () => {
  it('v0.2.0 keeps its documented SRI checksum and has no mutable module dependencies', () => {
    const source = read('sdk/v0.2.0/hashbin.js');
    expect(JSON.parse(read('sdk/v0.2.0/integrity.json')).integrity).toBe(sri(source));
    expect(source.toString()).not.toMatch(/^import\s/m);
    expect(read('_headers').toString()).toContain('/sdk/v0.2.0/*\n  Cache-Control: public, max-age=31536000, immutable');
  });

  it('v0.3.0 records SRI and SHA-256 for the page module and the service worker cache helper', () => {
    const manifest = JSON.parse(read('sdk/v0.3.0/integrity.json'));
    for (const file of ['hashbin.js', 'hashbin-cache.js']) {
      const source = read(`sdk/v0.3.0/${file}`);
      expect(manifest.files[file].integrity).toBe(sri(source));
      expect(manifest.files[file].sha256).toBe(createHash('sha256').update(source).digest('hex'));
      expect(source.toString()).not.toMatch(/^import\s/m);
    }
    expect(manifest.integrity).toBe(manifest.files['hashbin.js'].integrity);
    expect(read('_headers').toString()).toContain('/sdk/v0.3.0/*\n  Cache-Control: public, max-age=31536000, immutable');
  });

  it('v0.4.0 records hashes and immutable headers for hosted sandboxes', () => {
    const manifest = JSON.parse(read('sdk/v0.4.0/integrity.json'));
    for (const file of ['hashbin.js', 'hashbin-cache.js']) {
      const source = read(`sdk/v0.4.0/${file}`);
      expect(manifest.files[file].integrity).toBe(sri(source));
      expect(manifest.files[file].sha256).toBe(createHash('sha256').update(source).digest('hex'));
      expect(source.toString()).not.toMatch(/^import\s/m);
      expect(source).toEqual(read(`sdk/${file}`));
    }
    expect(read('docs/sdk.html').toString()).toContain(`integrity="${manifest.integrity}"`);
    expect(read('_headers').toString()).toContain('/sdk/v0.4.0/*\n  Cache-Control: public, max-age=31536000, immutable');
  });
});
