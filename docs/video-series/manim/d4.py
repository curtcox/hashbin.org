"""D4 · Under the Hood"""

import random

from hb.common import *


class Ep(Beat):
    EPISODE = "D4-under-the-hood"


def cube(label, color=BLUE_D, size=0.9, text_size=13):
    face = Square(size, color=color, fill_color=color, fill_opacity=0.25)
    top = Polygon(face.get_corner(UL), face.get_corner(UL) + [0.25, 0.2, 0], face.get_corner(UR) + [0.25, 0.2, 0], face.get_corner(UR),
                  color=color, fill_color=color, fill_opacity=0.4)
    side = Polygon(face.get_corner(UR), face.get_corner(UR) + [0.25, 0.2, 0], face.get_corner(DR) + [0.25, 0.2, 0], face.get_corner(DR),
                   color=color, fill_color=color, fill_opacity=0.15)
    text = T(label, text_size, WHITE).next_to(face, DOWN, buff=0.08)
    return VGroup(face, top, side, text)


class D4_TwoWorkers(Ep):
    BEAT = 1

    def build(self):
        world = Ellipse(width=12, height=5.4, color=GREY_D).move_to(UP * 0.2)
        rng = random.Random(5)
        spots = [np.array([rng.uniform(-5.2, 5.2), rng.uniform(-2.0, 2.4), 0]) for _ in range(26)]
        dots = VGroup(*[Dot(p, radius=0.05, color=GREY_B) for p in spots])
        self.at("two small programs", FadeIn(world), FadeIn(dots), rt=0.8)
        blues = VGroup(*[gear(BLUE, 0.13, 8).move_to(p + LEFT * 0.12) for p in spots])
        teals = VGroup(*[gear(TEAL_C, 0.1, 8).move_to(p + RIGHT * 0.12) for p in spots])
        self.at("close to wherever the request comes from", FadeIn(blues, scale=0.5), FadeIn(teals, scale=0.5), rt=0.8)
        self.at("One runs hashbin dot org", FadeOut(VGroup(world, dots, blues, teals)), rt=0.5)
        big = gear(BLUE, 1.0, 12, "hashbin.org worker", 22).move_to(LEFT * 3.2 + UP * 0.2)
        arms = VGroup(*[T(t, 18, BLUE_B) for t in ("the website", "the API", "sign-in", "payments", "OAuth")])
        for i, arm in enumerate(arms):
            angle = PI / 2 + (i - 2) * 0.55 + PI
            arm.move_to(big[0].get_center() + 2.0 * np.array([np.cos(angle), np.sin(angle), 0]))
        self.go(FadeIn(big), rt=0.5)
        self.at("the website, the API", LaggedStart(*[FadeIn(a) for a in arms], lag_ratio=0.2), Rotate(big[:2], PI / 3), rt=1.2)
        small = gear(TEAL_C, 0.8, 10, "256t.us worker", 22).move_to(RIGHT * 3.6 + UP * 0.2)
        one = T("serve a file", 20, TEAL_B).next_to(small, RIGHT, buff=0.3)
        self.at("The other runs", FadeIn(small), rt=0.5)
        self.at("exactly one thing", FadeIn(one), Rotate(small[:2], -PI / 3), rt=0.8)
        self.at("starting with the simple one", Circumscribe(small[0], color=TEAL_C, shape=Circle), rt=0.8)


class D4_DownloadPath(Ep):
    BEAT = 2

    def build(self):
        items = ["Is it a valid 256t string?  (else 404)", "More than 30 requests this minute?  (else 429)", "{cid}.deleted marker?  (404)",
                 "{cid}.disputed marker?  (451)", "{cid}.meta expired?  (404)", "≤ 64 bytes: decode from the string · else stream from R2"]
        rows = VGroup(*[T(f"{i + 1}. {t}", 20, GREY_B) for i, t in enumerate(items)]).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        rows.move_to(LEFT * 2.2 + UP * 0.6)
        request = M("GET 256t.us/{cid}", 20, TEAL_B).next_to(rows, UP, buff=0.35).align_to(rows, LEFT)
        self.at("fits on one screen", FadeIn(request), FadeIn(rows), rt=0.6)
        bins = Bins(2, 3, width=0.8, height=0.42).move_to(RIGHT * 4.6 + UP * 1.4)
        tags = VGroup(M(".meta", 14, GREY_A), M(".disputed", 14, RED), M(".deleted", 14, GREY_B)).arrange(DOWN, aligned_edge=LEFT, buff=0.06)
        tags.next_to(bins, DOWN, buff=0.2)
        r2 = T("R2 · each file under its 256t string", 16, GREY_A).next_to(tags, DOWN, buff=0.15)
        for i, cue in enumerate(("well formed", "per-address rate limit", "one if the file was deleted", "one if it's under dispute",
                                 "one recording when it expires")):
            self.at(cue, rows[i].animate.set_color(WHITE), rt=0.3)
            if i == 2:
                self.go(FadeIn(bins), FadeIn(tags), rt=0.4)
        self.at("decodes it straight from the string", rows[5].animate.set_color(WHITE), rt=0.4)
        self.at("R2", FadeIn(r2), rt=0.4)
        headers = VGroup(M("Content-Security-Policy: default-src 'none'; sandbox", 16, GREEN_B), M("X-Content-Type-Options: nosniff", 16, GREEN_B),
                         M("Access-Control-Allow-Origin: *", 16, GREEN_B)).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        headers.to_edge(DOWN, buff=0.4).shift(LEFT * 1.4)
        self.at("strict headers", FadeIn(headers, shift=UP * 0.2), rt=0.6)
        self.at("very little that can go wrong", Indicate(rows, color=WHITE, scale_factor=1.02), rt=0.6)
        never = T("never touches an account", 20, TEAL_B).next_to(headers, RIGHT, buff=0.5)
        self.at("never touches anyone's account", FadeIn(never), rt=0.5)


class D4_DurableObjects(Ep):
    BEAT = 3

    def build(self):
        labels = ["ContentMetadata ×", "UserProfile ×", "PaymentRecord", "DisputeRecord", "KeyRegistry", "ApplicationRegistry",
                  "ExpirationIndex", "DeletionRecord", "BackupIndex"]
        cubes = VGroup(*[cube(l) for l in labels]).arrange_in_grid(3, 3, buff=(1.2, 0.5)).move_to(UP * 0.2)
        self.at("Durable Objects", LaggedStart(*[FadeIn(c, shift=UP * 0.2) for c in cubes], lag_ratio=0.08), rt=1.2)
        self.at("each thing gets its own tiny one", Indicate(cubes, color=WHITE, scale_factor=1.02), rt=0.6)
        self.at("Every file has an object", Indicate(cubes[0], color=BLUE_B), rt=0.5)
        self.at("Every user has one", Indicate(cubes[1], color=BLUE_B), rt=0.5)
        self.at("Disputes, payments", Indicate(cubes[2:6], color=BLUE_B), rt=0.6)

        self.at("one at a time", FadeOut(VGroup(*[c for i, c in enumerate(cubes) if i != 1])), cubes[1].animate.scale(1.8).move_to(ORIGIN), rt=0.8)
        balance = Money(1.00, 26, GOLD).next_to(cubes[1], UP, buff=0.3)
        self.go(FadeIn(balance), rt=0.3)
        a = VGroup(FileIcon(width=0.35, height=0.45, lines=False), T("−60¢", 18, GOLD)).arrange(DOWN, buff=0.05).move_to(LEFT * 5 + UP * 0.4)
        b = VGroup(FileIcon(width=0.35, height=0.45, lines=False), T("−60¢", 18, GOLD)).arrange(DOWN, buff=0.05).move_to(LEFT * 5 + DOWN * 0.8)
        self.at("two uploads try to spend the same balance", FadeIn(a), FadeIn(b), rt=0.5)
        door = cubes[1][0].get_left()
        self.go(a.animate.next_to(door, LEFT, buff=0.2), b.animate.next_to(door, LEFT, buff=1.0), rt=0.6)
        self.at("One goes first", a.animate.move_to(cubes[1][0]).set_opacity(0), balance.tracker.animate.set_value(0.40), rt=0.8)
        refused = T("insufficient balance", 20, RED).next_to(b, DOWN, buff=0.2)
        self.at("the second sees what's left", b.animate.next_to(door, LEFT, buff=0.2), rt=0.4)
        self.go(b.animate.shift(LEFT * 0.8), FadeIn(refused), rt=0.5)
        label = T("one at a time, per object", 24, YELLOW).to_edge(DOWN, buff=0.4)
        self.at("No overspending", FadeIn(label), rt=0.5)


class D4_Services(Ep):
    BEAT = 4

    def build(self):
        worker = gear(BLUE, 0.8, 12, "hashbin.org worker", 20).move_to(ORIGIN)
        clerk = VGroup(RoundedRectangle(corner_radius=0.15, width=3.0, height=1.2, color=GREY_A), T("Clerk: sign-in", 22))
        stripe = VGroup(RoundedRectangle(corner_radius=0.15, width=3.0, height=1.2, color=GREY_A), T("Stripe: card payments", 22))
        for box in (clerk, stripe):
            box[1].move_to(box[0])
        clerk.move_to(LEFT * 4.6 + UP * 1.6)
        stripe.move_to(RIGHT * 4.6 + UP * 1.6)
        self.at("handed to specialists", FadeIn(worker), rt=0.5)
        self.at("Sign-in goes through Clerk", FadeIn(clerk), Create(Line(clerk.get_right(), worker[0].get_left(), color=GREY_B)), rt=0.6)
        no_pw = T("HashBin never holds passwords", 18, GREY_A).next_to(clerk, DOWN, buff=0.15)
        self.at("never holds passwords", FadeIn(no_pw), rt=0.4)
        self.at("Card payments go through Stripe", FadeIn(stripe), Create(Line(stripe.get_left(), worker[0].get_right(), color=GREY_B)), rt=0.6)
        no_card = T("HashBin never sees card numbers", 18, GREY_A).next_to(stripe, DOWN, buff=0.15)
        self.at("never sees card numbers", FadeIn(no_card), rt=0.4)
        mail = envelope(WHITE, 0.8, seal=True).next_to(stripe, DOWN, buff=0.8)
        self.at("a signed message", FadeIn(mail), rt=0.4)
        self.go(mail.animate.next_to(worker, RIGHT, buff=0.2), rt=0.8)
        ok = check_mark(GREEN, 0.3).next_to(mail, UP, buff=0.1)
        profile = cube("UserProfile").move_to(DOWN * 2.4)
        credit = T("+$10.00", 22, GOLD).next_to(profile, RIGHT, buff=0.3)
        self.at("only then is the balance credited", Create(ok), FadeIn(profile), rt=0.5)
        self.go(FadeIn(credit, shift=UP * 0.2), rt=0.5)


class D4_Nightly(Ep):
    BEAT = 5

    def build(self):
        clock = VGroup(clock_icon(WHITE, 0.6, 2, 0), T("2:00 UTC", 24)).arrange(DOWN, buff=0.15).move_to(LEFT * 5.2 + UP * 1.6)
        self.at("two in the morning", FadeIn(clock), rt=0.6)
        tasks = ["Delete content whose time is up", "Close disputes older than 30 days", "Remove the bytes of deleted content, a day later",
                 "Compute statistics and check for anomalies", "Snapshot every record; keep the last 30"]
        rows = VGroup(*[VGroup(Square(0.3, color=GREY_B), T(t, 22)).arrange(RIGHT, buff=0.2) for t in tasks]).arrange(DOWN, aligned_edge=LEFT, buff=0.25)
        rows.move_to(RIGHT * 1.0 + UP * 1.0)
        self.go(FadeIn(rows), rt=0.5)
        for i, cue in enumerate(("deletes content whose retention has run out", "closes disputes", "removes the stored bytes", "computes statistics",
                                 "takes a snapshot")):
            self.at(cue, Create(check_mark(GREEN, 0.18).move_to(rows[i][0])), rt=0.4)
        alert = T("→ alert the operator", 18, ORANGE).next_to(rows[3], RIGHT, buff=0.2)
        snaps = VGroup(*[Rectangle(width=0.32, height=0.4, color=TEAL_C, fill_color=TEAL_C, fill_opacity=0.3) for _ in range(30)])
        snaps.arrange(RIGHT, buff=0.06).to_edge(DOWN, buff=0.7)
        label = T("backups bucket · last 30 nights", 18, TEAL_B).next_to(snaps, UP, buff=0.15)
        self.go(FadeIn(snaps), FadeIn(label), rt=0.6)
        extra = Rectangle(width=0.32, height=0.4, color=TEAL_C, fill_color=TEAL_C, fill_opacity=0.6).next_to(snaps, RIGHT, buff=0.06)
        self.at("keeping the last thirty nights", FadeIn(extra), rt=0.4)
        self.go(snaps[0].animate.shift(DOWN * 0.6).set_opacity(0), VGroup(*snaps[1:], extra).animate.shift(LEFT * 0.38), rt=0.8)


class D4_Open(Ep):
    BEAT = 6

    def build(self):
        repo = panel(6.6, 4.0, "github.com/curtcox/hashbin.org").move_to(LEFT * 3.0 + UP * 0.6)
        mit = T("MIT license", 16, GREY_A).next_to(repo.heading, RIGHT, buff=0.3)
        entries = VGroup(*[VGroup(M(p, 18, YELLOW), T(d, 16, GREY_A)).arrange(RIGHT, buff=0.3) for p, d in
                           (("src/", "the hashbin.org worker"), ("workers/256t-content/", "the file server"),
                            ("frontend/", "plain HTML, CSS, JavaScript, no build step"), ("STATUS.md", "what's done and what's next"))])
        entries.arrange(DOWN, aligned_edge=LEFT, buff=0.3).next_to(repo.heading, DOWN, buff=0.4).align_to(repo.heading, LEFT)
        self.at("open source", FadeIn(repo), FadeIn(mit), rt=0.6)
        self.at("both workers", FadeIn(entries[:2]), rt=0.5)
        self.at("plain HTML, CSS, and JavaScript", FadeIn(entries[2]), rt=0.5)
        self.at("status file", FadeIn(entries[3]), rt=0.5)
        term = terminal(["$ npm run dev:local", "Ready on http://localhost:8787"], width=5.6, size=18).move_to(RIGHT * 3.6 + UP * 1.4)
        note = T("no Clerk or Stripe needed", 18, GREY_A).next_to(term, DOWN, buff=0.15)
        self.at("run the whole thing on your own machine", FadeIn(term), rt=0.6)
        self.at("using one command", FadeIn(note), rt=0.4)
        steps = VGroup(*[T(t, 18) for t in ("commit", "tests", "deploy", "verify the deployed version")]).arrange(RIGHT, buff=0.6)
        arrows = VGroup(*[Arrow(a.get_right(), b.get_left(), buff=0.1, color=GREY_B) for a, b in zip(steps, steps[1:])])
        loop = CurvedArrow(steps[-1].get_bottom() + DOWN * 0.1, steps[0].get_bottom() + DOWN * 0.1, angle=-1.2, color=GREY_B)
        pipeline = VGroup(steps, arrows, loop).to_edge(DOWN, buff=0.6)
        self.at("tested, deployed, and then checked", FadeIn(steps), *[GrowArrow(a) for a in arrows], rt=0.8)
        self.go(Create(loop), rt=0.6)


class D4_Recap(Ep):
    BEAT = 7

    def build(self):
        gears = VGroup(gear(BLUE, 0.5, 10, "hashbin.org", 16), gear(TEAL_C, 0.4, 8, "256t.us", 16)).arrange(RIGHT, buff=0.6).move_to(LEFT * 4.6 + UP * 2.0)
        store = VGroup(Bins(2, 3, width=0.6, height=0.32, label_size=8), T("R2 + markers", 16, GREY_A)).arrange(DOWN, buff=0.1).move_to(LEFT * 0.8 + UP * 2.0)
        objects = VGroup(*[cube("", size=0.4) for _ in range(6)]).arrange_in_grid(2, 3, buff=0.2)
        objects = VGroup(objects, T("one database per thing", 16, GREY_A)).arrange(DOWN, buff=0.1).move_to(RIGHT * 2.6 + UP * 2.0)
        night = VGroup(clock_icon(WHITE, 0.35, 2), T("night shift", 16, GREY_A)).arrange(DOWN, buff=0.1).move_to(RIGHT * 5.4 + UP * 2.0)
        self.at("Two programs at the edge", FadeIn(gears), rt=0.5)
        self.at("a store of files named by their content", FadeIn(store), rt=0.5)
        self.at("one small database per thing", FadeIn(objects), rt=0.5)
        self.at("a night shift", FadeIn(night), rt=0.5)
        gh = VGroup(RoundedRectangle(corner_radius=0.12, width=5.4, height=0.7, color=GREY_A), M("github.com/curtcox/hashbin.org", 20))
        gh[1].move_to(gh[0])
        gh.move_to(UP * 0.4)
        self.at("all in the open", FadeIn(gh), rt=0.5)
        card = NextCard(("01", "rewatch", False), ("X3", "rewatch", False), heading="You've finished the developer track.").scale(0.6).to_edge(DOWN, buff=0.3)
        self.at("Thanks for watching", FadeIn(card), rt=0.8)
