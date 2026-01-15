/**
 * Pricing Calculator Utility
 * Calculates costs for content retention and Stripe fees
 */

// Base rate: $0.03 per GB per month
export const BASE_RATE_PER_GB_PER_MONTH = 0.03;

// Stripe fees: 2.9% + $0.30
const STRIPE_FEE_PERCENTAGE = 0.029;
const STRIPE_FEE_FIXED_CENTS = 30;

// Minimum deposit: $1.00
const MINIMUM_DEPOSIT_CENTS = 100;

// Minimum retention: 30 days (1 month)
const MINIMUM_RETENTION_MONTHS = 1;

/**
 * Calculate retention cost for content
 * @param {number} sizeBytes - Content size in bytes
 * @param {number} retentionMonths - Number of months to retain
 * @returns {number} Cost in cents
 */
export function calculateRetentionCost(sizeBytes, retentionMonths) {
  if (sizeBytes < 0 || retentionMonths < 0) {
    throw new Error('Size and retention must be non-negative');
  }

  if (retentionMonths < MINIMUM_RETENTION_MONTHS) {
    throw new Error(`Minimum retention is ${MINIMUM_RETENTION_MONTHS} month(s)`);
  }

  // Convert bytes to GB
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);

  // Calculate cost in dollars
  const costDollars = sizeGB * retentionMonths * BASE_RATE_PER_GB_PER_MONTH;

  // Convert to cents and round
  const costCents = Math.round(costDollars * 100);

  return costCents;
}

/**
 * Calculate minimum retention cost (30 days)
 * @param {number} sizeBytes - Content size in bytes
 * @returns {number} Minimum cost in cents
 */
export function calculateMinimumRetentionCost(sizeBytes) {
  return calculateRetentionCost(sizeBytes, MINIMUM_RETENTION_MONTHS);
}

/**
 * Calculate Stripe fees for a deposit
 * @param {number} depositCents - Deposit amount in cents
 * @returns {object} { grossCents, feeCents, netCents }
 */
export function calculateStripeFees(depositCents) {
  if (depositCents < MINIMUM_DEPOSIT_CENTS) {
    throw new Error(`Minimum deposit is ${MINIMUM_DEPOSIT_CENTS} cents ($${MINIMUM_DEPOSIT_CENTS / 100})`);
  }

  const grossCents = depositCents;
  const feeCents = Math.round(grossCents * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED_CENTS);
  const netCents = grossCents - feeCents;

  return {
    grossCents,
    feeCents,
    netCents
  };
}

/**
 * Calculate total charge amount for a desired credit
 * User pays fees on top of the credit amount they want to receive
 * @param {number} creditCents - Desired credit amount in cents
 * @returns {object} { creditCents, feeCents, totalChargeCents }
 */
export function calculateTotalWithFees(creditCents) {
  if (creditCents < MINIMUM_DEPOSIT_CENTS) {
    throw new Error(`Minimum deposit is ${MINIMUM_DEPOSIT_CENTS} cents ($${MINIMUM_DEPOSIT_CENTS / 100})`);
  }

  // To calculate: if user wants X credit, they pay X + fees
  // Stripe charges: (amount * 0.029) + 30
  // So total = creditCents + (creditCents * 0.029) + 30
  const feeCents = Math.round(creditCents * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED_CENTS);
  const totalChargeCents = creditCents + feeCents;

  return {
    creditCents,
    feeCents,
    totalChargeCents
  };
}

/**
 * Calculate how many months of retention a donation amount provides
 * @param {number} donationCents - Donation amount in cents
 * @param {number} sizeBytes - Content size in bytes
 * @returns {number} Months of retention
 */
export function calculateRetentionMonths(donationCents, sizeBytes) {
  if (donationCents <= 0 || sizeBytes <= 0) {
    return 0;
  }

  // Convert bytes to GB
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);

  // Calculate months: amount / (size * rate)
  const donationDollars = donationCents / 100;
  const months = donationDollars / (sizeGB * BASE_RATE_PER_GB_PER_MONTH);

  return months;
}

/**
 * Format cents as dollar string
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted dollar amount (e.g., "$1.50")
 */
export function formatCents(cents) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Calculate new expiration date
 * @param {string} currentExpiration - Current expiration ISO date string
 * @param {number} monthsToAdd - Months to add
 * @returns {string} New expiration ISO date string
 */
export function calculateNewExpiration(currentExpiration, monthsToAdd) {
  const date = new Date(currentExpiration);
  const currentDay = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  // If the day changed due to month length differences, set to last day of that month
  if (date.getDate() !== currentDay) {
    date.setDate(0); // Sets to last day of previous month
  }
  return date.toISOString();
}

/**
 * Check if balance is sufficient for upload
 * @param {number} balanceCents - Current balance in cents
 * @param {number} sizeBytes - Content size in bytes
 * @param {number} retentionMonths - Requested retention months
 * @returns {object} { sufficient: boolean, required: number, shortfall: number }
 */
export function checkBalanceSufficient(balanceCents, sizeBytes, retentionMonths) {
  const requiredCents = calculateRetentionCost(sizeBytes, retentionMonths);
  const sufficient = balanceCents >= requiredCents;
  const shortfall = sufficient ? 0 : requiredCents - balanceCents;

  return {
    sufficient,
    required: requiredCents,
    shortfall
  };
}

/**
 * Generate insufficient balance message
 * @param {number} balanceCents - Current balance in cents
 * @param {number} requiredCents - Required amount in cents
 * @returns {string} Error message
 */
export function generateInsufficientBalanceMessage(balanceCents, requiredCents) {
  const balanceDollars = formatCents(balanceCents);
  const requiredDollars = formatCents(requiredCents);
  
  return `Your account balance is too low for the minimum retention of 30 days. That would cost ${requiredDollars} and you only have ${balanceDollars} in your account.`;
}
