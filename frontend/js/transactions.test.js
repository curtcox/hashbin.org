import { describe, expect, it } from 'vitest';
import { buildTransactionDetails, formatTransactionAmount, getTransactionTypeLabel } from './transactions.js';

describe('content deletion transactions', () => {
  const deletion = {
    type: 'content_deletion',
    amount_cents: 0,
    cid: 'AAAAAAAAcid',
    deletion_reason: '<b>takedown</b>',
    dispute_id: 'disp_1'
  };

  it('shows no amount and a readable label', () => {
    expect(formatTransactionAmount(0, 'content_deletion')).toEqual({ formatted: '—', cssClass: 'amount-none' });
    expect(getTransactionTypeLabel('content_deletion')).toBe('Content Deletion');
  });

  it('shows the reason (escaped), the closed dispute, and links the CID to its info page', () => {
    const html = buildTransactionDetails(deletion);
    expect(html).toContain('&lt;b&gt;takedown&lt;/b&gt;');
    expect(html).toContain('/disputes/view.html?cid=AAAAAAAAcid');
    expect(html).toContain('href="/info.html?cid=AAAAAAAAcid"');
  });
});
