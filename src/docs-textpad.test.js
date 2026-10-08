import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate256tHash } from './utils/hash256t.js';

const appHtml = readFileSync(new URL('../frontend/docs/textpad/app.html', import.meta.url), 'utf8');

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

// Each walkthrough page and the folder its code comes from.
const PAGES = [
  ['frontend/docs/textpad.html', 'frontend/docs/textpad'],
  ['frontend/docs/textpad-expo.html', 'examples/textpad-expo'],
  ['frontend/docs/textpad-flutter.html', 'examples/textpad-flutter']
];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The generator strips an excerpt's indentation; put some back.
function indent(text, spaces) {
  return text.split('\n').map((line) => (line ? ' '.repeat(spaces) + line : line)).join('\n');
}

describe('Textpad docs', () => {
  for (const [page, folder] of PAGES) {
    const pageHtml = read(page);

    it(`${page} quotes its app exactly`, () => {
      const excerpts = [...pageHtml.matchAll(/<pre><code class="excerpt" data-file="([^"]*)">([\s\S]*?)<\/code><\/pre>/g)];
      expect(excerpts.length).toBeGreaterThan(5);
      for (const [, file, code] of excerpts) {
        const source = read(`${folder}/${file}`);
        const excerpt = unescapeHtml(code);
        expect(
          [0, 2, 4, 6, 8, 10, 12].some((spaces) => source.includes(indent(excerpt, spaces))),
          `${file}: ${excerpt.split('\n')[0]} (run python3 scripts/docs/generate-textpad-docs.py)`
        ).toBe(true);
      }

      for (const [, file, code] of pageHtml.matchAll(/<code class="source" data-file="([^"]*)">([\s\S]*?)<\/code>/g)) {
        expect(unescapeHtml(code) === read(`${folder}/${file}`), `${file} (run python3 scripts/docs/generate-textpad-docs.py)`).toBe(true);
      }
    });
  }

  it('has a real client ID configured in every version', () => {
    expect(appHtml).toMatch(/let CLIENT_ID = "app_[0-9a-f-]{36}";/);
    expect(read('examples/textpad-expo/App.js')).toMatch(/\|\| "app_[0-9a-f-]{36}";/);
    expect(read('examples/textpad-flutter/lib/main.dart')).toMatch(/defaultValue: 'app_[0-9a-f-]{36}'/);
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
