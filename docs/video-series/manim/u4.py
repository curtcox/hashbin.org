"""U4 · Who Can See What"""

import random

from hb.common import *


class Ep(Beat):
    EPISODE = "U4-who-can-see-what"


class U4_Unlisted(Ep):
    BEAT = 1

    def build(self):
        bins = Bins(3, 6, width=0.9, height=0.45).move_to(UP * 2.3)
        question = T("Private?", 48, WHITE, weight=BOLD).move_to(bins)
        self.at("whether uploads are private", FadeIn(bins), rt=0.6)
        self.go(FadeIn(question, scale=0.8), bins.animate.set_opacity(0.3), rt=0.6)
        arc = Arc(radius=2.0, start_angle=PI, angle=-PI, color=GREY_B, stroke_width=6).move_to(DOWN * 0.2)
        left = VGroup(padlock(GREY_A, 0.5), T("Private", 22)).arrange(DOWN, buff=0.1).next_to(arc.get_start(), DOWN, buff=0.2)
        right = VGroup(Rectangle(width=0.8, height=0.5, color=GREY_A), T("Public", 22)).arrange(DOWN, buff=0.1).next_to(arc.get_end(), DOWN, buff=0.2)
        center = arc.get_arc_center()
        needle = Line(center, center + UP * 1.7, color=YELLOW, stroke_width=6).rotate(PI / 2.5, about_point=center)
        self.at("The honest answer is", FadeOut(question), Create(arc), FadeIn(left), FadeIn(right), FadeIn(needle), rt=0.8)
        label = T("Unlisted", 36, YELLOW, weight=BOLD).next_to(arc, UP, buff=0.15)
        self.at("they're unlisted", Rotate(needle, -PI / 2.5 - 0.15, about_point=center), FadeIn(label), rt=1.0)
        under = VGroup(T("Anyone with the link can open it.", 26), T("No one can find it without the link.", 26)).arrange(DOWN, buff=0.15)
        under.to_edge(DOWN, buff=0.25)
        self.at("Anyone who has a file's link", FadeIn(under[0]), rt=0.6)
        self.at("nobody can find the file", FadeIn(under[1]), rt=0.6)
        self.at("Both halves", Indicate(under[0]), Indicate(under[1]), rt=1.0)


class U4_NoSearch(Ep):
    BEAT = 2

    def build(self):
        bins = Bins(3, 6, width=0.9, height=0.45).move_to(RIGHT * 2.0 + DOWN * 0.4)
        stranger = Person(GREY, label="a stranger").move_to(LEFT * 5.4 + DOWN * 0.4)
        self.go(FadeIn(bins), FadeIn(stranger), rt=0.6)
        frames = VGroup()
        for text in ("search", "directory", "recent uploads"):
            frame = VGroup(DashedVMobject(RoundedRectangle(corner_radius=0.1, width=2.8, height=0.8, color=GREY_B), num_dashes=24),
                           T(text, 22, GREY_B))
            frame[1].move_to(frame[0])
            frames.add(frame)
        frames.arrange(RIGHT, buff=0.4).to_edge(UP, buff=0.6)
        self.at("no search", FadeIn(frames[0]), rt=0.4)
        self.at("no directory", FadeIn(frames[1]), rt=0.4)
        self.at("no list of recent uploads", FadeIn(frames[2]), rt=0.4)
        self.go(*[Create(cross_mark(RED, 0.6).move_to(f)) for f in frames], rt=0.6)
        self.at("The only way in", Indicate(bins, color=YELLOW, scale_factor=1.03), rt=0.8)

        attempts = Number(0, size=28).move_to(LEFT * 4.0 + DOWN * 2.8)
        attempts_label = T("guesses", 22, GREY_A)
        attempts_label.add_updater(lambda m: m.next_to(attempts, RIGHT, buff=0.15))
        hits = VGroup(T("hits: 0", 28, GREEN)).move_to(RIGHT * 1.0 + DOWN * 2.8)
        self.at("you can't guess one", FadeIn(attempts), FadeIn(attempts_label), FadeIn(hits), rt=0.4)
        rng = random.Random(4)
        tracker_anim = counting(attempts, 1_000_000)
        guesses = []
        for i in range(6):
            s = "".join(rng.choice(ALPHABET) for _ in range(12)) + "…"
            g = M(s, 16, GREY_B).next_to(stranger, RIGHT, buff=0.2)
            guesses.append(g)
        self.play(tracker_anim, *[Succession(Wait(i * 0.4), FadeIn(g, run_time=0.01), g.animate(run_time=0.5).move_to(bins.drawer(rng.randrange(18))),
                                             FadeOut(g, run_time=0.2)) for i, g in enumerate(guesses)], run_time=3.0, rate_func=linear)
        chip = StatusChip(404).next_to(bins, LEFT, buff=0.3).shift(UP * 1.4)
        self.go(FadeIn(chip, scale=0.6), rt=0.4)
        expr = VGroup(T("possible fingerprints:", 24, GREY_A), Expr(("2", "512"), size=32)).arrange(RIGHT, buff=0.2).to_corner(DR, buff=0.5)
        self.at("five-hundred-twelve-bit fingerprint", FadeIn(expr), rt=0.6)
        self.at("unimaginably large", Indicate(expr[1], color=YELLOW), rt=0.8)


class U4_LinkIsKey(Ep):
    BEAT = 3

    def build(self):
        cid = name_256t(b"vacation photos" * 20)
        uploader = Person(BLUE, height=0.8).move_to(LEFT * 6.0 + UP * 1.5)
        link = S256(cid, 14, truncate=10).next_to(uploader, RIGHT, buff=0.2)
        self.go(FadeIn(uploader), FadeIn(link), rt=0.5)
        friend = Person(GREEN, height=0.7).move_to(LEFT * 3.4 + UP * 1.5)
        more = VGroup(Person(GREEN, height=0.6), Person(GREEN, height=0.6)).arrange(DOWN, buff=0.4).move_to(LEFT * 1.4 + UP * 1.5)
        forum = VGroup(RoundedRectangle(corner_radius=0.1, width=2.0, height=1.3, color=GREY_B), T("forum", 20, GREY_A))
        forum[1].move_to(forum[0])
        forum.move_to(RIGHT * 1.2 + UP * 1.5)
        self.at("Once you've given it to someone", FadeIn(friend), link.copy().animate.next_to(friend, UP, buff=0.1), rt=0.8)
        self.at("anyone else", FadeIn(more), FadeIn(forum), *[link.copy().animate.scale(0.8).next_to(m, RIGHT, buff=0.1) for m in more],
                link.copy().animate.move_to(forum).shift(DOWN * 0.3), rt=1.0)
        crowd = VGroup(*[Person(GREY_B, height=0.4) for _ in range(6)]).arrange_in_grid(2, 3, buff=0.2).next_to(forum, RIGHT, buff=0.4)
        self.go(LaggedStart(*[FadeIn(c) for c in crowd], lag_ratio=0.1), rt=0.6)
        key = VGroup(key_icon(GOLD, 0.8), T("Treat the link like a password.", 26, GOLD)).arrange(RIGHT, buff=0.3).move_to(UP * 0.0)
        self.at("treat the link like a password", FadeIn(key, shift=UP * 0.2), rt=0.8)

        inset1 = panel(5.8, 2.4).move_to(LEFT * 3.4 + DOWN * 2.2)
        tiny = S256(name_256t(b"meet at 6"), 26).move_to(inset1.rect).shift(UP * 0.4)
        decoded = T('decodes to: "meet at 6"', 22, GREEN).next_to(tiny, DOWN, buff=0.2)
        note1 = T("≤ 64 bytes: the link is the content", 18, GREY_A).next_to(decoded, DOWN, buff=0.15)
        inset1.add(tiny, decoded, note1)
        self.at("Tiny files", FadeIn(inset1), rt=0.6)
        self.at("in a chat log or a screenshot", Indicate(decoded, color=GREEN), rt=0.8)

        inset2 = panel(6.0, 2.4).move_to(RIGHT * 3.4 + DOWN * 2.2)
        has = FileIcon(width=0.4, height=0.5).move_to(inset2.rect).shift(LEFT * 2.3 + UP * 0.3)
        machine = HashMachine(width=1.2, height=0.7).scale(0.6).next_to(has, RIGHT, buff=0.5)
        machine.label.scale(0.6)
        ask = T('"is this here?"  →  yes', 20).next_to(machine, RIGHT, buff=0.3)
        note2 = T("having the file lets you check whether it's here", 18, GREY_A).move_to(inset2.rect).shift(DOWN * 0.6)
        inset2.add(has, machine)
        self.at("anyone who already has a copy", FadeIn(inset2), rt=0.6)
        self.at("check whether it's on HashBin", FadeIn(ask), rt=0.6)
        self.at("They can't discover new files", FadeIn(note2), rt=0.6)


class U4_EncryptFirst(Ep):
    BEAT = 4

    def build(self):
        computer = RoundedRectangle(corner_radius=0.15, width=4.6, height=3.0, color=BLUE_B).move_to(LEFT * 4.2 + UP * 0.6)
        mine = T("your computer", 20, BLUE_B).next_to(computer, UP, buff=0.1)
        file = FileIcon("tax-return.pdf", width=0.6, height=0.8, label_size=16).move_to(computer).shift(LEFT * 1.2)
        self.at("files that really are private", FadeIn(computer), FadeIn(mine), FadeIn(file), rt=0.6)
        server = Sandbox(3.2, 2.0).move_to(RIGHT * 4.4 + UP * 0.6)
        enc = T("stored encrypted on disk", 18, GREY_B).next_to(server, DOWN, buff=0.1)
        self.at("HashBin stores everything encrypted", FadeIn(server), FadeIn(enc), rt=0.6)
        self.at("anyone with the link gets the file back", Indicate(server, color=WHITE), rt=0.8)

        lock = padlock(GOLD, 0.7).move_to(computer).shift(RIGHT * 1.0)
        self.at("encrypt it yourself", FadeIn(lock), file.animate.move_to(lock).scale(0.3).set_opacity(0), rt=0.8)
        scrambled = ByteGrid(bytes(random.Random(1).randrange(256) for _ in range(12)), cols=4, cell=0.3, text_size=10, color=GREY_B)
        scrambled.move_to(computer).shift(RIGHT * 1.0)
        self.go(FadeOut(file), FadeOut(lock), FadeIn(scrambled), rt=0.6)
        self.go(scrambled.animate.scale(0.8).move_to(server).shift(DOWN * 0.2), rt=1.0)

        friend = Person(GREEN, label="recipient").move_to(RIGHT * 0.4 + DOWN * 2.4)
        link = S256(name_256t(b"scrambled" * 9), 14, truncate=10).move_to(LEFT * 3.4 + DOWN * 1.6)
        phone_key = key_icon(GOLD, 0.5).move_to(LEFT * 3.4 + DOWN * 3.0)
        self.at("send the password", FadeIn(link), FadeIn(phone_key), rt=0.5)
        path1 = Line(link.get_right(), friend.get_left() + UP * 0.2, color=GREY_B)
        path2 = DashedLine(phone_key.get_right(), friend.get_left() + DOWN * 0.2, color=GOLD)
        self.go(Create(path1), Create(path2), rt=0.6)
        self.go(link.animate.next_to(friend, UP, buff=0.1), phone_key.animate.next_to(friend, RIGHT, buff=0.2), rt=0.8)
        opened = padlock(GREEN, 0.4, open_=True).next_to(friend, LEFT, buff=0.3)
        self.go(FadeIn(opened), rt=0.4)
        self.at("only ever holds scrambled bytes", Indicate(scrambled, color=GREY_A), rt=0.8)
        stranger = Person(GREY, height=0.7).move_to(RIGHT * 4.6 + DOWN * 2.4)
        junk = T("#%@!…", 22, GREY_B).next_to(stranger, UP, buff=0.1)
        self.at("the link alone isn't enough", FadeIn(stranger), FadeIn(junk), rt=0.6)


class U4_WhatsPublic(Ep):
    BEAT = 5

    def build(self):
        pub_items = ["size", "upload date", "expiration date", "status: active, disputed, deleted", "deletion records, with reasons",
                     "dispute reports and their evidence"]
        priv_items = ["who uploaded it", "who paid for it", "their email or sign-in provider", "how much they paid"]
        pub = VGroup(T("Public", 32, GREEN, weight=BOLD), *[T(i, 22) for i in pub_items]).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        priv = VGroup(T("Not published", 32, GREY_B, weight=BOLD), *[T(i, 22, GREY_A) for i in priv_items]).arrange(DOWN, aligned_edge=LEFT,
                                                                                                                 buff=0.22)
        pub.move_to(LEFT * 3.4 + UP * 0.9, aligned_edge=UP).shift(UP * 1.6)
        priv.move_to(RIGHT * 3.2 + UP * 0.9, aligned_edge=UP).shift(UP * 1.6)
        self.go(FadeIn(pub[0]), FadeIn(priv[0]), rt=0.5)
        self.at("Its size", FadeIn(pub[1]), rt=0.3)
        self.at("when it was uploaded", FadeIn(pub[2]), rt=0.3)
        self.at("when it expires", FadeIn(pub[3]), rt=0.3)
        self.at("its status", FadeIn(pub[4]), rt=0.3)
        self.at("If it's deleted", FadeIn(pub[5]), rt=0.4)
        self.at("If someone reports it", FadeIn(pub[6]), rt=0.4)
        self.at("who uploaded it", FadeIn(priv[1]), rt=0.3)
        self.at("who paid for it", FadeIn(priv[2:]), rt=0.6)
        box = VGroup(RoundedRectangle(corner_radius=0.12, width=7.6, height=1.0, color=BLUE_B),
                     T("HashBin itself knows which account uploaded what.\nThe Privacy Policy covers when that can be shared.", 20, BLUE_B))
        box[1].move_to(box[0])
        box.move_to(DOWN * 2.2)
        self.at("unlisted isn't anonymous to HashBin itself", FadeIn(box), rt=0.8)
        self.at("Privacy Policy", Indicate(box[1], color=BLUE_B, scale_factor=1.03), rt=0.6)
        line = T("HashBin doesn't scan or inspect file contents.", 24, WHITE).to_edge(DOWN, buff=0.3)
        self.at("doesn't scan or inspect", FadeIn(line), rt=0.6)


class U4_Sandbox(Ep):
    BEAT = 6

    def build(self):
        left = HashBinPanel(4.2, 3.4).move_to(LEFT * 3.6)
        left.add(T("your account\nbalance\nsign-in", 22, GREY_A).move_to(left.box))
        right = Sandbox(4.2, 3.4).move_to(RIGHT * 3.6)
        right_note = T("raw files only", 22, GREY_A).move_to(right).shift(DOWN * 1.1)
        wall = Rectangle(width=0.35, height=4.2, stroke_width=0, fill_color=GREY_C, fill_opacity=1)
        bricks = VGroup(*[Line(LEFT * 0.17, RIGHT * 0.17, color=BG, stroke_width=2).move_to(UP * (y * 0.4 - 2.0)) for y in range(11)])
        self.at("a separate address", FadeIn(right), FadeIn(right_note), rt=0.6)
        self.at("where accounts live", FadeIn(left), rt=0.6)
        self.at("Browsers keep the two completely apart", FadeIn(wall), FadeIn(bricks), rt=0.6)
        html = FileIcon("page.html", width=0.6, height=0.8, label_size=16).move_to(right).shift(UP * 0.1 + LEFT * 0.6)
        evil = gear(RED, 0.25).next_to(html, RIGHT, buff=0.2)
        self.at("stop scripts from running", FadeIn(html), FadeIn(evil), rt=0.6)
        frozen = T("scripts don't run", 20, RED).next_to(right_note, UP, buff=0.15)
        self.go(Wiggle(evil, rotation_angle=0.02), FadeIn(frozen), rt=0.8)
        reach = DashedLine(evil.get_left(), left.get_right() + RIGHT * 0.1, color=RED)
        self.at("booby-trapped web page", Create(reach), rt=0.6)
        blocked = cross_mark(RED, 0.6).move_to(wall)
        self.at("can't touch anyone's HashBin account", Create(blocked), rt=0.5)
        cap = caption("Same idea GitHub and Google Drive use for user files.")
        self.go(FadeIn(cap), rt=0.6)


class U4_Recap(Ep):
    BEAT = 7

    def build(self):
        lines = VGroup(T("Unlisted: the link is the key.", 32), T("Encrypt sensitive files yourself.", 32),
                       T("Uploaders aren't published; reports and deletions are.", 28)).arrange(DOWN, buff=0.4).move_to(UP * 1.6)
        self.at("Unlisted, not private", FadeIn(lines[0], shift=UP * 0.2), rt=0.6)
        self.at("lock sensitive files yourself", FadeIn(lines[1], shift=UP * 0.2), rt=0.6)
        self.go(FadeIn(lines[2], shift=UP * 0.2), rt=0.6)
        card = NextCard(("X1", "", True), ("D1", "", False)).scale(0.65).to_edge(DOWN, buff=0.3)
        self.at("what happens when someone believes", FadeIn(card), rt=0.8)
