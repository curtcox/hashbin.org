/**
 * Vitest configuration for unit tests
 * Uses standard Node.js environment for simple unit tests
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const expoStubs = fileURLToPath(new URL('./test-utils/expo-stubs.js', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The Expo example app's modules only run inside React Native.
    alias: {
      'expo-crypto': expoStubs,
      'expo-secure-store': expoStubs,
      'expo-web-browser': expoStubs,
    },
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
