# X3 · Anyone Can Serve It

| | |
|---|---|
| **Track** | Deep dive (users and developers) |
| **Length** | ~4.5 min (498 spoken words) |
| **Prerequisites** | 01 (verification by fingerprint). |
| **Afterwards the viewer can** | Explain why a 256t string doesn't depend on any one host; register a single-file or folder supplier; say what HashBin checks when it scans one; describe how a supplier can stand in when HashBin can't serve a file. |
| **Next card** | D1 *First API Calls* (larger). 01 *A Name Made of Content* (if not seen). |

---

## Beat 1: A name that isn't an address · ~0:00–0:40

**Scene:** `X3_NotAnAddress`

**Visual**
- Recall from 00: two links. The ordinary URL is drawn as an arrow pointing at one specific server. The 256t
  string is drawn as a label floating above several servers at once: `SANDBOX`, a box labeled "256t.org", a box
  labeled "a GitHub folder", and a box labeled "your own server".
- All four boxes hold the same `FILE`. Their `HASH MACHINE`s output the same string, which lines up with the label.

**Narration**

> An ordinary web address tells you where to go. A 256t string doesn't. It tells you what you're looking for. That means it doesn't really belong to HashBin. Any server that has the file can hand it out under the same name, and as we saw in the episode on the string itself, you can check that what you got is right, no matter who gave it to you.
>
> HashBin builds on that with a feature called alternate suppliers.

---

## Beat 2: What a supplier is · ~0:40–1:30

**Scene:** `X3_Supplier`

**Visual**
- A supplier box labeled "256t.org" with the URL pattern typing under it: `https://256t.org/{cid}`. The `{cid}` slot glows
  YELLOW/BLUE, and a full string slides into it.
- Two supplier types appear as cards:
  1. "Single file": one URL serving one file. One `FILE` icon.
  2. "Group": a base URL or a GitHub folder where each file is named by its 256t string. A folder icon opens to show
     a list of filenames that are 256t strings.
- A GitHub folder example in monospace: `github.com/curtcox/256t.org/…/cids/` with filenames beneath it.
- A counter on the uploader's dashboard: "Suppliers: 2 of 20".

**Narration**

> A supplier is any other place on the web that serves files by their 256t string. There are two kinds.
>
> A single-file supplier is just one URL that serves one file. A group supplier holds many files, each named by its own string: a web server with an address pattern like this one, where the string goes at the end, or even a folder in a GitHub repository full of files named that way.
>
> You register suppliers from your dashboard, up to twenty per account.

---

## Beat 3: Trust nothing, check everything · ~1:30–2:30

**Scene:** `X3_Scan`

**Visual**
- HashBin (`HASHBIN`) sends a scanner arrow into a group supplier's folder. For each filename:
  - Step 1: read the YELLOW prefix to get the expected size; fetch the file; compare the byte count.
  - Step 2: run it through the `HASH MACHINE`; compare to the BLUE body.
- Most files flash GREEN and get added to a "verified" list. One file has the right name but the wrong bytes: its size
  matches, but the hash doesn't, so it flashes RED and is left off, with the label "Content hash does not match CID".
  Another is the wrong size: rejected at step 1, before hashing, labeled "Size mismatch".
- A "Rescan" button on the supplier's card. Caption: "verified when you scan, not continuously".

**Narration**

> When you add a supplier, HashBin doesn't take its word for anything. It scans it. For each file the supplier claims to have, HashBin downloads it and runs the same two checks you'd run yourself. Is it the size the string says? And does its fingerprint match?
>
> Only files that pass both checks are listed. A file with the right name and the wrong contents simply isn't counted, and neither is one that's even a byte too long or too short.
>
> Scanning happens when you register a supplier, and again whenever you ask for a rescan. HashBin doesn't keep re-checking in the background, so if a supplier's files change, rescan it.

---

## Beat 4: Suppliers are public · ~2:30–2:50

**Scene:** `X3_Public`

**Visual**
- A content page's data, drawn as a card: CID, size, expiration, and a new section "Also available from", listing two
  supplier URLs.
- A reader (GREEN) follows one of those URLs directly and verifies the file on their own machine (mini version of the
  Beat 3 checks).
- An API path types out: `GET /api/content/{cid}/suppliers`.

**Narration**

> Suppliers are always public. For any file, anyone can ask HashBin which registered suppliers have a verified copy, and go fetch it there directly. And since every copy can be checked against the string, it doesn't matter whether you trust the supplier. You only have to trust the math.

---

## Beat 5: When HashBin can't serve it · ~2:50–4:00

**Scene:** `X3_Fallback`

**Visual**
- A reader requests a file whose HashBin copy has expired (its drawer in `BINS` is empty, timeline past the RED line).
- Instead of a 404, HashBin picks one of the file's verified suppliers at random. Two paths split:
  - "Redirect": the reader is pointed straight at the supplier (an arrow bends from `SANDBOX` to the supplier).
  - "Proxy": HashBin fetches from the supplier and passes the bytes through, checking the file on every hundredth request.
- A small scoreboard on each supplier: "success: 97 of last 100". Suppliers below 95% stay on the proxy path, where HashBin
  can check what they send; above 95%, readers are sent to them directly.
- Labels: "never copied back into HashBin's storage", "no download allowance applies".

**Narration**

> Here's where suppliers really pay off. When HashBin can't serve a file itself, for instance because its time ran out, it can fall back to a supplier instead of answering "not found".
>
> It picks one of the file's verified suppliers at random, and does one of two things. It can send you straight to the supplier. Or it can fetch the file from the supplier and pass it along, checking the contents every hundredth time. Suppliers earn the direct route by being reliable: at least ninety-five of their last hundred requests succeeding.
>
> Content served this way isn't copied back into HashBin's storage, and HashBin's download allowances don't apply to it. The supplier is the one doing the serving.

**⚠ Before recording:** fallback to suppliers runs only in hashbin.org's own download handler, not on 256t.us, which serves every production download (README, Before recording #2). Ship it on 256t.us or replace this beat with "coming soon" wording.

---

## Beat 6: Recap · ~4:00–4:30

**Scene:** `X3_Recap`

**Visual**
- The opening image again: one 256t label floating over many servers. This time `SANDBOX` fades to 30% opacity and the
  label stays bright, still matching the other copies.
- `NEXT CARD`: D1 *First API Calls* (larger), 01 *A Name Made of Content*.

**Narration**

> A 256t string names content, not a place. Suppliers make that practical: other servers can carry the same files, HashBin checks every one before listing it, and anyone can fetch from them and verify for themselves.
>
> If you're a developer, that's the last of the deep dives on how content moves. Next, let's start writing code.
