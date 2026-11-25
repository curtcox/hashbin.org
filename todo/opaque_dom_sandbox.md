# B20: opaque DOM execution

Slidev Online cannot use the SDK's worker execution world to mount Vue: workers
have no DOM. `createSandbox({ execution: 'frame' })` adds an explicit DOM mode
with the same opaque `allow-scripts` boundary. Worker execution remains the default.

Released in SDK v0.6.0 (live at `https://hashbin.org/sdk/v0.6.0/`):

- One-time parent-authenticated bootstrap and a transferred private message port.
- A visible iframe; author source evaluates as a blob module only inside it.
- Worker-like `postMessage` and message events; global window messages are dropped.
- The existing parent fetch proxy and `hashbinSandbox.import()` for verified,
  service-worker-backed module delivery. Source modules must bundle dependencies
  or use blob module registries; relative imports inside fetched blobs do not
  resolve against their original HTTP URLs.
- Queuing until full module evaluation (including top-level await), startup timeout, exception/rejection
  reporting and teardown. DOM scripts can monopolize the frame's event loop;
  this mode does not promise worker-style interruption of CPU-bound code.
- Hosted origin and module-worker options are rejected for DOM mode.
- Old immutable releases, bootstrap bytes and hashes are unchanged.

Review regressions also cover messages queued across top-level await, evaluation
that never completes, and proxied 204/205/304 responses with null bodies.

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

Done: the v0.6.0 release is deployed and its live `integrity.json` matches the repository;
Fragment Kit v0.4.4 vendors it; Slidev Online is deployed on `https://slides.hashbin.page`
with that kit, and `ai.hashbin.page` has its `/slides-v0.4.4/` entry.

Remaining:

1. Live acceptance of DOM mode in Slidev Online (rendering, isolation, offline module delivery).
2. Slidev's Phase 0 visual-fidelity and runtime-performance gates, tracked in the Slidev
   repository.
