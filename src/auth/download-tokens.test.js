import { describe, expect, it } from 'vitest';
import { generateApiKey, signDownloadToken, verifyApiKey, verifyDownloadToken } from './download-tokens.js';

const SECRET = 'shared-download-secret';
const now = () => Math.floor(Date.now() / 1000);

describe('per-purpose signing keys', () => {
  it('never accepts a user key as an admin key, or the reverse', async () => {
    const userKey = await generateApiKey('user', 'key', SECRET);
    const adminKey = await generateApiKey('user', 'key', SECRET, 'hba');
    expect(adminKey.startsWith('hba_')).toBe(true);
    await expect(verifyApiKey('hba_' + userKey.slice(4), SECRET, 'hba')).rejects.toThrow();
    await expect(verifyApiKey('hbk_' + adminKey.slice(4), SECRET)).rejects.toThrow();
    await expect(verifyApiKey(adminKey, SECRET, 'hba')).resolves.toMatchObject({ u: 'user', k: 'key' });
  });

  it.each([['url', 'cookie'], ['handshake', 'url'], ['cookie', 'handshake']])('rejects a %s token presented as a %s token', async (made, presented) => {
    const token = await signDownloadToken({ u: 'user', type: made, iat: now(), exp: now() + 30 }, SECRET);
    await expect(verifyDownloadToken(token, SECRET, presented, 86400)).rejects.toThrow();
    await expect(verifyDownloadToken(token, SECRET, made, 86400)).resolves.toMatchObject({ u: 'user' });
  });
});
