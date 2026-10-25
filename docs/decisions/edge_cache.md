# Explicit edge caching with prepaid download enforcement

The 256t.us custom-domain Worker runs before Cloudflare's cache. A response's
Cache-Control header alone does not populate edge cache, and hits still incur
a Worker request. The previous default-caching premise was incorrect.

Use caches.default explicitly for successful GET bodies, with at most a one-hour
TTL bounded by expiry. Key by canonical URL, extension and download disposition.
HEAD shares GET entries but cannot replace them with an empty body. Errors are
never cached. X-Cache reports HIT/MISS and client max-age is reduced on hits.

Every stored response, including a hit or HEAD, consumes a prepaid reservation.
A per-file Durable Object grants up to 250 requests for 60 seconds, deducted
before serving. Cached content cannot restore an exhausted budget. Version 2
misses read .meta (expiry/deleted/disputed) and the body; legacy sidecars still
read markers until migrated. The owning DO serializes sidecar updates.

The Cache API is local to each data center. TTL, rather than a local delete or
unverified purge-by-URL semantics, provides invalidation. New reservations also
check takedowns: paid files stop within a minute; inline and marker-only paths
stop within an hour. Responses are never cached beyond content expiry.

R2 egress is free; Workers requests, CPU, R2 reads and reservation operations
remain billable. See [cost safety](../cost-safety.md) for policy, operator setup,
verification and the remaining financial limitations.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
