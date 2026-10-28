import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const frontend = new URL('../frontend/', import.meta.url);
const read = path => readFileSync(new URL(path, frontend), 'utf8');
const notes = readdirSync(new URL('docs/security/', frontend)).filter(name => /^sn-\d{4}-\d{3}\.html$/.test(name));

// Site paths are served from frontend/ with or without .html, or as a directory index.
function resolves(href) {
  const path = href.replace(/[#?].*$/, '').replace(/^\//, '');
  return [path, path + '.html', path.replace(/\/?$/, '/index.html')].some(candidate => candidate && existsSync(new URL(candidate, frontend)));
}

describe('security notes', () => {
  const index = read('docs/security/index.html');

  it('lists every note page on the index, in order', () => {
    expect(notes.length).toBeGreaterThan(0);
    for (const name of notes) expect(index).toContain(`href="/docs/security/${name.replace('.html', '')}"`);
    const ids = [...index.matchAll(/<td>(?:<a [^>]*>)?(SN-\d{4}-\d{3})/g)].map(match => match[1]);
    expect(ids).toEqual([...ids].sort());
  });

  it('titles each note with its ID and links back to the index', () => {
    for (const name of notes) {
      const html = read('docs/security/' + name), id = name.replace('.html', '').toUpperCase();
      expect(html).toContain(`<h1>${id}:`);
      expect(html).toContain('href="/docs/security/"');
    }
  });

  it('resolves every local link from the notes, the index and the pages that link to them', () => {
    const pages = ['docs/security/index.html', ...notes.map(name => 'docs/security/' + name), 'docs/index.html', 'docs/browser-client-safety.html', 'docs/sdk.html', 'sitemap.html', 'developers.html'];
    for (const page of pages) {
      for (const [, href] of read(page).matchAll(/href="(\/[^"]*)"/g)) {
        if (href.startsWith('/css/') || href.startsWith('/js/') || href === '/') continue;
        expect(resolves(href), `${page} → ${href}`).toBe(true);
      }
    }
  });

  it('is linked from the docs index, sitemap, developer page, SDK guide and safety guide', () => {
    for (const page of ['docs/index.html', 'sitemap.html', 'developers.html', 'docs/sdk.html', 'docs/browser-client-safety.html']) {
      expect(read(page), page).toContain('href="/docs/security/"');
    }
  });
});
