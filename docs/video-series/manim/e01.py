"""01 · A Name Made of Content"""

import base64
import hashlib

from hb.common import *

FOX = b"The quick brown fox jumps over the lazy dog"
FOX2 = b"The Quick brown fox jumps over the lazy dog"


def bits_of(data):
    return "".join(f"{byte:08b}" for byte in data)


FOX_BITS = bits_of(hashlib.sha512(FOX).digest())
FOX2_BITS = bits_of(hashlib.sha512(FOX2).digest())
FLIPPED = sum(a != b for a, b in zip(FOX_BITS, FOX2_BITS))
EXAMPLE_BODY_BITS = bits_of(base64.urlsafe_b64decode(EXAMPLE_CID[8:] + "=="))


class Ep(Beat):
    EPISODE = "01-a-name-made-of-content"


def bit_grid(bits, cols=32, cell=0.13, on=BLUE_C):
    cells = VGroup(*[Square(cell, stroke_width=0.6, stroke_color=GREY_D, fill_color=on if b == "1" else "#1A1E27",
                            fill_opacity=1) for b in bits])
    cells.arrange_in_grid(cols=cols, buff=0)
    return cells


def pigeonholes(left_label, right_label):
    files = VGroup(*[FileIcon(width=0.36, height=0.46, lines=False) for _ in range(9)]).arrange(DOWN, buff=0.28)
    files.move_to(LEFT * 3.2)
    boxes = VGroup(*[Square(0.42, color=GREY_B, stroke_width=2) for _ in range(9)]).arrange(DOWN, buff=0.28)
    boxes.move_to(RIGHT * 3.2)
    lab_l = T(left_label, 22, GREY_A).next_to(files, UP, buff=0.25)
    lab_r = T(right_label, 22, GREY_A).next_to(boxes, UP, buff=0.25)
    return files, boxes, lab_l, lab_r


class E01_Puzzle(Ep):
    BEAT = 1

    def build(self):
        full = S256(EXAMPLE_CID, 17).move_to(UP * 2.6)
        self.go(AddTextLetterByLetter(full), rt=2.0)
        count = Number(0, size=30).next_to(full, DOWN, buff=0.35).shift(LEFT * 0.9)
        count_label = T("characters", 28, GREY_A).next_to(count, RIGHT, buff=0.15)
        count_label.add_updater(lambda m: m.next_to(count, RIGHT, buff=0.15))
        self.at("ninety-four characters", FadeIn(count), FadeIn(count_label), rt=0.4)
        self.go(counting(count, 94), rt=1.0)

        small = FileIcon("a sentence", width=0.35, height=0.45, label_size=18).move_to(LEFT * 4.2 + DOWN * 0.3)
        huge = FileIcon("256 TB", width=3.0, height=3.4, label_size=26, color=GREY_A).move_to(RIGHT * 3.0 + DOWN * 0.9)
        s1 = S256(EXAMPLE_CID, 12, truncate=22).next_to(small, DOWN, buff=0.6)
        s2 = S256(name_256t(b"x" * 70), 12, truncate=22).next_to(huge, LEFT, buff=0.5)
        self.at("a single sentence", FadeIn(small), FadeIn(s1), rt=1.0)
        self.at("two hundred and fifty-six terabytes", FadeIn(huge), FadeIn(s2), rt=1.2)
        brace = VGroup(Brace(s1, DOWN, color=GREY_B), Brace(s2, DOWN, color=GREY_B))
        same = VGroup(T("same length", 18, GREY_B).next_to(brace[0], DOWN, buff=0.1),
                      T("same length", 18, GREY_B).next_to(brace[1], DOWN, buff=0.1))
        self.go(FadeIn(brace), FadeIn(same), rt=0.8)

        self.at("That should bother you", FadeOut(VGroup(small, huge, s1, s2, brace, same, count, count_label)),
                full.animate.set_opacity(0), rt=0.8)
        files, boxes, lab_l, lab_r = pigeonholes("possible files: infinitely many", "possible 94-character names: finite")
        files.shift(DOWN * 0.5)
        boxes.shift(DOWN * 0.5)
        lab_l.shift(DOWN * 0.5)
        lab_r.shift(DOWN * 0.5)
        self.at("only so many", FadeIn(boxes), FadeIn(lab_r), rt=1.0)
        self.at("no limit to the number", FadeIn(files), FadeIn(lab_l), rt=1.0)
        files.add_updater(lambda m, dt: m.shift(UP * dt * 0.0))
        targets = [0, 2, 3, 5, 6, 8, 1, 4, 2]
        arrows = VGroup(*[Arrow(files[i].get_right(), boxes[t].get_left(), buff=0.1, stroke_width=2.5, color=GREY_A,
                                max_tip_length_to_length_ratio=0.06) for i, t in enumerate(targets)])
        self.at("So there must be two", LaggedStart(*[GrowArrow(a) for a in arrows[:8]], lag_ratio=0.15), rt=2.0)
        self.go(GrowArrow(arrows[8].set_color(RED)), boxes[2].animate.set_fill(RED, 0.6).set_stroke(RED), rt=0.8)
        self.at("pigeons", Indicate(boxes[2], color=RED, scale_factor=1.4), rt=1.0)

        self.at("And yet", FadeOut(VGroup(files, boxes, lab_l, lab_r, arrows)), full.animate.set_opacity(1), rt=0.8)
        self.at("take the string apart", full[:8].animate.shift(LEFT * 0.4 + DOWN * 0.6), full[8:].animate.shift(RIGHT * 0.2 + DOWN * 0.6),
                rt=1.2)
        question = T("How can both be true?", 34, WHITE).move_to(DOWN * 0.8)
        self.at("both of those things", FadeIn(question, shift=UP * 0.2), rt=1.0)


class E01_HashMachine(Ep):
    BEAT = 2

    def build(self):
        machine = HashMachine().move_to(LEFT * 1.2 + UP * 1.2)
        self.at("hash function", FadeIn(machine), rt=1.0)
        file = FileIcon("The quick brown fox…", label_size=18).move_to(LEFT * 5.2 + UP * 1.2)
        self.at("fingerprint machine", FadeIn(file, shift=RIGHT * 0.3), rt=0.8)
        grid = bit_grid(FOX_BITS).move_to(RIGHT * 2.4 + DOWN * 1.6)
        self.at("Feed it any data", file.page.animate.scale(0.4).move_to(machine.in_point), rt=1.0)
        self.go(FadeOut(file.page), FadeOut(file.label), Wiggle(machine.body), rt=0.6)
        self.go(LaggedStart(*[FadeIn(c) for c in grid], lag_ratio=0.002), rt=1.4)
        caption_bits = T("512 bits", 24, BLUE_C).next_to(grid, UP, buff=0.15)
        self.at("SHA-512", Indicate(machine.label, color=BLUE_C), FadeIn(caption_bits), rt=1.0)

        props = VGroup(T("1. deterministic", 26), T("2. chaotic", 26), T("3. one way", 26)).arrange(DOWN, aligned_edge=LEFT,
                                                                                                   buff=0.3)
        props.to_corner(DL, buff=0.6).shift(UP * 1.2)
        self.at("deterministic", FadeIn(props[0]), rt=0.6)
        again = file.page.copy().set_opacity(1).scale(1 / 0.4).move_to(LEFT * 5.2 + UP * 1.2)
        self.go(FadeIn(again), rt=0.4)
        self.go(again.animate.scale(0.4).move_to(machine.in_point), rt=0.8)
        second = bit_grid(FOX_BITS).move_to(grid).shift(UP * 0.3)
        self.go(FadeOut(again), FadeIn(second), rt=0.6)
        self.go(second.animate.move_to(grid), rt=0.6)
        self.go(LaggedStart(*[c.animate.set_fill(GREEN) for c in second[::8]], lag_ratio=0.002), rt=0.8)
        self.go(FadeOut(second), rt=0.4)

        self.at("it's chaotic", FadeIn(props[1]), rt=0.6)
        sentence = M("The Quick brown fox…", 22).move_to(LEFT * 5.0 + UP * 3.0)
        sentence[3].set_color(YELLOW)
        self.at("Change a single letter", FadeIn(sentence), Indicate(sentence[3], color=YELLOW, scale_factor=1.8), rt=1.0)
        self.go(sentence.animate.scale(0.5).move_to(machine.in_point).set_opacity(0), rt=0.8)
        new = bit_grid(FOX2_BITS)
        self.go(grid.animate.scale(0.75).move_to(RIGHT * 0.3 + DOWN * 1.6), FadeOut(caption_bits), rt=0.6)
        new.scale(0.75).next_to(grid, RIGHT, buff=0.4)
        self.go(FadeIn(new), rt=0.6)
        diffs = [i for i, (a, b) in enumerate(zip(FOX_BITS, FOX2_BITS)) if a != b]
        counter = Number(0, size=26).next_to(new, UP, buff=0.2).shift(LEFT * 1.0)
        counter_label = T("bits changed, of 512", 22, GREY_A).next_to(counter, RIGHT, buff=0.15)
        counter_label.add_updater(lambda m: m.next_to(counter, RIGHT, buff=0.15))
        self.at("roughly half", FadeIn(counter), FadeIn(counter_label), rt=0.3)
        self.go(counting(counter, FLIPPED),
                LaggedStart(*[new[i].animate.set_stroke(RED, 2) for i in diffs], lag_ratio=0.002), rt=1.6)
        self.at("no sense in which similar files", Indicate(VGroup(grid, new), color=WHITE, scale_factor=1.03), rt=1.0)

        self.at("it only runs one way", FadeIn(props[2]), rt=0.6)
        back = Arrow(grid.get_top(), machine.spout.get_bottom(), buff=0.1, color=RED, stroke_width=4)
        lock = padlock(GREY_A, 0.6).next_to(machine, UP, buff=0.2)
        self.at("Given a fingerprint", GrowArrow(back), rt=0.8)
        self.go(Wiggle(machine), FadeIn(lock, scale=0.5), rt=1.0)
        guess = T("guess, check, repeat…", 22, GREY_B).next_to(machine, DOWN, buff=0.25)
        self.at("other than guessing files", FadeIn(guess), rt=0.8)


class E01_Collisions(Ep):
    BEAT = 3

    def build(self):
        files, boxes, lab_l, lab_r = pigeonholes("files", "2^512 fingerprints")
        lab_r.become(VGroup(Expr(("2", "512"), size=26), T("fingerprints", 22, GREY_A)).arrange(RIGHT, buff=0.15).move_to(lab_r))
        group = VGroup(files, boxes, lab_l, lab_r).scale(0.8).to_edge(LEFT, buff=0.6)
        self.go(FadeIn(group), rt=1.0)
        a1 = Arrow(files[1].get_right(), boxes[4].get_left(), buff=0.1, color=RED, stroke_width=3)
        a2 = Arrow(files[6].get_right(), boxes[4].get_left(), buff=0.1, color=RED, stroke_width=3)
        self.at("definitely exist", GrowArrow(a1), GrowArrow(a2), rt=1.0)
        q = T("Could anyone ever find one?", 30, WHITE).to_edge(UP, buff=0.5).shift(RIGHT * 2.5)
        self.at("whether anyone could ever find one", FadeIn(q), rt=0.8)

        e1 = Expr(("2", "512"), "≈ 1.3 ×", ("10", "154"), size=40).move_to(RIGHT * 2.6 + UP * 1.6)
        self.at("There are two to the five hundred twelfth", Write(e1), rt=1.2)
        bday = VGroup(T("birthday paradox: expected tries ≈", 26, GREY_A), Expr(("2", "256"), "≈", ("10", "77"), size=36)
                      ).arrange(DOWN, buff=0.2).move_to(RIGHT * 2.6 + UP * 0.2)
        self.at("birthday paradox", FadeIn(bday[0]), rt=0.8)
        self.at("about the square root", Write(bday[1]), rt=1.0)

        self.at("give it one", FadeOut(group), FadeOut(a1), FadeOut(a2), FadeOut(q), e1.animate.set_opacity(DIM),
                bday.animate.set_opacity(DIM), rt=0.8)

        def dial(label, value_parts, note):
            face = Arc(radius=1.0, start_angle=PI, angle=-PI, color=GREY_B, stroke_width=4)
            ticks = VGroup(*[Line(UP * 0.85, UP * 1.0, color=GREY_B).rotate(PI / 2 - a, about_point=ORIGIN)
                             for a in np.linspace(0, PI, 9)])
            needle = Line(ORIGIN, LEFT * 0.85, color=YELLOW, stroke_width=5)
            hub = Dot(color=YELLOW)
            title = T(label, 22, GREY_A).next_to(face, UP, buff=0.15)
            value = Expr(*value_parts, size=32).next_to(hub, DOWN, buff=0.3)
            sub = T(note, 20, GREY_B).next_to(value, DOWN, buff=0.12)
            return VGroup(face, ticks, needle, hub, title, value, sub), needle

        d1, n1 = dial("hashes per second", [("10", "21")], "≈ the whole Bitcoin network")
        d2, n2 = dial("time", ["4 ×", ("10", "17"), "s"], "≈ age of the universe")
        d1.move_to(LEFT * 3.4 + DOWN * 1.6)
        d2.move_to(RIGHT * 0.4 + DOWN * 1.6)
        self.at("a sextillion fingerprints", FadeIn(d1[:5]), rt=0.6)
        self.go(Rotate(n1, -PI * 0.92, about_point=d1[3].get_center()), FadeIn(d1[5:]), rt=1.2)
        self.at("since the Big Bang", FadeIn(d2[:5]), rt=0.6)
        self.go(Rotate(n2, -PI * 0.8, about_point=d2[3].get_center()), FadeIn(d2[5:]), rt=1.2)
        product = Expr(("10", "21"), "× 4 ×", ("10", "17"), "≈", ("2", "128"), size=36).move_to(RIGHT * 4.4 + DOWN * 1.6)
        self.at("two to the hundred twenty-eighth", Write(product), rt=1.2)

        self.at("Which sounds close", FadeOut(VGroup(d1, d2, e1, bday)), product.animate.to_edge(UP, buff=0.5), rt=0.8)
        bar = Rectangle(width=30, height=0.5, stroke_width=0, fill_color=BLUE_D, fill_opacity=0.8)
        bar.move_to(LEFT * 6 + DOWN * 0.3, aligned_edge=LEFT)
        bar_label = VGroup(Expr(("2", "256"), size=28), T("tries needed", 22, GREY_A)).arrange(RIGHT, buff=0.15)
        bar_label.next_to(bar, UP, buff=0.2).align_to([-6, 0, 0], LEFT)
        dot = Dot(radius=0.06, color=YELLOW).move_to(bar.get_left() + RIGHT * 0.06)
        dot_label = VGroup(Expr(("2", "128"), size=24, color=YELLOW), T("done", 20, YELLOW)).arrange(RIGHT, buff=0.1)
        dot_label.next_to(dot, DOWN, buff=0.35)
        self.go(GrowFromEdge(bar, LEFT), FadeIn(bar_label), FadeIn(dot), FadeIn(dot_label), rt=1.2)
        zoom = T("zoom ×10", 24, GREY_A).to_corner(DR, buff=0.6)
        self.at("fraction of the job", FadeIn(zoom), rt=0.4)
        for _ in range(6):
            self.go(bar.animate.stretch(10, 0, about_point=dot.get_center()), Indicate(zoom, scale_factor=1.1), rt=0.55)
        fraction = VGroup(T("fraction searched ≈ 1 in", 28), Expr(("10", "38"), size=34)).arrange(RIGHT, buff=0.15)
        fraction.to_edge(DOWN, buff=0.8)
        self.go(FadeIn(fraction, shift=UP * 0.2), rt=0.8)
        self.at("You haven't started", Indicate(dot, color=YELLOW, scale_factor=3), rt=1.0)

        self.at("So the pigeonhole argument is right", FadeOut(VGroup(bar, bar_label, dot, dot_label, zoom, product, fraction)),
                rt=0.8)
        summary = VGroup(T("Collisions exist.", 36, WHITE), T("Nobody can find one.", 36, GREEN)).arrange(DOWN, buff=0.4)
        self.go(FadeIn(summary[0]), rt=0.6)
        self.at("for every practical purpose", FadeIn(summary[1]), rt=0.8)
        margin = T("SHA-512: a very wide margin", 26, GREY_A).next_to(summary, DOWN, buff=0.6)
        self.at("a very wide margin", FadeIn(margin), rt=0.8)


class E01_Base64url(Ep):
    BEAT = 4

    def build(self):
        grid = bit_grid(EXAMPLE_BODY_BITS[:512]).move_to(UP * 0.8)
        self.go(FadeIn(grid), rt=0.8)
        bits = VGroup(*[M(b, 26, BLUE_C if b == "1" else GREY_B) for b in EXAMPLE_BODY_BITS[:36]])
        bits.arrange(RIGHT, buff=0.11).move_to(UP * 2.4)
        tail = M("…", 26, GREY_B).next_to(bits, RIGHT, buff=0.12)
        self.at("a long row of ones and zeros", ReplacementTransform(grid[:36], bits), FadeOut(grid[36:]), FadeIn(tail), rt=1.4)
        name = T("base64url", 34, BLUE_C, weight=BOLD).to_edge(UP, buff=0.3)
        self.at("base64url", Write(name), rt=0.8)

        strip = VGroup(*[M(ch, 20, GREY_A) for ch in ALPHABET]).arrange(RIGHT, buff=0.06).move_to(DOWN * 2.2)
        idx = VGroup(*[T(str(i), 14, GREY_C).next_to(strip[i], UP, buff=0.12) for i in (0, 26, 52, 63)])
        strip_label = T("64 symbols", 22, GREY_A).next_to(strip, DOWN, buff=0.2)
        self.at("groups of six", rt=0.1)
        braces = VGroup(*[Brace(bits[i * 6:(i + 1) * 6], DOWN, buff=0.08, color=GREY_B) for i in range(6)])
        self.go(LaggedStart(*[GrowFromCenter(b) for b in braces], lag_ratio=0.15), rt=1.2)
        self.at("zero to sixty-three", FadeIn(strip), FadeIn(idx), FadeIn(strip_label), rt=1.0)
        chars = VGroup()
        marker = SurroundingRectangle(strip[0], color=YELLOW, buff=0.04)
        self.add(marker)
        for i in range(6):
            value = int(EXAMPLE_BODY_BITS[i * 6:(i + 1) * 6], 2)
            ch = M(ALPHABET[value], 34, BLUE_C).next_to(braces[i], DOWN, buff=0.15)
            chars.add(ch)
            self.go(marker.animate.move_to(strip[value]), Indicate(bits[i * 6:(i + 1) * 6], color=YELLOW, scale_factor=1.05),
                    rt=0.4)
            self.go(TransformFromCopy(strip[value], ch), rt=0.4)
        self.at("capital letters", Indicate(strip[:26], color=WHITE, scale_factor=1.1), rt=0.6)
        self.at("lowercase letters", Indicate(strip[26:52], color=WHITE, scale_factor=1.1), rt=0.6)
        self.at("ten digits", Indicate(strip[52:62], color=WHITE, scale_factor=1.1), rt=0.5)
        self.at("a dash", Indicate(strip[62], color=YELLOW, scale_factor=1.6), rt=0.4)
        self.at("an underscore", Indicate(strip[63], color=YELLOW, scale_factor=1.6), rt=0.4)

        division = Expr("512 ÷ 6 = 85.33…  →  86 characters", size=36).move_to(UP * 0.4)
        division[0][-13:].set_color(BLUE_C)
        self.at("Five hundred twelve divided by six", FadeOut(VGroup(bits, tail, braces, chars, marker)), Write(division), rt=1.4)

        self.at("Why that particular alphabet", FadeOut(division), rt=0.6)
        plus = M("+", 20, RED).move_to(strip[62])
        slash = M("/", 20, RED).move_to(strip[63])
        dash, under = strip[62].copy(), strip[63].copy()
        self.at("a plus sign and a slash", Transform(strip[62], plus), Transform(strip[63], slash), rt=0.8)
        url = VGroup(M("https://256t.us/", 30, GREY_A), M("Rg2d+oRe/eYM", 30, BLUE_C)).arrange(RIGHT, buff=0.02).move_to(UP * 0.6)
        url[1][4].set_color(RED)
        url[1][8].set_color(RED)
        self.at("mean something in a web address", FadeIn(url), rt=0.8)
        b1 = Brace(url[1][:8], DOWN, color=RED)
        b2 = Brace(url[1][9:], DOWN, color=RED)
        split = T("two path segments!", 22, RED).next_to(VGroup(b1, b2), DOWN, buff=0.1)
        self.go(GrowFromCenter(b1), GrowFromCenter(b2), FadeIn(split), rt=0.8)
        crosses = VGroup(cross_mark(RED, 0.4).move_to(strip[62]), cross_mark(RED, 0.4).move_to(strip[63]))
        self.at("Swapping them", Create(crosses), rt=0.5)
        self.go(FadeOut(crosses), Transform(strip[62], dash.set_color(GREEN)), Transform(strip[63], under.set_color(GREEN)), rt=0.8)
        good = VGroup(M("https://256t.us/", 30, GREY_A), M("Rg2d-oRe_eYM", 30, BLUE_C)).arrange(RIGHT, buff=0.02).move_to(url)
        good[1][4].set_color(GREEN)
        good[1][8].set_color(GREEN)
        self.at("exactly as it is", FadeOut(b1), FadeOut(b2), FadeOut(split), Transform(url, good), rt=1.0)
        self.go(Create(check_mark(GREEN, 0.5).next_to(url, RIGHT, buff=0.3)), rt=0.5)


class E01_LengthPrefix(Ep):
    BEAT = 5

    def build(self):
        full = S256(EXAMPLE_CID, 17).move_to(UP * 2.8)
        self.go(FadeIn(full), rt=0.6)
        prefix = full[:8]
        self.at("eight more characters", full[8:].animate.set_opacity(DIM), prefix.animate.scale(2.0).move_to(UP * 1.6), rt=1.2)
        label = T("length in bytes", 24, YELLOW).next_to(prefix, RIGHT, buff=0.4)
        self.at("They're the file's length", FadeIn(label), rt=0.8)

        cells = ByteGrid(bytes([0, 0, 0, 0, 0, 65]), cols=6, cell=0.7, text_size=20, color=YELLOW).move_to(UP * 0.2)
        self.at("six-byte number", FadeIn(cells), rt=0.8)
        bitstring = "0" * 40 + "01000001"
        bits = VGroup(*[M(b, 18, YELLOW if b == "1" else GREY_B) for b in bitstring]).arrange(RIGHT, buff=0.07).move_to(DOWN * 1.1)
        byte_braces = VGroup(*[Brace(bits[i * 8:(i + 1) * 8], UP, buff=0.05, color=GREY_C) for i in range(6)])
        char_braces = VGroup(*[Brace(bits[i * 6:(i + 1) * 6], DOWN, buff=0.05, color=YELLOW) for i in range(8)])
        self.at("forty-eight bits", FadeIn(bits), FadeIn(byte_braces), rt=1.0)
        chars = VGroup(*[M(c, 24, YELLOW).next_to(char_braces[i], DOWN, buff=0.08) for i, c in enumerate("AAAAAABB")])
        self.at("exactly eight groups of six", FadeIn(char_braces), LaggedStart(*[FadeIn(c) for c in chars], lag_ratio=0.1), rt=1.4)

        value = ValueTracker(65)
        number = Number(65, size=36).move_to(DOWN * 3.0 + LEFT * 2.0)
        number.add_updater(lambda m: m.set_value(int(value.get_value())))
        bytes_label = T("bytes", 26, GREY_A)
        bytes_label.add_updater(lambda m: m.next_to(number, RIGHT, buff=0.2))
        self.at("sixty-five bytes long", FadeOut(VGroup(bits, byte_braces, char_braces, chars)), FadeIn(number),
                FadeIn(bytes_label), Indicate(cells[0][-1], color=YELLOW), rt=1.0)

        def live_prefix():
            text = M(prefix_for(int(value.get_value())), 34, YELLOW)
            return text.move_to(prefix)

        live = always_redraw(live_prefix)
        self.remove(prefix)
        self.add(live)
        number.move_to(DOWN * 3.0 + LEFT * 2.0)

        def live_cells():
            data = int(value.get_value()).to_bytes(6, "big")
            return ByteGrid(data, cols=6, cell=0.7, text_size=20, color=YELLOW).move_to(UP * 0.2)

        self.remove(cells)
        cells_live = always_redraw(live_cells)
        self.add(cells_live)
        mb = T("90 MB", 26, GREY_A).next_to(bytes_label, RIGHT, buff=0.6)
        mb.add_updater(lambda m: m.next_to(bytes_label, RIGHT, buff=0.6))
        self.at("ninety-megabyte file", value.animate.set_value(90 * 1024 * 1024), FadeIn(mb), rate_func=rate_functions.ease_in_expo,
                rt=2.0)
        self.at("the largest number six bytes can hold", FadeOut(mb), value.animate.set_value(2 ** 48 - 1),
                rate_func=rate_functions.ease_in_expo, rt=2.0)
        self.at("every character is an underscore", Indicate(live, color=WHITE), rt=1.0)

        self.at("That maximum is", FadeOut(VGroup(number, bytes_label)), rt=0.5)
        number.clear_updaters()
        e1 = Expr(("2", "48"), "− 1 = 281,474,976,710,655 bytes", size=34).move_to(DOWN * 1.6)
        self.go(Write(e1), rt=1.4)
        e2 = Expr(("2", "48"), "= 256 ×", ("2", "40"), "=", size=34)
        tib = T("256 tebibytes", 40, YELLOW, weight=BOLD)
        line2 = VGroup(e2, tib).arrange(RIGHT, buff=0.25).move_to(DOWN * 2.7)
        self.at("Two to the forty-eighth is", Write(e2), rt=1.0)
        self.at("tebibytes", FadeIn(tib), rt=0.8)
        u1 = Underline(tib[:3], color=YELLOW, buff=0.05)
        u2 = Underline(tib[3], color=YELLOW, buff=0.05)
        self.at("Two hundred fifty-six, T", Create(u1), rt=0.5)
        self.go(Create(u2), rt=0.4)
        name = M("256t", 60, YELLOW).move_to(RIGHT * 4.6 + UP * 1.6)
        self.at("where the format gets its name", FadeIn(name, scale=0.6), rt=1.0)

        self.at("Putting the length up front", FadeOut(VGroup(e1, e2, tib, u1, u2, name, cells_live, label, live)),
                full[8:].animate.set_opacity(0), rt=0.8)
        bar = Rectangle(width=6, height=0.35, color=GREY_B, stroke_width=2).move_to(DOWN * 0.4)
        fill = Rectangle(width=0.01, height=0.35, stroke_width=0, fill_color=TEAL_C, fill_opacity=0.8).align_to(bar, LEFT).match_y(bar)
        known = T("size known before downloading", 24, GREY_A).next_to(bar, UP, buff=0.25)
        self.go(FadeIn(bar), FadeIn(known), rt=0.6)
        self.add(fill)
        self.at("wrong number of bytes", fill.animate.stretch_to_fit_width(7.0).align_to(bar, LEFT), rt=1.2)
        self.go(fill.animate.set_fill(RED), rt=0.3)
        reject = T("too many bytes: reject, no hash needed", 24, RED).next_to(bar, DOWN, buff=0.3)
        self.at("without even computing a hash", FadeIn(reject), rt=0.8)


class E01_Inline(Ep):
    BEAT = 6

    def build(self):
        data = b"Hello, HashBin!"
        msg = M('"Hello, HashBin!"', 34).move_to(UP * 2.8)
        self.go(Write(msg), rt=1.0)
        text_cells = ByteGrid(data, cols=15, cell=0.36, text_size=12).move_to(UP * 1.4 + LEFT * 3.4)
        fp = ByteGrid(hashlib.sha512(data).digest(), cols=32, cell=0.2, show_hex=False, color=BLUE_C, fill=BLUE_E)
        fp.move_to(DOWN * 0.4)
        b1 = Brace(text_cells, UP, color=GREY_B)
        l1 = T("15 bytes", 22).next_to(b1, UP, buff=0.08)
        b2 = Brace(fp, DOWN, color=BLUE_C)
        l2 = T("its fingerprint: 64 bytes", 22, BLUE_C).next_to(b2, DOWN, buff=0.08)
        self.at("It's fifteen bytes", FadeIn(text_cells), GrowFromCenter(b1), FadeIn(l1), rt=1.0)
        self.at("Its fingerprint is sixty-four bytes", FadeIn(fp), GrowFromCenter(b2), FadeIn(l2), rt=1.0)
        q = T("?", 60, YELLOW).move_to(RIGHT * 3.6 + UP * 1.4)
        self.at("bigger than the thing", FadeIn(q, scale=0.5), rt=0.8)

        self.at("doesn't hash at all", FadeOut(VGroup(fp, b2, l2, q)), rt=0.8)
        prefix = M("AAAAAAAP", 40, YELLOW)
        body = M("SGVsbG8sIEhhc2hCaW4h", 40, GREEN_C)
        cid = VGroup(prefix, body).arrange(RIGHT, buff=0.04).move_to(DOWN * 0.6)
        self.at("puts the content itself", FadeIn(prefix), TransformFromCopy(text_cells, body), rt=1.4)
        strip = VGroup(*[M(ch, 18, GREY_A) for ch in ALPHABET]).arrange(RIGHT, buff=0.06).move_to(DOWN * 2.8)
        marker = SurroundingRectangle(strip[15], color=YELLOW, buff=0.04)
        fifteen = T("15", 18, YELLOW).next_to(marker, UP, buff=0.08)
        self.at("prefix says fifteen bytes", FadeIn(strip), rt=0.6)
        self.go(Indicate(prefix[-1], color=YELLOW, scale_factor=1.5), Create(marker), FadeIn(fifteen), rt=1.0)
        hello = M("Hello", 30, WHITE).next_to(body[:7], UP, buff=0.2)
        brace = Brace(body[:7], UP, buff=0.05, color=WHITE)
        self.at("see the word", FadeOut(VGroup(text_cells, b1, l1)), GrowFromCenter(brace), FadeIn(hello.next_to(brace, UP, buff=0.08)), rt=1.0)

        self.at("The cutoff is sixty-four bytes", FadeOut(VGroup(strip, marker, fifteen, hello, brace, msg)), rt=0.6)
        size = ValueTracker(15)

        def build_string():
            n = int(size.get_value())
            content = bytes((65 + i % 26) for i in range(n))
            text = S256(name_256t(content), 17)
            return text.move_to([-6.7, 0.6, 0], aligned_edge=LEFT)

        live = always_redraw(build_string)
        self.play(FadeOut(prefix), FadeOut(body), run_time=0.4)
        self.add(live)
        counter = Number(15, size=30).move_to(UP * 2.0 + LEFT * 4.8)
        counter.add_updater(lambda m: m.set_value(int(size.get_value())))
        counter_label = T("bytes of content", 24, GREY_A).next_to(counter, RIGHT, buff=0.2)
        cutoff_x = -6.4 + 8 * M("A", 22).width * 1.0
        self.add(counter, counter_label)
        self.go(size.animate.set_value(1), rt=0.8)
        self.at("at most eighty-six characters", size.animate.set_value(64), rt=2.4)
        edge = live.get_right()[0]
        dashed = DashedLine([edge + 0.05, 1.6, 0], [edge + 0.05, -0.6, 0], color=GREY_B)
        same = T("same length either way", 20, GREY_B).next_to(dashed, DOWN, buff=0.1).align_to(dashed, RIGHT)
        self.go(Create(dashed), FadeIn(same), rt=0.6)
        self.at("either way", size.animate.set_value(65), rt=0.6)
        self.go(Indicate(live, color=BLUE_C, scale_factor=1.03), rt=0.8)
        self.go(size.animate.set_value(15), FadeOut(dashed), FadeOut(same), rt=0.8)

        badges = VGroup(*[VGroup(RoundedRectangle(corner_radius=0.25, width=2.6, height=0.6, color=GREEN, fill_color=GREEN,
                                                  fill_opacity=0.15), T(t, 24, GREEN)) for t in ("free", "never expires", "can't be lost")])
        for badge in badges:
            badge[1].move_to(badge[0])
        badges.arrange(RIGHT, buff=0.4).move_to(DOWN * 1.4)
        self.at("nothing to store", FadeIn(badges[0], shift=UP * 0.2), rt=0.6)
        self.at("why they never expire", FadeIn(badges[1], shift=UP * 0.2), rt=0.6)
        self.at("they have the content", FadeIn(badges[2], shift=UP * 0.2), rt=0.6)
        warn = T("Sharing the string shares the message.", 28, YELLOW).move_to(DOWN * 2.8)
        self.at("treat the string itself as the content", Write(warn), rt=1.2)


class E01_Verify(Ep):
    BEAT = 7

    def build(self):
        reader = Person(GREEN, label="reader").move_to(LEFT * 5.6 + UP * 1.6)
        held = S256(EXAMPLE_CID, 16, truncate=16).next_to(reader, UP, buff=0.2)
        sandbox = Sandbox(2.8, 1.6).move_to(RIGHT * 4.6 + UP * 1.6)
        self.go(FadeIn(reader), FadeIn(held), FadeIn(sandbox), rt=0.8)
        req = Arrow(reader.get_right(), sandbox.box.get_left(), buff=0.3, color=GREEN_B)
        self.at("When you fetch a file", GrowArrow(req), rt=0.8)
        file = FileIcon(width=0.5, height=0.65).move_to(sandbox)
        self.go(file.animate.next_to(reader, RIGHT, buff=0.3), FadeOut(req), rt=1.0)

        steps = VGroup(T("1. size matches the prefix?", 26), T("2. fingerprint matches the body?", 26)).arrange(DOWN, aligned_edge=LEFT,
                                                                                                             buff=0.45)
        steps.move_to(LEFT * 1.0 + DOWN * 0.4)
        self.at("Does it have the number of bytes", FadeIn(steps[0]), Indicate(held[:8], color=YELLOW, scale_factor=1.3), rt=1.0)
        c1 = check_mark(GREEN, 0.4).next_to(steps[0], RIGHT, buff=0.3)
        self.go(Create(c1), rt=0.4)
        machine = HashMachine(width=1.6, height=0.9).scale(0.8).move_to(RIGHT * 4.0 + DOWN * 0.4)
        machine.label.scale(0.7)
        self.at("does its fingerprint match", FadeIn(steps[1]), FadeIn(machine), rt=0.8)
        body = S256(EXAMPLE_CID, 18)[8:30].copy().move_to(DOWN * 2.0 + RIGHT * 0.8)
        out = body.copy().next_to(body, DOWN, buff=0.15)
        self.go(file.copy().animate.scale(0.4).move_to(machine.in_point).set_opacity(0), rt=0.6)
        self.go(FadeIn(body), FadeIn(out, shift=DOWN * 0.2), rt=0.6)
        self.go(LaggedStart(*[Indicate(VGroup(a, b), color=GREEN, scale_factor=1.2) for a, b in zip(body, out)], lag_ratio=0.06), rt=1.2)
        c2 = check_mark(GREEN, 0.4).next_to(steps[1], RIGHT, buff=0.3)
        self.at("If both checks pass", Create(c2), rt=0.5)

        self.at("If someone tampered", FadeOut(c2), rt=0.3)
        bad = FileIcon(width=0.5, height=0.65, color=RED_B).move_to(file)
        self.go(Transform(file, bad), rt=0.6)
        wrong = S256(name_256t(b"tampered"), 18)[8:30].move_to(out)
        wrong.set_color(RED)
        self.go(Transform(out, wrong), rt=0.8)
        x2 = cross_mark(RED, 0.4).next_to(steps[1], RIGHT, buff=0.3)
        trash = VGroup(Rectangle(width=0.5, height=0.6, color=GREY_B), Line(LEFT * 0.32, RIGHT * 0.32, color=GREY_B)
                       .shift(UP * 0.35)).move_to(LEFT * 5.6 + DOWN * 2.6)
        self.at("you'll know", Create(x2), FadeIn(trash), rt=0.6)
        self.go(file.animate.scale(0.5).move_to(trash), rt=0.8)

        self.at("doesn't care where the file came from", FadeOut(VGroup(file, x2, wrong, out, body)), FadeOut(trash), rt=0.6)
        other = VGroup(RoundedRectangle(corner_radius=0.2, width=2.8, height=1.2, color=GREY_B),
                       T("anywhere else", 22, GREY_A)).move_to(RIGHT * 4.6 + DOWN * 2.4)
        other[1].move_to(other[0])
        self.at("from a friend", FadeIn(other), rt=0.8)
        f1 = FileIcon(width=0.4, height=0.5).move_to(sandbox)
        f2 = FileIcon(width=0.4, height=0.5).move_to(other)
        self.go(f1.animate.next_to(reader, RIGHT, buff=0.2).shift(UP * 0.3), f2.animate.next_to(reader, RIGHT, buff=0.2).shift(DOWN * 0.4),
                rt=1.0)
        c3 = VGroup(check_mark(GREEN, 0.3).next_to(f1, RIGHT, buff=0.1), check_mark(GREEN, 0.3).next_to(f2, RIGHT, buff=0.1))
        self.go(Create(c3), Create(c2), rt=0.6)
        later = T("this idea comes back later", 22, GREY_B).to_edge(DOWN, buff=0.4)
        self.at("comes back later", FadeIn(later), rt=0.6)


class E01_Recap(Ep):
    BEAT = 8

    def build(self):
        yellow = VGroup(RoundedRectangle(corner_radius=0.1, width=3.4, height=1.2, color=YELLOW, fill_color=YELLOW, fill_opacity=0.15),
                        T("8 characters: length\n(6 bytes) · up to 256 TB", 22, YELLOW))
        green = VGroup(RoundedRectangle(corner_radius=0.1, width=4.6, height=1.1, color=GREEN_C, fill_color=GREEN_C, fill_opacity=0.15),
                       T("≤ 64 bytes: the content itself\n(free, permanent)", 22, GREEN_C))
        blue = VGroup(RoundedRectangle(corner_radius=0.1, width=4.6, height=1.1, color=BLUE_C, fill_color=BLUE_C, fill_opacity=0.15),
                      T("> 64 bytes: SHA-512 fingerprint\n(86 characters)", 22, BLUE_C))
        for box in (yellow, green, blue):
            box[1].move_to(box[0])
        yellow.move_to(LEFT * 3.6 + UP * 1.2)
        green.move_to(RIGHT * 2.2 + UP * 1.9)
        blue.move_to(RIGHT * 2.2 + UP * 0.5)
        fork = VGroup(Line(yellow.get_right(), green.get_left(), color=GREY_B), Line(yellow.get_right(), blue.get_left(), color=GREY_B))
        self.at("Eight characters for the length", FadeIn(yellow, shift=RIGHT * 0.3), rt=0.8)
        self.at("the content itself", Create(fork[0]), FadeIn(green), rt=0.8)
        self.at("its SHA-512 fingerprint", Create(fork[1]), FadeIn(blue), rt=0.8)
        whole = VGroup(yellow, green, blue)
        brace = Brace(whole, DOWN, color=WHITE)
        note = T("at most 94 characters, safe in a URL", 26).next_to(brace, DOWN, buff=0.1)
        self.at("Never more than ninety-four", GrowFromCenter(brace), FadeIn(note), rt=1.0)
        card = NextCard(("U1", "Publishing files", False), ("D1", "Building apps", False)).scale(0.8).to_edge(DOWN, buff=0.3)
        self.at("If you're here to publish files", VGroup(whole, fork, brace, note).animate.scale(0.75).to_edge(UP, buff=0.3),
                FadeIn(card), rt=1.2)
        self.go(Circumscribe(card[1][0][0], color=BLUE, buff=0.12), rt=1.0)
        self.at("If you're a developer", Circumscribe(card[1][1][0], color=PURPLE_B, buff=0.12), rt=1.0)
