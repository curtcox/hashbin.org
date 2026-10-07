import { describe, expect, it } from 'vitest';
import { AdminActionLog } from './admin-action-log.js';

function createStorage() {
  const data = new Map();
  return {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
    async list({ prefix = '' } = {}) {
      return new Map([...data.entries()].filter(([k]) => k.startsWith(prefix)));
    }
  };
}

const strike = (log, uploader_id, cid) => log.fetch(new Request('http://internal/strike', {
  method: 'POST',
  body: JSON.stringify({ uploader_id, cid, dispute_id: `disp_${cid}` })
}));

describe('AdminActionLog repeat-infringer ledger', () => {
  it('counts one strike per CID and lists uploaders at the threshold', async () => {
    const log = new AdminActionLog({ storage: createStorage() }, {});
    await strike(log, 'user_a', 'cid1');
    await strike(log, 'user_a', 'cid1'); // same CID again: not double-counted
    await strike(log, 'user_a', 'cid2');
    await strike(log, 'user_a', 'cid3');
    await strike(log, 'user_b', 'cid4');

    const response = await log.fetch(new Request('http://internal/repeat-infringers?min=3'));
    const { infringers } = await response.json();
    expect(infringers).toHaveLength(1);
    expect(infringers[0]).toMatchObject({ uploader_id: 'user_a', strikes: 3 });
  });

  it('only counts strikes inside the window', async () => {
    const log = new AdminActionLog({ storage: createStorage() }, {});
    await strike(log, 'user_a', 'cid1');
    const future = new Date(Date.now() + 60_000).toISOString();
    const response = await log.fetch(new Request(`http://internal/repeat-infringers?min=1&since=${future}`));
    expect((await response.json()).infringers).toEqual([]);
  });
});
