# Git SHA verification

Every production deployment records its commit so CI and operators can confirm exactly what
is running on `hashbin.org`.

## Where the commit is recorded

| Place | How it gets there |
|-------|-------------------|
| `BUNDLED_GIT_SHA` in `src/index.js` | `scripts/inject-git-sha-code.sh <sha>` replaces the `__DEPLOY_GIT_SHA__` placeholder before deploy. Because the bundle changes every commit, Wrangler always uploads new code. |
| `GIT_SHA` Worker secret | The deploy workflow's "Configure GIT_SHA as secret" step; a fallback if the bundled value is missing. |
| `<!-- git-sha: <sha> -->` in every HTML file | `scripts/inject-git-sha.sh <sha>` writes it after the doctype (or at the top) of every `frontend/**/*.html` before deploy, and the workflow fails if any file lacks it. |
| HTML responses at request time | `withGitShaComment` in `src/index.js` rewrites the comment in served HTML and adds `x-git-sha` and `x-git-sha-present` headers. |
| `/health` | `gitSha` and `gitShaPresent` ([health.md](health.md)). |

`gitShaInfo` in `src/build-info.js` picks the bundled value, then the secret, then `'unknown'`
(with `gitShaPresent: false`). Local development leaves the placeholder in place, so it reports
`unknown`.

## Verification

- **Deploy CI** runs `npm run verify:production` with `EXPECTED_GIT_SHA` set to the pushed
  commit; it requires `/health` to report that full 40-character SHA and the home page to carry
  the matching comment.
- **Smoke tests** (`.github/workflows/smoke-test.yml`, every six hours) run the same checks
  without an expected SHA: the health SHA must be a full commit and the HTML must match it.
- **By hand:**

  ```bash
  curl -s https://hashbin.org/health | jq -r .gitSha
  curl -sI https://hashbin.org/ | grep -i x-git-sha
  EXPECTED_GIT_SHA=$(git rev-parse origin/main) npm run verify:production
  ```

`npm run test:gitsha` runs `scripts/test-git-sha-injection.sh`, which checks the HTML injection
script (with and without a doctype, replacing an old comment, never duplicating it).

## Troubleshooting

- **`gitSha` is `unknown`:** neither the source injection nor the secret step ran. Check the
  "Inject git SHA into worker source code" and "Configure GIT_SHA as secret" steps in the run.
- **The SHA is an older commit:** another deployment may have finished after yours, or the
  deploy failed after an earlier one succeeded. Compare with the latest successful run of
  `deploy.yml`.
- **HTML comment and health disagree:** the HTML is rewritten from the same value at request
  time, so a mismatch usually means a cached response; purge the cache
  (`scripts/purge-cloudflare-cache.sh` or the purge workflow) and check again.
