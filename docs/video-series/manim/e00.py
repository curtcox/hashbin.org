"""00 · HashBin in Five Minutes"""

from hb.common import *


class Ep(Beat):
    EPISODE = "00-hashbin-in-five-minutes"


class E00_TwoLinks(Ep):
    BEAT = 1

    def build(self):
        top = M("https://example.com/files/report-final.pdf", 30).shift(UP * 2.4 + LEFT * 0.2)
        host = M("https://256t.us/", 30, GREY_A)
        cid = S256(HELLO_CID, 30)
        bottom = VGroup(host, cid).arrange(RIGHT, buff=0.02).shift(DOWN * 0.4)
        bottom.align_to(top, LEFT)

        self.go(AddTextLetterByLetter(top), rt=1.4)
        self.go(AddTextLetterByLetter(host), AddTextLetterByLetter(cid), rt=1.4)

        report = FileIcon("report-final.pdf", label_size=18).next_to(top, DOWN, buff=0.35).align_to(top, LEFT).shift(RIGHT * 0.3)
        grid = ByteGrid(b"%PDF-1.7 Q3 report", cols=9, cell=0.34, text_size=12).next_to(report, RIGHT, buff=0.4)
        self.at("The first one", self.dim(bottom), FadeIn(report, shift=UP * 0.2), rt=0.8)
        self.at("It names a place", FadeIn(grid), Indicate(top[8:19], color=BLUE_B), rt=1.2)
        self.at("whoever controls", Wiggle(report), rt=1.0)
        other = ByteGrid(b"%PDF-1.7 ad: buy!!", cols=9, cell=0.34, text_size=12, color=RED_B).move_to(grid)
        question = T("?", 54, RED, weight=BOLD).next_to(grid, RIGHT, buff=0.3)
        self.at("Tomorrow", Transform(grid, other), Wiggle(report), rt=1.2)
        self.at("look exactly the same", Indicate(top, color=WHITE, scale_factor=1.05), FadeIn(question, scale=0.5), rt=1.2)

        self.at("The second link is different", self.dim(top, report, grid, question), self.undim(bottom), rt=0.8)
        data = b"Hello, HashBin!"
        hello = FileIcon("hello.txt", label_size=18).next_to(bottom, DOWN, buff=0.4).align_to(bottom, LEFT).shift(RIGHT * 0.3)
        hello_grid = ByteGrid(data, cols=15, cell=0.42, text_size=13).next_to(hello, RIGHT, buff=0.4)
        self.at("isn't named after a place", FadeIn(hello, shift=UP * 0.2), FadeIn(hello_grid), rt=1.0)
        self.at("named after the content", Indicate(cid, color=YELLOW), rt=1.0)

        changed = b"Hello, HashBin?"
        changed_grid = ByteGrid(changed, cols=15, cell=0.42, text_size=13).move_to(hello_grid)
        changed_grid.cells[-1][0].set_fill(RED_E, 1)
        new_cid = S256(name_256t(changed), 30).move_to(cid, aligned_edge=LEFT)
        for i, (a, b) in enumerate(zip(HELLO_CID, name_256t(changed))):
            if a != b:
                new_cid[i].set_color(RED)
        original_grid = hello_grid.copy()
        original_cid = cid.copy()
        self.at("Change even one byte", Transform(hello_grid, changed_grid), rt=0.8)
        self.at("the name changes too", Transform(cid, new_cid), Wiggle(hello), rt=1.0)
        check = check_mark(GREEN, 0.7).next_to(hello_grid, RIGHT, buff=0.4)
        self.at("So if this link", Transform(hello_grid, original_grid), Transform(cid, original_cid), rt=1.0)
        self.at("exactly what it was named after", Create(check), Indicate(cid, color=GREEN_B), rt=1.0)


class E00_WhatItIs(Ep):
    BEAT = 2

    def build(self):
        title = title_text("HashBin", 72)
        mini_bins = Bins(2, 3, width=0.5, height=0.28, label_size=6).next_to(title, LEFT, buff=0.4)
        self.go(Write(title), FadeIn(mini_bins), rt=1.2)
        self.go(VGroup(title, mini_bins).animate.scale(0.4).to_corner(UL, buff=0.4), rt=1.0)

        uploader = Person(BLUE, label="uploader").move_to(LEFT * 5.6 + UP * 0.6)
        file = FileIcon(width=0.5, height=0.65).next_to(uploader, RIGHT, buff=0.15)
        desk = HashBinPanel(2.8, 1.6).move_to(LEFT * 1.6 + UP * 1.6)
        bins = Bins(3, 4, width=0.8, height=0.42).move_to(LEFT * 1.6 + DOWN * 1.2)
        self.at("place to publish files", FadeIn(uploader), FadeIn(file), FadeIn(desk), FadeIn(bins), rt=1.0)
        self.at("You upload a file", file.animate.move_to(desk.box.get_center() + DOWN * 0.2), rt=1.2)
        drawer = bins.drawer(5)
        label = S256(EXAMPLE_CID, 11, truncate=7).move_to(drawer[2])
        self.at("works out its name", file.animate.scale(0.55).move_to(drawer[0]), rt=1.0)
        self.at("256t string", FadeTransform(drawer[2], label), Indicate(drawer, color=YELLOW), rt=1.0)

        token = S256(EXAMPLE_CID, 20, truncate=10).next_to(uploader, UP, buff=0.3)
        readers = VGroup(*[Person(GREEN, height=0.8) for _ in range(3)]).arrange(RIGHT, buff=0.8).move_to(RIGHT * 3.6 + UP * 1.6)
        self.at("Then you share the string", TransformFromCopy(label, token), FadeIn(readers), rt=1.2)
        for reader in readers:
            self.go(token.animate.next_to(reader, UP, buff=0.15), rt=0.45)

        sandbox = Sandbox(3.0, 1.5).move_to(RIGHT * 3.6 + DOWN * 1.4)
        self.at("Anyone who has the string", FadeIn(sandbox), rt=0.8)
        arrows = VGroup(*[Arrow(r.get_bottom(), sandbox.box.get_top() + RIGHT * (i - 1) * 0.8, buff=0.1, color=GREEN_B,
                                stroke_width=3) for i, r in enumerate(readers)])
        copies = VGroup(*[FileIcon(width=0.3, height=0.4, lines=False).move_to(sandbox) for _ in readers])
        self.go(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.3), rt=1.0)
        self.go(LaggedStart(*[c.animate.next_to(r, RIGHT, buff=0.08) for c, r in zip(copies, readers)], lag_ratio=0.3),
                rt=1.2)
        cap = caption("Publish once. Anyone with the link can fetch it.")
        self.at("They don't need an account", Write(cap), rt=1.4)
        checks = VGroup(*[check_mark(GREEN, 0.3).next_to(c, UP, buff=0.05) for c in copies])
        self.at("check that what they got", LaggedStart(*[Create(c) for c in checks], lag_ratio=0.3), rt=1.0)


class E00_WhoPays(Ep):
    BEAT = 3

    def build(self):
        divider = DashedLine(UP * 3.6, DOWN * 3.6, color=GREY_D)
        uploader = Person(BLUE, label="uploader").move_to(LEFT * 5.8 + UP * 2.3)
        balance = Balance(10.0, 10.0, width=2.4).next_to(uploader, RIGHT, buff=0.5).shift(DOWN * 0.1)
        readers = VGroup(*[Person(GREEN, height=0.8) for _ in range(3)]).arrange(RIGHT, buff=0.7).move_to(RIGHT * 3.6 + UP * 1.0)
        pay = T("publishing costs money", 28, GOLD).move_to(LEFT * 3.6 + UP * 3.4)
        free = T("reading is free", 28, GREEN).move_to(RIGHT * 3.6 + UP * 3.4)
        self.go(Create(divider), FadeIn(uploader), FadeIn(balance), FadeIn(readers), rt=1.0)
        self.at("publishing costs money", Write(pay), rt=0.8)
        self.at("reading is free", Write(free), rt=0.8)
        floats = VGroup(*[T("$0.00", 22, GREEN_B).next_to(r, UP, buff=0.1) for r in readers])
        self.go(LaggedStart(*[FadeIn(f, shift=UP * 0.4) for f in floats], lag_ratio=0.3), rt=1.0)
        self.go(FadeOut(floats, shift=UP * 0.3), rt=0.6)

        axes = Axes(x_range=[0, 12, 1], y_range=[0, 0.25, 0.05], x_length=4.6, y_length=2.0,
                    axis_config={"color": GREY_B, "include_tip": False, "stroke_width": 2}).move_to(LEFT * 3.6 + UP * 0.2)
        ylab = T("size", 20, GREY_A).next_to(axes.y_axis, LEFT, buff=0.15)
        xlab = T("months", 20, GREY_A).next_to(axes.x_axis, DOWN, buff=0.15)
        self.at("you choose how long", Create(axes), FadeIn(ylab), FadeIn(xlab), rt=1.0)
        tracker_w = ValueTracker(0.01)
        tracker_h = ValueTracker(0.0977)
        area = always_redraw(lambda: cost_area(axes, tracker_w.get_value(), tracker_h.get_value()))
        self.add(area)
        price = Money(0.0, 30, WHITE).move_to(axes.c2p(6, 0.17))
        import math
        price.add_updater(lambda m: m.tracker.set_value(math.ceil(0.0977 * tracker_w.get_value() * 3 - 1e-9) / 100))
        self.at("three cents per gigabyte", FadeIn(price), rt=0.6)
        cap = T("100 MB for a year", 22, GREY_A).next_to(price, RIGHT, buff=0.3)
        coins = VGroup(*[coin().move_to(balance.bar.get_right() + LEFT * 0.2) for _ in range(4)])
        self.at("A hundred-megabyte file", tracker_w.animate.set_value(12), FadeIn(cap), rt=2.0)
        self.go(LaggedStart(*[c.animate.move_to(axes.c2p(6, 0.2)).set_opacity(0) for c in coins], lag_ratio=0.2),
                balance.animate_to(9.96), rt=1.2)
        tiny = VGroup(S256(HELLO_CID, 18), T("free", 20, GREEN)).arrange(RIGHT, buff=0.25).move_to(LEFT * 3.4 + DOWN * 2.3)
        self.at("sixty-four bytes or less", FadeIn(tiny, shift=UP * 0.2), rt=0.8)

        self.at("When the time you paid for runs out", FadeOut(tiny), FadeOut(price), FadeOut(cap), rt=0.6)
        timeline = Timeline(14, 5.0, size=14).move_to(LEFT * 3.6 + DOWN * 3.0)
        expiry = timeline.expiry(12, height=0.9, size=16)
        head = timeline.playhead(0, height=0.6, side=RIGHT)
        bins = Bins(2, 3, width=0.7, height=0.36).move_to(RIGHT * 3.6 + DOWN * 2.0)
        stored = FileIcon(width=0.25, height=0.32, lines=False).move_to(bins.drawer(1)[0])
        bins.drawer(1)[2].set_opacity(0)
        self.go(FadeIn(timeline), Create(expiry), FadeIn(head), FadeIn(bins), FadeIn(stored), rt=0.8)
        self.at("the file is deleted", timeline.head_to(head, 12.3), rt=1.6)
        self.go(stored.animate.set_opacity(0), rt=0.6)
        self.at("unless someone extends it", timeline.head_to(head, 0), stored.animate.set_opacity(1),
                rt=0.8)
        helper = Person(GREEN, height=0.6).next_to(expiry, UP, buff=0.1).shift(RIGHT * 0.8)
        self.at("doesn't have to be you", FadeIn(helper), expiry.animate.shift(timeline.x(14) - timeline.x(12)), rt=1.2)


class E00_ThreePromises(Ep):
    BEAT = 4

    def build(self):
        heads = VGroup(T("Verifiable", 34, WHITE, weight=BOLD), T("No browsing", 34, WHITE, weight=BOLD),
                       T("In public", 34, WHITE, weight=BOLD))
        xs = [-4.6, 0, 4.7]
        for head, x in zip(heads, xs):
            head.move_to([x, 3.0, 0])
        intro = T("three promises", 40, GREY_A)
        self.go(FadeIn(intro), rt=0.8)
        self.at("First, what you get", FadeOut(intro), FadeIn(heads[0], shift=DOWN * 0.2), rt=0.8)

        file = FileIcon(width=0.6, height=0.8).move_to([-5.9, 1.2, 0])
        machine = HashMachine(width=1.5, height=1.0).scale(0.8).move_to([-4.3, 1.2, 0])
        machine.label.scale(0.7)
        name = S256(EXAMPLE_CID, 16, truncate=14).move_to([-4.6, -0.2, 0])
        out = S256(EXAMPLE_CID, 16, truncate=14).move_to([-4.6, -0.7, 0])
        self.go(FadeIn(file), FadeIn(machine), FadeIn(name), rt=0.8)
        self.at("anyone can recompute it", file.animate.scale(0.3).move_to(machine.in_point), rt=0.8)
        self.go(FadeOut(file), FadeIn(out, shift=DOWN * 0.3), rt=0.6)
        self.go(LaggedStart(*[Indicate(VGroup(a, b), color=GREEN, scale_factor=1.15) for a, b in zip(name[:14], out[:14])],
                            lag_ratio=0.1), rt=1.4)
        col1_check = check_mark(GREEN, 0.5).move_to([-4.6, -1.5, 0])
        self.go(Create(col1_check), rt=0.5)

        self.at("Second, there's no browsing", FadeIn(heads[1], shift=DOWN * 0.2), rt=0.8)
        bins = Bins(3, 3, width=0.8, height=0.42).move_to([0, 0.3, 0])
        search = search_box(3.2).scale(0.8).next_to(bins, UP, buff=0.3)
        self.go(FadeIn(bins), FadeIn(search), rt=0.8)
        self.at("no search box", Wiggle(search), rt=0.8)
        no = cross_mark(RED, 0.6).move_to(search)
        self.go(Create(no), rt=0.4)
        key = S256(EXAMPLE_CID, 14, truncate=12).next_to(bins, DOWN, buff=0.3)
        self.at("already have its string", FadeIn(key, shift=UP * 0.2), rt=0.6)
        self.go(key.animate.scale(0.5).move_to(bins.drawer(4)), bins.drawer(4)[0].animate.set_fill(YELLOW_E, 0.6),
                bins.drawer(4)[2].animate.set_opacity(0), rt=0.8)
        hidden = T("uploader: hidden", 20, GREY_B).next_to(bins, DOWN, buff=0.35)
        self.at("Uploaders aren't shown", FadeIn(hidden), rt=0.6)

        self.at("And third", FadeIn(heads[2], shift=DOWN * 0.2), rt=0.8)
        ledger_rows = [("AAAAAB…", "deleted · expired"), ("AAAAJd…", "deleted · by uploader"), ("AAAFoA…", "dispute · open")]
        ledger = VGroup()
        for i, (c, what) in enumerate(ledger_rows):
            row = VGroup(M(c, 14, YELLOW), T(what, 16, WHITE), T("uploader: hidden", 12, GREY_C)).arrange(RIGHT, buff=0.2)
            ledger.add(row)
        ledger.arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to([4.45, 0.5, 0])
        frame = SurroundingRectangle(ledger, color=GREY_C, buff=0.2, corner_radius=0.1)
        self.at("Every deletion is recorded", Create(frame), LaggedStart(*[FadeIn(r, shift=UP * 0.2) for r in ledger[:2]],
                                                                          lag_ratio=0.4), rt=1.2)
        self.at("When someone reports a file", FadeIn(ledger[2], shift=UP * 0.2), rt=0.8)
        code = VGroup(M("</>", 30, GREY_A), T("open source", 22, GREY_A)).arrange(RIGHT, buff=0.2).move_to([4.7, -1.5, 0])
        self.at("open source", FadeIn(code, shift=UP * 0.2), rt=0.8)


class E00_TwoDoors(Ep):
    BEAT = 5

    def door(self, x, label, width=4.2, height=4.6):
        frame = Rectangle(width=width, height=height, color=GREY_A, stroke_width=4).move_to([x, -0.3, 0])
        leaf = Rectangle(width=width, height=height, stroke_width=0, fill_color="#3A3326", fill_opacity=1).move_to(frame)
        knob = Dot(radius=0.08, color=GOLD).move_to(leaf.get_right() + LEFT * 0.35)
        title = T(label, 28, WHITE, weight=BOLD).next_to(frame, UP, buff=0.2)
        return frame, VGroup(leaf, knob), title

    def build(self):
        left_frame, left_leaf, left_title = self.door(-3.9, "Publishing files")
        right_frame, right_leaf, right_title = self.door(3.9, "Building apps")
        self.go(FadeIn(left_frame), FadeIn(left_leaf), FadeIn(left_title), FadeIn(right_frame), FadeIn(right_leaf),
                FadeIn(right_title), rt=1.0)

        page = panel(3.6, 3.6, "Upload")
        drop = DashedVMobject(RoundedRectangle(corner_radius=0.1, width=3.2, height=1.0, color=GREY_B), num_dashes=30)
        drop_text = T("Drop files here", 18, GREY_B).move_to(drop)
        retention = VGroup(*[button(t, GREY_D, 14) for t in ("1 month", "1 year", "5 years")]).arrange(RIGHT, buff=0.1)
        total = T("Total cost: $0.04", 20, GOLD)
        stack = VGroup(VGroup(drop, drop_text), retention, total).arrange(DOWN, buff=0.3)
        stack.move_to(page.rect).shift(DOWN * 0.2)
        page.add(stack)
        page.move_to(left_frame)
        self.add(page)
        self.bring_to_front(left_leaf)
        self.at("Most people will use the website", left_leaf.animate.stretch_to_fit_width(0.05).align_to(left_frame, LEFT),
                rt=1.2)
        self.remove(left_leaf)
        user_labels = VGroup(*[T(c, 22, BLUE) for c in ("U1", "U2", "U3", "U4")]).arrange(RIGHT, buff=0.35)
        user_labels.next_to(left_frame, DOWN, buff=0.25)
        self.at("drop in some files", LaggedStart(*[FadeIn(l, shift=DOWN * 0.3) for l in user_labels], lag_ratio=0.2), rt=1.0)

        term = terminal(["$ curl -X POST …/api/content"], width=3.8, size=14).move_to([3.9, 0.7, 0])
        phone = AppWindow("Textpad", 1.4, 2.0, phone=True, size=16).move_to([4.7, -1.4, 0])
        save = button("Save", PURPLE_B, 14).move_to(phone.frame).shift(DOWN * 0.5)
        phone.add(save)
        self.add(term, phone)
        self.bring_to_front(right_leaf)
        self.at("Developers can do the same things", right_leaf.animate.stretch_to_fit_width(0.05).align_to(right_frame, LEFT),
                rt=1.2)
        self.remove(right_leaf)
        dev_labels = VGroup(*[T(c, 22, PURPLE_B) for c in ("D1", "D2", "D3", "D4")]).arrange(RIGHT, buff=0.35)
        dev_labels.next_to(right_frame, DOWN, buff=0.25)
        self.at("upload with an API key", Indicate(term, color=GREEN_B), rt=1.0)
        self.at("build an app", Indicate(phone, color=PURPLE_A), LaggedStart(*[FadeIn(l, shift=DOWN * 0.3) for l in dev_labels],
                                                                           lag_ratio=0.2), rt=1.2)
        bal = T("paid from the user's balance", 18, GOLD).next_to(dev_labels, DOWN, buff=0.15)
        self.at("paid from the user's own", FadeIn(bal), rt=0.8)
        oauth = T("OAuth", 30, PURPLE_B, weight=BOLD).next_to(phone, LEFT, buff=0.35)
        self.at("a standard sign-in flow", Write(oauth), rt=0.8)
        mid_frame = Rectangle(width=1.3, height=4.6, color=GREY_B, stroke_width=3).move_to([0, -0.3, 0])
        mid_title = T("Details", 24, ORANGE, weight=BOLD).next_to(mid_frame, UP, buff=0.2)
        mid_labels = VGroup(*[T(c, 22, ORANGE) for c in ("X1", "X2", "X3")]).arrange(DOWN, buff=0.4).move_to(mid_frame)
        self.at("has its own episode", FadeOut(bal), Create(mid_frame), FadeIn(mid_title), FadeIn(mid_labels), rt=1.0)


class E00_NextCard(Ep):
    BEAT = 6

    def build(self):
        card = NextCard(("U1", "Publishing files", False), ("01", "How the links work", True), ("D1", "Building apps", False),
                        heading="Where to go next")
        card.shift(UP * 0.4)
        self.go(FadeIn(card[0]), LaggedStart(*[FadeIn(t, shift=UP * 0.3) for t in card[1]], lag_ratio=0.2), rt=1.4)
        self.at("If you want to publish files", Circumscribe(card[1][0][0], color=BLUE, buff=0.12), rt=1.0)
        self.at("If you're a developer", Circumscribe(card[1][1][0], color=WHITE, buff=0.12), rt=1.0)
        line = VGroup(M("https://256t.us/", 26, GREY_A), S256(HELLO_CID, 26)).arrange(RIGHT, buff=0.02).to_edge(DOWN, buff=0.6)
        self.at("takes that strange string apart", AddTextLetterByLetter(line[0]), AddTextLetterByLetter(line[1]), rt=1.4)
        cursor = Rectangle(width=0.14, height=0.36, stroke_width=0, fill_color=WHITE, fill_opacity=1).next_to(line, RIGHT, buff=0.05)
        self.add(cursor)
        for _ in range(4):
            self.go(cursor.animate.set_opacity(0), rt=0.4)
            self.go(cursor.animate.set_opacity(1), rt=0.4)
