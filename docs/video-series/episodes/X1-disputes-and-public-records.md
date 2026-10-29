# X1 · Disputes and Public Records

| | |
|---|---|
| **Track** | Deep dive (users, rights holders, the curious) |
| **Length** | ~6.5 min (707 spoken words) |
| **Prerequisites** | 00. U3 and U4 help. |
| **Afterwards the viewer can** | File a report and know what happens next; read a dispute's status; explain why reported content is blocked before review and what limits abuse of that; find and read the public records. |
| **Next card** | X2 *Paying for Popularity*. U4 *Who Can See What* (if not seen). |

---

## Beat 1: The tension · ~0:00–0:50

**Scene:** `X1_Tension`

**Visual**
- A balance scale. Left pan: a `FILE` with a small crown labeled "someone's copyrighted film". Right pan: a `FILE`
  labeled "a journalist's document", with a reporter (ORANGE) pointing at it and saying "Take it down!"
- The scale wobbles. Caption: "Act too slowly: harm stays up. Act too quickly: anyone can silence anything."
- The words "HashBin's answer: block fast, decide carefully, do it all in public" type across the bottom.

**Narration**

> Any service that lets people publish has to answer a hard question. What happens when someone says a file shouldn't be there? Maybe it's their copyrighted work. Maybe it's illegal. Or maybe they just don't like it, and they're hoping a complaint will make it disappear.
>
> Act too slowly, and real harm stays online. Act too quickly, and anyone can take down anything with a complaint. HashBin's approach is to block quickly, decide carefully, and do the whole thing in public, so that everyone can see how it's being used.

---

## Beat 2: Filing a report · ~0:50–1:40

**Scene:** `X1_Report` (optional screen capture)

**Visual**
- A mock "Report Content" form builds field by field:
  - "Content ID (CID)" (prefilled when arriving from a content page's "Report this content" link).
  - "Reason": a dropdown opening to copyright infringement, illegal content, privacy violation, harassment, malware,
    other.
  - "Explanation and evidence" with a counter "0 / 10,000 (minimum 50)".
  - "Supporting links (HTTPS, up to 10)".
  - "How can we contact you?": email or web address, with a note "not shown publicly".
  - A checkbox: "I confirm this report is made in good faith and the information in it is accurate."
- A reporter (ORANGE) fills it in and submits. A reference number appears.

**Narration**

> Anyone can report a file, with or without an account. There's a "Report this content" link on every content page, which opens a form.
>
> You choose a reason: copyright infringement, illegal content, a privacy violation, harassment, malware, an intimate image shared without consent, or something else. You explain the problem in at least fifty characters, and you can add up to ten supporting links. For copyright, that means identifying the original work, how this file infringes it, and whether you hold the rights.
>
> Then you leave a way to reach you, and confirm that the report is made in good faith.

---

## Beat 3: Blocked, immediately, and in public · ~1:40–2:50

**Scene:** `X1_Blocked`

**Visual**
- The `FILE` in `BINS` gets a RED band. Readers requesting it from `SANDBOX` get a RED `STATUS CHIP`: "451 Unavailable
  For Legal Reasons".
- The file's content page shows a notice: "This content has an open dispute. It is blocked until an administrator
  reviews the report. View dispute."
- A public "Disputes" page slides in: the report appears in a list with the CID, the reason, the explanation, and the
  links. The contact field is blurred, with two labels: "hidden from visitors" and "visible to signed-in users".
- A counter above the content: "expires in 30 days".

**Narration**

> As soon as a report is submitted, the file is blocked. Anyone who tries to download it gets a special status code: four fifty-one, "unavailable for legal reasons". That's the number from Fahrenheit four fifty-one, and it means the file exists but is being withheld.
>
> At the same moment, the report becomes public. It's listed on the disputes page with the reason, the explanation, and the links. Your contact details aren't shown to the public, but signed-in HashBin users can see them, so the person who uploaded the file can get in touch with you.
>
> Publishing the report is what keeps this honest. If someone files a baseless report to silence something, the baseless report is on the record for everyone to read.
>
> There's one exception. A report of an intimate image shared without consent stays private: the public sees only the file and the reason, and an administrator decides it within forty-eight hours.

---

## Beat 4: Review · ~2:50–4:00

**Scene:** `X1_Review`

**Visual**
- A flowchart builds left to right. Start node: "Open" (RED band on the file).
- An arrow to "Under review" (moderator, GREY person, picks it up).
- Three exits:
  1. "Denied": the RED band lifts; `STATUS CHIP` 451 → 200 GREEN.
  2. "Upheld": the file is removed; `STATUS CHIP` 451 → 404; a public record row "removed by admin" with a short public
     reason.
  3. "Expired after 30 days": a clock hits 30; the band lifts; 451 → 200. A small note: "not copyright or intimate
     image reports".
  4. "Counter-notice" (copyright only): a calendar counts 12 weekdays; the band lifts; 451 → 200.
- Under "Upheld", a small branch: "copyright → strike against the uploader".
- Under "Denied" and "Expired", a small lock icon labeled "no new report on this file for 30 days".

**Narration**

> Then an administrator reviews the report. There are three ways it can end.
>
> If the report doesn't hold up, it's denied, and the file is available again.
>
> If it does hold up, it's upheld, and the file is removed, the same way as any other deletion. The public records note that an administrator removed it, with a short public reason. And just like when an uploader deletes something, that exact content can't be uploaded again.
>
> And if nobody resolves the report within thirty days, it expires, and the file becomes available again. A report can block a file for a while, but not forever by being ignored.
>
> Copyright reports and intimate image reports are different: they never expire, so the file stays blocked until an administrator decides. A copyright report can also end with a counter-notice from the uploader. Then the file comes back about two and a half weeks later, unless the person who reported it goes to court.
>
> Once a dispute closes, the same file can't be reported again for thirty days. That stops anyone from keeping a file blocked by filing the same report over and over. An intimate image report is never made to wait.

**⚠ Before recording:** browsers that already fetched a file may keep showing their cached copy (README, Before recording #4). Expired disputes unblock content once the STATUS S15 fix is deployed.

---

## Beat 5: Limits on abuse · ~4:00–5:00

**Scene:** `X1_Limits`

**Visual**
- A reporter (ORANGE) with a stack of forms tries to submit them quickly. After 10, a gate drops, labeled
  "10 reports per hour from one address".
- Same reporter tries a second report on a file that's already disputed: "one open dispute per file".
- An uploader (BLUE) with three upheld copyright reports: three strike marks appear on a card, and a small bell
  rings on the moderator's desk, labeled "3 in a year".
- Pull back to show all four mechanisms as a list on the right: "public reports", "rate limit", "30-day cooldown",
  "30-day expiry", and then "strikes" for the other side.

**Narration**

> Blocking first is a real trade-off, so there are limits on how it can be used. One network address can file at most ten reports an hour. A file can only have one open dispute at a time. And there's that thirty-day pause before the same file can be reported again.
>
> The limits run the other way too. When a copyright report is upheld, the uploader gets a strike. HashBin keeps track of repeat infringers, and three strikes within a year flags the account for the operator. The DMCA policy page lays out what a formal copyright notice has to include, and how a counter-notice works.

---

## Beat 6: The public records · ~5:00–5:50

**Scene:** `X1_PublicRecords`

**Visual**
- A mock "Public Records" page: stat tiles "Total deletions", "Expired", "Removed (admin or uploader)", "Open disputes",
  each counting up.
- A table scrolls: rows with a truncated CID, date, and reason: "expired", "deleted by uploader", "removed by admin".
  No uploader column; a ghosted, crossed-out column header "uploader" fades in and out to make the point.
- A filter dropdown switches to "Removed by admin"; rows filter.
- An "Export (JSON)" button; a JSON snippet unfolds beside it.
- Three API paths type out in monospace: `GET /api/public/deletions`, `GET /api/public/deletions/stats`, `GET /api/disputes`.

**Narration**

> All of this ends up in the public records. Every deletion is recorded permanently: the content's string, when it was deleted, and why. It expired. Its uploader deleted it. Or an administrator removed it. There are running totals, and you can filter the list, export it, or pull the same data from the API.
>
> What's not in the records is anyone's identity. The question the records answer isn't "who uploaded this", it's "what has HashBin removed, and why". If the service ever started quietly removing things, the gap would show.

---

## Beat 7: Recap · ~5:50–6:20

**Scene:** `X1_Recap`

**Visual**
- The flowchart from Beat 4, compressed, with the public-records ledger running underneath it, each node dropping a
  row into the ledger.
- `NEXT CARD`: X2 *Paying for Popularity* (larger), U4 *Who Can See What*.

**Narration**

> Anyone can report a file. It's blocked right away, the report is public, and a person reviews it: denied, upheld, or, for most reports, expired after thirty days. Limits keep reports from being used as a weapon, strikes keep repeat infringers in check, and every removal lands in the public record.
>
> Next, a different kind of limit: not on whether a file can be read, but on how often.
