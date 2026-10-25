import { DOWNLOAD_COST_DOLLARS } from '../utils/cost-policy.js';
import { COST_POLICY as P } from '../utils/cost-policy.js';

const API = 'https://api.cloudflare.com/client/v4';
const MILLION = 1e6;

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

export function priceUsage(account, fractionOfMonth) {
  for (const key of ['workers', 'operations', 'r2', 'invocations', 'periodic', 'storage']) {
    if (!Array.isArray(account[key]) || account[key].length >= (['operations', 'r2', 'storage'].includes(key) ? 1000 : 10)) {
      throw new Error(`Incomplete or truncated ${key} analytics`);
    }
  }
  let operations = 0;
  for (const row of account.operations) {
    const action = row.dimensions?.actionType;
    if (!CLASS_A.has(action) && !CLASS_B.has(action) && !FREE.has(action)) throw new Error(`Unpriced R2 operation ${action}`);
    operations += sum([row], 'requests') / MILLION * (CLASS_A.has(action) ? P.r2ClassAPerMillion : CLASS_B.has(action) ? P.r2ClassBPerMillion : 0);
  }
  return {
    workers: (sum(account.workers, 'requests') * P.workerPerMillion +
      sum(account.workers, 'cpuTimeUs') / 1000 * P.workerCpuPerMillionMs) / MILLION * 100,
    r2_operations: operations * 100,
    // Daily maximum storage is a conservative integral, includes sidecars/backups.
    r2_storage: (sum(account.r2, 'payloadSize', 'max') + sum(account.r2, 'metadataSize', 'max')) / 1e9 * fractionOfMonth * P.r2StoragePerGBMonth * 100,
    durable_objects: (sum(account.invocations, 'requests') * P.doPerMillion +
      sum(account.periodic, 'duration') * P.doDurationPerMillionGBSeconds +
      sum(account.periodic, 'rowsRead') * P.doRowsReadPerMillion +
      sum(account.periodic, 'rowsWritten') * P.doRowsWrittenPerMillion) / MILLION * 100 +
      sum(account.storage, 'storedBytes', 'max') / 1e9 * fractionOfMonth * P.doStoragePerGBMonth * 100
  };
}

export async function collectMonthUsage(env, now) {
  await verifyAnalyticsSchema(env);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const costs = { workers: 0, r2_operations: 0, r2_storage: 0, durable_objects: 0 };
  const scripts = (env.COST_SAFETY_WORKERS || 'hashbin-worker-prod,256t-content-prod').split(',').map(s => s.trim());
  // Daily windows fit dataset range limits and avoid grouping/storage truncation.
  for (let from = start.getTime(); from < now.getTime(); from += 86400000) {
    const to = Math.min(from + 86400000, now.getTime());
    const data = await graphql(env, USAGE_QUERY, { account: env.CLOUDFLARE_ACCOUNT_ID,
      start: new Date(from).toISOString(), end: new Date(to).toISOString(), scripts });
    const account = data.viewer?.accounts?.[0];
    if (!account) throw new Error('Account analytics unavailable');
    const daily = priceUsage(account, (to - from) / (next - start));
    for (const key of Object.keys(costs)) costs[key] += daily[key];
  }
  return costs;
}

async function queryDownloadRows(env, now, aggregate = false) {
  const start = new Date(now.getTime() - 3600000).toISOString().replace('T', ' ').slice(0, 19);
  const end = now.toISOString().replace('T', ' ').slice(0, 19);
  const select = aggregate ? '' : 'blob1 AS cid, blob2 AS status, blob4 AS payer, ';
  const group = aggregate ? " AND blob4 = 'funded'" : ' GROUP BY cid, status, payer ORDER BY downloads DESC LIMIT 20';
  const response = await fetch(`${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}` },
    body: `SELECT ${select}SUM(_sample_interval * double1) AS downloads, SUM(_sample_interval * double2) AS price_dollars, SUM(_sample_interval * double3) AS lease_cost_dollars FROM hashbin_downloads WHERE timestamp >= '${start}' AND timestamp < '${end}'${group} FORMAT JSON`,
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
  const downloads = Number(row.downloads || 0), price = Number(row.price_dollars || 0), leases = Number(row.lease_cost_dollars || 0);
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

export async function runCostMonitor(env, now = new Date()) {
  if (env.ENVIRONMENT === 'local') return;
  try {
    if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Configure CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID');
    const costs = await collectMonthUsage(env, now);
    let topFiles = [];
    let topFilesError = null;
    let fundedTotals = [];
    try { [topFiles, fundedTotals] = await Promise.all([queryTopDownloads(env, now), queryFundedDownloads(env, now)]); }
    catch (error) {
      // An attribution outage must not disable the cost brake.
      topFilesError = error.message;
    }
    let marginAlerts = [];
    try { marginAlerts = fundedTotals.filter(fundedMarginExceeded); }
    catch (error) { topFilesError = error.message; }
    const statsResponse = await env.PLATFORM_STATS.get(env.PLATFORM_STATS.idFromName('global'))
      .fetch(new Request(`https://internal/revenue?period=${now.toISOString().slice(0, 7)}`));
    if (!statsResponse.ok) throw new Error('Revenue unavailable');
    const { revenue_cents } = await statsResponse.json();
    if (!Number.isFinite(revenue_cents) || revenue_cents < 0) throw new Error('Revenue unavailable');
    const response = await env.INFRASTRUCTURE_COST.get(env.INFRASTRUCTURE_COST.idFromName('global'))
      .fetch(new Request('https://internal/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recorded_at: now.toISOString(), costs, revenue_cents, top_files: topFiles, top_files_error: topFilesError }) }));
    if (!response.ok) throw new Error('Cost snapshot could not be saved');
    const report = await response.json();
    for (const row of marginAlerts) await createCostAlert(env, 'funded_download_margin',
      'Funded download cost estimate exceeds 50% of its price', row, 'critical');
    if (topFilesError) await createCostAlert(env, 'download_analytics_unavailable', topFilesError, {}, 'critical');
    for (const alert of report.alerts || []) {
      const files = topFiles.map(f => `${f.cid} (${f.downloads}, HTTP ${f.status})`).join(', ') || 'no sampled downloads';
      await createCostAlert(env, alert.type, `${alert.message}. Top files in the last hour: ${files}`, report, report.brake ? 'critical' : 'warning');
    }
    return report;
  } catch (error) {
    await createCostAlert(env, 'cost_monitor_unavailable', error.message, {}, 'critical');
    return { error: error.message };
  }
}
