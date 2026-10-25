// USD list prices, reviewed 2026-10-24. See docs/cost-safety.md for sources.
// Use marginal prices (ignore included usage) so estimates err on the safe side.
export const COST_POLICY = Object.freeze({
  workerPerMillion: 0.30,
  workerCpuPerMillionMs: 0.02,
  r2StoragePerGBMonth: 0.015,
  r2ClassAPerMillion: 4.50,
  r2ClassBPerMillion: 0.36,
  r2EgressPerGB: 0,
  doPerMillion: 0.15,
  doDurationPerMillionGBSeconds: 12.50,
  doRowsReadPerMillion: 0.001,
  doRowsWrittenPerMillion: 1,
  doStoragePerGBMonth: 0.20,
  stripeRate: 0.029,
  stripeFixedCents: 30,
  revenueKept: 0.92,
  fixedMonthlyCents: 701,
  projectionAlertCents: 2500,
  projectionBrakeCents: 5000,
  downloadsPerGBMonth: 2000,
  minimumDownloads: 5000,
  downloadDollarsPerMillion: 4,
  maxRetentionMonths: 120,
  newAccountDepositCapCents: 2000,
  inlineUploadsPerHour: 60,
  cacheSeconds: 3600,
  leaseSize: 250,
  leaseSeconds: 60,
  downloadCpuMs: 10
});

export function grossUp(creditCents) {
  if (!Number.isSafeInteger(creditCents) || creditCents < 0) throw new Error('Invalid credit amount');
  return Math.ceil((creditCents + COST_POLICY.stripeFixedCents) / (1 - COST_POLICY.stripeRate));
}

// Includes two R2 reads, the content Worker's full CPU limit, and amortized counters.
export const DOWNLOAD_COST_DOLLARS = (COST_POLICY.workerPerMillion +
  2 * COST_POLICY.r2ClassBPerMillion + COST_POLICY.downloadCpuMs * COST_POLICY.workerCpuPerMillionMs + 0.02) / 1e6;

export function downloadCostDollars(content) {
  return DOWNLOAD_COST_DOLLARS + (content.r2_meta_version === 2 ? 0 : 2 * COST_POLICY.r2ClassBPerMillion / 1e6);
}

export function downloadAllowance(content) {
  if (!content || content.size_bytes <= 64) return 0;
  const payments = content.retention_payments || [];
  const paid = payments.reduce((sum, p) => sum + Math.max(0, p.amount_cents || 0), 0) / 100;
  if (!paid) return 0;
  const gbMonths = content.size_bytes / 1024 ** 3 * (content.retention_months || 0);
  const suggested = Math.max(COST_POLICY.minimumDownloads, Math.floor(gbMonths * COST_POLICY.downloadsPerGBMonth));
  // The suggested 5,000 minimum alone can exceed the margin near the 1-cent
  // rounding boundary. Reserve storage and upload costs before granting it.
  const available = Math.max(0, paid * COST_POLICY.revenueKept -
    content.size_bytes / 1e9 * (content.retention_months || 0) * COST_POLICY.r2StoragePerGBMonth - 0.00003);
  return Math.min(suggested, Math.floor(available / downloadCostDollars(content)));
}

export function retentionWithinCap(expiresAt, months, now = new Date()) {
  if (!Number.isInteger(months) || months < 1 || months > COST_POLICY.maxRetentionMonths) return false;
  const end = new Date(Math.max(now.getTime(), new Date(expiresAt || now).getTime()));
  end.setUTCMonth(end.getUTCMonth() + months);
  const cap = new Date(now);
  cap.setUTCMonth(cap.getUTCMonth() + COST_POLICY.maxRetentionMonths);
  return Number.isFinite(end.getTime()) && end <= cap;
}

// Micro-cents (one millionth of a cent). Round up so integer accounting never undercharges.
export function identifiedDownloadPriceUc(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error('Invalid content size');
  return Math.max(400, Math.ceil(sizeBytes / 1024 ** 3 * 2 * 1e6));
}

// Conservative lease coordination estimate: checks, lease, alarm/outbox and accounting.
export const FUNDED_LEASE_COST_DOLLARS = (6 * COST_POLICY.doPerMillion +
  6 * COST_POLICY.doRowsReadPerMillion + 6 * COST_POLICY.doRowsWrittenPerMillion) / 1e6;
