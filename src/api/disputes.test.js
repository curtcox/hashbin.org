import { describe, expect, it } from 'vitest';
import { handleCreateDispute, handleGetContentDisputes } from './disputes.js';
import { DisputeRecord } from '../durable-objects/dispute-record.js';

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

describe('intimate image reports', () => {
  const nciiDispute = {
    ...storedDispute,
    claim_type: 'ncii',
    evidence_urls: ['https://example.com/me'],
    ncii_statement: { signature: 'Pat Example', on_behalf: false, good_faith: true }
  };

  it('keep the explanation, links, statement and contact from every non-admin caller', async () => {
    const response = await handleGetContentDisputes(
      new Request('https://hashbin.test/api/content/AAAAAAAAabc/disputes'),
      envWithHistory([nciiDispute]),
      'AAAAAAAAabc',
      'user_1'
    );
    const [dispute] = (await response.json()).disputes;

    for (const field of ['evidence', 'evidence_urls', 'ncii_statement', 'submitter_contact', 'submitter_ip_hash']) {
      expect(dispute[field]).toBeUndefined();
    }
    expect(dispute).toMatchObject({ claim_type: 'ncii', status: 'open', dispute_id: 'disp_1' });
  });

  function createEnv() {
    const storage = new Map();
    const record = new DisputeRecord({
      storage: {
        get: async key => storage.get(key),
        put: async (key, value) => storage.set(key, value),
        delete: async key => storage.delete(key)
      }
    }, {});
    record.ensureBackupRegistration = async () => {};
    const calls = { index: [], alerts: [], availability: [], markers: [] };
    return {
      calls,
      storage,
      env: {
        DISPUTE_INDEX: {
          idFromName: name => name,
          get: () => ({
            fetch: async request => {
              const path = new URL(request.url).pathname;
              if (path === '/rate-limit') return Response.json({ allowed: true });
              calls.index.push({ path, body: await request.json() });
              return Response.json({ success: true });
            }
          })
        },
        DISPUTE_RECORD: { idFromName: name => name, get: () => record },
        CONTENT_METADATA: {
          idFromName: name => name,
          get: () => ({
            fetch: async request => {
              if (request.method === 'GET') return Response.json({ cid: 'AAAAAAAAabc' });
              calls.availability.push(await request.json());
              return Response.json({ success: true });
            }
          })
        },
        CONTENT_BUCKET: { put: async key => calls.markers.push(key) },
        ALERT_STORE: {
          idFromName: name => name,
          get: () => ({ fetch: async request => { calls.alerts.push(await request.json()); return Response.json({}); } })
        }
      }
    };
  }

  const submit = (env, body) => handleCreateDispute(new Request('https://hashbin.test/api/disputes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body)
  }), env);

  const ncii = {
    cid: 'AAAAAAAAabc',
    claim_type: 'ncii',
    contact: { type: 'email', value: 'person@example.com' },
    ncii: { signature: 'Pat Example', good_faith: true }
  };

  it('block the content, index the deadline and alert the operator', async () => {
    const { env, calls } = createEnv();
    const response = await submit(env, ncii);
    expect(response.status).toBe(201);
    const { dispute } = await response.json();

    expect(calls.availability).toEqual([{ disputed: true }]);
    expect(calls.markers).toEqual(['AAAAAAAAabc.disputed']);
    expect(calls.index).toEqual([{ path: '/add', body: expect.objectContaining({ claim_type: 'ncii', expires_at: null, removal_due_at: dispute.removal_due_at }) }]);
    expect(calls.alerts).toEqual([expect.objectContaining({ type: 'ncii_report', severity: 'critical', metadata: expect.objectContaining({ cid: 'AAAAAAAAabc' }) })]);
    expect(JSON.stringify(calls.alerts)).not.toContain('person@example.com');
  });

  it('replace an open copyright dispute in the public index', async () => {
    const { env, calls } = createEnv();
    const first = await (await submit(env, {
      cid: 'AAAAAAAAabc',
      claim_type: 'copyright',
      evidence: 'x'.repeat(60),
      contact: { type: 'email', value: 'owner@example.com' }
    })).json();

    const response = await submit(env, ncii);
    expect(response.status).toBe(201);
    expect(calls.index.map(c => c.path)).toEqual(['/add', '/remove', '/add']);
    expect(calls.index[1].body).toEqual({ dispute_id: first.dispute.dispute_id });
  });
});
