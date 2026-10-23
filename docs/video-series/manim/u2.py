"""U2 · What It Costs, and Why"""

import math

from hb.common import *


def cents(mb, months):
    return max(1, math.ceil(mb / 1024 * months * 3 - 1e-9))


class Ep(Beat):
    EPISODE = "U2-what-it-costs"


def axes_gb(x_max=12, y_max=1.0, x_len=8.0, y_len=4.2, y_step=0.25, x_step=1):
    axes = Axes(x_range=[0, x_max, x_step], y_range=[0, y_max, y_step], x_length=x_len, y_length=y_len,
                axis_config={"color": GREY_B, "include_tip": False, "stroke_width": 2})
    return axes


class U2_TwoQuestions(Ep):
    BEAT = 1

    def build(self):
        file = FileIcon(width=1.1, height=1.4)
        self.go(FadeIn(file), rt=0.6)
        big = VGroup(DoubleArrow(DOWN * 0.8, UP * 0.8, color=BLUE_B, buff=0), T("How big?", 32, BLUE_B)).arrange(DOWN, buff=0.2)
        big.next_to(file, LEFT, buff=1.6)
        long = VGroup(DoubleArrow(LEFT * 0.9, RIGHT * 0.9, color=GOLD, buff=0), T("How long?", 32, GOLD)).arrange(DOWN, buff=0.3)
        long.next_to(file, RIGHT, buff=1.6)
        self.at("how big is it", FadeIn(big, shift=RIGHT * 0.2), rt=0.8)
        self.at("how long do you want it kept", FadeIn(long, shift=LEFT * 0.2), rt=0.8)
        third = T("How many times is it downloaded?", 30, GREY_A).next_to(file, DOWN, buff=1.0)
        self.at("how many people download it", FadeIn(third), rt=0.8)
        strike = Line(third.get_left(), third.get_right(), color=RED, stroke_width=4)
        free = T("free", 32, GREEN, weight=BOLD).next_to(third, RIGHT, buff=0.3)
        self.at("doesn't affect the price", Create(strike), third.animate.set_opacity(0.5), rt=0.6)
        self.at("Reading is free", FadeIn(free, scale=0.6), rt=0.6)
        self.at("size and time", Indicate(big[1], color=BLUE_B), Indicate(long[1], color=GOLD), rt=1.0)


class U2_CostArea(Ep):
    BEAT = 2

    def build(self):
        axes = axes_gb().move_to(LEFT * 0.6 + DOWN * 0.3)
        ylab = T("size (GB)", 22, BLUE_B).next_to(axes.y_axis, UP, buff=0.15)
        xlab = T("time (months)", 22, GOLD).next_to(axes.x_axis, RIGHT, buff=0.2).shift(DOWN * 0.3)
        ticks = VGroup(*[T(str(m), 16, GREY_B).next_to(axes.c2p(m, 0), DOWN, buff=0.12) for m in range(0, 13, 3)],
                       T("1", 16, GREY_B).next_to(axes.c2p(0, 1), LEFT, buff=0.12))
        self.at("Draw size going up", Create(axes.y_axis), FadeIn(ylab), rt=0.8)
        self.at("time going across", Create(axes.x_axis), FadeIn(xlab), FadeIn(ticks), rt=0.8)
        w = ValueTracker(0.0001)
        h = ValueTracker(0.0001)
        area = always_redraw(lambda: cost_area(axes, w.get_value(), h.get_value()))
        self.add(area)
        self.at("a rectangle", w.animate.set_value(5), h.animate.set_value(0.6), rt=1.2)
        self.at("its area is the amount of storage", Indicate(area, color=GOLD), rt=0.8)

        self.at("The unit is one gigabyte kept for one month", w.animate.set_value(1), h.animate.set_value(1), rt=1.0)
        unit_label = T("3¢", 30, WHITE, weight=BOLD).move_to(axes.c2p(0.5, 0.5))
        cap = T("one gigabyte-month", 24, GREY_A).next_to(axes, UP, buff=0.3)
        self.at("that square costs three cents", FadeIn(unit_label), FadeIn(cap), rt=0.8)
        squares = VGroup(*[Rectangle(width=axes.c2p(1, 0)[0] - axes.c2p(0, 0)[0], height=axes.c2p(0, 1)[1] - axes.c2p(0, 0)[1],
                                     stroke_color=GOLD, stroke_width=2, fill_color=GOLD, fill_opacity=0.4)
                           .move_to(axes.c2p(i, 0), aligned_edge=DL) for i in range(1, 12)])
        total = T("12 × 3¢ = 36¢", 30, GOLD).next_to(axes, UP, buff=0.3)
        self.at("twelve squares", LaggedStart(*[FadeIn(s) for s in squares], lag_ratio=0.08), rt=1.4)
        self.at("thirty-six cents", ReplacementTransform(cap, total), rt=0.6)

        self.at("Most files are much thinner", FadeOut(squares), FadeOut(unit_label), w.animate.set_value(12), rt=0.6)
        self.go(h.animate.set_value(0.0977), rt=1.2)
        strip_label = T("100 MB", 20, BLUE_B).next_to(axes.c2p(0, 0.0977), LEFT, buff=0.15)
        price = Money(0.0352, 32, WHITE).move_to(axes.c2p(6, 0.4))
        price.number.set_value(0.0352)
        exact = T("$0.0352", 32).move_to(price)
        self.at("about a tenth of the area", FadeIn(strip_label), FadeOut(total), rt=0.6)
        self.at("three and a half cents", FadeIn(exact), rt=0.6)
        rounded = VGroup(T("$0.04", 36, GOLD, weight=BOLD), T("rounded up to the next cent", 20, GREY_A)).arrange(DOWN, buff=0.12).move_to(exact)
        self.at("rounds up to the next whole cent", ReplacementTransform(exact, rounded), rt=0.8)

        formula = T("cost = size (GB) × months × $0.03, rounded up to the cent", 26).to_edge(DOWN, buff=0.35)
        self.at("That's the whole formula", Write(formula), rt=1.4)
        self.at("bought in whole months", FadeOut(rounded), w.animate.set_value(7.0), h.animate.set_value(0.5), rt=0.8)
        live = Money(0, 30, GOLD).move_to(axes.c2p(9.5, 0.85))
        live.add_updater(lambda m: m.tracker.set_value(max(1, math.ceil(h.get_value() * round(w.get_value()) * 3 - 1e-9)) / 100))
        self.add(live)
        self.go(w.animate.set_value(3.0), h.animate.set_value(0.8), rt=1.0)
        self.at("always ends on a month boundary", w.animate.set_value(9.0), h.animate.set_value(0.3), rt=1.2)


class U2_OneCent(Ep):
    BEAT = 3

    def plot(self, months, y_max):
        axes = Axes(x_range=[0, 90, 10], y_range=[0, y_max, max(1, y_max // 5)], x_length=9, y_length=4,
                    axis_config={"color": GREY_B, "include_tip": False, "stroke_width": 2}).move_to(DOWN * 0.3)
        points = []
        x = 0.0001
        level = cents(x, months)
        points.append(axes.c2p(0.05, level))
        for mb in np.linspace(0.05, 90, 1800):
            c = cents(mb, months)
            if c != level:
                points.append(axes.c2p(mb, level))
                points.append(axes.c2p(mb, c))
                level = c
        points.append(axes.c2p(90, level))
        graph = VMobject(color=GOLD, stroke_width=5).set_points_as_corners(points)
        xt = VGroup(*[T(str(v), 16, GREY_B).next_to(axes.c2p(v, 0), DOWN, buff=0.1) for v in range(0, 91, 10)])
        step = max(1, y_max // 5)
        yt = VGroup(*[T(f"{v}¢", 16, GREY_B).next_to(axes.c2p(0, v), LEFT, buff=0.1) for v in range(0, y_max + 1, step)])
        xl = T("file size (MB)", 20, GREY_A).next_to(axes, DOWN, buff=0.45)
        return VGroup(axes, graph, xt, yt, xl)

    def build(self):
        year = self.plot(12, 5)
        title = T("Keep for 1 year", 30, GOLD).to_edge(UP, buff=0.4)
        self.at("price of keeping a file for one year", FadeIn(year[0]), FadeIn(year[2:]), FadeIn(title), rt=0.8)
        self.go(Create(year[1]), rt=1.6)
        axes = year[0]
        mark = DashedLine(axes.c2p(28.44, 0), axes.c2p(28.44, 2), color=WHITE)
        mark_label = T("≈ 28 MB", 20).next_to(mark, UP, buff=0.1)
        self.at("about twenty-eight megabytes", Create(mark), FadeIn(mark_label), rt=0.8)
        self.at("you pay one cent", Indicate(year[1], color=YELLOW), rt=0.8)
        top = T("4¢ at 90 MB", 20, GOLD).next_to(axes.c2p(90, 4), UP, buff=0.15)
        self.at("four cents for the largest file", FadeIn(top), rt=0.6)

        month = self.plot(1, 5)
        title_m = T("Keep for 1 month", 30, GOLD).to_edge(UP, buff=0.4)
        cap = T("every file you can upload: 1¢ for a month", 24, GREY_A).to_edge(DOWN, buff=0.3)
        self.at("For a single month", FadeOut(mark), FadeOut(mark_label), FadeOut(top), Transform(year[1], month[1]),
                Transform(title, title_m), rt=1.2)
        self.at("exactly one cent", FadeIn(cap), rt=0.6)

        sliver = Rectangle(width=0.08, height=0.4, stroke_width=0, fill_color=GREEN, fill_opacity=1).move_to(axes.c2p(0, 0), aligned_edge=DL)
        free = T("≤ 64 bytes: free", 22, GREEN).next_to(axes.c2p(0, 2.2), RIGHT, buff=0.3)
        pointer_line = Line(free.get_left() + LEFT * 0.05, sliver.get_top(), color=GREEN, stroke_width=2)
        self.at("a little green sliver", FadeIn(sliver), FadeIn(free), Create(pointer_line), Indicate(sliver, color=GREEN, scale_factor=2), rt=1.0)
        self.at("There's nothing to store", Wiggle(free), rt=0.8)


class U2_LongHorizons(Ep):
    BEAT = 4

    def build(self):
        header = ["File", "Kept for", "Cost"]
        rows = [("2 MB document", "10 years", 0.01), ("25 MB slide deck", "10 years", 0.09), ("90 MB video", "10 years", 0.32),
                ("90 MB video", "100 years", 3.17)]
        head = VGroup(*[T(h, 24, GREY_A, weight=BOLD) for h in header])
        xs = [-4.5, -0.8, 2.6]
        for mob, x in zip(head, xs):
            mob.move_to([x, 2.4, 0], aligned_edge=LEFT)
        rule = Line([-4.6, 2.1, 0], [4.4, 2.1, 0], color=GREY_C)
        self.go(FadeIn(head), Create(rule), rt=0.6)
        cues = ["A two-megabyte document", "A twenty-five-megabyte slide deck", "The largest file you can upload", "a full century"]
        made = VGroup()
        for i, ((name, kept, price), cue) in enumerate(zip(rows, cues)):
            y = 1.6 - i * 0.65
            money = Money(0, 28, GOLD).move_to([xs[2] + 0.5, y, 0])
            row = VGroup(T(name, 24).move_to([xs[0], y, 0], aligned_edge=LEFT), T(kept, 24).move_to([xs[1], y, 0], aligned_edge=LEFT), money)
            made.add(row)
            self.at(cue, FadeIn(row[:2]), FadeIn(money), rt=0.4)
            self.go(money.tracker.animate.set_value(price), rt=0.8)
        self.go(Indicate(made[3], color=GOLD), rt=0.8)

        timeline = Timeline(10, 11, label_every=1, label_fn=lambda d: f"{d * 10}", size=16).move_to(DOWN * 2.2)
        unit = T("years", 18, GREY_B).next_to(timeline, RIGHT, buff=0.2)
        bar = Rectangle(width=0.01, height=0.5, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.4).move_to(timeline.x(0), aligned_edge=DL)
        bar.shift(UP * 0.15)
        self.add(bar)
        self.go(FadeIn(timeline), FadeIn(unit), bar.animate.stretch_to_fit_width(timeline.x(10)[0] - timeline.x(0)[0]).move_to(
            timeline.x(0) + UP * 0.15, aligned_edge=DL), rt=2.0)
        note = T("upload page: up to 10 years at a time · extend any time", 22, GREY_A).to_edge(DOWN, buff=0.25)
        self.at("up to ten years at a time", FadeIn(note), Indicate(timeline.labels[1], color=YELLOW, scale_factor=1.6), rt=1.0)
        more = Rectangle(width=timeline.x(3)[0] - timeline.x(0)[0], height=0.5, stroke_color=GREEN, fill_color=GREEN, fill_opacity=0.4)
        more.move_to(bar.get_right(), aligned_edge=LEFT)
        self.at("adding more width", bar.animate.stretch_to_fit_width(timeline.x(7)[0] - timeline.x(0)[0]).move_to(timeline.x(0) + UP * 0.15,
                                                                                                                  aligned_edge=DL), rt=0.6)
        more.move_to(bar.get_right(), aligned_edge=LEFT)
        self.go(GrowFromEdge(more, LEFT), rt=1.0)


class U2_MentalMath(Ep):
    BEAT = 5

    def build(self):
        square = Square(3.0, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.25).move_to(LEFT * 3.6 + UP * 0.6)
        label = T("1 GB × 1 month = 3¢", 24, GOLD).next_to(square, UP, buff=0.2)
        self.go(FadeIn(square), FadeIn(label), rt=0.6)
        slices = VGroup(*[Rectangle(width=3.0, height=1.0, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.25) for _ in range(3)]
                        ).arrange(DOWN, buff=0).move_to(square)
        self.at("One cent buys a third", FadeIn(slices), slices[2].animate.set_fill(GOLD, 0.8), rt=0.8)
        one = T("1¢", 32, BG, weight=BOLD).move_to(slices[2])
        self.go(FadeIn(one), rt=0.3)
        mbm = T("≈ 340 MB-months", 26, WHITE).next_to(square, DOWN, buff=0.3)
        self.at("three hundred and forty megabyte-months", FadeIn(mbm), rt=0.6)
        piece = VGroup(slices[2].copy(), one.copy())
        self.add(piece)
        target_pos = RIGHT * 2.6 + UP * 1.6
        shapes = [(1.0, 3.0, "340 MB × 1 month"), (12, 0.25, "28 MB × 12 months"), (120, 0.025, "2.8 MB × 120 months")]
        cues = ["three hundred and forty megabytes for one month", "twenty-eight megabytes for a year", "under three megabytes for a decade"]
        caption_mob = None
        for (w, h, text), cue in zip(shapes, cues):
            width = min(6.0, 0.06 * w * 3.0 / 1.0) if w > 1 else 0.6
            width = {1.0: 0.6, 12: 4.0, 120: 6.4}[w]
            height = 0.6 * 1.0 / (width / 0.6) * 3.0 if False else {1.0: 3.0, 12: 0.45, 120: 0.28}[w]
            rect = Rectangle(width=width, height=height, stroke_color=GOLD, fill_color=GOLD, fill_opacity=0.8).move_to(target_pos, aligned_edge=UL)
            rect.shift(LEFT * 2.2)
            new_label = VGroup(T(text, 22), T("1¢", 22, GOLD, weight=BOLD)).arrange(RIGHT, buff=0.3).next_to(rect, DOWN, buff=0.15).align_to(rect, LEFT)
            if caption_mob is None:
                self.at(cue, Transform(piece[0], rect), FadeOut(piece[1]), rt=0.8)
                caption_mob = new_label
                self.go(FadeIn(caption_mob), rt=0.3)
            else:
                self.at(cue, Transform(piece[0], rect), Transform(caption_mob, new_label), rt=0.8)
        same = T("Same area, same cent.", 24, GREY_A).move_to(RIGHT * 2.6 + DOWN * 0.6)
        self.at("Same area", FadeIn(same), rt=0.6)

        self.at("So the rule of thumb is", FadeOut(VGroup(square, label, slices, one, mbm, piece, caption_mob, same)), rt=0.6)
        rule = VGroup(RoundedRectangle(corner_radius=0.15, width=8.4, height=1.1, color=GOLD, fill_color=PANEL_BG, fill_opacity=1),
                      T("cents ≈ (MB × months) ÷ 340, rounded up", 32, GOLD))
        rule[1].move_to(rule[0])
        rule.move_to(UP * 2.4)
        self.go(FadeIn(rule, shift=DOWN * 0.2), rt=0.8)
        work = VGroup(T("25 MB × 120 months = 3,000", 28), T("3,000 ÷ 340 ≈ 8.8", 28), T("→ 9¢", 32, GOLD, weight=BOLD)).arrange(DOWN, buff=0.25)
        work.move_to(DOWN * 0.2)
        self.at("Twenty-five megabytes for ten years", FadeIn(work[0]), rt=0.6)
        self.at("Divide by three-forty", FadeIn(work[1]), rt=0.6)
        self.at("so nine cents", FadeIn(work[2]), rt=0.5)
        self.at("exactly what the table said", Indicate(work[2], color=GOLD), rt=0.6)

        quiz = VGroup(RoundedRectangle(corner_radius=0.15, width=7.0, height=1.0, color=BLUE_B), T("A 40 MB video for 5 years?", 30, BLUE_B))
        quiz[1].move_to(quiz[0])
        quiz.move_to(DOWN * 0.2)
        self.at("Try one yourself", FadeOut(work), FadeIn(quiz), rt=0.6)
        ring = Circle(radius=0.45, color=BLUE_B, stroke_width=6).next_to(quiz, DOWN, buff=0.4)
        self.at("Pause the video", Create(ring), rt=0.2)
        self.go(Uncreate(ring), rt=2.0)
        answer = VGroup(T("40 × 60 = 2,400", 28), T("2,400 ÷ 340 ≈ 7.1", 28), T("rounded up → 8¢", 32, GOLD, weight=BOLD)).arrange(DOWN, buff=0.2)
        answer.next_to(quiz, DOWN, buff=0.3)
        self.at("Forty times sixty months", FadeIn(answer[0]), rt=0.5)
        self.at("Divided by three-forty", FadeIn(answer[1]), rt=0.5)
        self.at("the answer is eight cents", FadeIn(answer[2]), rt=0.5)


class U2_Bundling(Ep):
    BEAT = 6

    def build(self):
        photos = VGroup(*[FileIcon(width=0.38, height=0.5, lines=False) for _ in range(20)]).arrange_in_grid(4, 5, buff=0.35)
        photos.move_to(LEFT * 3.6 + UP * 0.6)
        lab = T("20 photos · 3 MB each", 22, GREY_A).next_to(photos, UP, buff=0.3)
        self.go(LaggedStart(*[FadeIn(p) for p in photos], lag_ratio=0.03), FadeIn(lab), rt=1.0)
        tags = VGroup(*[T("1¢", 16, GOLD).next_to(p, DOWN, buff=0.04) for p in photos])
        self.at("one cent apiece", LaggedStart(*[FadeIn(t) for t in tags], lag_ratio=0.03), rt=1.0)
        sum_ = T("20¢", 40, GOLD, weight=BOLD).next_to(photos, DOWN, buff=0.5)
        self.at("twenty cents", ReplacementTransform(tags, sum_), rt=0.8)
        zip_ = FileIcon("photos.zip · 60 MB", width=1.0, height=1.3, label_size=20).move_to(RIGHT * 3.4 + UP * 0.6)
        three = T("3¢", 40, GOLD, weight=BOLD).next_to(zip_, DOWN, buff=0.5)
        self.at("in a single sixty-megabyte zip file", TransformFromCopy(photos, zip_), rt=1.0)
        self.at("costs three cents", FadeIn(three), rt=0.6)

        beam = Line(LEFT * 1.6, RIGHT * 1.6, color=GREY_A, stroke_width=5).move_to(DOWN * 2.6)
        post = Line(DOWN * 3.4, DOWN * 2.6, color=GREY_A, stroke_width=5)
        pans = VGroup(T("20¢", 22, GOLD).next_to(beam.get_left(), UP, buff=0.1), T("3¢", 22, GOLD).next_to(beam.get_right(), UP, buff=0.1))
        scale = VGroup(beam, pans)
        self.go(FadeIn(post), FadeIn(scale), rt=0.5)
        self.go(Rotate(scale, -0.25 * -1, about_point=beam.get_center()), rt=0.6)

        self.at("That's not always the right choice", FadeOut(VGroup(post, scale)), rt=0.4)
        reader = Person(GREEN, height=0.8).next_to(zip_, RIGHT, buff=0.6)
        glass = VGroup(Triangle(color=GREY_A).scale(0.15), Triangle(color=GREY_A).scale(0.15).rotate(PI)).arrange(DOWN, buff=0)
        glass.next_to(reader, UP, buff=0.15)
        self.at("download all of it", FadeIn(reader), FadeIn(glass), rt=0.6)
        self.go(Rotate(glass, PI), rt=0.8)
        links = T("one link instead of twenty", 22, GREY_A).next_to(three, DOWN, buff=0.3)
        self.at("one link instead of twenty", FadeIn(links), rt=0.6)
        cap = caption("cheaper to store, less convenient to share")
        self.at("bundling them is cheaper", Write(cap), rt=1.0)


class U2_Deposits(Ep):
    BEAT = 7

    def build(self):
        deposits = [1, 5, 10, 20]
        fees = [round(d * 0.029 + 0.30 + 1e-9, 2) for d in deposits]
        axes = Axes(x_range=[0, 5, 1], y_range=[0, 22, 5], x_length=8, y_length=4.4,
                    axis_config={"color": GREY_B, "include_tip": False, "stroke_width": 2}).move_to(LEFT * 1.4 + DOWN * 0.6)
        self.go(Create(axes), rt=0.6)
        bars = VGroup()
        for i, (d, f) in enumerate(zip(deposits, fees)):
            x = i + 1
            base = axes.c2p(x, 0)
            h_credit = axes.c2p(0, d)[1] - axes.c2p(0, 0)[1]
            h_fee = max(0.06, axes.c2p(0, f)[1] - axes.c2p(0, 0)[1])
            credit = Rectangle(width=0.9, height=h_credit, stroke_width=0, fill_color=GOLD, fill_opacity=0.85).move_to(base, aligned_edge=DOWN)
            fee = Rectangle(width=0.9, height=h_fee, stroke_width=0, fill_color=GREY_B, fill_opacity=0.9).next_to(credit, UP, buff=0)
            label = T(f"${d}", 22).next_to(base, DOWN, buff=0.15)
            pct = T(f"{f / d * 100:.1f}%".replace(".0%", "%").replace("33.0", "33"), 20, GREY_A).next_to(fee, UP, buff=0.1)
            bars.add(VGroup(credit, fee, label, pct))
        legend = VGroup(VGroup(Square(0.25, fill_color=GOLD, fill_opacity=0.85, stroke_width=0), T("credit", 20)).arrange(RIGHT, buff=0.1),
                        VGroup(Square(0.25, fill_color=GREY_B, fill_opacity=0.9, stroke_width=0), T("fee", 20)).arrange(RIGHT, buff=0.1)
                        ).arrange(DOWN, aligned_edge=LEFT).next_to(axes, UP, buff=0.1).align_to(axes, LEFT)
        self.at("the card fee when you add funds", LaggedStart(*[GrowFromEdge(b[0], DOWN) for b in bars], lag_ratio=0.15),
                FadeIn(VGroup(*[b[2] for b in bars])), FadeIn(legend), rt=1.2)
        self.go(LaggedStart(*[FadeIn(b[1]) for b in bars], lag_ratio=0.15), rt=0.6)
        formula = VGroup(RoundedRectangle(corner_radius=0.12, width=4.4, height=0.9, color=GREY_B),
                         T("fee = 2.9% × credit + 30¢", 26)).move_to(RIGHT * 4.4 + UP * 2.0)
        formula[1].move_to(formula[0])
        self.at("two point nine percent plus thirty cents", FadeIn(formula), rt=0.8)
        fixed = T("30¢ fixed", 22, YELLOW).next_to(formula, DOWN, buff=0.2)
        self.at("The thirty cents is fixed", FadeIn(fixed), LaggedStart(*[Indicate(b[1], color=YELLOW, scale_factor=1.3) for b in bars],
                                                                      lag_ratio=0.2), rt=1.0)
        for i, cue in enumerate(("A one-dollar deposit", "Ten dollars pays", "Twenty, a bit over four")):
            idx = [0, 2, 3][i]
            self.at(cue, FadeIn(bars[idx][3], shift=UP * 0.1), rt=0.5)
        self.go(FadeIn(bars[1][3]), rt=0.3)
        tip = T("Fewer, larger deposits pay less in fees.", 26, GOLD).to_edge(DOWN, buff=0.3)
        self.at("add funds less often", Write(tip), rt=1.2)


class U2_NoSurprises(Ep):
    BEAT = 8

    def build(self):
        paper = Rectangle(width=5.6, height=5.8, stroke_color=GREY_B, fill_color="#F2EFE6", fill_opacity=1).move_to(UP * 0.3)
        head = T("RECEIPT", 30, BG, weight=BOLD).next_to(paper.get_top(), DOWN, buff=0.3)
        self.go(FadeIn(paper, shift=UP * 0.4), FadeIn(head), rt=0.8)
        lines = ["Storage: paid up front", "Monthly subscription", "Automatic renewal", "Download fees", "Bandwidth overage"]
        rows = VGroup()
        for i, text in enumerate(lines):
            t = T(text, 26, BG if i == 0 else "#888888")
            rows.add(t)
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.38).next_to(head, DOWN, buff=0.45).align_to(paper, LEFT).shift(RIGHT * 0.9)
        self.at("Notice what's missing", FadeIn(rows[1:]), rt=0.6)
        for i, cue in ((1, "There's no subscription"), (2, "nothing renews by itself")):
            strike = Line(rows[i].get_left(), rows[i].get_right(), color=GREY_D, stroke_width=3)
            self.at(cue, Create(strike), rt=0.5)
        check = check_mark(GREEN_D, 0.35).next_to(rows[0], LEFT, buff=0.2)
        self.at("You pay once, up front", FadeIn(rows[0]), Create(check), rt=0.6)
        self.at("Downloads don't cost you anything", *[Create(Line(rows[i].get_left(), rows[i].get_right(), color=GREY_D, stroke_width=3))
                                                     for i in (3, 4)], rt=0.6)
        small = T("Payments are final. Deleting early doesn't refund.", 18, "#664444").next_to(paper.get_bottom(), UP, buff=0.4)
        self.at("payments are final", FadeIn(small), rt=0.6)
        self.at("you don't get the unused months back", Indicate(small, color=RED_D), rt=0.8)
        more = T("You can always add more later.", 24, GREEN).next_to(paper, DOWN, buff=0.15)
        self.at("You can always add more later", FadeIn(more), rt=0.6)


class U2_Recap(Ep):
    BEAT = 9

    def build(self):
        axes = axes_gb(12, 1, 6, 3).move_to(LEFT * 2.2 + UP * 0.4)
        area = cost_area(axes, 9, 0.6)
        formula = T("size × months × 3¢ / GB", 26).next_to(axes, DOWN, buff=0.3)
        self.at("Size times months times three cents", Create(axes), FadeIn(area), Write(formula), rt=1.2)
        labels = VGroup(T("min 1¢", 24, GOLD), T("≤ 64 bytes: free", 24, GREEN), T("+ card fee per deposit", 24, GREY_A))
        labels.arrange(DOWN, aligned_edge=LEFT, buff=0.4).next_to(axes, RIGHT, buff=0.6)
        self.at("rounded up to a cent", FadeIn(labels[0], shift=LEFT * 0.2), rt=0.5)
        self.at("Tiny files are free", FadeIn(labels[1], shift=LEFT * 0.2), rt=0.5)
        self.at("the card fee", FadeIn(labels[2], shift=LEFT * 0.2), rt=0.5)
        link = VGroup(RoundedRectangle(corner_radius=0.12, width=4.6, height=0.7, color=BLUE_B), M("hashbin.org/docs/pricing", 20, BLUE_B))
        link[1].move_to(link[0])
        link.next_to(labels, DOWN, buff=0.5).align_to(labels, LEFT)
        self.at("a calculator on the pricing page", FadeIn(link), rt=0.6)
        card = NextCard(("U3", "", True), ("X2", "", False)).scale(0.7)
        self.at("what actually happens to a file", FadeOut(VGroup(axes, area, formula, labels, link)), FadeIn(card), rt=1.0)
        self.at("strangers can help", Circumscribe(card[1][0][0], color=BLUE, buff=0.12), rt=1.0)
