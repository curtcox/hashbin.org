/**
 * Supplier API Handlers
 * Endpoints for managing alternate content suppliers
 */

import { authenticate } from '../auth/middleware.js';
import { 
  validateSupplierURL, 
  validateSupplierType, 
  validateSupplierName,
  sanitizeSupplierName
} from '../utils/supplier-validation.js';
import { validate256tCID } from '../utils/hash256t.js';

const MAX_SUPPLIERS_PER_USER = 20;
const SCAN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/suppliers
 * Register a new alternate supplier
 */
export async function handleCreateSupplier(request, env) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const data = await request.json();
    const userId = authResult.user.userId;

    // Validate required fields
    const nameValidation = validateSupplierName(data.name);
    if (!nameValidation.valid) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: nameValidation.error
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const typeValidation = validateSupplierType(data.supplier_type);
    if (!typeValidation.valid) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: typeValidation.error
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const urlValidation = validateSupplierURL(data.base_url);
    if (!urlValidation.valid) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: urlValidation.error
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Validate single_cid if SINGLE_CID type
    if (data.supplier_type === 'SINGLE_CID') {
      if (!data.single_cid) {
        return new Response(
          JSON.stringify({
            error: 'Validation error',
            message: 'single_cid is required for SINGLE_CID supplier type'
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' }
          }
        );
      }

      if (!validate256tCID(data.single_cid)) {
        return new Response(
          JSON.stringify({
            error: 'Validation error',
            message: 'Invalid CID format'
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
    }

    // Check user's supplier limit
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const profileResponse = await userProfileStub.fetch(
      new Request('http://internal/profile')
    );
    const profileData = await profileResponse.json();
    
    const supplierCount = profileData.supplier_count || 0;
    if (supplierCount >= MAX_SUPPLIERS_PER_USER) {
      return new Response(
        JSON.stringify({
          error: 'Limit exceeded',
          message: `Maximum ${MAX_SUPPLIERS_PER_USER} suppliers allowed per user`
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Create supplier
    const supplierId = crypto.randomUUID();
    const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
    const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);

    const supplier = {
      supplier_id: supplierId,
      owner_user_id: userId,
      name: sanitizeSupplierName(data.name),
      supplier_type: data.supplier_type,
      base_url: data.base_url,
      single_cid: data.single_cid || null,
      scan_status: 'pending',
      is_active: true
    };

    await supplierRegistryStub.fetch(
      new Request('http://internal/supplier', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(supplier)
      })
    );

    // Update user profile with new supplier
    await userProfileStub.fetch(
      new Request('http://internal/suppliers/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId })
      })
    );

    // TODO: Trigger async scan job
    // For now, return with pending status

    return new Response(
      JSON.stringify({
        supplier_id: supplierId,
        name: supplier.name,
        supplier_type: supplier.supplier_type,
        base_url: supplier.base_url,
        scan_status: 'pending',
        cid_count: 0,
        created_at: new Date().toISOString()
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to create supplier',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * GET /api/suppliers
 * List user's registered suppliers
 */
export async function handleListSuppliers(request, env) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const userId = authResult.user.userId;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    // Get user's supplier IDs
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    const profileResponse = await userProfileStub.fetch(
      new Request('http://internal/profile')
    );
    const profileData = await profileResponse.json();
    
    const supplierIds = profileData.supplier_ids || [];

    // Paginate supplier IDs
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedIds = supplierIds.slice(start, end);

    // Fetch supplier details
    const suppliers = [];
    for (const supplierId of paginatedIds) {
      const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
      const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
      
      try {
        const supplierResponse = await supplierRegistryStub.fetch(
          new Request('http://internal/supplier')
        );
        
        if (supplierResponse.ok) {
          const supplier = await supplierResponse.json();
          suppliers.push(supplier);
        }
      } catch (error) {
        console.error(`Error fetching supplier ${supplierId}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        suppliers,
        page,
        limit,
        total: supplierIds.length,
        has_more: end < supplierIds.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to list suppliers',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * GET /api/suppliers/:id
 * Get supplier details
 */
export async function handleGetSupplier(request, env, supplierId) {
  try {
    const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
    const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
    
    const response = await supplierRegistryStub.fetch(
      new Request('http://internal/supplier')
    );

    if (!response.ok) {
      return response;
    }

    const supplier = await response.json();

    return new Response(JSON.stringify(supplier), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to get supplier',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * DELETE /api/suppliers/:id
 * Remove a supplier
 */
export async function handleDeleteSupplier(request, env, supplierId) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const userId = authResult.user.userId;

    // Get supplier to verify ownership
    const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
    const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
    
    const supplierResponse = await supplierRegistryStub.fetch(
      new Request('http://internal/supplier')
    );

    if (!supplierResponse.ok) {
      return supplierResponse;
    }

    const supplier = await supplierResponse.json();

    // Verify ownership
    if (supplier.owner_user_id !== userId) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'You do not own this supplier'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Delete supplier
    await supplierRegistryStub.fetch(
      new Request('http://internal/supplier', {
        method: 'DELETE'
      })
    );

    // Remove from user profile
    const userProfileId = env.USER_PROFILES.idFromName(userId);
    const userProfileStub = env.USER_PROFILES.get(userProfileId);
    
    await userProfileStub.fetch(
      new Request('http://internal/suppliers/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId })
      })
    );

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to delete supplier',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * PATCH /api/suppliers/:id
 * Update supplier (name, active status)
 */
export async function handleUpdateSupplier(request, env, supplierId) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const userId = authResult.user.userId;
    const data = await request.json();

    // Get supplier to verify ownership
    const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
    const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
    
    const supplierResponse = await supplierRegistryStub.fetch(
      new Request('http://internal/supplier')
    );

    if (!supplierResponse.ok) {
      return supplierResponse;
    }

    const supplier = await supplierResponse.json();

    // Verify ownership
    if (supplier.owner_user_id !== userId) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'You do not own this supplier'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Validate updates
    if (data.name !== undefined) {
      const nameValidation = validateSupplierName(data.name);
      if (!nameValidation.valid) {
        return new Response(
          JSON.stringify({
            error: 'Validation error',
            message: nameValidation.error
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      supplier.name = sanitizeSupplierName(data.name);
    }

    if (data.is_active !== undefined) {
      supplier.is_active = Boolean(data.is_active);
    }

    // Update supplier
    await supplierRegistryStub.fetch(
      new Request('http://internal/supplier', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(supplier)
      })
    );

    return new Response(JSON.stringify(supplier), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to update supplier',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * POST /api/suppliers/:id/scan
 * Request rescan of supplier
 */
export async function handleRescanSupplier(request, env, supplierId) {
  const authResult = await authenticate(request, env);
  
  if (!authResult.authenticated) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required'
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  try {
    const userId = authResult.user.userId;

    // Get supplier to verify ownership and check cooldown
    const supplierRegistryId = env.SUPPLIER_REGISTRY.idFromName(supplierId);
    const supplierRegistryStub = env.SUPPLIER_REGISTRY.get(supplierRegistryId);
    
    const supplierResponse = await supplierRegistryStub.fetch(
      new Request('http://internal/supplier')
    );

    if (!supplierResponse.ok) {
      return supplierResponse;
    }

    const supplier = await supplierResponse.json();

    // Verify ownership
    if (supplier.owner_user_id !== userId) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'You do not own this supplier'
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check cooldown
    if (supplier.last_scanned_at) {
      const lastScan = new Date(supplier.last_scanned_at);
      const now = new Date();
      const timeSinceLastScan = now - lastScan;
      
      if (timeSinceLastScan < SCAN_COOLDOWN_MS) {
        const remainingMs = SCAN_COOLDOWN_MS - timeSinceLastScan;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        
        return new Response(
          JSON.stringify({
            error: 'Too soon',
            message: `Please wait ${remainingMinutes} minutes before rescanning`
          }),
          {
            status: 429,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
    }

    // Update scan status
    supplier.scan_status = 'pending';
    await supplierRegistryStub.fetch(
      new Request('http://internal/supplier', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(supplier)
      })
    );

    // TODO: Trigger async scan job

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Scan initiated'
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to rescan supplier',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * GET /api/content/:cid/suppliers
 * Get alternate suppliers for a CID
 */
export async function handleGetCIDSuppliers(request, env, cid) {
  try {
    // Query ContentMetadata for alternate suppliers
    const contentMetadataId = env.CONTENT_METADATA.idFromName(cid);
    const contentMetadataStub = env.CONTENT_METADATA.get(contentMetadataId);
    
    const response = await contentMetadataStub.fetch(
      new Request('http://internal/suppliers')
    );

    if (!response.ok) {
      // If content not found, return empty suppliers list
      if (response.status === 404) {
        return new Response(
          JSON.stringify({
            cid,
            suppliers: []
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return response;
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        cid,
        suppliers: data.alternate_suppliers || []
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to get suppliers',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
