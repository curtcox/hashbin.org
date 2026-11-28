import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

it('pins the minified, immutable DBA v1.4.0 SDK used by browser sessions', () => {
  const source = readFileSync('frontend/js/dba-sdk.js');
  expect(source.length).toBeLessThanOrEqual(32 * 1024);
  expect(createHash('sha384').update(source).digest('base64')).toBe('H1X1cYF3cNgArThXj3qLUlV12dkB+OBMqTM1pVx5aYjaxsjarR0i1CzRMM08F1Gm');
});
