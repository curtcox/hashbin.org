import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationSource } from './deploy-owned-apps.mjs';
import { OWNED_APPS, ownedAppOrigin } from './owned-apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await migrationSource();
for (const slug of ['pages', 'python', 'manim', 'gnuplot', 'sheets', 'modl']) {
  const app = OWNED_APPS[slug], directory = join(dirname(root), app.repo), folder = slug === 'modl' ? 'js' : 'src';
  await mkdir(join(directory, folder), { recursive: true });
  await writeFile(join(directory, folder, 'domain-migration.js'), source);
  const indexFile = join(directory, 'index.html');
  let index = await readFile(indexFile, 'utf8');
  if (!index.includes('domain-migration.js')) index = index.replace('</body>', `<script type="module" src="${folder}/domain-migration.js"></script>\n</body>`);
  await writeFile(indexFile, index);
  const readmeFile = join(directory, 'README.md');
  let readme = await readFile(readmeFile, 'utf8');
  if (!readme.includes('## Canonical HashBin address')) readme += `\n## Canonical HashBin address\n\nThe production app is [${ownedAppOrigin(slug)}/](${ownedAppOrigin(slug)}/). The GitHub Pages copy is kept for moving old drafts through **Move saved work** or **Download backup**. Transfers copy only this app's documents and public settings, keep the old copy, and never copy HashBin credentials or Python filesystem permissions. Deployment is managed by [HashBin's first-party deployment tool](https://github.com/curtcox/hashbin.org/blob/main/scripts/deploy-owned-apps.mjs).\n`;
  await writeFile(readmeFile, readme);
  const instructions = join(directory, 'AGENTS.md');
  try { await writeFile(instructions, (await readFile(instructions, 'utf8')).replaceAll(app.legacy, ownedAppOrigin(slug) + '/')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (slug === 'manim') {
    const file = join(directory, 'offline-assets.js');
    let inventory = await readFile(file, 'utf8');
    if (!inventory.includes("'src/domain-migration.js'")) inventory = inventory.replace("'index.html',", "'index.html', 'src/domain-migration.js',");
    const version = createHash('sha256').update(source).update(index).digest('hex').slice(0, 12);
    inventory = inventory.replace(/VERSION: '[^']*'/, `VERSION: 'manimonline-offline-domain-${version}'`);
    await writeFile(file, inventory);
    execFileSync(process.execPath, ['scripts/update-offline-hashes.mjs'], { cwd: directory, stdio: 'inherit' });
  } else if (['pages', 'python', 'gnuplot'].includes(slug)) {
    execFileSync(process.execPath, ['scripts/update-offline.mjs'], { cwd: directory, stdio: 'inherit' });
  }
  console.log(`Installed old-origin recovery notice: ${app.repo}`);
}
await writeFile(join(root, 'frontend/js/domain-migration.js'), source);
const textpadFile = join(root, 'frontend/docs/textpad/app.html');
let textpad = await readFile(textpadFile, 'utf8');
textpad = textpad.replaceAll('https://hashbin.org/sdk/hashbin.js', 'https://hashbin.org/sdk/v0.4.0/hashbin.js').replace('from "/sdk/hashbin.js"', 'from "/sdk/v0.4.0/hashbin.js"');
if (!textpad.includes('import "/js/domain-migration.js"')) textpad = textpad.replace('    // ------------------------------------------------------------------\n    // 1. Configuration', '    import "/js/domain-migration.js";\n\n    // ------------------------------------------------------------------\n    // 1. Configuration');
if (!textpad.includes('let movedText = null;')) textpad = textpad.replace('    const draft = await finishSignIn();', '    let movedText = null;\n    try { movedText = sessionStorage.getItem("hashbin:textpad:migrated-text"); sessionStorage.removeItem("hashbin:textpad:migrated-text"); } catch (_) {}\n    const draft = await finishSignIn();').replace('    if (draft) {\n      updateControls();', '    if (movedText !== null && !draft) {\n      currentCid = null; savedText = null; editor.value = movedText;\n      updateControls(); showAccount(); showMessage("Your unsaved text was moved. Click Save when ready.");\n    } else if (draft) {\n      updateControls();');
await writeFile(textpadFile, textpad);
const inline = /<script type="module">([\s\S]*?)<\/script>/.exec(textpad)[1];
const hash = createHash('sha256').update(inline).digest('base64');
const headersFile = join(root, 'frontend/_headers');
let headers = await readFile(headersFile, 'utf8');
headers = headers.replace(/(\/docs\/textpad\/app(?:\.html)?\n {2}Content-Security-Policy: script-src 'self' )'sha256-[^']*'/g, `$1'sha256-${hash}'`);
await writeFile(headersFile, headers);
const templateFile = join(root, 'scripts/docs/textpad-doc.template.html');
await writeFile(templateFile, (await readFile(templateFile, 'utf8')).replaceAll('https://hashbin.org/sdk/hashbin.js', 'https://hashbin.org/sdk/v0.4.0/hashbin.js'));
const helperFile = join(root, 'scripts/reports/pages/diagram-oauth.html');
let helper = await readFile(helperFile, 'utf8');
if (!helper.includes('domain-migration.js')) helper = helper.replace('</body>', '<script type="module" src="src/domain-migration.js"></script>\n</body>');
await writeFile(helperFile, helper);
const generatorFile = join(root, 'scripts/reports/generate-main-report.sh');
let generator = await readFile(generatorFile, 'utf8');
generator = generator.replace('cp frontend/sdk/hashbin.js build-reports/sdk/hashbin.js', 'cp frontend/sdk/v0.4.0/hashbin.js build-reports/sdk/hashbin.js');
if (!generator.includes('cp frontend/js/domain-migration.js')) generator = generator.replace('mkdir -p build-reports/sdk', 'mkdir -p build-reports/src\ncp frontend/js/domain-migration.js build-reports/src/domain-migration.js\nmkdir -p build-reports/sdk');
const upload = /(cat > build-reports\/upload-via-registered-app\.html << 'UPLOAD_REGISTERED_APP_EOF'\n)([\s\S]*?)(\nUPLOAD_REGISTERED_APP_EOF)/;
generator = generator.replace(upload, (_, start, html, end) => start + (html.includes('domain-migration.js') ? html : html.replace('</body>', '<script type="module" src="src/domain-migration.js"></script>\n</body>')) + end);
await writeFile(generatorFile, generator);
execFileSync('python3', ['scripts/docs/generate-textpad-docs.py'], { cwd: root, stdio: 'inherit' });
