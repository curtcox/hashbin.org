import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secret = randomBytes(32).toString('hex'), oauth = randomBytes(32).toString('hex');
// workerd's Linux build samples allocations with tcmalloc, whose frame-pointer
// unwinder can segfault on Rust (hyper) frames that keep no frame pointer. That
// runtime crash is not application behavior, so it alone earns one fresh retry.
const runtimeCrash = /\*\*\* (?:Received signal #\d+|Fatal uncaught|std::terminate\(\))/;
let temporary, children = [];
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const number = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return number;
}
function start(label, args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...env } });
  const state = { label, child, output: '', exited: false, code: null };
  child.stdout.on('data', value => { state.output = (state.output + value).slice(-4000); });
  child.stderr.on('data', value => { state.output = (state.output + value).slice(-4000); });
  child.on('error', error => { state.output += error.message; state.exited = true; state.code = 1; });
  child.on('exit', code => { state.exited = true; state.code = code; });
  children.push(state); return state;
}
async function ready(state, url, configuration = false) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    if (state.exited) throw new Error('Local Worker exited before readiness');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (!configuration || (await response.json()).isLocalMode === true)) return;
    } catch { /* Startup is not yet ready. */ }
    await wait(200);
  }
  throw new Error('Local Worker startup timed out');
}
function signal(state, value) {
  try { if (process.platform === 'win32') state.child.kill(value); else process.kill(-state.child.pid, value); }
  catch { /* The process group may already have exited. */ }
}
async function cleanup() {
  for (const state of children) signal(state, 'SIGTERM');
  for (let i = 0; i < 20 && children.some(state => !state.exited); i++) await wait(100);
  for (const state of children) signal(state, 'SIGKILL');
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
let interrupted = false;
for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => {
  interrupted = true;
  for (const state of children) signal(state, 'SIGTERM');
});
async function acceptance() {
  temporary = await mkdtemp(join(tmpdir(), 'hashbin-funded-check-'));
  const suffix = randomBytes(6).toString('hex');
  const mainName = `hashbin-funded-${suffix}-main`, contentName = `hashbin-funded-${suffix}-content`;
  let main = await readFile(join(root, 'wrangler.local.toml'), 'utf8');
  let content = await readFile(join(root, 'workers/256t-content/wrangler.local.toml'), 'utf8');
  main = main.replace(/^name = "hashbin-worker-local"/m, `name = ${JSON.stringify(mainName)}`)
    .replace(/^main = "src\/index.js"/m, `main = ${JSON.stringify(join(root, 'src/index.js'))}`)
    .replace(/^directory = "\.\/frontend"/m, `directory = ${JSON.stringify(join(root, 'frontend'))}`);
  content = content.replace(/^name = "256t-content-local"/m, `name = ${JSON.stringify(contentName)}`)
    .replace(/^main = "src\/index.js"/m, `main = ${JSON.stringify(join(root, 'workers/256t-content/src/index.js'))}`);
  main = main.replaceAll('script_name = "hashbin-worker-local"', `script_name = ${JSON.stringify(mainName)}`);
  content = content.replaceAll('script_name = "hashbin-worker-local"', `script_name = ${JSON.stringify(mainName)}`);
  if (!main.includes(`name = "${mainName}"`) || !content.includes(`name = "${contentName}"`) ||
    main.includes('script_name = "hashbin-worker-local"') || content.includes('script_name = "hashbin-worker-local"')) throw new Error('Local config isolation failed');
  const mainPath = join(temporary, 'main.toml'), contentPath = join(temporary, 'content.toml');
  await writeFile(mainPath, main, { mode: 0o600 }); await writeFile(contentPath, content, { mode: 0o600 });
  const mainPort = await port(), contentPort = await port();
  const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
  const options = async (path, number, name) => [wrangler, 'dev', '--config', path, '--local', '--ip', '127.0.0.1', '--port', String(number),
    '--inspector-port', String(await port()), '--persist-to', join(temporary, name), '--log-level', 'error',
    '--var', `DOWNLOAD_TOKEN_SECRET:${secret}`, '--var', `OAUTH_SIGNING_KEY:${oauth}`];
  const base = `http://127.0.0.1:${mainPort}`, contentBase = `http://127.0.0.1:${contentPort}`;
  const server = start('main Worker', await options(mainPath, mainPort, 'main-state'), { WRANGLER_LOG_PATH: join(temporary, 'main.log') });
  await ready(server, `${base}/api/config`, true);
  const contentServer = start('content Worker', await options(contentPath, contentPort, 'content-state'), { WRANGLER_LOG_PATH: join(temporary, 'content.log') });
  await ready(contentServer, `${contentBase}/health`);
  const test = start('acceptance test', [join(root, 'scripts/api-tests/test-local-funded-downloads.mjs')], { BASE_URL: base, CONTENT_BASE_URL: contentBase });
  const code = await new Promise(resolve => { test.child.once('exit', resolve); if (test.exited) resolve(test.code); });
  if (code !== 0 || interrupted) throw new Error('Native funded acceptance failed');
  process.stdout.write(test.output);
}
for (let attempt = 1; ; attempt++) {
  children = []; temporary = undefined;
  try { await acceptance(); break; }
  catch (error) {
    console.error(error.message);
    for (const state of children) {
      const safe = state.output.replaceAll(secret, '[local secret]').replaceAll(oauth, '[local secret]');
      if (safe.trim()) console.error(`--- ${state.label} output ---\n${safe}`);
    }
    const crashed = children.find(state => state.label.endsWith('Worker') && runtimeCrash.test(state.output));
    if (attempt > 1 || interrupted || !crashed) { process.exitCode = 1; break; }
    const notice = `workerd crashed in the ${crashed.label}; retrying once with fresh local Workers`;
    console.error(process.env.GITHUB_ACTIONS ? `::warning::${notice}` : notice);
  } finally { await cleanup(); }
}
