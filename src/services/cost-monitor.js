import { DOWNLOAD_COST_DOLLARS } from '../utils/cost-policy.js';
import { costPeriodBounds } from '../utils/cost-period.js';
import { COST_USAGE_UNITS, priceCostUsage } from '../utils/cost-measurements.js';
import { COST_POLICY as P } from '../utils/cost-policy.js';

const API = 'https://api.cloudflare.com/client/v4';

async function graphql(env, query, variables) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error('Cloudflare analytics query failed; verify token, dataset access and schema');
  return result.data;
}

// Discover the current account schema before selecting billable fields. Never
// substitute CPU percentiles for total CPU or silently treat unavailable usage as 0.
export async function verifyAnalyticsSchema(env) {
  const types = {
    workers: ['AccountWorkersInvocationsAdaptiveSum', ['requests', 'cpuTimeUs']],
    periodic: ['AccountDurableObjectsPeriodicGroupsSum', ['duration', 'rowsRead', 'rowsWritten']],
    storage: ['AccountDurableObjectsStorageGroupsMax', ['storedBytes']]
  };
  const query = `{ ${Object.entries(types).map(([key, [type]]) => `${key}: __type(name: "${type}") { fields { name } }`).join('\n')} }`;
  const data = await graphql(env, query);
  for (const [key, [, fields]] of Object.entries(types)) {
    const available = new Set(data[key]?.fields?.map(f => f.name));
    if (fields.some(f => !available.has(f))) throw new Error(`Analytics schema missing required ${key} billing fields`);
  }
}

export const USAGE_QUERY = `query Costs($account: string!, $start: Time!, $end: Time!, $scripts: [string!]) {
  viewer { accounts(filter: {accountTag: $account}) {
    workers: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: $start, datetime_lt: $end, scriptName_in: $scripts}) {
      sum { requests cpuTimeUs }
    }
    operations: r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
      sum { requests } dimensions { actionType }
    }
    r2: r2StorageAdaptiveGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
      max { payloadSize metadataSize } dimensions { bucketName }
    }
    invocations: durableObjectsInvocationsAdaptiveGroups(limit: 10, filter: {datetime_geq: $start, datetime_lt: $end}) {
      sum { requests }
    }
    periodic: durableObjectsPeriodicGroups(limit: 10, filter: {datetime_geq: $start, datetime_lt: $end}) {
      sum { duration rowsRead rowsWritten }
    }
    storage: durableObjectsStorageGroups(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
      max { storedBytes } dimensions { namespaceId }
    }
  } }
}`;

const CLASS_A = new Set(['PutObject', 'CopyObject', 'ListObjects', 'ListObjectsV2', 'ListBuckets', 'PutBucket',
  'CreateMultipartUpload', 'UploadPart', 'UploadPartCopy', 'CompleteMultipartUpload', 'ListMultipartUploads', 'ListParts',
  'PutBucketLifecycleConfiguration', 'PutBucketEncryption', 'PutBucketCors', 'LifecycleStorageTierTransition']);
const FREE = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload']);
const CLASS_B = new Set(['GetObject', 'HeadObject', 'HeadBucket', 'GetBucketLocation', 'GetBucketLifecycleConfiguration',
  'GetBucketCors', 'GetBucketEncryption', 'UsageSummary', 'ReportUsageSummary']);

function sum(rows, field, group = 'sum') {
  return rows.reduce((n, r) => {
    const value = r[group]?.[field];
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid analytics metric ${field}`);
    return n + value;
  }, 0);
}

export function measureUsage(account, fractionOfMonth) {
  if (!Number.isFinite(fractionOfMonth) || fractionOfMonth < 0 || fractionOfMonth > 1) throw new Error('Invalid storage interval');
  for (const key of ['workers', 'operations', 'r2', 'invocations', 'periodic', 'storage']) {
    if (!Array.isArray(account[key]) || account[key].length >= (['operations', 'r2', 'storage'].includes(key) ? 1000 : 10)) {
      throw new Error(`Incomplete or truncated ${key} analytics`);
    }
  }
  let classA = 0, classB = 0, free = 0;
  for (const row of account.operations) {
    const action = row.dimensions?.actionType;
    if (!CLASS_A.has(action) && !CLASS_B.has(action) && !FREE.has(action)) throw new Error(`Unpriced R2 operation ${action}`);
    const count = sum([row], 'requests');
    if (CLASS_A.has(action)) classA += count; else if (CLASS_B.has(action)) classB += count; else free += count;
  }
  return {
    worker_requests: sum(account.workers, 'requests'), worker_cpu_ms: sum(account.workers, 'cpuTimeUs') / 1000,
    r2_class_a_operations: classA, r2_class_b_operations: classB, r2_free_operations: free,
    r2_gb_months: (sum(account.r2, 'payloadSize', 'max') + sum(account.r2, 'metadataSize', 'max')) / 1e9 * fractionOfMonth,
    do_requests: sum(account.invocations, 'requests'), do_gb_seconds: sum(account.periodic, 'duration'),
    do_rows_read: sum(account.periodic, 'rowsRead'), do_rows_written: sum(account.periodic, 'rowsWritten'),
    do_gb_months: sum(account.storage, 'storedBytes', 'max') / 1e9 * fractionOfMonth
  };
}

export function priceUsage(account, fractionOfMonth) { return priceCostUsage(measureUsage(account, fractionOfMonth)); }

export async function collectMonthMeasurement(env, now, period = now.toISOString().slice(0, 7)) {
  const { start, end: next } = costPeriodBounds(period);
  if (start > now) throw new Error('Future cost period');
  const through = Math.min(now.getTime(), next.getTime());
  await verifyAnalyticsSchema(env);
  const costs = { workers: 0, r2_operations: 0, r2_storage: 0, durable_objects: 0 };
  const usage = Object.fromEntries(Object.keys(COST_USAGE_UNITS).map(key => [key, 0]));
  const scripts = (env.COST_SAFETY_WORKERS || 'hashbin-worker-prod,256t-content-prod,hashbin-run-prod').split(',').map(s => s.trim());
  // Daily windows fit dataset range limits and avoid grouping/storage truncation.
  for (let from = start.getTime(); from < through; from += 86400000) {
    const to = Math.min(from + 86400000, through);
    const data = await graphql(env, USAGE_QUERY, { account: env.CLOUDFLARE_ACCOUNT_ID,
      start: new Date(from).toISOString(), end: new Date(to).toISOString(), scripts });
    const account = data.viewer?.accounts?.[0];
    if (!account) throw new Error('Account analytics unavailable');
    const dailyUsage = measureUsage(account, (to - from) / (next - start));
    const daily = priceCostUsage(dailyUsage);
    for (const key of Object.keys(costs)) costs[key] += daily[key];
    for (const key of Object.keys(usage)) usage[key] += dailyUsage[key];
  }
  return { costs, usage };
}

export async function collectMonthUsage(env, now, period) { return (await collectMonthMeasurement(env, now, period)).costs; }

async function queryDownloadRows(env, now, aggregate = false) {
  const start = new Date(now.getTime() - 3600000).toISOString().replace('T', ' ').slice(0, 19);
  const end = now.toISOString().replace('T', ' ').slice(0, 19);
  const select = aggregate ? '' : 'blob1 AS cid, blob2 AS status, blob4 AS payer, ';
  const group = aggregate ? " AND blob4 = 'funded'" : ' GROUP BY cid, status, payer ORDER BY downloads DESC LIMIT 20';
  const response = await fetch(`${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}` },
    body: `SELECT ${select}SUM(_sample_interval * double1) AS downloads, SUM(_sample_interval * double2) AS price_dollars, SUM(_sample_interval * double3) AS lease_cost_dollars FROM hashbin_downloads WHERE timestamp >= toDateTime('${start}') AND timestamp < toDateTime('${end}')${group} FORMAT JSON`,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Download analytics HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.data)) throw new Error('Download analytics unavailable');
  return result.data;
}
export function queryTopDownloads(env, now) { return queryDownloadRows(env, now); }
export function queryFundedDownloads(env, now) { return queryDownloadRows(env, now, true); }

export function fundedMarginExceeded(row) {
  const fields = ['downloads', 'price_dollars', 'lease_cost_dollars'];
  if (!row || fields.some(field => !Object.hasOwn(row, field))) throw new Error('Incomplete funded analytics');
  // SQL SUM is null when there are no matching samples; absent columns indicate
  // an incompatible response and must not silently disable the margin check.
  const values = fields.map(field => row[field]);
  if (values.every(value => value === null)) return false;
  if (values.some(value => (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim()))) throw new Error('Invalid funded analytics');
  const [downloads, price, leases] = values.map(Number);
  if (![downloads, price, leases].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid funded analytics');
  return downloads * DOWNLOAD_COST_DOLLARS + leases > price * 0.5;
}

export async function createCostAlert(env, type, message, metadata = {}, severity = 'warning') {
  const response = await env.ALERT_STORE.get(env.ALERT_STORE.idFromName('global')).fetch(new Request('https://internal/create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, severity, title: 'Cost safety', message, metadata })
  }));
  if (!response.ok) throw new Error('Cost alert could not be stored');
}

async function monthlyRevenue(env, period) {
  const response = await env.PLATFORM_STATS.get(env.PLATFORM_STATS.idFromName('global'))
    .fetch(new Request(`https://internal/revenue?period=${period}`));
  if (!response.ok) throw new Error('Revenue unavailable');
  const { revenue_cents } = await response.json();
  if (!Number.isFinite(revenue_cents) || revenue_cents < 0) throw new Error('Revenue unavailable');
  return revenue_cents;
}

async function observeRevenue(env, period) {
  try { return { revenue_cents: await monthlyRevenue(env, period), revenue_error: null }; }
  catch (error) { return { revenue_cents: null, revenue_error: String(error.message || 'Revenue unavailable').slice(0, 500) }; }
}

async function saveSnapshot(env, data) {
  const response = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global'))
    .fetch(new Request('https://internal/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }));
  if (!response.ok) throw new Error('Cost snapshot could not be saved');
  return response.json();
}

async function reportCostAlerts(env, report, topFiles, closed = false) {
  for (const alert of report.alerts || []) {
    const files = topFiles.map(f => `${f.cid} (${f.downloads}, HTTP ${f.status})`).join(', ') || 'no sampled downloads';
    await createCostAlert(env, `${closed ? 'closed_month_' : ''}${alert.type}`,
      `${closed ? `Completed month ${report.period}: ` : ''}${alert.message}. Top files in the last hour: ${files}`,
      report, report.brake || alert.type === 'cost_revenue_unavailable' ? 'critical' : 'warning');
  }
}

async function refreshCompletedMonth(env, now) {
  const currentStart = costPeriodBounds(now.toISOString().slice(0, 7)).start;
  const period = new Date(currentStart.getTime() - 1).toISOString().slice(0, 7);
  if (now.getUTCDate() > 2) {
    const response = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global'))
      .fetch(new Request(`https://internal/snapshot?period=${period}`));
    if (!response.ok) throw new Error('Completed-month snapshot unavailable');
    const body = await response.json();
    if (!body || !Object.hasOwn(body, 'snapshot') || (body.snapshot !== null &&
      (typeof body.snapshot !== 'object' || body.snapshot.period !== period))) throw new Error('Completed-month snapshot unavailable');
    const { snapshot } = body;
    // Recover a known, incomplete month after a longer monitor outage, without
    // inventing a prior history when this deployment has never observed one.
    if (!snapshot) return;
    if (snapshot.closed_month) {
      // A funding outbox can recover after the cost correction window. Keep
      // its original month's net revenue current without re-querying all usage.
      const revenue = await observeRevenue(env, period);
      if (revenue.revenue_cents !== snapshot.revenue_cents || revenue.revenue_error !== (snapshot.revenue_error || null)) {
        const updated = await saveSnapshot(env, { ...snapshot, recorded_at: now.toISOString(), ...revenue });
        await reportCostAlerts(env, updated, snapshot.top_files || [], true);
      }
      return;
    }
  }
  const { costs, usage } = await collectMonthMeasurement(env, now, period);
  const revenue = await observeRevenue(env, period);
  let topFiles = [], topFilesError = null;
  try { topFiles = await queryTopDownloads(env, currentStart); }
  catch (error) { topFilesError = error.message; }
  const report = await saveSnapshot(env, { period, recorded_at: now.toISOString(), usage_end: currentStart.toISOString(),
    costs, usage, ...revenue, top_files: topFiles, top_files_error: topFilesError });
  // Separate alert types preserve the existing per-type hourly deduplication
  // without suppressing a current-month warning in the same monitor run.
  if (topFilesError) await createCostAlert(env, 'closed_month_download_analytics_unavailable',
    `Completed month ${period}: ${topFilesError}`, { period }, 'critical');
  await reportCostAlerts(env, report, topFiles, true);
}

export async function runCostMonitor(env, now = new Date()) {
  if (env.ENVIRONMENT === 'local') return;
  if (env.RUN_DOMAIN) {
    try { await runRunOriginCostMonitor(env, now); }
    catch (error) {
      try { await createCostAlert(env, 'run_analytics_unavailable', error.message, {}, 'critical'); }
      catch (alertError) { console.error('Run cost alert unavailable', alertError.message); }
    }
  }
  try {
    if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Configure CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID');
    // Revisit the completed month for two days to capture the final UTC hour,
    // delayed analytics and returned funded credit attributed to that month.
    try { await refreshCompletedMonth(env, now); }
    catch (error) {
      const period = new Date(costPeriodBounds(now.toISOString().slice(0, 7)).start.getTime() - 1).toISOString().slice(0, 7);
      try { await createCostAlert(env, 'closed_month_cost_monitor_unavailable', `Completed month ${period}: ${error.message}`, { period }, 'critical'); }
      catch (alertError) { console.error('Completed-month cost alert unavailable', alertError.message); }
    }
    const { costs, usage } = await collectMonthMeasurement(env, now);
    let topFiles = [];
    let topFilesError = null;
    let fundedTotals = [];
    // Preserve independent evidence: a top-file outage must not disable funded
    // margin alerts, and a funded-total outage must not erase top-file reports.
    const results = await Promise.allSettled([queryTopDownloads(env, now), queryFundedDownloads(env, now)]);
    const attributionErrors = [];
    if (results[0].status === 'fulfilled') topFiles = results[0].value;
    else attributionErrors.push(`Top downloads: ${results[0].reason.message}`);
    if (results[1].status === 'fulfilled') fundedTotals = results[1].value;
    else attributionErrors.push(`Funded downloads: ${results[1].reason.message}`);
    let marginAlerts = [];
    try { marginAlerts = fundedTotals.filter(fundedMarginExceeded); }
    catch (error) { attributionErrors.push(error.message); }
    topFilesError = attributionErrors.join('; ') || null;
    const revenue = await observeRevenue(env, now.toISOString().slice(0, 7));
    const report = await saveSnapshot(env, { recorded_at: now.toISOString(), costs, usage, ...revenue,
      top_files: topFiles, top_files_error: topFilesError });
    for (const row of marginAlerts) await createCostAlert(env, 'funded_download_margin',
      'Funded download cost estimate exceeds 50% of its price', row, 'critical');
    if (topFilesError) await createCostAlert(env, 'download_analytics_unavailable', topFilesError, {}, 'critical');
    await reportCostAlerts(env, report, topFiles);
    return report;
  } catch (error) {
    await createCostAlert(env, 'cost_monitor_unavailable', error.message, {}, 'critical');
    return { error: error.message };
  }
}

export async function runRunOriginCostMonitor(env, now = new Date()) {
  const start = `${now.toISOString().slice(0, 7)}-01 00:00:00`;
  const end = now.toISOString().replace('T', ' ').slice(0, 19);
  const response = await fetch(`${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}` },
    body: `SELECT SUM(_sample_interval * double1) AS requests FROM hashbin_run WHERE timestamp >= toDateTime('${start}') AND timestamp < toDateTime('${end}') FORMAT JSON`,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    // The operator needs the provider's query error to repair a closed gate.
    // This endpoint returns SQL diagnostics, never the request's bearer token.
    const detail = (await response.text()).replace(/[\r\n\t]+/g, ' ').slice(0, 500);
    throw new Error(`Run analytics HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await response.json();
  const raw = data.data?.[0]?.requests;
  if (raw === undefined || (raw !== null && !['number', 'string'].includes(typeof raw)) || raw === '') throw new Error('Invalid run analytics');
  const requests = raw === null ? 0 : Number(raw);
  if (!Number.isSafeInteger(requests) || requests < 0) throw new Error('Invalid run request count');
  // Conservative per-request allowance: full CPU limit, one R2 miss and DO
  // coordination/storage. Actual run Worker costs also enter the platform budget.
  const cost_cents = requests * (P.workerPerMillion + 10 * P.workerCpuPerMillionMs + P.r2ClassBPerMillion + 3 * P.doPerMillion + 4 * P.doRowsWrittenPerMillion) / 1e6 * 100;
  const saved = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global')).fetch(new Request('https://internal/run/snapshot', {
    method: 'POST', body: JSON.stringify({ requests, cost_cents, recorded_at: now.toISOString() })
  }));
  if (!saved.ok) throw new Error('Run cost snapshot unavailable');
  const report = await saved.json();
  if (report.cost_cents >= P.runOriginMonthlyCapCents * 0.8) await createCostAlert(env, 'run_origin_budget',
    report.brake ? 'Hosted run monthly cap reached; hosted sandboxes stopped' : 'Hosted run has used 80% of its monthly cap', report, report.brake ? 'critical' : 'warning');
  return report;
}
