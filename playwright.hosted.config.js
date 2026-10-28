import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/tests', testMatch: 'hosted-sandbox.spec.js',
  timeout: 30000, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8789' },
  projects: ['chromium', 'webkit', ...(process.env.H5_INCLUDE_FIREFOX ? ['firefox'] : [])].map(name => ({
    name, use: { ...devices[{ chromium: 'Desktop Chrome', webkit: 'Desktop Safari', firefox: 'Desktop Firefox' }[name]],
      launchOptions: {
        ...(process.env[`H5_${name.toUpperCase()}_PATH`] ? { executablePath: process.env[`H5_${name.toUpperCase()}_PATH`] } : {}),
        ...(name === 'chromium' ? { args: ['--disable-features='] } : {})
      }
    }
  })),
  webServer: { command: 'node scripts/hosted-run-test-server.mjs', url: 'http://127.0.0.1:8789', reuseExistingServer: false }
});
