# U4 · Who Can See What

| | |
|---|---|
| **Track** | Using HashBin |
| **Length** | ~5 min (532 spoken words) |
| **Prerequisites** | 00. 01 helps for Beat 3. |
| **Afterwards the viewer can** | Explain "unlisted, not private"; decide what's safe to upload; protect sensitive files with their own encryption; say what's public about an upload and what isn't; explain why opening a 256t.us link is safe. |
| **Next card** | X1 *Disputes and Public Records* (larger). D1 *First API Calls*. |

---

## Beat 1: Unlisted, not private · ~0:00–0:30

**Scene:** `U4_Unlisted`

**Visual**
- A `FILE` in a drawer in `BINS`. Over the wall of drawers, the word "Private?" with a question mark.
- The question mark turns into a dial with two ends: "Private" on the left (a padlock) and "Public" on the right (a
  billboard). A pointer settles in between at a label: "Unlisted".
- Under the dial: "Anyone with the link can open it. No one can find it without the link."

**Narration**

> The most common question about HashBin is whether uploads are private. The honest answer is: they're unlisted. Anyone who has a file's link can open it. But nobody can find the file without the link. Both halves of that sentence matter, so let's take them one at a time.

---

## Beat 2: Nobody can find it · ~0:30–1:00

**Scene:** `U4_NoSearch`

**Visual**
- A stranger (GREY person) stands before the `BINS` wall. There's no search box, no directory, no "recent uploads"
  feed: three empty frames with those labels, each crossed out.
- The stranger tries guessing: random 94-character strings fly at the drawers and bounce off, each with a GREY 404 chip.
  A counter of attempts spins up fast while a counter of hits stays at 0.
- `MathTex` in the corner: "possible fingerprints: `2^{512}`".

**Narration**

> HashBin has no search, no directory, and no list of recent uploads. That's a deliberate design choice. The only way in is the 256t string.
>
> And you can't guess one. For anything bigger than sixty-four bytes, the string contains a five-hundred-twelve-bit fingerprint of the file. Guessing a valid one at random is hopeless, for the same reason we saw in the episode on the string itself: the space is unimaginably large.

---

## Beat 3: Anyone with the link can open it · ~1:00–2:20

**Scene:** `U4_LinkIsKey`

**Visual**
- The uploader hands a link to a friend, who forwards it to two more people, who post it on a forum. The link
  multiplies across the screen; every copy opens the same `FILE`.
- Inset 1: a short `256T STRING` in GREEN, "meet at 6". The text is visible right inside the string,
  decoded beneath it. Caption: "≤ 64 bytes: the link *is* the content".
- Inset 2: someone who already has a copy of a file computes its 256t string with a `HASH MACHINE`, then asks
  HashBin "is this here?" and gets back "yes". Caption: "having the file lets you check whether it's here".
- A key icon forms around the link: "Treat the link like a password."

**Narration**

> Now the other half. A link is easy to share, and that cuts both ways. Once you've given it to someone, they can give it to anyone else, and HashBin can't tell the difference. So treat the link like a password: share it with the people you mean to share it with.
>
> Two details follow from how the string is built. Tiny files, sixty-four bytes or less, are stored inside the link itself. So anyone who sees the link, in a chat log or a screenshot, has the content, without opening anything.
>
> And because the name comes from the content, anyone who already has a copy of a file can compute its name and check whether it's on HashBin. They can't discover new files that way. But they can confirm that a file they already have is there.

---

## Beat 4: Sensitive files: lock them first · ~2:20–3:00

**Scene:** `U4_EncryptFirst`

**Visual**
- A `FILE` labeled "tax-return.pdf" goes into a padlock box on the uploader's own computer before upload. What gets
  uploaded is a box of scrambled bytes; its `256T STRING` is computed from the scrambled bytes.
- The link and the key travel to the recipient on two separate paths: the link by message, the key by phone (a
  dotted line). Only where both meet does the padlock open.
- A stranger who intercepts the link alone gets scrambled bytes.

**Narration**

> So what about files that really are private? HashBin stores everything encrypted on its servers, but that's not what protects you here, because anyone with the link gets the file back in readable form.
>
> If a file is sensitive, encrypt it yourself before uploading, with any tool you trust, and send the password to the recipient a different way. HashBin then only ever holds scrambled bytes, and the link alone isn't enough.

---

## Beat 5: What's public about an upload · ~3:00–3:50

**Scene:** `U4_WhatsPublic`

**Visual**
- Two columns. Left, GREEN header "Public": size, upload date, expiration date, status (active, disputed, deleted),
  deletion records with reasons, dispute reports and their evidence.
- Right, GREY header "Not published": who uploaded it, who paid for it, their email or sign-in provider, how much
  they paid.
- A third, smaller box below: "HashBin itself knows which account uploaded what. The Privacy Policy covers when that
  can be shared."
- A line under all of it: "HashBin doesn't scan or inspect file contents."

**Narration**

> What does HashBin show the world about a file? Its size, when it was uploaded, when it expires, and its status. If it's deleted, the public records say when and why. If someone reports it, the report is public too.
>
> What it doesn't show is who uploaded it, or who paid for it. Uploaders aren't listed anywhere public. That said, unlisted isn't anonymous to HashBin itself: your account is tied to your uploads and payments, and the Privacy Policy explains when that information can be shared.
>
> HashBin also doesn't scan or inspect what you upload. It treats every file as opaque bytes.

---

## Beat 6: Why opening a link is safe · ~3:50–4:30

**Scene:** `U4_Sandbox`

**Visual**
- Two origins side by side: `HASHBIN` ("hashbin.org": your account, balance, sign-in) and `SANDBOX` ("256t.us": raw
  files only). A thick wall between them.
- An uploaded HTML `FILE` opens inside `SANDBOX`. A script inside it (a small RED gear) tries to reach over the wall
  toward the account; the gear won't even turn, labeled "scripts don't run".
- Caption: "Same idea GitHub and Google Drive use for user files."

**Narration**

> Last, a word about safety for the people opening your links. Files are served from a separate address, 256t dot U S, not from hashbin dot org, where accounts live. Browsers keep the two completely apart. On top of that, files are served with strict rules that stop scripts from running at all. So even if someone uploads a booby-trapped web page, opening it can't touch anyone's HashBin account.

---

## Beat 7: Recap · ~4:30–4:50

**Scene:** `U4_Recap`

**Visual**
- Three short lines appear: "Unlisted: the link is the key." "Encrypt sensitive files yourself." "Uploaders aren't
  published; reports and deletions are."
- `NEXT CARD`: X1 *Disputes and Public Records* (larger), D1 *First API Calls*.

**Narration**

> Unlisted, not private. The link is the key, so share it carefully, and lock sensitive files yourself. Next: what happens when someone believes a file shouldn't be on HashBin at all.
