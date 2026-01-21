import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import espree from 'espree';
import estraverse from 'estraverse';

const rootDir = process.cwd();
const sourceFiles = await fg(['src/**/*.js'], { dot: false });

const results = {
  summary: {
    total_functions: 0,
    documented_functions: 0,
    coverage_pct: 0,
  },
  undocumented: [],
};

function findJsdoc(comments, node) {
  const candidates = comments.filter((comment) => {
    if (comment.type !== 'Block') {
      return false;
    }
    if (!comment.value.startsWith('*')) {
      return false;
    }
    return comment.loc.end.line >= node.loc.start.line - 1 && comment.loc.end.line <= node.loc.start.line;
  });
  if (candidates.length === 0) {
    return null;
  }
  return candidates[candidates.length - 1];
}

function getFunctionName(node, parent) {
  if (node.id?.name) {
    return node.id.name;
  }
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
    return parent.id.name;
  }
  if (parent?.type === 'Property') {
    if (parent.key?.name) {
      return parent.key.name;
    }
    if (typeof parent.key?.value === 'string') {
      return parent.key.value;
    }
  }
  if (parent?.type === 'MethodDefinition') {
    if (parent.key?.name) {
      return parent.key.name;
    }
  }
  return 'anonymous';
}

for (const file of sourceFiles) {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  let ast;

  try {
    ast = espree.parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      comment: true,
      range: true,
    });
  } catch (error) {
    continue;
  }

  const comments = ast.comments || [];

  estraverse.traverse(ast, {
    enter(node, parent) {
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'MethodDefinition'
      ) {
        results.summary.total_functions += 1;
        const doc = findJsdoc(comments, node.type === 'MethodDefinition' ? node : node);
        if (doc) {
          results.summary.documented_functions += 1;
        } else {
          results.undocumented.push({
            file,
            line: node.loc.start.line,
            name: getFunctionName(node, parent),
          });
        }
      }
    },
  });
}

if (results.summary.total_functions > 0) {
  results.summary.coverage_pct = Number(
    ((results.summary.documented_functions / results.summary.total_functions) * 100).toFixed(1),
  );
}

const outputDir = path.join(rootDir, 'build-reports/documentation');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'data.json'),
  JSON.stringify(results, null, 2),
);
