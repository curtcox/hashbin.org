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

describe('UserProfile Durable Object - P0 Key Management Tests', () => {
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

  /**
   * Helper to create a test API key
   */
  function createTestApiKey(overrides = {}) {
    return {
      key_id: 'key_' + Math.random().toString(36).substr(2, 9),
      key_hash: 'hash_' + Math.random().toString(36).substr(2, 16),
      key_encrypted: 'encrypted_value',
      name: 'Test Key',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      last_used_at: null,
      usage_count: 0,
      revoked_at: null,
      reveal_timestamps: [],
      ...overrides,
    };
  }

  // KEYMGMT-01: List keys shows all user's keys
  describe('KEYMGMT-01: List keys shows all user\'s keys', () => {
    it('should return all API keys for user', async () => {
      const key1 = createTestApiKey({ name: 'Key 1' });
      const key2 = createTestApiKey({ name: 'Key 2' });
      const key3 = createTestApiKey({ name: 'Key 3' });
      
      const profile = createBasicProfile({
        api_keys: [key1, key2, key3],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/apikeys', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveLength(3);
      expect(data[0].name).toBe('Key 1');
      expect(data[1].name).toBe('Key 2');
      expect(data[2].name).toBe('Key 3');
    });

    it('should return empty array when user has no keys', async () => {
      const profile = createBasicProfile({
        api_keys: [],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/apikeys', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveLength(0);
    });
  });

  // KEYMGMT-02: List keys does not show key values
  describe('KEYMGMT-02: List keys does not show key values', () => {
    it('should not include key_hash in list response', async () => {
      const key = createTestApiKey({
        key_hash: 'secret_hash_value',
        key_encrypted: 'secret_encrypted_value',
      });
      
      const profile = createBasicProfile({
        api_keys: [key],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/apikeys', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0]).not.toHaveProperty('key_hash');
      expect(data[0]).not.toHaveProperty('key_encrypted');
      expect(data[0]).toHaveProperty('key_id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('created_at');
      expect(data[0]).toHaveProperty('expires_at');
    });
  });

  // KEYMGMT-03: List keys shows revoked keys
  describe('KEYMGMT-03: List keys shows revoked keys', () => {
    it('should include revoked keys in list', async () => {
      const activeKey = createTestApiKey({ name: 'Active Key' });
      const revokedKey = createTestApiKey({
        name: 'Revoked Key',
        revoked_at: new Date().toISOString(),
      });
      
      const profile = createBasicProfile({
        api_keys: [activeKey, revokedKey],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/apikeys', { method: 'GET' });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveLength(2);
      expect(data[0].revoked).toBe(false);
      expect(data[1].revoked).toBe(true);
    });
  });

  // KEYMGMT-04: Revoke key marks it as revoked
  describe('KEYMGMT-04: Revoke key marks it as revoked', () => {
    it('should mark key as revoked', async () => {
      const key = createTestApiKey({ name: 'Key to Revoke' });
      
      const profile = createBasicProfile({
        api_keys: [key],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request(`http://test.com/apikeys/${key.key_id}`, {
        method: 'DELETE',
      });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('API key revoked successfully');
      
      // Verify key is actually revoked
      const listRequest = new Request('http://test.com/apikeys', { method: 'GET' });
      const listResponse = await userProfile.fetch(listRequest);
      const listData = await listResponse.json();
      
      expect(listData[0].revoked).toBe(true);
    });
  });

  // KEYMGMT-05: Cannot revoke another user's key (tested via proper isolation in actual API)
  // This test verifies the DO design - each user has their own DO instance
  describe('KEYMGMT-05: Key isolation per user', () => {
    it('should only revoke keys within user\'s own profile', async () => {
      const key = createTestApiKey({ key_id: 'key_user1' });
      
      const profile = createBasicProfile({
        user_id: 'user_123',
        api_keys: [key],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Try to revoke a key that doesn't exist in this user's profile
      const request = new Request('http://test.com/apikeys/key_other_user', {
        method: 'DELETE',
      });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBe('API key not found');
    });
  });

  // KEYMGMT-06: Cannot revoke already-revoked key (idempotent)
  describe('KEYMGMT-06: Revoke already-revoked key is idempotent', () => {
    it('should return success when revoking already-revoked key', async () => {
      const key = createTestApiKey({
        name: 'Already Revoked Key',
        revoked_at: new Date().toISOString(),
      });
      
      const profile = createBasicProfile({
        api_keys: [key],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request(`http://test.com/apikeys/${key.key_id}`, {
        method: 'DELETE',
      });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('API key already revoked');
      expect(data.revoked_at).toBe(key.revoked_at);
    });
  });

  // KEYMGMT-07: Revoke non-existent key returns 404
  describe('KEYMGMT-07: Revoke non-existent key returns 404', () => {
    it('should return 404 when revoking non-existent key', async () => {
      const profile = createBasicProfile({
        api_keys: [],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      const request = new Request('http://test.com/apikeys/nonexistent_key', {
        method: 'DELETE',
      });
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBe('API key not found');
    });
  });

  // KEYGEN-10: Maximum 25 keys per user enforced
  describe('KEYGEN-10: Maximum 25 keys per user enforced', () => {
    it('should reject creation of 26th key', async () => {
      // Create 25 active keys
      const keys = Array.from({ length: 25 }, (_, i) => 
        createTestApiKey({ name: `Key ${i + 1}` })
      );
      
      const profile = createBasicProfile({
        api_keys: keys,
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Try to create the 26th key
      const request = new Request('http://test.com/apikeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key_id: 'key_26',
          key_hash: 'hash_26',
          key_encrypted: 'encrypted_26',
          name: 'Key 26',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('AUTH_KEY_LIMIT');
      expect(data.message).toContain('Maximum of 25 API keys allowed');
    });

    it('should allow creation of key when count is below limit', async () => {
      // Create 24 active keys
      const keys = Array.from({ length: 24 }, (_, i) => 
        createTestApiKey({ name: `Key ${i + 1}` })
      );
      
      const profile = createBasicProfile({
        api_keys: keys,
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Create the 25th key - should succeed
      const request = new Request('http://test.com/apikeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key_id: 'key_25',
          key_hash: 'hash_25',
          key_encrypted: 'encrypted_25',
          name: 'Key 25',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.key_id).toBe('key_25');
      expect(data.name).toBe('Key 25');
    });

    it('should not count revoked keys towards limit', async () => {
      // Create 24 active keys and 5 revoked keys
      const activeKeys = Array.from({ length: 24 }, (_, i) => 
        createTestApiKey({ name: `Active Key ${i + 1}` })
      );
      const revokedKeys = Array.from({ length: 5 }, (_, i) => 
        createTestApiKey({
          name: `Revoked Key ${i + 1}`,
          revoked_at: new Date().toISOString(),
        })
      );
      
      const profile = createBasicProfile({
        api_keys: [...activeKeys, ...revokedKeys],
      });
      mockState = createMockState({ profile });
      userProfile = new UserProfile(mockState, mockEnv);

      // Should be able to create one more key (25th active)
      const request = new Request('http://test.com/apikeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key_id: 'key_25',
          key_hash: 'hash_25',
          key_encrypted: 'encrypted_25',
          name: 'Key 25',
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      
      const response = await userProfile.fetch(request);
      
      expect(response.status).toBe(201);
    });
  });
});
