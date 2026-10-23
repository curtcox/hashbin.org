# 01 · A Name Made of Content

| | |
|---|---|
| **Track** | Start here · deep dive (everyone; required for X3 and D1) |
| **Length** | ~10 min (1,114 spoken words) |
| **Prerequisites** | None. 00 helps. |
| **Afterwards the viewer can** | Read a 256t string's parts; explain why a hash can name content even though collisions must exist; say why tiny files are free and permanent; verify a download. |
| **Next card** | Users → U1 *Your First Upload*. Developers → D1 *First API Calls*. |

---

## Beat 1: The puzzle · ~0:00–1:10

**Scene:** `E01_Puzzle`

**Visual**
- A full 256t string fills the width of the screen, 94 characters, prefix YELLOW, body BLUE_C:
  `AAAAAABBRg2doReeYM-O5F0saH5FyWNhHN-H0k8AblA2CN3yhjRM_9xtTs3FjuawqoPa1iVinkuwwisBYRNepTWXpBBoUA`
- A counter under it: "94 characters". Then a `FILE` the size of a postage stamp beside a `FILE` drawn as a
  huge wall labeled "256 TB". Both connect to strings of the same length.
- Pigeonhole picture: on the left, an endless column of `FILE` icons scrolling upward forever (labeled
  "possible files: infinitely many"). On the right, a tall but finite column of boxes (labeled "possible
  94-character names: finite"). Arrows from files to boxes; soon two arrows land in the same box, which
  flashes RED.

**Narration**

> Here's a string of ninety-four characters. It's the name of a file on HashBin, and it would be just as long if the file were a single sentence or two hundred and fifty-six terabytes.
>
> That should bother you a little. There are only so many ninety-four character strings, a huge number, but a fixed one. And there's no limit to the number of different files. So there must be two different files that end up with the same name. You can't fit infinitely many pigeons into a finite number of holes without doubling up.
>
> And yet, the whole promise of HashBin is that the name tells you exactly what the content is. In this episode, let's take the string apart, and see how both of those things can be true at once.

---

## Beat 2: A fingerprint machine · ~1:10–2:10

**Scene:** `E01_HashMachine`

**Visual**
- `HASH MACHINE` in the center. Feed in a `FILE` labeled "The quick brown fox…". Out comes a grid of 512 cells
  (16 × 32), each a 0 or 1, BLUE_C for 1 and dark for 0.
- Feed it the same file again: identical grid; overlay the two and the cells all flash GREEN.
- Change one letter in the input (the "q" becomes "Q", highlighted YELLOW). Feed it in. The new grid appears
  beside the old. Cells that differ flash RED: about half of them. A counter reads "bits changed: 255 of 512"
  (any value near 256; use the real one from your example).
- Try to run the machine backwards: an arrow from grid back into the machine, which shakes and shows a padlock.
- Label the machine "SHA-512".

**Narration**

> The core of the name is something called a hash function. Think of it as a fingerprint machine. Feed it any data at all, and it produces a fixed-size fingerprint. HashBin uses one called SHA-512, which always produces five hundred and twelve bits.
>
> Three properties matter. First, it's deterministic: the same input always gives exactly the same fingerprint, on any computer, anywhere.
>
> Second, it's chaotic. Change a single letter, and roughly half of the output bits flip. There's no sense in which similar files get similar fingerprints. [[pause 0.6]]
>
> And third, it only runs one way. Given a fingerprint, there's no known way to work backwards to a file that produces it, other than guessing files and checking.

---

## Beat 3: Why collisions don't matter · ~2:10–4:00

**Scene:** `E01_Collisions`

**Visual**
- Return to the pigeonhole picture from Beat 1, now with the right column labeled "2^512 fingerprints".
- `MathTex`: `2^{512} \approx 1.3 \times 10^{154}`.
- Show the birthday bound: two random arrows landing in the same box. `MathTex` replaces the first:
  "expected tries to find any collision ≈ `2^{256} \approx 10^{77}`".
- A dial labeled "hashes per second" spins up to `10^{21}`, caption "≈ the whole Bitcoin network".
  A second dial for time spins to "age of the universe ≈ `4 \times 10^{17}` s".
- They multiply: `10^{21} \times 4 \times 10^{17} \approx 2^{128}`.
- A bar representing `2^{256}` stretches off screen. A tiny dot at the left end represents `2^{128}`; zoom in
  repeatedly on the dot (five or six zoom steps) and it's still a dot.
- Caption: "fraction searched ≈ 1 in 10^38".

**Narration**

> So back to our puzzle. Collisions, two files with the same fingerprint, definitely exist. The question is whether anyone could ever find one.
>
> There are two to the five hundred twelfth possible fingerprints. Because of a quirk of probability called the birthday paradox, you don't need to try anywhere near that many files to find two that match. You only need about the square root: two to the two hundred fifty-sixth tries.
>
> That still sounds like a number with no meaning, so let's give it one. Suppose you could compute a sextillion fingerprints every second, which is about what the entire Bitcoin network does today. And suppose you'd been running since the Big Bang. You'd have tried roughly two to the hundred twenty-eighth files. [[pause 0.6]] Which sounds close, until you notice it's a fraction of the job of about one in ten to the thirty-eighth. You haven't started.
>
> So the pigeonhole argument is right: collisions exist. But they're hidden in a space so large that, for every practical purpose, a fingerprint identifies exactly one file. That's the bet every content-addressed system makes, and SHA-512 gives it a very wide margin.

---

## Beat 4: Writing the fingerprint down · ~4:00–5:10

**Scene:** `E01_Base64url`

**Visual**
- The 512-bit grid from Beat 2 unrolls into a single long row of bits.
- Brackets group the bits into sixes from the left. Each group of six lights up and drops a single character
  beneath it.
- To the side, the 64-symbol alphabet in a strip: `A–Z` `a–z` `0–9` `-` `_`, with indices 0 to 63 above.
  A highlight jumps along the strip as each character is chosen.
- Count: `512 / 6 = 85.33…` → the last group is padded; result "86 characters" in BLUE_C.
- Show a standard base64 alphabet with `+` and `/` in RED, then cross them out and swap in `-` and `_`. Show
  a URL where `+` and `/` would break (a `/` splitting the path into two segments).

**Narration**

> Five hundred and twelve bits is a long row of ones and zeros, so we need a compact way to write it down. HashBin uses an encoding called base64url.
>
> Cut the bits into groups of six. Six bits can count from zero to sixty-three, so each group picks one symbol from an alphabet of sixty-four: the capital letters, the lowercase letters, the ten digits, a dash, and an underscore.
>
> Five hundred twelve divided by six is a little over eighty-five, so the fingerprint takes eighty-six characters.
>
> Why that particular alphabet? Ordinary base sixty-four uses a plus sign and a slash, and both of those mean something in a web address. Swapping them for a dash and an underscore means the string can sit in a URL exactly as it is.

---

## Beat 5: The first eight characters · ~5:10–6:40

**Scene:** `E01_LengthPrefix`

**Visual**
- Back to the full 94-character string from Beat 1. The first 8 characters slide apart from the rest and
  turn YELLOW: `AAAAAABB`.
- Below them, 6 byte cells appear (48 bits), with the bits regrouped from 6 × 8 to 8 × 6, showing that 48
  bits is exactly 8 characters with no padding.
- Decode: `AAAAAABB` → bytes `00 00 00 00 00 41` → `65`. Label: "length in bytes".
- A `ValueTracker` turns up the number in the bytes, and the YELLOW characters update live: 64 → `AAAAAABA`,
  65 → `AAAAAABB`, 90 MB → `AAAFoAAA`, then all the way up to the maximum, `________`.
- `MathTex`: `2^{48} - 1 = 281{,}474{,}976{,}710{,}655` bytes, then
  `2^{48} = 256 \times 2^{40}` → "256 tebibytes". Underline the "256" and the "t".

**Narration**

> Now look at the beginning of the string. Before the fingerprint, there are eight more characters. They aren't part of the hash. They're the file's length, in bytes.
>
> The length is stored as a six-byte number. Six bytes is forty-eight bits, and forty-eight bits is exactly eight groups of six, so it fits in eight characters with nothing left over.
>
> This file is sixty-five bytes long. Here's what the prefix looks like for a ninety-megabyte file. And here's the largest number six bytes can hold: every character is an underscore, the last symbol in the alphabet.
>
> That maximum is two to the forty-eighth bytes, minus one. Two to the forty-eighth is two hundred and fifty-six tebibytes. Two hundred fifty-six, T. [[pause 0.6]] That's the biggest file a 256t string can describe, and it's where the format gets its name.
>
> Putting the length up front is useful. Before you download anything, you know how big the file is. And if a server hands you the wrong number of bytes, you can reject it without even computing a hash.

**⚠ Before recording:** confirm the origin of the name "256t" (README, Before recording #8).

---

## Beat 6: When the content is shorter than its fingerprint · ~6:40–8:10

**Scene:** `E01_Inline`

**Visual**
- A short text `FILE`: "Hello, HashBin!" (15 bytes). Beside it, its SHA-512 fingerprint as 64 byte cells, much
  wider than the 15 cells of the text. A brace over each: "15 bytes" vs "64 bytes".
- Question mark between them. Then the fingerprint fades and the text's own bytes move into the body slot of
  a 256t string, encoded with base64url, colored GREEN_C:
  `AAAAAAAP` + `SGVsbG8sIEhhc2hCaW4h`
- Decode the prefix: `P` is index 15 in the alphabet strip; length 15.
- Under the GREEN body, the letters "Hello" line up with `SGVsbG8` to show it's just an encoding of the text.
- A slider for content length moves from 1 to 64 bytes: the GREEN body grows from 2 to 86 characters. At 65
  bytes it snaps to an 86-character BLUE hash. Draw a vertical dashed line at 64 labeled "same length either
  way".
- Three small badges pop beside the GREEN string: "free", "never expires", "can't be lost".

**Narration**

> Here's a short message: "Hello, HashBin!" It's fifteen bytes. Its fingerprint is sixty-four bytes. The fingerprint is bigger than the thing it's supposed to summarize. [[pause 0.6]]
>
> So for small content, HashBin doesn't hash at all. It puts the content itself in the string. The prefix says fifteen bytes, and the rest is just the message, encoded in the same base64url alphabet. You can even see the word "Hello" in there, in disguise.
>
> The cutoff is sixty-four bytes, exactly the size of a fingerprint. Up to that size, the content takes at most eighty-six characters, the same room a hash would take. So no string is ever longer than ninety-four characters, either way.
>
> This has a lovely consequence. When the content is inside the name, there's nothing to store. That's why these tiny files are free, and why they never expire: as long as someone has the string, they have the content. It also means you should treat the string itself as the content. If you share it, you've shared the message.

---

## Beat 7: Checking what you got · ~8:10–9:20

**Scene:** `E01_Verify`

**Visual**
- A reader (GREEN person) holds a `256T STRING`. They request it from `SANDBOX`; a `FILE` comes back.
- Step 1: the reader compares the byte count to the YELLOW prefix: GREEN check.
- Step 2: the file goes through a `HASH MACHINE`; the output is laid under the BLUE body, character by character,
  each matching pair flashing GREEN.
- Replay with a tampered file (one byte cell RED). Step 2 fails: the output diverges at the first character and
  the whole row turns RED. The file is rejected into a trash icon.
- Pull back: the same verification works when the file comes from a different source: a second server box
  labeled "anywhere else" also feeds the reader. Both pass the same check.

**Narration**

> Now we can see what "a name that can't lie" means in practice. When you fetch a file by its 256t string, you can check it yourself, in two steps. Does it have the number of bytes the prefix says? And does its fingerprint match the rest of the string?
>
> If both checks pass, you have the exact file the name was made from. If someone tampered with it, or a download got corrupted, the fingerprint won't match, and you'll know.
>
> Notice that this check doesn't care where the file came from. It could come from HashBin, from a friend, or from a completely different server. That idea, that the source doesn't matter as long as the fingerprint matches, comes back later in the series.

---

## Beat 8: Recap · ~9:20–10:00

**Scene:** `E01_Recap`

**Visual**
- The anatomy diagram assembles from the pieces used in the episode:
  - YELLOW block "8 characters: length (6 bytes) · up to 256 TB"
  - then a fork: GREEN block "≤ 64 bytes: the content itself (free, permanent)" and BLUE block "> 64 bytes:
    SHA-512 fingerprint (86 characters)".
  - Brace over the whole: "at most 94 characters, safe in a URL".
- `NEXT CARD`: U1 *Your First Upload* ("Publishing files") and D1 *First API Calls* ("Building apps").

**Narration**

> So here's the whole string. Eight characters for the length. Then either the content itself, if it's sixty-four bytes or less, or its SHA-512 fingerprint if it's longer. Never more than ninety-four characters, and safe to paste into any link.
>
> If you're here to publish files, the next episode is your first upload. If you're a developer, head to First API Calls, where we'll compute one of these strings in code and upload a file with it.
