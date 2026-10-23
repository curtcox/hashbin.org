# U2 · What It Costs, and Why

| | |
|---|---|
| **Track** | Using HashBin · deep dive |
| **Length** | ~8 min (877 spoken words) |
| **Prerequisites** | 00. U1 helps. |
| **Afterwards the viewer can** | Estimate the cost of any upload in their head; explain the one-cent minimum and the free tier; know when bundling files saves money; choose a sensible deposit size. |
| **Next card** | U3 *The Life of a File* (larger). X2 *Paying for Popularity*. |

All prices below come from `src/utils/pricing.js`. "Gigabyte" means 2³⁰ bytes, which is what the
code uses; the narration doesn't dwell on it.

---

## Beat 1: Two questions · ~0:00–0:40

**Scene:** `U2_TwoQuestions`

**Visual**
- A `FILE` in the center. Two questions appear on either side: "How big?" (with a vertical double arrow) and
  "How long?" (with a horizontal double arrow).
- A third question, "How many times is it downloaded?", appears below, then gets a strike-through and the label
  "free".

**Narration**

> How much should it cost to keep a file online? There are really only two questions: how big is it, and how long do you want it kept?
>
> There's a third question you might expect, which is how many people download it. On HashBin, that one doesn't affect the price. Reading is free. So everything comes down to size and time, and there's a nice way to picture that.

---

## Beat 2: Price is an area · ~0:40–1:50

**Scene:** `U2_CostArea`

**Visual**
- Axes: vertical "size (GB)" from 0 to 1, horizontal "time (months)" from 0 to 12.
- A unit square, 1 GB × 1 month, fills GOLD. Label in the center: "3¢". Caption: "one gigabyte-month".
- The square tiles across to 12 months: twelve GOLD squares, "36¢".
- Collapse the height to 0.1 GB (a thin strip, labeled "100 MB"). The area shrinks; `DecimalNumber` shows
  `$0.0352` and then animates up to `$0.04` with the label "rounded up to the next cent".
- `MathTex` builds under the axes:
  `\text{cost} = \text{size (GB)} \times \text{months} \times \$0.03`, then the rounding: `\lceil \cdot \rceil` to
  the cent.
- Grab the top-right corner of the strip and drag it around: both the area and the `DecimalNumber` update live.

**Narration**

> Draw size going up and time going across. A file kept for some number of months is a rectangle, and its area is the amount of storage you're buying.
>
> The unit is one gigabyte kept for one month, and on HashBin that square costs three cents. A gigabyte for a year is twelve squares: thirty-six cents.
>
> Most files are much thinner than a gigabyte. A hundred-megabyte file for a year is a thin strip with about a tenth of the area, which works out to three and a half cents. HashBin rounds up to the next whole cent, so that's four cents.
>
> That's the whole formula. Size, times months, times three cents, rounded up to the cent. Retention is bought in whole months, so the rectangle always ends on a month boundary.

---

## Beat 3: The one-cent floor · ~1:50–2:50

**Scene:** `U2_OneCent`

**Visual**
- A new graph: horizontal "file size (MB)" from 0 to 90, vertical "cost". Plot cost for one year as a staircase:
  flat at 1¢ from just above 64 bytes until 28 MB, then stepping up to 2¢, 3¢, reaching 4¢ at 90 MB.
- Mark the first step's edge: "≈ 28 MB".
- Switch the duration to 1 month with a smooth transform: the whole staircase flattens to a single line at 1¢
  across the entire range. Caption: "every file you can upload: 1¢ for a month".
- Switch to 10 years: the staircase rises to 32¢ at 90 MB.
- A tiny strip at the far left, 0 to 64 bytes, is GREEN and sits at 0¢, labeled "free".

**Narration**

> Rounding up has a consequence worth seeing. Here's the price of keeping a file for one year, by size. For anything from a few bytes up to about twenty-eight megabytes, the true cost is less than a cent, so you pay one cent. Then it steps up, to four cents for the largest file you can upload, ninety megabytes.
>
> For a single month, it's even simpler. Every file you can upload costs exactly one cent.
>
> And at the far left there's a little green sliver: files of sixty-four bytes or less. Those cost nothing, because, as we saw in the episode on the 256t string, the content lives inside the link itself. There's nothing to store.

---

## Beat 4: Long horizons · ~2:50–3:40

**Scene:** `U2_LongHorizons`

**Visual**
- A table builds row by row, each price counting up with `DecimalNumber`:

  | File | Kept for | Cost |
  |------|----------|------|
  | 2 MB document | 10 years | $0.01 |
  | 25 MB slide deck | 10 years | $0.09 |
  | 90 MB video | 10 years | $0.32 |
  | 90 MB video | 100 years | $3.17 |

- On the last row, the `COST AREA` rectangle stretches across a `TIMELINE` labeled in decades until it runs
  off screen; the camera pulls back to fit a century.

**Narration**

> Because the price grows in a straight line with time, long horizons are surprisingly affordable. A two-megabyte document for ten years: one cent. A twenty-five-megabyte slide deck for a decade: nine cents. The largest file you can upload, kept for a full century, costs about three dollars and seventeen cents.
>
> The upload page lets you choose up to ten years at a time, and you can always extend later. Extending works the same way: you're just adding more width to the rectangle.

---

## Beat 5: Doing it in your head · ~3:40–5:00

**Scene:** `U2_MentalMath`

**Visual**
- The unit square from Beat 2 (1 GB × 1 month, 3¢) splits into three equal vertical slices; one slice glows: "1¢".
- Relabel the slice in megabytes: its height is about 341 MB for one month. Then reshape it, keeping its area fixed, into
  a long, thin strip: 28 MB for 12 months, then 2.8 MB for 120 months. Each shape keeps the "1¢" label.
- A rule-of-thumb card: `\text{cents} \approx \dfrac{\text{MB} \times \text{months}}{340}`, rounded up.
- Worked check: 25 MB × 120 months = 3,000 → ÷ 340 ≈ 8.8 → "9¢", matching the Beat 4 table.
- Quiz card: "A 40 MB video for 5 years?" A countdown ring for the pause. Then the answer builds:
  40 × 60 = 2,400 → ÷ 340 ≈ 7.1 → rounded up → "8¢".

**Narration**

> Here's a way to estimate any price in your head. One cent buys a third of that gigabyte-month square. In megabytes, that's about three hundred and forty megabyte-months. You can spend it as three hundred and forty megabytes for one month, or about twenty-eight megabytes for a year, or under three megabytes for a decade. Same area, same cent.
>
> So the rule of thumb is: multiply the size in megabytes by the number of months, divide by three hundred and forty, and round up. Twenty-five megabytes for ten years is three thousand megabyte-months. Divide by three-forty and you get a bit under nine, so nine cents, which is exactly what the table said.
>
> Try one yourself. [[pause 0.5]] A forty-megabyte video, kept for five years. Pause the video if you like. [[pause 2.0]] Forty times sixty months is two thousand four hundred. Divided by three-forty, that's a little over seven, and since HashBin always rounds up, the answer is eight cents.

---

## Beat 6: When bundling saves money · ~5:00–5:50

**Scene:** `U2_Bundling`

**Visual**
- Twenty small `FILE` icons labeled "photo, 3 MB" in a grid. Each gets its own tiny `COST AREA` sliver for 1 year
  and a "1¢" tag. The tags slide together and sum: "20¢".
- The twenty files compress into one `FILE` labeled "photos.zip, 60 MB". Its rectangle: "3¢".
- A balance scale tips toward the zip.
- On the other side, a reader trying to open one photo from the zip has to download all 60 MB first; a small
  hourglass appears. Caption: "cheaper to store, less convenient to share".

**Narration**

> Here's where the rounding matters in practice. Every file is priced on its own. So twenty photos of three megabytes each, kept for a year, cost one cent apiece: twenty cents. Put the same twenty photos in a single sixty-megabyte zip file, and the whole thing costs three cents.
>
> That's not always the right choice. With the zip, a reader has to download all of it to see one photo, and you only get one link instead of twenty. But if you're archiving many small files together, bundling them is cheaper.

---

## Beat 7: Deposits and the fixed fee · ~5:50–6:40

**Scene:** `U2_Deposits`

**Visual**
- A bar chart: deposit amounts $1, $5, $10, $20 on the horizontal axis. Each bar split into GOLD (credit) and GREY
  (fee). Above each bar, the fee as a percentage: 33%, 9%, 5.9%, 4.4%.
- `MathTex` card: `\text{fee} = 2.9\% \times \text{credit} + 30¢`.
- The 30¢ part of each GREY segment is outlined and labeled "fixed".

**Narration**

> The only other cost is the card fee when you add funds: two point nine percent plus thirty cents per deposit, charged on top of your credit. The thirty cents is fixed, so it's a big share of a small deposit. A one-dollar deposit pays a third again in fees. Ten dollars pays about six percent. Twenty, a bit over four.
>
> Since your balance never expires, it's usually better to add funds less often, in larger amounts, if you know you'll use them.

---

## Beat 8: What you don't pay for · ~6:40–7:20

**Scene:** `U2_NoSurprises`

**Visual**
- A receipt scrolls up. Lines with GREEN checks: "Storage: paid up front". Lines struck through in GREY:
  "Monthly subscription", "Download fees", "Bandwidth overage", "Automatic renewal".
- At the bottom of the receipt, in small print: "Payments are final. Deleting early doesn't refund."

**Narration**

> Notice what's missing from the bill. There's no subscription, and nothing renews by itself. You pay once, up front, for exactly the months you chose, and you see the price before you pay. Downloads don't cost you anything, however popular the file gets.
>
> The flip side is that payments are final. If you delete a file early, you don't get the unused months back. So choose a retention period you actually need. You can always add more later.

---

## Beat 9: Recap · ~7:20–8:00

**Scene:** `U2_Recap`

**Visual**
- The `COST AREA` from Beat 2 returns with its formula, then three short labels pop around it: "min 1¢", "≤ 64 bytes:
  free", "+ card fee per deposit".
- A small link card: "hashbin.org/docs/pricing" with a calculator icon.
- `NEXT CARD`: U3 *The Life of a File* (larger), X2 *Paying for Popularity*.

**Narration**

> Size times months times three cents, rounded up to a cent. Tiny files are free. The only other cost is the card fee when you add funds. There's a calculator on the pricing page if you'd rather not do the arithmetic.
>
> Next: what actually happens to a file over its lifetime. How it's extended, how strangers can help keep it alive, and what happens on the day it expires.
