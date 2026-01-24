/**
 * Vitest configuration for unit tests
 * Uses standard Node.js environment for simple unit tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/frontend/tests/**', // Exclude Playwright E2E tests
    ],
    coverage: {
      enabled: false, // No coverage targets per decision in plan
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
