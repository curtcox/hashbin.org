"""U1 · Your First Upload"""

import math

from hb.common import *

MB = 1024 * 1024
FILES = [("slides.pdf", 25 * MB), ("photo.jpg", 8 * MB), ("notes.txt", 48)]


def cents(size, months):
    if size <= 64:
        return 0
    return max(1, math.ceil(size / 2 ** 30 * months * 3 - 1e-9))


def total(months):
    return sum(cents(size, months) for _, size in FILES) / 100


class Ep(Beat):
    EPISODE = "U1-your-first-upload"


class U1_Goal(Ep):
    BEAT = 1

    def build(self):
        uploader = Person(BLUE, label="you").move_to(LEFT * 5.6 + DOWN * 0.4)
        files = VGroup(*[FileIcon(name, width=0.55, height=0.7, label_size=16) for name, _ in FILES]).arrange(DOWN, buff=0.25)
        files.next_to(uploader, RIGHT, buff=0.4)
        readers = VGroup(*[Person(GREEN, height=0.75) for _ in range(3)]).arrange(DOWN, buff=0.45).move_to(RIGHT * 5.6 + DOWN * 0.4)
        strings = VGroup(*[S256(name_256t(name.encode() * 5), 13, truncate=10).next_to(r, LEFT, buff=0.2) for r, (name, _) in
                           zip(readers, FILES)])
        self.go(FadeIn(uploader), rt=0.6)
        self.at("a slide deck", FadeIn(files[0], shift=RIGHT * 0.2), rt=0.5)
        self.at("a photo", FadeIn(files[1], shift=RIGHT * 0.2), rt=0.5)
        self.at("a short text note", FadeIn(files[2], shift=RIGHT * 0.2), rt=0.5)
        self.at("hand out links", FadeIn(readers), FadeIn(strings), rt=0.8)
        path = DashedLine(LEFT * 3.4 + DOWN * 0.4, RIGHT * 3.4 + DOWN * 0.4, color=GREY_B, dash_length=0.12)
        stops = VGroup()
        for i, label in enumerate(("Sign in", "Add funds", "Upload", "Share")):
            x = -2.7 + i * 1.8
            dot = Circle(radius=0.28, color=GREY_B, stroke_width=3, fill_color=BG, fill_opacity=1).move_to([x, -0.4, 0])
            stops.add(VGroup(dot, T(str(i + 1), 22, GREY_B).move_to(dot), T(label, 20, GREY_A).next_to(dot, DOWN, buff=0.2)))
        self.at("There are four steps", Create(path), rt=0.8)
        for i, word in enumerate(("sign in", "add funds", "upload", "and share")):
            self.at(word, FadeIn(stops[i], scale=0.6), rt=0.4)
        once = VGroup(Brace(stops[:2], UP, color=BLUE_B), T("only once", 20, BLUE_B))
        once[1].next_to(once[0], UP, buff=0.08)
        self.at("The first two you only do once", FadeIn(once), stops[0][0].animate.set_stroke(BLUE), stops[1][0].animate.set_stroke(BLUE),
                rt=0.8)


class U1_SignIn(Ep):
    BEAT = 2

    def build(self):
        bar = stops_bar(active=1)
        header = Rectangle(width=12.5, height=0.7, stroke_width=0, fill_color=PANEL_BG, fill_opacity=1).move_to(UP * 2.6)
        logo = M("hashbin.org", 24, BLUE_B).move_to(header).align_to(header, LEFT).shift(RIGHT * 0.3)
        sign_in = button("Sign In", BLUE_D, 18).move_to(header).align_to(header, RIGHT).shift(LEFT * 0.3)
        mouse = pointer().move_to(DOWN * 2 + RIGHT * 2)
        self.go(FadeIn(bar), FadeIn(header), FadeIn(logo), FadeIn(sign_in), FadeIn(mouse), rt=0.8)
        no_pw = VGroup(field("Password", "••••••••", 3.4), cross_mark(RED, 0.5)).arrange(RIGHT, buff=0.3).move_to(DOWN * 0.2)
        self.at("doesn't have its own passwords", FadeIn(no_pw[0]), rt=0.6)
        self.go(Create(no_pw[1]), rt=0.4)
        self.go(FadeOut(no_pw), rt=0.4)
        self.at("an account you already have", rt=0.1)
        self.click(mouse, sign_in)
        dialog = panel(4.6, 3.0, "Sign in to HashBin")
        providers = VGroup(button("Google", GREY_D, 20, width=3.6), button("…other providers", GREY_D, 20, width=3.6)).arrange(DOWN, buff=0.3)
        providers.move_to(dialog.rect).shift(DOWN * 0.3)
        dialog.add(providers)
        dialog.move_to(DOWN * 0.3)
        self.go(FadeIn(dialog, scale=0.9), rt=0.6)
        self.at("such as Google", rt=0.1)
        self.click(mouse, providers[0])
        self.go(FadeOut(dialog), rt=0.4)

        avatar = Circle(radius=0.2, color=BLUE, fill_color=BLUE, fill_opacity=1).move_to(sign_in)
        items = ["Overview", "API Keys", "My Uploads", "Suppliers", "Add Funds", "Transactions", "Account Settings", "Developers"]
        sidebar = VGroup(*[T(item, 22, GREY_A) for item in items]).arrange(DOWN, aligned_edge=LEFT, buff=0.28)
        side_bg = Rectangle(width=3.2, height=5.2, stroke_width=0, fill_color=PANEL_BG, fill_opacity=1).move_to(LEFT * 4.7 + DOWN * 0.6)
        sidebar.move_to(side_bg).align_to(side_bg, LEFT).shift(RIGHT * 0.35)
        self.at("That gives you a dashboard", Transform(sign_in, avatar), FadeIn(side_bg, shift=RIGHT), FadeIn(sidebar, shift=RIGHT), rt=1.0)
        self.at("Add Funds", sidebar[4].animate.set_color(GOLD).scale(1.1), rt=0.6)
        self.at("My Uploads", sidebar[2].animate.set_color(BLUE).scale(1.1), rt=0.6)

        readers = VGroup(*[Person(GREEN, height=0.8) for _ in range(3)]).arrange(RIGHT, buff=0.6).move_to(RIGHT * 2.2 + DOWN * 0.6)
        tag = T("no account needed", 24, GREEN).next_to(readers, DOWN, buff=0.3)
        self.at("you only need an account to publish", FadeIn(readers), rt=0.8)
        self.at("won't need one", FadeIn(tag), rt=0.6)


class U1_AddFunds(Ep):
    BEAT = 3

    def build(self):
        bar = stops_bar(active=2)
        form = panel(5.6, 4.6, "Add Funds").move_to(LEFT * 2.6 + DOWN * 0.5)
        amount = field("Credit amount ($)", "", 4.6).next_to(form.heading, DOWN, buff=0.35).align_to(form.heading, LEFT)
        form.add(amount)
        balance = Balance(0.0, 10.0, width=2.6).move_to(RIGHT * 4.0 + UP * 1.6)
        self.go(FadeIn(bar), FadeIn(form), FadeIn(balance), rt=0.8)
        minimum = T("minimum $1.00", 20, GREY_B).next_to(amount.box, RIGHT, buff=0.2)

        def lines(credit):
            fee = round(credit * 0.029 + 0.30 + 1e-9, 2)
            rows = VGroup(T(f"Credit  ${credit:.2f}", 26), T(f"Processing fee  ${fee:.2f}", 26, ORANGE),
                          T(f"Total charge  ${credit + fee:.2f}", 26, WHITE, weight=BOLD)).arrange(DOWN, aligned_edge=LEFT, buff=0.25)
            return rows.next_to(amount, DOWN, buff=0.45).align_to(amount, LEFT)

        typed = M("1.00", 22).move_to(amount.box).align_to(amount.box, LEFT).shift(RIGHT * 0.15)
        self.at("add some funds", AddTextLetterByLetter(typed), rt=0.6)
        self.at("The minimum is one dollar", FadeIn(minimum), rt=0.5)
        stripe = T("payment by card (Stripe)", 20, GREY_B).next_to(form.rect, DOWN, buff=0.2)
        self.at("goes through Stripe", FadeIn(stripe), rt=0.5)
        rows = lines(1.00)
        self.at("card processing fee is added on top", FadeIn(rows), rt=0.8)
        formula = VGroup(RoundedRectangle(corner_radius=0.12, width=4.2, height=0.9, color=ORANGE),
                         T("fee = 2.9% × credit + 30¢", 26, ORANGE)).move_to(RIGHT * 3.6 + DOWN * 0.6)
        formula[1].move_to(formula[0])
        self.at("two point nine percent", FadeIn(formula, shift=LEFT * 0.3), Indicate(rows[1], color=ORANGE), rt=1.0)

        self.at("That fixed thirty cents", Indicate(formula[1][-3:], color=YELLOW, scale_factor=1.4), rt=0.8)
        self.at("A one-dollar credit costs", Indicate(rows[2], color=WHITE), rt=0.8)
        typed10 = M("10.00", 22).move_to(typed, aligned_edge=LEFT)
        self.at("A ten-dollar credit", Transform(typed, typed10), Transform(rows, lines(10.00)), rt=0.8)
        self.at("your balance gets the full credit", balance.animate_to(10.0), rt=1.4)

        small = T("Payments are final. Balances can't be withdrawn.", 20, GREY_B).to_edge(DOWN, buff=0.35)
        self.at("Payments are final", FadeOut(stripe), FadeIn(small), rt=0.6)
        never = T("doesn't expire", 22, GOLD).next_to(balance, DOWN, buff=0.3)
        self.at("doesn't expire, either", FadeIn(never), rt=0.6)
        self.at("a dollar of storage goes a long way", Indicate(balance.money, color=GOLD), rt=1.0)


class U1_Upload(Ep):
    BEAT = 3 + 1

    def row(self, name, string, note, color=WHITE):
        icon = FileIcon(width=0.32, height=0.42, lines=False)
        label = T(name, 20)
        cid = S256(string, 16, truncate=14) if string else T("Preparing…", 18, GREY_B)
        group = VGroup(icon, label, cid).arrange(RIGHT, buff=0.25)
        label.set_x(-3.9, LEFT) if False else None
        if note:
            group.add(T(note, 16, color).next_to(cid, RIGHT, buff=0.25))
        return group

    def build(self):
        bar = stops_bar(active=3)
        page = panel(10.6, 6.0, "Upload").move_to(DOWN * 0.45)
        bal = T("Balance: $10.00", 22, GOLD).next_to(page.rect.get_corner(UR), DL, buff=0.3)
        drop = DashedVMobject(RoundedRectangle(corner_radius=0.12, width=9.8, height=0.9, color=GREY_B), num_dashes=60)
        drop.next_to(page.heading, DOWN, buff=0.3).match_x(page.rect)
        drop_text = T("Drop files here · up to 90 MB each", 20, GREY_B).move_to(drop)
        self.go(FadeIn(bar), FadeIn(page), FadeIn(bal), FadeIn(drop), FadeIn(drop_text), rt=0.8)

        incoming = VGroup(*[FileIcon(name, width=0.45, height=0.6, label_size=14) for name, _ in FILES]).arrange(RIGHT, buff=0.5)
        incoming.move_to(LEFT * 5.0 + DOWN * 3.5)
        self.at("drop in several files", FadeIn(incoming), rt=0.4)
        self.go(incoming.animate.scale(0.6).move_to(drop), rt=0.8)
        self.go(FadeOut(incoming), rt=0.3)
        big = VGroup(FileIcon(width=0.32, height=0.42, lines=False), T("movie.mov  120 MB", 20),
                     T("Too large: maximum 90 MB per file", 18, RED)).arrange(RIGHT, buff=0.25)

        names = [name for name, _ in FILES]
        strings = [name_256t(name.encode() * 40) for name in names[:2]] + [name_256t(b"Pick up milk, eggs, and bread on the way home.!")]
        rows = VGroup(*[self.row(n, None, None) for n in names]).arrange(DOWN, aligned_edge=LEFT, buff=0.28)
        rows.next_to(drop, DOWN, buff=0.3).align_to(drop, LEFT).shift(RIGHT * 0.2)
        big.next_to(rows, DOWN, buff=0.28).align_to(rows, LEFT)
        self.go(LaggedStart(*[FadeIn(r) for r in rows], lag_ratio=0.2), rt=0.8)
        self.at("up to ninety megabytes each", FadeIn(big), rt=0.6)
        self.go(FadeOut(big, shift=RIGHT), rt=0.6)

        self.at("works out each file's 256t string", rt=0.1)
        done = []
        for i, (r, string) in enumerate(zip(rows, strings)):
            new = self.row(names[i], string, None).move_to(r, aligned_edge=LEFT)
            self.go(Transform(r, new), rt=0.5)
        local = T("computed on your own computer", 18, GREY_B).next_to(rows, RIGHT, buff=0.4).shift(UP * 0.4)
        self.at("on your own computer", FadeIn(local), rt=0.6)
        free = T("Stored inside its link, free", 16, GREEN).next_to(rows[2], RIGHT, buff=0.3)
        self.at("fits inside its own link", FadeOut(local), FadeIn(free), Indicate(rows[2][2], color=GREEN), rt=0.8)
        dup = self.row("photo.jpg", strings[1], "Identical content, uploaded once for this group", GREY_A)
        dup.next_to(rows, DOWN, buff=0.28).align_to(rows, LEFT)
        self.at("same photo twice", FadeIn(dup, shift=UP * 0.2), rt=0.6)
        self.go(Indicate(VGroup(rows[1][2], dup[2]), color=YELLOW), rt=0.8)

        choices = VGroup(*[button(t, GREY_D, 16) for t in ("1 month", "1 year", "5 years", "10 years")]).arrange(RIGHT, buff=0.15)
        retention = VGroup(T("Keep for", 22, GREY_A), choices).arrange(RIGHT, buff=0.3)
        retention.next_to(dup, DOWN, buff=0.35).align_to(rows, LEFT)
        price_label = T("Total cost", 22, GREY_A)
        price = Money(total(1), 28, GOLD)
        cost = VGroup(price_label, price).arrange(RIGHT, buff=0.2).next_to(retention, RIGHT, buff=0.4)
        self.at("choose how long to keep", FadeIn(retention), FadeIn(cost), rt=0.6)
        selected = SurroundingRectangle(choices[0], color=BLUE, buff=0.05, corner_radius=0.1)
        self.add(selected)
        self.at("whole months", Indicate(choices[0], color=BLUE), rt=0.5)
        self.at("one period applies to every file", Indicate(rows, color=WHITE, scale_factor=1.02), rt=0.8)
        for i, (word, months) in enumerate((("Pick a month", 1), ("a year", 12), ("five years", 60), ("ten", 120))):
            self.at(word, selected.animate.move_to(choices[i]), price.tracker.animate.set_value(total(months)), rt=0.5)
        self.at("The total updates", selected.animate.move_to(choices[1]), price.tracker.animate.set_value(total(12)), rt=0.6)

        note = T("Already on HashBin? Your months are added\nto the existing copy's expiration.", 18, BLUE_B)
        already = VGroup(RoundedRectangle(corner_radius=0.12, width=note.width + 0.5, height=note.height + 0.4, color=BLUE_B,
                                          fill_color=PANEL_BG, fill_opacity=1), note)
        note.move_to(already[0])
        already.move_to(dup[3], aligned_edge=LEFT).shift(LEFT * 0.15 + UP * 0.2)
        self.at("already on HashBin", FadeOut(free), FadeOut(dup[3]), FadeIn(already, shift=UP * 0.2), rt=0.8)
        self.at("at the same price", Indicate(price, color=GOLD), rt=0.8)


class U1_Result(Ep):
    BEAT = 5

    def build(self):
        bar = stops_bar(active=3)
        upload = button("Upload Content", BLUE_D, 24).move_to(UP * 1.4)
        balance = Balance(10.0, 10.0, width=2.6).move_to(RIGHT * 4.0 + UP * 2.2)
        progress = VGroup(*[VGroup(T(n, 20).set_width(1.4), Rectangle(width=4, height=0.18, color=GREY_C)) .arrange(RIGHT, buff=0.3)
                            for n, _ in FILES]).arrange(DOWN, buff=0.25, aligned_edge=LEFT).move_to(DOWN * 0.4)
        mouse = pointer().move_to(DOWN * 2.5 + RIGHT * 3)
        self.go(FadeIn(bar), FadeIn(upload), FadeIn(balance), FadeIn(progress), FadeIn(mouse), rt=0.6)
        self.at("Click upload", rt=0.1)
        self.click(mouse, upload)
        fills = VGroup(*[Rectangle(width=4, height=0.18, stroke_width=0, fill_color=TEAL_C, fill_opacity=1).move_to(p[1])
                         for p in progress])
        self.go(LaggedStart(*[GrowFromEdge(f, LEFT) for f in fills], lag_ratio=0.3), rt=1.2)
        self.at("comes out of your balance", balance.animate_to(10.0 - total(12)), rt=1.0)
        few = T("a few cents", 24, GOLD).next_to(balance, DOWN, buff=0.3)
        self.at("a few cents", FadeIn(few), rt=0.6)

        self.at("Each file gets a content page", FadeOut(VGroup(upload, progress, fills, few, mouse, balance)), rt=0.5)
        page = panel(8.6, 5.2, "slides.pdf").move_to(LEFT * 1.6 + DOWN * 0.7)
        cid_text = name_256t(b"slides.pdf" * 40)
        cid_row = VGroup(T("Content ID (CID)", 20, GREY_A),
                         VGroup(S256(cid_text, 16, truncate=30), button("Copy", GREY_D, 16)).arrange(RIGHT, buff=0.3)
                         ).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        facts = VGroup(T("Size  25 MB", 22), T("Expires in 12 months", 22), T("Expiration date  Oct 23, 2027", 22)
                       ).arrange(DOWN, aligned_edge=LEFT, buff=0.18)
        download = button("Download Content", TEAL_D, 20)
        lower = VGroup(T("Keep this content available", 20, GREEN), T("Report this content", 20, ORANGE)).arrange(RIGHT, buff=0.6)
        body = VGroup(cid_row, facts, download, lower).arrange(DOWN, aligned_edge=LEFT, buff=0.35)
        body.next_to(page.heading, DOWN, buff=0.3).align_to(page.heading, LEFT)
        page.add(body)
        self.go(FadeIn(page, shift=UP * 0.2), rt=0.8)
        self.at("content ID", Indicate(cid_row, color=YELLOW, scale_factor=1.05), rt=0.8)
        self.at("a button to copy it", Indicate(cid_row[1][1], color=WHITE), rt=0.6)
        self.at("the file's size", Indicate(facts[0]), rt=0.5)
        self.at("when it expires", Indicate(facts[1:]), rt=0.6)
        url = VGroup(M("https://256t.us/", 18, GREY_A), S256(cid_text, 18, truncate=10)).arrange(RIGHT, buff=0.02)
        url.next_to(download, RIGHT, buff=0.3)
        self.at("a download link", Indicate(download, color=TEAL_B), FadeIn(url), rt=0.8)
        uploads = panel(3.6, 2.4, "My Uploads").move_to(RIGHT * 4.9 + DOWN * 1.2)
        rows = VGroup(*[T(f"{n} · expires Oct 2027", 15, GREY_A) for n, _ in FILES]).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        rows.next_to(uploads.heading, DOWN, buff=0.25).align_to(uploads.heading, LEFT)
        uploads.add(rows)
        self.at("listed under My Uploads", FadeIn(uploads, shift=LEFT * 0.4), rt=0.8)


class U1_Share(Ep):
    BEAT = 6

    def build(self):
        bar = stops_bar(active=4, done=(1, 2, 3))
        cid = name_256t(b"slides.pdf" * 40)
        file_card = VGroup(T("The file", 22, TEAL_B), VGroup(M("https://256t.us/", 18, GREY_A), S256(cid, 18, truncate=10))
                           .arrange(RIGHT, buff=0.02)).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        page_card = VGroup(T("Its page", 22, BLUE_B), VGroup(M("https://hashbin.org/info/", 18, GREY_A), S256(cid, 18, truncate=10))
                           .arrange(RIGHT, buff=0.02)).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        cards = VGroup(file_card, page_card).arrange(RIGHT, buff=1.0).move_to(UP * 1.8)
        self.go(FadeIn(bar), rt=0.5)
        self.at("share its link", FadeIn(cards), rt=0.8)
        browser = AppWindow("slides", 4.4, 2.6, color=GREY_B).move_to(LEFT * 3.4 + DOWN * 1.2)
        pdf = VGroup(*[Rectangle(width=3.0, height=0.12, stroke_width=0, fill_color=GREY_C, fill_opacity=0.6) for _ in range(5)]
                     ).arrange(DOWN, buff=0.22).move_to(browser.frame).shift(DOWN * 0.2)
        self.at("is the file itself", Indicate(file_card), FadeIn(browser), rt=0.8)
        ext = M(".pdf", 18, WHITE).next_to(file_card[1], RIGHT, buff=0.02)
        title_pdf = T("slides.pdf · PDF", 20, BG, weight=BOLD).move_to(browser.title)
        self.at("Add an extension", Write(ext), rt=0.6)
        self.at("what kind of file to expect", Transform(browser.title, title_pdf), FadeIn(pdf), rt=0.8)
        mini = panel(4.0, 2.4, "slides.pdf").move_to(RIGHT * 3.4 + DOWN * 1.2)
        mini.add(VGroup(T("Expires in 12 months", 18), T("Keep this content available", 18, GREEN)).arrange(DOWN, aligned_edge=LEFT)
                 .next_to(mini.heading, DOWN, buff=0.3).align_to(mini.heading, LEFT))
        self.at("is the content's page", Indicate(page_card), FadeIn(mini), rt=0.8)
        self.at("help keep it around", Indicate(mini[-1][1], color=GREEN), rt=0.8)

        self.at("Whoever you send it to", FadeOut(VGroup(browser, pdf, mini)), rt=0.5)
        readers = VGroup(*[Person(GREEN, height=0.8) for _ in range(3)]).arrange(RIGHT, buff=1.4).move_to(DOWN * 1.2)
        self.go(FadeIn(readers), rt=0.5)
        links = VGroup(*[S256(cid, 14, truncate=8).next_to(r, UP, buff=0.2) for r in readers])
        self.go(LaggedStart(*[TransformFromCopy(file_card[1][1], l) for l in links], lag_ratio=0.2), rt=1.0)
        tags = VGroup(T("No account", 22, GREEN), T("no sign-in", 22, GREEN), T("no fee", 22, GREEN))
        for tag, reader in zip(tags, readers):
            tag.next_to(reader, DOWN, buff=0.25)
        self.at("No account", FadeIn(tags[0]), rt=0.4)
        self.at("no sign-in", FadeIn(tags[1]), rt=0.4)
        self.at("no fee", FadeIn(tags[2]), rt=0.4)


class U1_Recap(Ep):
    BEAT = 7

    def build(self):
        stops = stops_bar().scale(1.4).move_to(UP * 2.4)
        self.go(FadeIn(stops), rt=0.4)
        for i, word in enumerate(("Sign in", "add funds", "upload", "share")):
            check = check_mark(GREEN, 0.3).next_to(stops[i], DOWN, buff=0.15)
            self.at(word, stops[i][0].animate.set_fill(GREEN, 0.9).set_stroke(GREEN), FadeIn(check, scale=0.5), rt=0.4)
        card = NextCard(("U2", "where the price comes from", True), ("U3", "", False)).scale(0.85).move_to(DOWN * 1.0)
        self.at("look closely at those few cents", FadeIn(card), rt=1.0)
        self.at("why tiny files are free", Circumscribe(card[1][0][0], color=BLUE, buff=0.12), rt=1.2)
