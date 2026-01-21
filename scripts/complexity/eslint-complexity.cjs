module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['sonarjs'],
  rules: {
    complexity: ['warn', 10],
    'sonarjs/cognitive-complexity': ['warn', 15],
  },
};
