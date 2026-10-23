"""X2 · Paying for Popularity"""

import random

from hb.common import *


class Ep(Beat):
    EPISODE = "X2-paying-for-popularity"


def turnstile(label="1 min"):
    post = Rectangle(width=0.3, height=1.4, color=GREY_A, fill_color=GREY_D, fill_opacity=1)
    arms = VGroup(*[Line(ORIGIN, RIGHT * 0.6, color=GREY_A, stroke_width=6).rotate(a, about_point=ORIGIN) for a in (0, 2.1, 4.2)])
    arms.move_to(post.get_right() + RIGHT * 0.2)
    timer_box = RoundedRectangle(corner_radius=0.1, width=1.6, height=0.55, color=YELLOW, fill_color=PANEL_BG, fill_opacity=1)
    timer_box.next_to(post, UP, buff=0.15)
    timer = T(label, 22, YELLOW).move_to(timer_box)
    group = VGroup(post, arms, timer_box, timer)
    group.timer = timer
    group.timer_box = timer_box
    return group


class X2_Popular(Ep):
    BEAT = 1

    def build(self):
        sandbox = Sandbox(3.0, 2.0).move_to(ORIGIN)
        file = FileIcon(width=0.5, height=0.65).move_to(sandbox).shift(DOWN * 0.2)
        uploader = Person(BLUE, label="uploader").move_to(LEFT * 5.8 + DOWN * 2.6)
        paid = T("paid a few cents for storage", 18, GOLD).next_to(uploader, RIGHT, buff=0.2)
        self.go(FadeIn(sandbox), FadeIn(file), FadeIn(uploader), FadeIn(paid), rt=0.8)
        rng = random.Random(3)
        one = Person(GREEN, height=0.5).move_to(RIGHT * 3.6 + UP * 1.6)
        self.at("Every time someone downloads it", FadeIn(one), rt=0.5)
        crowd = VGroup()
        for i in range(120):
            angle = rng.uniform(0, TAU)
            radius = rng.uniform(2.6, 6.5)
            p = Person(GREEN, height=0.28).move_to([radius * np.cos(angle) * 1.1, radius * np.sin(angle) * 0.6, 0])
            crowd.add(p)
        meter = VGroup(T("bytes sent", 20, GREY_A), Number(0, size=30, color=TEAL_B)).arrange(RIGHT, buff=0.2).next_to(sandbox, DOWN, buff=0.25)
        self.at("a million people", LaggedStart(*[FadeIn(p, scale=0.5) for p in crowd], lag_ratio=0.01), FadeIn(meter), rt=1.6)
        self.go(counting(meter[1], 987_654_321_000), rt=2.0)
        question = T("Who pays for this?", 36, WHITE).next_to(sandbox, UP, buff=0.3)
        self.go(FadeIn(question), uploader.animate.look(RIGHT + UP), rt=0.6)
        idea = T("a download allowance", 32, YELLOW, weight=BOLD).move_to(question)
        self.at("a download allowance", FadeOut(crowd), ReplacementTransform(question, idea), rt=0.8)
        self.at("pay to raise it", Indicate(idea, color=YELLOW), rt=0.8)


class X2_MTBR(Ep):
    BEAT = 2

    def build(self):
        gate = turnstile("1 min").move_to(LEFT * 0.5 + UP * 1.0)
        sandbox = Sandbox(2.4, 1.6).move_to(RIGHT * 4.4 + UP * 1.0)
        label = T("minimum time between requests", 28, YELLOW).to_edge(UP, buff=0.3)
        self.at("the minimum time between requests", FadeIn(gate), FadeIn(sandbox), Write(label), rt=1.0)
        axis = NumberLine(x_range=[0, 90, 10], length=11, include_tip=False, color=GREY_B).move_to(DOWN * 1.6)
        ticks = VGroup(*[T(f"{s}s", 14, GREY_B).next_to(axis.n2p(s), DOWN, buff=0.1) for s in range(0, 91, 30)])
        self.go(Create(axis), FadeIn(ticks), rt=0.6)
        first = Dot(color=GREEN).move_to(axis.n2p(0) + UP * 0.4)
        window = Rectangle(width=axis.n2p(60)[0] - axis.n2p(0)[0], height=0.25, stroke_width=0, fill_color=YELLOW, fill_opacity=0.25)
        window.move_to(axis.n2p(0), aligned_edge=LEFT).shift(UP * 0.4)
        self.at("after it's served", FadeIn(first, scale=0.5), FadeIn(window), rt=0.6)
        second = Dot(color=ORANGE).move_to(axis.n2p(20) + UP * 0.4)
        chip = StatusChip(429).scale(0.8).next_to(second, UP, buff=0.3)
        wait = T('"Wait until 12:01:00"', 18, ORANGE).next_to(chip, UP, buff=0.1)
        self.at("a minute later", FadeIn(second, scale=0.5), rt=0.5)
        self.at("four twenty-nine", FadeIn(chip, scale=0.6), rt=0.5)
        self.go(FadeIn(wait), rt=0.4)
        third = Dot(color=GREEN).move_to(axis.n2p(70) + UP * 0.4)
        self.go(FadeIn(third, scale=0.5), rt=0.5)

        self.at("Shrink that minimum", FadeOut(VGroup(chip, wait, second, first, third, window)), rt=0.5)
        fast = T("100 ms", 22, YELLOW).move_to(gate.timer)
        self.at("a tenth of a second", Transform(gate.timer, fast), rt=0.4)
        dots = VGroup(*[Dot(radius=0.05, color=GREEN).move_to(axis.n2p(x) + UP * 0.4) for x in np.linspace(0, 90, 60)])
        rate = T("up to 10 per second", 20, GREEN).next_to(gate, DOWN, buff=0.3)
        self.go(LaggedStart(*[FadeIn(d) for d in dots], lag_ratio=0.02), FadeIn(rate), rt=1.0)
        inf = T("∞", 30, RED).move_to(gate.timer)
        blocked = T("blocked", 22, RED).move_to(rate)
        self.at("no allowance at all", FadeOut(dots), Transform(gate.timer, inf), Transform(rate, blocked), rt=0.6)
        self.at("every request is turned away", Wiggle(gate), rt=0.6)
        shared = T("per file, shared by everyone", 22, GREY_A).next_to(sandbox, DOWN, buff=0.2)
        self.at("per file, shared by everyone", FadeIn(shared), rt=0.6)
        lane = VGroup(S256(name_256t(b"hi there"), 18), T("≤ 64 bytes: no limit", 18, GREEN)).arrange(RIGHT, buff=0.3)
        lane.move_to(DOWN * 2.8 + LEFT * 2.0)
        self.at("Tiny files", FadeIn(lane[1]), FadeIn(lane[0]), rt=0.4)
        self.go(lane[0].animate.shift(RIGHT * 6.0), rt=1.4)


class X2_Pricing(Ep):
    BEAT = 3

    def build(self):
        title = T("charge for the most it could possibly cost", 28, YELLOW).to_edge(UP, buff=0.3)
        self.at("charge for the most it could possibly cost", FadeIn(title), rt=0.8)
        timeline = Timeline(30, 10, label_every=5, label_fn=lambda d: f"day {d}", size=14).move_to(DOWN * 2.4)
        self.at("once a minute for thirty days", FadeIn(timeline), rt=0.6)
        ticks = VGroup(*[Line(UP * 0.0, UP * 0.25, color=YELLOW, stroke_width=1).move_to(timeline.x(x), aligned_edge=DOWN)
                         for x in np.linspace(0, 30, 400)])
        count = Number(0, size=30, color=YELLOW).next_to(timeline, UP, buff=0.5).shift(LEFT * 1.2)
        count_label = T("possible requests", 22, GREY_A)
        count_label.add_updater(lambda m: m.next_to(count, RIGHT, buff=0.15))
        self.at("forty-three thousand two hundred minutes", LaggedStart(*[FadeIn(t) for t in ticks], lag_ratio=0.003), FadeIn(count),
                FadeIn(count_label), rt=1.0)
        self.go(counting(count, 43200), rt=1.0)
        rect = Rectangle(width=10, height=1.6, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.35).next_to(timeline, UP, buff=0.05)
        h_lab = T("1 MB each", 18, GOLD).next_to(rect, LEFT, buff=0.1)
        area = T("≈ 42 GB maximum", 30, WHITE, weight=BOLD).move_to(rect)
        self.at("about forty-two gigabytes", FadeOut(count), FadeOut(count_label), GrowFromEdge(rect, DOWN), FadeIn(h_lab), rt=0.8)
        self.go(FadeIn(area), rt=0.4)
        formula = T("price = size × ⌊duration ÷ min. time⌋ × $0.02 per GB, rounded up", 24).next_to(title, DOWN, buff=0.3)
        self.at("two cents per gigabyte", Write(formula), rt=1.2)
        price = T("$0.85", 40, GOLD, weight=BOLD).next_to(formula, DOWN, buff=0.3)
        self.at("eighty-five cents", FadeIn(price, scale=0.6), rt=0.6)

        self.at("the same picture as storage pricing", FadeOut(VGroup(ticks, area, price)), Indicate(rect, color=GOLD), rt=0.8)
        table = rows_table([["1 MB", "1 per hour", "30 days", "$0.02"], ["1 MB", "1 per minute", "30 days", "$0.85"],
                            ["10 MB", "1 per minute", "30 days", "$8.44"], ["1 MB", "1 per second", "30 days", "$50.63"]],
                           [1.6, 2.4, 1.8, 1.6], size=22, header=["File", "Rate", "For", "Price"])
        table.move_to(UP * 0.4 + LEFT * 0.0)
        self.go(FadeOut(rect), FadeOut(h_lab), FadeOut(timeline), FadeIn(table[0]), rt=0.5)
        self.at("Once an hour costs two cents", FadeIn(table[1]), rt=0.4)
        self.at("Once a minute", FadeIn(table[2]), FadeIn(table[3]), rt=0.4)
        self.at("Once a second", FadeIn(table[4]), rt=0.4)
        sixty = T("60× the possible downloads", 20, GREY_A).next_to(table[4], RIGHT, buff=0.3)
        self.at("sixty times as many", FadeIn(sixty), rt=0.4)
        note = VGroup(T("Pay for what could be sent, not what is.", 26), T("No refunds for unused allowance · no surprise bills", 20, GREY_A))
        note.arrange(DOWN, buff=0.15).to_edge(DOWN, buff=0.4)
        self.at("paying for what could be sent", FadeIn(note[0]), rt=0.6)
        self.at("nobody gets a surprise bill", FadeIn(note[1]), rt=0.6)


class X2_Rules(Ep):
    BEAT = 4

    def build(self):
        timeline = Timeline(12, 11, size=14).move_to(DOWN * 2.2)
        expiry = timeline.expiry(10, height=4.0)
        bracket = BraceBetweenPoints(timeline.x(0), timeline.x(10), DOWN, color=GREY_B).shift(DOWN * 0.3)
        ret = T("retention", 18, GREY_B).next_to(bracket, DOWN, buff=0.05)
        self.go(FadeIn(timeline), FadeIn(expiry), FadeIn(bracket), FadeIn(ret), rt=0.6)
        specs = [(BLUE, 0.5, 6, "1 per hour", 0.6), (GREEN, 3, 8, "1 per minute", 1.3), (GREEN, 5, 7, "1 per second", 2.0)]
        bars = VGroup()
        for color, a, b, text, y in specs:
            bar = Rectangle(width=timeline.x(b)[0] - timeline.x(a)[0], height=0.4, stroke_color=color, fill_color=color, fill_opacity=0.35)
            bar.move_to(timeline.x(a), aligned_edge=LEFT).shift(UP * y)
            who = Person(color, height=0.4).next_to(bar, LEFT, buff=0.1)
            bars.add(VGroup(bar, T(text, 16).move_to(bar), who))
        self.at("Anyone with a HashBin account can buy", FadeIn(bars[0]), rt=0.6)
        self.at("doesn't have to be the uploader", FadeIn(bars[1]), FadeIn(bars[2]), rt=0.8)
        self.at("covers a span of time", Indicate(bars[1][0], color=GREEN), rt=0.6)
        clip = Rectangle(width=timeline.x(12)[0] - timeline.x(8.5)[0], height=0.4, stroke_color=GREY_B, fill_color=GREY_B, fill_opacity=0.3)
        clip.move_to(timeline.x(8.5), aligned_edge=LEFT).shift(UP * 2.7)
        clipped = T("can't outlast the file", 18, RED).next_to(clip, UP, buff=0.1)
        self.at("can't extend past the file's expiration date", FadeIn(clip), rt=0.4)
        self.go(clip.animate.stretch_to_fit_width(timeline.x(10)[0] - timeline.x(8.5)[0]).align_to(clip, LEFT), FadeIn(clipped), rt=0.6)
        rule = T("the fastest active allowance wins; they don't add up", 22, YELLOW).to_edge(UP, buff=0.3)
        self.at("they don't add together", FadeIn(rule), rt=0.6)
        hl = Rectangle(width=0.15, height=2.4, stroke_width=0, fill_color=YELLOW, fill_opacity=0.35).move_to(timeline.x(0.5), aligned_edge=DOWN)
        self.at("the fastest one that's active", FadeIn(hl), rt=0.3)
        self.go(hl.animate.move_to(timeline.x(10), aligned_edge=DOWN), rate_func=linear, rt=2.4)
        labels = VGroup(*[T(t, 18, GREY_A) for t in ("anyone signed in can buy", "paid from your balance", "not transferable", "no refunds")])
        labels.arrange(RIGHT, buff=0.5).next_to(rule, DOWN, buff=0.2)
        self.at("purchases are final", FadeIn(labels), rt=0.6)


class X2_Default(Ep):
    BEAT = 5

    def build(self):
        timeline = Timeline(90, 11, label_every=15, label_fn=lambda d: f"day {d}", size=14).move_to(DOWN * 0.8)
        file = FileIcon("new upload", width=0.5, height=0.65, label_size=16).next_to(timeline.x(0), UP, buff=1.2)
        self.go(FadeIn(timeline), FadeIn(file), rt=0.6)
        bar = Rectangle(width=timeline.x(30)[0] - timeline.x(0)[0], height=0.4, stroke_color=YELLOW, fill_color=YELLOW, fill_opacity=0.3)
        bar.move_to(timeline.x(0), aligned_edge=LEFT).shift(UP * 0.5)
        label = T("default", 18, YELLOW).move_to(bar)
        self.at("default allowance for its first thirty days", GrowFromEdge(bar, LEFT), FadeIn(label), rt=0.8)
        rate = T("1 request / 30 days", 20, YELLOW).next_to(bar, UP, buff=0.1)
        self.at("one request every thirty days", FadeIn(rate), rt=0.6)
        gate = turnstile("∞").scale(0.7).move_to(timeline.x(60) + UP * 1.4)
        gate.timer.set_color(RED)
        none = T("no allowance until someone buys one", 18, RED).next_to(gate, DOWN, buff=0.15)
        self.at("After the first thirty days", FadeIn(gate), rt=0.6)
        self.at("until someone buys one", FadeIn(none), rt=0.6)
        card = panel(6.4, 1.6, "Status").to_edge(DOWN, buff=0.3)
        card.add(T("Rate limit: 1 request/30 days · until Nov 22", 20).next_to(card.heading, DOWN, buff=0.2).align_to(card.heading, LEFT))
        self.at("content page shows the current allowance", FadeIn(card, shift=UP * 0.2), rt=0.8)


class X2_PerAddress(Ep):
    BEAT = 6

    def build(self):
        sandbox = Sandbox(4.0, 3.4).move_to(RIGHT * 3.4)
        files = VGroup(*[FileIcon(width=0.35, height=0.45, lines=False) for _ in range(12)]).arrange_in_grid(3, 4, buff=0.3).move_to(sandbox)
        files.shift(DOWN * 0.2)
        script = VGroup(Person(GREEN, height=0.8), M("</>", 22, GREEN)).arrange(RIGHT, buff=0.1).move_to(LEFT * 5.0 + UP * 1.2)
        others = VGroup(Person(GREEN, height=0.6), Person(GREEN, height=0.6)).arrange(RIGHT, buff=0.5).move_to(LEFT * 4.8 + DOWN * 2.0)
        self.go(FadeIn(sandbox), FadeIn(files), FadeIn(script), FadeIn(others), rt=0.6)
        count = Number(0, size=28).next_to(script, DOWN, buff=0.3)
        count_label = T("requests this minute", 18, GREY_A)
        count_label.add_updater(lambda m: m.next_to(count, RIGHT, buff=0.15))
        self.at("limits how fast any single network address", FadeIn(count), FadeIn(count_label), rt=0.4)
        arrows = VGroup(*[Arrow(script.get_right(), files[i % 12].get_center(), buff=0.2, color=GREEN_B, stroke_width=2) for i in range(10)])
        self.play(counting(count, 30), LaggedStart(*[Succession(GrowArrow(a), FadeOut(a)) for a in arrows], lag_ratio=0.15), run_time=2.0)
        chip = StatusChip(429).scale(0.8).next_to(script, UP, buff=0.2)
        retry = T("Retry-After: 42", 18, ORANGE).next_to(chip, RIGHT, buff=0.2)
        self.at("thirty a minute, across all files", FadeIn(chip, scale=0.6), rt=0.6)
        ok = VGroup(*[StatusChip(200, short=True).scale(0.7).next_to(o, UP, buff=0.1) for o in others])
        self.go(FadeIn(ok), rt=0.4)
        label = T("30 requests per minute, per network address, across all files", 22, GREY_A).to_edge(DOWN, buff=0.3)
        self.at("isn't for sale", FadeIn(label), rt=0.6)
        self.at("how many seconds to wait", FadeIn(retry), rt=0.5)
        reasons = VGroup(T("429 = the file's allowance", 22, ORANGE), T("or your own request rate", 22, ORANGE)).arrange(DOWN, buff=0.1)
        reasons.to_edge(UP, buff=0.3)
        self.at("two possible reasons", FadeIn(reasons), rt=0.6)


class X2_Recap(Ep):
    BEAT = 7

    def build(self):
        storage = VGroup(Rectangle(width=4.0, height=1.4, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.35),
                         T("storage", 26, GOLD, weight=BOLD), T("size × months × 3¢/GB", 20))
        allowance = VGroup(Rectangle(width=4.0, height=1.4, stroke_color=YELLOW, fill_color=YELLOW, fill_opacity=0.25),
                           T("allowance", 26, YELLOW, weight=BOLD), T("size × possible requests × 2¢/GB", 20))
        for group in (storage, allowance):
            group[1].move_to(group[0])
            group[2].next_to(group[0], DOWN, buff=0.15)
        both = VGroup(storage, allowance).arrange(RIGHT, buff=1.2).move_to(UP * 1.4)
        self.at("Storage buys time", FadeIn(storage), rt=0.6)
        self.at("An allowance buys downloads", FadeIn(allowance), rt=0.6)
        up = T("both priced up front · anyone can pay for either", 22, GREY_A).next_to(both, DOWN, buff=0.7)
        self.at("anyone can pay for either", FadeIn(up), rt=0.6)
        card = NextCard(("X3", "", True), ("D1", "", False)).scale(0.6).to_edge(DOWN, buff=0.25)
        self.at("any server can hand out a copy", FadeIn(card), rt=0.8)
