# D1 · First API Calls

| | |
|---|---|
| **Track** | Building on HashBin |
| **Length** | ~6 min (684 spoken words) |
| **Prerequisites** | 01 (the 256t string). |
| **Afterwards the viewer can** | Pick the right way to authenticate; create an API key; upload with curl and read the response and errors; compute a 256t string locally; download and verify. |
| **Next card** | D2 *Letting Apps Publish* (larger). D4 *Under the Hood*. |

Code on screen follows the README's Manim conventions: `Code` objects, monospace, at most 12 lines,
the line under discussion highlighted.

---

## Beat 1: The smallest program that publishes · ~0:00–0:30

**Scene:** `D1_Hook`

**Visual**
- The mock upload page from U1. It dissolves into the HTTP requests underneath it: arrows labeled `POST /api/content`,
  `GET /api/balance`, `GET https://256t.us/…`.
- The arrows reorganize into a terminal window with a blinking cursor.

**Narration**

> Everything the HashBin website does, it does by calling the same public API you can call. So let's ask: what's the smallest program that can publish a file? By the end of this episode it'll be a single command, plus a few lines of code that check the result.

---

## Beat 2: Two domains · ~0:30–1:00

**Scene:** `D1_TwoDomains`

**Visual**
- `HASHBIN` labeled `https://hashbin.org/api/…` on the left, with a list beneath: "accounts · balance · upload · metadata ·
  extend · delete · OAuth".
- `SANDBOX` labeled `https://256t.us/{cid}` on the right, with: "downloads only · no cookies · any website can fetch
  (CORS: *)".
- A wall between them; arrows from a script go to both.

**Narration**

> There are two hosts to know about. Everything that involves an account, like uploading, checking your balance, or deleting, goes to the API at hashbin dot org.
>
> Downloads come from 256t dot U S, and nothing else does. It's a plain file server: it ignores cookies and doesn't need authentication, and it allows requests from any website, so a web page anywhere can fetch HashBin content directly.

---

## Beat 3: Three ways to say who you are · ~1:00–1:50

**Scene:** `D1_ThreeAuth`

**Visual**
- Three cards, each with an icon and the header it sends:
  1. "Browser session": the website itself; `Authorization: Bearer <session>`; "you, in your browser".
  2. "API key": `Authorization: ApiKey hb_…` or `X-API-Key: hb_…`; "your own scripts and servers"; "full access to your
     account".
  3. "OAuth token": `Authorization: Bearer <access token>`; "apps used by *other* people"; "publish only"; a small
     arrow to D2.
- Highlight card 2.

**Narration**

> There are three ways to identify yourself to the API. The website uses a browser session. For apps that other people sign into, there's OAuth, which is the subject of the next episode.
>
> For your own scripts and servers, use an API key. It acts as your account, with your balance, so it can upload, extend, and delete. Which also means it should live somewhere only you control: an environment variable on your machine or a secret on your server, never in a web page other people can load.

---

## Beat 4: Creating a key · ~1:50–2:30

**Scene:** `D1_CreateKey` (optional screen capture)

**Visual**
- A mock "Create API Key" form: "Key name" and "Expiration date" with a note "Maximum 5 years. Default is 1 year."
- Submit: a key appears once, `hb_` followed by 32 characters (draw it blurred except for `hb_`), with a "Copy" button and
  a warning "This is the only time you'll see this key."
- The key flies into a terminal line: `export HASHBIN_KEY=hb_…`.
- A list "API Keys: 1 of 25" with a "Revoke" button beside the new key.

**Narration**

> You create keys from the API Keys page of your dashboard. Give it a name, so you remember what it's for, and an expiration date: up to five years, one by default. The key is shown once, so copy it into your environment straight away.
>
> You can have up to twenty-five keys, say one per machine or project, and revoke any of them at any time.

---

## Beat 5: Upload with one command · ~2:30–3:50

**Scene:** `D1_Curl`

**Visual**
- `Code` (bash):

  ```bash
  curl -X POST "https://hashbin.org/api/content?retention_months=12" \
    -H "Authorization: ApiKey $HASHBIN_KEY" \
    -H "Content-Type: application/pdf" \
    --data-binary @slides.pdf
  ```

  Highlight each line in turn as the narration mentions it.
- The response unfolds below as JSON:

  ```json
  {
    "cid": "AAAAJdwAk3…",
    "size_bytes": 2481152,
    "expires_at": "2027-10-23T…",
    "cost_cents": 1,
    "new_balance_cents": 999,
    "url": "https://256t.us/AAAAJdwAk3…"
  }
  ```

- Then three alternate responses fan out as small cards: "400 insufficient_balance · required_cents, shortfall_cents",
  "413 · max_upload_bytes", "410 · this content was deleted and can't be uploaded again".

**Narration**

> Here's the upload. It's a POST to slash API slash content. The query string says how many months to keep it. The key goes in the authorization header. The content type is stored with the file, so browsers know what it is later. And the body is just the file's bytes.
>
> The response tells you everything you need: the file's 256t string, its size, when it expires, what it cost in cents, your new balance, and the download URL.
>
> If something's wrong, the errors are specific. Not enough balance, and you'll be told how much is required and how far short you are. Over ninety megabytes, and you'll get a four-thirteen with the current limit. Content that was deleted can't be uploaded again, so that's a four-ten.
>
> If the file is already on HashBin, the same call adds your months to its expiration instead of storing a second copy.

---

## Beat 6: Know the name before you upload · ~3:50–4:40

**Scene:** `D1_ComputeLocally`

**Visual**
- `Code` (python):

  ```python
  import base64, hashlib

  def b64(data: bytes) -> str:
      return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

  def name_256t(data: bytes) -> str:
      prefix = b64(len(data).to_bytes(6, "big"))
      body = data if len(data) <= 64 else hashlib.sha512(data).digest()
      return prefix + b64(body)
  ```

- As each line is highlighted, the matching part of the anatomy diagram from 01 lights up: the prefix line → YELLOW
  block, the `body` line → GREEN/BLUE fork, the `return` → the full string.
- Beneath: `GET /api/content/{cid}/exists` → `{"exists": true}`.

**Narration**

> Because the name is computed from the content, you don't have to upload a file to know its name. These few lines of Python are the whole algorithm from the episode on the 256t string. Eight characters of length. Then the content itself if it's sixty-four bytes or less, or its SHA-512 hash. All of it in base64url, without padding.
>
> That's useful in a few ways. You can ask the API whether a file already exists before sending it. You can build links before an upload finishes. And, most importantly, you can check downloads.

---

## Beat 7: Download and verify · ~4:40–5:40

**Scene:** `D1_Verify`

**Visual**
- `Code` (bash): `curl -sSf -o slides.pdf "https://256t.us/$CID"`
- `Code` (python) under it:

  ```python
  data = open("slides.pdf", "rb").read()
  assert name_256t(data) == CID, "content doesn't match its name"
  ```

- A GREEN check. Then a strip of `STATUS CHIP`s with one-line meanings: 200 "here it is", 404 "never stored, expired, or
  deleted", 429 "too many requests: wait and retry", 451 "blocked while a dispute is reviewed".
- Two URL variants appear: `https://256t.us/$CID.pdf` ("serve as this type") and `…?download=true` ("save as a file").

**Narration**

> Downloading is a plain GET to 256t dot U S. Then compute the name of what you received, and compare. If they match, you have exactly what was published, whichever server it came from.
>
> When a download fails, the status code tells you why. Four oh four means nothing is stored under that name: it was never uploaded, it expired, or it was deleted. Four twenty-nine means slow down and retry. Four fifty-one means it's blocked while a report is reviewed.
>
> And two small conveniences: add a file extension to the URL to choose the content type, or add download equals true to have browsers save it instead of opening it.

---

## Beat 8: The rest of the API, and next · ~5:40–6:10

**Scene:** `D1_Recap`

**Visual**
- A compact endpoint list types out:
  - `GET  /api/content/{cid}`: public metadata
  - `POST /api/content/{cid}/extend`: add months
  - `DELETE /api/content/{cid}`: delete your upload
  - `GET  /api/balance`: your balance
  - `POST /api/payments/calculate`: price a size and duration
  - `GET  /api/config`: limits, like max upload size
- `NEXT CARD`: D2 *Letting Apps Publish* (larger), D4 *Under the Hood*.

**Narration**

> The rest of the API follows the same pattern: metadata, extending, deleting, your balance, and price quotes. The full reference is on the docs site.
>
> An API key is perfect for your own code. But if you're building an app that other people use, you should never ask them for theirs. The next episode shows what to do instead.
