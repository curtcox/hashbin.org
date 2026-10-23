# U3 · The Life of a File

| | |
|---|---|
| **Track** | Using HashBin |
| **Length** | ~5.5 min (588 spoken words) |
| **Prerequisites** | 00. U1 and U2 help. |
| **Afterwards the viewer can** | Find a file's expiration date; extend it; explain how a stranger can keep it alive with a donation; know what deleting does and doesn't do; know what readers see at each stage. |
| **Next card** | U4 *Who Can See What* (larger). X1 *Disputes and Public Records*. |

---

## Beat 1: Every file has a clock · ~0:00–0:20

**Scene:** `U3_Clock`

**Visual**
- A `FILE` sits on a `TIMELINE`. A playhead labeled "today" sits at month 0. A RED vertical line at month 12
  is labeled "expires".
- The playhead starts moving right. Above the file, a `STATUS CHIP` reads 200 in GREEN.
- Freeze just before the RED line. Title: "The Life of a File".

**Narration**

> Every file on HashBin has a clock. The day you upload it, you've paid for a certain number of months, and that sets an expiration date. Let's follow one file through its life, and look at the ways that clock can change.

---

## Beat 2: The expiration date · ~0:20–1:00

**Scene:** `U3_ExpirationDate`

**Visual**
- Rewind the playhead to month 0. The upload happens: a date stamp "March 31" drops onto month 0.
- Count forward twelve calendar months; the RED line lands on "March 31, next year".
- Side example: a file uploaded on January 31 for one month. Its line lands on February 28 (or 29), and a small
  note explains "months that are shorter end on their last day".
- Cut to a mock "My Uploads" list: each row shows a file name, size, and "Expires in…".

**Narration**

> Retention is counted in calendar months from the day you upload. Keep a file for a year, and it expires on the same date next year. If that date doesn't exist, say, one month after January thirty-first, it ends on the last day of the shorter month.
>
> You can always see the date. It's on the file's content page, and every file you've uploaded is listed under My Uploads with how long it has left.

---

## Beat 3: Extending · ~1:00–1:50

**Scene:** `U3_Extend` (optional screen capture)

**Visual**
- Open a mock upload detail page. An "Extend Retention" card: a dropdown with 1, 3, 6, 12, 24, 60 months; a
  quote that updates; a "New expiration" date.
- Choose 24 months: the RED line on the `TIMELINE` above slides right by 24 months, starting from its old
  position, not from "today". A brace shows "+24 months from the current expiration".
- A confirm dialog: "Extend by 24 months for $0.01? Payments are not refundable." Click OK; `BALANCE` drops by 1¢.
- Second path, in a smaller inset: the same `FILE` is uploaded again from the upload page with "1 year"
  selected. The RED line moves right by 12 more months.

**Narration**

> To keep a file longer, open it from My Uploads and use Extend Retention. Choose how many months to add, and you'll see the price and the new expiration date before you confirm. The new months are added to the end of the time you already have, so extending early doesn't waste anything.
>
> There's a second way that works just as well. Uploading the identical file again doesn't store a second copy. It adds the months you choose to the existing one.

---

## Beat 4: Anyone can keep it alive · ~1:50–3:00

**Scene:** `U3_Donations`

**Visual**
- A reader (GREEN person) is on the file's content page. A card: "Keep this content available. Anyone can pay to
  extend this content's retention. No account needed."
- The reader types $1.00. A live preview counts: for this 90 MB file, "+31 years 7 months" (379 months).
- Switch the file to a 10 MB one: the preview hits a ceiling and reads "+100 years", with a small cap icon.
- The reader pays by card (a mock Stripe-like checkout panel in the series palette, no logos). The RED line on
  the `TIMELINE` slides far to the right.
- Pull back: the original uploader (BLUE) is shown far away, asleep; the file lives on anyway. Several other
  readers each add a donation and the RED line moves further.

**Narration**

> Here's something unusual. Extending a file isn't limited to the person who uploaded it. Anyone can do it, right from the content page, without an account. It's called a donation.
>
> You choose an amount, at least a dollar, and pay by card. The page shows how much time that buys before you pay. Because the price is size times time, a dollar goes further for smaller files. For the largest file you can upload, a dollar buys more than thirty-one years. For a ten-megabyte file, it would buy far more than a century, so each donation is capped at a hundred years.
>
> So a file that matters to people doesn't depend on the original uploader remembering to pay. If readers care about it, they can keep it alive themselves.

---

## Beat 5: Deleting early · ~3:00–4:00

**Scene:** `U3_Delete`

**Visual**
- The uploader opens the upload detail page and finds a "Delete" card. A confirm dialog.
- On confirm, the `FILE` in `BINS` gets a RED X. The `STATUS CHIP` above the timeline changes 200 → 404.
- A ledger row slides into a "Public records" panel: "AAAAA… · deleted by uploader · Oct 23".
- After a short time skip labeled "within about a day", the drawer in `BINS` empties.
- The uploader tries to upload the same file again: a GREY `STATUS CHIP` "410 Gone" bounces off the drawer.

**Narration**

> If you uploaded something by mistake, you can delete it from its detail page. Only the account that uploaded a file can delete it.
>
> Deleting is final in a few ways. The link stops working. The months you'd paid for aren't refunded. The deletion is listed on the public records page, with the date and the reason, but not with who you are. And that exact content can't be uploaded to HashBin again. Otherwise a file that was taken down for a good reason could simply be put back.
>
> One thing deleting can't do is reach into other people's computers. Anyone who already downloaded the file still has their copy.

**⚠ Before recording:** "The link stops working" holds for anyone without a cached copy; confirm no Cloudflare Cache Rule caches 256t.us (README, Before recording #4).

---

## Beat 6: Expiration day · ~4:00–4:40

**Scene:** `U3_Expiry`

**Visual**
- Resume the playhead from Beat 1. It reaches the RED line. A small clock labeled "nightly" ticks.
- The `FILE` fades out of its drawer. `STATUS CHIP`: 200 → 404. A public records row: "AAAAA… · expired".
- Contrast: a GREEN inline `256T STRING` (a tiny text) sits on its own timeline with no RED line at all, and an
  infinity sign at the right end.

**Narration**

> And if no one extends it, the file reaches its expiration date. There's no grace period. A job runs every night, finds files whose time is up, and deletes them. After that, the link answers "not found", and the public records page notes that it expired.
>
> The exception, as always, is the tiny files: sixty-four bytes or less. They live inside their own links, so there's nothing to delete. They don't have an expiration date at all.

---

## Beat 7: Recap · ~4:40–5:20

**Scene:** `U3_Recap`

**Visual**
- One long `TIMELINE` summarizing the episode: upload (200) → extension (line moves) → donation (line moves
  further) → a short RED segment labeled "451 while a dispute is reviewed" → end at 404 with "expired" or
  "deleted".
- `NEXT CARD`: U4 *Who Can See What* (larger), X1 *Disputes and Public Records*.

**Narration**

> So a file's life is a clock you can wind forward: by extending it, re-uploading it, or by someone else donating. Deleting it or letting it run out ends it, in public, for good.
>
> There's one more thing that can pause a file: if someone reports it, it's blocked while the report is reviewed. That has its own episode. Next, though, the question people ask most: who can actually see what you upload?
