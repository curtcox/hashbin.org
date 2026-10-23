"""D3 · Building Textpad"""

from hb.common import *

VALIDATE = '''function isValid256t(cid) {
  if (!/^[A-Za-z0-9_-]{8,94}$/.test(cid)) {
    return false;
  }
  const length = contentLength(cid);
  const expectedRest = length <= 64 ? Math.ceil((length * 4) / 3) : 86;
  return cid.length - 8 === expectedRest;
}'''

SAVE = '''const response = await api("/api/content", {
  method: "POST",
  headers: { "content-type": "text/plain; charset=utf-8" },
  body: text
});
...
setUrlHash(`#256t=${result.cid}`);'''


class Ep(Beat):
    EPISODE = "D3-building-textpad"


def textpad(text="Hello from Textpad! Edit me, then click Save.", width=6.0, height=3.2):
    window = AppWindow("Textpad", width, height)
    area = RoundedRectangle(corner_radius=0.08, width=width - 0.6, height=height - 1.4, color=GREY_C, fill_color=BG, fill_opacity=1)
    area.next_to(window.bar, DOWN, buff=0.25)
    body = T(text, 18).move_to(area).align_to(area, UL).shift(DR * 0.2)
    save = button("Save", PURPLE_B, 16).next_to(area, DOWN, buff=0.15).align_to(area, RIGHT)
    window.add(area, body, save)
    window.area, window.body, window.save = area, body, save
    return window


def address_bar(text, width=11.0):
    if len(text) > 70:
        text = text[:69] + "…"
    box = RoundedRectangle(corner_radius=0.2, width=width, height=0.55, color=GREY_B, fill_color=PANEL_BG, fill_opacity=1)
    label = M(text, 18).move_to(box).align_to(box, LEFT).shift(RIGHT * 0.3)
    return VGroup(box, label)


class D3_Hook(Ep):
    BEAT = 1

    def build(self):
        pad = textpad().move_to(UP * 1.2)
        self.at("Content on HashBin can never change", FadeIn(pad), rt=0.8)
        self.at("how do you build a text editor", Indicate(pad.body), rt=0.6)
        frames = VGroup()
        for i, words in enumerate(("Hello from Textpad!", "Hello from Textpad, again!", "Hello, final draft.")):
            frame = VGroup(RoundedRectangle(corner_radius=0.08, width=3.4, height=1.0, color=GREY_B),
                           T(f"v{i + 1}", 18, GREY_A), S256(name_256t(words.encode()), 12, truncate=16))
            frame[1].next_to(frame[0].get_top(), DOWN, buff=0.1)
            frame[2].next_to(frame[1], DOWN, buff=0.1)
            frames.add(frame)
        frames.arrange(RIGHT, buff=0.3).move_to(DOWN * 1.8)
        self.at("Textpad is HashBin's example answer", FadeIn(frames[0], shift=UP * 0.2), Indicate(pad.save, color=PURPLE_A), rt=0.6)
        self.go(FadeIn(frames[1], shift=UP * 0.2), rt=0.5)
        self.go(FadeIn(frames[2], shift=UP * 0.2), rt=0.5)
        cap = caption("Every save is a new name.", size=28, color=YELLOW)
        self.at("single HTML file", FadeIn(cap), rt=0.6)
        self.at("walk through the decisions", Indicate(frames, color=WHITE, scale_factor=1.03), rt=0.8)


class D3_Fragment(Ep):
    BEAT = 2

    def build(self):
        first = name_256t(b"Hello from Textpad! Edit me, then click Save.")
        bar = address_bar(f"hashbin.org/docs/textpad/app#256t={first}").move_to(UP * 2.8)
        self.at("where to keep the document's name", FadeIn(bar), rt=0.6)
        label = bar[1]
        split = label.text.index("#")
        hash_part = label[split:]
        self.at("after a hash sign", Indicate(hash_part, color=YELLOW, scale_factor=1.05), rt=0.8)
        server = VGroup(RoundedRectangle(corner_radius=0.15, width=2.6, height=1.2, color=GREY_B), T("server", 20, GREY_A))
        server[1].move_to(server[0])
        server.move_to(LEFT * 4.2 + UP * 0.6)
        browser = VGroup(RoundedRectangle(corner_radius=0.15, width=3.4, height=1.2, color=BLUE_B), T("stays in the browser", 20, BLUE_B))
        browser[1].move_to(browser[0])
        browser.move_to(RIGHT * 3.6 + UP * 0.6)
        before = label[:split].copy()
        after = hash_part.copy()
        self.at("the fragment", FadeIn(server), FadeIn(browser), rt=0.6)
        self.at("never send it to any server", before.animate.scale(0.6).move_to(server).shift(DOWN * 0.8),
                after.animate.scale(0.6).move_to(browser).shift(DOWN * 0.8), rt=1.0)
        self.at("change it without reloading", FadeOut(before), FadeOut(after), rt=0.4)

        pad = textpad(width=6.0, height=2.6).move_to(DOWN * 1.6 + LEFT * 2.8)
        self.at("the address bar always names exactly", FadeOut(server), FadeOut(browser), FadeIn(pad), rt=0.6)
        second_text = "Hello, second version."
        second = address_bar(f"hashbin.org/docs/textpad/app#256t={name_256t(second_text.encode())}").move_to(bar)
        new_body = T(second_text, 18).move_to(pad.body, aligned_edge=UL)
        self.at("Save, and the address bar switches", Indicate(pad.save, color=PURPLE_A), Transform(pad.body, new_body), rt=0.6)
        self.go(Transform(bar, second), rt=0.6)
        back = VGroup(T("←", 40, WHITE), T("Back", 20, GREY_A)).arrange(DOWN, buff=0.05).move_to(RIGHT * 4.0 + DOWN * 1.2)
        self.at("Back button", FadeIn(back), rt=0.4)
        old = address_bar(f"hashbin.org/docs/textpad/app#256t={first}").move_to(bar)
        old_body = T("Hello from Textpad! Edit me, then click Save.", 18).move_to(pad.body, aligned_edge=UL)
        self.go(Indicate(back[0]), Transform(bar, old), Transform(pad.body, old_body), rt=0.8)
        history = T("Version history, for free.", 26, YELLOW).next_to(back, DOWN, buff=0.4)
        self.at("Version history, for free", FadeIn(history), rt=0.6)


class D3_Validate(Ep):
    BEAT = 3

    def build(self):
        code = CodeBlock(VALIDATE, "javascript", size=17).move_to(UP * 1.9)
        self.at("doesn't immediately ask HashBin", FadeIn(code), rt=0.6)
        self.at("checks the string itself", code.highlight_line(0), rt=0.4)
        self.at("Only the base64url alphabet", code.highlight_line(1), rt=0.4)
        self.at("how long it should be", code.highlight_lines(4, 6), rt=0.5)

        full = S256(EXAMPLE_CID, 16).move_to(DOWN * 0.9)
        self.at("a link that got cut off", code.clear_highlight(), FadeIn(full), rt=0.5)
        torn = full[74:]
        self.go(torn.animate.shift(DOWN * 0.6 + RIGHT * 0.3).rotate(-0.2).set_opacity(0), rt=0.8)
        info = VGroup(T("prefix: 65 bytes → expect 86 more characters", 20, YELLOW), T("66 present", 20, RED)).arrange(RIGHT, buff=0.5)
        info.next_to(full, DOWN, buff=0.35)
        self.go(FadeIn(info), rt=0.5)
        message = T("…isn't a valid 256t string. Check that the link was copied completely.", 18, RED).next_to(info, DOWN, buff=0.2)
        self.at("useful message", FadeIn(message), rt=0.6)
        self.at("sixty-four bytes or less, Textpad doesn't fetch anything", FadeOut(VGroup(full, info, message)), rt=0.4)
        small = b"Meet at the cafe at noon. Bring the notes from the last meeting."[:45]
        inline = S256(name_256t(small), 20).move_to(DOWN * 1.0)
        decoded = T(f'"{small.decode()}"', 20, GREEN).next_to(inline, DOWN, buff=0.3)
        no_net = T("prefix: 45 bytes · no network request", 18, GREY_A).next_to(decoded, DOWN, buff=0.2)
        self.go(FadeIn(inline), rt=0.4)
        self.at("decodes it right there", FadeIn(decoded, shift=DOWN * 0.2), FadeIn(no_net), rt=0.8)


class D3_Outcomes(Ep):
    BEAT = 4

    def build(self):
        pad = AppWindow("Textpad", 2.6, 1.8).move_to(LEFT * 5.4)
        sandbox = Sandbox(2.2, 1.4).move_to(LEFT * 1.8)
        fetch = Arrow(pad.get_right(), sandbox.box.get_left(), buff=0.1, color=PURPLE_B)
        self.at("fetches the bytes", FadeIn(pad), FadeIn(sandbox), GrowArrow(fetch), rt=0.6)
        outcomes = [("network failure", GREY_B, "Couldn't reach HashBin to load this text…"),
                    ("404", GREY_B, "Nothing is stored under this 256t string. It may have expired\nor been deleted, or it was never saved."),
                    ("451", RED, "This text is unavailable while a dispute about it is reviewed."),
                    ("429", ORANGE, "HashBin is limiting how often this text can be downloaded.\nTry again later."),
                    ("200, not text", YELLOW, "This 256t string points to content that isn't text…")]
        rows = VGroup()
        for code_, color, text in outcomes:
            rows.add(VGroup(T(code_, 18, color, weight=BOLD), T(text, 15, GREY_A)).arrange(DOWN, aligned_edge=LEFT, buff=0.06))
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.25).move_to(RIGHT * 3.6 + DOWN * 0.1)
        for i, cue in enumerate(("No network", "Four oh four", "Four fifty-one", "Four twenty-nine")):
            self.at(cue, FadeIn(rows[i], shift=LEFT * 0.2), rt=0.4)
        self.at("Even a success needs checking", FadeIn(rows[4], shift=LEFT * 0.2), rt=0.5)
        grid = ByteGrid(b"Hi\x00\x07\xff", cols=5, cell=0.4, text_size=12).move_to(LEFT * 1.8 + DOWN * 2.0)
        grid.cells[2][0].set_fill(RED_E, 1)
        utf = T("decoded strictly as UTF-8", 18, GREY_A).next_to(grid, UP, buff=0.15)
        self.at("strictly as UTF-8", FadeIn(grid), FadeIn(utf), rt=0.5)
        nul = T("NUL", 16, RED).next_to(grid.cells[2], DOWN, buff=0.08)
        self.at("null character", FadeIn(nul), Indicate(grid.cells[2], color=RED), rt=0.6)
        cleared = T("editor cleared\nbefore loading", 16, YELLOW).next_to(pad, DOWN, buff=0.2).align_to(pad, LEFT)
        self.at("clears the editor before loading", FadeIn(cleared), rt=0.5)
        self.at("never the previous document", Indicate(cleared, color=YELLOW), rt=0.6)


class D3_Draft(Ep):
    BEAT = 5

    def build(self):
        pad = textpad("A long paragraph the user just wrote…", 5.4, 2.6).move_to(LEFT * 3.6 + UP * 1.4)
        self.go(FadeIn(pad), rt=0.5)
        consent = panel(3.6, 1.8, "hashbin.org").move_to(RIGHT * 4.0 + UP * 1.4)
        consent.add(VGroup(button("Approve", GREEN_D, 14), button("Deny", GREY_D, 14)).arrange(RIGHT, buff=0.2).move_to(consent.rect).shift(DOWN * 0.2))
        away = Arrow(pad.get_right(), consent.get_left(), buff=0.15, color=GREY_B)
        self.at("sends the user away", GrowArrow(away), FadeIn(consent), rt=0.6)
        gone = T("memory: gone", 18, RED).next_to(pad, DOWN, buff=0.15)
        self.at("anything only in memory is gone", FadeIn(gone), pad.body.animate.set_opacity(0.2), rt=0.6)
        self.at("click Save and lose", Wiggle(pad.save), rt=0.6)

        box = VGroup(RoundedRectangle(corner_radius=0.12, width=4.2, height=1.6, color=GOLD, fill_color=PANEL_BG, fill_opacity=1),
                     VGroup(T("sessionStorage", 20, GOLD, weight=BOLD), T("editor text · current string · last saved text", 14, GREY_A),
                            M("state = r4Nd0m…", 16, YELLOW)).arrange(DOWN, buff=0.1))
        box[1].move_to(box[0])
        box.move_to(LEFT * 3.6 + DOWN * 1.8)
        self.at("saves a draft in the browser's session storage", FadeOut(gone), pad.body.animate.set_opacity(1), FadeIn(box, shift=DOWN * 0.2), rt=0.8)
        self.at("labeled with the state value", Indicate(box[1][2], color=YELLOW), rt=0.6)
        ret = M("?code=…&state=r4Nd0m…", 18, YELLOW).move_to(RIGHT * 3.4 + DOWN * 0.6)
        self.at("the same state value finds the draft", FadeIn(ret), rt=0.5)
        link = Arrow(ret.get_left(), box.get_right(), buff=0.1, color=YELLOW)
        self.go(GrowArrow(link), rt=0.5)
        self.at("restored exactly", Indicate(pad.body, color=GREEN), rt=0.6)
        deny = VGroup(M("?error=access_denied", 16, GREY_A),
                      T("You didn't approve Textpad on HashBin,\nso nothing was saved.", 16, ORANGE)).arrange(DOWN, buff=0.1)
        deny.move_to(RIGHT * 3.4 + DOWN * 2.3)
        self.at("if the user declines", FadeIn(deny[0]), Indicate(consent[-1][1]), rt=0.5)
        self.at("nothing was saved", FadeIn(deny[1]), rt=0.5)


class D3_Save(Ep):
    BEAT = 6

    def build(self):
        code = CodeBlock(SAVE, "javascript", size=17).move_to(UP * 2.0)
        self.at("Saving is one request", FadeIn(code), code.highlight_lines(0, 4), rt=0.6)
        hb = HashBinPanel(2.6, 1.4).move_to(RIGHT * 4.4 + DOWN * 1.2)
        balance = Balance(4.21, 5.0, width=2.0).move_to(LEFT * 4.6 + DOWN * 1.0)
        self.at("retention period the user chose", FadeIn(hb), FadeIn(balance), rt=0.5)
        self.at("billed to their balance", balance.animate_to(4.20), rt=0.6)
        short = T("≤ 64 bytes: free", 20, GREEN).next_to(balance, DOWN, buff=0.3)
        self.at("Short texts", FadeIn(short), rt=0.4)
        low = VGroup(T("Not enough balance: 3¢ needed.", 18, ORANGE), T("Add funds →", 18, BLUE_B)).arrange(RIGHT, buff=0.3)
        low.move_to(DOWN * 1.2)
        self.at("If the balance is too low", FadeIn(low[0]), rt=0.5)
        self.at("a link to add funds", FadeIn(low[1]), rt=0.4)
        self.at("puts the new string in the address bar", FadeOut(low), code.highlight_line(6), rt=0.5)
        users = VGroup(Person(BLUE, height=0.6), Person(GREEN, height=0.6)).arrange(DOWN, buff=0.6).move_to(LEFT * 1.6 + DOWN * 2.6)
        same = T('"See you at six."', 18).next_to(users, RIGHT, buff=0.3)
        cid = S256(name_256t(b"See you at six."), 16)
        cid.next_to(same, RIGHT, buff=0.3)
        self.at("exactly the same text", FadeOut(short), FadeIn(users), FadeIn(same), rt=0.5)
        self.at("exactly the same link", FadeIn(cid), rt=0.5)


class D3_Connection(Ep):
    BEAT = 7

    def build(self):
        pad = textpad(width=6.4, height=3.0).move_to(LEFT * 3.0 + UP * 0.8)
        status = VGroup(T("Connected to HashBin · Balance $4.21 ·", 16, GREEN), T("Disconnect", 16, BLUE_B)).arrange(RIGHT, buff=0.15)
        status.next_to(pad.bar, DOWN, buff=0.05)
        pad.area.shift(DOWN * 0.15)
        self.go(FadeIn(pad), rt=0.5)
        self.at("shows the user's balance", FadeIn(status), rt=0.5)
        chain = VGroup(*[Rectangle(width=0.3, height=0.25, stroke_color=GREEN, fill_color=GREEN, fill_opacity=0.4) for _ in range(8)])
        chain.arrange(RIGHT, buff=0.03).next_to(pad, DOWN, buff=0.3)
        self.at("renews access in the background", LaggedStart(*[FadeIn(c) for c in chain], lag_ratio=0.15), rt=1.0)
        revoke = M("POST /oauth/revoke", 18, RED).next_to(chain, DOWN, buff=0.25)
        self.at("A Disconnect button", Indicate(status[1], color=RED), FadeIn(revoke), FadeOut(chain), rt=0.6)
        msg = T("Your HashBin connection has ended.\nClick Save to connect again.", 16, ORANGE).next_to(revoke, DOWN, buff=0.2)
        self.at("revokes Textpad from their HashBin account", FadeIn(msg), rt=0.5)
        self.at("offers to reconnect", Indicate(pad.save, color=PURPLE_A), rt=0.5)
        phones = VGroup()
        for name in ("Expo", "Flutter"):
            phone = AppWindow(f"Textpad · {name}", 2.0, 3.6, phone=True, size=14)
            sheet = RoundedRectangle(corner_radius=0.1, width=1.6, height=1.0, color=GREY_B, fill_color=GREY_E, fill_opacity=1).move_to(phone.frame).shift(DOWN * 0.3)
            phone.add(sheet, T("system browser", 12, GREY_A).move_to(sheet))
            phones.add(phone)
        phones.arrange(RIGHT, buff=0.5).move_to(RIGHT * 4.2 + UP * 0.4)
        self.at("building for phones", FadeIn(phones[0]), rt=0.5)
        self.at("Expo and in Flutter", FadeIn(phones[1]), rt=0.5)
        self.at("system browser", Indicate(VGroup(*phones[0][-2:], *phones[1][-2:]), color=WHITE), rt=0.5)
        secure = VGroup(padlock(GREY_A, 0.35), T("secure storage", 18, GREY_A)).arrange(RIGHT, buff=0.15).next_to(phones, DOWN, buff=0.3)
        self.at("secure storage", FadeIn(secure), rt=0.5)


class D3_Recap(Ep):
    BEAT = 8

    def build(self):
        lessons = ["The link names a version, not a document.", "Validate the string before fetching.", "Explain every status.",
                   "Save the user's work before redirecting."]
        cards = VGroup()
        for text in lessons:
            card = VGroup(RoundedRectangle(corner_radius=0.12, width=8.4, height=0.7, color=PURPLE_B, fill_color=PANEL_BG, fill_opacity=1),
                          T(text, 24))
            card[1].move_to(card[0])
            cards.add(card)
        cards.arrange(DOWN, buff=0.2).move_to(UP * 1.2)
        for card, cue in zip(cards, ("A link names a version", "Check strings before you fetch", "Turn every status into a sentence",
                                     "never let a sign-in redirect")):
            self.at(cue, FadeIn(card, shift=UP * 0.2), rt=0.5)
        docs = M("hashbin.org/docs/textpad", 20, BLUE_B).next_to(cards, DOWN, buff=0.3)
        self.at("The whole source", FadeIn(docs), rt=0.5)
        card = NextCard(("D4", "", True), ("X3", "", False)).scale(0.55).to_edge(DOWN, buff=0.2)
        self.at("machinery behind HashBin", FadeIn(card), rt=0.8)
