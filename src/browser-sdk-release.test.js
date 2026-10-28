import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('immutable browser SDK release', () => {
  it('has the documented SRI checksum and no mutable module dependencies', () => {
    const source = readFileSync(new URL('../frontend/sdk/v0.2.0/hashbin.js', import.meta.url), 'utf8');
    const manifest = JSON.parse(readFileSync(new URL('../frontend/sdk/v0.2.0/integrity.json', import.meta.url), 'utf8'));
    const integrity = `sha384-${createHash('sha384').update(source).digest('base64')}`;
    expect(manifest.integrity).toBe(integrity);
    expect(source).not.toMatch(/^import\s/m);
    expect(readFileSync(new URL('../frontend/docs/sdk.html', import.meta.url), 'utf8')).toContain(`integrity="${integrity}"`);
    expect(readFileSync(new URL('../frontend/_headers', import.meta.url), 'utf8')).toContain('Cache-Control: public, max-age=31536000, immutable');
  });
});
