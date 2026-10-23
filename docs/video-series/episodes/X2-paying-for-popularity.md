# X2 · Paying for Popularity

| | |
|---|---|
| **Track** | Deep dive (users and developers) |
| **Length** | ~6.5 min (710 spoken words) |
| **Prerequisites** | 00. U2 helps (same "price as an area" picture). |
| **Afterwards the viewer can** | Explain a file's download allowance as a minimum time between requests; read a 429; price an allowance for a given size, rate, and duration; know who can buy one and the rules that apply. |
| **Next card** | X3 *Anyone Can Serve It* (larger). D1 *First API Calls*. |

**⚠ Recording hold.** This episode describes the per-file allowance as implemented in
`src/durable-objects/content-metadata.js` and `src/utils/rate-limit-pricing.js`. Production
downloads from 256t.us don't enforce it yet, and the default allowance (Beat 5) would limit a new
file to one download every 30 days worldwide. Settle the intended model, enforce it on 256t.us,
then revise Beat 5 and record. See README, Before recording #1.

---

## Beat 1: Who pays when a file gets popular? · ~0:00–0:50

**Scene:** `X2_Popular`

**Visual**
- A `FILE` with a single reader. Then ten. Then hundreds of tiny GREEN readers stream in from every edge of the
  screen, each pulling a copy out through `SANDBOX`.
- A meter on `SANDBOX` labeled "bytes sent" spins up. A question appears above it: "Who pays for this?"
- The uploader (BLUE), who paid a few cents for storage, looks at the meter.

**Narration**

> Storage on HashBin is paid for up front, by size and time. But storage isn't the only cost of keeping a file online. Every time someone downloads it, those bytes have to be sent somewhere. A file read once a month and a file read by a million people cost the same to store, but not the same to serve.
>
> So HashBin has a second, separate idea: a download allowance. It's a limit on how often a file can be served, and anyone who wants a file to be served more often can pay to raise it.

---

## Beat 2: Minimum time between requests · ~0:50–2:10

**Scene:** `X2_MTBR`

**Visual**
- A turnstile in front of `SANDBOX` with a small timer on top. Label: "minimum time between requests".
- Requests arrive as dots on a horizontal time axis. The first passes; the timer starts counting down from "1 min".
  A second dot arrives at 20 seconds and bounces off with an ORANGE `STATUS CHIP` "429"; a speech label: "Wait
  until 12:01:00". A third arrives after the timer hits zero and passes.
- Switch the timer to "100 ms": dots pass at up to ten per second. Switch to "∞": every dot bounces. Label:
  "blocked".
- A small GREEN `256T STRING` walks past the turnstile on a separate lane, labeled "≤ 64 bytes: no limit".

**Narration**

> The allowance is expressed in a simple way: the minimum time between requests. If a file's minimum is one minute, then after it's served, the next request has to come at least a minute later. A request that arrives too soon is turned away with status code four twenty-nine, "too many requests", along with the time when it can be served again.
>
> Shrink that minimum, and the file can be served more often. The smallest allowed is a tenth of a second, so at most ten requests a second. And if a file has no allowance at all, the minimum is effectively infinite, and every request is turned away.
>
> The limit is per file, shared by everyone who asks for it. Tiny files, sixty-four bytes or less, are exempt: there's nothing to send that isn't already in the link.

---

## Beat 3: Pricing the potential · ~2:10–3:40

**Scene:** `X2_Pricing`

**Visual**
- A `TIMELINE` of 30 days. Tick marks at every possible request time for a 1-minute minimum: they're so dense they
  form a solid bar. A counter: "43,200 possible requests".
- Each tick stacks a copy of a 1 MB block above it; the blocks form a rectangle, height "1 MB", width "43,200". Area
  label: "≈ 42 GB maximum".
- `MathTex` builds:
  `\text{price} = \text{size} \times \left\lfloor \tfrac{\text{duration}}{\text{min. time}} \right\rfloor \times \$0.02 \text{ per GB}`,
  rounded up to the cent.
- `DecimalNumber` under the rectangle: `$0.85`.
- A table builds with the rectangle changing shape for each row:

  | File | Rate | For | Price |
  |------|------|-----|-------|
  | 1 MB | 1 per hour | 30 days | $0.02 |
  | 1 MB | 1 per minute | 30 days | $0.85 |
  | 10 MB | 1 per minute | 30 days | $8.44 |
  | 1 MB | 1 per second | 30 days | $50.63 |

**Narration**

> How do you price an allowance? HashBin's answer is to charge for the most it could possibly cost.
>
> Say you want a one-megabyte file to be servable once a minute for thirty days. Thirty days has forty-three thousand two hundred minutes, so that's at most forty-three thousand two hundred downloads. Each one sends a megabyte, so the most this allowance could ever send is about forty-two gigabytes.
>
> The price is two cents per gigabyte of that maximum, rounded up to the cent. Here, eighty-five cents.
>
> It's the same picture as storage pricing, a rectangle whose area is the price. This time it's file size times the number of possible requests. Once an hour costs two cents. Once a minute, eighty-five cents. Once a second, about fifty dollars, because that's sixty times as many possible downloads.
>
> Notice you're paying for what could be sent, not what is. If the allowance goes unused, it isn't refunded. In exchange, the price is known in advance, and nobody gets a surprise bill because a file went viral.

---

## Beat 4: The rules · ~3:40–4:30

**Scene:** `X2_Rules`

**Visual**
- A `TIMELINE` for one file showing its retention as a bracket, ending at a RED expiration line.
- Three allowance bars are placed on the timeline by different people (one BLUE uploader, two GREEN readers),
  labeled "1 per hour", "1 per minute", "1 per second", overlapping in different spans.
- A highlight runs along the timeline showing which one applies at each moment: always the fastest active one.
  Label: "the most generous active allowance wins; they don't add up".
- A fourth bar tries to extend past the RED line and is clipped: "can't outlast the file".
- Labels pop in: "anyone signed in can buy", "paid from your balance", "not transferable", "no refunds".

**Narration**

> A few rules. Anyone with a HashBin account can buy an allowance for any file, paid from their balance. The uploader can do it from the file's page under My Uploads. It doesn't have to be the uploader, the same way anyone can donate to keep a file stored.
>
> Each allowance covers a span of time, and it can't extend past the file's expiration date. If several allowances overlap, they don't add together. At any moment, the fastest one that's active is the one that applies.
>
> And as with everything else on HashBin, purchases are final.

---

## Beat 5: The starting allowance · ~4:30–5:10

**Scene:** `X2_Default`

**Visual**
- A newly uploaded `FILE` on a `TIMELINE`. A default bar covers its first 30 days, labeled with the default rate.
- At day 30 the bar ends; after it, the turnstile timer shows "∞" unless a purchased bar covers that span.
- A rate card titled "Status" on a mock content page: "Rate limit: 1 request/30 days · until Nov 22".

**Narration**

> Every new upload starts with a default allowance for its first thirty days. Today that default is one request every thirty days. After the first thirty days, a file has no allowance of its own, and it stays that way until someone buys one.
>
> You can always see where a file stands. Its content page shows the current allowance and how long it lasts.

**⚠ Rewrite before recording.** These lines describe the current code (`DEFAULT_RATE_LIMIT_MS` = 30 days). If the
intended default is more generous, say what it is here; if the model relies on caching to absorb repeat downloads,
explain that, since the 256t.us worker currently runs on every request.

---

## Beat 6: A separate, simpler limit · ~5:10–5:50

**Scene:** `X2_PerAddress`

**Visual**
- Many different files behind `SANDBOX`. A single reader (GREEN) with a script icon hammers requests at all of them.
- After 30 requests within one minute, that one reader gets ORANGE 429 chips with a "Retry-After" countdown, while
  other readers keep getting files normally.
- Label: "30 requests per minute, per network address, across all files".

**Narration**

> Don't confuse the allowance with a second limit you might run into. 256t dot U S also limits how fast any single network address can make requests: thirty a minute, across all files. That one isn't for sale. It's there so one busy script can't crowd out everyone else, and it tells you how many seconds to wait.
>
> So if you see a four twenty-nine, there are two possible reasons: the file's allowance, or your own request rate.

---

## Beat 7: Recap · ~5:50–6:20

**Scene:** `X2_Recap`

**Visual**
- Two rectangles side by side: storage (size × months × 3¢/GB) and allowance (size × possible requests × 2¢/GB).
  Both priced up front.
- `NEXT CARD`: X3 *Anyone Can Serve It* (larger), D1 *First API Calls*.

**Narration**

> Storage buys time. An allowance buys downloads. Both are priced as an area, up front, for the most they could cost, and anyone can pay for either one.
>
> But HashBin doesn't have to be the only place a file is served from. Because the name comes from the content, any server can hand out a copy, and anyone can check it. That's next.
