import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readOfflineManifest, modlAssets, manimAssets, assetInventory, hostedTextpad, hostedHeaders, refreshOfflineManifest } from './deploy-owned-apps.mjs';
import { OWNED_APPS, ownedAppOrigin } from './owned-apps.mjs';
import { validateMigration, migrationTarget } from './owned-apps/migration.js';

describe('first-party app deployment boundaries', () => {
  let directory;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'owned-apps-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('uses a distinct editor origin for each app and a separate preview site', () => {
    const origins = Object.keys(OWNED_APPS).map(ownedAppOrigin);
    expect(new Set(origins).size).toBe(14);
    expect(ownedAppOrigin('audio')).toBe('https://audio.hashbin.page');
    expect(origins.every(origin => /^https:\/\/[a-z]+\.hashbin\.page$/.test(origin))).toBe(true);
    expect(ownedAppOrigin('pages-preview')).toBe('https://pages.hashbin.us');
    expect(() => ownedAppOrigin('../other')).toThrow();
  });

  it('rejects secrets and symlinks before uploading assets', async () => {
    await writeFile(join(directory, '.env.production'), 'a secret');
    await expect(assetInventory(directory)).rejects.toThrow('Private/development');
    await rm(join(directory, '.env.production'));
    await symlink('/etc/hosts', join(directory, 'linked.txt'));
    await expect(assetInventory(directory)).rejects.toThrow('Symlink');
  });

  it('pins Textpad and hashes its final inline module after rewriting the import', () => {
    const html = hostedTextpad('<head></head><script type="module">import { HashBinClient } from "/sdk/hashbin.js";</script>');
    const source = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
    const hash = createHash('sha256').update(source).digest('base64');
    expect(source).toContain('https://hashbin.org/sdk/v0.4.0/hashbin.js');
    expect(html).toContain(`'sha256-${hash}'`);
    expect(hostedHeaders('textpad', html)).toContain(`'sha256-${hash}'`);
    expect(hostedHeaders('gnuplot')).toContain("object-src 'none'; frame-ancestors 'none'");
    expect(hostedHeaders('gnuplot')).not.toContain('script-src');
  });

  it('allows only the packaged Pages preview to be framed by its own editor', () => {
    const headers = hostedHeaders('pages');
    expect(headers.split('\n/preview')[0]).toContain("frame-ancestors 'none'");
    for (const path of ['/preview', '/preview.html']) {
      expect(headers).toContain(`${path}\n  ! Content-Security-Policy\n  Content-Security-Policy: object-src 'none'; frame-ancestors 'self'\n`);
    }
    expect(hostedHeaders('python')).not.toContain('/preview');
    expect(hostedHeaders('pages-preview')).toContain('frame-ancestors https://pages.hashbin.page https://pages.hashbin.us');
  });

  it('verifies the configured deployment bytes rather than the source index', async () => {
    await writeFile(join(directory, 'index.html'), 'configured preview origin');
    await refreshOfflineManifest(directory, { version: 'old', assets: ['index.html', 'https://runtime.example/runtime.js'], hashes: { 'index.html': 'old', 'https://runtime.example/runtime.js': 'pinned' } }, 'pagesonline-');
    const generated = await readFile(join(directory, 'offline-assets.js'), 'utf8');
    expect(generated).toContain(createHash('sha256').update('configured preview origin').digest('hex'));
    expect(generated).toContain('pinned');
    expect(generated).not.toContain('"index.html": "old"');
  });

  it('preserves a shared manifest cache namespace when rehashing hosted bytes', async () => {
    await writeFile(join(directory, 'index.html'), 'Manim configured release');
    await refreshOfflineManifest(directory, { prefix: 'manimonline-offline', version: 'old', assets: ['index.html'], hashes: {} }, 'manimonline-');
    const generated = await readFile(join(directory, 'offline-assets.js'), 'utf8');
    expect(generated).toMatch(/"version": "manimonline-offline-[a-f0-9]{16}"/);
  });

  it('updates offline copies when response policy changes without changing asset bytes', async () => {
    await writeFile(join(directory, 'index.html'), 'same editor bytes');
    const manifest = {assets:['index.html'],hashes:{}};
    await refreshOfflineManifest(directory, manifest, 'pagesonline-', 'old response policy');
    const first = await readOfflineManifest(directory);
    const nextDirectory = await mkdtemp(join(directory, 'next-'));
    await writeFile(join(nextDirectory, 'index.html'), 'same editor bytes');
    await refreshOfflineManifest(nextDirectory, manifest, 'pagesonline-', 'updated response policy');
    const second = await readOfflineManifest(nextDirectory);
    expect(second.hashes).toEqual(first.hashes);
    expect(second.version).not.toBe(first.version);
  });

  it('stages both Manim generations without uploading remote runtime URLs', () => {
    expect(manimAssets({ assets: ['index.html', 'https://runtime.example/pyodide.js'] }))
      .toEqual(['index.html', 'offline-assets.js', 'service-worker.js', 'gallery/previews']);
    expect(manimAssets({ local: ['index.html'] })).toContain('offline-hashes.js');
  });

  it('reads native-module kit inventories without executing JavaScript', async () => {
    const manifest = { prefix: 'modl-offline', assets: ['index.html'], hashes: {} };
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, 'offline-assets.js'), '// Generated by fragment-kit tools/offline-assets.mjs.\n(function(self){ self.OfflineAssets = ' + JSON.stringify(manifest) + ';\nif (typeof module !== "undefined") module.exports = self.OfflineAssets; })(globalThis);\n');
    expect(await readOfflineManifest(directory)).toEqual(manifest);
    await writeFile(join(directory, 'offline-assets.js'), '// Generated by fragment-kit tools/offline-assets.mjs.\n(function(self){ self.OfflineAssets = globalThis.__ownedManifestExecuted = true;\nif (typeof module !== "undefined") module.exports = self.OfflineAssets; })(globalThis);\n');
    await expect(readOfflineManifest(directory)).rejects.toThrow();
    expect(globalThis.__ownedManifestExecuted).toBeUndefined();
  });

  it('reads the compiler-generated plain JSON inventory without execution', async () => {
    const manifest = { assets: ['index.html', 'src/app.js'], hashes: {} };
    await writeFile(join(directory, 'offline-assets.js'), 'self.OfflineAssets = ' + JSON.stringify(manifest) + ';\n');
    expect(await readOfflineManifest(directory)).toEqual(manifest);
    await writeFile(join(directory, 'offline-assets.js'), 'self.OfflineAssets = globalThis.__gripelineExecuted = true;\n');
    await expect(readOfflineManifest(directory)).rejects.toThrow();
    expect(globalThis.__gripelineExecuted).toBeUndefined();
  });

  it('allows credential-free reads of Apptron public runtime metadata', () => {
    expect(hostedHeaders('apptron')).toContain('/runtime.lock\n  Access-Control-Allow-Origin: *');
    expect(hostedHeaders('apptron')).toContain('/runtime/*/runtime.json\n  Access-Control-Allow-Origin: *');
    expect(hostedHeaders('modl')).not.toContain('Access-Control-Allow-Origin');
  });

  it('moves only gripeline drafts and history, preserving fractional positions', () => {
    const payload = { format: 'hashbin-origin-migration', version: 1, app: 'gripeline', href: 'https://curtcox.github.io/gripeline/editor/#h1=source', storage: { 'gripeline:draft': JSON.stringify({src:'a square cat',pos:{a:[1.25,2.5]}}), 'gripeline:draft:history': '[]' } };
    expect(validateMigration(payload, 'gripeline', OWNED_APPS.gripeline)).toBe(payload);
    expect(() => validateMigration({...payload, storage:{'hashbin:tokens:client':'secret'}}, 'gripeline', OWNED_APPS.gripeline)).toThrow();
    expect(() => validateMigration({...payload, storage:{'gripeline:draft:history':'[1]'}}, 'gripeline', OWNED_APPS.gripeline)).toThrow();
  });

  it('retains legacy MODL staging and inventories every modern local asset', () => {
    expect(modlAssets()).toEqual(['index.html', 'js', 'docs']);
    expect(modlAssets({ assets: ['index.html', 'vendor/kit/src/index.js', 'gallery/covers/a.png', 'https://runtime.example/run.js'] })).toEqual(['index.html', 'vendor/kit/src/index.js', 'gallery/covers/a.png', 'offline-assets.js', 'service-worker.js']);
  });

  it('moves drafts without accepting credentials, filesystem permission, or OAuth callbacks', () => {
    const payload = { format: 'hashbin-origin-migration', version: 1, app: 'python', href: OWNED_APPS.python.legacy + '?code=secret&state=secret&compressed=program#hashbin_publish=secret', storage: { 'pythononline:work': '{"src":"print(42)"}' } };
    expect(validateMigration(payload, 'python', OWNED_APPS.python)).toBe(payload);
    expect(migrationTarget(payload, ownedAppOrigin('python'))).toBe('https://python.hashbin.page/?compressed=program');
    expect(() => validateMigration({ ...payload, storage: { 'hashbin:tokens:client': 'secret' } }, 'python', OWNED_APPS.python)).toThrow();
    expect(() => validateMigration({ ...payload, storage: { 'pythononline:persistent-home': 'true' } }, 'python', OWNED_APPS.python)).toThrow();
    expect(() => validateMigration({ ...payload, href: 'https://attacker.example/' }, 'python', OWNED_APPS.python)).toThrow();
    const audio = { format: 'hashbin-origin-migration', version: 1, app: 'audio', href: OWNED_APPS.audio.legacy + '?example=door', storage: { 'audioonline:document': '{"format":"hashbin-audio","version":1,"src":"from audio import *"}' } };
    expect(validateMigration(audio, 'audio', OWNED_APPS.audio)).toBe(audio);
    expect(migrationTarget(audio, ownedAppOrigin('audio'))).toBe('https://audio.hashbin.page/?example=door');
    expect(() => validateMigration({ ...audio, storage: { 'hashbin:tokens:client': 'secret' } }, 'audio', OWNED_APPS.audio)).toThrow();
  });
});
