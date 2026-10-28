# Browser client safety: keeping HashBin credentials and content safe in web apps

## Status

**Phase:** Proposed 2026-10-27. Nothing here is implemented. Row B13 in `STATUS.md`.

This plan came from reviewing apptron's security model
([apptron `docs/security.md`](https://github.com/curtcox/apptron/blob/main/docs/security.md))
against Pages Online. Pages Online keeps user code in an opaque-origin sandbox, so apptron's
code-execution escape does not apply there. But both apps, and every other HashBin client on
`curtcox.github.io`, keep HashBin tokens where any script on that origin can read them.
Pages Online fixed its own offline-cache poisoning and CID verification in pages `a98d857`;
everything else is open.

The plan has two audiences:

1. **HashBin**, which can remove most of the risk once, for every client.
2. **Client developers**, starting with the curtcox apps. Section D is a draft of
   customer-facing guidance and is written so it can move into `frontend/docs/` largely as is.

Labels used throughout:

- **[HashBin, once]** — implemented once in the server or hosted SDK; every client benefits,
  usually with no client change or just an SDK upgrade.
- **[Owner, once]** — one hosting decision per developer that covers all of that developer's apps.
- **[Per client]** — each app must do it. Prefer moving these into the SDK where possible.

Measures implemented once are preferred over measures every client must repeat.

## The problem

### Shared origins

Browsers isolate storage by **origin** (scheme + host + port), not by path. `localStorage`,
`sessionStorage`, IndexedDB, Cache Storage, cookies without a path and service-worker
registrations are all keyed by origin. On GitHub Pages, every project site of one user or
org is a path under one origin:

| App | URL |
|---|---|
| Pages Online | `https://curtcox.github.io/pages/` |
| Apptron | `https://curtcox.github.io/apptron/` |
| ManimOnline | `https://curtcox.github.io/ManimOnline/` |
| sheets | `https://curtcox.github.io/sheets/` |
| PythonOnline | `https://curtcox.github.io/PythonOnline/` |
| GnuplotOnline | `https://curtcox.github.io/GnuplotOnline/` |

Any script that runs in any of these apps can read and write the others' stored data. That
includes an XSS bug, a compromised dependency, or untrusted user code that escapes its
sandbox, as apptron's DOM-bridge escape did. The `Origin` header has no path either, so
HashBin's CORS check and app registry cannot tell these apps apart.
`src/auth/oauth-cors.js` even hard-codes `https://curtcox.github.io` as always allowed.

The same problem affects any path-based multi-tenant host: `*.github.io`, `*.gitlab.io`,
university `~user` pages, and others. Third-party developers will hit it without knowing.

### What HashBin clients hold today

The hosted SDK (`frontend/sdk/hashbin.js`) stores the access and refresh tokens in
`localStorage` under `hashbin:tokens:<clientId>`. Every app on the origin can read them.

Already in place, and limiting the damage:

- PKCE, single-use codes, and no client secrets.
- A **required monthly spend limit** on grants with spending scopes (`content:write` and others).
- Optional grant expiry, user-narrowed scopes, and revocation from the account page.
- Refresh-token rotation; the old token is revoked on use.
- Access tokens last 1 hour and refresh tokens 30 days.

Gaps found in this review:

| # | Gap | Where |
|---|---|---|
| G1 | Tokens are JavaScript-readable on a shared origin; theft gives durable, offline access for up to 30 days, within the grant's spend cap | SDK storage |
| G2 | No refresh-token **reuse detection**: replaying a rotated token is refused but does not revoke the grant. A thief who refreshes first keeps access, and the real app is silently signed out | `rotateOAuthRefreshToken` in `user-profile.js` |
| G3 | The refresh grant does not check `client_id` against the token's app | `handleOAuthToken` refresh branch |
| G4 | Prices are advisory: the client shows a quote, but the upload charges whatever the server computes, with no pinned quote or maximum | `/api/content` |
| G5 | `retrieve()` in the SDK does not verify bytes against the CID. Pages and apptron each wrote their own check; other clients have none. This matters more now that alternate suppliers exist | SDK `retrieve()` |
| G6 | Consent and price prompts are drawn by each client, so a compromised co-hosted app can draw a convincing fake one | every client |
| G7 | Registration and consent do not warn when an app shares its origin with other apps | registry and consent page |
| G8 | Clients load `https://hashbin.org/sdk/hashbin.js` live, with no versioned or integrity-pinned URL | SDK delivery |

### Threats

| ID | Threat | Example |
|---|---|---|
| T1 | Another app on the same origin is compromised | apptron snapshot escape reads `hashbin:tokens:*` |
| T2 | The client itself has an XSS or compromised dependency | an injected script in Pages Online |
| T3 | The client runs untrusted content that escapes its sandbox | apptron VM, a future preview bug |
| T4 | The content server, CDN or an alternate supplier returns different bytes | substituted document behind a trusted CID link |
| T5 | Fake consent or price UI tricks the user into approving | an app draws "Sign in to HashBin" |
| T6 | A HashBin SDK compromise affects every client at once | modified `/sdk/hashbin.js` |

## A. HashBin-side measures (implemented once)

### A1. Hosted approval page ("HashBin Publish") — the default save path **[HashBin, once]**

A top-level page on `hashbin.org`, for example `/publish`, receives a document from the
client and shows:

- the app's name and registered origin, with the shared-origin warning from A5;
- the size, SHA-512/CID and a safe preview of the bytes;
- the retention period, the exact price and the user's balance.

The user signs in there if needed and approves with a click. HashBin uploads using its own
first-party session and hands the CID back to the client. **The client never holds a
credential.** The SDK exposes it as `publish(bytes, { mode: 'popup' | 'redirect' })`:

- **Popup mode:** the document and result travel over `postMessage`. The page checks
  `event.source === window.opener` and that `event.origin` matches the app's registered
  origin. This mode handles documents up to the 5 MiB limit.
- **Redirect mode:** the document travels in the URL fragment, which is never sent to a
  server. The CID returns to a registered redirect URI. The size is limited by fragment
  length, so above about 512 KiB (apptron's measured threshold) the SDK uses popup mode or
  an explicit file handoff.

The page must have:

- `frame-ancestors 'none'` and `X-Frame-Options: DENY`, so it cannot be framed or clickjacked;
- approvals bound to the exact bytes, used once, and expiring after a few minutes;
- price and charge computed in the same server step, so the price shown is the price charged
  (this closes G4 for this path);
- a returned CID that the SDK verifies against the bytes it sent (A3).

**Pros**

- Removes G1 for every client using it: there is nothing in client storage to steal, so
  T1, T2 and T3 cannot take a token.
- Consent and price are drawn by HashBin on its own URL, closing G6 and T5.
- Built once. It replaces apptron's own prepared vault (`auth.html`, which needs its own
  origin and OAuth registration) and the OAuth code in every publish-only client.
- Third-party developers are safe by default without understanding origins.
- Native apps can use the same page through the system browser
  (`ASWebAuthenticationSession`, Custom Tabs).

**Cons**

- One extra page and click per save.
- Popups must open from a user gesture and can be blocked, so the SDK needs a redirect
  fallback. On mobile, popups open as tabs.
- Redirect mode loses page state unless the SDK preserves it. Pages Online already does this
  in `sessionStorage` for sign-in; the SDK should do it for everyone.
- A client served with `Cross-Origin-Opener-Policy: same-origin` loses its `window.opener`
  link. It must use redirect mode or `same-origin-allow-popups`.
- No background saves or autosave; those need A2.
- A compromised co-hosted app can still *open* the page with its own content. The user sees
  that content and the price on hashbin.org and must approve, so the risk is bounded by the
  user's attention.
- It depends on the HashBin session cookie working in a top-level page opened from another
  site. That should be fine, since the page is first-party, but it must be tested in Safari
  with Intelligent Tracking Prevention.

### A2. Allowance mode for silent saves (opt-in) **[HashBin, once]**

On the A1 page, the user can choose "Let *App* save without asking", with HashBin-chosen
defaults they can tighten:

- a monthly spend cap, small by default;
- a maximum file size;
- an expiry, for example 30 days.

This issues an OAuth grant with those caveats, which already exist in the scoped-keys work.
The grant is set up on HashBin's own page, so the app cannot spoof that consent. The tokens
still live in the client, so allowance mode needs the next two layers.

**A2a. Sender-constrained tokens (DPoP, RFC 9449)** **[HashBin, once: server + SDK]**

The SDK creates a **non-extractable** P-256 key with WebCrypto and keeps the `CryptoKey` in
IndexedDB. The token endpoint binds the access and refresh tokens to the key's thumbprint
(`cnf.jkt`). Every API call and refresh carries a DPoP proof JWT, which the server checks:
method, URL, `iat` window, `jti` replay cache and a server nonce.

**Pros**

- A copied token is useless on another device, so it can no longer be used offline from
  elsewhere for up to 30 days. Theft of that kind was the biggest harm.
- Transparent to clients that use the SDK.
- Also helps native and Expo/Flutter clients, whose key stores are stronger still.

**Cons**

- It does not stop code running *in the user's browser on the same origin* while the app
  is open: that code can open IndexedDB and sign proofs. It shrinks theft to "while the
  attacker's code is running", within the cap.
- Real server work: proof verification, a replay cache in a Durable Object with short TTLs,
  nonce issuing, and clock-skew handling.
- IndexedDB may be missing or wiped in private modes. The SDK then falls back to a
  memory-only key and the user signs in again each session.
- Clients that skip the SDK must implement DPoP themselves.
- Existing grants need a migration rule; for example, unbound grants keep working until
  they expire.

**A2b. Hosted silent-save iframe (considered, not recommended)**

A hidden `hashbin.org` iframe would hold the allowance credential in its own storage and
upload on request. Browsers partition third-party iframe storage by top-level site. That
keeps the token away from client JavaScript, but:

- Safari and Firefox may block or clear that storage, and the Storage Access API adds prompts.
- The iframe cannot tell co-hosted apps apart, because every sibling has the same
  `event.origin`. Any of them could spend the allowance.
- Its outcome is similar to DPoP but less reliable across browsers.

### A3. CID verification built into the SDK **[HashBin, once]**

`retrieve()` verifies bytes against the CID before returning them: inline content for 64
bytes or less, SHA-512 above. `publish()`/`save()` check that the returned CID matches the
submitted bytes. The SDK exports `verifyCID(cid, bytes)` for clients that fetch content
themselves.

- **Pros:** trivial to build; closes G5 and T4 for every client; replaces the copies in Pages
  Online (`src/hashbin.js`) and apptron (`src/content-id.js`); protects against
  alternate-supplier and CDN substitution.
- **Cons:** the whole body must be read before use, so there is no streaming; a streaming
  verifier can come later. Hashing 5 MiB with SHA-512 is negligible. Content that is
  intentionally transformed in transit can't exist in a content-addressed system anyway.

### A4. Token endpoint hardening **[HashBin, once: server, plus a small SDK change]**

1. **Reuse detection (G2).** When a rotated refresh token is presented again, revoke the
   whole grant, record a security event and notify the user (A7). This follows the OAuth 2.0
   Security Best Current Practice (RFC 9700). After this, a thief keeps access only until the
   real app's next refresh, or the real app forces the thief out.
2. **Cross-tab refresh lock in the SDK.** Two tabs of the same app refreshing at once would
   trip reuse detection. The SDK wraps refresh in
   `navigator.locks.request('hashbin:refresh:<clientId>')` and rereads storage after taking
   the lock.
3. **Require and match `client_id` on refresh (G3).**
4. **Tighter defaults.** Access tokens drop from 1 hour to 10–15 minutes. Add a refresh
   idle timeout, for example 7 days unused, and an absolute maximum, for example 90 days,
   unless the user chooses otherwise on the consent page. The SDK requests a small default
   `spending_limit` when the app does not pass one.

**Pros:** all server-side or inside the SDK; no client changes; cheap.

**Cons:**

- Reuse detection revokes the grant when a legitimate client loses a refresh response
  mid-network. The user signs in again, which today's design already accepts.
- Shorter lifetimes mean more refresh traffic and more sign-ins.
- Reuse detection is only a race against the thief. A2a is what stops stolen tokens being
  used elsewhere.

### A5. Shared-origin awareness at registration and consent **[HashBin, once]**

- **At registration:** compute each redirect URI's web origin. Show a warning, require an
  acknowledgement, and link the guide in section D if either is true:
  - another registered app already uses that origin, or
  - the origin is a known path-based multi-tenant host (`*.github.io` and `*.gitlab.io` user
    and org sites, and similar).
- **On the consent page:** "This app runs on `curtcox.github.io`, which also hosts N other
  HashBin apps: … Any of them could use what you approve here." Suggest a lower cap and a
  shorter expiry, or offer A1 per-save approval instead of an allowance.
- **Remove the hard-coded `ALWAYS_ALLOWED_ORIGINS` entry** and derive allowed origins from
  registrations only.

**Pros:** informs both users and developers, and is cheap.

**Cons:** it fixes nothing by itself; the host list needs maintenance; warnings can be
ignored.

### A6. Pinned quotes and maximum price on upload (G4) **[HashBin, once]**

`/api/content` accepts `max_cost_cents`, or a signed `quote_id` with a short expiry, and
rejects the upload if the charge would be higher.

- **Pros:** makes the quote a promise for every token-holding client, including allowance
  mode. Small change.
- **Cons:** API versioning and documentation; clients must handle an expired quote by asking
  again. A1 does not need it, because it charges in the same step it quotes.

### A7. Visibility and recovery **[HashBin, once]**

- **Per-grant activity on the account page:** last used, spend this month against the cap,
  and uploads by app.
- **Notifications:** first use of a new grant, a revocation caused by reuse detection, and
  reaching 80% of the cap.
- **A "Revoke all app access" button.**

**Pros:** detection and recovery for every client. **Cons:** notification infrastructure,
and a risk of noise.

### A8. Versioned, integrity-pinned SDK (G8, T6) **[HashBin, once]**

Publish immutable versioned URLs, for example `/sdk/v2.3.0/hashbin.js`, with SRI hashes in
the docs. Keep `/sdk/hashbin.js` as "latest" for clients that want automatic fixes.

- **Pros:** a client can pin, so a later SDK compromise does not reach it.
- **Cons:** pinned clients must upgrade to get fixes such as A2a and A4.2. Recommend pinning
  for apps that handle money and "latest" for experiments, and document the trade-off.

### A9. Publish the client guidance **[HashBin, once]**

Move section D into `frontend/docs/`. Link it from app registration (A5), the consent page
warning and the SDK docs.

## B. Hosting: giving each app its own origin **[Owner, once]**

This is the only measure that also protects *non-HashBin* data on a shared origin: saved
drafts, service-worker caches, IndexedDB VM state and settings. It does nothing against T2,
a bug in the app itself.

On GitHub Pages, a custom domain on the user site (`curtcox.github.io`) still puts every
project at `example.com/<repo>/`, which is one origin. Isolation needs a **custom domain per
project repo**, each with its own subdomain.

### B1. Own domain, one subdomain per app

For example `pages.example.com` and `apptron.example.com`, each repo with its own `CNAME`.

**Pros**

- A real browser boundary for every kind of stored data in every app at once.
- One registration covers all the owner's apps, and GitHub provides HTTPS for free.
- Stable, readable URLs.

**Cons**

- About $10–15 a year plus DNS records. The domain becomes a single point of failure: if it
  lapses it can be hijacked, so enable auto-renew and a registrar lock.
- Each app needs new HashBin redirect URIs, either added to the existing client or as a new
  client.
- Sibling subdomains are *same-site*. Never set `Domain=example.com` cookies, and remember
  `SameSite` does not separate them. These apps set no cookies today.
- **Migration.** After a CNAME is set, GitHub redirects `curtcox.github.io/<repo>/` at the
  server, so old-origin JavaScript never runs again and saved drafts and settings stay
  stranded there. Release a migration build *before* switching that offers to move the work
  (Pages Online can carry a project in a share link), clears old tokens and revokes them
  server-side.
- Existing share links keep working through GitHub's redirect, but links containing data
  must fit the new URL.

### B2. A separate GitHub organisation per app

For example `pagesonline.github.io`.

**Pros:** free, with no DNS and the same isolation as B1.

**Cons**

- One org per app, each with its own members, secrets and settings.
- GitHub redirects a transferred *repo* but **not** its old Pages URL, so old links and
  stored data are lost unless the old site is kept as a redirect or migration page.
- The names may be taken.
- Variant: Cloudflare Pages or Netlify give each project its own `*.pages.dev` or
  `*.netlify.app` origin for free, without orgs. That means leaving GitHub Pages deployment.

### B3. Stay on the shared origin

**Pros:** no work; existing links, drafts and installs keep working.

**Cons**

- Every app on the origin is inside every other app's trust boundary. The weakest app sets
  the level for all: apptron runs untrusted VMs beside apps that hold HashBin tokens.
- HashBin risk falls only as far as A1–A4 take it.
- Non-HashBin data stays exposed. Each app must defend its own caches and drafts, as Pages
  Online's verified service-worker cache now does.

## C. Per-client measures **[Per client]**

Use these only where an A-measure cannot cover them, and move them into the SDK where
possible.

| # | Measure | Notes |
|---|---|---|
| C1 | Switch saves to SDK `publish()` (A1) and drop direct OAuth in publish-only apps | Order: Pages Online (simplest), then sheets, ManimOnline, PythonOnline and GnuplotOnline, then retire apptron's `auth.html` vault in favour of A1 |
| C2 | If an app keeps an allowance: request a small cap and expiry; use the SDK's DPoP; make Disconnect call `/oauth/revoke`, not just clear storage | Clearing storage alone leaves stolen copies valid |
| C3 | Keep untrusted content away from credentials: an opaque `sandbox` iframe without `allow-same-origin`, or a separate origin for heavy runtimes | Pages Online and apptron patterns |
| C4 | On a shared origin, verify cached app code: the service worker checks the manifest's hashes before storing or serving | Done in Pages Online `a98d857`; could become a small shared snippet |
| C5 | Treat restored state as untrusted, and confirm before a share link replaces unsaved work | Still open in Pages Online (`src/app.js` restores `?doc=`/`#` and persists without asking) |
| C6 | Add a Content-Security-Policy (`script-src` limited to self and the SDK host; `frame-ancestors`) | Helps only T2 |
| C7 | Never ask for HashBin credentials or show HashBin prices inside a user-content area | Unnecessary once A1 draws them |

## D. Draft guidance for client developers (for `frontend/docs/`)

> **Choosing how your web app saves to HashBin**
>
> 1. **Do you save only when the user clicks Save?** Use `HashBin.publish()`. The user
>    approves each save on hashbin.org and your app never holds a credential. This is the
>    safest choice and needs the least code.
> 2. **Do you need autosave or background saves?** Ask for an *allowance* through the same
>    page. Keep the cap and expiry small, and use the hosted SDK so tokens are bound to the
>    device (DPoP).
> 3. **Is your app hosted on a shared origin?** That includes `username.github.io/app/` or
>    any host where other people's or your other apps share the same scheme, host and port.
>    Every app there can read your app's storage. Prefer `publish()`. If you need an
>    allowance, give the app its own origin: a custom subdomain per project, or a dedicated
>    org or host.
> 4. **Does your app run code from users or the internet?** Run it in a sandboxed iframe
>    without `allow-same-origin`, or on another origin. Never run it where tokens live.
> 5. **Reading content?** Use `HashBin.retrieve()`, which verifies the bytes against the CID.
>    If you fetch content yourself, call `verifyCID()`.
> 6. **Pin the SDK** (versioned URL plus SRI) if your app moves money; use the latest URL if
>    you prefer automatic fixes.

Protection by measure:

| Measure | T1 co-hosted app | T2 own XSS | T3 untrusted content | T4 substituted bytes | T5 fake prompts | Friction | Effort |
|---|---|---|---|---|---|---|---|
| A1 hosted approval | ✅ no token | ✅ no token | ✅ no token | ✅ (with A3) | ✅ | a click per save | medium |
| A2a DPoP allowance | ◐ only while running | ◐ | ◐ | – | – | none | high |
| A3 SDK CID check | – | – | – | ✅ | – | none | low |
| A4 reuse detection etc. | ◐ shorter window | ◐ | ◐ | – | – | rare re-sign-in | low |
| A5 shared-origin warning | ◐ informs | – | – | – | – | none | low |
| A6 pinned price | ◐ caps a charge | ◐ | ◐ | – | – | none | low |
| B1/B2 own origin | ✅ | – | ◐ (sibling escapes only) | – | – | migration | owner |
| C3 sandbox | – | – | ✅ | – | – | none | per app |

✅ blocks it · ◐ reduces it · – no effect

## Recommended order

1. **Quick server and SDK wins:** A3, A4 (reuse detection, refresh lock, `client_id`,
   default cap), A6, and the A5 consent warning with the hard-coded origin removed.
   No client changes.
2. **Hosted approval:** A1 and SDK `publish()`. Migrate Pages Online first, then the other
   curtcox apps, then retire apptron's vault (C1).
3. **Allowance mode:** A2 with A2a DPoP, and A7 visibility.
4. **Publish:** A8 versioned SDK and A9 guidance.
5. **Owner hosting decision (B)** for the curtcox apps. This can happen in parallel; it is
   independent of HashBin.

## Open questions

- Does the Clerk session cookie reach a hashbin.org page opened as a popup or redirect from
  `*.github.io` in Safari (ITP), Firefox (Total Cookie Protection) and Chrome? It should,
  since the page is first-party, but test before committing to A1's UX.
- How long can the URL fragment be in each browser for redirect handoffs, and is 512 KiB
  the right switch to popup or file mode?
- What does the DPoP `jti` replay cache cost in Durable Objects at expected request rates?
  Is a server nonce plus a short `iat` window enough on its own?
- What happens to existing unbound grants once DPoP ships: keep them until they expire, or
  force sign-in again?
- Which hosts belong on the A5 shared-host list, and should registration block or only warn?
- Should allowance mode be available only on A1, so caps and expiry are always chosen on
  hashbin.org? This plan assumes yes.
- For B1: which domain? For B2: which org names are free?
