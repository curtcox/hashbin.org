#!/usr/bin/env node
/**
 * Publish files to HashBin from the command line through a scoped OAuth grant.
 *
 *   node scripts/publish.mjs authorize [--limit 5] [--max-retention 12]
 *                                                    one-time browser approval
 *   node scripts/publish.mjs publish <file> [--type text/plain]
 *   node scripts/publish.mjs balance
 *   node scripts/publish.mjs forget                  revoke and delete the stored token
 *                                                    (revoke the whole grant on the Account page)
 *
 * The grant has only content:write and balance:read, a monthly spending limit and
 * optionally a retention cap, all enforced by HashBin; the approval page can narrow them. Its refresh token lives in the macOS Keychain, never in
 * the repo or in process arguments. Refresh tokens rotate on every use and expire
 * after 30 days without one; rerun `authorize` if publishing reports invalid_grant.
 * OAuth uploads use the account's default retention (Account settings).
 *
 * HASHBIN_URL and HASHBIN_CLIENT_ID override the defaults (e.g. for npm run dev:local).
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname } from 'node:path';

// Public client ID of the "Claude Code publisher" app; not a secret.
export const DEFAULT_CLIENT_ID = 'app_1932999d-125c-4cf6-bf56-806d6df1fa3a';
export const DEFAULT_BASE_URL = 'https://hashbin.org';
export const REDIRECT_PORT = 8765;
export const redirectUri = (port = REDIRECT_PORT) => `http://127.0.0.1:${port}/callback`;
export const REDIRECT_URI = redirectUri();
export const SCOPES = 'content:write balance:read';
const AUTHORIZE_TIMEOUT_MS = 5 * 60 * 1000;

const MIME_TYPES = {
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mjs': 'text/javascript',
  '.mp4': 'video/mp4',
  '.org': 'text/plain',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
};

export function mimeTypeFor(file) {
  return MIME_TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl({ baseUrl, clientId, challenge, state, spendingLimit, maxRetentionMonths, port = REDIRECT_PORT }) {
  const url = new URL('/oauth/authorize', baseUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(port),
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    spending_limit: String(spendingLimit),
    ...(maxRetentionMonths ? { max_retention_months: String(maxRetentionMonths) } : {}),
  }).toString();
  return url.toString();
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      options[arg.slice(2)] = rest[++i];
    } else {
      options._.push(arg);
    }
  }
  return { command, options };
}

// Keychain item names separate hosts, so a local dev grant never replaces production's.
export function keychainService(baseUrl) {
  return `hashbin-publish:${new URL(baseUrl).host}`;
}

// `security -i` reads commands from stdin, keeping the token out of the process list.
export function keychainStore(service, account, secret) {
  const quote = (value) => `"${String(value).replace(/(["\\])/g, '\\$1')}"`;
  const command = `add-generic-password -U -s ${quote(service)} -a ${quote(account)} -w ${quote(secret)}\n`;
  const result = spawnSync('security', ['-i'], { input: command, encoding: 'utf8' });
  if (result.status !== 0 || /error/i.test(result.stderr || '')) {
    throw new Error(`Could not save the token to the Keychain: ${(result.stderr || '').trim()}`);
  }
}

export function keychainRead(service, account) {
  const result = spawnSync('security', ['find-generic-password', '-s', service, '-a', account, '-w'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function keychainDelete(service, account) {
  spawnSync('security', ['delete-generic-password', '-s', service, '-a', account], { encoding: 'utf8' });
}

async function postJson(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status}): ${data.error || ''} ${data.message || ''}`.trim());
  }
  return data;
}

/**
 * Exchange the stored refresh token for an access token. The server rotates the
 * refresh token, so the new one is saved before the access token is used.
 */
export async function getAccessToken({ baseUrl, clientId, fetchImpl = fetch, keychain }) {
  const service = keychainService(baseUrl);
  const refreshToken = keychain.read(service, clientId);
  if (!refreshToken) {
    throw new Error('No stored grant. Run: node scripts/publish.mjs authorize');
  }
  const tokens = await postJson(fetchImpl, new URL('/oauth/token', baseUrl).toString(), {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  keychain.store(service, clientId, tokens.refresh_token);
  return tokens.access_token;
}

export async function publishFile({ baseUrl, clientId, file, type, fetchImpl = fetch, keychain }) {
  const body = await readFile(file);
  const accessToken = await getAccessToken({ baseUrl, clientId, fetchImpl, keychain });
  const response = await fetchImpl(new URL('/api/content', baseUrl).toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': type || mimeTypeFor(file),
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Publishing ${basename(file)} failed (${response.status}): ${data.error || ''} ${data.message || ''}`.trim());
  }
  return data;
}

export async function getBalance({ baseUrl, clientId, fetchImpl = fetch, keychain }) {
  const accessToken = await getAccessToken({ baseUrl, clientId, fetchImpl, keychain });
  const response = await fetchImpl(new URL('/api/balance', baseUrl).toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Balance failed (${response.status}): ${data.error || ''} ${data.message || ''}`.trim());
  }
  return data;
}

/** Wait for the browser to return to the loopback redirect URI with a code. */
export function waitForCallback({ state, port = REDIRECT_PORT, timeoutMs = AUTHORIZE_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const finish = (status, message, error, code) => {
        response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(message);
        clearTimeout(timer);
        server.close();
        if (error) reject(error);
        else resolve(code);
      };
      if (url.searchParams.get('state') !== state) {
        finish(400, 'State mismatch. Close this tab and run authorize again.', new Error('OAuth state mismatch'));
      } else if (url.searchParams.get('error')) {
        finish(400, 'Authorization was not granted. You can close this tab.', new Error(`Authorization denied: ${url.searchParams.get('error')}`));
      } else if (!url.searchParams.get('code')) {
        finish(400, 'No authorization code. Close this tab and run authorize again.', new Error('No authorization code'));
      } else {
        finish(200, 'HashBin publishing is authorized. You can close this tab.', null, url.searchParams.get('code'));
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for approval in the browser'));
    }, timeoutMs);
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

// `port` exists for tests; the registered app accepts only REDIRECT_PORT.
export async function authorize({ baseUrl, clientId, spendingLimit, maxRetentionMonths, fetchImpl = fetch, keychain, openUrl, log = console.log, port = REDIRECT_PORT }) {
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');
  const callback = waitForCallback({ state, port });
  const url = buildAuthorizeUrl({ baseUrl, clientId, challenge, state, spendingLimit, maxRetentionMonths, port });
  log(`Approve publishing in your browser (monthly limit $${spendingLimit}):\n${url}`);
  openUrl(url);
  const code = await callback;
  const tokens = await postJson(fetchImpl, new URL('/oauth/token', baseUrl).toString(), {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(port),
    client_id: clientId,
    code_verifier: verifier,
  });
  keychain.store(keychainService(baseUrl), clientId, tokens.refresh_token);
  return { scope: tokens.scope };
}

export async function forget({ baseUrl, clientId, fetchImpl = fetch, keychain }) {
  const service = keychainService(baseUrl);
  const refreshToken = keychain.read(service, clientId);
  if (refreshToken) {
    await fetchImpl(new URL('/oauth/revoke', baseUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: refreshToken, token_type_hint: 'refresh_token' }),
    }).catch(() => {});
  }
  keychain.delete(service, clientId);
}

const macKeychain = { read: keychainRead, store: keychainStore, delete: keychainDelete };

// HASHBIN_NO_OPEN=1 only prints the approval URL (for another browser, or tests).
function openInBrowser(url) {
  if (process.env.HASHBIN_NO_OPEN) return;
  spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.HASHBIN_URL || DEFAULT_BASE_URL;
  const clientId = process.env.HASHBIN_CLIENT_ID || DEFAULT_CLIENT_ID;
  if (!clientId) throw new Error('No client ID. Set HASHBIN_CLIENT_ID or DEFAULT_CLIENT_ID.');
  const context = { baseUrl, clientId, keychain: macKeychain };

  if (command === 'authorize') {
    const spendingLimit = Number(options.limit ?? 5);
    if (!(spendingLimit > 0)) throw new Error('--limit must be a positive number of dollars per month');
    const maxRetentionMonths = options['max-retention'] === undefined ? undefined : Number(options['max-retention']);
    if (maxRetentionMonths !== undefined && !(Number.isInteger(maxRetentionMonths) && maxRetentionMonths >= 1 && maxRetentionMonths <= 120)) {
      throw new Error('--max-retention must be a whole number of months from 1 to 120');
    }
    const { scope } = await authorize({ ...context, spendingLimit, maxRetentionMonths, openUrl: openInBrowser });
    console.log(`Authorized (${scope}). The refresh token is in the Keychain as ${keychainService(baseUrl)}.`);
  } else if (command === 'publish') {
    const [file] = options._;
    if (!file) throw new Error('Usage: node scripts/publish.mjs publish <file> [--type mime/type]');
    console.log(JSON.stringify(await publishFile({ ...context, file, type: options.type }), null, 2));
  } else if (command === 'balance') {
    console.log(JSON.stringify(await getBalance(context), null, 2));
  } else if (command === 'forget') {
    await forget(context);
    console.log('Revoked the stored grant and removed it from the Keychain.');
  } else {
    throw new Error('Usage: node scripts/publish.mjs authorize|publish|balance|forget');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
