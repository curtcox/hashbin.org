import { describe, expect, it, vi } from 'vitest';

const { authenticateMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn()
}));

vi.mock('../auth/middleware.js', async () => {
  const actual = await vi.importActual('../auth/middleware.js');
  return {
    ...actual,
    authenticate: authenticateMock
  };
});

import { handleUploadContent } from './content.js';
import { MAX_UPLOAD_BYTES } from '../utils/upload-limits.js';

authenticateMock.mockResolvedValue({
  authenticated: true,
  error: null,
  user: { userId: 'user_1', authMethod: 'clerk', profile: { user_id: 'user_1' } }
});

describe('Upload size limit', () => {
  it('rejects a declared Content-Length over the limit without reading the body', async () => {
    const arrayBuffer = vi.fn();
    const request = {
      url: 'https://hashbin.test/api/content',
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(MAX_UPLOAD_BYTES + 1024 * 1024)
      }),
      arrayBuffer
    };

    const response = await handleUploadContent(request, {});
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.max_upload_bytes).toBe(MAX_UPLOAD_BYTES);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects an oversized raw body even without Content-Length', async () => {
    const request = {
      url: 'https://hashbin.test/api/content',
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => ({ byteLength: MAX_UPLOAD_BYTES + 1 })
    };

    const response = await handleUploadContent(request, {});
    expect(response.status).toBe(413);
  });

  it('rejects an oversized multipart file before buffering it', async () => {
    const fileArrayBuffer = vi.fn();
    const file = { size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf', arrayBuffer: fileArrayBuffer };
    const request = {
      url: 'https://hashbin.test/api/content',
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }),
      formData: async () => ({ get: (name) => (name === 'content' ? file : null) })
    };

    const response = await handleUploadContent(request, {});
    expect(response.status).toBe(413);
    expect(fileArrayBuffer).not.toHaveBeenCalled();
  });
});
