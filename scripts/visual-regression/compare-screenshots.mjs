import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const reportDir = path.join(rootDir, 'build-reports/visual-regression');
fs.mkdirSync(reportDir, { recursive: true });

const output = {
  summary: {
    total_pages: 0,
    changed_pages: 0,
  },
  pages: [],
  message: 'Visual regression requires Playwright and pixelmatch, which are not installed in this environment.',
};

fs.writeFileSync(path.join(reportDir, 'data.json'), JSON.stringify(output, null, 2));
