import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/tests', testMatch: 'dom-sandbox.spec.js',
  timeout: 30000, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8792' },
  projects: ['chromium', 'webkit'].map(name => ({
    name, use: { ...devices[name === 'chromium' ? 'Desktop Chrome' : 'Desktop Safari'] }
  })),
  webServer: { command: 'node scripts/dom-sandbox-test-server.mjs', url: 'http://127.0.0.1:8792/index.html', reuseExistingServer: false }
});
