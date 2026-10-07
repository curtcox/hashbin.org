# Legal Pages: Review Checklist

`frontend/terms.html`, `frontend/privacy.html`, and `frontend/dmca.html` are **drafts** written
from this repo's decisions and code (2026-10-07). They aren't legal advice. Before launch
(STATUS.md L5–L7), fill in the placeholders, settle the policy choices, have them reviewed, then
remove the yellow "DRAFT" notice from each page.

## Placeholders

| Placeholder | Pages |
|-------------|-------|
| `[LEGAL ENTITY NAME]`, `[POSTAL ADDRESS]` | all |
| `[EFFECTIVE DATE]`, `[DATE]` | all |
| `[CONTACT EMAIL]` | Terms |
| `[PRIVACY EMAIL]` | Privacy |
| `[JURISDICTION]`, `[VENUE]` | Terms §12 |
| `[MINIMUM AGE]` (accounts), `[AGE]` (children) | Terms §2, Privacy §8 |
| `[AMOUNT]` liability cap | Terms §9 |
| `[NOTICE PERIOD]` for changes | Terms §11 |
| `[AGENT NAME]`, `[PHONE]`, `[DMCA EMAIL]`, `[REGISTRATION NUMBER]` | DMCA §4 |
| EU/UK representative and supervisory authority, if applicable | Privacy §7 |

## Policy choices to confirm

These are written to match the current code. Change the code or the text if you decide otherwise.

1. **Balance on account deletion is forfeited** (Terms §7). The code soft-deletes the profile and
   keeps the balance on it; there's no payout path.
2. **Balance when *we* close an account without cause**: `[REFUND / CREDIT POLICY]` (Terms §7).
3. **Unused balance doesn't expire** while the account is open (Terms §3). Some jurisdictions
   regulate stored-value balances; confirm this is acceptable.
4. ~~Reporter contact visibility~~ **Decided 2026-10-07:** reporter contact details stay visible
   to every signed-in user (and admins), not to anonymous visitors. Privacy §3 says so.
5. **DMCA notices auto-expire after 30 days** if not reviewed, and the content becomes available
   again (DMCA §2). Confirm that's acceptable for formal copyright notices.
6. **Repeat-infringer threshold** `[NUMBER]` upheld removals in `[PERIOD]` (DMCA §5). Safe harbor
   requires a reasonably implemented policy. Today the admin tracks this by hand via
   `GET /api/admin/actions`; automating it is STATUS.md S14.
7. **CSAM reporting** (Terms §5, Privacy §3): U.S. providers must report apparent CSAM to NCMEC
   (18 U.S.C. § 2258A). Set up a NCMEC CyberTipline account and an internal procedure.

## Ops steps outside the repo

- Register the DMCA designated agent with the U.S. Copyright Office (online directory; renew
  every 3 years) and put the registration number on `dmca.html`.
- Make sure the contact mailboxes above exist and are monitored.
