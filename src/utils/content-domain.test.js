import { describe, expect, it } from 'vitest';
import {
  getContentDomain,
  getContentBaseUrl,
  buildContentUrl
} from './content-domain.js';

describe('content domain helpers', () => {
  it('prefers configured content domain', () => {
    expect(getContentDomain({ CONTENT_DOMAIN: 'cdn.example.com' })).toBe('cdn.example.com');
    expect(getContentBaseUrl({ CONTENT_DOMAIN: 'cdn.example.com' })).toBe('https://cdn.example.com');
  });

  it('supports explicit base urls', () => {
    expect(getContentBaseUrl({ CONTENT_DOMAIN: 'https://cdn.example.com/' })).toBe('https://cdn.example.com');
  });

  it('falls back to request host in local mode', () => {
    const request = new Request('http://localhost:8787/api/config');
    expect(getContentDomain({ ENVIRONMENT: 'local' }, request)).toBe('localhost:8787');
    expect(buildContentUrl({ ENVIRONMENT: 'local' }, 'abc12345', null, request)).toBe('https://localhost:8787/abc12345');
  });

  it('builds extension-aware urls', () => {
    expect(buildContentUrl({ CONTENT_DOMAIN: '256t.us' }, 'abc12345', 'txt')).toBe('https://256t.us/abc12345.txt');
  });
});
