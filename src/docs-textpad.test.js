import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate256tHash } from './utils/hash256t.js';

const appHtml = readFileSync(new URL('../frontend/docs/textpad/app.html', import.meta.url), 'utf8');
const docHtml = readFileSync(new URL('../frontend/docs/textpad.html', import.meta.url), 'utf8');

// The app's script, de-indented the same way the doc page's excerpts are.
const appScript = appHtml
  .split('\n')
  .map((line) => (line.startsWith('    ') ? line.slice(4) : line))
  .join('\n');

function unescapeHtml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Loads named top-level functions from the app's script so they can be tested
// without a browser.
function loadAppFunctions(names) {
  const sources = names.map((name) => {
    const match = appScript.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'));
    if (!match) throw new Error(`function ${name} not found in app.html`);
    return match[0];
  });
  return new Function(`${sources.join('\n')}\nreturn { ${names.join(', ')} };`)();
}

describe('Textpad docs', () => {
  it('quotes the app source exactly in every excerpt', () => {
    const excerpts = [...docHtml.matchAll(/<pre><code class="excerpt">([\s\S]*?)<\/code><\/pre>/g)]
      .map((match) => unescapeHtml(match[1]));

    expect(excerpts.length).toBeGreaterThan(5);
    for (const excerpt of excerpts) {
      expect(appScript, 'Run python3 scripts/docs/generate-textpad-doc.py').toContain(excerpt);
    }
  });

  it('has a real client ID configured', () => {
    expect(appHtml).not.toContain('app_REPLACE_WITH_CLIENT_ID');
    expect(appHtml).toMatch(/let CLIENT_ID = "app_[0-9a-f-]{36}";/);
  });
});

describe('Textpad 256t handling', () => {
  const { isValid256t, base64UrlToBytes } = loadAppFunctions(['base64UrlToBytes', 'contentLength', 'isValid256t']);
  const { decodeText } = loadAppFunctions(['decodeText']);

  it('accepts 256t strings for empty, inline and hashed content', async () => {
    for (const size of [0, 1, 2, 3, 63, 64, 65, 1000]) {
      const cid = await generate256tHash(new Uint8Array(size).fill(65));
      expect(isValid256t(cid), `size ${size}`).toBe(true);
    }
  });

  it('rejects malformed, truncated and padded 256t strings', async () => {
    const inline = await generate256tHash(new TextEncoder().encode('Hello from Textpad!'));
    const hashed = await generate256tHash(new Uint8Array(500));

    expect(isValid256t('not-a-real-256t-string')).toBe(false);
    expect(isValid256t('abc%zz')).toBe(false);
    expect(isValid256t(inline.slice(0, -1))).toBe(false);
    expect(isValid256t(`${inline}A`)).toBe(false);
    expect(isValid256t(hashed.slice(0, -2))).toBe(false);
    expect(isValid256t(`${hashed.slice(0, 20)}+${hashed.slice(21)}`)).toBe(false);
  });

  it('reads inline content straight from the 256t string', async () => {
    const text = 'Hello from Textpad! é 中 😀';
    const cid = await generate256tHash(new TextEncoder().encode(text));
    expect(decodeText(base64UrlToBytes(cid.slice(8)))).toBe(text);
  });

  it('refuses content that is not text', () => {
    expect(() => decodeText(new Uint8Array([0xff, 0xfe, 0x00, 0x01]))).toThrow();
    expect(() => decodeText(new TextEncoder().encode('binary\0data'))).toThrow();
  });

  it('keeps a byte order mark so unchanged text saves to the same bytes', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(new TextEncoder().encode(decodeText(bytes))).toEqual(bytes);
  });
});
