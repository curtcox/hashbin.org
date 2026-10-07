import { describe, expect, it } from 'vitest';
import {
  describeDisputeError,
  escapeHtml,
  isActiveStatus,
  truncateCid,
  validateDisputeForm
} from './disputes.js';

const valid = {
  cid: 'AAAAAAAAabcdefgh',
  claimType: 'copyright',
  evidence: 'This file is a copy of my book, published in 2021; I hold the copyright.',
  evidenceUrls: ['https://example.com/my-book', '  '],
  contactType: 'email',
  contactValue: 'author@example.com',
  goodFaith: true
};

describe('validateDisputeForm', () => {
  it('builds the API payload from valid input, dropping blank links', () => {
    const { errors, payload } = validateDisputeForm(valid);
    expect(errors).toEqual([]);
    expect(payload).toEqual({
      cid: valid.cid,
      claim_type: 'copyright',
      evidence: valid.evidence,
      evidence_urls: ['https://example.com/my-book'],
      contact: { type: 'email', value: 'author@example.com' }
    });
  });

  it('rejects short evidence, bad CIDs, http links, and missing acknowledgment', () => {
    const { errors, payload } = validateDisputeForm({
      ...valid,
      cid: 'bad cid!',
      evidence: 'too short',
      evidenceUrls: ['http://example.com'],
      goodFaith: false
    });
    expect(payload).toBeNull();
    expect(errors).toHaveLength(4);
  });

  it('validates contact by type', () => {
    expect(validateDisputeForm({ ...valid, contactValue: 'not-an-email' }).errors).toHaveLength(1);
    expect(validateDisputeForm({ ...valid, contactType: 'url', contactValue: 'https://example.com/c' }).errors).toEqual([]);
    expect(validateDisputeForm({ ...valid, contactType: 'url', contactValue: 'http://example.com' }).errors).toHaveLength(1);
  });

  it('limits supporting links to 10', () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
    expect(validateDisputeForm({ ...valid, evidenceUrls: urls }).errors).toHaveLength(1);
  });
});

describe('describeDisputeError', () => {
  it('maps API error codes to reporter-facing messages', () => {
    expect(describeDisputeError(409, { error: 'DISPUTE_EXISTS' })).toMatch(/already has an open dispute/);
    expect(describeDisputeError(429, { error: 'REDISPUTE_TOO_SOON', days_remaining: 12.2 })).toMatch(/13 day/);
    expect(describeDisputeError(429, {})).toMatch(/Too many requests/);
    expect(describeDisputeError(429, { error: 'RATE_LIMITED', retry_after_seconds: 600 })).toMatch(/10 minute/);
    expect(describeDisputeError(500, {})).toMatch(/could not be submitted/);
  });
});

describe('display helpers', () => {
  it('escapes HTML', () => {
    expect(escapeHtml('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  });

  it('treats open and under_review as active', () => {
    expect(isActiveStatus('open')).toBe(true);
    expect(isActiveStatus('under_review')).toBe(true);
    expect(isActiveStatus('closed_denied')).toBe(false);
  });

  it('truncates long CIDs', () => {
    expect(truncateCid('A'.repeat(8) + 'B'.repeat(70) + 'C'.repeat(8))).toBe('AAAAAAAA…CCCCCCCC');
    expect(truncateCid('short')).toBe('short');
  });
});
