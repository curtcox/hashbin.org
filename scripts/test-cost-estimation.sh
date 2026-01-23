#!/bin/bash
# Test suite for cost estimation utilities
# Based on test cases from todo/track_and_predict_expenses.md

set -e

echo "=== Cost Estimation Tests ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Create a temporary test file
TEST_FILE="$PROJECT_ROOT/test-cost-estimation-temp.js"

cat > "$TEST_FILE" << 'EOF'
import {
  calculateWorkerCost,
  calculateR2StorageCost,
  calculateR2BandwidthCost,
  calculateDurableObjectCost,
  calculateStripeFee,
  calculateChargeAmount,
  calculateUploadCost,
  calculateDownloadCost,
  calculateUploadRevenue,
  calculateUserRevenue,
  calculateUserCosts,
  calculateContentRevenue,
  calculateContentCosts,
  calculateBreakEvenStoragePrice,
  calculateBreakEvenRateLimitPrice
} from './src/utils/cost-estimation.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✓ ${message} (${actual} ≈ ${expected})`);
  } else {
    failed++;
    console.error(`  ✗ ${message} (${actual} != ${expected}, diff: ${diff})`);
  }
}

console.log('\n=== Basic Cost Calculations ===');

// Test: Worker cost for typical upload
console.log('\n1. Worker Cost Calculation');
const workerCost = calculateWorkerCost(5);
assertApprox(workerCost, 0.00025, 0.000001, 'Worker cost for 5 requests');

// Test: R2 storage cost for 1GB/month
console.log('\n2. R2 Storage Cost Calculation');
const storageCost = calculateR2StorageCost(1, 1);
assert(storageCost === 1.5, 'R2 storage cost for 1GB for 1 month = 1.5 cents');

// Test: R2 bandwidth cost for 1GB download
console.log('\n3. R2 Bandwidth Cost Calculation');
const bandwidthCost = calculateR2BandwidthCost(1);
assert(bandwidthCost === 1.5, 'R2 bandwidth cost for 1GB = 1.5 cents');

// Test: Durable Objects cost for 100 operations
console.log('\n4. Durable Objects Cost Calculation');
const doCost = calculateDurableObjectCost(100);
// DO cost is extremely small, using more practical tolerance
assertApprox(doCost, 0.0015, 0.001, 'DO cost for 100 operations (in cents)');

// Test: Stripe fee on $10 deposit
console.log('\n5. Stripe Fee on $10 Deposit');
const stripeFee10 = calculateStripeFee(1000);
assert(stripeFee10 === 59, 'Stripe fee on $10 = 59 cents');

// Test: Stripe fee on minimum $1 deposit
console.log('\n6. Stripe Fee on $1 Deposit');
const stripeFee1 = calculateStripeFee(100);
assert(stripeFee1 === 33, 'Stripe fee on $1 = 33 cents');

console.log('\n=== Upload Cost Attribution ===');

// Test: Total cost for 1GB upload (1 month retention)
console.log('\n7. Total Cost for 1GB Upload (1 Month)');
const uploadCost = calculateUploadCost({ sizeGB: 1, months: 1 });
assertApprox(uploadCost.total_cents, 1.5, 0.01, 'Total upload cost');
assertApprox(uploadCost.worker_cents, 0.00025, 0.001, 'Worker cost component');
assert(uploadCost.storage_cents === 1.5, 'Storage cost component');
assertApprox(uploadCost.durable_objects_cents, 0.00005, 0.0001, 'DO cost component');

// Test: Revenue and margin for 1GB upload
console.log('\n8. Upload Revenue and Margin');
const uploadRevenue = calculateUploadRevenue({ sizeGB: 1, months: 1 });
assert(uploadRevenue === 3, 'Revenue for 1GB for 1 month = 3 cents');
const margin = (uploadRevenue - uploadCost.total_cents) / uploadRevenue;
assert(Math.round(margin * 100) === 50, 'Margin is ~50%');

// Test: Inline content cost
console.log('\n9. Inline Content Cost (≤64 bytes)');
const inlineCost = calculateUploadCost({ sizeBytes: 32, months: 12 });
assert(inlineCost.total_cents < 0.001, 'Inline content cost < 0.001 cents');
assert(inlineCost.storage_cents === 0, 'No R2 storage cost for inline');

const inlineRevenue = calculateUploadRevenue({ sizeBytes: 32, months: 12 });
assert(inlineRevenue === 0, 'Inline content is free');

console.log('\n=== Download Cost Attribution ===');

// Test: Cost for 100MB download
console.log('\n10. Cost for 100MB Download');
const downloadCost = calculateDownloadCost({ sizeGB: 0.1 });
assertApprox(downloadCost.total_cents, 0.15015, 0.001, 'Total download cost');

// Test: Rate limit profitability at $0.02/GB
console.log('\n11. Rate Limit Profitability');
const rateLimitRevenue = 0.2; // $0.02/GB × 0.1GB
assert(rateLimitRevenue > downloadCost.total_cents, 'Rate limit is profitable');
const rateLimitMargin = (rateLimitRevenue - downloadCost.total_cents) / rateLimitRevenue;
assert(Math.round(rateLimitMargin * 100) === 25, 'Rate limit margin ~25%');

console.log('\n=== User Profitability ===');

// Test: User lifetime profitability
console.log('\n12. User Lifetime Profitability');
const user = {
  uploads: { sizeGB: 10, months: 12 },
  downloads: { count: 100, avgSizeGB: 1 },
  rateLimits: { count: 50, avgSizeGB: 1 },
  donations: 500
};

const userRevenue = calculateUserRevenue(user);
assert(userRevenue === 960, 'Total user revenue = 960 cents');

const userCosts = calculateUserCosts(user);
assertApprox(userCosts, 330, 1, 'Total user costs ~330 cents');

const userMargin = (userRevenue - userCosts) / userRevenue;
assert(Math.round(userMargin * 100) === 66, 'User margin ~66%');

console.log('\n=== Edge Cases ===');

// Test: Zero revenue user (only downloads)
console.log('\n13. Zero Revenue User');
const zeroRevenueUser = {
  uploads: { sizeGB: 0, months: 0 },
  downloads: { sizeGB: 1000 }
};
const zeroRevenue = calculateUserRevenue(zeroRevenueUser);
const zeroRevenueCosts = calculateUserCosts(zeroRevenueUser);
assert(zeroRevenue === 0, 'Zero revenue user has $0 revenue');
assert(zeroRevenueCosts > 1500, 'Zero revenue user costs >$15');

// Test: Large file upload (1TB for 1 year)
console.log('\n14. Large File Upload (1TB)');
const largeUpload = { sizeGB: 1000, months: 12 };
const largeRevenue = calculateUploadRevenue(largeUpload);
const largeCost = calculateUploadCost(largeUpload);
assert(largeRevenue === 36000, 'Large file revenue = 36000 cents');
assertApprox(largeCost.total_cents, 18000, 1, 'Large file cost ~18000 cents');
const largeMargin = (largeRevenue - largeCost.total_cents) / largeRevenue;
assertApprox(largeMargin, 0.5, 0.01, 'Large file margin = 50%');

// Test: Viral content (1GB with 1M downloads, 100% rate limit coverage)
console.log('\n15. Viral Content Profitability');
const viralContent = {
  sizeGB: 1,
  months: 1,
  downloads: 1_000_000,
  rateLimitCoverage: 1.0
};

const viralRevenue = calculateContentRevenue(viralContent);
const viralCosts = calculateContentCosts(viralContent);
const viralProfit = viralRevenue - viralCosts;

assert(viralProfit > 0, 'Viral content is profitable');
assertApprox(viralProfit, 500000, 200, 'Viral content profit ~$5000');

const viralMargin = viralProfit / viralRevenue;
assert(Math.round(viralMargin * 100) === 25, 'Viral content margin ~25%');

// Test: Minimum deposit scenario
console.log('\n16. Minimum Deposit Scenario');
const minDeposit = 100; // $1.00
const minStripeFee = calculateStripeFee(minDeposit);
const minCharge = calculateChargeAmount(minDeposit);
assert(minStripeFee === 33, 'Stripe fee on $1 = 33 cents');
assert(minCharge.totalCharged === 133, 'User charged $1.33');

console.log('\n=== Break-Even Pricing ===');

// Test: Break-even storage price
console.log('\n17. Break-Even Storage Price');
const breakEvenStorage = calculateBreakEvenStoragePrice();
assert(breakEvenStorage === 0.015, 'Break-even storage = $0.015/GB/month');

const currentStoragePrice = 0.03;
const storageMargin = (currentStoragePrice - breakEvenStorage) / currentStoragePrice;
assert(storageMargin === 0.5, 'Current storage pricing has 50% margin');

// Test: Break-even rate limit price
console.log('\n18. Break-Even Rate Limit Price');
const breakEvenRateLimit = calculateBreakEvenRateLimitPrice();
assert(breakEvenRateLimit === 0.015, 'Break-even rate limit = $0.015/GB');

const currentRateLimitPrice = 0.02;
assert(currentRateLimitPrice > breakEvenRateLimit, 'Current rate limit pricing is profitable');

const rateLimitMarginCalc = (currentRateLimitPrice - breakEvenRateLimit) / currentRateLimitPrice;
assert(Math.round(rateLimitMarginCalc * 100) === 25, 'Current rate limit pricing has ~25% margin');

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
EOF

# Run the test
node "$TEST_FILE"
TEST_RESULT=$?

# Clean up
rm -f "$TEST_FILE"

if [ $TEST_RESULT -eq 0 ]; then
  echo ""
  echo "✅ All cost estimation tests passed!"
  exit 0
else
  echo ""
  echo "❌ Some cost estimation tests failed"
  exit 1
fi
