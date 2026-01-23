/**
 * Vitest configuration for unit tests
 * Uses standard Node.js environment for simple unit tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      enabled: false, // No coverage targets per decision in plan
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
