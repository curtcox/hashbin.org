module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  settings: {
    node: {
      version: '>=18.0.0',
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
    
    // General best practices
    'no-console': 'off', // Console is acceptable in Workers
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
