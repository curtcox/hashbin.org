import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  checkBlobs,
  checkTree,
  findLoosening,
  grandfatherAll,
  ruleFor,
  tightenBaseline,
} from './check-file-sizes.mjs';
import { planInstall } from './install-git-hooks.mjs';

const SCRIPT = fileURLToPath(new URL('./check-file-sizes.mjs', import.meta.url));
const KIB = 1024;
const CODE_LIMIT = 32 * KIB;

describe('ruleFor', () => {
  it('picks limits by file type', () => {
    expect(ruleFor('src/index.js').limit).toBe(CODE_LIMIT);
    expect(ruleFor('docs/API.md').label).toBe('prose');
    expect(ruleFor('frontend/img/LOGO.PNG').label).toBe('raster image');
    expect(ruleFor('package-lock.json').label).toBe('lockfile');
    expect(ruleFor('examples/app/package-lock.json').label).toBe('lockfile');
    expect(ruleFor('frontend/_headers').label).toBe('other');
  });

  it('skips immutable SDK releases but checks the live SDK', () => {
    expect(ruleFor('frontend/sdk/v0.6.0/hashbin.js')).toBeNull();
    expect(ruleFor('frontend/sdk/hashbin.js').limit).toBe(CODE_LIMIT);
  });
});

describe('checkTree', () => {
  const big = CODE_LIMIT + 100;

  it('passes files within their limits', () => {
    expect(checkTree(new Map([['a.js', CODE_LIMIT]]), {})).toEqual({ tooBig: [], grew: [], stale: [] });
  });

  it('rejects a new oversized file', () => {
    const { tooBig } = checkTree(new Map([['a.js', big]]), {});
    expect(tooBig).toEqual([{ path: 'a.js', size: big, limit: CODE_LIMIT, label: 'source code' }]);
  });

  it('holds baselined files to their recorded size', () => {
    expect(checkTree(new Map([['a.js', big]]), { 'a.js': big }).grew).toEqual([]);
    expect(checkTree(new Map([['a.js', big + 1]]), { 'a.js': big }).grew).toHaveLength(1);
  });

  it('demands the baseline be lowered once a file shrinks, is fixed or is gone', () => {
    const baseline = { 'shrank.js': big, 'fixed.js': big, 'gone.js': big };
    const { stale } = checkTree(new Map([['shrank.js', big - 1], ['fixed.js', 10]]), baseline);
    expect(stale.map((item) => [item.path, item.reason])).toEqual([
      ['shrank.js', 'shrank'],
      ['fixed.js', 'fixed'],
      ['gone.js', 'gone'],
    ]);
  });
});

describe('baseline maintenance', () => {
  it('tightens without ever adding or raising entries', () => {
    const sizes = new Map([['shrank.js', 40_000], ['grew.js', 50_000], ['fixed.js', 5], ['new.js', 90_000]]);
    const baseline = { 'shrank.js': 45_000, 'grew.js': 40_000, 'fixed.js': 40_000, 'gone.js': 40_000 };
    expect(tightenBaseline(sizes, baseline)).toEqual({ 'grew.js': 40_000, 'shrank.js': 40_000 });
  });

  it('grandfathers every current violation', () => {
    const sizes = new Map([['b.js', 40_000], ['a.md', 60_000], ['ok.js', 10], ['frontend/sdk/v1.0.0/x.js', 90_000]]);
    expect(grandfatherAll(sizes)).toEqual({ 'a.md': 60_000, 'b.js': 40_000 });
  });

  it('reports added and raised entries as loosening', () => {
    expect(findLoosening({ 'a.js': 40_000, 'b.js': 40_000 }, { 'a.js': 39_000, 'b.js': 41_000, 'c.js': 50_000 })).toEqual([
      { path: 'b.js', before: 40_000, after: 41_000 },
      { path: 'c.js', before: undefined, after: 50_000 },
    ]);
  });
});

describe('checkBlobs', () => {
  it('reports the largest oversized version of each path', () => {
    const blobs = [
      { path: 'a.png', size: 300 * KIB },
      { path: 'a.png', size: 400 * KIB },
      { path: 'small.png', size: 10 },
    ];
    expect(checkBlobs(blobs, [{}])).toEqual([{ path: 'a.png', size: 400 * KIB, limit: 256 * KIB, allowed: undefined }]);
  });

  it('allows baselined paths up to the larger of the tip and base allowances', () => {
    const blobs = [{ path: 'a.js', size: 45_000 }];
    expect(checkBlobs(blobs, [{ 'a.js': 40_000 }, { 'a.js': 45_000 }])).toEqual([]);
    expect(checkBlobs(blobs, [{ 'a.js': 40_000 }, { 'a.js': 40_000 }])).toHaveLength(1);
  });
});

describe('planInstall', () => {
  it('installs only into a git clone without its own hooks path', () => {
    expect(planInstall({ insideWorkTree: false, current: '' })).toBe('skip-no-git');
    expect(planInstall({ insideWorkTree: true, current: '' })).toBe('install');
    expect(planInstall({ insideWorkTree: true, current: '.githooks' })).toBe('already');
    expect(planInstall({ insideWorkTree: true, current: '.husky' })).toBe('keep-custom');
  });
});

describe('pre-push hook in a scratch repository', () => {
  let repo;
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
  const write = (path, content) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const prePush = (localSha, remoteSha) =>
    spawnSync('node', [SCRIPT, '--pre-push', 'origin', 'unused-url'], {
      cwd: repo,
      encoding: 'utf8',
      input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`,
    });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'file-size-check-'));
    git('init', '-q', '-b', 'main');
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('passes small changes and rejects a big file deleted again before the push', () => {
    write('src/a.js', 'ok');
    const base = commit('base');
    write('src/b.js', 'still ok');
    const small = commit('small');
    expect(prePush(small, base).status).toBe(0);

    write('big.png', Buffer.alloc(300 * KIB));
    commit('add big');
    rmSync(join(repo, 'big.png'));
    const removed = commit('remove big');
    const result = prePush(removed, base);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('big.png');
  });

  it('enforces the ratchet and refuses baseline loosening', () => {
    write('src/a.js', 'x'.repeat(CODE_LIMIT + 10));
    write(BASELINE_PATH, JSON.stringify({ files: { 'src/a.js': CODE_LIMIT + 10 } }));
    const base = commit('base');

    write('src/a.js', 'x'.repeat(CODE_LIMIT + 5));
    write(BASELINE_PATH, JSON.stringify({ files: { 'src/a.js': CODE_LIMIT + 5 } }));
    const shrunk = commit('shrink');
    expect(prePush(shrunk, base).status).toBe(0);

    write('src/a.js', 'x'.repeat(CODE_LIMIT + 20));
    const grown = commit('grow');
    expect(prePush(grown, shrunk).stderr).toContain('ratchet allows');

    write(BASELINE_PATH, JSON.stringify({ files: { 'src/a.js': CODE_LIMIT + 20 } }));
    const loosened = commit('loosen');
    const result = prePush(loosened, shrunk);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('only moves down');
  });

  it('lets the push that introduces the baseline grandfather existing files', () => {
    write('src/a.js', 'x'.repeat(CODE_LIMIT + 10));
    const base = commit('before the check');
    write(BASELINE_PATH, JSON.stringify({ files: { 'src/a.js': CODE_LIMIT + 10 } }));
    const adopted = commit('adopt');
    expect(prePush(adopted, base).status).toBe(0);
  });

  it('compares a new branch with the remote default branch', () => {
    write('src/a.js', 'ok');
    const base = commit('base');
    git('update-ref', 'refs/remotes/origin/main', base);
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    write('huge.mp4', Buffer.alloc(200 * KIB));
    const tip = commit('video');
    const result = prePush(tip, '0'.repeat(40));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('huge.mp4');
  });
});

describe('this repository', () => {
  it('stays within its file size limits and ratchet baseline', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
