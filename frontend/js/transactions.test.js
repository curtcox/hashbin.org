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

describe('deposit details', () => {
  it('itemize the card payment cost and tax, and link to the explanation', () => {
    const html = buildTransactionDetails({ type: 'deposit', amount_cents: 1000, stripe_fee_cents: 61, tax_cents: 100 });
    expect(html).toContain('Card payment cost:</strong> $0.61');
    expect(html).toContain('sales tax:</strong> $1.00');
    expect(html).toContain('charged:</strong> $11.61');
    expect(html).toContain('href="/docs/deposits.html"');
  });

  it('leave out the breakdown for deposits recorded without one', () => {
    expect(buildTransactionDetails({ type: 'deposit', amount_cents: 1000, stripe_fee_cents: null })).not.toContain('Card payment cost');
  });
});
