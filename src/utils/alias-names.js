import { validate256tCID, decodeLengthPrefix } from './hash256t.js';

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Alias targets must include the complete, canonically encoded CID payload. */
export function validateAliasCid(cid) {
  if (typeof cid !== 'string' || !validate256tCID(cid)) return false;
  const size = decodeLengthPrefix(cid.slice(0, 8));
  const expected = size <= 64 ? size : 64;
  const payload = cid.slice(8);
  if (payload.length !== Math.ceil(expected * 4 / 3)) return false;
  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.length === expected && btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === payload;
  } catch { return false; }
}

function foldedInlineCid(name) {
  if (name.length < 8 || name.includes('.')) return false;
  const size = Math.floor((name.length - 8) * 3 / 4);
  if (name.length !== 8 + Math.ceil(size * 4 / 3) ||
    name.slice(0, 8) !== `AAAAAAA${BASE64URL[size]}`.toLowerCase()) return false;
  if (size % 3 === 0) return true;
  const allowed = size % 3 === 1 ? 'AQgw' : 'AEIMQUYcgkosw048';
  return allowed.toLowerCase().includes(name.at(-1));
}

export const RESERVED_ALIAS_NAMES = new Set([
  'api', 'admin', 'www', 'hashbin', '256t', 'help', 'support', 'login', 'logout',
  'oauth', 'security', 'abuse', 'dmca', 'dashboard', 'account', 'billing', 'status'
]);

/** Normalize ASCII aliases without trimming or accepting encoded path characters. */
export function normalizeAliasName(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9._-]{1,63}$/.test(input)) return null;
  const name = input.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(name) || name.includes('..') ||
    foldedInlineCid(name)) return null;
  return name;
}

/** Reserved aliases can only be assigned by an administrator. */
export function isReservedAlias(name) {
  return RESERVED_ALIAS_NAMES.has(name);
}
