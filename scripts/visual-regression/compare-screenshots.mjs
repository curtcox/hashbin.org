import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const rootDir = process.cwd();
const reportDir = path.join(rootDir, 'build-reports/visual-regression');
const baselineDir = path.join(reportDir, 'screenshots/baseline');
const currentDir = path.join(reportDir, 'screenshots/current');
const diffDir = path.join(reportDir, 'screenshots/diff');

fs.mkdirSync(baselineDir, { recursive: true });
fs.mkdirSync(currentDir, { recursive: true });
fs.mkdirSync(diffDir, { recursive: true });

const htmlFiles = await fg(['frontend/**/*.html'], { dot: false });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const results = [];

for (const file of htmlFiles) {
  const filePath = path.join(rootDir, file);
  const fileName = path.basename(file, path.extname(file));
  const baselinePath = path.join(baselineDir, `${fileName}.png`);
  const currentPath = path.join(currentDir, `${fileName}.png`);
  const diffPath = path.join(diffDir, `${fileName}.png`);

  await page.goto(`file://${filePath}`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: currentPath, fullPage: true });

  let status = 'new-baseline';
  let diffPct = 0;

  if (fs.existsSync(baselinePath)) {
    const baselineImage = PNG.sync.read(fs.readFileSync(baselinePath));
    const currentImage = PNG.sync.read(fs.readFileSync(currentPath));

    if (baselineImage.width !== currentImage.width || baselineImage.height !== currentImage.height) {
      status = 'changed';
      diffPct = 100;
      fs.copyFileSync(currentPath, diffPath);
    } else {
      const diff = new PNG({ width: baselineImage.width, height: baselineImage.height });
      const diffPixels = pixelmatch(
        baselineImage.data,
        currentImage.data,
        diff.data,
        baselineImage.width,
        baselineImage.height,
        { threshold: 0.1 },
      );

      diffPct = Number(((diffPixels / (baselineImage.width * baselineImage.height)) * 100).toFixed(2));
      status = diffPixels > 0 ? 'changed' : 'unchanged';
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
    }
  } else {
    fs.copyFileSync(currentPath, baselinePath);
  }

  results.push({
    page: fileName,
    file,
    status,
    diff_pct: diffPct,
    baseline: `screenshots/baseline/${fileName}.png`,
    current: `screenshots/current/${fileName}.png`,
    diff: `screenshots/diff/${fileName}.png`,
  });
}

await browser.close();

const summary = {
  total_pages: results.length,
  changed_pages: results.filter((entry) => entry.status === 'changed').length,
};

const output = { summary, pages: results };
fs.writeFileSync(path.join(reportDir, 'data.json'), JSON.stringify(output, null, 2));
