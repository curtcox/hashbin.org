import { it, expect } from 'vitest';
import { PaymentRecord } from './payment-record.js';
import { memoryState } from '../../test-utils/alias-fixture.js';

it('keeps a bounded recent view while paging and filtering the complete history', async () => {
  const state = memoryState(), records = new PaymentRecord(state, {});
  for (let i = 0; i < 250; i++) {
    await records.fetch(new Request('https://internal/transaction', { method: 'POST', body: JSON.stringify({
      transaction_id: `tx-${i}`, type: i < 20 ? 'alias_sale' : 'personal_alias', amount_cents: 1
    }) }));
  }
  expect(await state.storage.get('transactions')).toHaveLength(100);
  const page = await (await records.fetch(new Request('https://internal/transactions?limit=20&offset=200'))).json();
  expect(page.total).toBe(250); expect(page.transactions[0].transaction_id).toBe('tx-49');
  const filtered = await (await records.fetch(new Request('https://internal/transactions?type=alias_sale&limit=10&offset=5'))).json();
  expect(filtered.total).toBe(20);
  expect(filtered.transactions.map(t => t.transaction_id)).toEqual(Array.from({ length: 10 }, (_, i) => `tx-${14 - i}`));
});

it('migrates legacy history without losing order, filters or idempotent receipts', async () => {
  const state = memoryState({ transactions: ['b', 'a'], 'tx:a': { transaction_id: 'a', type: 'alias_sale' }, 'tx:b': { transaction_id: 'b', type: 'personal_alias' } });
  const records = new PaymentRecord(state, {});
  await records.fetch(new Request('https://internal/transaction', { method: 'POST', body: JSON.stringify({ transaction_id: 'a', type: 'alias_sale' }) }));
  const result = await (await records.fetch(new Request('https://internal/transactions'))).json();
  expect(result.transactions.map(t => t.transaction_id)).toEqual(['b', 'a']);
  expect(result.total).toBe(2);
});
