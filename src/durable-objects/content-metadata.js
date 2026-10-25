/**
 * ContentMetadata Durable Object
 * Stores metadata for uploaded content including hash, size, expiration, and contest status
 */

import { handleBackupRequest, registerForBackup } from '../utils/backup.js';
import { COST_POLICY, downloadAllowance, retentionWithinCap } from '../utils/cost-policy.js';
import { readCostSafety } from '../utils/cost-safety-state.js';

// Rate limiting constants
const DEFAULT_RATE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
const MINIMUM_MTBR_MS = 100; // Minimum time between requests: 100ms

export class ContentMetadata {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const backupResponse = await handleBackupRequest(this.state, request);
    if (backupResponse) return backupResponse;

    const response = await this.handleRequest(request);
    await this.ensureBackupRegistration();
    return response;
  }

  /**
   * Name this object was created with, once its data identifies it
   */
  async backupName() {
    const content = await this.state.storage.get('content');
    return content?.hash_256t;
  }

  /**
   * Register with the BackupIndex (once per object; see src/utils/backup.js)
   */
  async ensureBackupRegistration() {
    if (this.backupRegistered) return;
    const name = await this.backupName();
    if (!name) return;
    this.backupRegistered = await registerForBackup(this.state, this.env, 'CONTENT_METADATA', name);
  }

  async handleRequest(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/download/reserve' && method === 'POST') {
        return await this.state.blockConcurrencyWhile(() => this.reserveDownloads(url.searchParams.get('funded') === 'true'));
      }
      if (url.pathname === '/availability' && method === 'POST') {
        const { disputed } = await request.json();
        return await this.state.blockConcurrencyWhile(async () => {
          const content = await this.state.storage.get('content');
          if (!content) return new Response('Not found', { status: 404 });
          content.disputed = Boolean(disputed);
          content.availability_version = 2;
          await this.state.storage.put('content', content);
          await this.publishMeta(content);
          return Response.json({ success: true });
        });
      }
      // Create or update content record
      if (url.pathname === '/content' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.createContent(data));
      }

      // Get content metadata
      if (url.pathname === '/content' && method === 'GET') {
        return await this.getContent();
      }

      // Check if content exists
      if (url.pathname === '/exists' && method === 'GET') {
        return await this.checkExists();
      }

      // Extend content retention
      if (url.pathname === '/extend' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.extendRetention(data));
      }

      // Increment download count
      if (url.pathname === '/increment-download' && method === 'POST') {
        return await this.incrementDownloadCount();
      }

      // Check and update rate limit
      if (url.pathname === '/rate-limit/check' && method === 'POST') {
        return await this.checkRateLimit();
      }

      // Get rate limit status
      if (url.pathname === '/rate-limit' && method === 'GET') {
        return await this.getRateLimitStatus();
      }

      // Purchase rate limit
      if (url.pathname === '/rate-limit/purchase' && method === 'POST') {
        const data = await request.json();
        return await this.purchaseRateLimit(data);
      }

      // Get alternate suppliers
      if (url.pathname === '/suppliers' && method === 'GET') {
        return await this.getSuppliers();
      }

      // Add alternate supplier
      if (url.pathname === '/suppliers/add' && method === 'POST') {
        const data = await request.json();
        return await this.addSupplier(data);
      }

      // Remove alternate supplier
      if (url.pathname === '/suppliers/remove' && method === 'POST') {
        const data = await request.json();
        return await this.removeSupplier(data);
      }

      // Delete content metadata (hard delete for expiration)
      if (url.pathname === '/content' && method === 'DELETE') {
        return await this.deleteContent();
      }

      // Soft delete content
      if (url.pathname === '/soft-delete' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.softDeleteContent(data));
      }

      // Mark R2 deletion complete
      if (url.pathname === '/r2-deleted' && method === 'POST') {
        return await this.markR2Deleted();
      }

      // Mark content as contested (HTTP 451)
      if (url.pathname === '/contested' && method === 'POST') {
        const data = await request.json();
        return await this.state.blockConcurrencyWhile(() => this.markContested(data));
      }

      // Unmark content as contested
      if (url.pathname === '/contested' && method === 'DELETE') {
        return await this.state.blockConcurrencyWhile(() => this.unmarkContested());
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Internal error',
          message: error.message
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  }

  async alarm() {
    // Cloudflare retries a failed alarm with bounded exponential backoff. Read
    // current state rather than replaying a stale takedown/extension sidecar.
    await this.state.blockConcurrencyWhile(async () => {
      const content = await this.state.storage.get('content');
      if (content) await this.publishMeta(content, false);
    });
  }

  async publishMeta(content, scheduleRetry = true) {
    if (!this.env.CONTENT_BUCKET?.put) return;
    try {
      if (content.availability_version !== 2) {
        // Preserve pre-rollout marker state when a legacy record is extended.
        if (await this.env.CONTENT_BUCKET.head?.(`${content.hash_256t}.deleted`)) content.deleted_at ||= new Date().toISOString();
        if (await this.env.CONTENT_BUCKET.head?.(`${content.hash_256t}.disputed`)) content.disputed = true;
        content.availability_version = 2;
        await this.state.storage.put('content', content);
      }
      await this.env.CONTENT_BUCKET.put(`${content.hash_256t}.meta`, JSON.stringify({
        version: 2,
        expires_at: content.expires_at,
        deleted: Boolean(content.deleted_at),
        disputed: Boolean(content.disputed || content.contested)
      }), { httpMetadata: { contentType: 'application/json' } });
      if (content.r2_meta_version !== 2) {
        content.r2_meta_version = 2;
        await this.state.storage.put('content', content);
      }
    } catch (error) {
      // Keep committed availability authoritative and repair transient R2
      // failures even when the caller cannot safely repeat a mutation.
      if (scheduleRetry) await this.state.storage.setAlarm?.(Date.now() + 60000);
      throw error;
    }
  }

  // Reservations are deducted BEFORE serving and never returned. Isolate eviction
  // can waste allowance but cannot create extra allowance. Serialize reservations
  // across all colos; each lease lasts at most a minute for takedowns/brakes.
  async reserveDownloads(funded = false) {
    const content = await this.state.storage.get('content');
    if (!content || content.deleted_at || !Number.isFinite(new Date(content.expires_at).getTime()) || new Date(content.expires_at).getTime() <= Date.now()) {
      return Response.json({ count: 0 }, { status: 404 });
    }
    if (content.disputed || content.contested) return Response.json({ count: 0 }, { status: 451 });
    const budget = (await this.state.storage.get('download-budget')) || { reserved: 0, purchases: {} };
    const remaining = Math.max(0, downloadAllowance(content) - budget.reserved);
    let count = Math.min(COST_POLICY.leaseSize, remaining);
    budget.reserved += count;
    // Existing bandwidth purchases also prepay a finite request count at >= $4/M.
    let safety;
    try { safety = await readCostSafety(this.env); }
    catch { return Response.json({ count: 0 }, { status: 503 }); }
    if (safety.hard_stop) return Response.json({ count: 0 }, { status: 503 });
    const brake = safety.brake;
    if (!count && (!brake || funded)) {
      for (const purchase of content.rate_limit_records || []) {
        if (new Date(purchase.expires_at).getTime() <= Date.now()) continue;
        const paidRequests = Math.min(purchase.max_requests || 0,
          Math.floor((purchase.price_cents || 0) / 100 / COST_POLICY.downloadDollarsPerMillion * 1e6));
        const used = budget.purchases[purchase.record_id] || 0;
        count = Math.min(COST_POLICY.leaseSize, Math.max(0, paidRequests - used));
        if (count) {
          budget.purchases[purchase.record_id] = used + count;
          break;
        }
      }
    }
    if (!count) return Response.json({ count: 0 }, { status: 429 });
    await this.state.storage.put('download-budget', budget);
    return Response.json({ count, expires_at: Math.min(Date.now() + COST_POLICY.leaseSeconds * 1000,
      new Date(content.expires_at).getTime()), allowance: downloadAllowance(content), reserved: budget.reserved });
  }

  /**
   * Create content record
   */
  async createContent(data) {
    if (!retentionWithinCap(null, data.retention_months)) {
      return Response.json({ error: 'retention_cap', message: 'Retention must be 1–120 whole months' }, { status: 400 });
    }
    const existingContent = await this.state.storage.get('content');

    if (existingContent) {
      // Content already exists, extend retention instead
      return new Response(
        JSON.stringify({
          error: 'Content already exists',
          message: 'This content has already been uploaded',
          content: existingContent
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Calculate expiration date
    const created_at = new Date();
    const expires_at = new Date(created_at);
    const currentDay = expires_at.getDate();
    expires_at.setMonth(expires_at.getMonth() + data.retention_months);
    // If the day changed due to month length differences, set to last day of that month
    if (expires_at.getDate() !== currentDay) {
      expires_at.setDate(0); // Sets to last day of previous month
    }

    // Determine if content is inline (≤64 bytes)
    // Inline content doesn't need rate limiting
    const isInline = data.size_bytes <= 64;

    const content = {
      hash_256t: data.hash_256t,
      availability_version: 2,
      size_bytes: data.size_bytes,
      content_type: data.content_type || 'application/octet-stream',
      uploader_id: data.uploader_id,
      created_at: created_at.toISOString(),
      expires_at: expires_at.toISOString(),
      retention_months: data.retention_months,
      retention_payments: [
        {
          payment_id: data.payment_id || null,
          amount_cents: data.amount_cents,
          months_added: data.retention_months,
          payer_id: data.uploader_id,
          created_at: created_at.toISOString()
        }
      ],
      // Rate limiting fields
      last_served_at: null,
      rate_limit_records: [],
      // Set default rate limit for non-inline content only
      default_rate_limit: isInline ? null : {
        min_time_between_requests_ms: DEFAULT_RATE_LIMIT_MS,
        expires_at: new Date(created_at.getTime() + DEFAULT_RATE_LIMIT_MS).toISOString()
      },
      // Alternate suppliers
      alternate_suppliers: [],
      // Contested content flag (HTTP 451)
      contested: false,
      contested_reason: null,
      
      // Deletion fields (for soft delete)
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      pending_r2_deletion: false
    };

    await this.state.storage.put('content', content);
    await this.publishMeta(content);

    return new Response(JSON.stringify(content), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Get content metadata
   */
  async getContent() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(content), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  /**
   * Check if content exists
   */
  async checkExists() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          exists: false
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        exists: true,
        deleted: Boolean(content.deleted_at),
        size_bytes: content.size_bytes,
        expires_at: content.expires_at
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Extend content retention
   */
  async extendRetention(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Stripe can retry after applying retention but before its payment record
    // was written. Never apply the same paid session twice or refund it as a
    // newly rejected extension.
    if (data.payment_id && content.retention_payments?.some(p => p.payment_id === data.payment_id)) {
      return Response.json({ expires_at: content.expires_at, months_added: 0,
        total_payments: content.retention_payments.length, duplicate: true });
    }

    if (content.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'CONTENT_DELETED', message: 'Deleted content cannot be extended' }),
        { status: 410, headers: { 'content-type': 'application/json' } }
      );
    }

    if (!retentionWithinCap(content.expires_at, data.months_to_add)) {
      return Response.json({ error: 'retention_cap', message: 'Prepaid retention cannot exceed 10 years from today' }, { status: 400 });
    }

    // Calculate new expiration
    const current_expires_at = new Date(Math.max(Date.now(), new Date(content.expires_at).getTime()));
    const new_expires_at = new Date(current_expires_at);
    const currentDay = new_expires_at.getDate();
    new_expires_at.setMonth(new_expires_at.getMonth() + data.months_to_add);
    // If the day changed due to month length differences, set to last day of that month
    if (new_expires_at.getDate() !== currentDay) {
      new_expires_at.setDate(0); // Sets to last day of previous month
    }

    // Add payment record
    const payment = {
      payment_id: data.payment_id || null,
      amount_cents: data.amount_cents,
      months_added: data.months_to_add,
      payer_id: data.payer_id || null,
      created_at: new Date().toISOString()
    };

    content.expires_at = new_expires_at.toISOString();
    content.retention_months = (content.retention_months || 0) + data.months_to_add;
    content.retention_payments.push(payment);

    await this.state.storage.put('content', content);
    await this.publishMeta(content);

    return new Response(
      JSON.stringify({
        expires_at: content.expires_at,
        months_added: data.months_to_add,
        total_payments: content.retention_payments.length
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Increment download count
   */
  async incrementDownloadCount() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Initialize download count if not present
    if (typeof content.download_count === 'undefined') {
      content.download_count = 0;
    }

    content.download_count += 1;
    content.last_downloaded_at = new Date().toISOString();

    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({
        download_count: content.download_count
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Check rate limit and update last_served_at if allowed
   * Returns 200 if allowed, 429 if rate limited
   */
  async checkRateLimit() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const now = new Date();
    const effectiveMTBR = this.getEffectiveMTBR(content, now);

    // If MTBR is infinite, content is rate limited
    if (effectiveMTBR === Infinity) {
      return new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          message: 'Rate limit exceeded. Purchase bandwidth to serve this content.',
          cid: content.hash_256t,
          retry_after_seconds: null,
          next_available_at: null
        }),
        {
          status: 429,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check if this is the first request (last_served_at is null)
    if (!content.last_served_at) {
      // Allow the first request
      content.last_served_at = now.toISOString();
      await this.state.storage.put('content', content);

      const nextAvailableAt = new Date(now.getTime() + effectiveMTBR);
      return new Response(
        JSON.stringify({
          allowed: true,
          next_available_at: nextAvailableAt.toISOString(),
          effective_mtbr_ms: effectiveMTBR
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Check if enough time has passed
    const lastServedAt = new Date(content.last_served_at);
    const timeSinceLastServed = now.getTime() - lastServedAt.getTime();

    if (timeSinceLastServed >= effectiveMTBR) {
      // Allow the request
      content.last_served_at = now.toISOString();
      await this.state.storage.put('content', content);

      const nextAvailableAt = new Date(now.getTime() + effectiveMTBR);
      return new Response(
        JSON.stringify({
          allowed: true,
          next_available_at: nextAvailableAt.toISOString(),
          effective_mtbr_ms: effectiveMTBR
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Rate limited
    const nextAvailableAt = new Date(lastServedAt.getTime() + effectiveMTBR);
    const retryAfterSeconds = Math.ceil((nextAvailableAt.getTime() - now.getTime()) / 1000);

    return new Response(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded. Wait until ${nextAvailableAt.toISOString()}`,
        cid: content.hash_256t,
        retry_after_seconds: retryAfterSeconds,
        next_available_at: nextAvailableAt.toISOString()
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Get rate limit status (does not update last_served_at)
   */
  async getRateLimitStatus() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const now = new Date();
    const isInline = content.size_bytes <= 64;
    const effectiveMTBR = this.getEffectiveMTBR(content, now);

    // Get active rate limits
    const activeRateLimits = (content.rate_limit_records || [])
      .filter(record => {
        const startsAt = new Date(record.starts_at);
        const expiresAt = new Date(record.expires_at);
        return startsAt <= now && expiresAt > now;
      })
      .map(record => ({
        record_id: record.record_id,
        min_time_between_requests_ms: record.min_time_between_requests_ms,
        expires_at: record.expires_at
      }));

    // Calculate next_available_at
    let nextAvailableAt = null;
    if (content.last_served_at && effectiveMTBR !== Infinity) {
      const lastServedAt = new Date(content.last_served_at);
      const calculatedNextAvailable = new Date(lastServedAt.getTime() + effectiveMTBR);
      if (calculatedNextAvailable > now) {
        nextAvailableAt = calculatedNextAvailable.toISOString();
      }
    }

    return new Response(
      JSON.stringify({
        cid: content.hash_256t,
        size_bytes: content.size_bytes,
        is_inline: isInline,
        last_served_at: content.last_served_at,
        effective_mtbr_ms: effectiveMTBR === Infinity ? null : effectiveMTBR,
        next_available_at: nextAvailableAt,
        is_rate_limited: effectiveMTBR === Infinity,
        active_rate_limits: activeRateLimits,
        default_rate_limit: content.default_rate_limit,
        content_expires_at: content.expires_at
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Purchase rate limit bandwidth for this content
   */
  async purchaseRateLimit(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (content.deleted_at) return Response.json({ error: 'content_deleted' }, { status: 410 });

    // Create rate limit record
    const now = new Date();
    const record = {
      record_id: data.record_id,
      payer_id: data.payer_id,
      min_time_between_requests_ms: data.min_time_between_requests_ms,
      starts_at: now.toISOString(),
      expires_at: new Date(now.getTime() + data.duration_seconds * 1000).toISOString(),
      max_requests: data.max_requests,
      max_bytes: data.max_bytes,
      price_cents: data.price_cents,
      created_at: now.toISOString()
    };

    // Initialize rate_limit_records if not present (for existing content)
    if (!content.rate_limit_records) {
      content.rate_limit_records = [];
    }

    content.rate_limit_records.push(record);
    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({
        record_id: record.record_id,
        starts_at: record.starts_at,
        expires_at: record.expires_at
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Calculate effective minimum time between requests
   * Returns Infinity if no active rate limits exist
   */
  getEffectiveMTBR(content, now) {
    const activeRateLimits = [];

    // Check purchased rate limits
    if (content.rate_limit_records) {
      for (const record of content.rate_limit_records) {
        const startsAt = new Date(record.starts_at);
        const expiresAt = new Date(record.expires_at);
        if (startsAt <= now && expiresAt > now) {
          activeRateLimits.push(record.min_time_between_requests_ms);
        }
      }
    }

    // Check default rate limit
    if (content.default_rate_limit) {
      const expiresAt = new Date(content.default_rate_limit.expires_at);
      if (expiresAt > now) {
        activeRateLimits.push(content.default_rate_limit.min_time_between_requests_ms);
      }
    }

    // If no active rate limits, return Infinity (blocked)
    if (activeRateLimits.length === 0) {
      return Infinity;
    }

    // Return the lowest MTBR (most permissive)
    return Math.min(...activeRateLimits);
  }

  /**
   * Get alternate suppliers
   */
  async getSuppliers() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        alternate_suppliers: content.alternate_suppliers || []
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Add alternate supplier
   */
  async addSupplier(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!content.alternate_suppliers) {
      content.alternate_suppliers = [];
    }

    // Check if supplier already exists
    const exists = content.alternate_suppliers.some(s => s.supplier_id === data.supplier_id);
    if (exists) {
      return new Response(
        JSON.stringify({
          error: 'Supplier already added'
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Add supplier
    content.alternate_suppliers.push({
      supplier_id: data.supplier_id,
      supplier_name: data.supplier_name,
      supplier_url: data.supplier_url,
      verified_at: new Date().toISOString()
    });

    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Remove alternate supplier
   */
  async removeSupplier(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (!content.alternate_suppliers) {
      content.alternate_suppliers = [];
    }

    // Remove supplier
    content.alternate_suppliers = content.alternate_suppliers.filter(
      s => s.supplier_id !== data.supplier_id
    );

    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Delete content metadata (hard delete)
   * Used by expiration system to remove expired content
   */
  async deleteContent() {
    const content = await this.state.storage.get('content');

    if (!content) {
      // Already deleted or never existed
      return new Response(
        JSON.stringify({ success: true, alreadyDeleted: true }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Delete all stored data for this content
    await this.state.storage.deleteAll();

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Mark content as contested (HTTP 451 - Unavailable For Legal Reasons)
   * This prevents content from being served while legal process is ongoing
   */
  async markContested(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    // Validate input
    if (!data || typeof data !== 'object') {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Request body must be a valid JSON object'
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    content.contested = true;
    content.contested_reason = data.reason || 'Content is subject to legal review';
    content.contested_at = new Date().toISOString();
    content.contested_by = data.admin_id || 'system';

    await this.state.storage.put('content', content);
    await this.publishMeta(content);

    return new Response(
      JSON.stringify({ success: true, contested: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Unmark content as contested (restore normal access)
   */
  async unmarkContested() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({
          error: 'Content not found'
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    content.contested = false;
    content.contested_reason = null;
    content.uncontested_at = new Date().toISOString();

    await this.state.storage.put('content', content);
    await this.publishMeta(content);

    return new Response(
      JSON.stringify({ success: true, contested: false }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Soft delete content
   * Marks content as deleted but doesn't remove R2 data immediately
   */
  async softDeleteContent(data) {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Content not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    if (content.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Content already deleted' }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );
    }

    // Mark as deleted
    content.deleted_at = new Date().toISOString();
    content.deleted_by = data.deleted_by || 'unknown';
    content.deletion_reason = data.deletion_reason || 'user_request';
    content.pending_r2_deletion = true;

    await this.state.storage.put('content', content);
    await this.publishMeta(content);

    return new Response(
      JSON.stringify({ success: true, deleted: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  /**
   * Mark R2 deletion as complete
   */
  async markR2Deleted() {
    const content = await this.state.storage.get('content');

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Content not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    content.pending_r2_deletion = false;

    await this.state.storage.put('content', content);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
