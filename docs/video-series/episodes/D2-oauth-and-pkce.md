# D2 · Letting Apps Publish: OAuth and PKCE

| | |
|---|---|
| **Track** | Building on HashBin · deep dive |
| **Length** | ~10.5 min (1,184 spoken words) |
| **Prerequisites** | D1. 01 helps for Beat 5. |
| **Afterwards the viewer can** | Explain why apps shouldn't hold API keys; register an app; walk through the authorization code flow; explain what PKCE defends against and how; say what an access token can and can't do; integrate with the hosted SDK. |
| **Next card** | D3 *Building Textpad* (larger). D4 *Under the Hood*. |

---

## Beat 1: The problem · ~0:00–1:20

**Scene:** `D2_Problem`

**Visual**
- A developer (PURPLE) builds an `APP` window titled "Notes". Many users (BLUE) want a "Save to HashBin" button that
  uses their own balance.
- Bad idea 1: a field in the app labeled "Your HashBin password". It shatters: "HashBin doesn't have passwords."
- Bad idea 2: a field labeled "Paste your API key". The key travels into the app's JavaScript. Then show everything it
  can do as red arrows fanning out: "delete all your files", "spend your whole balance", "act as you, everywhere". Then
  a browser extension icon and a malicious script icon reaching into the page and reading the key.
- Both crossed out. Caption: "We need a key that only opens one door."

**Narration**

> Suppose you're building a notes app, and your users want a button that saves a note to HashBin, paid from their own balance. How does your app get permission to do that?
>
> You can't ask for their HashBin password, because there isn't one. You could ask them to paste in an API key. But an API key is their whole account. It can delete everything they've uploaded and spend their entire balance. Once it's in your app's code, anything else running in that page could read it. And if your app misbehaves, the only way for them to stop it is to find and revoke that key, and hope they haven't pasted it anywhere else.
>
> What you want is a different kind of key: one that only opens one door, that the user can take back, and that never shows your app anything it doesn't need. That's what a protocol called OAuth is for.

---

## Beat 2: Register your app · ~1:20–2:20

**Scene:** `D2_Register` (optional screen capture)

**Visual**
- A mock "/developers" page: "Application name", "Redirect URIs" (one per line).
- Type `Notes` and two URIs:
  - `https://notes.example/callback`
  - `org.example.notes://oauth`
- Validation chips appear beside each kind: "https: ✓", "http://localhost for development: ✓", "your own scheme for phone
  apps: ✓", "no #fragment", "up to 10".
- Submit: a card shows `client_id: app_…` (bright) and `client_secret` (dimmed, labeled "not needed for browser or phone
  apps").

**Narration**

> First, you register your app on the developers page. Anyone can do this, and it takes effect immediately. You give it a name, which users will see, and a list of redirect URIs: the exact addresses HashBin is allowed to send users back to.
>
> Those have to be HTTPS, or localhost while you're developing. Phone apps can use their own URL scheme, named after a domain you control.
>
> You get back a client ID, which identifies your app. You'll also see a client secret, but a browser app or a phone app can't keep a secret, since anyone can read its code. So the flow we're about to see doesn't use one.

---

## Beat 3: The dance · ~2:20–4:20

**Scene:** `D2_Flow`

**Visual**
- A sequence diagram with three lanes: `APP` (PURPLE), "User's browser" (BLUE), `HASHBIN`.
- Step 1: the `APP` sends the browser to `hashbin.org/oauth/authorize` with parameters listed one at a time:
  `client_id`, `redirect_uri`, `scope=content:write balance:read`, `state`, `code_challenge`, `code_challenge_method=S256`.
  Leave `code_challenge` dim with a "?" (explained in Beat 5).
- Step 2: `HASHBIN` checks the user is signed in (sign in if not), then shows a consent screen: "Notes wants to use your
  HashBin account." with a list of scopes in plain English, a line "Monthly spending limit: $2.00 per month", and Approve /
  Deny buttons.
- Step 3: Approve. The browser is redirected to `https://notes.example/callback?code=…&state=…`. The `code` is drawn as a
  small ticket with a "10 min" timer.
- Step 4: the `APP` sends the ticket to `POST /oauth/token`, back channel, and receives two tokens: an "access token" (with
  "1 hour") and a "refresh token" (with "30 days").
- Step 5: `APP` → `POST /api/content` with `Authorization: Bearer <access token>`. A `FILE` lands in `BINS`; the user's
  `BALANCE` drops by 1¢.

**Narration**

> Here's how it works. When the user clicks save for the first time, your app sends their browser to HashBin's authorize page, with a few parameters: your client ID, where to come back to, which permissions you want, a random value called state, and something called a code challenge, which we'll come back to.
>
> HashBin makes sure the user is signed in, and then shows them a consent screen, with your app's name and exactly what it's asking for, in plain words. Your app can also propose a monthly spending limit, and if it does, the screen shows that too.
>
> If they approve, HashBin sends the browser back to your redirect URI with an authorization code. Think of it as a claim ticket. It's only good for ten minutes, and it can't do anything by itself.
>
> Your app takes the ticket to HashBin's token endpoint and exchanges it for two tokens: an access token, which works for one hour, and a refresh token, which lasts thirty days and is used to get new access tokens. Now your app can publish, with the access token in the authorization header.
>
> The state value is your app's way of making sure the user coming back is the one it sent. If it doesn't match what you sent, ignore the response.

---

## Beat 4: The weak spot · ~4:20–5:20

**Scene:** `D2_Interception`

**Visual**
- Replay Step 3 slowly. The redirect URL with `?code=…` travels through the browser. Show places it can leak: a
  browser history list, a server log line, and on a phone, a second `APP` (RED, labeled "malicious app") that has
  registered the same custom URL scheme and grabs the redirect.
- The RED app races to the token endpoint with the stolen ticket.
- Without a client secret, `HASHBIN` can't tell the two apps apart: two identical-looking requests arrive. A "?" over
  the token endpoint.

**Narration**

> There's a weak spot in that dance. The authorization code travels through the browser, in a URL. URLs end up in history, in logs, and on phones, a malicious app can register the same custom URL scheme as yours and catch the redirect itself.
>
> If an attacker gets the code before your app uses it, they could exchange it for tokens. A server-side app would prove its identity at the token endpoint with its client secret. But we just said browser and phone apps can't keep one. So how can HashBin tell that the app redeeming the ticket is the same one that started the flow?

---

## Beat 5: PKCE: publish a fingerprint, reveal the secret later · ~5:20–7:00

**Scene:** `D2_PKCE`

**Visual**
- Back to Step 1. Before redirecting, the `APP` generates a long random string, the **code verifier**, drawn as a key
  that stays inside the app (a lock icon on the app's local storage).
- The key goes through a `HASH MACHINE` labeled "SHA-256". Out comes a fingerprint: the **code challenge**. Only the
  challenge travels in the authorize URL; it now lights up in Step 1's parameter list.
- `HASHBIN` writes the challenge onto the claim ticket (the code) when it's issued.
- At the token endpoint, the real `APP` presents the ticket and the verifier. `HASHBIN` hashes the verifier, compares
  it to the challenge on the ticket: GREEN match, tokens issued.
- The RED app presents the stolen ticket, but has no verifier. It tries forging one: random keys through the hash
  machine, none matching. Its request is refused.
- Split screen callback to 01: on the left, a `256T STRING` next to a `FILE` ("the name commits to the content"); on
  the right, the code challenge next to the verifier ("the challenge commits to the secret"). The same `HASH MACHINE`
  icon in both.
- Label: "PKCE: Proof Key for Code Exchange. HashBin requires it, with S256, for every app."

**Narration**

> The answer is a small addition called PKCE, short for proof key for code exchange.
>
> Before your app redirects the user, it makes up a long random secret, called the code verifier, and keeps it to itself. It runs the verifier through a hash function, SHA-256, to get a fingerprint called the code challenge. Only the challenge goes into the authorize URL.
>
> HashBin remembers that challenge with the authorization code it issues. Then, at the token endpoint, your app has to present both the code and the original verifier. HashBin hashes the verifier and checks that it matches the challenge.
>
> An attacker who intercepted the code never saw the verifier. They saw the challenge, maybe, but a hash only runs one way, so the challenge doesn't help them work out the verifier. Without it, the stolen code is useless.
>
> If this feels familiar, it should. It's the same idea as the 256t string. Publish a fingerprint now, and anyone can check the real thing against it later. In 256t, the fingerprint commits to a file. Here, it commits to a secret that only your app knows.
>
> HashBin requires PKCE, with SHA-256, for every app, with no exceptions.

---

## Beat 6: What the token can do, and can't · ~7:00–8:40

**Scene:** `D2_Scopes`

**Visual**
- Three scope cards:
  - `content:write`: "publish content, billed to the user's balance"
  - `content:read`: "check whether content exists and read its metadata"
  - `balance:read`: "see the user's balance, for pre-flight checks"
- A fourth card, crossed out GREY: "delete · extend retention · manage account · manage developer apps": "never through
  OAuth".
- A user's account settings mock: "Default third-party retention: 1, 3, 6, 12 months" with "3 months" selected. An arrow
  from it to every publish the app makes: the app doesn't choose retention.
- A spending meter for the app: "$1.40 of $2.00 this month". A publish that would exceed it bounces with
  `spending_limit_exceeded`.
- An "Authorized publishing apps" list with a "Revoke" button beside "Notes". Click it: the app's tokens dissolve.

**Narration**

> Now let's look at what that access token actually allows. There are three permissions, called scopes. Content write lets the app publish, billed to the user. Content read lets it check whether content exists and read its metadata. And balance read lets it see the balance, so it can warn the user before an upload fails.
>
> That's all. An app can never delete anything, extend retention, or touch the account through OAuth. Publishing is the only write it can do, and published content can't be changed.
>
> Two more limits are in the user's hands. The app doesn't choose how long content is kept. Every publish uses the user's own default retention, which they set on their account page. And if a spending limit was approved, HashBin enforces it: once the app has spent its monthly limit, further publishes are refused.
>
> Finally, the user can revoke your app at any time from their account settings. And if you delete your app registration, refresh tokens stop working immediately, and any access tokens still out there expire within the hour.

---

## Beat 7: Tokens over time · ~8:40–9:30

**Scene:** `D2_Refresh`

**Visual**
- A `TIMELINE` of 30 days. Access tokens drawn as short 1-hour segments, renewed in a chain.
- Each renewal at the token endpoint swaps the refresh token for a new one; the old one turns GREY with a "revoked" stamp.
- A thief who copied an old refresh token tries it after the real app has renewed: refused, RED.
- At day 30 with no use, the chain ends; next save sends the user through consent again (a short replay of Beat 3,
  sped up).

**Narration**

> Access tokens expire after an hour on purpose, so a leaked one isn't useful for long. When it runs out, your app uses the refresh token to get a new one.
>
> HashBin rotates refresh tokens: each time you use one, you get a new one, and the old one stops working. If someone copied an old refresh token, it's already dead by the time they try it. One consequence for you: always store the new refresh token from each response, or the next renewal will fail and the user will have to approve your app again.

---

## Beat 8: You don't have to write any of this · ~9:30–10:10

**Scene:** `D2_SDK`

**Visual**
- `Code` (html/js), the minimal example from the developers page, condensed:

  ```js
  import { HashBinClient } from "https://hashbin.org/sdk/hashbin.js";

  const hb = new HashBinClient({
    clientId: "YOUR_CLIENT_ID",
    redirectUri: "https://you.github.io/notes/",
    baseUrl: "https://hashbin.org",
  });

  if (new URLSearchParams(location.search).has("code")) await hb.handleCallback();

  if (!hb.getTokens()) await hb.authorize({ scopes: ["content:write"] });
  else console.log(await hb.publish("Hello, HashBin!", { contentType: "text/plain" }));
  ```

- As lines are highlighted, small icons from earlier beats attach to them: `authorize` → the verifier key and challenge;
  `handleCallback` → the ticket exchanged for two tokens; `publish` → the access token header, with refresh happening
  automatically behind it.

**Narration**

> All of that, the verifier, the challenge, the state check, the token exchange, and the refresh rotation, is handled by HashBin's hosted SDK. You give it your client ID and redirect URI. Call authorize to start, handle callback when the user comes back, and then publish. It keeps the tokens, renews them when they expire, and gives you back the 256t string and the URL of what you published.

---

## Beat 9: Recap · ~10:10–10:40

**Scene:** `D2_Recap`

**Visual**
- The Beat 3 sequence diagram, compressed, with the PKCE key and fingerprint glowing on it, and the scope cards beneath.
- `NEXT CARD`: D3 *Building Textpad* (larger), D4 *Under the Hood*.

**Narration**

> So: register, send the user to consent, trade the ticket for tokens, and prove with PKCE that you're the one who asked. The token can publish and read, nothing more, within limits the user controls. Next, we'll build a complete app this way, and see what it means to design around content that can never change.
