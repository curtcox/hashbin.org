/**
 * Unit tests for admin identity in audit records
 */

import { describe, it, expect } from 'vitest';
import { adminActorId } from './admin.js';

describe('adminActorId', () => {
  it('names the signed-in admin', () => {
    expect(adminActorId({ user: { userId: 'user_admin', authMethod: 'clerk' } })).toBe('user_admin');
  });

  it('names the admin key used', () => {
    expect(adminActorId({ user: { userId: 'user_admin', authMethod: 'admin_key', keyId: 'k1' } })).toBe('user_admin (admin key k1)');
  });
});
