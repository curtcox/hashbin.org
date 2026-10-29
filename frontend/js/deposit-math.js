/**
 * Deposit arithmetic shared by the deposit page and /docs/deposits.html
 * Pure functions (no DOM access) so they can be unit tested.
 *
 * The server computes the same total in src/utils/cost-policy.js (grossUp);
 * deposit-math.test.js checks the two agree.
 */

// Stripe's standard fee for a US card: 2.9% of the whole charge plus 30 cents
export const STRIPE_RATE = 0.029;
export const STRIPE_FIXED_CENTS = 30;

/**
 * Break a deposit into what the customer pays and where it goes
 * @param {number} creditCents - Amount to add to the balance, in cents
 * @returns {{creditCents: number, totalChargeCents: number, cardCostCents: number,
 *   stripeFeeCents: number, roundingCents: number}} totalChargeCents is what the card is
 *   charged before any tax; cardCostCents is what is added for the card payment; of that,
 *   stripeFeeCents is Stripe's standard fee and roundingCents (0 or 1) is the rounding up
 */
export function depositBreakdown(creditCents) {
  if (!Number.isSafeInteger(creditCents) || creditCents < 0) throw new Error('Invalid credit amount');
  // Stripe's percentage applies to the whole charge, including the amount added to cover it
  const totalChargeCents = Math.ceil((creditCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_RATE));
  const stripeFeeCents = Math.round(totalChargeCents * STRIPE_RATE + STRIPE_FIXED_CENTS);
  return {
    creditCents,
    totalChargeCents,
    cardCostCents: totalChargeCents - creditCents,
    stripeFeeCents,
    roundingCents: totalChargeCents - creditCents - stripeFeeCents
  };
}

/**
 * @param {number} cents - Amount in cents
 * @returns {string} e.g. "$10.61"
 */
export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
