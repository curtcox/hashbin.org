import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { costPeriodBounds } from '../src/utils/cost-period.js';
import { COST_USAGE_UNITS, priceCostUsage, validCostUsage } from '../src/utils/cost-measurements.js';

// An hba_ admin key (with admin:costs) goes in Authorization; anything else is the legacy admin token.
export function adminCredentialHeaders(credential) {
  return credential.startsWith('hba_') ? { Authorization: `ApiKey ${credential}` } : { 'X-Admin-Token': credential };
}

export async function exportCostHistory(baseUrl, token, request = fetch) {
  const base = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))) throw new Error('Use HTTPS or a loopback HTTP endpoint');
  if (!token) throw new Error('Set COST_SAFETY_ADMIN_KEY (an admin:costs admin key) or COST_SAFETY_ADMIN_TOKEN for a history export');
  const snapshots = [], cursors = new Set();
  let before;
  for (let page = 0; page < 100; page++) {
    const url = new URL('/api/admin/cost-safety/history', base);
    url.searchParams.set('limit', '1000'); if (before) url.searchParams.set('before', before);
    const response = await request(url, { headers: adminCredentialHeaders(token), redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`History export HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.snapshots) || !(data.next_before === null || typeof data.next_before === 'string')) throw new Error('Invalid history page');
    snapshots.push(...data.snapshots);
    if (data.next_before === null) return { exported_at: new Date().toISOString(), snapshots };
    if (!data.next_before || cursors.has(data.next_before)) throw new Error('History pagination did not advance');
    cursors.add(data.next_before); before = data.next_before;
  }
  throw new Error('History export exceeded 100 pages');
}

export function reconcileCostReports(document, invoice = null, period = null) {
  if (!Array.isArray(document?.snapshots)) throw new Error('Supply an exported snapshots array');
  if (period) costPeriodBounds(period);
  const latest = new Map();
  for (const snapshot of document.snapshots) {
    costPeriodBounds(snapshot?.period);
    const at = Date.parse(snapshot.recorded_at);
    if (!Number.isFinite(at) || !Number.isFinite(snapshot.costs_cents) || snapshot.costs_cents < 0) throw new Error('Invalid cost snapshot');
    if (period && snapshot.period !== period) continue;
    const old = latest.get(snapshot.period);
    if (!old || Date.parse(old.recorded_at) < at) latest.set(snapshot.period, snapshot);
  }
  if (period && !latest.size) throw new Error('Requested period has no snapshots');
  if (invoice) {
    costPeriodBounds(invoice.period);
    if (!Number.isFinite(invoice.variable_cost_cents) || invoice.variable_cost_cents < 0) throw new Error('Invoice variable_cost_cents must be nonnegative');
    if (!latest.has(invoice.period)) throw new Error('Invoice period has no snapshots');
  }
  const reports = [...latest.values()].sort((a, b) => a.period.localeCompare(b.period)).map(snapshot => {
    const complete = snapshot.closed_month === true && Date.parse(snapshot.usage_end) === costPeriodBounds(snapshot.period).end.getTime();
    const measured = snapshot.usage != null;
    if (measured && !validCostUsage(snapshot.usage)) throw new Error('Invalid retained measurements');
    const revenueKnown = snapshot.revenue_known !== false && Number.isFinite(snapshot.revenue_kept_cents);
    const result = { period: snapshot.period, recorded_at: snapshot.recorded_at, usage_end: snapshot.usage_end || snapshot.recorded_at,
      complete_month: complete, estimated_variable_cost_cents: snapshot.costs_cents,
      kept_revenue_cents: revenueKnown ? snapshot.revenue_kept_cents : null,
      estimated_margin_cents: revenueKnown ? snapshot.revenue_kept_cents - snapshot.costs_cents : null,
      usage: measured ? snapshot.usage : null,
      repriced_with_current_policy_cents: measured ? Object.values(priceCostUsage(snapshot.usage)).reduce((a, b) => a + b, 0) : null };
    if (invoice?.period === snapshot.period) {
      if (!complete) throw new Error('Invoice comparison requires a completed-month snapshot');
      result.invoice_variable_cost_cents = invoice.variable_cost_cents;
      result.invoice_minus_estimate_cents = invoice.variable_cost_cents - snapshot.costs_cents;
    }
    return result;
  });
  return { usage_units: COST_USAGE_UNITS, reports,
    notes: ['Latest cumulative snapshot per period; snapshots are never summed.',
      'Estimates exclude fixed costs and ignore included allowances; normalize invoice variable charges before comparing.',
      'Repricing uses the current repository policy. Aggregate measurements do not establish per-action operation counts or traffic distributions.'] };
}

async function main() {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!['--input', '--invoice', '--period', '--base-url', '--output'].includes(key) || !process.argv[i + 1]) throw new Error('Usage: --input history.json [--invoice invoice.json] [--period YYYY-MM] [--output file], or --base-url https://host [--output file]');
    options[key] = process.argv[i + 1];
  }
  if (Boolean(options['--base-url']) === Boolean(options['--input'])) throw new Error('Choose either --base-url for read-only export or --input for reconciliation');
  if (options['--base-url'] && (options['--invoice'] || options['--period'])) throw new Error('Reconcile exported data with a separate --input invocation');
  const result = options['--base-url'] ? await exportCostHistory(options['--base-url'], process.env.COST_SAFETY_ADMIN_KEY || process.env.COST_SAFETY_ADMIN_TOKEN)
    : reconcileCostReports(JSON.parse(await readFile(options['--input'], 'utf8')),
      options['--invoice'] ? JSON.parse(await readFile(options['--invoice'], 'utf8')) : null, options['--period']);
  const output = JSON.stringify(result, null, 2) + '\n';
  if (options['--output']) {
    if ([options['--input'], options['--invoice']].filter(Boolean).some(input => resolve(input) === resolve(options['--output']))) throw new Error('Output must not overwrite an input file');
    await writeFile(options['--output'], output, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(output);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
