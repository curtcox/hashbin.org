import { cp, mkdir, readFile, writeFile, rm, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OWNED_APPS, ownedAppOrigin } from './owned-apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const localAssets = manifest => (manifest.assets || manifest.local).filter(path => !/^https?:/.test(path));

/** Generate the shared migration module from the approved app-address registry. */
export async function migrationSource() {
  const apps = Object.fromEntries(Object.entries(OWNED_APPS).map(([slug, app]) => [slug, { legacy: app.legacy, origin: ownedAppOrigin(slug) }]));
  return await readFile(join(root, 'scripts/owned-apps/migration.js'), 'utf8') + `\nbootMigration(${JSON.stringify(apps)});\n`;
}

async function copy(source, target, files) {
  for (const file of files) {
    if (file.startsWith('/') || file.split('/').includes('..')) throw new Error(`Unsafe asset: ${file}`);
    await mkdir(dirname(join(target, file)), { recursive: true });
    await cp(join(source, file), join(target, file), { recursive: true });
  }
}

/** Hash the final deployment bytes and reject symlinks, secrets and oversized assets. */
export async function assetInventory(directory) {
  const files = {};
  async function walk(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink in deployment: ${path}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(join(path, name));
    } else {
      const name = relative(directory, path).replaceAll('\\', '/');
      if (name.split('/').some(part => ['.git', 'node_modules', 'tests', 'test-results'].includes(part) || part.toLowerCase().startsWith('.env') || part.startsWith('.dev.vars'))) throw new Error(`Private/development file in deployment: ${name}`);
      if (stat.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Cloudflare's 25 MiB limit: ${name}`);
      files[name] = { bytes: stat.size, sha256: sha(await readFile(path)) };
    }
  }
  await walk(directory);
  return files;
}

/** Update a plain offline manifest after applying deployment-specific configuration. */
export async function refreshOfflineManifest(directory, manifest, prefix) {
  const next = structuredClone(manifest);
  for (const path of localAssets(next)) next.hashes[path] = sha(await readFile(join(directory, path)));
  next.version = prefix + sha(JSON.stringify(next.hashes)).slice(0, 16);
  await writeFile(join(directory, 'offline-assets.js'), `// Generated for this hosted release from final asset bytes.\nconst OfflineAssets = ${JSON.stringify(next, null, 2)};\nif (typeof module !== 'undefined') module.exports = OfflineAssets;\nelse globalThis.OfflineAssets = OfflineAssets;\n`);
}

/** Pin Textpad's SDK while retaining its deliberate OAuth example and hash-based CSP. */
export function hostedTextpad(html) {
  html = html.replaceAll('/sdk/hashbin.js', 'https://hashbin.org/sdk/v0.4.0/hashbin.js')
    .replaceAll('https://hashbin.orghttps://hashbin.org/', 'https://hashbin.org/')
    .replace('"/sdk/v0.4.0/hashbin.js"', '"https://hashbin.org/sdk/v0.4.0/hashbin.js"')
    .replace('"/js/domain-migration.js"', '"./src/domain-migration.js"')
    .replace('href="../textpad"', 'href="https://hashbin.org/docs/textpad"');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error('Textpad must have exactly one inline module.');
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64');
  const policy = `script-src 'self' 'sha256-${hash}' https://hashbin.org/sdk/v0.4.0/; object-src 'none'; base-uri 'none'`;
  return html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

/** Response policy complements meta policies without restricting interpreter worker scripts. */
export function hostedHeaders(slug, html = '') {
  const ancestors = slug === 'pages-preview' ? 'https://pages.hashbin.page https://pages.hashbin.us' : "'none'";
  const textpad = slug === 'textpad' ? /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] : null;
  if (slug === 'textpad' && !textpad) throw new Error('Textpad response requires its inline-script hash policy.');
  const policy = textpad || "object-src 'none'";
  return `/*\n  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: ${slug === 'pages-preview' ? 'no-referrer' : 'strict-origin-when-cross-origin'}\n  Content-Security-Policy: ${policy}; frame-ancestors ${ancestors}\n`;
}

/** Stage one approved app with an explicit public-asset allowlist; never upload a repo root. */
export async function stageOwnedApp(slug, { sources = dirname(root) } = {}) {
  const app = slug === 'pages-preview' ? { repo: 'pages' } : OWNED_APPS[slug];
  const origin = ownedAppOrigin(slug);
  const source = resolve(sources, app.repo);
  const destination = join(root, 'build-reports', 'owned-apps', slug);
  const assets = join(destination, 'public');
  await rm(destination, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  let manifest;
  if (['pages', 'python', 'gnuplot'].includes(slug)) {
    manifest = require(join(source, 'offline-assets.js'));
    await copy(source, assets, [...localAssets(manifest), 'offline-assets.js', 'service-worker.js']);
    if (slug === 'pages') {
      const index = await readFile(join(assets, 'index.html'), 'utf8');
      await writeFile(join(assets, 'index.html'), index.replace('content="./preview.html"', 'content="https://pages.hashbin.us/preview.html"').replace("frame-src 'self'", "frame-src 'self' https://pages.hashbin.us"));
      await refreshOfflineManifest(assets, manifest, 'pagesonline-');
    }
  } else if (slug === 'manim') {
    manifest = require(join(source, 'offline-assets.js'));
    await copy(source, assets, [...manifest.local, 'offline-assets.js', 'offline-hashes.js', 'service-worker.js', 'gallery/previews']);
  } else if (slug === 'sheets') {
    execFileSync(process.execPath, ['--input-type=module', '-e', 'const {stage}=await import(process.argv[1]);await stage(process.argv[2],process.argv[3]);', pathToFileURL(join(source, 'scripts/stage.mjs')).href, assets, execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()], { cwd: source });
  } else if (slug === 'modl') {
    await copy(source, assets, ['index.html', 'js', 'docs']);
  } else if (slug === 'pages-preview') {
    await copy(source, assets, ['preview.html', 'src/preview-host.js']);
  } else if (slug === 'textpad') {
    await writeFile(join(assets, 'index.html'), hostedTextpad(await readFile(join(root, 'frontend/docs/textpad/app.html'), 'utf8')));
  } else {
    await mkdir(join(assets, 'sdk'), { recursive: true });
    await cp(join(root, 'frontend/sdk/v0.4.0/hashbin.js'), join(assets, 'sdk/hashbin.js'));
    if (slug === 'diagram') {
      await cp(join(root, 'scripts/reports/pages/diagram-oauth.html'), join(assets, 'index.html'));
      await cp(join(root, 'scripts/reports/pages/diagram-oauth.js'), join(assets, 'diagram-oauth.js'));
    } else {
      const generator = await readFile(join(root, 'scripts/reports/generate-main-report.sh'), 'utf8');
      const html = /cat > build-reports\/upload-via-registered-app\.html << 'UPLOAD_REGISTERED_APP_EOF'\n([\s\S]*?)\nUPLOAD_REGISTERED_APP_EOF/.exec(generator)?.[1];
      if (!html) throw new Error('Upload helper template not found.');
      await writeFile(join(assets, 'index.html'), html.replace('<input id="client-id"', `<input value="${app.appId}" id="client-id"`));
      await cp(join(root, 'scripts/reports/pages/upload-via-registered-app.js'), join(assets, 'upload-via-registered-app.js'));
    }
  }
  if (slug !== 'pages-preview') {
    await mkdir(join(assets, 'src'), { recursive: true });
    await writeFile(join(assets, 'src/domain-migration.js'), await migrationSource());
    await writeFile(join(assets, 'migration.html'), (await readFile(join(root, 'scripts/owned-apps/migration.html'), 'utf8')).replace('__APP__', slug));
    // The Pages source already inventories its migration module; rehash its configured release.
    if (slug === 'pages') await refreshOfflineManifest(assets, manifest, 'pagesonline-');
  }
  await writeFile(join(assets, '_headers'), hostedHeaders(slug, slug === 'textpad' ? await readFile(join(assets, 'index.html'), 'utf8') : ''));
  const inventory = await assetInventory(assets);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' }).trim());
  await writeFile(join(assets, 'release.json'), JSON.stringify({ app: slug, origin, repo: app.repo, revision, dirty, assets: inventory }, null, 2));
  const config = { name: `hashbin-client-${slug}`, compatibility_date: '2026-10-30', workers_dev: false, preview_urls: false, routes: [{ pattern: new URL(origin).hostname, custom_domain: true }], assets: { directory: './public', not_found_handling: 'none' } };
  await writeFile(join(destination, 'wrangler.json'), JSON.stringify(config, null, 2));
  return { slug, origin, config: join(destination, 'wrangler.json'), files: Object.keys(inventory).length };
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find(arg => !arg.startsWith('--'));
  if (!slug) throw new Error('Usage: node scripts/deploy-owned-apps.mjs <app|all> [--deploy]');
  const selected = slug === 'all' ? ['pages-preview', ...Object.keys(OWNED_APPS)] : [slug];
  for (const app of selected) {
    const staged = await stageOwnedApp(app);
    console.log(JSON.stringify(staged));
    if (args.includes('--deploy')) {
      const result = spawnSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', staged.config], { cwd: root, stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Deployment failed: ${app}`);
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
