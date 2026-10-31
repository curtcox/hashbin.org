import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assetInventory, hostedTextpad, hostedHeaders, refreshOfflineManifest } from './deploy-owned-apps.mjs';
import { OWNED_APPS, ownedAppOrigin } from './owned-apps.mjs';
import { validateMigration, migrationTarget } from './owned-apps/migration.js';

describe('first-party app deployment boundaries', () => {
  let directory;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'owned-apps-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('uses a distinct editor origin for each app and a separate preview site', () => {
    const origins = Object.keys(OWNED_APPS).map(ownedAppOrigin);
    expect(new Set(origins).size).toBe(10);
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

  it('verifies the configured deployment bytes rather than the source index', async () => {
    await writeFile(join(directory, 'index.html'), 'configured preview origin');
    await refreshOfflineManifest(directory, { version: 'old', assets: ['index.html', 'https://runtime.example/runtime.js'], hashes: { 'index.html': 'old', 'https://runtime.example/runtime.js': 'pinned' } }, 'pagesonline-');
    const generated = await readFile(join(directory, 'offline-assets.js'), 'utf8');
    expect(generated).toContain(createHash('sha256').update('configured preview origin').digest('hex'));
    expect(generated).toContain('pinned');
    expect(generated).not.toContain('"index.html": "old"');
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
