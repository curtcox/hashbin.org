import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const client = fileURLToPath(new URL('./validation/lib/http-client.sh', import.meta.url));
const shell = (source, ...args) => execFileSync('bash', ['-c', source, 'validation-test', client, ...args], { encoding: 'utf8' });

describe('deployment validation HTTP helpers', () => {
  it.each(['get', 'head', 'post', 'put', 'delete'])('measures %s using curl timing without GNU date', method => {
    const result = shell(`
      source "$1"
      date() { return 1; }
      curl() { printf '201 0.123456'; }
      "http_$2" https://validation.invalid '{}' > /dev/null
      printf '%s %s' "$HTTP_STATUS" "$HTTP_TIME_MS"
    `, method);
    expect(result).toBe('201 123');
  });

  it('preserves a transport failure as HTTP 000', () => {
    const result = shell(`
      source "$1"
      curl() { return 28; }
      http_get https://validation.invalid > /dev/null
      printf '%s' "$HTTP_STATUS"
    `);
    expect(result).toBe('000');
  });

  it('normalizes CRLF headers before comparing redirect destinations', () => {
    const result = shell('source "$1"; HTTP_HEADERS=$(printf "HTTP/2 307\\r\\nlocation: /\\r\\n"); get_header Location');
    expect(result).toBe('/\n');
  });

  it.each([
    [{ error: 'Calculation failed', message: 'Retention must be whole months, at most 120' }, false],
    [{ error: 'Invalid JSON', message: 'Expected property name at line 1' }, false],
    [{ error: 'stack trace unavailable' }, false],
    [{ error: 'Failure', stack: 'Error: failure' }, true],
    [{ error: 'Failure', message: 'Error\n    at calculate (pricing.js:12:8)' }, true],
    [{ error: 'Failure', message: 'pricing.js:12:8' }, true],
  ])('detects actual stack traces in %j', (body, expected) => {
    const result = shell('source "$1"; if has_stack_trace "$2"; then printf yes; else printf no; fi', JSON.stringify(body));
    expect(result).toBe(expected ? 'yes' : 'no');
  });
});
