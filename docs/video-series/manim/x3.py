"""X3 · Anyone Can Serve It"""

from hb.common import *


class Ep(Beat):
    EPISODE = "X3-alternate-suppliers"


class X3_Intro(Intro, Ep):
    BEAT = 0


def server(label, color=GREY_B, width=2.4, height=1.4, mono=False, mark=False):
    """mark: put the 256t logo beside the label."""
    box = RoundedRectangle(corner_radius=0.15, width=width, height=height, color=color, fill_color=PANEL_BG, fill_opacity=1)
    text = (M if mono else T)(label, 18, color)
    if mark:
        text = Group(logo("256t", 0.42), text).arrange(RIGHT, buff=0.12)
    text.next_to(box.get_top(), DOWN, buff=0.12)
    group = Group(box, text) if mark else VGroup(box, text)
    group.box = box
    return group


class X3_NotAnAddress(Ep):
    BEAT = 1

    def build(self):
        url = M("https://example.com/files/report.pdf", 24).move_to(UP * 2.8 + LEFT * 2.6)
        one = server("example.com").move_to(UP * 0.8 + LEFT * 4.6)
        arrow = Arrow(url.get_bottom(), one.get_top(), buff=0.1, color=GREY_B)
        self.at("tells you where to go", FadeIn(url), FadeIn(one), GrowArrow(arrow), rt=0.8)
        cid = S256(EXAMPLE_CID, 18, truncate=30).move_to(UP * 2.8 + RIGHT * 1.0)
        self.at("tells you what you're looking for", FadeOut(VGroup(url, one, arrow)), FadeIn(cid), rt=0.8)
        hosts = Group(Sandbox(2.6, 1.6), server("256t.org", mono=True, width=2.6, height=1.6, mark=True),
                       server("a GitHub folder", width=2.6, height=1.6), server("your own server", width=2.6, height=1.6))
        hosts.arrange(RIGHT, buff=0.35).move_to(DOWN * 0.6)
        files = VGroup(*[FileIcon(width=0.4, height=0.5).move_to(h).shift(DOWN * 0.2) for h in hosts])
        self.at("doesn't really belong to HashBin", cid.animate.move_to(UP * 2.4), FadeIn(hosts[0]), FadeIn(files[0]), rt=0.8)
        self.at("Any server that has the file", LaggedStart(*[FadeIn(Group(h, f)) for h, f in zip(hosts[1:], files[1:])], lag_ratio=0.25), rt=1.0)
        lines = VGroup(*[DashedLine(cid.get_bottom(), h.get_top(), color=YELLOW, stroke_width=2) for h in hosts])
        self.go(Create(lines), rt=0.6)
        outs = VGroup(*[S256(EXAMPLE_CID, 10, truncate=10).next_to(h, DOWN, buff=0.15) for h in hosts])
        self.at("check that what you got is right", LaggedStart(*[FadeIn(o, shift=DOWN * 0.1) for o in outs], lag_ratio=0.2), rt=0.8)
        checks = VGroup(*[check_mark(GREEN, 0.25).next_to(o, DOWN, buff=0.1) for o in outs])
        self.go(LaggedStart(*[Create(c) for c in checks], lag_ratio=0.2), rt=0.6)
        title = T("alternate suppliers", 36, YELLOW, weight=BOLD).to_edge(DOWN, buff=0.3)
        self.at("alternate suppliers", Write(title), rt=0.8)


class X3_Supplier(Ep):
    BEAT = 2

    def build(self):
        box = server("256t.org", mono=True, width=6.4, height=1.4, mark=True).move_to(UP * 2.2)
        pattern = VGroup(M("https://256t.org/", 22), M("{cid}", 22, YELLOW)).arrange(RIGHT, buff=0.02).move_to(box.box).shift(DOWN * 0.2)
        self.at("A supplier is any other place", FadeIn(box), AddTextLetterByLetter(pattern[0]), FadeIn(pattern[1]), rt=1.0)
        filled = S256(EXAMPLE_CID, 14, truncate=14).move_to(pattern[1], aligned_edge=LEFT)
        self.go(Transform(pattern[1], filled), rt=0.6)
        single = panel(4.6, 2.2, "Single file").move_to(LEFT * 3.2 + DOWN * 1.0)
        single.add(VGroup(M("one URL → one file", 18, GREY_A), FileIcon(width=0.4, height=0.5)).arrange(DOWN, buff=0.2).move_to(single.rect).shift(DOWN * 0.2))
        group = panel(5.6, 2.6, "Group").move_to(RIGHT * 3.0 + DOWN * 1.0)
        folder = M("github.com/curtcox/256t.org/…/cids/", 15, GREY_A)
        names = VGroup(*[S256(name_256t(bytes([i]) * 80), 13, truncate=18) for i in range(3)]).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        inner = VGroup(folder, names).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to(group.rect).shift(DOWN * 0.25)
        self.at("There are two kinds", rt=0.1)
        self.at("A single-file supplier", FadeIn(single), rt=0.6)
        self.at("A group supplier", FadeIn(group[:2]), rt=0.6)
        self.at("address pattern like this one", Indicate(pattern, color=YELLOW), rt=0.6)
        self.at("a folder in a GitHub repository", FadeIn(inner), rt=0.8)
        counter = T("Suppliers: 2 of 20", 24, BLUE_B).to_edge(DOWN, buff=0.3)
        self.at("up to twenty per account", FadeIn(counter), rt=0.6)


class X3_Scan(Ep):
    BEAT = 3

    def build(self):
        hb = HashBinPanel(2.6, 1.4).move_to(LEFT * 5.4 + UP * 1.8)
        folder = panel(5.0, 4.6, "supplier folder").move_to(RIGHT * 0.9 + DOWN * 0.2)
        entries = []
        kinds = ["ok", "ok", "hash", "ok", "size", "ok"]
        rows = VGroup()
        for i, kind in enumerate(kinds):
            rows.add(VGroup(FileIcon(width=0.25, height=0.32, lines=False), S256(name_256t(bytes([i + 7]) * 90), 14, truncate=16)).arrange(RIGHT, buff=0.15))
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.25).next_to(folder.heading, DOWN, buff=0.3).align_to(folder.heading, LEFT)
        folder.add(rows)
        self.at("doesn't take its word for anything", FadeIn(hb), FadeIn(folder), rt=0.8)
        beam = Arrow(hb.get_right(), folder.rect.get_left(), buff=0.1, color=BLUE_B)
        self.at("It scans it", GrowArrow(beam), rt=0.6)
        steps = VGroup(T("1. size matches the prefix?", 22), T("2. fingerprint matches?", 22)).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        steps.move_to(LEFT * 4.9 + DOWN * 1.0)
        self.at("Is it the size the string says", FadeIn(steps[0]), rt=0.5)
        self.at("does its fingerprint match", FadeIn(steps[1]), rt=0.5)
        verified = T("verified", 22, GREEN).next_to(folder, LEFT, buff=0.3).shift(DOWN * 1.8)
        marks = []
        for row, kind in zip(rows, kinds):
            if kind == "ok":
                mark = check_mark(GREEN, 0.22)
            else:
                mark = cross_mark(RED, 0.3)
            mark.next_to(row, RIGHT, buff=0.3)
            marks.append(mark)
        self.at("Only files that pass both checks", LaggedStart(*[Create(m) for m in marks], lag_ratio=0.2), rt=1.4)
        hash_note = T("Content hash does not match CID", 16, RED).next_to(marks[2], RIGHT, buff=0.15)
        size_note = T("Size mismatch", 16, RED).next_to(marks[4], RIGHT, buff=0.15)
        self.at("the wrong contents", FadeIn(hash_note), rows[2].animate.set_opacity(0.4), rt=0.6)
        self.at("a byte too long", FadeIn(size_note), rows[4].animate.set_opacity(0.4), rt=0.6)
        rescan = button("Rescan", BLUE_D, 18).next_to(hb, DOWN, buff=0.4)
        note = T("verified when you scan, not continuously", 20, GREY_A).to_edge(DOWN, buff=0.3)
        self.at("Scanning happens when you register", FadeIn(note), rt=0.6)
        self.at("rescan it", FadeIn(rescan), Indicate(rescan, color=BLUE_B), rt=0.8)


class X3_Public(Ep):
    BEAT = 4

    def build(self):
        card = panel(6.6, 3.6, "Content").move_to(LEFT * 2.6 + UP * 0.4)
        facts = VGroup(S256(EXAMPLE_CID, 14, truncate=24), T("Size 65 bytes · expires Oct 2027", 18, GREY_A),
                       T("Also available from", 20, YELLOW, weight=BOLD), M("https://256t.org/AAAAAABB…", 16, GREY_A),
                       M("https://example.net/cids/AAAAAABB…", 16, GREY_A)).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        facts.next_to(card.heading, DOWN, buff=0.25).align_to(card.heading, LEFT)
        card.add(facts[:2])
        self.at("Suppliers are always public", FadeIn(card), rt=0.6)
        self.at("which registered suppliers have a verified copy", FadeIn(facts[2:]), rt=0.8)
        api = M("GET /api/content/{cid}/suppliers", 20, TEAL_B).next_to(card, DOWN, buff=0.4)
        self.go(AddTextLetterByLetter(api), rt=0.8)
        reader = Person(GREEN, label="reader").move_to(RIGHT * 4.6 + UP * 1.6)
        other = server("256t.org", mono=True, mark=True).move_to(RIGHT * 4.6 + DOWN * 1.4)
        self.at("go fetch it there directly", FadeIn(reader), FadeIn(other), rt=0.5)
        file = FileIcon(width=0.35, height=0.45).move_to(other)
        self.go(file.animate.next_to(reader, LEFT, buff=0.2), rt=0.8)
        machine = HashMachine(width=1.0, height=0.6).scale(0.5).next_to(reader, DOWN, buff=0.3)
        machine.label.scale(0.5)
        self.go(FadeIn(machine), rt=0.4)
        check = check_mark(GREEN, 0.3).next_to(machine, RIGHT, buff=0.2)
        math_ = T("trust the math, not the supplier", 24, GREEN).to_edge(DOWN, buff=0.3)
        self.at("You only have to trust the math", Create(check), FadeIn(math_), rt=0.8)


class X3_Fallback(Ep):
    BEAT = 5

    def build(self):
        reader = Person(GREEN, label="reader").move_to(LEFT * 5.8 + UP * 0.6)
        sandbox = Sandbox(2.8, 1.8).move_to(LEFT * 1.6 + UP * 0.6)
        empty = Rectangle(width=0.8, height=0.42, color=GREY_C).move_to(sandbox).shift(DOWN * 0.2)
        expired = T("expired", 16, RED).next_to(empty, DOWN, buff=0.1)
        sups = VGroup(server("supplier A"), server("supplier B")).arrange(DOWN, buff=0.8).move_to(RIGHT * 3.4 + UP * 0.6)
        self.at("When HashBin can't serve a file itself", FadeIn(reader), FadeIn(sandbox), FadeIn(empty), FadeIn(expired), FadeIn(sups), rt=0.8)
        req = Arrow(reader.get_right(), sandbox.box.get_left(), buff=0.1, color=GREEN_B)
        nf = StatusChip(404).scale(0.7).next_to(sandbox, UP, buff=0.2)
        self.at("instead of answering", GrowArrow(req), FadeIn(nf), rt=0.6)
        self.go(Create(cross_mark(RED, 0.4).move_to(nf)), rt=0.4)
        pick = SurroundingRectangle(sups[0], color=YELLOW, buff=0.08)
        self.at("picks one of the file's verified suppliers at random", Create(pick), rt=0.6)
        redirect = CurvedArrow(reader.get_top() + UP * 0.1, sups[0].get_left(), angle=-0.6, color=YELLOW)
        r_lab = T("redirect", 20, YELLOW).next_to(redirect, UP, buff=0.05)
        self.at("send you straight to the supplier", Create(redirect), FadeIn(r_lab), rt=0.8)
        proxy1 = Arrow(sups[0].get_left(), sandbox.box.get_right(), buff=0.1, color=TEAL_B)
        proxy2 = Arrow(sandbox.box.get_bottom(), reader.get_bottom() + RIGHT * 0.3, buff=0.1, color=TEAL_B, path_arc=-0.5)
        p_lab = T("proxy", 20, TEAL_B).next_to(proxy2, DOWN, buff=0.05)
        self.at("fetch the file from the supplier and pass it along", GrowArrow(proxy1), GrowArrow(proxy2), FadeIn(p_lab), rt=1.0)
        hundredth = T("checked every 100th request", 18, TEAL_B).next_to(p_lab, DOWN, buff=0.08)
        self.at("every hundredth time", FadeIn(hundredth), rt=0.5)
        scores = VGroup(T("success: 97 of last 100", 14, GREEN).next_to(sups[0], RIGHT, buff=0.15),
                        T("success: 91 of last 100", 14, ORANGE).next_to(sups[1], RIGHT, buff=0.15))
        rule = T("≥ 95%: direct · below: proxied and checked", 20, GREY_A).to_edge(UP, buff=0.3)
        self.at("earn the direct route", FadeIn(scores), FadeIn(rule), rt=0.8)
        notes = VGroup(T("never copied back into HashBin's storage", 20, GREY_A), T("no download allowance applies", 20, GREY_A))
        notes.arrange(DOWN, aligned_edge=LEFT, buff=0.12).to_edge(DOWN, buff=0.35)
        self.at("isn't copied back", FadeIn(notes[0]), rt=0.5)
        self.at("download allowances don't apply", FadeIn(notes[1]), rt=0.5)
        self.at("The supplier is the one doing the serving", Indicate(sups[0], color=YELLOW), rt=0.8)


class X3_Recap(Ep):
    BEAT = 6

    def build(self):
        cid = S256(EXAMPLE_CID, 18, truncate=30).move_to(UP * 2.6)
        hosts = Group(Sandbox(2.4, 1.4), server("256t.org", mono=True, mark=True), server("a GitHub folder"), server("your own server"))
        hosts.arrange(RIGHT, buff=0.35).move_to(UP * 0.6)
        lines = VGroup(*[DashedLine(cid.get_bottom(), h.get_top(), color=YELLOW, stroke_width=2) for h in hosts])
        self.at("names content, not a place", FadeIn(cid), FadeIn(hosts), Create(lines), rt=0.8)
        self.at("other servers can carry", hosts[0].animate.fade(0.7), rt=0.6)
        self.at("HashBin checks every one", *[Create(check_mark(GREEN, 0.22).next_to(h, DOWN, buff=0.1)) for h in hosts[1:]], rt=0.6)
        card = NextCard(("D1", "", True), ("01", "", False)).scale(0.6).to_edge(DOWN, buff=0.25)
        self.at("let's start writing code", FadeIn(card), rt=0.8)
