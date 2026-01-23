/**
 * Content Deletion Service Tests
 * Tests for content deletion logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deleteContent, getContentMetadata } from './content-deletion.js';

/**
 * Create mock Durable Object stub
 */
function createMockDurableObjectStub(responses) {
  return {
    fetch: async (request) => {
      const url = new URL(request.url);
      const method = request.method;
      const key = `${method}:${url.pathname}`;
      
      if (responses[key]) {
        return responses[key];
      }
      
      return new Response('Not Found', { status: 404 });
    }
  };
}

/**
 * Create mock environment
 */
function createMockEnv(options = {}) {
  const {
    metadataExists = true,
    metadataData = {},
    r2DeleteSuccess = true
  } = options;

  return {
    CONTENT_METADATA: {
      idFromName: (name) => name,
      get: (id) => {
        return createMockDurableObjectStub({
          'GET:/content': metadataExists
            ? new Response(JSON.stringify({
                hash_256t: 'test-hash',
                size_bytes: 1024,
                content_type: 'text/plain',
                uploader_id: 'user_123',
                ...metadataData
              }), { status: 200, headers: { 'content-type': 'application/json' } })
            : new Response('Not Found', { status: 404 }),
          'DELETE:/content': new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        });
      }
    },
    DELETION_RECORD: {
      idFromName: (name) => name,
      get: (id) => {
        return createMockDurableObjectStub({
          'POST:/record': new Response(JSON.stringify({
            hash_256t: 'test-hash',
            reason: 'expired',
            deleted_at: new Date().toISOString()
          }), { status: 201, headers: { 'content-type': 'application/json' } })
        });
      }
    },
    CONTENT_BUCKET: {
      delete: async (key) => {
        if (!r2DeleteSuccess) {
          throw new Error('R2 delete failed');
        }
        return undefined;
      }
    }
  };
}

describe('Content Deletion Service', () => {
  describe('deleteContent', () => {
    it('should delete content from R2 and metadata store', async () => {
      const env = createMockEnv();
      
      const result = await deleteContent(env, 'test-hash', null, 'expired');
      
      expect(result.success).toBe(true);
      expect(result.hash_256t).toBe('test-hash');
      expect(result.reason).toBe('expired');
      expect(result.deleted_from_r2).toBe(true);
      expect(result.deletion_record_created).toBe(true);
    });

    it('should handle inline content (no R2 deletion)', async () => {
      const env = createMockEnv({
        metadataData: {
          size_bytes: 32 // Inline content (≤64 bytes)
        }
      });
      
      const result = await deleteContent(env, 'test-hash', null, 'expired');
      
      expect(result.success).toBe(true);
      expect(result.deleted_from_r2).toBe(false); // Inline content doesn't need R2 deletion
    });

    it('should be idempotent - handle already deleted content', async () => {
      const env = createMockEnv({ metadataExists: false });
      
      const result = await deleteContent(env, 'test-hash', null, 'expired');
      
      expect(result.success).toBe(true);
      expect(result.alreadyDeleted).toBe(true);
    });

    it('should handle R2 deletion failure gracefully', async () => {
      const env = createMockEnv({ r2DeleteSuccess: false });
      
      const result = await deleteContent(env, 'test-hash', null, 'expired');
      
      // Should still succeed even if R2 deletion fails
      expect(result.success).toBe(true);
    });

    it('should accept pre-fetched metadata', async () => {
      const env = createMockEnv();
      
      const metadata = {
        hash_256t: 'test-hash',
        size_bytes: 1024,
        content_type: 'text/plain',
        uploader_id: 'user_123'
      };
      
      const result = await deleteContent(env, 'test-hash', metadata, 'expired');
      
      expect(result.success).toBe(true);
      expect(result.hash_256t).toBe('test-hash');
    });

    it('should support different deletion reasons', async () => {
      const env = createMockEnv();
      
      const reasons = ['expired', 'contested', 'admin_action'];
      
      for (const reason of reasons) {
        const result = await deleteContent(env, `test-hash-${reason}`, null, reason);
        expect(result.success).toBe(true);
        expect(result.reason).toBe(reason);
      }
    });
  });

  describe('getContentMetadata', () => {
    it('should fetch content metadata', async () => {
      const env = createMockEnv();
      
      const metadata = await getContentMetadata(env, 'test-hash');
      
      expect(metadata).toBeDefined();
      expect(metadata.hash_256t).toBe('test-hash');
      expect(metadata.size_bytes).toBe(1024);
    });

    it('should return null for non-existent content', async () => {
      const env = createMockEnv({ metadataExists: false });
      
      const metadata = await getContentMetadata(env, 'nonexistent');
      
      expect(metadata).toBeNull();
    });
  });
});
