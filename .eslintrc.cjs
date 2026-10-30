module.exports = {
  // ESLint 8 cannot parse JSON import attributes (`import x from './y.json' with { type: 'json' }`).
  // The diagram editor is ported page code kept in step with curtcox/modl, not this repo's style.
  ignorePatterns: ['src/app-safety.js', 'workers/run-origin/src/index.js', 'frontend/sdk/v*/', 'scripts/reports/pages/diagram-oauth.js'],
  env: {
    es2022: true,
    node: true,
  },
  settings: {
    node: {
      version: '>=22.0.0',
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:promise/recommended',
    'plugin:node/recommended',
    'plugin:jsdoc/recommended',
  ],
  plugins: ['security', 'no-unsanitized', 'promise', 'node', 'jsdoc'],
  // Worktrees live under .claude/worktrees/ inside the main checkout; don't merge its config too.
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'warn',
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',
    'jsdoc/require-jsdoc': 'off',
    'jsdoc/require-param': 'off',
    'jsdoc/require-returns': 'off',
    'jsdoc/require-returns-description': 'off',
    'jsdoc/check-types': 'off',
    
    // The package is private, so devDependency imports are fine everywhere.
    'node/no-unpublished-import': 'off',
    'node/shebang': 'off',
    // `.then(onFulfilled, onRejected)` handles rejection; side-effect callbacks need not return.
    'promise/catch-or-return': ['error', { allowThen: true }],
    'promise/always-return': 'off',

    // General best practices
    'no-console': 'off', // Console is acceptable in Workers
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Static pages, the GitHub Pages helpers and the browser SDK run in browsers, not Node.
      files: ['frontend/**/*.js', 'scripts/reports/pages/**/*.js'],
      env: { browser: true, worker: true, node: false },
      rules: {
        'node/no-missing-import': 'off',
        'node/no-unsupported-features/es-syntax': 'off',
        // Values passed through escapeHtml (frontend/js/html.js) are safe to interpolate.
        'no-unsanitized/property': ['error', { escape: { methods: ['escapeHtml'] } }],
        'no-unsanitized/method': ['error', { escape: { methods: ['escapeHtml'] } }],
      },
    },
    {
      // Cloudflare Workers expose service-worker globals such as `caches`.
      files: ['src/**/*.js', 'workers/**/*.js'],
      env: { serviceworker: true },
      globals: { scheduler: 'readonly' },
    },
    {
      // Code that runs in a page: the run-origin bootstrap and Playwright `page.evaluate` bodies.
      files: ['workers/run-origin/src/bootstrap.js', 'scripts/measure-hosted-run-origin.mjs'],
      env: { browser: true },
    },
    {
      // The SDK validates that names contain no control characters.
      files: ['frontend/sdk/**/*.js'],
      rules: { 'no-control-regex': 'off' },
    },
    {
      // hashbinSandbox.import() loads fetched code inside the sandbox worker on purpose (always a
      // blob: URL). The file must stay byte-identical to the latest sdk/v*/ release, so it can't
      // carry an inline disable comment; this skips only the import() check.
      files: ['frontend/sdk/hashbin.js'],
      rules: {
        'no-unsanitized/method': ['error', { escape: { methods: ['escapeHtml'] } }, { import: { properties: [] } }],
      },
    },
    {
      files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
      rules: { 'no-process-exit': 'off' },
    },
    {
      files: ['**/*.test.js'],
      rules: {
        'node/no-unpublished-import': 'off',
        'node/no-unsupported-features/es-syntax': 'off',
        'node/no-unsupported-features/node-builtins': 'off',
        // Tests exercise eval-like inputs on purpose (inline scripts, javascript: URLs).
        'no-new-func': 'off',
        'no-script-url': 'off',
      },
    },
  ],
};
