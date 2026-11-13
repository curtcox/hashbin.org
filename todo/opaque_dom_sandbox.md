# B18: opaque DOM execution

Slidev Online cannot use the SDK's worker execution world to mount Vue: workers
have no DOM. `createSandbox({ execution: 'frame' })` adds an explicit DOM mode
with the same opaque `allow-scripts` boundary. Worker execution remains the default.

Implementation prepared for SDK v0.6.0, **not deployed or published**:

- One-time parent-authenticated bootstrap and a transferred private message port.
- A visible iframe; author source evaluates as a blob module only inside it.
- Worker-like `postMessage` and message events; global window messages are dropped.
- The existing parent fetch proxy and `hashbinSandbox.import()` for verified,
  service-worker-backed module delivery. Source modules must bundle dependencies
  or use blob module registries; relative imports inside fetched blobs do not
  resolve against their original HTTP URLs.
- Queuing until module initialization, startup timeout, exception/rejection
  reporting and teardown. DOM scripts can monopolize the frame's event loop;
  this mode does not promise worker-style interruption of CPU-bound code.
- Hosted origin and module-worker options are rejected for DOM mode.
- Old immutable releases, bootstrap bytes and hashes are unchanged.

Local verification:

```sh
npm run lint
npm run test:unit
npm run test:dom
npm run test:hosted
```

The DOM suite runs Chromium and WebKit. It covers DOM rendering, opaque origin,
parent DOM/storage/cookie/top-navigation isolation, queued/private messages,
module exceptions/rejections, default worker compatibility, and fully offline
module import after a service-worker-backed reload. The test server refuses HTTP
connections during that last check, so the test cannot fall back to network.

Remaining:

1. Review and merge the SDK v0.6.0 proposal; check the production deployment.
2. Verify the versioned files and integrity manifest from the live origin.
3. Update Fragment Kit through its vendor/release workflow; do not patch v0.4.3.
4. Vendor the new kit release in Slidev Online, then finish its Phase 0 visual
   fidelity and complete-runtime performance gates before product phases.

No account setup, registration, release tags or production deployment were
performed by the implementation task.
