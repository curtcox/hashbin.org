/**
 * Content Lifecycle Integration Tests
 * Tests for complete content lifecycle workflows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deleteContent, getContentMetadata } from '../services/content-deletion.js';

/**
 * Create mock Durable Object stub with multiple endpoints
 */
function createMockDurableObjectStub(responses) {
  return {
    fetch: async (request) => {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;
      
      // Try exact match first
      const exactKey = `${method}:${pathname}`;
      if (responses[exactKey]) {
        return typeof responses[exactKey] === 'function' 
          ? responses[exactKey](request) 
          : responses[exactKey];
      }
      
      // Try pattern matching for dynamic routes
      for (const [key, response] of Object.entries(responses)) {
        if (key.includes('*')) {
          const [keyMethod, keyPattern] = key.split(':');
          if (keyMethod === method) {
            const regex = new RegExp('^' + keyPattern.replace('*', '.*') + '$');
            if (regex.test(pathname)) {
              return typeof response === 'function' ? response(request) : response;
            }
          }
        }
      }
      
      return new Response('Not Found', { status: 404 });
    }
  };
}

/**
 * Create mock environment for integration testing
 */
function createMockEnv(options = {}) {
  const {
    contentMetadata = {},
    expirationIndex = {},
    deletionRecords = {},
    r2Objects = {}
  } = options;

  // Track state across calls
  const state = {
    metadata: { ...contentMetadata },
    expirationIndex: { ...expirationIndex },
    deletionRecords: { ...deletionRecords },
    r2Objects: { ...r2Objects }
  };

  return {
    CONTENT_METADATA: {
      idFromName: (hash) => hash,
      get: (hash) => {
        return createMockDurableObjectStub({
          'GET:/content': () => {
            if (state.metadata[hash]) {
              return new Response(JSON.stringify(state.metadata[hash]), {
                status: 200,
                headers: { 'content-type': 'application/json' }
              });
            }
            return new Response('Not Found', { status: 404 });
          },
          'DELETE:/content': () => {
            delete state.metadata[hash];
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
        });
      }
    },
    EXPIRATION_INDEX: {
      idFromName: (name) => name,
      get: (id) => {
        return createMockDurableObjectStub({
          'POST:/register': async (request) => {
            const body = await request.json();
            const date = body.expires_at.split('T')[0];
            if (!state.expirationIndex[date]) {
              state.expirationIndex[date] = [];
            }
            state.expirationIndex[date].push(body.hash_256t);
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          },
          'POST:/update': async (request) => {
            const body = await request.json();
            const oldDate = body.old_expires_at.split('T')[0];
            const newDate = body.new_expires_at.split('T')[0];
            
            // Remove from old date
            if (state.expirationIndex[oldDate]) {
              state.expirationIndex[oldDate] = state.expirationIndex[oldDate].filter(
                h => h !== body.hash_256t
              );
            }
            
            // Add to new date
            if (!state.expirationIndex[newDate]) {
              state.expirationIndex[newDate] = [];
            }
            state.expirationIndex[newDate].push(body.hash_256t);
            
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          },
          'GET:*/expired*': (request) => {
            const url = new URL(request.url);
            const date = url.searchParams.get('date');
            const hashes = state.expirationIndex[date] || [];
            return new Response(JSON.stringify({ hashes }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
        });
      }
    },
    DELETION_RECORD: {
      idFromName: (hash) => hash,
      get: (hash) => {
        return createMockDurableObjectStub({
          'POST:/record': async (request) => {
            const body = await request.json();
            state.deletionRecords[body.hash_256t] = body;
            return new Response(JSON.stringify({
              hash_256t: body.hash_256t,
              reason: body.reason,
              deleted_at: body.deleted_at || new Date().toISOString()
            }), {
              status: 201,
              headers: { 'content-type': 'application/json' }
            });
          }
        });
      }
    },
    CONTENT_BUCKET: {
      delete: async (key) => {
        delete state.r2Objects[key];
        return undefined;
      }
    },
    _state: state // Expose state for testing
  };
}

describe('Content Lifecycle Integration Tests', () => {
  describe('Upload to Expiration Flow', () => {
    it('should register content with ExpirationIndex on upload', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'test-hash': {
            hash_256t: 'test-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_123',
            created_at: '2026-01-23T00:00:00Z',
            expires_at: '2026-02-23T00:00:00Z'
          }
        }
      });

      // Simulate upload registration with ExpirationIndex
      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const response = await indexStub.fetch(
        new Request('http://internal/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: 'test-hash',
            expires_at: '2026-02-23T00:00:00Z'
          })
        })
      );

      expect(response.status).toBe(200);
      expect(env._state.expirationIndex['2026-02-23']).toContain('test-hash');
    });

    it('should update ExpirationIndex when content is extended', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'test-hash': {
            hash_256t: 'test-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_123',
            created_at: '2026-01-23T00:00:00Z',
            expires_at: '2026-02-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-02-23': ['test-hash']
        }
      });

      // Simulate extension (old date: 2026-02-23, new date: 2026-03-23)
      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const response = await indexStub.fetch(
        new Request('http://internal/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: 'test-hash',
            old_expires_at: '2026-02-23T00:00:00Z',
            new_expires_at: '2026-03-23T00:00:00Z'
          })
        })
      );

      expect(response.status).toBe(200);
      expect(env._state.expirationIndex['2026-02-23']).not.toContain('test-hash');
      expect(env._state.expirationIndex['2026-03-23']).toContain('test-hash');
    });

    it('should delete content when expiration date arrives', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'test-hash': {
            hash_256t: 'test-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_123',
            created_at: '2026-01-23T00:00:00Z',
            expires_at: '2026-01-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-01-23': ['test-hash']
        },
        r2Objects: {
          'test-hash': 'content data'
        }
      });

      // Simulate scheduled job fetching expired content
      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const expiredResponse = await indexStub.fetch(
        new Request('http://internal/expired?date=2026-01-23', { method: 'GET' })
      );
      const expiredData = await expiredResponse.json();

      expect(expiredData.hashes).toContain('test-hash');

      // Delete the content
      const result = await deleteContent(env, 'test-hash', env._state.metadata['test-hash'], 'expired');

      expect(result.success).toBe(true);
      expect(env._state.metadata['test-hash']).toBeUndefined();
      expect(env._state.r2Objects['test-hash']).toBeUndefined();
      expect(env._state.deletionRecords['test-hash']).toBeDefined();
      expect(env._state.deletionRecords['test-hash'].reason).toBe('expired');
    });
  });

  describe('Extension Wins Strategy', () => {
    it('should skip deletion if content was extended after indexing', async () => {
      const today = '2026-01-23';
      const env = createMockEnv({
        contentMetadata: {
          'test-hash': {
            hash_256t: 'test-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_123',
            created_at: '2026-01-23T00:00:00Z',
            expires_at: '2026-02-23T00:00:00Z' // Extended after indexing
          }
        },
        expirationIndex: {
          '2026-01-23': ['test-hash'] // Still in today's index
        }
      });

      // Get metadata to check expiration
      const metadata = await getContentMetadata(env, 'test-hash');
      const expiresDate = metadata.expires_at.split('T')[0];

      // "Extension wins" check
      expect(expiresDate > today).toBe(true);
      
      // Content should not be deleted
      expect(env._state.metadata['test-hash']).toBeDefined();
    });

    it('should delete content if extension date has also passed', async () => {
      const today = '2026-02-23';
      const env = createMockEnv({
        contentMetadata: {
          'test-hash': {
            hash_256t: 'test-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_123',
            created_at: '2026-01-23T00:00:00Z',
            expires_at: '2026-02-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-02-23': ['test-hash']
        },
        r2Objects: {
          'test-hash': 'content data'
        }
      });

      const metadata = await getContentMetadata(env, 'test-hash');
      const expiresDate = metadata.expires_at.split('T')[0];

      // Content has expired (date matches)
      expect(expiresDate <= today).toBe(true);

      // Delete the content
      const result = await deleteContent(env, 'test-hash', metadata, 'expired');

      expect(result.success).toBe(true);
      expect(env._state.metadata['test-hash']).toBeUndefined();
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple expired items', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'hash-1': {
            hash_256t: 'hash-1',
            size_bytes: 1024,
            uploader_id: 'user_123',
            expires_at: '2026-01-23T00:00:00Z'
          },
          'hash-2': {
            hash_256t: 'hash-2',
            size_bytes: 2048,
            uploader_id: 'user_456',
            expires_at: '2026-01-23T00:00:00Z'
          },
          'hash-3': {
            hash_256t: 'hash-3',
            size_bytes: 4096,
            uploader_id: 'user_789',
            expires_at: '2026-01-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-01-23': ['hash-1', 'hash-2', 'hash-3']
        },
        r2Objects: {
          'hash-1': 'data1',
          'hash-2': 'data2',
          'hash-3': 'data3'
        }
      });

      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const expiredResponse = await indexStub.fetch(
        new Request('http://internal/expired?date=2026-01-23', { method: 'GET' })
      );
      const expiredData = await expiredResponse.json();

      expect(expiredData.hashes).toHaveLength(3);

      // Delete all expired content
      const results = await Promise.all(
        expiredData.hashes.map(hash =>
          deleteContent(env, hash, env._state.metadata[hash], 'expired')
        )
      );

      expect(results.every(r => r.success)).toBe(true);
      expect(env._state.metadata['hash-1']).toBeUndefined();
      expect(env._state.metadata['hash-2']).toBeUndefined();
      expect(env._state.metadata['hash-3']).toBeUndefined();
      expect(Object.keys(env._state.deletionRecords)).toHaveLength(3);
    });

    it('should handle batch limit correctly', async () => {
      // Create 5,001 expired items
      const hashes = Array.from({ length: 5001 }, (_, i) => `hash-${i}`);
      const metadata = {};
      hashes.forEach(hash => {
        metadata[hash] = {
          hash_256t: hash,
          size_bytes: 1024,
          uploader_id: 'user_123',
          expires_at: '2026-01-23T00:00:00Z'
        };
      });

      const env = createMockEnv({
        contentMetadata: metadata,
        expirationIndex: {
          '2026-01-23': hashes
        }
      });

      const BATCH_LIMIT = 5000;
      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const expiredResponse = await indexStub.fetch(
        new Request('http://internal/expired?date=2026-01-23', { method: 'GET' })
      );
      const expiredData = await expiredResponse.json();

      // Should only process up to BATCH_LIMIT
      const hashesToProcess = expiredData.hashes.slice(0, BATCH_LIMIT);
      
      expect(hashesToProcess.length).toBe(BATCH_LIMIT);
      expect(expiredData.hashes.length).toBe(5001);
    });
  });

  describe('Idempotency', () => {
    it('should handle deletion of already-deleted content gracefully', async () => {
      const env = createMockEnv({
        contentMetadata: {}, // Content already deleted
        expirationIndex: {
          '2026-01-23': ['test-hash']
        }
      });

      // Try to get metadata for non-existent content
      const metadata = await getContentMetadata(env, 'test-hash');
      expect(metadata).toBeNull();

      // Should handle gracefully (skip in real implementation)
    });
  });

  describe('Inline Content Handling', () => {
    it('should not attempt R2 deletion for inline content', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'inline-hash': {
            hash_256t: 'inline-hash',
            size_bytes: 32, // Small enough for inline
            content_type: 'text/plain',
            uploader_id: 'user_123',
            expires_at: '2026-01-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-01-23': ['inline-hash']
        }
      });

      const result = await deleteContent(
        env,
        'inline-hash',
        env._state.metadata['inline-hash'],
        'expired'
      );

      expect(result.success).toBe(true);
      expect(result.deleted_from_r2).toBe(false); // No R2 deletion for inline content
      expect(env._state.metadata['inline-hash']).toBeUndefined();
      expect(env._state.deletionRecords['inline-hash']).toBeDefined();
    });
  });

  describe('Donation Extension Flow', () => {
    it('should update ExpirationIndex when donation extends retention', async () => {
      const env = createMockEnv({
        contentMetadata: {
          'donated-hash': {
            hash_256t: 'donated-hash',
            size_bytes: 1024,
            content_type: 'text/plain',
            uploader_id: 'user_recipient',
            expires_at: '2026-02-23T00:00:00Z'
          }
        },
        expirationIndex: {
          '2026-02-23': ['donated-hash']
        }
      });

      // Simulate donation extension
      const indexStub = env.EXPIRATION_INDEX.get(env.EXPIRATION_INDEX.idFromName('global'));
      const response = await indexStub.fetch(
        new Request('http://internal/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hash_256t: 'donated-hash',
            old_expires_at: '2026-02-23T00:00:00Z',
            new_expires_at: '2026-04-23T00:00:00Z' // Extended 2 more months
          })
        })
      );

      expect(response.status).toBe(200);
      expect(env._state.expirationIndex['2026-02-23']).not.toContain('donated-hash');
      expect(env._state.expirationIndex['2026-04-23']).toContain('donated-hash');
    });
  });
});
