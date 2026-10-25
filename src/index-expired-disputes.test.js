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
