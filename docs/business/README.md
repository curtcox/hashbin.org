# Opening HashBin to the public at low risk

Written 2026-10-24 for a loss budget of about **$500 a year**, with the owner in Missouri and no
umbrella policy. This is research to plan with. It is not legal, tax, or insurance advice; the
two places where a lawyer's hour is worth paying for are marked.

The numbers live in five Sheets documents. Edit any input in the Source pane and the tables
recalculate; **Share** gives a link holding your edits.

| Sheet | What it answers | Source |
|-------|-----------------|--------|
| [Legal structure, risk, insurance][legal] | LLC or not, what could go wrong, which insurance | [legal-and-insurance.org](legal-and-insurance.org) |
| [Pricing and scenarios][pricing] | What to charge, card fees, a year at several sizes, break-even | [pricing.org](pricing.org) |
| [Cash reserve][reserve] | How much cash to keep | [reserve.org](reserve.org) |
| [Fixed costs][fixed] | What the fixed costs are, where each number comes from, and what they leave out | [fixed-costs.org](fixed-costs.org) |
| [Price floor][floor] | The least HashBin can charge and still collect more than it pays Stripe and Cloudflare, counting every charge a customer can cause | [price-floor.org](price-floor.org) |

What to change so HashBin never owes Stripe and Cloudflare more than it collects (prices,
download allowances, caching, cost monitoring) is planned in
[todo/cost_safety.md](../../todo/cost_safety.md).

The `.org` files in this directory are the source of truth. The links open copies saved on
HashBin on 2026-10-24 and kept until 2027-10-25; after changing a `.org` file, republish it with
`node scripts/publish.mjs publish` (wrapped as a Sheets document) and update the link here.

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

Fixed costs are about **$80 a year** ($79.70): Workers Paid at $60, domain renewals at $17.70,
and the DMCA agent at $2 ([fixed-costs sheet][fixed]). Clerk is free up to 50,000 monthly
retained users. At $0.03 you keep about $0.013 per GB-month after R2 and the card fee, so holding
**about 504 GB of paid storage all year breaks even**. Below that, the loss is under $80, well
within budget (pricing sheet, sections 3–4). The
"Growing" scenario (1,000 paid GB) nets about **+$80 a year**, and "Busy" (20,000 GB) nets about
**+$2,900**.

1. **Stop adding the Stripe fee as a "card processing fee."** That is a credit card surcharge.
   Visa caps surcharges at 3%, bans them on debit cards, and requires 30 days' notice to your
   processor; a few states ban them outright. A $1 deposit today carries a 33% surcharge
   ($1.33). Instead, set a **$10 minimum deposit and absorb the fee** (5.9%, already in the
   break-even above), or sell fixed-price credit packs. This touches `src/utils/pricing.js`,
   `src/api/payments.js`, the deposit UI, and Terms §3.
2. **Put a budget on downloads.** Downloads cost almost nothing until something goes viral. Each
   256t.us download is a Worker request plus four uncached R2 reads, so one file downloaded 200
   million times a month costs about **$350 a month** ([price-floor sheet][floor], section 5),
   and Cloudflare has no hard spending cap. (The pricing sheet assumed one R2 read and a 50%
   cache hit rate, and put this at about $1,070 a year.) Settle STATUS
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

Still open:

- Checkout and Terms §3 describe the Stripe fee as a "card processing fee" (surcharge rules
  above). STATUS L20.
- The dispute form has no NCII category, and every dispute auto-expires after 30 days.
  STATUS L19.
- The 256t.us Worker's 30-a-minute IP limit is per instance, not global. Prepaid download
  allowances (STATUS L22) bound the cost instead.

Fixed since (2026-10):

- Cloudflare and Stripe prices now come from one place, `src/utils/cost-policy.js`. The
  stale `src/utils/cost-estimation.js` had no callers and was removed.
- Uploads, extensions and donations all cap retention at 120 months.
- Checkout charges ceil((credit + $0.30) / 0.971), so Stripe's 2.9% of the whole charge is
  covered.
- 256t.us caches downloads with the Cache API and needs fewer R2 reads per download (STATUS S22).
- Bandwidth purchases have a floor of $4 per million downloads, so small files no longer
  sell below cost (STATUS B9, L22).

## Where Sheets fell short for this job

Recorded, not yet fixed, in the Sheets repository:
`design/field-report-hashbin-money-model.md` (linked from its PLAN.md under "Field reports").

The model is split into several sheets because a single 17 KB document made a link GitHub Pages
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

[legal]: https://curtcox.github.io/sheets/#AAAAABrpEFomNngIc8qPlngN-d9m2-v5pQVXoJxTJId5GzwlxGZ2H-54tGK31lOGequdN0rNmmcGj7rQ1Co1i6k9YDI6ng
[pricing]: https://curtcox.github.io/sheets/#AAAAACWmhcqG6IBSCDuD9iXMJUIY_EZLojPuq0gDqgGrG9ECf8S3rp7q5_xtYmfl0Zh6McEx8hXR6QvUY2qBfa4xqiCU1w
[reserve]: https://curtcox.github.io/sheets/#AAAAAAqzlWh391fy5fKEJ-DHmirUJ94U4JlxDm2sevsUQtEYBo0kVBJ7O01IAvoF8rWL1q8Ot0ozMNIvOquk1AJvsTNkMg
[fixed]: https://curtcox.github.io/sheets/#AAAAABt92_XhJo04Xw3Ate2pnIl1_dNPCzyTH9skYvnHaxrXDOxmLeRWm0FllRWsNRZG2kA2QdKyeyCfb4gMBiMby0dpYQ
[floor]: https://curtcox.github.io/sheets/#AAAAAFEl6qEGaLAteXumTY90Rly1GLqcNNXWdlvvkXppO30DMC4RfwXzPvv3AZYtpeuffPU4C4LxwQo7QEw13KXYGtY45Q
