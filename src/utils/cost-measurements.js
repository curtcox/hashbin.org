import { COST_POLICY as P } from './cost-policy.js';

export const COST_USAGE_UNITS = Object.freeze({
  worker_requests: 'requests', worker_cpu_ms: 'milliseconds',
  r2_class_a_operations: 'operations', r2_class_b_operations: 'operations', r2_free_operations: 'operations',
  r2_gb_months: 'decimal GB-months', do_requests: 'requests', do_gb_seconds: 'GB-seconds',
  do_rows_read: 'rows', do_rows_written: 'rows', do_gb_months: 'decimal GB-months'
});
export function validCostUsage(usage) {
  return usage && typeof usage === 'object' && !Array.isArray(usage) &&
    Object.keys(usage).length === Object.keys(COST_USAGE_UNITS).length &&
    Object.keys(COST_USAGE_UNITS).every(key => Number.isFinite(usage[key]) && usage[key] >= 0);
}
export function priceCostUsage(usage) {
  if (!validCostUsage(usage)) throw new Error('Invalid cost measurements');
  return {
    workers: (usage.worker_requests * P.workerPerMillion + usage.worker_cpu_ms * P.workerCpuPerMillionMs) / 1e6 * 100,
    r2_operations: (usage.r2_class_a_operations * P.r2ClassAPerMillion + usage.r2_class_b_operations * P.r2ClassBPerMillion) / 1e6 * 100,
    r2_storage: usage.r2_gb_months * P.r2StoragePerGBMonth * 100,
    durable_objects: (usage.do_requests * P.doPerMillion + usage.do_gb_seconds * P.doDurationPerMillionGBSeconds +
      usage.do_rows_read * P.doRowsReadPerMillion + usage.do_rows_written * P.doRowsWrittenPerMillion) / 1e6 * 100 +
      usage.do_gb_months * P.doStoragePerGBMonth * 100
  };
}
