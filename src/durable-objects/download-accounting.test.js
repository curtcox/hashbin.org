import { it, expect } from 'vitest';
import { PlatformStats } from './platform-stats.js';
import { PaymentRecord } from './payment-record.js';
function state() {
  const values = new Map(); let queue = Promise.resolve();
  const storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)), transaction: async fn => fn(storage) };
  return { storage, blockConcurrencyWhile(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } };
}
const post = (path, body) => new Request(`https://internal${path}`, { method: 'POST', body: JSON.stringify(body) });
it('records each download debit once when an outbox retries concurrently', async () => {
  const backing = state(), records = new PaymentRecord(backing, {});
  const transaction = { transaction_id: 'id', user_id: 'user', type: 'download_spend', amount_cents: 1 };
  await Promise.all(Array.from({ length: 5 }, () => records.fetch(post('/transaction', transaction))));
  expect(await backing.storage.get('transactions')).toEqual(['id']);
});
it('records net leased revenue once, alongside concurrent ordinary revenue, at micro-cent precision', async () => {
  const backing = state(), stats = new PlatformStats(backing, {}), period = new Date().toISOString().slice(0, 7);
  const event = { id: 'lease', user_id: 'user', sequence: 1, period, revenue_cents: 0.0004 };
  await Promise.all([
    stats.fetch(post('/download-revenue', event)), stats.fetch(post('/download-revenue', event)),
    stats.fetch(post('/increment', { counter: 'total_revenue_cents', value: 1 }))
  ]);
  await stats.fetch(post('/download-revenue', { id: 'return', user_id: 'user', sequence: 2, period, revenue_cents: -0.0004 }));
  expect(await backing.storage.get(`revenue:${period}`)).toBe(1);
  expect(await backing.storage.get('total_revenue_cents')).toBe(1);
  expect(await backing.storage.get('download_revenue_cents')).toBe(0);
});
