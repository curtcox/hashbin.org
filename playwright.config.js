import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HashBin.org frontend E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './frontend/tests',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || 'http://localhost:8787',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Use a preinstalled Chromium when PLAYWRIGHT_CHROMIUM_PATH is set (e.g. sandboxes) */
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },

  /* Chromium by default; set E2E_ALL_BROWSERS=1 for Firefox, WebKit, and mobile too */
  projects: process.env.E2E_ALL_BROWSERS
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
        { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } }
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /* Run your local dev server before starting the tests */
  /* Fully local mode: local auth, no Clerk or Stripe. Reuses a server already on :8787. */
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev:local',
    url: 'http://localhost:8787/health',
    reuseExistingServer: true,
    timeout: 120 * 1000, // 2 minutes
  },
});
