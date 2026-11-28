// Pin the official immutable SDK; minification keeps this separate browser asset below 32 KiB.
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const version = '1.4.0';
const integrity = 'sha384-eXGylIi43P3d1n2HQcoqZ6aaqj0BzMs4UdwXhfMxwro2LrnZsJtc1OmB4eM+VV93';
const response = await fetch(`https://devicebasedauth.org/sdk/v${version}/dba.js`);
if (!response.ok) throw new Error(`SDK download: HTTP ${response.status}`);
const source = await response.text();
if (`sha384-${createHash('sha384').update(source).digest('base64')}` !== integrity) throw new Error('SDK integrity mismatch');
const { code } = await transform(source, { minify: true, legalComments: 'none', format: 'esm', target: 'es2022' });
writeFileSync('frontend/js/dba-sdk.js', `// devicebasedauth.org SDK v${version}, MIT. Pinned and minified by scripts/vendor-dba-sdk.mjs.\n${code}`);
