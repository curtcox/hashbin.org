/**
 * Content Deletion Service
 * Handles hard deletion of content from R2 and ContentMetadata
 * Creates public deletion records for transparency
 */

/**
 * Delete content completely from the system
 * 
 * @param {Object} env - Environment bindings
 * @param {string} hash_256t - Content hash to delete
 * @param {Object} metadata - Content metadata (if already fetched)
 * @param {string} reason - Deletion reason ('expired', 'contested', 'admin_action', etc.)
 * @returns {Promise<Object>} Deletion result with success status
 */
export async function deleteContent(env, hash_256t, metadata = null, reason = 'expired') {
  try {
    // Fetch metadata if not provided
    if (!metadata) {
      const metadataId = env.CONTENT_METADATA.idFromName(hash_256t);
      const metadataStub = env.CONTENT_METADATA.get(metadataId);
      
      const metadataResponse = await metadataStub.fetch(
        new Request('https://dummy/content', { method: 'GET' })
      );
      
      if (metadataResponse.status === 404) {
        // Content already deleted or never existed
        return {
          success: true,
          alreadyDeleted: true,
          hash_256t
        };
      }
      
      metadata = await metadataResponse.json();
    }

    // Determine if content is inline (≤64 bytes)
    const isInline = metadata.size_bytes && metadata.size_bytes <= 64;

    // Delete from R2 if not inline content
    if (!isInline) {
      try {
        await env.CONTENT_BUCKET.delete(hash_256t);
        console.log(`Deleted R2 object: ${hash_256t}`);
      } catch (error) {
        // Log but don't fail - content might already be deleted from R2
        console.warn(`Failed to delete R2 object ${hash_256t}:`, error.message);
      }
    }

    // Delete ContentMetadata DO entry
    try {
      const metadataId = env.CONTENT_METADATA.idFromName(hash_256t);
      const metadataStub = env.CONTENT_METADATA.get(metadataId);
      
      await metadataStub.fetch(
        new Request('https://dummy/content', { method: 'DELETE' })
      );
      console.log(`Deleted ContentMetadata: ${hash_256t}`);
    } catch (error) {
      console.warn(`Failed to delete ContentMetadata ${hash_256t}:`, error.message);
    }

    // Create deletion record for transparency
    const deletionRecordId = env.DELETION_RECORD.idFromName('global');
    const deletionRecordStub = env.DELETION_RECORD.get(deletionRecordId);
    
    await deletionRecordStub.fetch(
      new Request('https://dummy/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hash_256t,
          reason,
          uploader_id: metadata.uploader_id,
          size_bytes: metadata.size_bytes,
          content_type: metadata.content_type
        })
      })
    );

    console.log(`Content deleted: ${hash_256t}, reason: ${reason}`);

    return {
      success: true,
      hash_256t,
      reason,
      deleted_from_r2: !isInline,
      deletion_record_created: true
    };
  } catch (error) {
    console.error(`Error deleting content ${hash_256t}:`, error);
    return {
      success: false,
      hash_256t,
      error: error.message
    };
  }
}

/**
 * Get content metadata helper
 * 
 * @param {Object} env - Environment bindings
 * @param {string} hash_256t - Content hash
 * @returns {Promise<Object|null>} Content metadata or null if not found
 */
export async function getContentMetadata(env, hash_256t) {
  try {
    const metadataId = env.CONTENT_METADATA.idFromName(hash_256t);
    const metadataStub = env.CONTENT_METADATA.get(metadataId);
    
    const response = await metadataStub.fetch(
      new Request('https://dummy/content', { method: 'GET' })
    );
    
    if (response.status === 404) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching metadata for ${hash_256t}:`, error);
    return null;
  }
}
