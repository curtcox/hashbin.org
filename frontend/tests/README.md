# Frontend E2E Tests

This directory contains end-to-end tests for the HashBin.org frontend using Playwright.

## Overview

The tests verify:
- Page loading and rendering
- Navigation between pages
- Form validation
- Responsive design (mobile, tablet, desktop)
- Basic accessibility (heading hierarchy, alt text, form labels)
- Core functionality (pricing calculator, public records filters)

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

### Run All Tests

```bash
npx playwright test
```

### Run Specific Tests

```bash
# Run tests for a specific page
npx playwright test frontend/tests/frontend-e2e.spec.js -g "Landing Page"

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in a specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug Tests

```bash
# Run tests in debug mode
npx playwright test --debug

# Run a specific test in debug mode
npx playwright test -g "should load and display hero section" --debug
```

### View Test Report

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Test Structure

### Page Tests
- **Landing Page**: Hero section, navigation, pricing display
- **Retrieve Page**: Form validation, hash input
- **Upload Page**: Balance display, drop zone
- **Dashboard Page**: Sidebar navigation
- **Documentation Pages**: All docs pages load correctly
- **Public Records Page**: Filters, export functionality

### Cross-cutting Tests
- **Responsive Design**: Mobile (375px), tablet (768px), desktop (1920px)
- **Accessibility**: Heading hierarchy, alt text, form labels

## Configuration

Tests use the configuration in `playwright.config.js`:
- Base URL: `http://localhost:8787` (or `BASE_URL` env var)
- Browsers: Chrome, Firefox, Safari (desktop and mobile)
- Screenshots: Captured on test failure
- Traces: Captured on first retry

## CI Integration

To run tests in CI:

1. Set `BASE_URL` environment variable to your deployed URL
2. Run `npx playwright test`

Example:
```bash
BASE_URL=https://hashbin.org npx playwright test
```

## Writing New Tests

Follow this pattern:

```javascript
test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/page.html');
    
    // Check something exists
    await expect(page.locator('#element')).toBeVisible();
    
    // Interact with element
    await page.click('#button');
    
    // Verify result
    await expect(page).toHaveURL(/success/);
  });
});
```

See [Playwright documentation](https://playwright.dev/docs/intro) for more examples.

## Known Limitations

- Tests do not cover authenticated flows (requires Clerk mock)
- Tests do not upload/download actual content (requires backend)
- Tests focus on UI presence and basic interactions, not full integration
