/**
 * Guards against frontend pages importing names a module doesn't export.
 * A bad named import makes the browser reject the whole module script, so the
 * page silently loses all of its JavaScript.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : walk(path);
    return /\.(html|js)$/.test(name) && !name.endsWith('.test.js') ? [path] : [];
  });
}

function exportedNames(path) {
  const source = readFileSync(path, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
}

describe('frontend module imports', () => {
  it('only imports names that the target module exports', () => {
    const problems = [];
    for (const file of walk(FRONTEND)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[2];
        if (/^https?:/.test(specifier)) continue;
        const target = specifier.startsWith('/')
          ? join(FRONTEND, specifier)
          : normalize(join(dirname(file), specifier));
        const relative = file.slice(FRONTEND.length);
        if (!existsSync(target)) {
          problems.push(`${relative}: missing module ${specifier}`);
          continue;
        }
        const exported = exportedNames(target);
        for (const part of match[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0];
          if (name && !exported.has(name)) problems.push(`${relative}: ${name} is not exported by ${specifier}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
