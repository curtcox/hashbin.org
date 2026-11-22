/**
 * Grant vocabulary v1: validation, evaluation, narrowing and plain-English descriptions.
 * The normative description is spec/evaluation.md; spec/vectors/*.json must pass.
 */

export const VOCABULARY_VERSION = 1;
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const USE_PERIODS = ['minute', 'hour', 'day', 'month', 'total'];
const PERIOD_SECONDS = { minute: 60, hour: 3600, day: 86400, month: 2592000 };
const GRANT_KEYS = new Set(['actions', 'resources', 'when', 'where', 'limits', 'require']);
const WHEN_KEYS = new Set(['tz', 'windows', 'not_before', 'not_after']);
const WINDOW_KEYS = new Set(['days', 'from', 'to']);
const WHERE_KEYS = new Set(['source', 'countries', 'regions', 'areas', 'networks']);
const AREA_KEYS = new Set(['lat', 'lon', 'radius_m']);
const LIMIT_KEYS = new Set(['uses', 'spend_usd_per_month']);
const USES_KEYS = new Set(['count', 'per']);
const REQUIRE_KEYS = new Set(['online', 'step_up', 'attestation', 'verified_boot', 'app_ids', 'gates', 'gates_reuse_s', 'confirmation']);
const GATE_ENTRY_KEYS = new Set(['any', 'timeout_s', 'on_timeout']);
const GATE_ID = /^gate_[A-Za-z0-9]{8,64}$/;
/** Bounds on gate entries (spec/evaluation.md §3.6). */
export const GATE_LIMITS = Object.freeze({ entries: 3, gates: 5, minTimeout: 10, maxTimeout: 86400, defaultTimeout: 300, maxReuse: 3600 });
/** The gate kinds an audience policy can name. `owner` is the built-in step-up approver. */
export const GATE_KINDS = Object.freeze(['owner', 'dba-device', 'totp', 'webauthn', 'webhook', 'duo', 'okta-verify']);
/** `require.step_up: true` is exactly this gate list. */
export const STEP_UP_GATES = Object.freeze([Object.freeze({ any: Object.freeze(['owner']), timeout_s: 600, on_timeout: 'deny' })]);
// Confirmations (spec/credential.md §9) get the same clock skew as credentials.
const CONFIRMATION_SKEW = 60;
const ATTESTATION_LEVELS = { hardware: ['tee', 'strongbox', 'secure_enclave', 'tpm'], strongbox: ['strongbox'] };
// An Apple app id: the 10-character team id, a dot, the bundle id.
const APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/;
const ANDROID_APP_ID = /^android:[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+:[0-9a-f]{64}$/;
const MAX_APP_IDS = 16;
const ACTION = /^[a-z0-9-]{1,32}(?::[a-z0-9_.-]{1,64})*:(?:[a-z0-9_.-]{1,64}|\*)$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DEVICE_LOCATION_MAX_AGE = 300;
export const LIMITS = Object.freeze({ grants: 32, actions: 64, resources: 64, windows: 16, places: 64, networks: 64, resourceLength: 256 });

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** True when the IANA zone is known to this runtime. */
export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch { return false; }
}

/** Parse an IPv4 or IPv6 address to a BigInt and its bit width, or null. */
export function parseIp(ip) {
  if (typeof ip !== 'string') return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some(p => p > 255)) return null;
    return { bits: 32, value: parts.reduce((acc, p) => (acc << 8n) + BigInt(p), 0n) };
  }
  if (!/^[0-9a-fA-F:.]+$/.test(ip) || !ip.includes(':')) return null;
  let address = ip;
  const v4 = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const parsed = parseIp(v4[1]); if (!parsed) return null;
    address = address.slice(0, -v4[1].length) + ((parsed.value >> 16n).toString(16)) + ':' + ((parsed.value & 0xffffn).toString(16));
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return { bits: 128, value: groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n) };
}

/** Parse a CIDR range, or null when invalid. */
export function parseCidr(cidr) {
  if (typeof cidr !== 'string') return null;
  const [ip, prefixText, extra] = cidr.split('/');
  if (extra !== undefined || prefixText === undefined || !/^\d{1,3}$/.test(prefixText)) return null;
  const parsed = parseIp(ip); const prefix = Number(prefixText);
  if (!parsed || prefix > parsed.bits) return null;
  return { ...parsed, prefix };
}

/** True when ip is inside the CIDR range. Address families never match each other. */
export function ipInCidr(ip, cidr) {
  const address = parseIp(ip); const range = parseCidr(cidr);
  if (!address || !range || address.bits !== range.bits) return false;
  const shift = BigInt(range.bits - range.prefix);
  return (address.value >> shift) === (range.value >> shift);
}

/** Great-circle distance in meters. */
export function distanceMeters(a, b) {
  const rad = d => (d * Math.PI) / 180; const R = 6371008.8;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Does an action pattern (exact, or ending in ":*") match an action? */
export function actionMatches(pattern, action) {
  if (pattern === action) return true;
  return pattern.endsWith(':*') && action.startsWith(pattern.slice(0, -1));
}

/** Does a resource pattern ("*", "prefix*" or exact) match a resource? */
export function resourceMatches(pattern, resource) {
  if (pattern === '*') return true;
  if (typeof resource !== 'string') return false;
  if (pattern.endsWith('*')) return resource.startsWith(pattern.slice(0, -1));
  return pattern === resource;
}

/** The namespace of an action ("hashbin" for "hashbin:content:write"). */
export function actionNamespace(action) { return action.split(':')[0]; }

function checkKeys(value, allowed, path, errors) {
  if (!isObject(value)) { errors.push(`${path} must be an object`); return false; }
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is not a known constraint`);
  return true;
}

function checkStringList(value, path, errors, max, test, message) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) { errors.push(`${path} must be a list of 1–${max} entries`); return; }
  value.forEach((item, i) => { if (typeof item !== 'string' || !test(item)) errors.push(`${path}[${i}] ${message}`); });
}

/**
 * Validate one grant. Returns a list of human-readable problems (empty when valid).
 * Issuers reject anything invalid; verifiers deny grants with unknown constraints.
 */
export function validateGrant(grant, path = 'grant') {
  const errors = [];
  if (!checkKeys(grant, GRANT_KEYS, path, errors)) return errors;
  checkStringList(grant.actions, `${path}.actions`, errors, LIMITS.actions, a => ACTION.test(a), 'must look like "namespace:verb" or "namespace:*"');
  if (grant.resources !== undefined) checkStringList(grant.resources, `${path}.resources`, errors, LIMITS.resources, r => r.length > 0 && r.length <= LIMITS.resourceLength, `must be 1–${LIMITS.resourceLength} characters`);
  if (grant.when !== undefined && checkKeys(grant.when, WHEN_KEYS, `${path}.when`, errors)) {
    const { tz, windows, not_before: nb, not_after: na } = grant.when;
    if (windows !== undefined) {
      if (!validTimeZone(tz)) errors.push(`${path}.when.tz must be an IANA time zone when windows are given`);
      if (!Array.isArray(windows) || windows.length === 0 || windows.length > LIMITS.windows) errors.push(`${path}.when.windows must be a list of 1–${LIMITS.windows} windows`);
      else windows.forEach((w, i) => {
        const wp = `${path}.when.windows[${i}]`;
        if (!checkKeys(w, WINDOW_KEYS, wp, errors)) return;
        if (w.days !== undefined && (!Array.isArray(w.days) || w.days.length === 0 || w.days.some(d => !DAYS.includes(d)))) errors.push(`${wp}.days must list days from ${DAYS.join(', ')}`);
        // typeof first: RegExp.test would coerce ["08:00"] to "08:00".
        if (typeof w.from !== 'string' || !TIME.test(w.from) || w.from === '24:00') errors.push(`${wp}.from must be HH:MM (00:00–23:59)`);
        if (typeof w.to !== 'string' || !TIME.test(w.to)) errors.push(`${wp}.to must be HH:MM (00:00–24:00)`);
        if (w.from === w.to) errors.push(`${wp} from and to must differ`);
      });
    } else if (tz !== undefined && !validTimeZone(tz)) errors.push(`${path}.when.tz must be an IANA time zone`);
    for (const [k, v] of [['not_before', nb], ['not_after', na]]) if (v !== undefined && !Number.isSafeInteger(v)) errors.push(`${path}.when.${k} must be a NumericDate (seconds)`);
    if (Number.isSafeInteger(nb) && Number.isSafeInteger(na) && nb >= na) errors.push(`${path}.when.not_before must be earlier than not_after`);
  }
  if (grant.where !== undefined && checkKeys(grant.where, WHERE_KEYS, `${path}.where`, errors)) {
    const w = grant.where;
    if (!['network', 'device', 'both'].includes(w.source)) errors.push(`${path}.where.source must be "network", "device" or "both"`);
    if (w.countries !== undefined) checkStringList(w.countries, `${path}.where.countries`, errors, LIMITS.places, c => /^[A-Z]{2}$/.test(c), 'must be an ISO 3166-1 alpha-2 code like "US"');
    if (w.regions !== undefined) checkStringList(w.regions, `${path}.where.regions`, errors, LIMITS.places, r => /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(r), 'must be an ISO 3166-2 code like "US-MO"');
    if (w.areas !== undefined) {
      if (!Array.isArray(w.areas) || w.areas.length === 0 || w.areas.length > LIMITS.places) errors.push(`${path}.where.areas must be a list of 1–${LIMITS.places} areas`);
      else w.areas.forEach((a, i) => {
        const ap = `${path}.where.areas[${i}]`;
        if (!checkKeys(a, AREA_KEYS, ap, errors)) return;
        if (!(Number.isFinite(a.lat) && a.lat >= -90 && a.lat <= 90)) errors.push(`${ap}.lat must be between -90 and 90`);
        if (!(Number.isFinite(a.lon) && a.lon >= -180 && a.lon <= 180)) errors.push(`${ap}.lon must be between -180 and 180`);
        if (!(Number.isFinite(a.radius_m) && a.radius_m >= 10 && a.radius_m <= 20037508)) errors.push(`${ap}.radius_m must be between 10 and 20,037,508`);
      });
    }
    if (w.networks !== undefined) checkStringList(w.networks, `${path}.where.networks`, errors, LIMITS.networks, n => !!parseCidr(n), 'must be a CIDR range like "203.0.113.0/24"');
    if (w.countries === undefined && w.regions === undefined && w.areas === undefined && w.networks === undefined) errors.push(`${path}.where needs at least one of countries, regions, areas or networks`);
    if (w.source === 'device' && (w.countries || w.regions || w.networks)) errors.push(`${path}.where with source "device" can only use areas (a device reports coordinates, not countries or networks)`);
  }
  if (grant.limits !== undefined && checkKeys(grant.limits, LIMIT_KEYS, `${path}.limits`, errors)) {
    const { uses, spend_usd_per_month: spend } = grant.limits;
    if (uses !== undefined && checkKeys(uses, USES_KEYS, `${path}.limits.uses`, errors)) {
      if (!Number.isSafeInteger(uses.count) || uses.count < 1 || uses.count > 1e9) errors.push(`${path}.limits.uses.count must be an integer from 1 to 1,000,000,000`);
      if (!USE_PERIODS.includes(uses.per)) errors.push(`${path}.limits.uses.per must be one of ${USE_PERIODS.join(', ')}`);
    }
    if (spend !== undefined && !(Number.isFinite(spend) && spend >= 0 && spend <= 1e6)) errors.push(`${path}.limits.spend_usd_per_month must be a number from 0 to 1,000,000`);
  }
  if (grant.require !== undefined && checkKeys(grant.require, REQUIRE_KEYS, `${path}.require`, errors)) {
    for (const key of ['online', 'step_up', 'verified_boot']) if (grant.require[key] !== undefined && typeof grant.require[key] !== 'boolean') errors.push(`${path}.require.${key} must be true or false`);
    if (grant.require.attestation !== undefined && (typeof grant.require.attestation !== 'string' || !Object.hasOwn(ATTESTATION_LEVELS, grant.require.attestation))) errors.push(`${path}.require.attestation must be "hardware" or "strongbox"`);
    const apps = grant.require.app_ids;
    validateGates(grant.require, `${path}.require`, errors);
    if (grant.require.confirmation !== undefined && typeof grant.require.confirmation !== 'boolean') errors.push(`${path}.require.confirmation must be true or false`);
    if (apps !== undefined && !(Array.isArray(apps) && apps.length >= 1 && apps.length <= MAX_APP_IDS && apps.every(a => typeof a === 'string' && a.length <= 200 && (APP_ID.test(a) || ANDROID_APP_ID.test(a))))) errors.push(`${path}.require.app_ids must list 1–${MAX_APP_IDS} app ids (Apple TEAMID.bundle.id, or android:<package>:<signing certificate SHA-256, lowercase hex>)`);
  }
  return errors;
}

function validateGates(require, path, errors) {
  const { gates, gates_reuse_s: reuse } = require;
  if (gates !== undefined) {
    if (!Array.isArray(gates) || gates.length === 0 || gates.length > GATE_LIMITS.entries) errors.push(`${path}.gates must be a list of 1–${GATE_LIMITS.entries} gate entries`);
    else gates.forEach((entry, i) => {
      const ep = `${path}.gates[${i}]`;
      if (!checkKeys(entry, GATE_ENTRY_KEYS, ep, errors)) return;
      const any = entry.any;
      if (!(Array.isArray(any) && any.length >= 1 && any.length <= GATE_LIMITS.gates && any.every(g => typeof g === 'string' && (g === 'owner' || GATE_ID.test(g))) && new Set(any).size === any.length)) errors.push(`${ep}.any must list 1–${GATE_LIMITS.gates} different gates ("owner" or gate ids like "gate_01JE…")`);
      if (entry.timeout_s !== undefined && !(Number.isSafeInteger(entry.timeout_s) && entry.timeout_s >= GATE_LIMITS.minTimeout && entry.timeout_s <= GATE_LIMITS.maxTimeout)) errors.push(`${ep}.timeout_s must be an integer from ${GATE_LIMITS.minTimeout} to ${GATE_LIMITS.maxTimeout}`);
      if (entry.on_timeout !== undefined && entry.on_timeout !== 'deny' && entry.on_timeout !== 'allow') errors.push(`${ep}.on_timeout must be "deny" or "allow"`);
    });
    if (require.step_up === true) errors.push(`${path} has both step_up and gates; step_up means gates [{ "any": ["owner"] }], so list "owner" in gates instead`);
  }
  if (reuse !== undefined) {
    if (!(Number.isSafeInteger(reuse) && reuse >= 0 && reuse <= GATE_LIMITS.maxReuse)) errors.push(`${path}.gates_reuse_s must be an integer from 0 to ${GATE_LIMITS.maxReuse}`);
    if (gates === undefined && require.step_up !== true) errors.push(`${path}.gates_reuse_s needs gates or step_up`);
  }
}

/**
 * The gate entries a valid grant requires, with defaults filled in, or null when it requires none.
 * `require.step_up: true` yields STEP_UP_GATES.
 */
export function grantGates(grant) {
  const require = isObject(grant) ? grant.require : undefined;
  if (Array.isArray(require?.gates)) return require.gates.map(e => ({ any: [...e.any], timeout_s: e.timeout_s ?? GATE_LIMITS.defaultTimeout, on_timeout: e.on_timeout ?? 'deny' }));
  if (require?.step_up === true) return STEP_UP_GATES.map(e => ({ ...e, any: [...e.any] }));
  return null;
}

/** The gates part of an audience's catalog entry (spec/evaluation.md §3.8), or null. */
function gatePolicy(policy) {
  return isObject(policy) && isObject(policy.gates) ? policy.gates : null;
}

/** Validate a grant list. */
export function validateGrants(grants) {
  if (!Array.isArray(grants) || grants.length === 0 || grants.length > LIMITS.grants) return [`grants must be a list of 1–${LIMITS.grants} grants`];
  return grants.flatMap((grant, i) => validateGrant(grant, `grants[${i}]`));
}

/** Local weekday and minutes since midnight at an instant in a zone. */
export function localTime(nowSeconds, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(nowSeconds * 1000)).map(p => [p.type, p.value]));
  return { day: DAYS.indexOf(parts.weekday.toLowerCase().slice(0, 3)), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Is an instant inside a window? Overnight windows (from > to) belong to the day they start on. */
export function inWindow(window, local) {
  const days = window.days || DAYS;
  const from = minutes(window.from); const to = window.to === '24:00' ? 1440 : minutes(window.to);
  const today = DAYS[local.day]; const yesterday = DAYS[(local.day + 6) % 7];
  if (from < to) return days.includes(today) && local.minutes >= from && local.minutes < to;
  return (days.includes(today) && local.minutes >= from) || (days.includes(yesterday) && local.minutes < to);
}

function placeMatches(where, loc, kind) {
  if (kind === 'network') {
    if (where.countries?.includes(loc.country)) return true;
    if (where.regions?.includes(loc.region)) return true;
  }
  if (where.areas && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
    // Accuracy is held against the device: unknown or negative accuracy (which would shrink the
    // distance and match anywhere) never matches.
    const slack = kind === 'device' ? (Number.isFinite(loc.acc_m) && loc.acc_m >= 0 ? loc.acc_m : Infinity) : 0;
    return where.areas.some(area => distanceMeters(area, loc) + slack <= area.radius_m);
  }
  return false;
}

function checkSource(where, loc, kind, now, reasons) {
  if (!loc) { reasons.push(`location_unavailable:${kind}`); return; }
  if (kind === 'device' && !(Number.isFinite(loc.t) && Math.abs(now - loc.t) <= DEVICE_LOCATION_MAX_AGE)) { reasons.push('location_stale:device'); return; }
  const places = where.countries || where.regions || where.areas;
  if (places && !placeMatches(where, loc, kind)) reasons.push(`outside_location:${kind}`);
  if (kind === 'network' && where.networks && !where.networks.some(n => ipInCidr(loc.ip, n))) reasons.push('network_not_allowed');
}

/**
 * Evaluate one grant against a request context. Returns { ok, reasons, online }.
 * `online` lists the checks only devicebasedauth.org can make (usage counters, step-up).
 */
export function evaluateGrant(grant, context) {
  const reasons = []; const online = {};
  const unknown = !isObject(grant) ? ['grant'] : [
    ...Object.keys(grant).filter(k => !GRANT_KEYS.has(k)),
    ...(isObject(grant.when) ? Object.keys(grant.when).filter(k => !WHEN_KEYS.has(k)).map(k => `when.${k}`) : []),
    ...(isObject(grant.where) ? Object.keys(grant.where).filter(k => !WHERE_KEYS.has(k)).map(k => `where.${k}`) : []),
    ...(isObject(grant.limits) ? Object.keys(grant.limits).filter(k => !LIMIT_KEYS.has(k)).map(k => `limits.${k}`) : []),
    ...(isObject(grant.require) ? Object.keys(grant.require).filter(k => !REQUIRE_KEYS.has(k)).map(k => `require.${k}`) : [])
  ];
  if (unknown.length) return { ok: false, reasons: unknown.map(k => `unknown_constraint:${k}`), online };
  if (validateGrant(grant).length) return { ok: false, reasons: ['invalid_grant'], online };
  const now = context.now;
  if (!grant.actions.some(p => actionMatches(p, context.action))) reasons.push('action_not_granted');
  if (!(grant.resources || ['*']).some(p => resourceMatches(p, context.resource))) reasons.push('resource_not_granted');
  const when = grant.when;
  if (when) {
    if (when.not_before !== undefined && now < when.not_before) reasons.push('before_not_before');
    if (when.not_after !== undefined && now >= when.not_after) reasons.push('after_not_after');
    if (when.windows) {
      const local = localTime(now, when.tz);
      if (!when.windows.some(w => inWindow(w, local))) reasons.push('outside_time_window');
    }
  }
  const where = grant.where;
  if (where) {
    const location = context.location || {};
    if (where.source === 'network' || where.source === 'both') checkSource(where, location.network, 'network', now, reasons);
    if (where.source === 'device' || where.source === 'both') checkSource(where, location.device, 'device', now, reasons);
  }
  // Key attestation is a fact about the credential (device.attestation, signed by the issuer),
  // so it is checked offline like time and place.
  const attestation = isObject(context.attestation) ? context.attestation : null;
  const apps = grant.require?.app_ids;
  // Android's app identity comes from the OS, not the secure hardware, so it counts only when the
  // same attestation shows verified boot and a locked bootloader (spec/evaluation.md §3.6). Each
  // kind of app id matches only its own attestation format.
  const android = attestation?.format === 'android-key';
  const appTrusted = android ? attestation.verified_boot === 'verified' && attestation.device_locked === true : true;
  const appListed = Boolean(attestation) && Array.isArray(apps) && typeof attestation.app_id === 'string' && apps.includes(attestation.app_id)
    && attestation.app_id.startsWith('android:') === android && appTrusted;
  if (grant.require?.attestation !== undefined) {
    // Apple App Attest vouches for the app that reported the key, not for the key itself, so it
    // counts only for production builds of apps the grant names (spec/evaluation.md §3.6).
    const vouchedByApp = attestation?.format === 'apple-appattest';
    if (!(attestation && ATTESTATION_LEVELS[grant.require.attestation].includes(attestation.security_level)) || (vouchedByApp && !(appListed && attestation.environment === 'production'))) reasons.push('attestation_required');
  }
  if (apps !== undefined && !appListed) reasons.push('attested_app_required');
  if (grant.require?.verified_boot && !(attestation && attestation.verified_boot === 'verified' && attestation.device_locked === true)) reasons.push('verified_boot_required');
  // A confirmation is checked offline too: verifiers verify the DBA-Confirmation header and pass
  // its claims in, DBA's own /authorize passes its record (spec/evaluation.md §3.6).
  const policy = gatePolicy(context.policy);
  if (grant.require?.confirmation) {
    const c = context.confirmation;
    if (!isObject(c) || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || now + CONFIRMATION_SKEW < c.iat) reasons.push('confirmation_required');
    else if (now - CONFIRMATION_SKEW >= c.exp) reasons.push('confirmation_expired');
    else if (c.by_timeout !== false && policy?.fail_open === false) reasons.push('confirmation_by_timeout_refused');
  }
  const gates = grantGates(grant);
  if (policy?.require === true) {
    // Only DBA knows each gate's kind, so a policy that requires gates is checked online; offline
    // it makes the grant online-only (spec/evaluation.md §3.8).
    online.gate_policy = true;
    if (context.online) {
      const kinds = isObject(context.gate_kinds) ? context.gate_kinds : {};
      const kindOf = id => id === 'owner' ? 'owner' : Object.hasOwn(kinds, id) ? kinds[id] : undefined;
      const accepted = kind => typeof kind === 'string' && (!Array.isArray(policy.kinds) || policy.kinds.includes(kind));
      if (!(gates && gates.some(entry => entry.any.every(id => accepted(kindOf(id)))))) reasons.push('gate_required');
    }
  }
  if (grant.limits?.uses) online.uses = grant.limits.uses;
  if (grant.require?.step_up) online.step_up = true;
  if (gates) {
    online.gates = gates;
    online.gates_reuse_s = grant.require.gates_reuse_s ?? 0;
    if (policy?.fail_open === false) online.fail_open = false;
  }
  if (grant.require?.online) online.required = true;
  if (!reasons.length && Object.keys(online).length && !context.online) reasons.push('online_required');
  return { ok: reasons.length === 0, reasons, online };
}

/**
 * Evaluate every grant. Allow when any grant passes (deny by default).
 * context: { now (seconds), action, resource, location: { network, device }, online,
 *   attestation: the credential's device.attestation, if any,
 *   confirmation: { iat, exp, by_timeout } of a verified confirmation, if any,
 *   policy: the audience's catalog entry for the action ({ gates: { require, kinds, fail_open } }),
 *   gate_kinds: { gate id: kind } (online only) }
 */
export function evaluateGrants(grants, context) {
  if (!Array.isArray(grants)) return { allow: false, grant_index: null, reasons: [['invalid_grants']], online_required: false };
  const results = grants.map(g => evaluateGrant(g, context));
  const index = results.findIndex(r => r.ok);
  const onlineRequired = index < 0 && results.some(r => r.reasons.length === 1 && r.reasons[0] === 'online_required');
  return {
    allow: index >= 0, grant_index: index >= 0 ? index : null,
    grant: index >= 0 ? grants[index] : null,
    online: index >= 0 ? results[index].online : {},
    caveats: index >= 0 && grants[index].limits?.spend_usd_per_month !== undefined ? { spend_usd_per_month: grants[index].limits.spend_usd_per_month } : {},
    reasons: results.map(r => r.reasons), online_required: onlineRequired, results
  };
}

/** Length of a usage period in seconds (total = Infinity). */
export function periodSeconds(per) { return PERIOD_SECONDS[per] ?? Infinity; }

const deepEqual = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const patternCovered = (child, parents, matches) => parents.some(p => {
  if (p === child) return true;
  if (!child.endsWith('*')) return matches(p, child);
  return p.endsWith('*') && child.startsWith(p.slice(0, -1));
});

/** "android:<package>:<sha256>" reads as the Android package and the start of its signer digest. */
function describeAppId(id) {
  const android = /^android:([^:]+):([0-9a-f]{64})$/.exec(String(id));
  return android ? `${android[1]} (Android, signed by ${android[2].slice(0, 16)}…)` : String(id);
}

/**
 * Conservative check that a child grant can never allow more than a parent grant:
 * every action and resource is covered, and every parent constraint appears unchanged.
 */
export function isNarrowing(child, parent) {
  if (!child.actions.every(a => patternCovered(a, parent.actions, actionMatches))) return false;
  const parentResources = parent.resources || ['*'];
  if (!(child.resources || ['*']).every(r => patternCovered(r, parentResources, resourceMatches))) return false;
  for (const key of ['when', 'where', 'limits', 'require']) if (parent[key] !== undefined && !deepEqual(child[key], parent[key])) return false;
  return true;
}

/** Is every child grant a narrowing of some parent grant? */
export function grantsNarrow(childGrants, parentGrants) {
  return childGrants.every(child => parentGrants.some(parent => isNarrowing(child, parent)));
}

const DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
function list(items, joiner = 'or') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1)}`;
}
function describeDays(days) {
  if (!days || days.length === 7) return 'every day';
  const key = DAYS.filter(d => days.includes(d)).join(',');
  if (key === 'mon,tue,wed,thu,fri') return 'weekdays';
  if (key === 'sun,sat') return 'weekends';
  return list(DAYS.filter(d => days.includes(d)).map(d => DAY_NAMES[d]));
}
const iso = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');

/** "2 minutes", "1 hour", "90 seconds". */
export function describeSeconds(seconds) {
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (seconds % 86400 === 0) return unit(seconds / 86400, 'day');
  if (seconds % 3600 === 0) return unit(seconds / 3600, 'hour');
  if (seconds % 60 === 0) return unit(seconds / 60, 'minute');
  return unit(seconds, 'second');
}

/** One gate entry in plain English; allow-on-timeout says plainly that silence lets it through. */
export function describeGateEntry(entry) {
  const who = list(entry.any.map(g => g === 'owner' ? 'the account owner' : `gate ${g}`));
  const wait = describeSeconds(entry.timeout_s ?? GATE_LIMITS.defaultTimeout);
  return entry.on_timeout === 'allow'
    ? `approved by ${who}, or allowed anyway if nobody answers within ${wait}`
    : `approved by ${who} within ${wait}`;
}

/** Describe a grant in plain English. */
export function describeGrant(grant) {
  if (!isObject(grant) || !Array.isArray(grant.actions)) return 'An invalid grant (it allows nothing).';
  const parts = [`May ${list(grant.actions.map(a => `"${a}"`))}`];
  const resources = grant.resources || ['*'];
  parts.push(resources.length === 1 && resources[0] === '*' ? 'on any resource' : `on ${list(resources.map(r => r.endsWith('*') ? `resources starting with "${r.slice(0, -1)}"` : `"${r}"`))}`);
  const when = grant.when;
  if (when?.windows) parts.push(`${list(when.windows.map(w => `${describeDays(w.days)} ${w.from}–${w.to}`))} (${when.tz} time)`);
  if (when?.not_before !== undefined) parts.push(`from ${iso(when.not_before)}`);
  if (when?.not_after !== undefined) parts.push(`until ${iso(when.not_after)}`);
  const where = grant.where;
  if (where) {
    const places = [...(where.countries || []), ...(where.regions || []), ...(where.areas || []).map(a => `within ${a.radius_m >= 1000 ? `${+(a.radius_m / 1000).toFixed(1)} km` : `${a.radius_m} m`} of ${a.lat},${a.lon}`)];
    const source = { network: 'as seen from its network connection', device: 'as reported by the device', both: 'both as seen from its network and as reported by the device' }[where.source] || '';
    if (places.length) parts.push(`only from ${list(places)} (${source})`);
    if (where.networks) parts.push(`only from network ${list(where.networks)}`);
  }
  const uses = grant.limits?.uses;
  if (uses) parts.push(uses.per === 'total' ? `at most ${uses.count} time${uses.count === 1 ? '' : 's'} in total` : `at most ${uses.count} time${uses.count === 1 ? '' : 's'} per ${uses.per}`);
  if (grant.limits?.spend_usd_per_month !== undefined) parts.push(`spending at most $${grant.limits.spend_usd_per_month.toFixed(2)} per month`);
  if (grant.require?.attestation === 'strongbox') parts.push('only with a key attested to be in a StrongBox secure element');
  else if (grant.require?.attestation === 'hardware') parts.push('only with a key attested to be in secure hardware');
  if (Array.isArray(grant.require?.app_ids)) parts.push(`only from the attested app${grant.require.app_ids.length > 1 ? 's' : ''} ${grant.require.app_ids.map(describeAppId).join(', ')}`);
  if (grant.require?.verified_boot) parts.push('only from a device attested to have verified boot and a locked bootloader');
  if (grant.require?.step_up) parts.push('with the owner approving each use');
  if (Array.isArray(grant.require?.gates)) for (const entry of grantGates(grant)) parts.push(describeGateEntry(entry));
  if (grant.require?.gates_reuse_s) parts.push(`one approval covering repeated uses for ${describeSeconds(grant.require.gates_reuse_s)}`);
  if (grant.require?.confirmation) parts.push('only while the device holds a recent confirmation');
  if (grant.require?.online) parts.push('checked online with devicebasedauth.org every time');
  return `${parts.join(', ')}.`;
}
