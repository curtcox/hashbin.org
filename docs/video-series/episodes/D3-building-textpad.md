# D3 · Building Textpad

| | |
|---|---|
| **Track** | Building on HashBin |
| **Length** | ~7 min (783 spoken words) |
| **Prerequisites** | D2. 01 helps for Beat 3. |
| **Afterwards the viewer can** | Design an app around content that never changes; keep a 256t string in a URL fragment; validate a string before fetching; turn every download outcome into a clear message; keep a user's work safe across the OAuth redirect. |
| **Next card** | D4 *Under the Hood* (larger). X3 *Anyone Can Serve It*. |

Textpad's source is `frontend/docs/textpad/app.html`, and its walkthrough is at
`hashbin.org/docs/textpad`. Code on screen is excerpted from it; keep excerpts exact.

---

## Beat 1: An editor for things that can't change · ~0:00–0:40

**Scene:** `D3_Hook`

**Visual**
- An `APP` window titled "Textpad": a text area with "Hello from Textpad! Edit me, then click Save." and a Save button.
- The text is typed over; Save is clicked. Under the window, a row of `256T STRING`s appears, one per save, each in its
  own small frame, like film frames: v1, v2, v3. None of them is ever modified; new ones are only added to the right.
- Caption: "Every save is a new name."

**Narration**

> Here's a puzzle for app design. Content on HashBin can never change. Once something is published under a name, that name means exactly those bytes, forever. So how do you build a text editor on top of it?
>
> Textpad is HashBin's example answer. It's a complete editor in a single HTML file of plain JavaScript, with no build step, written to be read. Let's walk through the decisions that make it work.

---

## Beat 2: The URL is the document · ~0:40–1:40

**Scene:** `D3_Fragment`

**Visual**
- A browser address bar: `hashbin.org/docs/textpad/app#256t=AAAAAAAtSGVsbG8g…`
- Split the URL at `#`. The part before it travels to a server icon; the part after it stays in the browser, with a
  label: "the fragment never leaves the browser".
- Click Save: the address bar's fragment changes to a new string, and a "Back" arrow in the browser chrome now points
  to the previous string. Click Back: the editor shows the earlier text.

**Narration**

> The first decision is where to keep the document's name. Textpad puts it in the address bar, after a hash sign: pound 256t equals, then the string. That part of a URL is called the fragment, and browsers never send it to any server. The page can also change it without reloading.
>
> So the rule is simple: the address bar always names exactly what's on screen. Open a link, and you see that text. Save, and the address bar switches to the new text's string.
>
> And because each save is a new entry in the browser's history, the Back button takes you to the previous version. Version history, for free, just from the fact that content never changes.

---

## Beat 3: Check the string before you fetch · ~1:40–2:40

**Scene:** `D3_Validate`

**Visual**
- `Code` excerpt (js), `isValid256t`:

  ```js
  function isValid256t(cid) {
    if (!/^[A-Za-z0-9_-]{8,94}$/.test(cid)) {
      return false;
    }
    const length = contentLength(cid);
    const expectedRest = length <= 64 ? Math.ceil((length * 4) / 3) : 86;
    return cid.length - 8 === expectedRest;
  }
  ```

- A string that was cut off when copied (its tail torn away, the last 20 characters falling off). The YELLOW prefix says
  "65 bytes → expect 86 more characters"; a counter shows "66 present". RED. Message: "…isn't a valid 256t string. Check
  that the link was copied completely."
- A GREEN inline string: the prefix says 45 bytes; the body is decoded right in the browser, no network arrow at all.

**Narration**

> When a link opens, Textpad doesn't immediately ask HashBin for it. It first checks the string itself. Only the base64url alphabet is allowed. And, thanks to the length prefix, the string tells you how long it should be: eighty-six more characters if the content is over sixty-four bytes, or just enough to hold the content if it's smaller.
>
> That one check catches the most common real-world problem, a link that got cut off when someone copied it, and it gives a useful message instead of a confusing "not found".
>
> And if the content is sixty-four bytes or less, Textpad doesn't fetch anything. The text is already in the string, so it decodes it right there.

---

## Beat 4: Every outcome gets its own message · ~2:40–3:50

**Scene:** `D3_Outcomes`

**Visual**
- A fetch arrow from Textpad to `SANDBOX`. Five possible returns fan out, each paired with the message Textpad shows:
  - network failure: "Couldn't reach HashBin to load this text…"
  - 404: "Nothing is stored under this 256t string. It may have expired or been deleted, or it was never saved."
  - 451: "This text is unavailable while a dispute about it is reviewed."
  - 429: "HashBin is limiting how often this text can be downloaded. Try again later."
  - 200, but the bytes aren't text: a byte grid with a NUL highlighted: "This 256t string points to content that isn't
    text…"
- A small note on the editor: before any of this, it's cleared, so stale text is never shown under a new link.

**Narration**

> For longer texts, Textpad fetches the bytes from 256t dot U S, and it treats every outcome as something to explain. No network: say so. Four oh four: nothing is stored under this name, it may have expired or been deleted. Four fifty-one: it's blocked while a dispute is reviewed. Four twenty-nine: try again later.
>
> Even a success needs checking, because HashBin stores bytes, not text. Textpad decodes them strictly as UTF-8, and refuses anything that contains a null character, which real text practically never does.
>
> One more detail: it clears the editor before loading. If a link fails, you see an empty editor and a message, never the previous document sitting under the wrong name.

---

## Beat 5: Don't lose work across the redirect · ~3:50–4:50

**Scene:** `D3_Draft`

**Visual**
- The user types a long paragraph, then clicks Save for the first time. Textpad isn't connected yet.
- Before the browser leaves, the editor's text, the current string, and the last saved text are tucked into a box labeled
  "sessionStorage", tagged with the OAuth `state` value.
- The browser goes to the HashBin consent screen (from D2) and comes back with `?code=…&state=…`.
- Textpad uses the returned `state` to find its box, restores the editor exactly, cleans the URL, exchanges the code, and
  finishes the save.
- Alternate branch: the user clicks Deny. They come back with `?error=access_denied`. The draft is restored anyway; message:
  "You didn't approve Textpad on HashBin, so nothing was saved."

**Narration**

> The OAuth flow from the last episode sends the user away to HashBin and back. That's a full page navigation, and anything only in memory is gone. For an editor, that would be a disaster: you'd click Save and lose what you just wrote.
>
> So before leaving, Textpad saves a draft in the browser's session storage, labeled with the state value from the authorization request. When the user comes back, the same state value finds the draft, and the editor is restored exactly as it was before the save continues.
>
> And if the user declines, their text is still there, with a message saying nothing was saved.

---

## Beat 6: Saving · ~4:50–5:40

**Scene:** `D3_Save`

**Visual**
- `Code` excerpt (js), trimmed:

  ```js
  const response = await api("/api/content", {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: text
  });
  ...
  setUrlHash(`#256t=${result.cid}`);
  ```

- The text flows into `HASHBIN`; the `BALANCE` bar of the user dips by 1¢ (or not at all for a short text: the string turns
  GREEN, "free").
- An insufficient-balance branch: HashBin's message appears with an "Add funds" link.
- Two different users type the same sentence and save. Both get the same string; a single drawer in `BINS` holds it.

**Narration**

> Saving is one request: post the text as the body, with the access token. The upload uses the retention period the user chose on their HashBin account, and it's billed to their balance. Short texts, sixty-four bytes or less, are free.
>
> If the balance is too low, HashBin's response explains how much is needed, and Textpad shows that message with a link to add funds.
>
> On success, Textpad puts the new string in the address bar. And here's a nice property of content addressing: if two people write exactly the same text, they get exactly the same link.

---

## Beat 7: Staying connected, and letting go · ~5:40–6:30

**Scene:** `D3_Connection`

**Visual**
- A small "Connected to HashBin · Balance $4.21 · Disconnect" bar at the top of Textpad.
- Over days, the SDK quietly renews tokens (small chain of 1-hour segments from D2).
- Click Disconnect: a request to `/oauth/revoke`; tokens dissolve.
- Alternate: the user revokes Textpad from their HashBin account page. The next Save shows: "Your HashBin connection has ended.
  Click Save to connect again."
- Two phone frames appear: "Expo" and "Flutter", each with the same Textpad UI, a system browser sheet for sign-in, and a
  lock icon labeled "secure storage".

**Narration**

> Once connected, Textpad shows the user's balance, which is what the balance read scope is for, and the SDK renews access in the background. A Disconnect button revokes the tokens. And if the user revokes Textpad from their HashBin account instead, Textpad notices on the next save and offers to reconnect.
>
> If you're building for phones, the same app exists in Expo and in Flutter. They sign in through the system browser, return through the app's own URL scheme, and keep tokens in the phone's secure storage.

---

## Beat 8: Recap · ~6:30–7:00

**Scene:** `D3_Recap`

**Visual**
- Four lessons stack up as cards: "The link names a version, not a document." "Validate the string before fetching."
  "Explain every status." "Save the user's work before redirecting."
- `NEXT CARD`: D4 *Under the Hood* (larger), X3 *Anyone Can Serve It*.

**Narration**

> Textpad's lessons carry over to any app on HashBin. A link names a version, not a document. Check strings before you fetch them. Turn every status into a sentence a person can act on. And never let a sign-in redirect cost someone their work.
>
> The whole source, with a walkthrough of every part, is on the docs site. Last in this track, we'll look at the machinery behind HashBin itself.
