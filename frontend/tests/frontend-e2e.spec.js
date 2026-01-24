/**
 * Frontend E2E Tests
 * 
 * Basic smoke tests for the HashBin.org frontend UI.
 * These tests verify that key pages load and critical functionality works.
 * 
 * Run with: npx playwright test frontend/tests/
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

test.describe('Landing Page', () => {
  test('should load and display hero section', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check page title
    await expect(page).toHaveTitle(/HashBin\.org/);
    
    // Check hero heading
    await expect(page.locator('h1')).toContainText('Content Distribution');
    
    // Check CTA buttons exist
    await expect(page.locator('a[href="/upload.html"]')).toBeVisible();
    await expect(page.locator('a[href="/retrieve.html"]')).toBeVisible();
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check navigation header loads
    await expect(page.locator('.nav-header')).toBeVisible();
    
    // Click Upload button
    await page.click('a[href="/upload.html"]');
    await expect(page).toHaveURL(/\/upload\.html/);
  });

  test('should display pricing information', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check pricing section
    await expect(page.locator('text=$0.03 per GB per month')).toBeVisible();
  });
});

test.describe('Retrieve Page', () => {
  test('should load retrieve page', async ({ page }) => {
    await page.goto(`${BASE_URL}/retrieve.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Retrieve Content/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Retrieve Content');
    
    // Check hash input field
    await expect(page.locator('#content-hash')).toBeVisible();
    
    // Check retrieve button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should validate hash format', async ({ page }) => {
    await page.goto(`${BASE_URL}/retrieve.html`);
    
    // Try to submit empty form
    const hashInput = page.locator('#content-hash');
    await hashInput.fill('');
    
    // Input should be required
    await expect(hashInput).toHaveAttribute('required');
  });
});

test.describe('Upload Page', () => {
  test('should load upload page', async ({ page }) => {
    await page.goto(`${BASE_URL}/upload.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Upload Content/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Upload Content');
    
    // Check balance display
    await expect(page.locator('#current-balance')).toBeVisible();
  });

  test('should display drop zone', async ({ page }) => {
    await page.goto(`${BASE_URL}/upload.html`);
    
    // Check drop zone exists
    await expect(page.locator('#drop-zone')).toBeVisible();
  });
});

test.describe('Dashboard Page', () => {
  test('should load dashboard page', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Dashboard/);
    
    // Check dashboard sidebar
    await expect(page.locator('.dashboard-sidebar')).toBeVisible();
  });
});

test.describe('Documentation Pages', () => {
  test('should load documentation home', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/index.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Documentation/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Documentation');
    
    // Check main sections exist
    await expect(page.locator('text=Getting Started')).toBeVisible();
    await expect(page.locator('text=Core Concepts')).toBeVisible();
  });

  test('should load API reference', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/api.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/API Reference/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('API Reference');
    
    // Check for endpoint documentation
    await expect(page.locator('text=/api/auth/session')).toBeVisible();
  });

  test('should load FAQ', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/faq.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/FAQ/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Frequently Asked Questions');
    
    // Check for FAQ sections
    await expect(page.locator('text=General')).toBeVisible();
    await expect(page.locator('text=Uploads')).toBeVisible();
  });

  test('should load pricing calculator', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/pricing.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Pricing Calculator/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Pricing Calculator');
    
    // Check calculator elements
    await expect(page.locator('#file-size')).toBeVisible();
    await expect(page.locator('#duration')).toBeVisible();
  });

  test('pricing calculator should calculate costs', async ({ page }) => {
    await page.goto(`${BASE_URL}/docs/pricing.html`);
    
    // Set file size to 1 GB
    await page.locator('#file-size').fill('1');
    await page.locator('#size-unit').selectOption('gb');
    
    // Set duration to 1 year (365 days)
    await page.locator('#duration').fill('365');
    await page.locator('#duration-unit').selectOption('days');
    
    // Check that cost is calculated (should be $0.36 for 1GB * 12 months * $0.03)
    const totalCost = page.locator('#total-cost');
    await expect(totalCost).toContainText('$0.36');
  });
});

test.describe('Public Records Page', () => {
  test('should load public records page', async ({ page }) => {
    await page.goto(`${BASE_URL}/public-records.html`);
    
    // Check page title
    await expect(page).toHaveTitle(/Public Records/);
    
    // Check heading
    await expect(page.locator('h1')).toContainText('Public Records');
    
    // Check statistics section
    await expect(page.locator('#stat-total')).toBeVisible();
    await expect(page.locator('#stat-storage')).toBeVisible();
  });

  test('should have filter and export controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/public-records.html`);
    
    // Check search input
    await expect(page.locator('#search-hash')).toBeVisible();
    
    // Check status filter
    await expect(page.locator('#filter-status')).toBeVisible();
    
    // Check export button
    await expect(page.locator('#export-button')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto(BASE_URL);
    
    // Check that content is visible
    await expect(page.locator('h1')).toBeVisible();
    
    // Check navigation
    await expect(page.locator('.nav-header')).toBeVisible();
  });

  test('should display correctly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto(BASE_URL);
    
    // Check that content is visible
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should display correctly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // Full HD
    await page.goto(BASE_URL);
    
    // Check that content is visible
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check h1 exists
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    
    // Should only have one h1
    await expect(h1).toHaveCount(1);
  });

  test('should have alt text for images', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check that all images have alt attributes
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      await expect(img).toHaveAttribute('alt');
    }
  });

  test('forms should have proper labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/retrieve.html`);
    
    // Check that form inputs have associated labels
    const hashInput = page.locator('#content-hash');
    await expect(page.locator('label[for="content-hash"]')).toBeVisible();
  });
});
