/**
 * Mock utilities for Stripe payment processing in tests
 * Provides mock implementations for Stripe webhook validation
 */

/**
 * Mock Stripe signature verification
 * @param {string} payload - Webhook payload
 * @param {string} signature - Stripe signature header
 * @param {string} secret - Webhook secret
 * @returns {object} Constructed event
 */
export function mockConstructEvent(payload, signature, secret) {
  if (signature === 'valid_signature' && secret === 'test_webhook_secret') {
    return JSON.parse(payload);
  }
  
  if (!signature) {
    throw new Error('Missing signature header');
  }
  
  if (signature === 'expired_signature') {
    throw new Error('Signature timestamp is too old');
  }
  
  if (signature === 'invalid_signature') {
    throw new Error('Invalid signature');
  }
  
  throw new Error('Webhook signature verification failed');
}

/**
 * Create a mock Stripe checkout session completed event
 * @param {object} overrides - Override default values
 * @returns {object} Stripe event
 */
export function createCheckoutSessionCompletedEvent(overrides = {}) {
  return {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_123',
        amount_total: 10000, // $100.00
        customer: 'cus_test_123',
        metadata: {
          user_id: 'user_123',
          cid: 'test_content_hash',
        },
        payment_status: 'paid',
        ...overrides.data?.object,
      },
    },
    ...overrides,
  };
}

/**
 * Create a mock Stripe checkout session expired event
 * @param {object} overrides - Override default values
 * @returns {object} Stripe event
 */
export function createCheckoutSessionExpiredEvent(overrides = {}) {
  return {
    id: 'evt_test_124',
    type: 'checkout.session.expired',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_124',
        amount_total: 10000,
        customer: 'cus_test_123',
        metadata: {
          user_id: 'user_123',
        },
        ...overrides.data?.object,
      },
    },
    ...overrides,
  };
}

/**
 * Create a mock Stripe charge dispute created event
 * @param {object} overrides - Override default values
 * @returns {object} Stripe event
 */
export function createChargeDisputeCreatedEvent(overrides = {}) {
  return {
    id: 'evt_test_125',
    type: 'charge.dispute.created',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'dp_test_123',
        amount: 10000,
        charge: 'ch_test_123',
        reason: 'fraudulent',
        ...overrides.data?.object,
      },
    },
    ...overrides,
  };
}

/**
 * Calculate Stripe fee for a given amount
 * @param {number} amountCents - Amount in cents
 * @returns {number} Fee in cents
 */
export function calculateStripeFee(amountCents) {
  // Stripe charges 2.9% + $0.30
  return Math.ceil(amountCents * 0.029 + 30);
}

/**
 * Mock Stripe client for testing
 */
export const mockStripeClient = {
  webhooks: {
    constructEvent: mockConstructEvent,
  },
};
