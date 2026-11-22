/**
 * The deployed commit. src/index.js holds it as BUNDLED_GIT_SHA, which
 * scripts/inject-git-sha-code.sh rewrites at deploy time, and hands it here on load
 * so the modules that report it don't import the Worker entry point.
 */

const PLACEHOLDER = '__DEPLOY_GIT_SHA__';
let bundledGitSha = '';

/**
 * Records the commit embedded at build time. The un-replaced placeholder counts as none.
 * @param {string} sha - BUNDLED_GIT_SHA from src/index.js
 */
export function setBundledGitSha(sha) {
  bundledGitSha = sha && sha !== PLACEHOLDER ? sha : '';
}

/**
 * The commit to report: the bundled value, else the GIT_SHA secret, else 'unknown'.
 * @param {object} env - Worker environment
 * @returns {{sha: string, present: boolean}} present is false when neither source is set
 */
export function gitShaInfo(env) {
  const sha = bundledGitSha || env.GIT_SHA || '';
  return { sha: sha || 'unknown', present: Boolean(sha) };
}
