import { describe, expect, it } from 'vitest';
import { handleGetContentDisputes } from './disputes.js';

function envWithHistory(disputes) {
  return {
    DISPUTE_RECORD: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ disputes }), { status: 200 })
      })
    }
  };
}

const storedDispute = {
  dispute_id: 'disp_1',
  cid: 'AAAAAAAAabc',
  status: 'open',
  claim_type: 'copyright',
  evidence: 'x'.repeat(60),
  submitter_contact: { type: 'email', value: 'reporter@example.com' },
  submitter_ip_hash: 'abc123'
};

describe('GET /api/content/{cid}/disputes', () => {
  it('never exposes the reporter IP hash and hides contact from anonymous callers', async () => {
    const response = await handleGetContentDisputes(
      new Request('https://hashbin.test/api/content/AAAAAAAAabc/disputes'),
      envWithHistory([storedDispute]),
      'AAAAAAAAabc',
      null
    );
    const body = await response.json();

    expect(body.disputes[0].submitter_ip_hash).toBeUndefined();
    expect(body.disputes[0].submitter_contact).toBeUndefined();
    expect(body.disputes[0].evidence).toBe(storedDispute.evidence);
  });

  it('shows contact to signed-in callers but still hides the IP hash', async () => {
    const response = await handleGetContentDisputes(
      new Request('https://hashbin.test/api/content/AAAAAAAAabc/disputes'),
      envWithHistory([storedDispute]),
      'AAAAAAAAabc',
      'user_1'
    );
    const body = await response.json();

    expect(body.disputes[0].submitter_ip_hash).toBeUndefined();
    expect(body.disputes[0].submitter_contact.value).toBe('reporter@example.com');
  });
});
