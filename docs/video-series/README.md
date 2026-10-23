# HashBin Explained: video series

Scripts for an animated explainer series about HashBin.org, in the style of 3Blue1Brown:
curious, precise narration over clean Manim animation, where every idea is built up on screen
rather than asserted. Graphics are made with Manim. Narration can be voiced with ElevenLabs, or
locally with Kokoro-82M, which the included render pipeline uses.

- **Scripts:** [`episodes/`](episodes/), one Markdown file per episode. Each beat has scene
  directions for Manim and the narration for that beat.
- **Narration files:** [`narration/`](narration/), plain text for ElevenLabs, generated from the
  scripts by [`tools/extract_narration.py`](tools/extract_narration.py). Don't edit them by hand.
- **Scenes and rendering:** [`manim/`](manim/), one module per episode, one scene class per beat,
  built on the shared vocabulary in [`manim/hb/common.py`](manim/hb/common.py). See
  [Rendering the videos locally](#rendering-the-videos-locally).
- **Fact check:** [Before recording](#before-recording) lists places where the scripts describe
  intended behavior that production doesn't match yet. Resolve those first.

---

## Who it's for, and how the series is organized

Viewers come for different reasons. Someone who wants to share a file doesn't need OAuth; a
developer doesn't need a tour of the upload page. So the series has two short shared episodes,
then separate tracks that can be watched in any order after them.

| Track | Episodes | For |
|-------|----------|-----|
| **Start here** | 00, 01 | Everyone. 00 is the five-minute overview. 01 is the deep dive on the 256t string that every other episode builds on. |
| **Using HashBin** | U1–U4 | People who want to publish and share files. No code. |
| **Deep dives** | X1–X3 | Policies and economics: disputes, bandwidth, alternate hosts. For users, rights holders, and developers who want the details. |
| **Building on HashBin** | D1–D4 | Developers putting HashBin inside their own apps and scripts. |

### Episodes

| # | Title | Track | Length | Spoken words | One-line promise |
|---|-------|-------|--------|-------|------------------|
| [00](episodes/00-hashbin-in-five-minutes.md) | HashBin in Five Minutes | Start here | ~5 min | ~530 | What HashBin is, who pays for what, and which episode to watch next. |
| [01](episodes/01-a-name-made-of-content.md) | A Name Made of Content | Start here · deep dive | ~10 min | ~1,110 | How a 94-character string can name any file up to 256 terabytes, and why it can't lie. |
| [U1](episodes/U1-your-first-upload.md) | Your First Upload | Using HashBin | ~5 min | ~560 | Sign in, add funds, upload, share. |
| [U2](episodes/U2-what-it-costs.md) | What It Costs, and Why | Using HashBin · deep dive | ~8 min | ~880 | Price as an area: size × time × three cents. |
| [U3](episodes/U3-the-life-of-a-file.md) | The Life of a File | Using HashBin | ~5.5 min | ~590 | Retention, extending, donations, deleting, and expiry. |
| [U4](episodes/U4-who-can-see-what.md) | Who Can See What | Using HashBin | ~5 min | ~530 | The link is the key. Privacy, anonymity, and the 256t.us sandbox. |
| [X1](episodes/X1-disputes-and-public-records.md) | Disputes and Public Records | Deep dive | ~6.5 min | ~710 | How content gets reported, blocked, reviewed, and removed, in public. |
| [X2](episodes/X2-paying-for-popularity.md) | Paying for Popularity | Deep dive | ~6.5 min | ~710 | Download allowances: minimum time between requests, and what it costs to lower it. |
| [X3](episodes/X3-alternate-suppliers.md) | Anyone Can Serve It | Deep dive | ~4.5 min | ~500 | Alternate suppliers: other hosts for the same content, checked by hash. |
| [D1](episodes/D1-first-api-calls.md) | First API Calls | Building on HashBin | ~6 min | ~680 | Two domains, three ways to authenticate, and your first upload with curl. |
| [D2](episodes/D2-oauth-and-pkce.md) | Letting Apps Publish: OAuth and PKCE | Building on HashBin · deep dive | ~10.5 min | ~1,180 | Why apps never see an API key, and how PKCE proves who asked. |
| [D3](episodes/D3-building-textpad.md) | Building Textpad | Building on HashBin | ~7 min | ~780 | A complete app in one HTML file, and what immutability means for app design. |
| [D4](episodes/D4-under-the-hood.md) | Under the Hood | Building on HashBin | ~5 min | ~530 | Workers, R2, Durable Objects, nightly jobs, and an open codebase. |

Lengths assume 150 spoken words a minute, plus about a third more time for animation holds and
scripted pauses. The beat timings in each script are computed the same way, so treat them as
proportions: the real timing comes from the generated audio clips.

### Suggested viewing paths

- **"I want to share files":** 00 → U1 → U2 → U3 → U4. Then 01 if you're curious how the links work.
- **"I'm building an app":** 00 → 01 → D1 → D2 → D3. Then U2 for pricing, X2 and X3 for
  delivery, and D4 for architecture.
- **"I own content that's been posted here":** 00 → U4 → X1.
- **"I want the whole story":** in table order.

Every episode ends on a **next-episode card** that points along these paths, so a viewer who
picked a track never has to come back to this table.

### What each episode assumes

Episodes recap what they need in a sentence or two rather than requiring earlier ones. The
exceptions are stated in each script's header: X3 and D1 lean on 01 (how a 256t string is
built), and D3 assumes D2.

---

## Style guide

### Narration voice

- **One narrator**, warm and unhurried, speaking to one viewer. First person plural for working
  things out ("let's see what happens if…"), second person for instructions ("you choose…").
- **Lead with a question.** Every episode opens on a puzzle or a tension, and the payoff answers it.
- **Show, then name.** Build the idea on screen first, then give it its term. "Notice that the
  first eight characters never change… we call that the length prefix."
- **Plain, exact language.** No hype words ("revolutionary", "seamless", "blazing"). Numbers are
  exact and come from the code. Where something is a limitation, say so.
- **Invite a pause** at most once per episode: "If you want, pause here and guess what happens
  when…".
- **Narration is written to be spoken.** Numbers, symbols, and acronyms are spelled the way the
  narrator should say them, except for a few terms handled by the pronunciation file (below).

### Visual vocabulary

The same thing always looks the same, in every episode. Scene directions refer to these by
name in SMALL CAPS-style labels like `FILE` or `256T STRING`.

| Element | Look | Color |
|---------|------|-------|
| `FILE` | Rounded page with a folded corner. Zoomed in, a grid of byte cells showing hex. | WHITE outline |
| `HASH MACHINE` | Box labeled "SHA-512" with an input funnel on the left and a character stream coming out the right. | GREY_B body, BLUE output |
| `256T STRING` | Monospace text. First 8 characters are the length prefix; the rest is the body. | prefix YELLOW, hashed body BLUE_C, inline body GREEN_C |
| `HASHBIN` | Rounded panel labeled "hashbin.org": the front desk (accounts, payments, uploads, API). | BLUE_D |
| `SANDBOX` | Dashed-outline box labeled "256t.us": where content is served. | TEAL_C |
| `BINS` | A wall of small labeled drawers, each labeled with a truncated 256t string. Storage (R2). | GREY_C |
| `BALANCE` | Horizontal bar with a dollar readout (`DecimalNumber`). | GOLD |
| `TIMELINE` | Horizontal axis in months. Expiration is a vertical RED line. | WHITE axis |
| `COST AREA` | Rectangle on size (vertical) × months (horizontal) axes; its area is the price. | GOLD fill, 40% opacity |
| People | Simple original characters: a circle head on a rounded body, two dot eyes. Uploader BLUE, reader GREEN, developer PURPLE, reporter ORANGE, moderator GREY. (Don't use 3Blue1Brown's Pi creatures; they're his.) | as listed |
| `APP` | A phone or browser window frame with the app name in the title bar. | PURPLE_B |
| `STATUS CHIP` | Rounded pill with an HTTP status code: 200, 404, 410, 429, 451. | 200 GREEN, 404/410 GREY, 429 ORANGE, 451 RED |
| `NEXT CARD` | End card: two or three episode thumbnails with titles, the recommended one larger. | |

### Manim conventions

- **Manim Community Edition** (v0.18 or later). Background `#0F1117`, near-black with a slight
  blue. Text in `Tex`/`MathTex` for math, a monospace font (JetBrains Mono or Fira Mono) for
  identifiers, URLs, and code, and one sans font for labels.
- **Objects persist and transform.** Prefer `Transform`, `ReplacementTransform`, and `TransformMatchingShapes`
  over cutting to a new frame. A beat that starts with a fresh scene says so.
- **One idea moves at a time.** Dim everything not under discussion to 30% opacity.
- **Numbers count.** Prices, sizes, and durations change with `ValueTracker` + `DecimalNumber`,
  never by swapping text.
- **Code on screen** uses `Code` objects with the monospace font, at most 12 lines visible,
  with the line under discussion highlighted.
- **UI is drawn, not recorded.** Screens from hashbin.org are simplified Manim mock-ups in the
  series palette, so the videos don't date when the site's styling changes. A beat marked
  *optional screen capture* can use a real recording instead.
- **Scene names** in the scripts (`Scene: E01_LengthPrefix`) are suggested Manim class names, one per beat.
  The episode prefix keeps them unique across the series.
- **Timing:** generate each beat's narration as its own clip (see below), then set each scene's
  `run_time` and `wait` calls to fit the clip. The time ranges in the scripts are estimates.

### Script format

Each episode file has a header table (track, length, prerequisites, what the viewer will be able
to do afterwards, the next-episode card), then numbered beats:

```markdown
## Beat 3: The length prefix · ~1:40–2:50

**Scene:** `E01_LengthPrefix`

**Visual**
- What appears, what moves, what's highlighted, in order.

**Narration**

> Spoken text. Only narration uses blockquotes, so the extractor can find it.
```

Rules the extractor relies on:

- Narration is every blockquote line (`> `) in the file, and nothing else is a blockquote.
- Each `## Beat` heading starts a new clip.
- `[[pause 1.5]]` inside narration becomes a timed break (seconds) in the ElevenLabs text.

---

## Producing the audio

```bash
python3 docs/video-series/tools/extract_narration.py
```

That rewrites `narration/<episode>.txt` for every script. Options:

- `--per-beat`: also write `narration/<episode>/<NN>-<beat-slug>.txt`, one file per beat, for
  generating one clip per Manim scene (recommended for timing).
- `--no-breaks`: leave out the `<break time="…"/>` tags, for ElevenLabs models that don't
  support them (the newest expressive models use different pause tags; paragraph breaks still
  work everywhere).
- `--no-pronunciations`: keep terms as written instead of applying
  [`tools/pronunciations.json`](tools/pronunciations.json).

### Pronunciation

The scripts write a few terms the way they appear on screen (`256t`, `256t.us`, `PKCE`). The
extractor replaces them with spoken forms from `tools/pronunciations.json`, for example
`256t` → "two-fifty-six T" and `PKCE` → "pixie". If the project says "256t" differently, change
it there once and regenerate. The same table can be loaded into an ElevenLabs pronunciation
dictionary instead.

### Voice settings (starting point)

A single consistent voice across all episodes, moderate stability (around 0.5) so questions sound
like questions, style exaggeration low. Generate per beat, keep the same voice and settings for the
whole series, and regenerate a beat rather than splicing words.

---

## Rendering the videos locally

The repository can produce finished, narrated videos with no cloud services: Kokoro-82M voices
each beat, Manim draws it, and ffmpeg joins the beats into one MP4 per episode.

One-time setup (macOS; needs Homebrew, `uv`, and `ffmpeg`):

```bash
brew install espeak-ng cairo pango pkgconf ffmpeg
brew install --cask font-jetbrains-mono
cd docs/video-series
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro soundfile manim pip \
  "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
```

Then, from `docs/video-series`:

```bash
.venv/bin/python tools/voice_kokoro.py           # build/audio/<episode>/<NN>.wav + word timings
.venv/bin/python tools/render_videos.py          # build/videos/<episode>.mp4 at 1080p30
.venv/bin/python tools/render_videos.py u2 --low # quick 480p preview of one episode
tools/contact_sheet.sh build/videos/U2-what-it-costs.mp4 sheet.png 12  # frames for review
```

- **Voice:** Kokoro's `af_heart` at speed 0.9 (about 150 words a minute). Change it with
  `--voice` and `--speed`. The same `pronunciations.json` applies. `[[pause N]]` becomes N seconds
  of silence, and paragraphs are separated by 0.7 s.
- **Timing:** Kokoro reports when each word is spoken, so scenes cue animations to phrases
  (`self.at("the phrase", ...)`) instead of guessing durations. Each beat is as long as its
  narration plus a 1.2 s tail. The renderer prints `CUE MISSING` if a phrase isn't found and
  `OVERRUN` if animations run late, so rerun it after editing narration.
- **Soundtrack:** each episode's audio is assembled from the Kokoro clips, each placed at the exact
  frame its scene starts, then brought to -16 LUFS with one fixed gain and a peak limiter. (Joining
  the scenes' own audio with ffmpeg's concat demuxer drops each beat's silent tail, so narration
  drifts ahead of the picture by about a second per beat.) To rebuild the joined videos without
  re-rendering scenes, add `--join-only`.
- **Layout check:** `--audit` (best with `--low`) renders the scenes and, after every animation,
  prints a `LAYOUT` line for text past the frame edge, text on text, text sticking out of its
  box, and text under a filled shape or crossed by a line. Most remaining findings are deliberate
  (closed doors, cross-outs, a redaction bar), so look at the frame before changing anything.
  A pointer marks itself `audit_ignore`, since it's meant to sit on what it clicks.
- **Rebuilding:** unchanged beats aren't re-voiced. `build/` is ignored by git.
- **No LaTeX needed:** math is set with `Text` (exponents are composed by `Expr`), so the scenes
  render without a TeX installation.

## Facts the scripts rely on

All numbers come from the code as of commit `1cad836` (2026-10-23). If any of these change,
search the scripts for the value.

| Fact | Value | Source |
|------|-------|--------|
| Storage price | $0.03 per GiB per month, bought in whole months, rounded up to the next cent, minimum one cent | `src/utils/pricing.js` |
| Free content | 64 bytes or less, stored inside the 256t string | `src/utils/pricing.js`, `frontend/js/hash256t.js` |
| 256t string | 8-character length prefix (6-byte big-endian length) + 86 characters (SHA-512 or inline content), base64url, at most 94 characters | `frontend/js/hash256t.js` |
| Largest size a 256t string can describe | 2⁴⁸ − 1 bytes (prefix `________`), about 256 tebibytes | 6-byte length prefix |
| Upload limit | 90 MB per file | `src/utils/upload-limits.js` |
| Deposits | $1.00 minimum; card fee 2.9% + 30¢, added on top ($1.00 credit costs $1.33; $10.00 costs $10.59) | `src/utils/pricing.js` |
| Refunds | None; balances can't be withdrawn | Terms, deposit page |
| Re-uploading existing content | Adds the chosen months to its expiration and charges for them; deleted content returns 410 and can't be re-uploaded | `src/api/content.js` |
| Donations | Anyone, by card, no account; $1.00 minimum; buys whole months; capped at 100 years per donation | `src/utils/pricing.js` |
| Disputes | Content blocked with 451 while open; expire after 30 days unresolved; new dispute on the same content blocked for 30 days after one closes; 10 reports per IP per hour; outcomes: under review, denied, upheld (taken down) | `src/durable-objects/dispute-record.js`, STATUS S10 |
| Repeat infringers | One strike per upheld copyright removal; operator alert at 3 strikes in 365 days | STATUS S14 |
| Download allowance | Minimum time between requests (MTBR) per content; new uploads: one request per 30 days for their first 30 days; after that, none unless purchased; lowest active MTBR wins; minimum 100 ms; $0.02 per GiB of maximum possible transfer | `src/durable-objects/content-metadata.js`, `src/utils/rate-limit-pricing.js` |
| 256t.us per-IP limit | 30 requests per minute per IP | `workers/256t-content/src/index.js` |
| Alternate suppliers | Up to 20 per account; single-CID or group (e.g. a GitHub folder); every CID checked for size and hash on scan; public | `src/api/suppliers.js`, `src/utils/supplier-scanning.js` |
| API keys | Up to 25; format `hb_` + 32 characters; expire within at most 5 years (default 1); headers `Authorization: ApiKey …` or `X-API-Key` | `src/auth/utils.js`, `src/durable-objects/user-profile.js` |
| OAuth | Authorization code + PKCE (S256 only); code 10 min; access token 1 h; refresh token 30 days, rotated; scopes `content:write`, `content:read`, `balance:read`; optional monthly spending limit per app; publish only | `src/api/oauth.js` |
| App-published retention | The user's default (1, 3, 6, or 12 months; 1 if unset) | account page, `src/api/content.js` |
| Backups | Nightly metadata snapshots, 30 kept | STATUS L10 |

---

## Before recording

The scripts describe how HashBin is meant to work. In these places production doesn't match yet.
Items 1, 2, 4, and 8 are marked in the scripts with a ⚠ note under the affected beat. Fix the code
or change the narration before recording that episode.

1. **X2 (Paying for Popularity): per-content allowances aren't enforced on 256t.us** (STATUS B9). The MTBR
   check and the purchase API exist, and the info page shows the allowance, but the 256t.us
   worker that serves every production download only applies the per-IP limit (30 a minute). The
   MTBR check runs only in hashbin.org's own download handler (`handleDownloadContent`), which
   answers only in local development. Separately, the defaults deserve a second look before you
   explain them on camera: one request per 30 days for the first month, then none, applies to each
   file globally, and the 256t.us worker runs on every request (it doesn't use Cloudflare's cache),
   so once enforced, a new file could be downloaded about once a month in total.
   **Recommendation:** hold X2 until the intended model is settled and enforced.
2. **X3 (Anyone Can Serve It): fallback to alternate suppliers isn't live** (STATUS B10). Registering, scanning,
   and listing suppliers work in production. Redirecting or proxying a download to a supplier when
   HashBin can't serve it is in the same local-only download handler, so 256t.us doesn't do it.
   Beat 5 is marked; the rest of the episode is accurate today.
3. **Fixed: expired disputes now unblock content** (STATUS S15). Before the fix, closing an
   expired dispute left the `.disputed` marker in R2, so 256t.us kept answering 451. X1 Beat 4 is
   accurate once the fix is deployed.
4. **X1 and U3: cached copies outlive a block or deletion.** 256t.us sends every successful
   response with `Cache-Control: public, max-age=31536000, immutable`. The worker doesn't use
   Cloudflare's cache, so the network itself won't keep serving a removed file, but a browser or shared
   proxy that already fetched it may keep showing its copy for up to a year. The scripts say a deleted
   or blocked link "stops working", which is true for anyone without a cached copy, and U3 notes that
   people who downloaded a file keep it. Also confirm no Cloudflare Cache Rule caches 256t.us at the
   edge; if one does, purge `https://256t.us/{cid}` on deletion, takedown, and new disputes.
5. **Fixed: pricing page and FAQ examples** (STATUS S16) now match billing, and use only sizes
   that can be uploaded.
6. **Fixed: retention wording.** The docs now say whole calendar months, matching billing, as
   the scripts do.
7. **Sign-in providers.** The scripts avoid listing providers ("an account you already have,
   such as Google"). If you'd rather name them, confirm which are enabled in the production
   Clerk instance first.
8. **The name "256t".** Episode 01 connects the name to the 256-tebibyte maximum a 6-byte length
   prefix can describe. Confirm that's the intended origin, or change Beat 4's last lines.
9. **Launch state.** The scripts are written as if HashBin is launched: no beta banner, live
   sign-in keys, final legal pages. Don't publish them until the launch blockers in
   [STATUS.md](../../STATUS.md) are closed.
