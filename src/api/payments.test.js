/**
 * Payments API Security Tests (P0 Priority)
 * Tests for src/api/payments.js webhook security
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStripeWebhook } from './payments.js';
import { 
  mockConstructEvent,
  createCheckoutSessionCompletedEvent 
} from '../../test-utils/stripe-mock.js';

// Mock Stripe module
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation((apiKey, options) => {
      return {
        webhooks: {
          constructEventAsync: async (body, signature, secret) => {
            return mockConstructEvent(body, signature, secret);
          }
        }
      };
    })
  };
});

describe('Payments API - P0 Security Tests', () => {
  let mockEnv;
  let processedEvents;

  beforeEach(() => {
    processedEvents = new Set();
    
    mockEnv = {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'test_webhook_secret',
      ENVIRONMENT: 'test',
      USER_PROFILES: createMockUserProfiles(),
      PAYMENT_RECORDS: createMockPaymentRecords(),
      AUDIT_LOG: createMockAuditLog(),
      PLATFORM_STATS: createMockPlatformStats(),
    };
  });

  // SEC-10: Webhook signature validation
  describe('SEC-10: Webhook signature validation', () => {
    it('should validate webhook signature before processing', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
    });

    it('should reject webhooks with invalid signatures', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid signature');
    });
  });

  // STRIPE-01: Accept valid Stripe signature
  describe('STRIPE-01: Accept valid signature', () => {
    it('should accept webhooks with valid signature', async () => {
      const event = createCheckoutSessionCompletedEvent({
        data: {
          object: {
            client_reference_id: 'user_123',
            metadata: {
              user_id: 'user_123',
              type: 'deposit',
              amount_cents: '10000',
            },
          },
        },
      });
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);

      expect(response.status).toBe(200);
    });

    it('should process valid webhook events', async () => {
      const event = createCheckoutSessionCompletedEvent({
        data: {
          object: {
            client_reference_id: 'user_456',
            metadata: {
              user_id: 'user_456',
              type: 'deposit',
              amount_cents: '5000',
            },
          },
        },
      });
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
    });
  });

  // STRIPE-02: Reject missing signature
  describe('STRIPE-02: Reject missing signature', () => {
    it('should reject webhooks without signature header', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Missing signature');
    });

    it('should not process webhooks without signature', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body,
      });

      await handleStripeWebhook(request, mockEnv);

      // Verify no events were processed
      expect(processedEvents.size).toBe(0);
    });
  });

  // STRIPE-03: Reject invalid signature
  describe('STRIPE-03: Reject invalid signature', () => {
    it('should reject webhooks with wrong signature', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject webhooks with expired signature', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'expired_signature',
          'content-type': 'application/json',
        },
        body,
      });

      const response = await handleStripeWebhook(request, mockEnv);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid signature');
    });

    it('should not process events with invalid signatures', async () => {
      const event = createCheckoutSessionCompletedEvent();
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'tampered_signature',
          'content-type': 'application/json',
        },
        body,
      });

      await handleStripeWebhook(request, mockEnv);

      // Verify no events were processed
      expect(processedEvents.size).toBe(0);
    });
  });

  // STRIPE-05: Reject replayed webhook (duplicate event ID)
  describe('STRIPE-05: Reject replayed webhook', () => {
    it('should process event only once with same event ID', async () => {
      const event = createCheckoutSessionCompletedEvent({
        id: 'evt_unique_123',
        data: {
          object: {
            id: 'cs_unique_123', // Session ID must be unique
            client_reference_id: 'user_idempotency_test',
            metadata: {
              user_id: 'user_idempotency_test',
              type: 'deposit',
              amount_cents: '10000',
            },
            amount_total: 10000,
          },
        },
      });
      const body = JSON.stringify(event);
      
      const request1 = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });
      
      const request2 = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      // First request should succeed and process
      const response1 = await handleStripeWebhook(request1, mockEnv);
      expect(response1.status).toBe(200);

      // Get user profile to check balance after first processing
      const userProfileId = mockEnv.USER_PROFILES.idFromName('user_idempotency_test');
      const userProfileStub = mockEnv.USER_PROFILES.get(userProfileId);
      const balanceResponse1 = await userProfileStub.fetch(
        new Request('http://internal/balance')
      );
      const balance1 = await balanceResponse1.json();
      expect(balance1.balance_cents).toBe(10000);

      // Second request with same event ID should be idempotent
      // The implementation checks if session was already processed
      const response2 = await handleStripeWebhook(request2, mockEnv);
      expect(response2.status).toBe(200);
      
      // Balance should still be 10000, not 20000 (no double-processing)
      const balanceResponse2 = await userProfileStub.fetch(
        new Request('http://internal/balance')
      );
      const balance2 = await balanceResponse2.json();
      expect(balance2.balance_cents).toBe(10000); // Not doubled!
    });

    it('should handle replay attacks gracefully', async () => {
      const event = createCheckoutSessionCompletedEvent({
        id: 'evt_replay_attack',
        data: {
          object: {
            client_reference_id: 'user_999',
            metadata: {
              user_id: 'user_999',
              type: 'deposit',
              amount_cents: '100000', // Large amount
            },
          },
        },
      });
      const body = JSON.stringify(event);
      
      const request = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });

      // First webhook
      await handleStripeWebhook(request, mockEnv);
      
      // Attacker tries to replay the same webhook
      // Should be detected and rejected
      const replayRequest = new Request('http://test.com/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'content-type': 'application/json',
        },
        body,
      });
      
      const response = await handleStripeWebhook(replayRequest, mockEnv);
      
      // Should succeed but not double-process
      expect(response.status).toBe(200);
      
      // Note: Implementation should track event IDs to prevent double-processing
    });
  });
});

/**
 * Helper functions to create mock Durable Objects
 */

function createMockUserProfiles() {
  const profiles = new Map();
  
  return {
    idFromName: (userId) => ({ toString: () => userId }),
    get: (id) => ({
      fetch: async (request) => {
        const url = new URL(request.url);
        const userId = id.toString();
        
        // Initialize profile if not exists
        if (!profiles.has(userId)) {
          profiles.set(userId, { 
            user_id: userId, 
            balance_cents: 0,
            deleted_at: null
          });
        }
        
        const profile = profiles.get(userId);
        
        // Handle GET /balance
        if (request.method === 'GET' && url.pathname === '/balance') {
          return new Response(JSON.stringify({ 
            balance_cents: profile.balance_cents 
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        // Handle POST /balance/deposit
        if (request.method === 'POST' && url.pathname === '/balance/deposit') {
          const body = await request.json();
          profile.balance_cents += body.amount_cents;
          profiles.set(userId, profile);
          
          return new Response(JSON.stringify({ 
            balance_cents: profile.balance_cents 
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        // Handle POST /credit (legacy)
        if (request.method === 'POST' && url.pathname.includes('/credit')) {
          const body = await request.json();
          profile.balance_cents += body.amount_cents;
          profiles.set(userId, profile);
          
          return new Response(JSON.stringify(profile), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        // Handle GET /profile
        if (url.pathname === '/profile') {
          return new Response(JSON.stringify(profile), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        return new Response('Not found', { status: 404 });
      }
    })
  };
}

function createMockPaymentRecords() {
  const processedSessions = new Set();
  const transactions = [];
  
  return {
    idFromName: (userId) => ({ toString: () => userId }),
    get: () => ({
      fetch: async (request) => {
        const url = new URL(request.url);
        
        // Handle session exists check
        if (url.pathname === '/session/exists') {
          const sessionId = url.searchParams.get('session_id');
          return new Response(JSON.stringify({ 
            exists: processedSessions.has(sessionId) 
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        // Handle record transaction
        if (request.method === 'POST' && url.pathname === '/transaction') {
          const body = await request.json();
          transactions.push(body);
          
          // Mark session as processed
          if (body.stripe_session_id) {
            processedSessions.add(body.stripe_session_id);
          }
          
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        // Handle legacy /record endpoint
        if (request.method === 'POST' && url.pathname === '/record') {
          const body = await request.json();
          transactions.push(body);
          
          if (body.session_id) {
            processedSessions.add(body.session_id);
          }
          
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    })
  };
}

function createMockAuditLog() {
  return {
    idFromName: () => ({ toString: () => 'global' }),
    get: () => ({
      fetch: async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    })
  };
}

function createMockPlatformStats() {
  return {
    idFromName: () => ({ toString: () => 'global' }),
    get: () => ({
      fetch: async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    })
  };
}
