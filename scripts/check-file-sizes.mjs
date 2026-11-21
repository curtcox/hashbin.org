#!/usr/bin/env node
/**
 * File size limits with a ratchet for files that were already too big.
 *
 *   node scripts/check-file-sizes.mjs                    check every tracked file (CI, unit tests)
 *   node scripts/check-file-sizes.mjs --update-baseline  lower or drop baseline entries after shrinking files
 *   node scripts/check-file-sizes.mjs --write-baseline   grandfather every current violation (only when adopting a new rule)
 *   node scripts/check-file-sizes.mjs --pre-push <remote> <url> < refs   (run by .githooks/pre-push)
 *
 * The baseline lists files that were over their limit when the rule arrived. A listed file
 * may never grow, and once it shrinks the baseline must be lowered to match, so the
 * allowance only ever moves down. The pre-push hook also checks every blob in the pushed
 * commits, because a big file committed and later deleted still stays in history.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const KIB = 1024;
const MIB = 1024 * KIB;

export const BASELINE_PATH = 'scripts/file-size-baseline.json';
const ZERO_SHA = /^0+$/;
const UPDATE_HINT = 'npm run check:file-sizes -- --update-baseline';

/** Paths never checked. Released SDKs are immutable copies of frontend/sdk/hashbin.js, which is checked. */
export const EXCLUDED = [/^frontend\/sdk\/v\d+\.\d+\.\d+\//];

/** First matching rule wins. `names` match the file name, `extensions` the lowercase extension. */
export const RULES = [
  { label: 'lockfile', limit: 1 * MIB, names: ['package-lock.json', 'pubspec.lock', 'yarn.lock', 'pnpm-lock.yaml'] },
  { label: 'source code', limit: 32 * KIB, extensions: ['.js', '.mjs', '.cjs', '.ts', '.py', '.sh', '.dart', '.swift', '.kt', '.kts', '.h'] },
  { label: 'markup and styles', limit: 64 * KIB, extensions: ['.html', '.css'] },
  { label: 'prose', limit: 48 * KIB, extensions: ['.md', '.org', '.txt'] },
  { label: 'data and config', limit: 64 * KIB, extensions: ['.json', '.yml', '.yaml', '.toml', '.xml', '.plist', '.pbxproj'] },
  { label: 'vector image', limit: 64 * KIB, extensions: ['.svg'] },
  { label: 'raster image', limit: 256 * KIB, extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico'] },
  { label: 'font', limit: 256 * KIB, extensions: ['.woff', '.woff2', '.ttf', '.otf'] },
];
export const DEFAULT_RULE = { label: 'other', limit: 128 * KIB };

/**
 * The rule that applies to a repository path, or null when the path is excluded.
 * @param {string} path
 * @returns {{label: string, limit: number} | null}
 */
export function ruleFor(path) {
  if (EXCLUDED.some((pattern) => pattern.test(path))) return null;
  const name = basename(path);
  const ext = extname(name).toLowerCase();
  return RULES.find((rule) => rule.names?.includes(name) || rule.extensions?.includes(ext)) || DEFAULT_RULE;
}

/**
 * Checks current file sizes against the limits and the baseline.
 * @param {Map<string, number>} sizes path -> bytes for every tracked file
 * @param {Record<string, number>} baseline path -> grandfathered bytes
 * @returns {{tooBig: object[], grew: object[], stale: object[]}}
 */
export function checkTree(sizes, baseline) {
  const tooBig = [];
  const grew = [];
  const stale = [];
  for (const [path, size] of sizes) {
    const rule = ruleFor(path);
    if (!rule || size <= rule.limit) continue;
    const allowed = baseline[path];
    if (allowed === undefined) tooBig.push({ path, size, limit: rule.limit, label: rule.label });
    else if (size > allowed) grew.push({ path, size, allowed, limit: rule.limit });
  }
  for (const [path, allowed] of Object.entries(baseline)) {
    const size = sizes.get(path);
    const rule = size === undefined ? null : ruleFor(path);
    if (!rule || size <= rule.limit) stale.push({ path, allowed, size, reason: size === undefined ? 'gone' : 'fixed' });
    else if (size < allowed) stale.push({ path, allowed, size, reason: 'shrank' });
  }
  return { tooBig, grew, stale };
}

/**
 * The baseline after recording shrinks: entries are lowered or removed, never added or raised.
 * @param {Map<string, number>} sizes
 * @param {Record<string, number>} baseline
 * @returns {Record<string, number>}
 */
export function tightenBaseline(sizes, baseline) {
  const next = {};
  for (const [path, allowed] of Object.entries(baseline)) {
    const size = sizes.get(path);
    const rule = size === undefined ? null : ruleFor(path);
    if (rule && size > rule.limit) next[path] = Math.min(size, allowed);
  }
  return sortKeys(next);
}

/**
 * A baseline that grandfathers every current violation at its current size.
 * @param {Map<string, number>} sizes
 * @returns {Record<string, number>}
 */
export function grandfatherAll(sizes) {
  const next = {};
  for (const [path, size] of sizes) {
    const rule = ruleFor(path);
    if (rule && size > rule.limit) next[path] = size;
  }
  return sortKeys(next);
}

/**
 * Baseline entries a push adds or raises compared with what the remote already has.
 * @param {Record<string, number>} before
 * @param {Record<string, number>} after
 * @returns {{path: string, before: number | undefined, after: number}[]}
 */
export function findLoosening(before, after) {
  return Object.entries(after)
    .filter(([path, size]) => before[path] === undefined || size > before[path])
    .map(([path, size]) => ({ path, before: before[path], after: size }));
}

/**
 * Blobs in pushed commits that exceed both their limit and any baseline allowance.
 * @param {{path: string, size: number}[]} blobs
 * @param {Record<string, number>[]} baselines baselines at the pushed tip and at the remote base
 * @returns {{path: string, size: number, limit: number, allowed: number | undefined}[]}
 */
export function checkBlobs(blobs, baselines) {
  const worst = new Map();
  for (const { path, size } of blobs) {
    const rule = ruleFor(path);
    if (!rule || size <= rule.limit) continue;
    const allowances = baselines.map((baseline) => baseline[path]).filter((value) => value !== undefined);
    const allowed = allowances.length ? Math.max(...allowances) : undefined;
    if (allowed !== undefined && size <= allowed) continue;
    if (!worst.has(path) || worst.get(path).size < size) worst.set(path, { path, size, limit: rule.limit, allowed });
  }
  return [...worst.values()];
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function formatBytes(bytes) {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MiB`;
  if (bytes >= KIB) return `${(bytes / KIB).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * MIB, ...options });
}

function parseBaseline(text) {
  const parsed = JSON.parse(text);
  return parsed.files || {};
}

function readBaselineFile() {
  try {
    return parseBaseline(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

/** The baseline committed at `sha`, or null when that commit predates the size check. */
function readBaselineAt(sha) {
  let text;
  try {
    text = git(['show', `${sha}:${BASELINE_PATH}`], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  return parseBaseline(text);
}

function writeBaseline(files) {
  const document = {
    comment: `Files over their size limit when the check arrived. They may not grow; after shrinking one, run: ${UPDATE_HINT}. See scripts/check-file-sizes.mjs.`,
    files,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(document, null, 2)}\n`);
}

/** Working-tree sizes of tracked files, so an edit can be checked before it is committed. */
function trackedSizes() {
  const sizes = new Map();
  for (const path of git(['ls-files', '-z']).split('\0')) {
    if (!path) continue;
    try {
      const stat = statSync(path);
      if (stat.isFile()) sizes.set(path, stat.size);
    } catch {
      // Deleted in the working tree but not yet staged.
    }
  }
  return sizes;
}

function reportTree({ tooBig, grew, stale }) {
  for (const item of tooBig) {
    console.error(`✗ ${item.path} is ${formatBytes(item.size)}; the ${item.label} limit is ${formatBytes(item.limit)}.`);
  }
  for (const item of grew) {
    console.error(`✗ ${item.path} grew to ${formatBytes(item.size)}; the ratchet allows ${item.allowed} bytes. Shrink it below that (limit ${formatBytes(item.limit)}).`);
  }
  for (const item of stale) {
    const now = item.reason === 'gone' ? 'is gone' : item.reason === 'fixed' ? 'is now within its limit' : `shrank to ${item.size} bytes`;
    console.error(`✗ ${item.path} ${now} (baseline ${item.allowed}). Lock in the improvement: ${UPDATE_HINT}`);
  }
}

function runTreeCheck() {
  const sizes = trackedSizes();
  const result = checkTree(sizes, readBaselineFile());
  const problems = result.tooBig.length + result.grew.length + result.stale.length;
  if (problems) {
    reportTree(result);
    if (result.tooBig.length) console.error('\nSplit or compress oversized files. Limits are in scripts/check-file-sizes.mjs.');
    return 1;
  }
  const ratcheted = Object.keys(readBaselineFile()).length;
  console.log(`✓ ${sizes.size} tracked files within size limits${ratcheted ? ` (${ratcheted} ratcheted in ${BASELINE_PATH})` : ''}.`);
  return 0;
}

function remoteDefaultSha(remote) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/HEAD`], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function blobsInRange(localSha, remoteSha) {
  const range = remoteSha ? [localSha, `^${remoteSha}`] : [localSha, '--not', '--remotes'];
  const objects = git(['rev-list', '--objects', ...range]);
  if (!objects.trim()) return [];
  const checked = git(['cat-file', '--batch-check=%(objecttype) %(objectsize) %(rest)'], { input: objects });
  const blobs = [];
  for (const line of checked.split('\n')) {
    const match = /^blob (\d+) (.+)$/.exec(line);
    if (match) blobs.push({ size: Number(match[1]), path: match[2] });
  }
  return blobs;
}

function exists(sha) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runPrePush(remote, input) {
  let failed = false;
  for (const line of input.split('\n')) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO_SHA.test(localSha)) continue; // Deleting a remote ref.
    const base = remoteSha && !ZERO_SHA.test(remoteSha) && exists(remoteSha) ? remoteSha : '';
    // A new branch is compared with the remote's default branch, where it will be merged.
    const baselineBase = base || remoteDefaultSha(remote);
    const tipBaseline = readBaselineAt(localSha) || {};
    // Without a baseline at the base, this push adopts the check; there is nothing to loosen.
    const baseBaseline = (baselineBase && readBaselineAt(baselineBase)) || tipBaseline;

    const blobs = checkBlobs(blobsInRange(localSha, base), [tipBaseline, baseBaseline]);
    for (const item of blobs) {
      const allowance = item.allowed === undefined ? `limit ${formatBytes(item.limit)}` : `ratchet allows ${item.allowed} bytes`;
      console.error(`✗ ${localRef}: ${item.path} is ${formatBytes(item.size)} in a pushed commit (${allowance}).`);
    }
    const loosened = findLoosening(baseBaseline, tipBaseline);
    for (const item of loosened) {
      const change = item.before === undefined ? `adds ${item.path}` : `raises ${item.path} from ${item.before} to ${item.after}`;
      console.error(`✗ ${localRef}: ${BASELINE_PATH} ${change}. The ratchet only moves down.`);
    }
    if (blobs.length || loosened.length) failed = true;
  }
  if (failed) {
    console.error('\nPush rejected by the file size check. Shrink the files (rewrite history if a big file was');
    console.error('committed and later removed). To override deliberately, push with --no-verify; CI still checks the tree.');
    return 1;
  }
  return 0;
}

function main(argv) {
  const [mode, ...rest] = argv;
  if (mode === '--pre-push') return runPrePush(rest[0] || 'origin', readFileSync(0, 'utf8'));
  if (mode === '--update-baseline') {
    const before = readBaselineFile();
    const after = tightenBaseline(trackedSizes(), before);
    writeBaseline(after);
    console.log(`Baseline tightened: ${Object.keys(before).length} → ${Object.keys(after).length} ratcheted files.`);
    return runTreeCheck();
  }
  if (mode === '--write-baseline') {
    const files = grandfatherAll(trackedSizes());
    writeBaseline(files);
    console.log(`Baseline written with ${Object.keys(files).length} grandfathered files.`);
    return 0;
  }
  if (mode && mode !== '--all') {
    console.error(`Unknown option ${mode}. See the header of scripts/check-file-sizes.mjs.`);
    return 2;
  }
  return runTreeCheck();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exitCode = main(process.argv.slice(2));
}
