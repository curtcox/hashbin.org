"""X1 · Disputes and Public Records"""

from hb.common import *


class Ep(Beat):
    EPISODE = "X1-disputes-and-public-records"


class X1_Intro(Intro, Ep):
    BEAT = 0


def node(text, color=GREY_B, width=2.6):
    box = RoundedRectangle(corner_radius=0.15, width=width, height=0.8, color=color, fill_color=PANEL_BG, fill_opacity=1)
    label = T(text, 22, color).move_to(box)
    return VGroup(box, label)


class X1_Tension(Ep):
    BEAT = 1

    def build(self):
        post = Line(DOWN * 2.2, UP * 0.6, color=GREY_A, stroke_width=6)
        base = Line(LEFT * 0.8, RIGHT * 0.8, color=GREY_A, stroke_width=6).move_to(DOWN * 2.2)
        beam = Line(LEFT * 3, RIGHT * 3, color=GREY_A, stroke_width=6).move_to(UP * 0.6)
        left = VGroup(FileIcon("someone's copyrighted film", label_size=18), T("♛", 30, GOLD))
        left[1].next_to(left[0].page, UP, buff=0.05)
        right = FileIcon("a journalist's document", label_size=18)
        left.next_to(beam.get_left(), DOWN, buff=0.2)
        right.next_to(beam.get_right(), DOWN, buff=0.2)
        arm = VGroup(beam, left, right)
        self.at("What happens when someone says", FadeIn(post), FadeIn(base), FadeIn(beam), rt=0.6)
        self.at("their copyrighted work", FadeIn(left, shift=DOWN * 0.2), rt=0.6)
        illegal = T("illegal?", 26, RED).move_to(UP * 2.4)
        self.at("Maybe it's illegal", FadeIn(illegal), rt=0.5)
        reporter = Person(ORANGE, label="reporter").next_to(right, RIGHT, buff=0.5)
        shout = T('"Take it down!"', 22, ORANGE).next_to(reporter, UP, buff=0.2)
        self.at("they just don't like it", FadeOut(illegal), FadeIn(right, shift=DOWN * 0.2), FadeIn(reporter), FadeIn(shout), rt=0.8)
        self.go(Rotate(arm, 0.12, about_point=beam.get_center()), rt=0.6)
        self.go(Rotate(arm, -0.24, about_point=beam.get_center()), rt=0.8)
        slow = T("Act too slowly: harm stays up.", 26, GREY_A).to_edge(UP, buff=0.5).shift(LEFT * 3.2)
        fast = T("Act too quickly: anyone can silence anything.", 26, GREY_A).to_edge(UP, buff=0.5).shift(RIGHT * 2.4)
        self.at("Act too slowly", FadeIn(slow), Rotate(arm, 0.24, about_point=beam.get_center()), rt=0.8)
        self.at("Act too quickly", slow.animate.shift(UP * 0.0).set_opacity(0.6), FadeIn(fast.next_to(slow, DOWN, buff=0.15).align_to(slow, LEFT)),
                Rotate(arm, -0.24, about_point=beam.get_center()), rt=0.8)
        answer = T("Block fast, decide carefully, do it all in public.", 32, YELLOW).to_edge(DOWN, buff=0.4)
        self.at("HashBin's approach", Rotate(arm, 0.12, about_point=beam.get_center()), AddTextLetterByLetter(answer), rt=2.0)


class X1_Report(Ep):
    BEAT = 2

    def build(self):
        form = panel(7.6, 6.6, "Report Content").move_to(LEFT * 1.6 + DOWN * 0.1)
        cid = field("Content ID (CID)", "AAAAAABBRg2doReeYM-O5F0s…", 6.8, size=16, mono=True)
        reasons = ["copyright infringement", "illegal content", "privacy violation", "harassment", "malware", "other"]
        reason = field("Reason", "copyright infringement", 6.8, size=16)
        explain = field("Explanation and evidence", "This file is a copy of my film…", 6.8, size=16)
        counter = T("0 / 10,000 (minimum 50)", 14, GREY_B)
        links = field("Supporting links (HTTPS, up to 10)", "https://example.org/my-film", 6.8, size=16)
        contact = field("How can we contact you?", "me@example.org", 6.8, size=16)
        note = T("not shown publicly", 14, GREY_B)
        good = VGroup(Square(0.25, color=GREY_A), T("I confirm this report is made in good faith and is accurate.", 15, GREY_A)).arrange(RIGHT, buff=0.15)
        items = VGroup(cid, reason, explain, links, contact, good).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        items.next_to(form.heading, DOWN, buff=0.25).align_to(form.heading, LEFT)
        counter.next_to(explain.box, DOWN, buff=0.03).align_to(explain.box, RIGHT)
        note.next_to(contact.box, DOWN, buff=0.03).align_to(contact.box, RIGHT)
        reporter = Person(ORANGE, label="reporter").move_to(RIGHT * 4.8 + DOWN * 0.4)
        self.at("Anyone can report a file", FadeIn(form), FadeIn(reporter), rt=0.6)
        self.at("Report this content", FadeIn(cid), rt=0.5)
        dropdown = VGroup(*[T(r, 16) for r in reasons]).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        drop_bg = SurroundingRectangle(dropdown, color=GREY_C, buff=0.15, fill_color=PANEL_BG, fill_opacity=1)
        menu = VGroup(drop_bg, dropdown).next_to(reason.box, RIGHT, buff=0.2).align_to(reason.box, UP)
        self.at("You choose a reason", FadeIn(reason[:2]), FadeIn(menu), rt=0.6)
        self.go(FadeOut(menu), FadeIn(reason[2]), rt=0.6)
        self.at("at least fifty characters", FadeIn(explain), FadeIn(counter), rt=0.6)
        self.at("up to ten supporting links", FadeIn(links), rt=0.6)
        copyright = VGroup(T("For copyright:", 18, YELLOW, weight=BOLD), T("· the original work", 18), T("· how this file infringes it", 18),
                           T("· whether you hold the rights", 18)).arrange(DOWN, aligned_edge=LEFT, buff=0.1).next_to(reporter, UP, buff=0.4)
        self.at("For copyright", FadeIn(copyright), rt=0.8)
        self.at("leave a way to reach you", FadeIn(contact), FadeIn(note), rt=0.6)
        tick = check_mark(GREEN, 0.25).move_to(good[0])
        self.at("confirm that the report is made in good faith", FadeIn(good), rt=0.4)
        self.go(Create(tick), rt=0.3)
        ref = T("Report submitted · reference disp_7Q2…", 20, GREEN).next_to(form, DOWN, buff=0.1)
        self.go(FadeIn(ref), rt=0.5)


class X1_Blocked(Ep):
    BEAT = 3

    def build(self):
        bins = Bins(3, 4, width=0.85, height=0.45).move_to(LEFT * 4.2 + UP * 1.6)
        band = Rectangle(width=0.85, height=0.45, stroke_width=0, fill_color=RED, fill_opacity=0.6).move_to(bins.drawer(6))
        bins.drawer(6)[2].set_z_index(1)
        self.go(FadeIn(bins), rt=0.5)
        self.at("As soon as a report is submitted", FadeIn(band), rt=0.5)
        readers = VGroup(*[Person(GREEN, height=0.6) for _ in range(2)]).arrange(DOWN, buff=0.4).move_to(LEFT * 1.0 + UP * 1.6)
        chip = StatusChip(451).scale(0.8).next_to(readers, RIGHT, buff=0.3)
        self.go(FadeIn(readers), rt=0.4)
        self.at("four fifty-one", FadeIn(chip, scale=0.6), rt=0.6)
        book = T("(as in Fahrenheit 451)", 18, GREY_B).next_to(chip, DOWN, buff=0.1)
        self.at("Fahrenheit", FadeIn(book), rt=0.5)
        withheld = T("exists, but withheld", 18, RED).next_to(book, DOWN, buff=0.1)
        self.go(FadeIn(withheld), rt=0.4)

        notice = panel(5.6, 1.3).move_to(RIGHT * 3.4 + UP * 2.6)
        notice.add(T("This content has an open dispute. It is blocked until\nan administrator reviews the report. View dispute.", 16, RED)
                   .move_to(notice.rect))
        disputes = panel(8.0, 3.0, "Disputes (public)").move_to(DOWN * 1.8 + RIGHT * 1.0)
        row = VGroup(M("AAAAAABB…", 16, YELLOW), T("copyright infringement", 18), T("This file is a copy of my film…", 16, GREY_A),
                     T("2 links", 16, BLUE_B)).arrange(RIGHT, buff=0.3)
        contact = VGroup(T("contact:", 16, GREY_B), T("me@example.org", 16)).arrange(RIGHT, buff=0.15)
        block = VGroup(row, contact).arrange(DOWN, aligned_edge=LEFT, buff=0.3).next_to(disputes.heading, DOWN, buff=0.3).align_to(
            disputes.heading, LEFT)
        disputes.add(block)
        self.at("the report becomes public", FadeIn(notice), FadeIn(disputes, shift=UP * 0.3), rt=0.8)
        blur = Rectangle(width=contact[1].width + 0.2, height=0.35, stroke_width=0, fill_color=GREY_D, fill_opacity=0.95).move_to(contact[1])
        hidden = T("hidden from visitors", 16, GREY_B).next_to(blur, RIGHT, buff=0.3)
        self.at("contact details aren't shown", FadeIn(blur), FadeIn(hidden), rt=0.6)
        signed = T("visible to signed-in users", 16, BLUE_B).next_to(hidden, RIGHT, buff=0.3)
        self.at("signed-in HashBin users can see them", FadeIn(signed), blur.animate.set_fill(opacity=0.5), rt=0.6)
        timer = T("expires in 30 days", 20, GREY_A).next_to(bins, DOWN, buff=0.2)
        self.go(FadeIn(timer), rt=0.4)
        self.at("Publishing the report is what keeps this honest", Circumscribe(disputes.rect, color=YELLOW), rt=1.0)
        self.at("on the record", Indicate(row, color=YELLOW, scale_factor=1.04), rt=0.8)


class X1_Review(Ep):
    BEAT = 4

    def build(self):
        open_ = node("Open", RED).move_to(LEFT * 5.2 + UP * 0.6)
        review = node("Under review", GREY_A).move_to(LEFT * 1.8 + UP * 0.6)
        mod = Person(GREY, height=0.6).next_to(review, UP, buff=0.15)
        denied = node("Denied", GREEN).move_to(RIGHT * 2.4 + UP * 2.4)
        upheld = node("Upheld", RED).move_to(RIGHT * 2.4 + UP * 0.6)
        expired = node("Expired after 30 days", GREY_B, 3.2).move_to(RIGHT * 2.4 + DOWN * 1.2)
        a0 = Arrow(open_.get_right(), review.get_left(), buff=0.1, color=GREY_B)
        arrows = VGroup(*[Arrow(review.get_right(), n.get_left(), buff=0.1, color=GREY_B) for n in (denied, upheld, expired)])
        self.go(FadeIn(open_), rt=0.4)
        self.at("an administrator reviews", GrowArrow(a0), FadeIn(review), FadeIn(mod), rt=0.8)
        self.at("three ways it can end", LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.2), rt=0.8)
        c1 = VGroup(StatusChip(451, short=True), T("→", 22), StatusChip(200, short=True)).arrange(RIGHT, buff=0.1).scale(0.8).next_to(denied, RIGHT, buff=0.3)
        self.at("it's denied", FadeIn(denied), FadeIn(c1), rt=0.6)
        c2 = VGroup(StatusChip(451, short=True), T("→", 22), StatusChip(404, short=True)).arrange(RIGHT, buff=0.1).scale(0.8).next_to(upheld, RIGHT, buff=0.3)
        self.at("it's upheld", FadeIn(upheld), FadeIn(c2), rt=0.6)
        record = T('public record: "removed by admin" + short reason', 18, GREY_A).next_to(upheld, DOWN, buff=0.15).align_to(upheld, LEFT)
        self.at("short public reason", FadeIn(record), rt=0.6)
        strike = T("copyright → strike against the uploader", 16, ORANGE).next_to(record, DOWN, buff=0.08).align_to(record, LEFT)
        never = T("410: can't be uploaded again", 16, GREY_B).next_to(c2, UP, buff=0.12).align_to(c2, LEFT)
        self.at("can't be uploaded again", FadeIn(never), FadeIn(strike), rt=0.6)
        clock = clock_icon(GREY_A, 0.3).next_to(expired, LEFT, buff=0.2)
        c3 = VGroup(StatusChip(451, short=True), T("→", 22), StatusChip(200, short=True)).arrange(RIGHT, buff=0.1).scale(0.8).next_to(expired, RIGHT, buff=0.3)
        self.at("nobody resolves the report within thirty days", FadeIn(expired), FadeIn(clock), rt=0.6)
        self.go(FadeIn(c3), rt=0.4)
        self.at("not forever by being ignored", Indicate(expired), rt=0.6)
        cooldown = VGroup(padlock(GREY_A, 0.3), T("no new report on this file for 30 days", 20, GREY_A)).arrange(RIGHT, buff=0.2)
        cooldown.to_edge(DOWN, buff=0.4)
        self.at("Once a dispute closes", FadeIn(cooldown), rt=0.6)
        self.at("filing the same report over and over", Indicate(cooldown[1], color=YELLOW), rt=0.8)


class X1_Limits(Ep):
    BEAT = 5

    def build(self):
        reporter = Person(ORANGE, label="reporter").move_to(LEFT * 5.6 + UP * 1.2)
        forms = VGroup(*[Rectangle(width=0.5, height=0.65, color=ORANGE, fill_color=PANEL_BG, fill_opacity=1) for _ in range(12)])
        forms.arrange(RIGHT, buff=-0.25).next_to(reporter, RIGHT, buff=0.4)
        self.go(FadeIn(reporter), rt=0.4)
        gate = VGroup(Line(UP * 0.7, DOWN * 0.7, color=RED, stroke_width=8), T("10 reports per hour\nfrom one address", 18, RED))
        gate[1].next_to(gate[0], UP, buff=0.1)
        gate.move_to(RIGHT * 0.6 + UP * 1.2)
        self.at("at most ten reports an hour", FadeIn(forms), rt=0.4)
        self.go(LaggedStart(*[f.animate.move_to(RIGHT * (1.4 + i * 0.2) + UP * 1.2).set_opacity(0.4) for i, f in enumerate(forms[:10])],
                            lag_ratio=0.1), rt=1.2)
        self.go(FadeIn(gate), rt=0.4)
        self.go(forms[10].animate.next_to(gate[0], LEFT, buff=0.05), rt=0.4)
        self.go(forms[10].animate.shift(LEFT * 0.6), rt=0.3)
        one = T("one open dispute per file", 22, GREY_A).move_to(LEFT * 3.0 + DOWN * 0.4)
        self.at("only have one open dispute", FadeIn(one), rt=0.6)
        pause = T("30-day cooldown after one closes", 22, GREY_A).next_to(one, DOWN, buff=0.25)
        self.at("thirty-day pause", FadeIn(pause), rt=0.6)

        uploader = Person(BLUE, label="uploader").move_to(LEFT * 0.6 + DOWN * 2.0)
        card = panel(2.8, 1.2, "Strikes").next_to(uploader, RIGHT, buff=0.3)
        marks = VGroup(*[Line(DOWN * 0.25, UP * 0.25, color=ORANGE, stroke_width=6) for _ in range(3)]).arrange(RIGHT, buff=0.2)
        marks.move_to(card.rect).shift(DOWN * 0.15)
        self.at("The limits run the other way too", FadeIn(uploader), FadeIn(card), rt=0.6)
        self.at("the uploader gets a strike", Create(marks[0]), rt=0.4)
        self.go(Create(marks[1]), rt=0.3)
        bell = VGroup(Arc(radius=0.25, start_angle=0, angle=PI, color=GOLD, stroke_width=6), Line(LEFT * 0.3, RIGHT * 0.3, color=GOLD, stroke_width=6))
        bell.arrange(DOWN, buff=0.18)
        bell_label = T("3 in a year → operator alert", 18, GOLD)
        alarm = VGroup(bell, bell_label).arrange(DOWN, buff=0.1).next_to(card, RIGHT, buff=0.4)
        self.at("three strikes within a year", Create(marks[2]), FadeIn(alarm), rt=0.6)
        self.go(Wiggle(bell), rt=0.6)
        checklist = VGroup(*[T(t, 20, GREY_A) for t in ("public reports", "rate limit", "30-day cooldown", "30-day expiry", "strikes")])
        checklist.arrange(DOWN, aligned_edge=LEFT, buff=0.15).to_corner(UR, buff=0.4)
        dmca = T("DMCA policy page: notices and counter-notices", 18, BLUE_B).to_edge(DOWN, buff=0.2).shift(LEFT * 2.6)
        self.at("DMCA policy page", FadeIn(dmca), FadeIn(checklist), rt=0.8)


class X1_PublicRecords(Ep):
    BEAT = 6

    def build(self):
        tiles = VGroup()
        for label, value in (("Total deletions", 1284), ("Expired", 1102), ("Removed (admin or uploader)", 182), ("Open disputes", 3)):
            box = RoundedRectangle(corner_radius=0.12, width=3.0, height=1.2, color=GREY_C, fill_color=PANEL_BG, fill_opacity=1)
            num = Number(0, size=34).move_to(box).shift(UP * 0.15)
            text = T(label, 15, GREY_A).next_to(num, DOWN, buff=0.1)
            tile = VGroup(box, num, text)
            tile.value = value
            tiles.add(tile)
        tiles.arrange(RIGHT, buff=0.25).to_edge(UP, buff=0.4)
        self.go(FadeIn(tiles), rt=0.6)
        self.at("Every deletion is recorded permanently", *[counting(t[1], t.value) for t in tiles], rt=1.6)
        reasons = [("AAAAAABB…", "Oct 22", "expired"), ("AAAFoAAA…", "Oct 21", "deleted by uploader"), ("AAAAJdwA…", "Oct 20", "removed by admin"),
                   ("AAAAAAQA…", "Oct 19", "expired"), ("AAAABkAA…", "Oct 18", "removed by admin")]
        table = rows_table([list(r) for r in reasons], [2.6, 1.6, 3.2], size=20, header=["CID", "Date", "Reason"], mono_cols=(0,))
        table.move_to(LEFT * 1.6 + DOWN * 1.2)
        self.go(FadeIn(table[0]), rt=0.4)
        for i, cue in enumerate(("It expired", "Its uploader deleted it", "an administrator removed it")):
            self.at(cue, FadeIn(table[i + 1], shift=UP * 0.2), rt=0.4)
        self.go(FadeIn(table[4:]), rt=0.4)
        self.at("running totals", Indicate(tiles, color=WHITE, scale_factor=1.02), rt=0.6)
        filt = button("Filter: Removed by admin", GREY_D, 16).next_to(table, UP, buff=0.2).align_to(table, RIGHT)
        self.at("filter the list", FadeIn(filt), *[table[i].animate.set_opacity(0.25) for i in (1, 2, 4)], rt=0.6)
        export = button("Export (JSON)", GREY_D, 16).move_to(RIGHT * 4.6 + DOWN * 0.2)
        json = M('{"cid": "AAAAJdwA…",\n "reason": "removed_by_admin"}', 14, GREY_A).next_to(export, DOWN, buff=0.2)
        self.at("export it", FadeIn(export), FadeIn(json), rt=0.6)
        apis = VGroup(M("GET /api/public/deletions", 16, TEAL_B), M("GET /api/public/deletions/stats", 16, TEAL_B), M("GET /api/disputes", 16, TEAL_B))
        apis.arrange(DOWN, aligned_edge=LEFT, buff=0.12).next_to(json, DOWN, buff=0.3)
        self.at("pull the same data from the API", LaggedStart(*[AddTextLetterByLetter(a) for a in apis], lag_ratio=0.3), rt=1.2)
        ghost = VGroup(T("uploader", 20, GREY_B, weight=BOLD)).next_to(table[0][-2], RIGHT, buff=2.2)
        ghost_x = cross_mark(RED, 0.4).move_to(ghost)
        self.at("anyone's identity", FadeIn(ghost), Create(ghost_x), rt=0.6)
        self.go(FadeOut(ghost), FadeOut(ghost_x), rt=0.6)
        self.at("the gap would show", Indicate(tiles[0], color=YELLOW), rt=0.8)


class X1_Recap(Ep):
    BEAT = 7

    def build(self):
        nodes = VGroup(node("Report", ORANGE, 2.0), node("Blocked (451)", RED, 2.4), node("Review", GREY_A, 2.0),
                       node("Denied · Upheld · Expired", GREY_B, 3.6)).arrange(RIGHT, buff=0.5).move_to(UP * 1.6)
        arrows = VGroup(*[Arrow(a.get_right(), b.get_left(), buff=0.05, color=GREY_B) for a, b in zip(nodes, nodes[1:])])
        ledger = Rectangle(width=12, height=0.7, color=GREY_C).move_to(UP * 0.0)
        ledger_label = T("public record", 18, GREY_B).next_to(ledger, DOWN, buff=0.1).align_to(ledger, LEFT)
        self.at("Anyone can report a file", FadeIn(nodes[0]), FadeIn(ledger), FadeIn(ledger_label), rt=0.6)
        self.at("It's blocked right away", GrowArrow(arrows[0]), FadeIn(nodes[1]), rt=0.5)
        self.at("a person reviews it", GrowArrow(arrows[1]), FadeIn(nodes[2]), rt=0.5)
        self.at("denied, upheld, or expired", GrowArrow(arrows[2]), FadeIn(nodes[3]), rt=0.5)
        drops = VGroup(*[Rectangle(width=0.8, height=0.35, stroke_width=0, fill_color=c, fill_opacity=0.7).move_to(n.get_bottom())
                         for n, c in zip(nodes, (ORANGE, RED, GREY_A, GREY_B))])
        self.at("every removal lands in the public record", *[d.animate.move_to([n.get_x(), ledger.get_y(), 0]) for d, n in zip(drops, nodes)], rt=1.0)
        card = NextCard(("X2", "", True), ("U4", "", False)).scale(0.65).to_edge(DOWN, buff=0.3)
        self.at("how often", FadeIn(card), rt=0.8)
