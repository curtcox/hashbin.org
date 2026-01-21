import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

const results = {
  summary: {
    total_functions: 0,
    documented_functions: 0,
    coverage_pct: 0,
  },
  undocumented: [],
};

const functionPatterns = [
  /(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)/,
  /(export\s+)?(const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/,
  /(export\s+)?([A-Za-z0-9_]+)\s*:\s*(async\s*)?function\s*\(/,
  /(export\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/,
];

function isJsdocComment(lines, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') {
      continue;
    }
    return line.startsWith('/**');
  }
  return false;
}

function getFunctionName(line) {
  for (const pattern of functionPatterns) {
    const match = line.match(pattern);
    if (match) {
      return match[3] || match[2] || 'anonymous';
    }
  }
  return 'anonymous';
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(srcDir);

for (const filePath of files) {
  const relativePath = path.relative(rootDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!functionPatterns.some((pattern) => pattern.test(line))) {
      return;
    }

    results.summary.total_functions += 1;
    const hasDoc = isJsdocComment(lines, index);
    if (hasDoc) {
      results.summary.documented_functions += 1;
    } else {
      results.undocumented.push({
        file: relativePath,
        line: index + 1,
        name: getFunctionName(line),
      });
    }
  });
}

if (results.summary.total_functions > 0) {
  results.summary.coverage_pct = Number(
    ((results.summary.documented_functions / results.summary.total_functions) * 100).toFixed(1),
  );
}

const outputDir = path.join(rootDir, 'build-reports/documentation');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'data.json'), JSON.stringify(results, null, 2));
