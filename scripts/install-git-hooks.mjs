#!/usr/bin/env node
/**
 * Points git at the repository's .githooks directory. Runs from `npm install` (the `prepare`
 * script), so it must never fail the install: outside a git checkout, or when the clone
 * already uses a different hooks directory, it explains and exits successfully.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const HOOKS_PATH = '.githooks';

/**
 * Decides what to do given the clone's current local core.hooksPath.
 * @param {{insideWorkTree: boolean, current: string}} state
 * @returns {'skip-no-git' | 'already' | 'keep-custom' | 'install'}
 */
export function planInstall({ insideWorkTree, current }) {
  if (!insideWorkTree) return 'skip-no-git';
  if (current === HOOKS_PATH) return 'already';
  if (current) return 'keep-custom';
  return 'install';
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function main() {
  const action = planInstall({
    insideWorkTree: git(['rev-parse', '--is-inside-work-tree']) === 'true',
    current: git(['config', '--local', '--get', 'core.hooksPath']),
  });
  if (action === 'install') {
    git(['config', '--local', 'core.hooksPath', HOOKS_PATH]);
    console.log(`Git hooks enabled from ${HOOKS_PATH}/ (pre-push file size check).`);
  } else if (action === 'keep-custom') {
    console.warn(`core.hooksPath is already set for this clone; leaving it. To use the repository hooks: git config core.hooksPath ${HOOKS_PATH}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
