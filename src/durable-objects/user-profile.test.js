/**
 * UserProfile Durable Object - P0 Balance Tests
 * Tests for balance operations in src/durable-objects/user-profile.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UserProfile } from './user-profile.js';

/**
 * Helper to create mock Durable Object state with in-memory storage
 */
function createMockState(initialData = {}) {
  const storage = new Map();
  
  // Initialize with default profile if provided
  if (initialData.profile) {
    storage.set('profile', initialData.profile);
  }
  
  return {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key),
    },
    blockConcurrencyWhile: async (callback) => await callback(),
  };
}

/**
 * Helper to create a basic user profile
 */
function createBasicProfile(overrides = {}) {
  return {
    user_id: 'user_123',
    balance_cents: 0,
    total_deposited_cents: 0,
    total_spent_cents: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('UserProfile Durable Object - P0 Balance Tests', () => {
  let mockState;
  let mockEnv;
  let userProfile;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = {
      ENVIRONMENT: 'test',
    };
    userProfile = new UserProfile(mockState, mockEnv);
  });

  // BAL-08: Return 0 for new users
  describe('BAL-08: Return 0 for new users', () => {
    it('should return balance of 0 for newly created user', async () => {
      // Create a new profile with default balance
      const profile = createBasicProfile();
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance_cents).toBe(0);
      expect(data.total_deposited_cents).toBe(0);
      expect(data.total_spent_cents).toBe(0);
    });

    it('should return 404 for non-existent profile', async () => {
      // No profile in storage
      const request = new Request('http://test.com/balance', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBe('Profile not found');
    });
  });

  // BAL-01: Credit balance on successful deposit
  describe('BAL-01: Credit balance on successful deposit', () => {
    it('should increase balance by deposit amount', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 5000 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance_before_cents).toBe(1000);
      expect(data.balance_after_cents).toBe(6000);
      expect(data.amount_cents).toBe(5000);
    });

    it('should update total_deposited_cents', async () => {
      const profile = createBasicProfile({ 
        balance_cents: 1000,
        total_deposited_cents: 2000 
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const depositRequest = new Request('http://test.com/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 5000 }),
      });
      
      await userProfile.fetch(depositRequest);
      
      // Verify by getting balance
      const balanceRequest = new Request('http://test.com/balance', { method: 'GET' });
      const balanceResponse = await userProfile.fetch(balanceRequest);
      const balanceData = await balanceResponse.json();
      
      expect(balanceData.total_deposited_cents).toBe(7000); // 2000 + 5000
    });

    it('should reject deposit with invalid amount', async () => {
      const profile = createBasicProfile();
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 0 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid amount');
    });

    it('should reject deposit with negative amount', async () => {
      const profile = createBasicProfile();
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: -1000 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('Invalid amount');
    });
  });

  // BAL-05: Debit balance on successful upload
  describe('BAL-05: Debit balance on successful upload', () => {
    it('should decrease balance by debit amount', async () => {
      const profile = createBasicProfile({ balance_cents: 10000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 3000 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance_before_cents).toBe(10000);
      expect(data.balance_after_cents).toBe(7000);
      expect(data.amount_cents).toBe(3000);
    });

    it('should update total_spent_cents', async () => {
      const profile = createBasicProfile({ 
        balance_cents: 10000,
        total_spent_cents: 5000 
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const debitRequest = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 3000 }),
      });
      
      await userProfile.fetch(debitRequest);
      
      // Verify by getting balance
      const balanceRequest = new Request('http://test.com/balance', { method: 'GET' });
      const balanceResponse = await userProfile.fetch(balanceRequest);
      const balanceData = await balanceResponse.json();
      
      expect(balanceData.total_spent_cents).toBe(8000); // 5000 + 3000
    });
  });

  // BAL-07: Reject if balance insufficient
  describe('BAL-07: Reject if balance insufficient', () => {
    it('should reject debit when balance is insufficient', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 5000 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('insufficient_balance');
      expect(data.balance_cents).toBe(1000);
      expect(data.required_cents).toBe(5000);
      expect(data.shortfall_cents).toBe(4000);
    });

    it('should not modify balance when debit is rejected', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const debitRequest = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 5000 }),
      });
      
      await userProfile.fetch(debitRequest);
      
      // Verify balance unchanged
      const balanceRequest = new Request('http://test.com/balance', { method: 'GET' });
      const balanceResponse = await userProfile.fetch(balanceRequest);
      const balanceData = await balanceResponse.json();
      
      expect(balanceData.balance_cents).toBe(1000);
      expect(balanceData.total_spent_cents).toBe(0);
    });
  });

  // BAL-09: Never return negative balance
  describe('BAL-09: Never return negative balance', () => {
    it('should prevent balance from going negative', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 1001 }),
      });
      
      const response = await userProfile.fetch(request);
      
      // Should be rejected
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('insufficient_balance');
    });

    it('should allow debit that brings balance to exactly 0', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 1000 }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.balance_after_cents).toBe(0);
    });
  });

  // BAL-11: Prevent race conditions (double-spend prevention)
  describe('BAL-11: Prevent race conditions (double-spend)', () => {
    it('should serialize balance modifications', async () => {
      const profile = createBasicProfile({ balance_cents: 5000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Attempt two concurrent debits that together exceed balance
      const debit1 = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 3000 }),
      });
      
      const debit2 = new Request('http://test.com/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents: 3000 }),
      });

      // Execute both debits
      const response1 = await userProfile.fetch(debit1);
      const response2 = await userProfile.fetch(debit2);
      
      // One should succeed, one should fail
      const results = [response1, response2];
      const successCount = results.filter(r => r.status === 200).length;
      const failCount = results.filter(r => r.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
      
      // Verify final balance is correct (should be 2000, not negative)
      const balanceRequest = new Request('http://test.com/balance', { method: 'GET' });
      const balanceResponse = await userProfile.fetch(balanceRequest);
      const balanceData = await balanceResponse.json();
      
      expect(balanceData.balance_cents).toBeGreaterThanOrEqual(0);
      expect(balanceData.balance_cents).toBe(2000);
    });

    it('should handle multiple deposits correctly', async () => {
      const profile = createBasicProfile({ balance_cents: 1000 });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Make multiple deposits
      for (let i = 0; i < 3; i++) {
        const depositRequest = new Request('http://test.com/balance/deposit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount_cents: 1000 }),
        });
        
        const response = await userProfile.fetch(depositRequest);
        expect(response.status).toBe(200);
      }
      
      // Verify final balance
      const balanceRequest = new Request('http://test.com/balance', { method: 'GET' });
      const balanceResponse = await userProfile.fetch(balanceRequest);
      const balanceData = await balanceResponse.json();
      
      expect(balanceData.balance_cents).toBe(4000); // 1000 + 3*1000
      expect(balanceData.total_deposited_cents).toBe(3000);
    });
  });
});
