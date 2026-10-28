# Browser clients: publishing, allowances and migration

HashBin supports two browser save flows. Start with hosted approval unless your app needs
background saves. The public [browser safety guide](https://hashbin.org/docs/browser-client-safety)
and [SDK guide](https://hashbin.org/docs/sdk) cover the same choices for app developers.

| Flow | SDK call | Where the user approves | Credentials in the app |
| --- | --- | --- | --- |
| One save at a time | `publish(bytes, options)` | HashBin Publish shows each document, retention and exact price | None |
| Autosave or background operations | `authorize(options)`, then `save(bytes, options)` | HashBin's allowance consent page | Access/refresh tokens bound to a browser key with DPoP |

## Save with hosted approval

Register the app at `/developers`, including an exact redirect URI without a fragment. A
client ID is public; it is not a secret or an isolation boundary between co-hosted apps.

```js
import { createClient } from 'https://hashbin.org/sdk/hashbin.js';

const client = createClient({
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'https://your-app.example/callback'
});

// Call publish directly from a click handler, before awaiting other work.
saveButton.onclick = async () => {
  const result = await client.publish(editor.value, {
    contentType: 'text/plain',
    clientState: { draft: editor.value }
  });
  if (!result.redirected) showSavedCID(result.cid);
};
```

The default API host is `https://hashbin.org`, even when the SDK runs on another origin.
The default content host is `https://256t.us`; set `baseUrl` and `contentBaseUrl` for local tests.

The popup accepts 1 byte to 5 MiB. HashBin checks the opener and registered origin, displays
a text preview (up to 16 KiB), and requires a separate approval click. The five-minute,
single-use approval binds the user, app, CID, content type, retention and exact charge.
HashBin signs in using its own first-party session. Neither tokens nor the approval ticket
are returned to the client; the SDK checks the returned CID against the submitted bytes.

If the popup is blocked, documents up to 512 KiB fall back to a fragment redirect. Larger
documents require enabling popups and retrying. Explicit `mode: 'redirect'` has the same
512 KiB limit. Fragment data is not sent to the server. The SDK keeps the submitted bytes
and optional `clientState` in the client's session storage. On the registered callback page,
create the same client and handle the result:

```js
if (new URLSearchParams(location.hash.slice(1)).has('hashbin_publish')) {
  const { cid, clientState } = await client.handlePublishCallback();
  restoreEditorState(clientState); // Apply your own application's state.
  showSavedCID(cid);
  history.replaceState(null, '', location.pathname + location.search);
}
```

Redirect results are correlated with the saved transaction and verified before returning.
Use redirect mode for a client with `Cross-Origin-Opener-Policy: same-origin`, or change that
policy to `same-origin-allow-popups` if appropriate for the app. Losing the opener link does
not silently retry a paid save. A rejected, expired or already-used approval requires a new review.

## Opt into an allowance

`authorize()` defaults to popup mode and starts at HashBin Publish's allowance entry page.
The user proceeds to HashBin consent, where permissions can be removed and limits tightened.
The SDK suggests $1/month and 1 MiB per file; the consent page defaults to 30 days and also
offers 1, 7, 90 or 365 days, or no grant expiry. Refresh-family limits still apply.

```js
connectButton.onclick = async () => {
  await client.authorize({
    mode: 'popup',
    scopes: ['content:write', 'balance:read'],
    spendingLimit: 1,       // US dollars per month
    maxUploadBytes: 1048576,
    maxRetentionMonths: 3
  });
};

// After authorization, no approval window opens for this upload.
const result = await client.save(editor.value, {
  contentType: 'text/plain',
  maxCostCents: 1
});
```

The OAuth callback page must hand its code and state back to the original window. Create
the same client there and call:

```js
await client.handleCallback({
  postMessageToOpener: Boolean(window.opener),
  closeWindow: Boolean(window.opener)
});
```

The opener performs the popup token exchange with its own PKCE transaction and browser key.
For explicit redirect authorization, the callback instead exchanges the code in that window;
persistent key storage and session storage are required. Do not use `handleCallback()` for
a per-save publish result; those use `handlePublishCallback()`.

### Storage, token lifetimes and recovery

- The SDK stores a non-extractable P-256 private key in IndexedDB and sends an ES256 DPoP proof
  on token exchange, refresh and authenticated API calls. The main API and dedicated funded
  content worker verify the binding. A copied token alone cannot authorize those requests.
- Allowance tokens normally live in `localStorage`. Another script on that origin can read
  them and use the browser key while running. DPoP does not isolate apps on a shared origin.
- If IndexedDB is unavailable, the key and new DPoP tokens stay in memory. Use popup
  authorization; another page navigation cannot recover that memory key. Sign in again next session.
- Access tokens last 15 minutes. Newly issued refresh tokens expire after seven idle days,
  and a refresh family lasts at most 90 days regardless of rotation. The approved grant's
  expiry can end access earlier. Existing unbound tokens retain their existing expiry;
  this release does not automatically bind them to a device.
- Refresh requests require the app's `client_id`. A rotated-token replay revokes its entire
  grant, including replacement refresh tokens. Invalid client or key bindings are refused
  before reuse handling. The SDK deduplicates renewal within a client and uses Web Locks
  plus a storage reread across tabs. Without Web Locks, use one active allowance tab or hosted approval.
- `await client.disconnect()` revokes the grant server-side, including when its refresh
  token was rotated by another tab, then removes the local tokens. `clearTokens()` removes
  only the local copy. The account page can revoke a grant or all app access and shows last
  use, monthly spend/cap, recent uploads, and in-app security notifications. Revoke-all does
  not revoke separately managed API keys.

Raw OAuth clients without DPoP still receive bearer tokens. The bundled native Textpad and
command-line clients use that raw OAuth flow; secure token storage is not sender constraint.
They must implement DPoP separately to obtain its protection. Custom proof requirements and
OAuth request fields are in [the API reference](API.md#app-tokens-oauth).

## Verify content and cap upload charges

`retrieve(cid)` reads and verifies the entire body before returning a `Response`. It verifies
the length prefix and inline bytes for content up to 64 bytes, or SHA-512 for larger content.
It does not stream unverified bytes. `publish()` and `save()` verify their returned CID too.
For your own fetch or cache, check before displaying or persisting the bytes:

```js
import { verifyCID } from 'https://hashbin.org/sdk/hashbin.js';

const response = await fetch(contentUrl);
if (!response.ok) throw new Error(`Download failed (${response.status})`);
const bytes = await response.arrayBuffer();
if (!await verifyCID(cid, bytes)) throw new Error('Content does not match its CID');
```

`maxCostCents` sends `max_cost_cents` on `POST /api/content`. It must be a non-negative safe
integer in cents. A higher charge returns `409 max_cost_exceeded` before debit or storage;
invalid ceilings return 400. The ceiling also applies when an identical upload extends
existing retention. It is separate from the grant's cumulative monthly spending cap.

## Shared origins and pinned SDK releases

Paths are not browser storage boundaries: `https://owner.github.io/a/` and `/b/` share an
origin. Registration and redirect-URI updates require `shared_origin_acknowledged: true`
for known GitHub/GitLab shared hosts or origins already used by another active app. The
400 response identifies the affected origins and other registered apps. Consent lists them.
A zero count is not proof that no other app uses that origin. CORS permits active registered
origins only; there is no special GitHub Pages exception or environment allow-list bypass.

Prefer one origin per allowance app, run untrusted code with the SDK's `createSandbox()`
(an opaque-origin worker; never `allow-same-origin`),
and verify restored state and app-code caches. HashBin's hosted approval does not protect
client drafts, settings or service-worker storage from a compromised sibling app.

The self-contained release `/sdk/v0.3.0/hashbin.js` is immutable (v0.2.0 also remains). To
enforce its integrity:

```html
<script type="module" src="https://hashbin.org/sdk/v0.3.0/hashbin.js"
  integrity="sha384-OrIu52nODd4k+SsDRTZjfEQq7Nu4NO7x1AtXqngPk3r2Pm5eI2Afv7nu33exMJ+a"
  crossorigin="anonymous"></script>
```

v0.3.0 adds `createSandbox()`, the service-worker helper `hashbin-cache.js`, `clientState` on
publish errors, automatic redirect on cross-origin-isolated pages and a file handoff for redirect
saves above 512 KiB. `integrity.json` lists SRI and SHA-256 hashes for both files; offline-first
apps may vendor the exact files and check them against it.

It exposes `window.hashbin`; use it from a subsequent module script after the SDK loads.
A plain JavaScript `import` of a version URL pins the version but does not by itself enforce
SRI. `/sdk/hashbin.js` remains latest. Pinned clients must upgrade deliberately for fixes;
see [SDK release instructions](../scripts/README.md#browser-sdk-releases).

## Migrate existing clients

1. For a save button, replace the OAuth setup with `publish()` and add the publish redirect
   callback. Do not request or store an allowance just to open per-save approval.
2. To retain silent uploads, replace the old token-based `publish()` call with `save()`;
   keep authorization, adopt DPoP through the updated SDK, and set a per-upload price ceiling.
3. Add `client_id` to every raw refresh request and serialize refreshes. Do not retry a
   consumed refresh token after receiving a successful response.
4. Replace local-only disconnects with server revocation and add CID verification to any
   custom downloads or uploads that bypass the SDK helpers.
5. Review co-hosted apps and pin a reviewed SDK release where appropriate. Native and CLI
   clients need their own DPoP implementation; upgrading a web SDK cannot change their code.

For implementation history and remaining real-provider browser acceptance, see
[the browser safety plan](../todo/browser_client_safety.md). Chromium and WebKit local-auth
checks do not establish live Clerk/social sign-in behavior under Safari or Firefox tracking protection.
