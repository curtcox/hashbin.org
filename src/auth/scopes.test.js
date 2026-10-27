import { describe, expect, it } from 'vitest';
import { caveatsNarrower, checkCaveats, parseCaveats, parseScopes, spenderOf } from './scopes.js';

const CID = 'AAAAAABk' + 'a'.repeat(86);
const OTHER_CID = 'AAAAAABk' + 'b'.repeat(86);
const withCaveats = caveats => ({ authenticated: true, user: { caveats } });

describe('parseScopes', () => {
  it('accepts user scopes for keys and grants, admin scopes only for admin keys', () => {
    expect(parseScopes(['content:write', 'content:write', 'balance:read'], 'key')).toEqual(['content:write', 'balance:read']);
    expect(parseScopes('content:write balance:read', 'oauth')).toEqual(['content:write', 'balance:read']);
    expect(parseScopes(['admin:stats'], 'key')).toBeNull();
    expect(parseScopes(['content:write'], 'admin')).toBeNull();
    expect(parseScopes(['admin:stats'], 'admin')).toEqual(['admin:stats']);
    expect(parseScopes(['content:read'], 'oauth')).toBeNull();
  });
});

describe('parseCaveats', () => {
  it('accepts every caveat within its bounds', () => {
    const input = { monthly_spend_limit_cents: 200, max_retention_months: 12, max_upload_bytes: 1048576,
      content_types: ['text/plain'], cids: [CID] };
    expect(parseCaveats(input, 'key')).toEqual({ caveats: input });
  });

  it.each([
    [{ monthly_spend_limit_cents: 0 }, 'monthly_spend_limit_cents'],
    [{ max_retention_months: 121 }, 'max_retention_months'],
    [{ max_upload_bytes: 1.5 }, 'max_upload_bytes'],
    [{ content_types: ['not a type'] }, 'content_types'],
    [{ cids: ['nope'] }, 'cids'],
    [{ cids: [] }, 'cids'],
    [{ expires_at: '2000-01-01T00:00:00Z' }, 'expires_at']
  ])('rejects %j', (input, name) => {
    expect(parseCaveats(input, 'oauth').error).toContain(name);
  });

  it('rejects unknown caveats, and grant expiry on keys (keys have their own)', () => {
    expect(parseCaveats({ anything: 1 }, 'key').error).toContain('Unknown');
    expect(parseCaveats({ expires_at: '2099-01-01T00:00:00Z' }, 'key').error).toContain('Unknown');
    expect(parseCaveats({ expires_at: '2099-01-01T00:00:00Z' }, 'oauth').caveats.expires_at).toBe('2099-01-01T00:00:00Z');
  });
});

describe('caveatsNarrower', () => {
  const current = { monthly_spend_limit_cents: 500, cids: [CID, OTHER_CID] };

  it('allows keeping, tightening or adding limits', () => {
    expect(caveatsNarrower(current, current)).toBe(true);
    expect(caveatsNarrower(current, { monthly_spend_limit_cents: 100, cids: [CID], max_upload_bytes: 10 })).toBe(true);
  });

  it('refuses dropping or loosening a limit', () => {
    expect(caveatsNarrower(current, { cids: [CID] })).toBe(false);
    expect(caveatsNarrower(current, { monthly_spend_limit_cents: 501, cids: [CID] })).toBe(false);
    expect(caveatsNarrower(current, { monthly_spend_limit_cents: 500, cids: [CID, 'AAAAAABk' + 'c'.repeat(86)] })).toBe(false);
  });
});

describe('checkCaveats', () => {
  const limited = withCaveats({ max_upload_bytes: 1048576, max_retention_months: 12, content_types: ['text/plain'], cids: [CID] });

  it('allows requests just inside every limit', () => {
    expect(checkCaveats(limited, { bytes: 1048576, retention_months: 12, content_type: 'text/plain; charset=utf-8' })).toBeNull();
    expect(checkCaveats(limited, { cid: CID })).toBeNull();
    expect(checkCaveats(withCaveats({}), { cid: OTHER_CID, bytes: 1e9 })).toBeNull();
  });

  it.each([
    [{ bytes: 1048577 }, 'max_upload_bytes'],
    [{ retention_months: 13 }, 'max_retention_months'],
    [{ content_type: 'text/html' }, 'content_types'],
    [{ cid: OTHER_CID }, 'cids']
  ])('refuses %j', async (ctx, caveat) => {
    const response = checkCaveats(limited, ctx);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'caveat_violation', caveat });
  });
});

describe('spenderOf', () => {
  it('names the key or grant a request spends through, and nothing for a session', () => {
    expect(spenderOf({ user: { authMethod: 'apikey', keyId: 'k' } })).toEqual({ kind: 'key', id: 'k' });
    expect(spenderOf({ user: { authMethod: 'oauth', oauth: { grantId: 'g' } } })).toEqual({ kind: 'oauth', id: 'g' });
    expect(spenderOf({ user: { authMethod: 'clerk' } })).toBeUndefined();
  });
});
