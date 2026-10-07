import { describe, expect, it } from 'vitest';
import { handleGetContent, publicContentView } from './content.js';

const stored = {
  hash_256t: 'AAAAAAAAcid',
  size_bytes: 5000,
  uploader_id: 'user_secret',
  expires_at: '2027-01-01T00:00:00Z',
  retention_payments: [{ payer_id: 'user_secret', amount_cents: 1 }],
  rate_limit_records: [{ record_id: 'r1', payer_id: 'user_other', min_time_between_requests_ms: 1000 }],
  pending_r2_deletion: false
};

const env = {
  CONTENT_METADATA: { idFromName: n => n, get: () => ({ fetch: async () => Response.json(stored) }) }
};

describe('public content metadata', () => {
  it('drops uploader and payer identities', () => {
    const view = publicContentView(stored);
    expect(JSON.stringify(view)).not.toContain('user_secret');
    expect(JSON.stringify(view)).not.toContain('user_other');
    expect(view.retention_payment_count).toBe(1);
    expect(view.rate_limit_records[0].min_time_between_requests_ms).toBe(1000);
  });

  it('tells the uploader, and only the uploader, that they own it', async () => {
    const anonymous = await handleGetContent(new Request('https://hashbin.test/api/content/AAAAAAAAcid'), env, 'AAAAAAAAcid');
    expect((await anonymous.json()).is_owner).toBe(false);

    const ownerRequest = new Request('https://hashbin.test/api/content/AAAAAAAAcid');
    ownerRequest.user = { userId: 'user_secret' };
    const owner = await handleGetContent(ownerRequest, env, 'AAAAAAAAcid');
    const body = await owner.json();
    expect(body.is_owner).toBe(true);
    expect(body.uploader_id).toBeUndefined();
  });
});
