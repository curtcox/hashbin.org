# Build report on GitHub Pages

`.github/workflows/build-report.yml` runs on every push to `main` (and on manual dispatch),
builds an HTML report into `build-reports/` and publishes it to GitHub Pages at
`https://curtcox.github.io/hashbin.org/`. Findings are warnings: the report never fails a
build or blocks a deploy, and many of its steps use `continue-on-error`.

The report covers unit-test coverage, unit and local API test results, `npm audit` and ESLint
security findings, API performance, lint, complexity, module structure, JSDoc coverage, visual
regression screenshots and trends across runs. The index page links each section and
`problems.txt` lists the warnings in plain text. What each section measures, and how to build
one locally, is in [`scripts/README.md`](../scripts/README.md#build-report).

## Setup

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow
uses `actions/upload-pages-artifact` and `actions/deploy-pages` with the `github-pages`
environment, needs `pages: write` and `id-token: write` on its deploy job, and uses no secrets.

## Behavior

- Each run replaces the previous report; only the latest is published.
- Trends are the exception: `scripts/trends/update-trends.sh` downloads the published
  `trends/data.json`, appends this run and republishes it, so history survives as long as the
  Pages site does.
- Links to Actions runs need access to the repository.

## Troubleshooting

- **404 or no site:** check that Pages' source is GitHub Actions and that the
  `deploy-pages` job of the latest run succeeded; the first deploy can take a few minutes.
- **A section is empty:** its step failed silently (`continue-on-error`); open that step's log
  in the run.
