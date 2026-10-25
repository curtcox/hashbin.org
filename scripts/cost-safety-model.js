// Deterministic model; run `node scripts/cost-safety-model.js` to refresh the
// tables in docs/business/price-floor.org. No invented traffic distributions.
import { COST_POLICY as P, DOWNLOAD_COST_DOLLARS, downloadAllowance, identifiedDownloadPriceUc, FUNDED_LEASE_COST_DOLLARS } from '../src/utils/cost-policy.js';
import { calculateRetentionCost } from '../src/utils/pricing.js';

export function modelFile(sizeBytes, months = 1) {
  const cents = calculateRetentionCost(sizeBytes, months);
  const file = { availability_version: 2, r2_meta_version: 2, size_bytes: sizeBytes, retention_months: months, retention_payments: [{ amount_cents: cents }] };
  const allowance = downloadAllowance(file);
  const storageMonth = sizeBytes / 1e9 * P.r2StoragePerGBMonth;
  return { cents, allowance, kept: cents / 100 * P.revenueKept,
    worstMonth: storageMonth + allowance * DOWNLOAD_COST_DOLLARS + 0.00003,
    worstLifetime: months * storageMonth + allowance * DOWNLOAD_COST_DOLLARS + 0.00003 };
}

export function modelIdentifiedDownload(sizeBytes, requestsPerLease = 250) {
  const price = identifiedDownloadPriceUc(sizeBytes) / 1e8;
  const cost = DOWNLOAD_COST_DOLLARS + FUNDED_LEASE_COST_DOLLARS / requestsPerLease;
  return { price, cost, kept: price * P.revenueKept, margin: price * P.revenueKept - cost,
    maxUnreportedCharge: price * 250 };
}

if (process.argv[1]?.endsWith('/cost-safety-model.js')) {
  console.log('| Identified downloads | Requests/lease | Price/request ($) | Cost/request ($) | Kept margin ($) | Unreported lease charge ($) |');
  console.log('|-');
  for (const size of [100, 1024 ** 3]) for (const batch of [1, 250]) {
    const m = modelIdentifiedDownload(size, batch);
    console.log(`| ${size} B | ${batch} | ${m.price.toFixed(8)} | ${m.cost.toFixed(8)} | ${m.margin.toFixed(8)} | ${m.maxUnreportedCharge.toFixed(6)} |`);
  }
  console.log('| Size | Paid months | Collected ($) | Kept ($) | Downloads | Max month ($) | Max lifetime ($) |');
  console.log('|-');
  for (const [label, size] of [['65 B', 65], ['1 KiB', 1024], ['1 MiB', 1024 ** 2], ['~1/3 GiB', Math.floor(1024 ** 3 / 3)], ['1 GiB', 1024 ** 3], ['5 GiB', 5 * 1024 ** 3]]) {
    for (const months of [1, 120]) {
      const m = modelFile(size, months);
      if (m.worstLifetime > m.kept) throw new Error('Prepaid margin exceeded');
      console.log(`| ${label} | ${months} | ${(m.cents / 100).toFixed(2)} | ${m.kept.toFixed(5)} | ${m.allowance} | ${m.worstMonth.toFixed(5)} | ${m.worstLifetime.toFixed(5)} |`);
    }
  }
  console.log('\n| Month | Upfront kept ($) | Storage paid ($) | Storage reserve left ($) |');
  console.log('|-');
  // One GiB, twelve prepaid months, with the entire allowance used immediately.
  const cohort = modelFile(1024 ** 3, 12);
  const downloadCost = cohort.allowance * DOWNLOAD_COST_DOLLARS + 0.00003;
  for (let month = 1; month <= 12; month++) {
    console.log(`| ${month} | ${month === 1 ? cohort.kept.toFixed(5) : '0'} | ${(1024 ** 3 / 1e9 * P.r2StoragePerGBMonth).toFixed(5)} | ${(cohort.kept - downloadCost - month * 1024 ** 3 / 1e9 * P.r2StoragePerGBMonth).toFixed(5)} |`);
  }
}
