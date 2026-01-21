module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:security/recommended',
    'plugin:node/recommended',
  ],
  plugins: ['security', 'no-unsanitized'],
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
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'warn',
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',
    
    // Node.js specific
    'node/no-missing-import': 'off', // Using ES modules
    'node/no-unsupported-features/es-syntax': 'off', // We're using modern ES syntax
    'node/shebang': 'off', // Not all JS files need shebangs
    
    // General best practices
    'no-console': 'off', // Console is acceptable in Workers
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['scripts/**/*.sh'],
      rules: {
        'node/no-missing-import': 'off',
        'node/no-unpublished-import': 'off',
      },
    },
  ],
};
