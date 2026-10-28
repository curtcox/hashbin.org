module.exports = {
  // ESLint 8 cannot parse JSON import attributes (`import x from './y.json' with { type: 'json' }`).
  ignorePatterns: ['src/app-safety.js', 'workers/run-origin/src/index.js', 'frontend/sdk/v*/'],
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
      // Static pages and the browser SDK run in browsers, not Node.
      files: ['frontend/**/*.js'],
      env: { browser: true, worker: true, node: false },
      rules: {
        'node/no-missing-import': 'off',
        'node/no-unsupported-features/es-syntax': 'off',
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
