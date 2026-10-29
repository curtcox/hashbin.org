import { describe, expect, it, vi } from 'vitest';
import worker from './index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeEnv({ disputes, closeStatus = 200 }) {
  const removedFromIndex = [];
  const patched = [];
  const bucketDelete = vi.fn(async () => {});

  const env = {
    DISPUTE_INDEX: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/list') {
            return Response.json({ disputes });
          }
          removedFromIndex.push((await request.json()).dispute_id);
          return Response.json({ success: true });
        }
      })
    },
    DISPUTE_RECORD: {
      idFromName: (name) => name,
      get: (name) => ({
        fetch: async (request) => {
          patched.push({ name, body: await request.json() });
          return Response.json({}, { status: closeStatus });
        }
      })
    },
    CONTENT_METADATA: { idFromName: name => name, get: () => ({ fetch: async () => Response.json({ success: true }) }) },
    CONTENT_BUCKET: { delete: bucketDelete }
  };

  return { env, removedFromIndex, patched, bucketDelete };
}

describe('processExpiredDisputes', () => {
  it('closes disputes past their expiry and unblocks the content', async () => {
    const { env, removedFromIndex, patched, bucketDelete } = makeEnv({
      disputes: [{ dispute_id: 'disp_old', cid: 'AAAAAABBold', expires_at: new Date(Date.now() - DAY_MS).toISOString() }]
    });

    await worker.processExpiredDisputes(env);

    expect(patched).toEqual([{ name: 'dispute:AAAAAABBold', body: expect.objectContaining({ status: 'closed_expired' }) }]);
    expect(bucketDelete).toHaveBeenCalledWith('AAAAAABBold.disputed');
    expect(removedFromIndex).toEqual(['disp_old']);
  });

  it('never expires an intimate image report', async () => {
    const { env, patched, bucketDelete } = makeEnv({
      disputes: [{ dispute_id: 'disp_ncii', cid: 'AAAAAABBncii', claim_type: 'ncii', expires_at: null, removal_due_at: new Date(Date.now() - DAY_MS).toISOString() }]
    });

    await worker.processExpiredDisputes(env);

    expect(patched).toEqual([]);
    expect(bucketDelete).not.toHaveBeenCalled();
  });

  it('leaves disputes that have not expired alone', async () => {
    const { env, patched, bucketDelete } = makeEnv({
      disputes: [{ dispute_id: 'disp_new', cid: 'AAAAAABBnew', expires_at: new Date(Date.now() + DAY_MS).toISOString() }]
    });

    await worker.processExpiredDisputes(env);

    expect(patched).toEqual([]);
    expect(bucketDelete).not.toHaveBeenCalled();
  });

  it('keeps the content blocked if the dispute could not be closed', async () => {
    const { env, removedFromIndex, bucketDelete } = makeEnv({
      disputes: [{ dispute_id: 'disp_old', cid: 'AAAAAABBold', expires_at: new Date(Date.now() - DAY_MS).toISOString() }],
      closeStatus: 500
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.processExpiredDisputes(env);

    expect(bucketDelete).not.toHaveBeenCalled();
    expect(removedFromIndex).toEqual([]);
  });
});

describe('checkNciiDeadlines', () => {
  const HOUR_MS = 60 * 60 * 1000;

  function deadlineEnv(disputes) {
    const alerts = [];
    const queries = [];
    return {
      alerts,
      queries,
      env: {
        DISPUTE_INDEX: {
          idFromName: name => name,
          get: () => ({ fetch: async request => { queries.push(new URL(request.url).search); return Response.json({ disputes }); } })
        },
        ALERT_STORE: {
          idFromName: name => name,
          get: () => ({ fetch: async request => { alerts.push(await request.json()); return Response.json({}); } })
        }
      }
    };
  }

  it('stays quiet while every report has more than a day left', async () => {
    const now = new Date();
    const { env, alerts, queries } = deadlineEnv([
      { dispute_id: 'disp_a', cid: 'AAAAAAAAa', claim_type: 'ncii', removal_due_at: new Date(now.getTime() + 30 * HOUR_MS).toISOString() }
    ]);

    await worker.checkNciiDeadlines(env, now);

    expect(queries[0]).toContain('claim_type=ncii');
    expect(alerts).toEqual([]);
  });

  it('alerts with the earliest report once one is within a day of its deadline', async () => {
    const now = new Date();
    const { env, alerts } = deadlineEnv([
      { dispute_id: 'disp_late', cid: 'AAAAAAAAlate', claim_type: 'ncii', removal_due_at: new Date(now.getTime() + 20 * HOUR_MS).toISOString() },
      { dispute_id: 'disp_over', cid: 'AAAAAAAAover', claim_type: 'ncii', removal_due_at: new Date(now.getTime() - HOUR_MS).toISOString() }
    ]);

    await worker.checkNciiDeadlines(env, now);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'ncii_deadline', severity: 'critical', title: expect.stringContaining('past its 48-hour deadline') });
    expect(alerts[0].message).toContain('AAAAAAAAover');
    expect(alerts[0].metadata.disputes.map(d => d.dispute_id)).toEqual(['disp_over', 'disp_late']);
  });
});
