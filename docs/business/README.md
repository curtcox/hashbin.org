# Opening HashBin to the public at low risk

Written 2026-10-24 for a loss budget of about **$500 a year**, with the owner in Missouri and no
umbrella policy. This is research to plan with. It is not legal, tax, or insurance advice; the
two places where a lawyer's hour is worth paying for are marked.

The numbers live in three Sheets documents. Edit any input in the Source pane and the tables
recalculate; **Share** gives a link holding your edits.

| Sheet | What it answers | Source |
|-------|-----------------|--------|
| [Legal structure, risk, insurance][legal] | LLC or not, what could go wrong, which insurance | [legal-and-insurance.org](legal-and-insurance.org) |
| [Pricing and scenarios][pricing] | What to charge, card fees, a year at several sizes, break-even | [pricing.org](pricing.org) |
| [Cash reserve][reserve] | How much cash to keep | [reserve.org](reserve.org) |

The `.org` files in this directory are the source of truth; the links are generated from them.

## Short answers

### Do I need a separate legal structure?

**Yes: a Missouri single-member LLC. It costs about $50, once.**

- Missouri charges $50 to file Articles of Organization online ($105 on paper). It has no LLC
  annual report and no franchise tax, so there is no yearly state fee. You can be your own
  registered agent; the catch is that the address you list becomes public. A commercial agent
  runs about $50–125 a year.
- Taxes don't change. A single-member LLC is a "disregarded entity": profit or loss still goes on
  your Schedule C. Run it as a business that's trying to make a profit, and a small loss offsets
  other income.
- **If you don't:** as a sole proprietor, every claim against HashBin is a claim against you
  personally: house, savings, wages. Your $500 budget then caps nothing. With my guessed
  probabilities (legal sheet, section 2), expected yearly exposure drops from about **$474 to
  about $61** once a judgment can reach only the LLC's own money. The guesses are rough, but the
  gap comes from the rare large events, and those are exactly what the LLC limits.
- Skip Wyoming or Delaware. You live and operate in Missouri, so you'd also have to register
  there (about $205 to start, ~$190 a year, versus $50 once).
- The shield holds only if you keep the LLC separate from you:
  1. Get an EIN (free) and open a business bank account (free at many online banks).
  2. Move Stripe, Cloudflare, Clerk, both domains, and the DMCA agent registration into the
     LLC's name.
  3. Pay HashBin's bills only from that account, sign things as "HashBin LLC, by Curt Cox,
     Member", and fill the Terms' `[LEGAL ENTITY NAME]` with the LLC.

  The LLC doesn't protect you from your own wrongful acts, unpaid taxes, or anything you
  personally guarantee.

### How much do I need to charge, and for what?

**Keep $0.03/GB-month for storage and keep downloads free. Change four things around them.**

Fixed costs are about **$81 a year**: Workers Paid at $60, domains at about $19, and the DMCA
agent at $2. Clerk is free up to 50,000 monthly retained users. At $0.03 you keep about $0.013 per
GB-month after R2 and the card fee, so holding **about 512 GB of paid storage all year breaks
even**. Below that, the loss is under $81, well within budget (pricing sheet, sections 3–4). The
"Growing" scenario (1,000 paid GB) nets about **+$80 a year**, and "Busy" (20,000 GB) nets about
**+$2,900**.

1. **Stop adding the Stripe fee as a "card processing fee."** That is a credit card surcharge.
   Visa caps surcharges at 3%, bans them on debit cards, and requires 30 days' notice to your
   processor; a few states ban them outright. A $1 deposit today carries a 33% surcharge
   ($1.33). Instead, set a **$10 minimum deposit and absorb the fee** (5.9%, already in the
   break-even above), or sell fixed-price credit packs. This touches `src/utils/pricing.js`,
   `src/api/payments.js`, the deposit UI, and Terms §3.
2. **Put a budget on downloads.** Downloads cost almost nothing until something goes viral. One
   file downloaded 200 million times a month costs about **$1,070 a year** in Worker and R2
   requests, twice your loss budget, and Cloudflare has no hard spending cap. Settle STATUS
   **B9**: give each CID a free allowance, then have the uploader pay about $1 per extra million
   requests (twice cost), or throttle. Also set Cloudflare billing notifications now.
3. **Cap prepaid retention.** Uploads accept any number of months (`src/api/content.js`), and
   donations allow up to 1,200. Every prepaid month is a promise you have to keep paying R2
   for. Cap new purchases at something like 10 years, and add a discontinuation clause to the
   Terms (see Policies).
4. **A free tier is affordable only if it's small.** At the "Growing" size, 100 MB per account
   costs about $36 a year. 1 GB per account costs about $360 and turns a profit into a loss. A
   free tier that nobody tops up loses about $440 a year (pricing sheet, section 3). If you
   want one for growth: 100 MB, one month of retention, OAuth accounts only, and only after the
   download budget exists. The real cost of free hosting is moderation, not storage.

### How much do I need to keep in reserve?

**About $480 today**, kept in the LLC's account (reserve sheet). The rule:

> One year of fixed costs + the R2 cost of all prepaid retention still owed + all unspent user
> balances + a chargeback buffer (count × ($15 dispute fee + typical deposit)) + about $300 for a
> bill spike or a first lawyer consult.

The reserve grows with prepaid retention. Since R2 is half the storage price, setting aside half
of every storage purchase until it's earned covers that part automatically. Read the inputs from
`/api/admin/stats` and the payment totals once a month.

### Do I need to buy insurance?

**Not now.** The cheapest policies that cover HashBin's real risks (a tech E&O, cyber, and media
bundle) run about **$2,500 a year**, five years of your loss budget. My guessed expected yearly
loss with an LLC is about $61. General liability (~$400) covers injuries and property damage,
which HashBin doesn't have, and rarely covers content claims. A personal umbrella excludes
business activity. Your protection is the LLC plus actually doing the safe-harbor steps below,
which is what makes the expected losses small. **Revisit when yearly profit reaches about three
times a premium, or when a customer contract requires coverage.** Then get two or three quotes
for the same limits.

## Policies to adopt before the beta banner comes down

| Area | Do this | Why |
|------|---------|-----|
| DMCA | Register the agent ($6, renew every 3 years; set a reminder). Enforce the repeat-infringer policy. | Without these steps, the safe harbor can be lost. In the risk table, a lapsed agent is the largest expected cost. |
| DMCA disputes | **Don't auto-restore content 30 days after a copyright notice.** Restore only after a valid counter-notice and the statutory 10–14 business-day wait. | Putting noticed content back without a counter-notice puts safe harbor for that work at risk. Today all disputes expire after 30 days (S15; legal-review item 5). **Worth asking a lawyer.** |
| TAKE IT DOWN Act (in force since May 19, 2026) | Add a "non-consensual intimate image" report type, remove within **48 hours**, never auto-expire, and remove identical copies. Publish a plain-language notice of the process. | It applies to public sites hosting user content, and the FTC enforces it. The report form has only "copyright" and "illegal" today. Identical copies are easy: same bytes, same CID. |
| CSAM | Register with NCMEC's CyberTipline, write the internal procedure, and preserve reported material for 1 year (REPORT Act). | Fines for knowing failure to report reach $600k+. |
| Terms | Fill placeholders with the LLC. Keep the liability cap. Add a discontinuation clause: notice period, a download window, and what happens to prepaid retention and balances. Drop "card processing fee" wording. | Prepaid retention is an open-ended promise until the Terms say what happens if HashBin stops. **Worth a lawyer's flat-fee review** (~$760) before launch if the budget allows. |
| Balances | Keep them closed-loop: not transferable, not cashable (as now). Don't build B5 (peer-to-peer transfer). | Transferable stored value starts to look like money transmission. Missouri may treat old credit balances as unclaimed property after about 5 years; keep records. |
| Sales tax | Confirm with the Missouri DOR before registering (STATUS L2 plans to register). | Several sources say Missouri doesn't tax SaaS or cloud storage. Registering may create filings for $0 of tax. Other states' thresholds (usually $100k) are far off. |
| Spending | Set Cloudflare billing notifications and keep the `ALERT_WEBHOOK_URL` alert live (S3). | No hard cap exists. A bug or abuse shows up as a bill. |

## What to buy

| Item | Cost | When |
|------|------|------|
| Missouri LLC | $50 once | Now |
| EIN, business bank account | $0 | Right after the LLC |
| DMCA designated agent | $6 per 3 years | Now (L7) |
| NCMEC CyberTipline registration | $0 | Now |
| Commercial registered agent | ~$50–125/yr | Optional, if you want your home address off the public record |
| Lawyer flat-fee review of Terms, Privacy, DMCA flow | ~$760 once | Recommended before launch; it's above the yearly budget, so treat it as a one-time setup cost |
| Insurance | $0 | Not yet; see above |

## HashBin code issues found along the way

- `src/utils/cost-estimation.js` uses stale prices: Workers at $0.50/M requests (now $0.30) and
  R2 egress at $0.015/GB (egress is free). `/api/admin/profitability` overstates costs.
- Upload retention has no upper limit (donations cap at 1,200 months).
- Checkout and Terms §3 describe the Stripe fee as a "card processing fee" (surcharge rules
  above).
- The dispute form has no NCII category, and every dispute auto-expires after 30 days.

## Where Sheets fell short for this job

Recorded, not yet fixed, in the Sheets repository:
`design/field-report-hashbin-money-model.md` (linked from its PLAN.md under "Field reports").

The model is split into three sheets because a single 17 KB document made a link GitHub Pages
rejects. Saving to HashBin is the intended answer for large documents; I split it only because
saving needs your signed-in account. The other gaps: no inputs shared across documents, constants
hidden in the preview, no `if()` or comparisons in Org formulas, the `a/b*c` precedence trap,
hard-to-read money columns, no goal seek, no input styling, and no supported way to build a link
from a file. The report also records one real bug: reloading an editor tab whose document is too
long for a link fails, and the text is lost unless it was saved to HashBin.

## Sources

- Missouri LLC fees, no annual report: [ZenBusiness](https://www.zenbusiness.com/missouri-filing-fees/), [LLC University](https://www.llcuniversity.com/missouri-llc/costs/) — confirm on the Missouri Secretary of State site
- Cloudflare: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers and Durable Objects pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Clerk free tier, 50,000 retained users: [Clerk pricing explained](https://clerk.com/articles/clerk-pricing-explained)
- Card surcharge rules: [Arent Fox Schiff on Visa's 3% cap](https://www.afslaw.com/perspectives/alerts/visa-reduces-its-merchant-surcharge-cap-3-effective-april-15-2023-merchants)
- Stripe disputes: [Chargeflow](https://www.chargeflow.io/chargebacks-101/stripe-disputes); Stripe Tax: [Stripe support](https://support.stripe.com/questions/understanding-stripe-tax-pricing)
- Missouri SaaS and storage not taxed: [Commenda](https://www.commenda.io/usa/missouri/is-saas-taxable), [Kintsugi](https://trykintsugi.com/sales-tax-guides/usa/missouri)
- TAKE IT DOWN Act: [WilmerHale](https://wilmerhale.com/en/insights/client-alerts/20260615-the-take-it-down-act-goes-live), [Reed Smith](https://www.reedsmith.com/our-insights/blogs/viewpoints/102ms5e/covered-platforms-are-you-ready-to-take-it-down/)
- REPORT Act: [Thorn](https://www.thorn.org/blog/the-report-act-explained/), [WSGR](https://wsgr.com/en/insights/new-minor-safety-obligations-for-online-services-report-act-expands-child-sexual-exploitation-reporting-requirements.html)
- DMCA agent fee and 3-year term: [Copyright Office FAQ](https://www.copyright.gov/dmca-directory/faq.html)
- Missouri unclaimed property: [unclaimed.org (Missouri)](https://unclaimed.org/reporting/missouri/)
- Insurance prices: [QuoteSweep](https://www.quotesweep.com/blog/tech-startup-insurance-cost), [Insureon tech E&O](https://it.insureon.com/small-business-insurance/eo/cost), [Secureframe cyber](https://secureframe.com/blog/cyber-insurance-costs), [Insureon media](https://www.insureon.com/media-business-insurance/cost)
- Lawyer flat-fee review: [ContractsCounsel](https://www.contractscounsel.com/b/website-terms-of-service-and-privacy-policy-review-cost)

[legal]: https://curtcox.github.io/sheets/?format=org&view=preview&compressed=MQagKgkmAyCiBcACAEgQwM4AsBCBLAdkgDYCmA5qkYugC4BOArgMY0N0kA0idu6A1lwLo2qfExIAoCbABuJOgE9E+BgFsARvMS9Eo7fgAODGogUB7BoiZ6mmUWRJIamEogC8oAMIB5AHIBlMABBXzB-eDdEIgISdH1EZ1d0CzpxXXwAEwSXfSMaCSYzIjV8OLMAM0QSVFsE1HVSADpEAHEGWPRY3XZEVVQ6PhIsgCIydvR0YeaABR5xONsSJkGs7xYzTTpEACYABm2ANmagxAMiUXwCMl1cDK58M3zSCiIuGlQADy4zLaERMVcqAyMlw4mankoTG4DFISDcACpIuoCBk4jRcGRMDQtM49G4APRuLjJRAAdx42PcAApUPj1ABKeFMNyNKRePyBEJhJAGOYkNy7Rq7ADMvQIABESAYzOhcDQ3ABGRAZKUyuX+XAAL35Ct2pww6DAmDoFkxAqiMvQ2AYGQc8oArLtdhJ2QFgqFwmSfoM6FaMPz7dxtgKhQrA3RtgAxdg6vVMIjoIJuAAsjUD8cT0ZIOqsCewIeFB1zVqzsZdIB8bq5ntJACUSABHAt60mlxV6jJmetNwVh5VmNtK+PyPhtx1OuOkAbYf1ubbpqd8abyEP7cuVzkepDsBvLugAVTOZiBbiLnb3h6Ix4y7asNRcyDlIft6457u51HouAMJGmLFX2wAJyfjwP6RrgHzNsqvB5CQkbZoqL6upuH6dn0BDeHQZCKkqaGoAQ+7oG4AAcyqqNYc66A4+Dynqfx0KI4jmo8Lh0OBHxDAKr5VluUREEwQQTCQNBEeOUjwogCrNNA5CUCBzCsOwSCknYJjVLUZgGOiZj4FYMoiVInhFCUcTbFwRaiFkADs3SuAQeToM0ADq3ryOgXB4UI6RZOKACyngnIUqiuOUJqqNkriFKU7w0Y5bIgL4QS+Qg8ksGwkgAD6IN4Wm4DpiAFYVRXFSVpUlVl-jCQwBiIFlLkDG5tWIOKZjoaUTV+QFTVBNRJhZRApT-GkWUAJrVFsSpZdAqDYlsCjjXEdWqboUSoKSwhyneunsPeZV7RlEgZQAtCdp1nedF2XVd50gJdt1Xfdd0XY9Z0vU973XSdb2fT9v1nQdFVFK4vKaTwwk-IgVI0GYGSoAo9J7WVWVFXqyPFajpUY4VWPY01ZU47jaP401sjyAozhXKYFiIGYpK6YjDO1YdiD+EDpwmryuDg1sICIL53iIOUoLotpDBxPgqDBUVROIDZMsFQThMo3jSvE-LislRjpOKBT+DXOYli0-TjP7czvm8MkbC4Ig0DQJ4XAG7ocSoL1Jsq4gjru6r6Pu4rGvewHmNNbbni9DpJBKFSuCVI7gxStoJidAY-QzSQCPFQDfMWyk1sh1wQXBakuByS7JA0YjROe-LiD+wTOO6v7CtezXzc+xVkskAA3IgccGHEBtbJgrWAhkGTsBM7O4DIqfS2bAsh4gvPnKS81bOwIIkOtiBgGY-jeZP09MEoaPEbqre177XuNy36ut8r7fBVwpJypgiCaDQs1HditBDAk8iqHECuc8bZ20Xogai8g5LRHqLgaINAlA6SIEoJGRUq5B2rnXK+rdkxOmbtfJuD8u6tGgNwfoJAkF6TkL6PSNEy4mHjPhABs8sr8xAaHXm2JaiwAAGTeHzgoTYXBgoZGLm-BgmRSAFUrhfDBl8ZYa3nLg2+1d74sw7lwM4Yt9DCHYFsZOCg4gqnKGXToQC6rmFUJTBe7AyC8Fmr-AgWcJg53KoVPYgZZGeNUQVBUZ8VE301nfJW-gO5Oz5vPO2+d9JxFUD8VwbsDqgDANgaAkZfJIAACTCkVNseEGTSSuV9DOTo8B4AZOTG4DJnl8CYTICAKprV8L4EIqUjJ9pKkZHIqgVpxFKnbHqcKepyZ6n2nqQcepVlO4AFJGjbHKK0wClTBnlJGWMiZ0zZnlHEjsZotZeB8HQMpZahQYRZDIGYMkJo9bxFQKYcaUgghECoLYRiXRLJ6VoM7HoYwOhdHKBDR20MEjiJIM0YYTkX5sOGHePuVRdpXgnjNCKYd8ARwihIBeQ8iCom7ptTsXQHj0LMFQ7IVx+7U07KcNyOlKBIK4OI5Otw6gcXcjTLYohyaYEpo7MYKdaGgviolZK259noGZqTcubspXSqyp4OwAJ8QKC2LK-S2hKibTsAYH87UsqwA+D+FgQx7gXIXrq-VSxsR3DYUzY6f07X2uut9G6DrXouqOk6q6mcjIGCVRiLE1AGBymJKgYxiA7B0HUBDRxZwaiuCpEYkxacM7oyFLsDxbswwTiCegk2qNmbet9ZiEwsM+gOFZegENrhw2Rq2AikwNJXbnD7kMBG8jU2TRNpmrN-ic2MzzVlSU5RJYzTyvgfEnND5KAYbgcKxKtBiy0FFbE5cqTbGFLsdOV9U3ps7ROfBgSe2E2Zv4Bg6hpRl1uRDaU0Q0g7nGCYVFQxKa3OXqvFBKa03ZpKuOL9bdc02uajNW56gdq1HHtKUocaSDoQTFwGoJzy6w3eJu5NH6O1u3HPuv9faAORjAKHGo2l8DGu3kEAA0rARAUBmreCcr4bg0HiVyRBvMQBriUapu2L+gqexu3SqwzffNV4bTlHOD0ZETzqAGFwIMSG9QF1srEWQbuDww39CyNYAw6d1ZCh3W7ddAnA5q3zeGhw6gah8EU9YOgGQv6xHRNc0KqAbRklQHIBJmshSikPcVAz3GjPoOZmRh4z9HP4WKD0IF7BpR0BMJ4fwSUEgXN8J4ZKocGZE0FBOdDDMDh7sMwQ-9AM3UlftR6065WfqVYevazOO93hUGlU1xmh6fPvrdgJvNSSUlpMyRUjJuSskbLma09pA34SWPwFSLJHAMlPIEkJES9JhvzPgAAAQAHzlLcDIYQqgqRre2I0Roa2joKmWzMkb62tvtN22oA7R2TtnYu5s7ZwpmgDR0a8o5SL1Kv2vaCJQBTTkfJMO8woVCpCzGg7gNQXzganuiFgX+6A+hPKOuoMWMQJ7COLu1d5bnIFlshnsecgBkAlJwcekxqTANgYI8WI4JWrJ0iy4VQEhn7OGRSQc1hqsjzX6BQhFcRHGdBYKOnY25TSYAoSpJFeh6JaB5wakSSX9QIOMFwTQ-yehyjFUbUHztMjswqHKVk5YhUpXoq85m0wiiA+ay1xA0PLFqEVcqxAY1+hlEqMLsRtphJNSMlQtjjumtZQAGryBESwQWEMQth4zodUrLrqvupT+njPWe09Z4upnFoZdIFUGgRJuUyDw9lRwQVv9A0ABWbAFAaI5vIeByph0OG7nAmgkjyGmJQf4Pg34kB2CwMiXSI-lAXN5DDzoZQtggllKrzOvkn0vuLqX1vYfq4N2r6ogtPAi0eRIEOvoRGm9TxqFO84M7Q-SxtqnOgTgchtW4PsrXxhED7haKHHQnNxBZGqgAzACWFfh4QFkT3YxKmIiUTDwxkqjoBBDSCHVgXSi4DrTb3eFzEYVv1KimgfyQB3j3hEXQGnULn3k00FlwF9BMGYUQE8AES0AgPayKl413yVmwFA1fnAx0k6Bp2jlBBHR0i4B52hliwlzvwHyHzoMXH3n8C-B-DDSKCyESGoCWHYCX2ZmAK4V4TASPk2DAVx2A3EQyEkTvxKkUTYMK0eSoGcBjCYJNiymtCBxcF0hBiFhMEAFMiRAYUAAdfZhhzUBa1t2pQlioDUBA3IXOEdxUT8zaxzRGhSCpV9BpWL3X1gTLwgIHTMFiHwAAHITAXAiADAkAed4wbQuhMdZRUUJ4kZk9c9fo08c9HV6iU8miWijpM49UVdf4Bc6AhdLQyRIUF4qQABy7YbTRGSwgJewxPOImYqRcsZJVJdJRALJPpfEObS0a0APGgDZBUVbTbAbNwdgWJbEKkHgfgdyQ4+0F7K7Q47JQ47YDY4XbYu0FbCQIAA
[pricing]: https://curtcox.github.io/sheets/?format=org&view=preview&compressed=MQagKgkmAyCiBcACAEgQwM4AsBCBLAdkgA4BOuAxgQOaKr4Ami65ApvqmQPboBQPsANxYkAnonwBXALYAjYYlzpa+BfiISALohGcJicnX2Y6VFkg2YWiALygAwgHkAcgGUwAQSdgX8a4gA2BCxKBIgWVui6JKzKjOGq6ho85Jz+0vhKnABmiCyo5JhhqDL+LAB0iADiEsHowbQkVlIcANYsjABEVDXo6B0VAApkrEoFLORtjA7kGpxyJIgATAAMiwBsFe6IRP50+NS0uPQANOKcSaVUqP6nGqgAHqecCwToEiR0Maj0AhTliHZruRECQJKUkNYAFR+GQEehKDS4KiYDTyCyGawAemsp0iiAA7mRUTYABSoTEyACUkPI1jKfHszjcnm8xGGLGsyzKywAzIgpAQACIsIjcXAaawARkQ9BFYo0LlwAC8OZLltsMOgwJgSLpkZyAtx0NgJPRTBKAKzLZY8RmuDxeHwE55tEjGjAci0gxac7mSr0kRYAMUaqvV5H86Hc1gALGUvRGoyGWKr9JHsL6eWs08bk2HbSBHPaWU78QAlFgAR0z6vxeal6vonAr1a5-plnHr0ojwha9at1vDpRILWwHusiwTw5aA2EvtWBaLzMdSEaldnJAAqjtON9rNmmxvt-5d-QG-p8pZkOLfRbF0yHaymBoyEQWAMZvPFgBOZ+vlhBrg9w1jKiiJABKZSnedrLk+TbNAQDgkFQUrSvBqAEJu6DWAAHDKUgGBOtCmPgErqq87yfBy6rnJYJCAfc7ScvexYrgE-jkO4vQsBo2EDnwkKIBAaiaLwDIgE47gALIIAkok8AAPkJIlaIganqRpmladpOkaUpABq1w1IgSmbvsqm6WpSkuFEMSWfZDnaQpikALRue5HmeV53k+b5bkgN5AV+YFwWhWFoXOdZswfKY2zstouhGBwsWOTpSkaeqSkACSYpU2AuVInCkYUWlKeg0SYpouCRpipAUNQZQAFZKKlDmRYgYAiEQFDXDKcroOKrVDel6mZYgWXDYg3S1ENs26e1gIkIwWQphq3FxJwiASHUCwkpKlKIM8tAyJEJByIwJLLAdVmaWNWS7DQbVhJw9CoCISCSgA3GEmCKPyL0sP4fVZKgYK8c9iDqm1imIO45CsEQdwlFYJ69HNjkjWpY05SIeQLJZSk6O8yjoPi8jo8NMN2Cepr3RwVgAOousISgDBhjAUzdGUmeNmKFcVBN9UIJ5vm6ZQRro9B0404ucFImL4szbq1bsGhZM88t1ZQ+A0O1ZaLM+zyoClnMY7dPM5XlBVFRYTlC4DnCi+g4s01Luwyyk8uBrVwwHATMP64gWShobMVWKbaXm0pVv87bkfoKgUjhxHc3tUzI7yGuPTg5wQgLGqUl8zbJWpZjkMW3z1WBEV8eJ8nKeU0pgeNN8SgkhGmqINgB25-IBdFwLT3c9llf+NXKh2wnScN6nVPTkHIex5g-hiI0dxBIw20s2bw9bTtLWCz2I6y1IcX1TriAkkGLAyEsqzZgUJgsNd-tRf+2zCKwpHG-XDdl3dHwZi4BrvHF8uA3wnx9ufR6M8TIwxcGAt8QcgLtCDqtWBXNRoW0mlPX+GDX6IAQe-egYFNBWBWng02-9sGtTKnXfBpcYbGCwLCfAZRng0EaPgFg+Jeoz2oSPXGHB7JKWmr0b6YwJgghYFQRQL5hEEAEJwP4s12qTjWBoMo21pHcN4UDBhAjeZCPxvNKaPR0ASMsFIxosj0DyJePgJRKjG6IEFFJOwWwf6kUvllbMotEB8mMegF+k1d44zxiI-QjsRBkGRJoqgudMT0AIqgFyJDGgzGeGIWeTcZFyOEKgrxFlYGGPCcIwW5EchE1oDMWgSgiYLE4PiCenN2rCTeB8fAdkGGaVKZiYxkT1R+HwEVFg306hWHiJcXqWAUzFPmjDKSoyxDxGgNAOwiBMCpHhJffExgtCoEQI1U0VAk7eIMCoFuBQDojWxpNQAEkQ-SsI0HaQgenqWcqAMA2BoBBikkgAAAosLKPospazMPAAFPIQXWCyrKUUA0FTKghQCmMMKwWam1LqCQyJ4CQotOi1GxoTk8TxQCtY6LFYZzdGOOoZKADs6LAxkpwky4MoYyXfkpS2Mlap0WJmwLyyU-Lpx5l5cC0Fdj-wfg0Ly6FkrEEASArytFoKSHoHAtfFF-p0XoUQshXlFK1VywwvgLCvLGVqpSby1loKim8q5aCiinTWBkpWISjiXE6i8QEogSUFQzKDXGEVOWFAxKgEkjJJAEhzK8CUtqP27yPmIAAJqJUfshKwSkIBaBSHY+piUlJSWSqESK4Vy3hSCn5KtwUa0eXatKPKodUHq3zv9QeqjLJjXst24eMNpQSB3N8S+Wdgi8VOIScUwRvpEAwFoYOq1ETCBuTpLkyxpRl20r2rBDb+RV2ASoJszSTyt0vrOuxC9F24GXaVLtPMe33r7UpRay1Vo10ORoLqPUgbwvlDvVdj7dLbqxnAr5Py-mAolbC8Fbqso8lhcyyF0L4MkhJFlNcR4h30EhFlcsVZKQgDQ4eYQx5Tw4abC2AjWVEzuEpJiNUg5rSfQAKRlDWFkMlqrOScbg7CvDlZCN7RctRy8LBrwaGpNR9MlIWNlEWBx-F6Lz1ah1HqTAkJUNZSleA98MxyP9XFIqFUVHtNvgYjJ1j8myUEpQ1pxVMr9MIsM8ikziqGKyas-ALKMZYWLGEzyWTMYsi+sWBUF9aD6gyDEL+xFTBkV8H0ooQ5BgiBKGS40EhuaOCMA6Rm2KqAtA8mY6cGQdAQhaBrrKWEWWlroFOHQRg3D2hKB5I2N66AADkZxEQxFmDwIhOmKhgBem9DrowrEtF0Ac+gOz4gDaQRQuptBEAdAMEtOKnARgDQvhQjoE7foFAUGlpg7w8vlHEpG2SMXxRxtcQZrQb8dMRZ5lqpbzHDo5Guw9gExhM2MFwDkZTqCLDYuRDzOwGXBptERgoHIxRTrnTgQpXydaQoVo8qj9HGOsfeXalpDdd7N2OWAxTEns1Mowy0l6InO70Zk7mvT1qFPN1qkA1pRnhOG4c+J0jrSKw2dRzpwLoXNOme880laYXtOGdS-J7L1KFOwO-P+eNH0aHTO6Y0Dh-aIA7P-nc5ZhTvGGMaZBZiLK+1ZOSiNz5i3uvFgeaNxaWFkphMO8N76nkFQXBfw4MA9ASBRnaAidkQ6osCsHr4HYVI6QlCLEAMgE9KGhWAIIkNuYi6jBIqB0PMVRsAdCO6HH+U1cBCBUKgXhYgovLYXZM69JAwvZYi2l3o0gWA8C3m6Z6RAto99CF9zIORrBfaMxyWIP0CsJT0PD54t94iLZJMprFambCQ0pPSBiqC-Dp1dEoEAHYEIZEQPvtxHjj-ETYFoffzqqLn9osIekBZLtIGYGwP33B4G+64K02G8NdCkSUCUjZiODzxexDibVMiw3QCLh5kFCaXwBPR2ULkKh5grDL2MmfSbwoUAMQEDjsSNlilyUrGzhwOpl7BexQUYCUicB4g-gWAGTLRx2rWYJ8kx38lCjYNYJR1rQ4JYM8kx04M8namG1ejEBJGDmvQYDSwYDCDHWoGuiJ350UOF0Z0l1Fyxj9BUNlw53p2Az0PlxA3ahcGaDHhTk3QHAFzUK3WFxWGtAMMhnjC0NFx0Kl30MMQfXakqF1HxETXRjLgHG3QYzJxJ1a0HHsLUmp2sOcPl10LZzcIcmZy7m2myQjkxgCN7VsLsKJ2A1CLCPUPUisPZ20JiNcLiLKPyPLmEJGzEH3yD1+A+CBiyGqkoUULJwNmyNl0KMslsKcKAxKJp3iN3g8Jhi8KaQOH3wY0QCkmwEvTr3JjZwCMAyCLZx6M3VyO5wKN6IA3UNiPcOl0JxGO8PGL9VANrzCHr16QlzyI0mWMxkyIF3WPCMQEiKKOiJ2NKL2MMISN51zyXUaQQJEFOBGQ1Fxi72TQ0kWI6LuOuM0keIqIiK2KiM5yRKGP2L6M+XAHAxVyynpSlEWBw3BRwwC0NzxSyhwmsCEwxV6GXxxUwGpHbhYGqjQ3pXNxHxcw03V3sz0zhXu1H1c31yAkpAszkyN2-DxJw0DEhGaHuEumODg11xjGE0DDzGFM8wt2WHFNQ2lNlNQzQwtAlKrEw0QLoyCMHCozWEpGEzrFDEk34wIxJG1OWGODQzWA01dxEzGHEyFOEwFRVJwwFXtMdOdL1PI04CNNPBNMY2tEtLhU7BtNDMo0IyDL1PoyjKuh9MjHcD9KkyjCFMd1JMlElE1IdIID2mOCDJBQzN7BVMkyPlHA9EDIeFlMrKk2rPjNbJHA3DzJJK80lDVz7JwypV31pWfl1z1XwCQioDHJNUwnQDHJSV1yKV1xvy6RYF13v3okoPzN7PgxxOExwmE2-GEzVGPPdL7Md19TjC7hbhaBchYDL2IHZiL1iia1lHoD4CbVD1nRAPwLDin35G2i0C2X8EYGuCBgGVmCiTzmQUYkYDzXHVoC0BISyBWi4S0HBWdhWwZnFF+nwB4BkBJQ0AL1KHBimSNH-IThAKJg61AvhhFFzV7gWFnRIAqxyHFAqGLWQlCD+lQCyFRAWEDga1oD4uEB4BnzOgOHiDW1fSsHfTCC-QMB-Xu0fwjWklkhkBvPvLYBhiGBUUtnyiXh5k4tkRUH0utgFiUk30YBxgWGjhmMgo0ryBaFyDLx5ibR8IsFCCJUQAIrNFoMYIrUEO4J4PRyCoikpx7W5HaLl3ePhLRJioiq7W5D5DivisFzF1SteMSqA25BjCeLStRJ50yqjmytXW5BeIyuRIV3yqyvhLbA2PSu2KGgau2ILG+WVyQBhTQ0lDdJcl1L1x0wcx5KcyRWM11w13M1ZN5Jc29PQ3dzKCC1JJQwHNwyVndDqCo3HMnOnMPywnnIMEXJIg0GXIyEolXPXPCE3Ngu3O82sFYCZLg0xD2nxJBSFNJOd3uv8AdKbKdLg2EyJRND8okyepWsWCFJ4CAA
[reserve]: https://curtcox.github.io/sheets/?format=org&view=preview&compressed=MQagKgkmAyCiBcACAEgQwM4AsBCBLAdkgMYaaIBOApupeQG6UBQjsD5AnovgK4C2ARrUS50iVPmH4ADtwAuidgHtuiEhKKZxAc0pJZmSogC8oAMIB5AHIBlMAEFLYa-COIANgWqTE+w+mXkRIbiACY+BpIysoxEim58+KKKAGaIlKgaPqj8bpQAdIgA4tzUNKKoVIi8FQDWlGEARFol6OgNBQAK5LhBohqURHVh5kSyioLkiABMAAxTAGwFdohSbuL4BFpiuCEANFyK0blaqG77sqgAHvuKkwTo3OTiQWIhdD35iKanRBTcuUgjAAqVz8AghUSyXBaTCyIT6cTGAD0Rn2-kQAHdunDjAAKVBI-gASiBRCMeWYZistgcTiQUm6QSMMzyMwAzFUCAARShSRToXCyIwARkQIV5-MF1lwAC9KCKZisMOgwJhyMoYcz3Pz0NhuCEdEKAKwzGaMKk2eyOZyY251ci6jDyo0UKbM1nCl3kKYAMSo8uFiqIbnQdiMABY8i7g6G-ZQA6oQ9h3Wz5ondXGA2aLTTrUgMQAlSgARxTioxmYVYsURdLLM91crouDtBqlZNpqDuXINWwTqMU2j3ZqHVo7rm5pAFkttJtVGLo-IAFVVopUCEjGmQopFyu3GuN4HVBkDMhBe6jZPp7m6Yh0LJulJKB1RuOpgBOO8P3BPn24S5lmKIhRJQPrxiKl45lat7btUBDmOQWgiqKsGoAQS7oEYAAcYq8CQA5iDo+BCoq9yPM88qKocBjkH+lz1MyV7UtBNpuG4RB2K0lCyJhHbMECiBFjQ9C6MeWA+IoiB1Ly3i+Ig0DQKYADk5RELE3DEcwEDSHI6D0mhYSFNg+y8IoxGYEkGL1PsGnoE+xGIPwpwUeg+waBUOhOYMqjKMR+yhOEhj8NwyTJLQnRUFIBlfrcqA6MIogYpo8iCj596iEo3CMGMUnxlId60O8+BbJQbDsPomyINwwmiJoDBiG4VDrpwUU7IgyS3MIqT4JJ+CUBiVRmZQnAkLwhgEBSk6WHYACyCAUNQhVMAAPl8ii8HyfUOYgO27Xt+0HYdR27atdimRp8irZYhyGMdd33Q9O3LYwy0ALTvR9n1fd9P2-X9X0gL9gP-SDoNgx9z2rcKUyDeZSSpMk-71GlPGPQ9q37Yqq3JOqvCBT5iQXMRoho6TiCQ4gHTRUZqiPFQxFuJw963MjZNHRje0w9juOIEiqBSLgfMhLwBBIveqCo2zd0U3YbBxYYplw4gKQLXCxG4GZX64GxytWWE0v7VM4bk4gzSlAA3NqxVCFQatQprY3iOUjnQjokxUMJ9VPS9iBLok9nyNVQhOWs+C9FLBuc1j7U81T7BjcRRaxOQYRjBcIYR-tFNdLy0XM088WZVrOuKFZiC4gWMOxPeRKR3t0c0wA67D+iiM3lcrIyt2Z1nPumJoiGUF5NQZcoPn-GE2T+OQ-Dl+pxG1+jB0cqtZutD3G-kz7eBsa9dm4HUYj4GEBBEDslAOcFoVCFLHOIGypom2v6CW0Njnri3ZCdW-awYuwQixESP8eQB0Kb9w8kPDINRHIhTCpMTe7MDrR3nvIZuuIQjATkIYMKhgQA+HYALEgbgxQSgFLIRe7MXrg2oTQgGQNaEMOoRTISS0EG3yQSbNhCDnqgDANgaAPoZpIAAAJTAACRulxNDIEYiMR2loI6GgRIQBiNQvBRCKi1H4AwpovCqAVHy2IiosiTww6UBUdRWgdF6jmwAKR5CmMkeA8BhHzAkUYYRbIJFAmEeGbxYjvR2IcU4lx753HCIAOzeNxKozBcIwLmNUaQqUspKBEiCY45xwiAB84TxFTBAMIo0EjCluIKcIrCJThFhKmBk5IjAgA
