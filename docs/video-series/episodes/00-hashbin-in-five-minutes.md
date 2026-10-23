# 00 · HashBin in Five Minutes

| | |
|---|---|
| **Track** | Start here (everyone) |
| **Length** | ~5 min (531 spoken words) |
| **Prerequisites** | None |
| **Afterwards the viewer can** | Say what HashBin does, who pays for what, what a 256t link is at a high level, and pick the next episode for their goal. |
| **Next card** | Users → U1 *Your First Upload*. Developers → 01 *A Name Made of Content*. Curious → 01. |

---

## Beat 1: Cold open: two links · ~0:00–0:50

**Scene:** `E00_TwoLinks`

**Visual**
- Black screen. Two URLs type themselves in monospace, one above the other:
  - top: `https://example.com/files/report-final.pdf`
  - bottom: `https://256t.us/AAAAAAAPSGVsbG8sIEhhc2hCaW4h`
- Under the top URL, a small `FILE` appears labeled "report-final.pdf". It wobbles, and its contents
  swap to a different grid of bytes while the URL stays the same. A small RED "?" appears beside it.
- Under the bottom URL, a `FILE` appears. Try the same wobble: the file starts to change, and the URL's
  characters change with it, flashing YELLOW and BLUE. The original file and original URL snap back
  together. A GREEN check appears.

**Narration**

> Here are two links. The first one is the kind you use every day. It names a place, and whoever controls that place can change what's there. Today it's the report you expected. Tomorrow it could be something else, and the link would look exactly the same.
>
> The second link is different. It isn't named after a place. It's named after the content itself. Change even one byte of the file, and the name changes too. [[pause 0.8]] So if this link gives you anything at all, it gives you exactly what it was named after.

---

## Beat 2: What HashBin is · ~0:50–1:40

**Scene:** `E00_WhatItIs`

**Visual**
- Title card fades in: "HashBin" with a small `BINS` icon. Fades to the corner.
- An uploader (BLUE person) holds a `FILE`. An arrow carries it into `HASHBIN`; the file drops into a
  drawer in `BINS`. The drawer gets a label: a truncated `256T STRING`.
- The 256t string lifts out of the label and flies to the uploader, who passes it along a chain of
  three readers (GREEN people).
- Each reader sends the string to `SANDBOX` ("256t.us"), and the file comes back to them.
- Caption under the scene builds word by word: "Publish once. Anyone with the link can fetch it."

**Narration**

> HashBin is a place to publish files under names like that second one. You upload a file, HashBin works out its name, which we call its 256t string, and stores the file under it. Then you share the string however you like: in a message, on a web page, inside an app.
>
> Anyone who has the string can fetch the file. They don't need an account, and they don't need to know who uploaded it. And because the name comes from the content, they can check that what they got is exactly what was published.

---

## Beat 3: Who pays for what · ~1:40–2:30

**Scene:** `E00_WhoPays`

**Visual**
- Split the frame. Left: uploader with a `BALANCE` bar. Right: readers.
- Left side: a `COST AREA` rectangle grows: height labeled "size", width labeled "months". A `DecimalNumber`
  in its center counts up to `$0.04`. Caption: "100 MB for a year".
- Coins drain from the `BALANCE` bar into the rectangle.
- Right side: readers fetch the file three times; each time a small "$0.00" floats up and fades.
- `TIMELINE` slides in under the left side: a tick for each month, a RED expiration line at month 12.
  The file in `BINS` dims and disappears when the playhead crosses the line.

**Narration**

> HashBin's rule is simple: publishing costs money, reading is free.
>
> When you upload, you choose how long the file should be kept, in whole months, and you pay for that time up front: three cents per gigabyte per month. A hundred-megabyte file kept for a full year costs four cents. Files of sixty-four bytes or less are free, for a reason you'll see in the episode on how the links work.
>
> When the time you paid for runs out, the file is deleted, unless someone extends it first. And that someone doesn't have to be you.

---

## Beat 4: Three promises · ~2:30–3:30

**Scene:** `E00_ThreePromises`

**Visual**
- Three columns appear one at a time, each with an icon and a heading.
  1. "Verifiable": a `FILE` passes through a `HASH MACHINE`; the output matches the `256T STRING` character
     by character, each pair flashing GREEN.
  2. "No browsing": the `BINS` wall, with a search box above it. The reader types in the search box and it
     shakes: there is no search. Only a full 256t string opens a drawer.
  3. "In public": a ledger scrolls by with rows "deleted · expired", "deleted · by uploader",
     "dispute · open". No names in any row; a small "uploader: hidden" tag on each.

**Narration**

> HashBin is built around three promises.
>
> First, what you get is verifiable. The name is computed from the content, so anyone can recompute it and compare.
>
> Second, there's no browsing. HashBin has no search box and no list of files. The only way to reach a file is to already have its string. Uploaders aren't shown to readers either.
>
> And third, what HashBin itself does, it does in public. Every deletion is recorded on a public page, with the reason. When someone reports a file, the report and its evidence are public too. The code that runs the service is open source.

---

## Beat 5: Two kinds of viewers · ~3:30–4:10

**Scene:** `E00_TwoDoors`

**Visual**
- Two doors open side by side.
- Left door, labeled "Publishing files": inside, a mock upload page with a drop zone, a retention selector,
  and a total cost. Small labels for U1–U4 float out of it.
- Right door, labeled "Building apps": inside, a terminal with a `curl` line, and a phone `APP` frame labeled
  "Textpad" with a Save button. Labels for D1–D4 float out.
- Between the doors, a third, narrower door labeled "Details" with X1–X3.

**Narration**

> You can use HashBin in two ways. Most people will use the website: sign in, add funds, drop in some files, and copy the links.
>
> Developers can do the same things from code. You can upload with an API key from a script. Or you can build an app that publishes on behalf of its users, paid from the user's own HashBin balance, without your app ever holding their password or a key. That's a standard sign-in flow called OAuth, and it has its own episode.

---

## Beat 6: Where to go next · ~4:10–4:50

**Scene:** `E00_NextCard`

**Visual**
- `NEXT CARD` with three thumbnails: U1 *Your First Upload* (labeled "Publishing files"), 01 *A Name Made of
  Content* (labeled "How the links work", larger, centered), D1 *First API Calls* (labeled "Building apps").
- The 256t string from Beat 1 types itself under the cards and blinks.

**Narration**

> This series is split so you can follow what you care about. If you want to publish files, go to Your First Upload. If you're a developer, or just curious, watch A Name Made of Content next. It takes that strange string apart, one character at a time, and shows why a name made of content can't lie.
