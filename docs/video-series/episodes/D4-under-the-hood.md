# D4 · Under the Hood

| | |
|---|---|
| **Track** | Building on HashBin (also for anyone deciding whether to trust it) |
| **Length** | ~5 min (534 spoken words) |
| **Prerequisites** | 00. D1 helps. |
| **Afterwards the viewer can** | Sketch HashBin's architecture; explain why the download path is so simple; say how balances stay consistent; name the nightly jobs; find the source and run it locally. |
| **Next card** | End of the developer track. 01 *A Name Made of Content* and X3 *Anyone Can Serve It* as rewatch suggestions, plus a "github.com/curtcox/hashbin.org" link card. |

---

## Beat 1: Two programs · ~0:00–0:30

**Scene:** `D4_TwoWorkers`

**Visual**
- A world map in faint outline with dots for Cloudflare edge locations. Two programs are drawn as small gears that appear
  at every dot at once: a BLUE gear labeled "hashbin.org worker" and a TEAL gear labeled "256t.us worker".
- Zoom into one location: the BLUE gear has many arms (API, sign-in, payments, OAuth, the website itself). The TEAL gear
  has one arm: "serve a file".

**Narration**

> HashBin is two small programs running on Cloudflare's network, close to wherever the request comes from. One runs hashbin dot org: the website, the API, sign-in, payments, and OAuth. The other runs 256t dot U S, and it does exactly one thing: serve files.
>
> Let's see what's behind each of them, starting with the simple one.

---

## Beat 2: The download path · ~0:30–1:40

**Scene:** `D4_DownloadPath`

**Visual**
- A request for `256t.us/{cid}` enters the TEAL gear. A short checklist runs, each item lighting in turn:
  1. "Is it a valid 256t string?" (else 404)
  2. "Has this address made more than 30 requests this minute?" (else 429)
  3. "Is there a `{cid}.deleted` marker?" (else 404)
  4. "Is there a `{cid}.disputed` marker?" (else 451)
  5. "Has `{cid}.meta` expired?" (else 404)
  6. "64 bytes or less? Decode it from the string." / "Otherwise, stream `{cid}` from storage."
- Beside it, the storage bucket (`BINS`) drawn with the marker files as small tags hanging off each drawer: `.meta`,
  `.disputed`, `.deleted`.
- The response leaves with headers listed: `Content-Security-Policy: default-src 'none'; sandbox`,
  `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *`.

**Narration**

> The file server's whole job fits on one screen. It checks that the string is well formed, and applies the per-address rate limit. Then it looks at a few small marker files stored next to the content: one if the file was deleted, one if it's under dispute, and one recording when it expires.
>
> If the content is sixty-four bytes or less, it decodes it straight from the string. Otherwise, it streams the bytes from storage, which is Cloudflare's object store, R2, where each file is kept under its own 256t string.
>
> Everything leaves with strict headers: no scripts, no guessing the type, and readable from any website. Because the download path only reads storage, it has very little that can go wrong, and it never touches anyone's account.

---

## Beat 3: One small database per thing · ~1:40–2:30

**Scene:** `D4_DurableObjects`

**Visual**
- The BLUE gear connects to a field of small cubes, each a Durable Object, labeled by kind: "ContentMetadata ×
  (one per file)", "UserProfile × (one per user)", "PaymentRecord", "DisputeRecord", "KeyRegistry",
  "ApplicationRegistry", "ExpirationIndex", "DeletionRecord", "BackupIndex", and a few more fading into the background.
- Zoom into one UserProfile cube. Two upload requests arrive at the same moment, each wanting to spend 60¢ from a
  balance of $1.00. They queue at the cube's single door; the first succeeds (balance $0.40), the second is refused
  ("insufficient balance"). Label: "one at a time, per object".

**Narration**

> The main worker keeps its records in Durable Objects. Instead of one big database, each thing gets its own tiny one. Every file has an object holding its metadata. Every user has one holding their balance, keys, and authorizations. Disputes, payments, registered apps, and suppliers each have their own.
>
> The useful property is that each object handles requests one at a time. So if two uploads try to spend the same balance at the same instant, they can't both see the old balance. One goes first, and the second sees what's left. No overspending, and no complicated locking.

---

## Beat 4: The outside services · ~2:30–3:00

**Scene:** `D4_Services`

**Visual**
- Two external boxes connect to the BLUE gear: "Clerk: sign-in" and "Stripe: card payments".
- A deposit animates: the user pays on Stripe's page; Stripe sends a signed message (a webhook, drawn as an envelope
  with a wax seal) to the BLUE gear, which checks the seal and credits the UserProfile balance.

**Narration**

> Two jobs are handed to specialists. Sign-in goes through Clerk, which is why HashBin never holds passwords. Card payments go through Stripe, which is why HashBin never sees card numbers. When a payment completes, Stripe sends HashBin a signed message, and only then is the balance credited.

---

## Beat 5: The night shift · ~3:00–3:40

**Scene:** `D4_Nightly`

**Visual**
- A clock reading 2:00 UTC. A checklist ticks through:
  - "Delete content whose time is up"
  - "Close disputes older than 30 days"
  - "Remove the bytes of deleted content, a day after deletion"
  - "Compute statistics and check for anomalies"
  - "Snapshot every record to a backup bucket; keep the last 30"
- The snapshot step: each Durable Object cube drops a copy into a separate bucket labeled "backups"; a row of 30 nightly
  snapshot folders, the oldest falling off the end.

**Narration**

> Once a day, at two in the morning UTC, a scheduled job does the housekeeping. It deletes content whose retention has run out, closes disputes nobody resolved within thirty days, and removes the stored bytes of deleted files a day after they were deleted. It computes statistics, and raises an alert to the operator if something looks wrong.
>
> And it takes a snapshot of every record, every user, payment, file, and dispute, into a separate backup bucket, keeping the last thirty nights.

---

## Beat 6: In the open · ~3:40–4:30

**Scene:** `D4_Open`

**Visual**
- A repository card: `github.com/curtcox/hashbin.org`, "MIT license".
- Inside it, highlighted folders and files: `src/` ("the hashbin.org worker"), `workers/256t-content/` ("the file
  server"), `frontend/` ("plain HTML, CSS, JavaScript, no build step"), `STATUS.md` ("what's done and what's next").
- A terminal: `npm run dev:local` → "Ready on http://localhost:8787", with a note "no Clerk or Stripe needed".
- A small pipeline: commit → tests → deploy → "verify the deployed version", looping.

**Narration**

> All of this is open source. The repository has both workers, the website, which is plain HTML, CSS, and JavaScript with no build step, and a status file listing what's finished and what's next.
>
> You can run the whole thing on your own machine, with local stand-ins for sign-in and payments, using one command. And every change to the main branch is tested, deployed, and then checked to make sure the version running is the version that was pushed.

---

## Beat 7: Recap · ~4:30–4:50

**Scene:** `D4_Recap`

**Visual**
- The full architecture assembles from the episode's pieces: two gears, R2 with markers, the field of Durable Object cubes,
  Clerk and Stripe, the nightly clock, and the GitHub card, all on one screen.
- `NEXT CARD`: "You've finished the developer track." Rewatch suggestions 01 and X3, plus the GitHub link card.

**Narration**

> Two programs at the edge, a store of files named by their content, one small database per thing, and a night shift that keeps it tidy, all in the open. That's HashBin. Thanks for watching, and we'd love to see what you build.
