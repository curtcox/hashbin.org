# U1 · Your First Upload

| | |
|---|---|
| **Track** | Using HashBin |
| **Length** | ~5 min (561 spoken words) |
| **Prerequisites** | 00 |
| **Afterwards the viewer can** | Sign in, add funds and read the fee, upload one or more files with a retention period, and share the right link. |
| **Next card** | U2 *What It Costs, and Why* (larger). U3 *The Life of a File*. |

UI in this episode is drawn in Manim as simplified mock-ups (README, Manim conventions). Each beat
marked *optional screen capture* can use a real recording of hashbin.org instead.

---

## Beat 1: The goal · ~0:00–0:20

**Scene:** `U1_Goal`

**Visual**
- An uploader (BLUE person) with three `FILE`s: "slides.pdf", "photo.jpg", "notes.txt".
- A dotted path leads from them to three readers on the right, each holding a `256T STRING`. The path has four
  numbered stops, empty for now: 1 Sign in · 2 Add funds · 3 Upload · 4 Share.

**Narration**

> Let's publish some files. Say you have a slide deck, a photo, and a short text note, and you want to hand out links to them. There are four steps: sign in, add funds, upload, and share. The first two you only do once.

---

## Beat 2: Sign in · ~0:20–0:50

**Scene:** `U1_SignIn` (optional screen capture)

**Visual**
- Stop 1 lights up. A mock hashbin.org header with a "Sign In" button. Click: a sign-in panel with provider
  buttons drawn as plain rounded rectangles (no logos), one labeled "Google" and the rest labeled
  "…other providers".
- Signed in: the header shows a small avatar and the dashboard sidebar slides in: Overview, API Keys, My Uploads,
  Suppliers, Add Funds, Transactions, Account Settings, Developers.

**Narration**

> HashBin doesn't have its own passwords. You sign in with an account you already have, such as Google. That gives you a dashboard, and the parts we'll use today are Add Funds and My Uploads.
>
> Remember, you only need an account to publish. The people you share links with won't need one.

---

## Beat 3: Add funds · ~0:50–1:50

**Scene:** `U1_AddFunds` (optional screen capture)

**Visual**
- Stop 2 lights up. A mock "Add Funds" form: "Credit amount: $" with an input.
- Type `1.00`. Three lines below animate: "Added to balance $1.00", "Card payment cost $0.34", "You pay $1.34". The
  card payment cost line glows briefly.
- Retype `10.00`: the numbers count to "Added to balance $10.00 · Card payment cost $0.61 · You pay $10.61".
- Pull out a small formula card: `total = ⌈(credit + 30¢) ÷ 0.971⌉` (rounded up to the cent).
- The `BALANCE` bar in the corner fills to $10.00 in GOLD.
- Small print fades in under the form: "Payments are final. Balances can't be withdrawn."

**Narration**

> Publishing is paid from a prepaid balance, so next, add some funds. The minimum is one dollar. The payment goes through Stripe, and the card payment cost is added on top and itemized before you pay: Stripe's two point nine percent of the payment plus thirty cents.
>
> That fixed thirty cents is why small deposits look expensive. A one-dollar credit costs a dollar thirty-four. A ten-dollar credit costs ten sixty-one. Either way, your balance gets the full credit amount, and a link on the page shows the arithmetic.
>
> Payments are final, and a balance can't be withdrawn. But it doesn't expire, either. It just sits there until you publish something. And as we'll see, a dollar of storage goes a long way.

---

## Beat 4: Choose files and a retention period · ~1:50–3:20

**Scene:** `U1_Upload` (optional screen capture)

**Visual**
- Stop 3 lights up. A mock upload page: "Balance: $10.00", a drop zone, a retention selector, a total.
- Drag the three `FILE`s into the drop zone. Each gets a row with a small progress bar labeled "Preparing…". As
  each bar fills, a `256T STRING` types itself into the row (truncated, with prefix YELLOW).
- "notes.txt" is 48 bytes: its string is GREEN_C and the row says "Stored inside its link, free".
- Drop "photo.jpg" in a second time: the new row shows the same string and says "Identical content, uploaded once
  for this group".
- Retention selector: buttons "1 month", "1 year", "5 years", "10 years", and a slider. Click "1 year": the
  "Total cost" `DecimalNumber` updates. Slide to 5 years and back to 1 year; the total follows.
- A small note fades in under a fourth, imaginary file labeled "120 MB": "Too large: maximum 90 MB per file", in
  RED, and its row is removed.

**Narration**

> Now the upload page. You can drop in several files at once, up to ninety megabytes each.
>
> The first thing that happens is that your browser works out each file's 256t string, on your own computer, before the file itself is sent. That's how the page knows a few things right away. The text note is so small that it fits inside its own link, so it's free. If you add the same photo twice, the page notices they're identical and uploads it once.
>
> Next, choose how long to keep the files. Retention is bought in whole months, and one period applies to every file in this upload. Pick a month, a year, five years, ten. The total updates as you go.
>
> And if one of these files was already on HashBin, maybe because someone else uploaded it, you don't store a second copy. Uploading it adds your chosen months to the existing copy's expiration date instead, at the same price.

---

## Beat 5: Upload, and what you get back · ~3:20–4:00

**Scene:** `U1_Result` (optional screen capture)

**Visual**
- Click "Upload Content". Each row's progress bar fills; the `BALANCE` bar drains by the total (a few cents).
- Transition to a mock content page for "slides.pdf": "Content ID (CID)" with a Copy button, "Size",
  "Expires in 12 months", "Expiration date", a "Download Content" button, and lower down, "Keep this content
  available" and "Report this content".
- Zoom to the Download button; its URL appears: `https://256t.us/AAAAADT_…` (truncated).
- Under the dashboard sidebar, "My Uploads" pulses; a list slides in with the three files and their expiration
  dates.

**Narration**

> Click upload, and the cost comes out of your balance: for a few ordinary files kept for a year, a few cents.
>
> Each file gets a content page. It shows the 256t string, which HashBin also calls the content ID, with a button to copy it. You'll also see the file's size, when it expires, and a download link. Everything you've uploaded is listed under My Uploads, so you don't need to keep track of the strings yourself.

---

## Beat 6: Share · ~4:00–4:40

**Scene:** `U1_Share`

**Visual**
- Stop 4 lights up. Two link cards side by side:
  - "The file": `https://256t.us/{cid}`
  - "Its page": `https://hashbin.org/info/{cid}`
- An arrow from the file link to a browser frame showing the PDF. Add `.pdf` to the end of the link: the browser
  frame's title bar updates to show it's opened as a PDF.
- An arrow from the page link to the mock content page from Beat 5.
- The three readers from Beat 1 each receive a link and open it. None of them is asked to sign in.

**Narration**

> To share a file, share its link. There are two kinds. The 256t dot U S link is the file itself. Add an extension to the end, like dot P D F, and browsers will know what kind of file to expect. The hashbin dot org info link is the content's page, where people can see how long it will be kept, and help keep it around.
>
> Whoever you send it to just opens it. No account, no sign-in, no fee.

---

## Beat 7: Recap and next · ~4:40–5:00

**Scene:** `U1_Recap`

**Visual**
- The four stops from Beat 1 check off one by one.
- `NEXT CARD`: U2 *What It Costs, and Why* (larger), U3 *The Life of a File*.

**Narration**

> Sign in, add funds, upload, share. Next, let's look closely at those few cents: where the price comes from, why tiny files are free, and how to estimate what a decade of storage would cost you.
